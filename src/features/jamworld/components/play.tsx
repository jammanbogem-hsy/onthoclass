"use client";

import { useClassroom } from "./classroom-context";
import { effectsAt, zonesAt, type ZoneEffects } from "../lib/world/effects";
import { ScriptScene, type ScriptChoice, type ScriptHud, type ScriptObject, type ScriptObjectPatch } from "../lib/world/script-scene";
import { MapScriptRuntime } from "../lib/render/map-script";
import { GlassLink } from "./glass-surface";
import { getMe } from "./workshop-api";

import GlassSurface from "./glass-surface";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { loadViewAtlases } from "@/features/jamworld/lib/render/atlas";
import { applyAvatarLook } from "@/features/jamworld/lib/render/avatar-look";
import { loadImagesFor } from "@/features/jamworld/lib/render/user-images";
import type { AvatarLook } from "@/features/jamworld/lib/server/workshop/avatar";
import {
  screenInputToGrid,
  type ViewMode,
} from "@/features/jamworld/lib/render/projection";
import {
  readView,
  saveView,
  VIEW_LABEL,
} from "@/features/jamworld/lib/render/view-pref";
import {
  QUALITY,
  type Quality,
} from "@/features/jamworld/lib/render/constants";
import { FrameLoop } from "@/features/jamworld/lib/render/loop";
import { WorldRenderer } from "@/features/jamworld/lib/render/renderer";
import { AVATAR_COLORS } from "@/features/jamworld/lib/render/shapes";
import {
  moveIso,
  moveTopDown,
  walkPhase,
} from "@/features/jamworld/lib/world/movement";
import {
  PlayWorld,
  type PlayerState,
} from "@/features/jamworld/lib/world/play";
import {
  answerQuiz,
  completeQuiz,
  emptyQuizProgress,
  type QuizProgress,
} from "@/features/jamworld/lib/world/quiz";
import { getProject, loadMap } from "@/features/jamworld/lib/world/storage";
import { syncOne } from "./world-sync";
import { burst, playSound, projectileAt, type EffectType, type ObjectFx, type Particle, type Projectile, type SoundName } from "@/features/jamworld/lib/world/script-fx";
import type {
  Interaction,
  MapDoc,
  Project,
  QuizInteraction,
  SignInteraction,
} from "@/features/jamworld/lib/world/types";

type Dialog =
  | { kind: "sign"; i: SignInteraction }
  | { kind: "quiz"; i: QuizInteraction; picked: number | null };

interface PerfReport {
  scriptObjects: ScriptObject[];
  quizzes: { completed: Record<string, string>; correct: string[]; attempts: number };
  player: { x: number; y: number } | null;
  effects: ZoneEffects;
  paused: boolean;
  view: ViewMode;
  quality: Quality;
  dpr: number;
  viewport: string;
  objects: number;
  mapSize: string;
  rafFps: number;
  renderMsAvg: number;
  renderMsP95: number;
  objectsDrawn: number;
  chunkCacheMB: number;
  spriteCacheMB: number;
  heapMB: number | null;
}

declare global {
  interface Window {
    __moaPerf?: () => PerfReport;
  }
}

const QUALITY_KEY = "moa.quality";
// One softly refracting sheet behind the controls, with no nested button lenses.
const PLAY_GLASS = {
  radius: 18,
  bezel: 10,
  refraction: 32,
  frost: 0.42,
  saturation: 1.05,
  specular: 0.6,
} as const;

function readQuality(): Quality {
  try {
    const q = window.localStorage.getItem(QUALITY_KEY);
    if (q === "low" || q === "standard") return q;
  } catch {
    /* 저장소 없음 */
  }
  // 저사양 추정: 코어 4개 이하 또는 메모리 4GB 이하면 저전력 모드로 시작
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4
    ? "low"
    : "standard";
}

export default function Play({
  projectId,
  sharedWorld,
}: {
  projectId: string;
  sharedWorld?: { project: Project; docs: Readonly<Record<string, MapDoc>> };
}) {
  const classroom = useClassroom();
  const lockedRef = useRef(false);
  lockedRef.current =
    classroom?.me?.role === "student" &&
    (!classroom.connected ||
      !!classroom.room?.controls.paused ||
      !!classroom.room?.controls.blackout);
  const scriptRef = useRef<MapScriptRuntime | null>(null);
  const effectsRef = useRef<ZoneEffects>({});
  const visionRef = useRef<HTMLDivElement>(null),
    zoneMessageRef = useRef<HTMLDivElement>(null);
  const [scriptError, setScriptError] = useState("");
  const [scriptHud, setScriptHud] = useState<ScriptHud>({});
  const hudRef = useRef<ScriptHud>({});
  const reportedRef = useRef(new Set<string>());
  // 맵 코드 연출(개인 플레이 전용): 오브젝트 움직임·날아가는 물체·터지는 효과·화면 버튼
  const fxRef = useRef(new Map<string, ObjectFx>());
  const projectilesRef = useRef<Projectile[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const [scriptButtons, setScriptButtons] = useState<Array<{ id: string; label: string }>>([]);
  const [scriptChoice, setScriptChoice] = useState<ScriptChoice | null>(null);
  const scriptChoiceRef = useRef<ScriptChoice | null>(null);
  const sceneRef = useRef<ScriptScene | null>(null);
  const scriptResetRef = useRef(false);
  const [nearObject, setNearObject] = useState<ScriptObject | null>(null);
  const nearObjectRef = useRef<ScriptObject | null>(null);
  scriptChoiceRef.current = scriptChoice;
  const [project, setProject] = useState<Project | null>(null);
  const [doc, setDoc] = useState<MapDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality>("standard");
  const [near, setNear] = useState<Interaction | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [quizProgress, setQuizProgress] = useState<QuizProgress>(emptyQuizProgress);
  const quizSessions = useRef(new Map<string, QuizProgress>());
  const quizRef = useRef({ mapId: "", value: emptyQuizProgress() });
  const [showPerf] = useState(false);
  const [perf, setPerf] = useState<PerfReport | null>(null);
  const [fading, setFading] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [view, setView] = useState<ViewMode>("td");
  /** 저장된 시점을 읽기 전에는 아틀라스를 불러오지 않는다(다른 시점 이미지 낭비 방지) */
  const [viewReady, setViewReady] = useState(false);
  const viewRef = useRef<ViewMode>("td");
  const followRef = useRef<
    ((x: number, y: number) => { x: number; y: number }) | null
  >(null);
  /** 학생 프로필 외형(없으면 기본 탐험가) */
  const lookRef = useRef<AvatarLook | null>(null);
  const nameRef = useRef("나");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const keys = useRef(new Set<string>());
  const joy = useRef({ x: 0, y: 0, id: -1 });
  const playerRef = useRef<PlayerState | null>(null);
  const worldRef = useRef<PlayWorld | null>(null);
  const dialogRef = useRef<Dialog | null>(null);
  const nearRef = useRef<Interaction | null>(null);
  const portalCooldown = useRef(0);
  const portalArmed = useRef(true);
  const arrivalRef = useRef<string | null>(null);
  const loopRef = useRef<FrameLoop | null>(null);
  const rendererRef = useRef<WorldRenderer | null>(null);
  dialogRef.current = dialog;

  // 맵 로드 — 이 브라우저에 없으면 서버(원본)에서 한 번 받아 온다
  const [fetched, setFetched] = useState(false);
  useEffect(() => {
    if (sharedWorld || fetched || getProject(projectId)) return;
    let alive = true;
    void syncOne(projectId).catch(() => false).then(() => { if (alive) setFetched(true); });
    return () => { alive = false; };
  }, [projectId, sharedWorld, fetched]);
  useEffect(() => {
    if (!sharedWorld && !fetched && !getProject(projectId)) return;
    const p = sharedWorld?.project || getProject(projectId);
    const mapId =
      new URLSearchParams(window.location.search).get("map") ?? p?.mapIds[0];
    const m = mapId ? sharedWorld?.docs[mapId] || loadMap(mapId) : null;
    if (!p || !m) {
      // Initialize the view from browser-local map storage after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("월드를 찾을 수 없어요. 에디터에서 저장했는지 확인해 주세요.");
      return;
    }
    setProject(p);
    setDoc(m);
    quizSessions.current.clear();
    setQuality(readQuality());
    // 교사·학생 모두 같은 개인 기본 아바타를 사용한다.
    let live = true;
    lookRef.current = null;
    applyAvatarLook(null);
    getMe()
      .then((me) => {
        if (!live) return;
        nameRef.current = me.student?.nickname || me.teacher?.name || "나";
        lookRef.current = me.avatar ?? me.student?.avatar ?? null;
        applyAvatarLook(lookRef.current);
      })
      .catch(() => undefined);
    const v = readView();
    viewRef.current = v;
    setView(v);
    setViewReady(true);
    const t = window.setTimeout(() => setShowHint(false), 6000);
    return () => { live = false; window.clearTimeout(t); };
  }, [projectId, sharedWorld?.project, sharedWorld?.docs, fetched]);

  useEffect(() => {
    Promise.resolve().then(() => { setScriptHud({}); setScriptChoice(null); setNearObject(null); setScriptError(""); });
    nearObjectRef.current = null;
    if (!doc?.script?.trim()) return;
    let runtime: MapScriptRuntime | null = null;
    Promise.resolve().then(() => setScriptError(""));
    try {
      runtime = new MapScriptRuntime(doc.script, message => { scriptResetRef.current = true; setScriptError(message); });
      scriptRef.current = runtime;
    } catch {
      Promise.resolve().then(() =>
        setScriptError("맵 코드를 준비하지 못했어요"),
      );
    }
    return () => {
      runtime?.dispose();
      if (scriptRef.current === runtime) scriptRef.current = null;
    };
  }, [doc?.script, doc?.id]);

  useEffect(() => { hudRef.current = scriptHud; }, [scriptHud]);

  // 주인이 플레이할 때 맵 코드가 돌았는지 서버에 남긴다 → AI(MCP)가 moa_play_report 로 읽고 고친다. 같은 코드·같은 결과는 한 번만
  const reportScript = doc?.script, reportMap = doc?.id;
  useEffect(() => {
    const script = reportScript;
    if (sharedWorld || !reportMap || !script?.trim()) return;
    let h = 0x811c9dc5;
    for (let i = 0; i < script.length; i++) h = Math.imul(h ^ script.charCodeAt(i), 0x01000193);
    const hash = (h >>> 0).toString(16), mapId = reportMap;
    const send = (ok: boolean, message?: string) => {
      const key = `${mapId}:${hash}:${ok ? "ok" : message}`;
      if (reportedRef.current.has(key)) return;
      reportedRef.current.add(key);
      const hud = JSON.stringify(hudRef.current);
      void fetch(`/api/jamworld/worlds/${projectId}/report`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mapId, ok, hash, ...(message ? { message } : {}), ...(hud !== "{}" ? { hud } : {}) }),
      }).catch(() => undefined);
    };
    if (scriptError) { send(false, scriptError); return; }
    const t = window.setTimeout(() => send(true), 8000);
    return () => window.clearTimeout(t);
  }, [scriptError, reportScript, reportMap, projectId, sharedWorld]);

  // 게임 루프 (플레이 중에만 rAF)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !doc) return;
    const q = readQuality();
    const r = new WorldRenderer(canvas, q, viewRef.current);
    rendererRef.current = r;
    let scene = new ScriptScene(doc);
    sceneRef.current = scene;
    let world = scene.world;
    worldRef.current = world;
    const progress = quizSessions.current.get(doc.id) || emptyQuizProgress();
    quizSessions.current.set(doc.id, progress);
    quizRef.current = { mapId: doc.id, value: progress };
    nearRef.current = null; dialogRef.current = null;
    Promise.resolve().then(() => { setQuizProgress(progress); setNear(null); setDialog(null); });
    // 다른 페이지 포털로 들어왔으면 도착 포털 옆에서, 아니면 시작점에서
    const arrival = arrivalRef.current;
    arrivalRef.current = null;
    playerRef.current =
      (arrival && world.portalExit(arrival)) || world.spawnState();
    // 도착 직후 바로 되돌아가지 않도록: 포털 칸을 한 번 벗어나야 다시 발동
    portalArmed.current = !arrival;
    r.resize();
    r.setDoc(doc);
    r.camera.zoom = window.innerWidth < 700 ? 0.8 : 1;
    // 카메라 목표: 발 위치를 화면에서 조금 위로(머리가 중앙 근처) 올린 셀 좌표
    const follow = (px: number, py: number) => {
      const s0 = r.projection.toScreen(px, py);
      const g = r.projection.toGround(s0.x, s0.y - 40);
      return r.clampToView(g.x, g.y);
    };
    followRef.current = follow;
    const start = follow(playerRef.current.x, playerRef.current.y);
    r.centerOn(start.x, start.y);
    const ro = new ResizeObserver(() => r.resize());
    ro.observe(canvas);
    let lastStats = r.render({ mode: "play", time: 0 });
    let t = 0;
    let lastNearCheck = 0;
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const loop = new FrameLoop(QUALITY[q].fps, (dt, now) => {
      if (!lockedRef.current) t += dt;
      if (scriptResetRef.current) {
        scriptResetRef.current = false; scene = new ScriptScene(doc); sceneRef.current = scene;
        world = scene.world; worldRef.current = world; r.setDoc(doc);
        if (world.collides(playerRef.current!.x, playerRef.current!.y)) playerRef.current = world.spawnState();
        setScriptHud({}); setScriptChoice(null); setScriptButtons([]);
        fxRef.current.clear(); projectilesRef.current = []; particlesRef.current = [];
      }
      if (!lockedRef.current) {
        try {
          for (const action of scriptRef.current?.drainActions() || []) {
            if (action.kind === "object") {
              const v = action.value as { id: string; patch: ScriptObjectPatch };
              if (scene.changeObject(v.id, v.patch, playerRef.current!)) { world = scene.world; worldRef.current = world; r.setDoc(scene.doc); }
            } else if (action.kind === "teleport") {
              const v = action.value as { x: number; y: number };
              if (world.collides(v.x + 0.5, v.y + 0.5)) throw Error("이동할 위치가 막혀 있어요");
              playerRef.current = { ...playerRef.current!, x: v.x + 0.5, y: v.y + 0.5, moving: false, screenVelocity: { x: 0, y: 0 } };
            } else if (action.kind === "choose") {
              setDialog(null); setScriptChoice(action.value as ScriptChoice);
            } else if (action.kind === "completeQuiz") {
              const v = action.value as { id: string; label?: string };
              const next = completeQuiz(doc, quizRef.current.value, v.id, v.label);
              if (next !== quizRef.current.value) {
                quizRef.current.value = next; quizSessions.current.set(doc.id, next); setQuizProgress(next);
                if (dialogRef.current?.kind === "quiz" && dialogRef.current.i.id === v.id && dialogRef.current.picked === null) { dialogRef.current = null; setDialog(null); }
              }
            } else if (action.kind === "animate") {
              const v = action.value as { id: string; type: ObjectFx["type"]; ms: number };
              const targets = scene.objects().filter(o => o.id === v.id || o.name === v.id || o.assetId === v.id);
              if (!targets.length) throw Error(`‘${v.id}’ 오브젝트를 찾지 못했어요`);
              for (const o of targets) {
                if (v.type === "none") fxRef.current.delete(o.id);
                else fxRef.current.set(o.id, { type: v.type, start: t, until: v.ms === 0 ? Infinity : t + v.ms / 1000 });
              }
            } else if (action.kind === "launch") {
              const v = action.value as Omit<Projectile, "start" | "spin" | "arc" | "size"> & { arc?: number; size?: number };
              const list = projectilesRef.current.filter(p => p.id !== v.id);
              if (list.length >= 24) list.shift();
              list.push({ ...v, start: t, arc: v.arc ?? 1.2, size: v.size ?? 1, spin: /⚾|⚽|🏀|🎾|●|ball/i.test(v.sprite) });
              projectilesRef.current = list;
            } else if (action.kind === "effect") {
              const v = action.value as { type: EffectType; x: number; y: number };
              if (!motionPreference.matches) particlesRef.current = [...particlesRef.current, ...burst(v.type, v.x, v.y, t)].slice(-240);
            } else if (action.kind === "sound") {
              playSound((action.value as { name: SoundName }).name);
            } else if (action.kind === "button") {
              const v = action.value as { id: string; label: string };
              setScriptButtons(old => {
                const rest = old.filter(b => b.id !== v.id);
                const next = v.label ? (rest.length < 4 || rest.length < old.length ? [...rest, v] : old) : rest;
                return JSON.stringify(next) === JSON.stringify(old) ? old : next;
              });
            } else if (action.kind === "hud") {
              const v = action.value as { id: string; label: string; value: string | number };
              setScriptHud(old => {
                const next = { ...old };
                if (!v.label) delete next[v.id];
                else if (Object.hasOwn(next, v.id) || Object.keys(next).length < 8) next[v.id] = { label: v.label, value: String(v.value) };
                return JSON.stringify(next) === JSON.stringify(old) ? old : next;
              });
            }
          }
        } catch (e) {
          scriptRef.current?.dispose(); scriptResetRef.current = true;
          setScriptError(e instanceof Error ? e.message : "맵 동작을 확인해 주세요");
        }
      }
      const p = playerRef.current!;
      let ix = 0;
      let iy = 0;
      const zones = zonesAt(doc, p.x, p.y);
      if (!lockedRef.current) scriptRef.current?.tick({
        x: p.x,
        y: p.y,
        time: t,
        zones: zones.flatMap((z) => [z.id, z.name]),
        objects: scene.objects(),
      });
      const effects = {
        ...effectsAt(doc, p.x, p.y),
        ...scriptRef.current?.effects(),
      };
      effectsRef.current = effects;
      if (lockedRef.current) {
        keys.current.clear();
        joy.current.x = 0;
        joy.current.y = 0;
        if (knobRef.current) knobRef.current.style.transform = "";
      }
      if (!dialogRef.current && !scriptChoiceRef.current && !lockedRef.current) {
        const k = keys.current;
        if (k.has("arrowleft") || k.has("a")) ix -= 1;
        if (k.has("arrowright") || k.has("d")) ix += 1;
        if (k.has("arrowup") || k.has("w")) iy -= 1;
        if (k.has("arrowdown") || k.has("s")) iy += 1;
        ix += joy.current.x;
        iy += joy.current.y;
      }
      // 입력은 화면 기준. 입체로 보기는 화면 속도 일정 + 실제 이동 기준 8방향, 위에서 보기는 기존 격자 이동
      if (effects.reverseControls) {
        ix *= -1;
        iy *= -1;
      }
      const scaledDt = dt * (effects.speed || 1);
      const gin = screenInputToGrid("td", ix, iy);
      const next =
        viewRef.current === "iso"
          ? moveIso(world, p, ix, iy, scaledDt)
          : moveTopDown(world, p, gin.x, gin.y, scaledDt);
      playerRef.current = next;

      // 포털: 밟으면 이동. 쿨다운 + 포털 칸을 벗어났다가 다시 밟아야 발동(도착 직후 되돌아감 방지)
      const portal = world.portalAt(next);
      if (!portal) portalArmed.current = true;
      if (
        portal &&
        !lockedRef.current &&
        portal.type === "portal" &&
        portalArmed.current &&
        now > portalCooldown.current
      ) {
        portalCooldown.current = now + 900;
        portalArmed.current = false;
        if (portal.targetMapId) {
          const target =
            sharedWorld?.docs[portal.targetMapId] ||
            loadMap(portal.targetMapId);
          if (target) {
            setFading(true);
            setTimeout(() => {
              arrivalRef.current = portal.targetId ?? null;
              window.history.replaceState(
                null,
                "",
                `/jamworldmake/?view=play&id=${projectId}&map=${target.id}`,
              );
              setDoc(target);
              setFading(false);
            }, 220);
          }
        } else if (portal.targetId) {
          const exit = world.portalExit(portal.targetId);
          if (exit) teleport(exit);
        }
      }

      // 카메라: 부드럽게 따라가기
      const target = follow(next.x, next.y);
      const k = 1 - Math.pow(0.001, dt);
      r.camera.cx += (target.x - r.camera.cx) * k;
      r.camera.cy += (target.y - r.camera.cy) * k;

      if (now - lastNearCheck > 120) {
        lastNearCheck = now;
        const object = scene.nearby(next, scriptRef.current?.bindings || []);
        if (object?.id !== nearObjectRef.current?.id) { nearObjectRef.current = object; setNearObject(object); }
        const n = world.nearby(next);
        if (n?.id !== nearRef.current?.id) {
          nearRef.current = n;
          setNear(n);
        }
      }
      if (projectilesRef.current.length) {
        const flying: Projectile[] = [];
        for (const p of projectilesRef.current) {
          if (projectileAt(p, t).u >= 1) scriptRef.current?.event({ kind: "arrive", name: p.id, value: { x: p.to.x, y: p.to.y } });
          else flying.push(p);
        }
        projectilesRef.current = flying;
      }
      if (particlesRef.current.length) particlesRef.current = particlesRef.current.filter(p => t - p.born < p.life);
      const n = nearRef.current;
      lastStats = r.render({
        objectFx: fxRef.current,
        projectiles: projectilesRef.current,
        particles: particlesRef.current,
        mode: "play",
        time: t,
        player: {
          x: next.x,
          y: next.y,
          dir: next.dir,
          moving: next.moving,
          face8: next.face8,
          walkPhase: walkPhase(next),
          style: AVATAR_COLORS[0],
          name: nameRef.current,
          customSprite: lookRef.current?.asset?.[viewRef.current],
          customSheet: lookRef.current?.asset?.sprites?.[viewRef.current],
          assetColors: lookRef.current?.assetColors,
        },
        nearInteraction: n && !dialogRef.current && !quizRef.current.value.completed.has(n.id) ? { x: n.x, y: n.y } : null,
        quizLabels: quizRef.current.value.boardLabels,
      });
      const shake = motionPreference.matches ? 0 : effects.shake || 0;
      canvas.style.transform = shake
        ? `translate(${Math.sin(t * 11) * shake}px, ${Math.sin(t * 13) * shake * 0.7}px)`
        : "";
      if (visionRef.current) {
        visionRef.current.hidden = !effects.vision;
        if (effects.vision) {
          const pos = r.worldToScreen(next.x, next.y);
          const radius = effects.vision * 52 * r.camera.zoom;
          visionRef.current.style.background = `radial-gradient(circle ${radius}px at ${pos.x}px ${pos.y - 28}px, transparent 55%, rgb(2 8 19 / 97%) 100%)`;
        }
      }
      if (zoneMessageRef.current) {
        zoneMessageRef.current.hidden = !effects.message;
        if (zoneMessageRef.current.textContent !== (effects.message || ""))
          zoneMessageRef.current.textContent = effects.message || "";
      }
      return lastStats.frameMs;
    });
    loopRef.current = loop;
    loop.start();

    function teleport(exit: PlayerState) {
      setFading(true);
      setTimeout(() => {
        playerRef.current = exit;
        portalArmed.current = false;
        const c = follow(exit.x, exit.y);
        r.centerOn(c.x, c.y);
        setFading(false);
      }, 220);
    }

    window.__moaPerf = () => {
      const s = loop.sample();
      const mem = (
        performance as Performance & { memory?: { usedJSHeapSize: number } }
      ).memory;
      const vp = r.viewport;
      const caches = r.cacheBytes;
      return {
        scriptObjects: scene.objects(),
        quizzes: { completed: Object.fromEntries(quizRef.current.value.completed), correct: [...quizRef.current.value.score.correct], attempts: quizRef.current.value.score.attempts },
        player: playerRef.current
          ? { x: playerRef.current.x, y: playerRef.current.y }
          : null,
        effects: effectsRef.current,
        paused: lockedRef.current,
        view: r.view,
        quality: r.quality,
        dpr: Math.min(window.devicePixelRatio || 1, QUALITY[r.quality].dprCap),
        viewport: `${Math.round(vp.w)}x${Math.round(vp.h)}`,
        objects: doc.objects.length,
        mapSize: `${doc.width}x${doc.height}`,
        rafFps: s.fps,
        renderMsAvg: s.frameMsAvg,
        renderMsP95: s.frameMsP95,
        objectsDrawn: lastStats.objectsDrawn,
        chunkCacheMB: +(caches.chunks / 1048576).toFixed(1),
        spriteCacheMB: +(caches.sprites / 1048576).toFixed(1),
        heapMB: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(1) : null,
      };
    };
    const perfTimer = window.setInterval(
      () => setPerf(window.__moaPerf?.() ?? null),
      1000,
    );

    return () => {
      loop.stop();
      ro.disconnect();
      window.clearInterval(perfTimer);
      r.clearCaches();
      delete window.__moaPerf;
    };
  }, [doc, projectId, sharedWorld?.docs]);

  // 시점 전환: 그 시점 아틀라스만 불러오고(다른 시점 해제) 카메라는 플레이어 기준 유지
  useEffect(() => {
    viewRef.current = view;
    const r = rendererRef.current;
    if (r) {
      r.setView(view);
      const p = playerRef.current;
      const f = followRef.current;
      if (p && f) {
        const c = f(p.x, p.y);
        r.centerOn(c.x, c.y);
      }
    }
    if (!viewReady) return;
    let alive = true;
    // 맵에 내장된 공방 에셋 그림도 현재 시점 것만 (권한 없으면 도형으로 대체)
    void Promise.all([
      loadViewAtlases(view),
      loadImagesFor(view, Object.keys(doc?.assets ?? {})),
    ]).then(() => {
      if (!alive) return;
      applyAvatarLook(lookRef.current); // 시점 아틀라스를 새로 불러오면 외형 다시 적용
      rendererRef.current?.clearCaches();
    });
    return () => {
      alive = false;
    };
  }, [view, doc, viewReady]);

  // 품질 전환
  useEffect(() => {
    rendererRef.current?.setQuality(quality);
    loopRef.current?.setFps(QUALITY[quality].fps);
  }, [quality]);

  // 키보드
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "escape") {
        setDialog(null);
        closeScriptChoice(-1);
        return;
      }
      // Let native controls keep Enter/Space activation and arrow-key behavior.
      if (
        e.defaultPrevented ||
        (e.target instanceof Element &&
          e.target.closest(
            "button, a, input, select, textarea, [contenteditable=true]",
          ))
      )
        return;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k))
        e.preventDefault();
      // 맵 코드의 World.onKey 로 — 이동 키는 계속 이동에도 쓰인다
      if (!e.repeat && !lockedRef.current) scriptRef.current?.event({ kind: "key", name: e.code, value: e.key });
      if (k === " " || k === "e" || k === "enter") {
        interact();
        return;
      }
      keys.current.add(k);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  });

  function interact() {
    if (lockedRef.current) return;
    if (dialogRef.current) {
      if (
        dialogRef.current.kind === "sign" ||
        dialogRef.current.picked !== null
      )
        setDialog(null);
      return;
    }
    const n = nearRef.current;
    if (!n) {
      const object = nearObjectRef.current;
      if (object && !scriptChoiceRef.current) scriptRef.current?.event({ kind: "interact", value: object });
      return;
    }
    if (n.type === "sign") setDialog({ kind: "sign", i: n });
    else if (n.type === "quiz" && !quizRef.current.value.completed.has(n.id)) setDialog({ kind: "quiz", i: n, picked: null });
  }

  function pick(k: number) {
    if (lockedRef.current) return;
    const current = dialogRef.current;
    if (!doc || quizRef.current.mapId !== doc.id || !current || current.kind !== "quiz" || current.picked !== null || quizRef.current.value.completed.has(current.i.id)) return;
    const id = current.i.id, ok = k === current.i.answer;
    const next = answerQuiz(doc, quizRef.current.value, id, ok);
    quizRef.current.value = next; quizSessions.current.set(doc.id, next); setQuizProgress(next);
    dialogRef.current = { ...current, picked: k }; setDialog(dialogRef.current);
    scriptRef.current?.event({ kind: "quiz", value: { id, question: current.i.question, correct: ok, index: k } });
  }

  function closeScriptChoice(index: number) {
    if (lockedRef.current || !scriptChoiceRef.current) return;
    scriptRef.current?.event({ kind: "choice", name: scriptChoiceRef.current.id, value: index });
    scriptChoiceRef.current = null; setScriptChoice(null);
  }

  // 터치 조이스틱
  const onJoy = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lockedRef.current) return;
    const el = e.currentTarget;
    if (e.type === "pointerdown") {
      el.setPointerCapture(e.pointerId);
      joy.current.id = e.pointerId;
    }
    if (e.pointerId !== joy.current.id) return;
    if (e.type === "pointerup" || e.type === "pointercancel") {
      joy.current = { x: 0, y: 0, id: -1 };
      if (knobRef.current) knobRef.current.style.transform = "";
      return;
    }
    const rect = el.getBoundingClientRect();
    let dx = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    let dy = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    joy.current.x = Math.abs(dx) < 0.15 ? 0 : dx;
    joy.current.y = Math.abs(dy) < 0.15 ? 0 : dy;
    if (knobRef.current)
      knobRef.current.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
  };

  if (error) {
    return (
      <main className="dash">
        <div className="empty">
          {error}
          <div style={{ marginTop: 12 }}>
            <GlassLink
              className="btn primary"
              href="/jamworldmake/?view=worlds"
            >
              내 월드로
            </GlassLink>
          </div>
        </div>
      </main>
    );
  }

  const quizCount =
    doc?.interactions.filter((i) => i.type === "quiz").length ?? 0;
  const showMapName = !!doc?.name && doc.name.trim() !== project?.name.trim();
  const nearCompleted = near?.type === "quiz" && quizProgress.completed.has(near.id);

  return (
    <main className={`play ${dialog ? "play-dialog-open" : ""}`}>
      <canvas
        ref={canvasRef}
        data-testid="play-canvas"
        aria-label={`${doc?.name ?? ""} 플레이 화면`}
      />
      <div className="play-vision" ref={visionRef} hidden aria-hidden="true" />
      <div
        className="play-zone-message"
        ref={zoneMessageRef}
        hidden
        role="status"
      />
      {classroom?.me?.role === "student" && classroom.room?.controls.paused && (
        <div className="play-paused" role="status">
          <Icon name="pause_circle" size={20} />
          선생님이 잠시 멈췄어요
        </div>
      )}
      {scriptError && (
        <div className="play-script-notice" role="status" title={scriptError}>
          일부 맵 효과를 잠시 껐어요.
        </div>
      )}
      {scriptButtons.length > 0 && <div className="play-script-buttons">{scriptButtons.map(b => <button key={b.id} type="button" className="play-script-button" onPointerDown={e => { e.preventDefault(); if (!lockedRef.current) scriptRef.current?.event({ kind: "key", name: b.id, value: b.id }); }}>{b.label}</button>)}</div>}
      {Object.keys(scriptHud).length > 0 && <div className="play-script-hud" aria-label="활동 진행 상황">{Object.entries(scriptHud).map(([id, item]) => <div key={id}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>}
      {scriptChoice && <GlassSurface {...PLAY_GLASS} frost={0.8} className="play-dialog" contentClassName="play-dialog-content" role="dialog" aria-label="선택하기">
        <h4>{scriptChoice.title}</h4><div className="play-answers">{scriptChoice.choices.map((choice, index) => <button className="play-answer" key={index} onClick={() => closeScriptChoice(index)}>{choice}</button>)}</div>
        <button className="play-control" onClick={() => closeScriptChoice(-1)}>닫기</button>
      </GlassSurface>}
      <div className="hud-top">
        <GlassSurface
          {...PLAY_GLASS}
          className="play-toolbar play-navigation"
          contentClassName="play-toolbar-content"
          role="group"
          aria-label="맵 메뉴"
        >
          <div className="play-location">
            <strong title={project?.name}>{project?.name}</strong>
            {showMapName && <span title={doc?.name}>{doc?.name}</span>}
          </div>
          <div className="play-toolbar-actions">
            {!sharedWorld && (
              <a
                className="play-control play-control-accent"
                href={`/jamworldmake/?view=editor&id=${projectId}${doc ? `&map=${doc.id}` : ""}`}
              >
                <Icon name="edit" size={18} />
                편집
              </a>
            )}
            <a className="play-control" href="/jamworldmake/?view=worlds">
              <Icon name="logout" size={18} />
              나가기
            </a>
          </div>
        </GlassSurface>
        <div className="play-tools">
          <GlassSurface
            {...PLAY_GLASS}
            className="play-toolbar play-options"
            contentClassName="play-toolbar-content"
            role="group"
            aria-label="보기 설정"
          >
            {quizCount > 0 && (
              <span
                className="play-score"
                data-testid="quiz-score"
                aria-live="polite"
              >
                <Icon name="quiz" size={18} />
                퀴즈 {quizProgress.score.correct.size}/{quizCount}
              </span>
            )}
            <button
              type="button"
              className="play-control"
              onClick={() => {
                const v = view === "td" ? "iso" : "td";
                saveView(v);
                setView(v);
              }}
              title="보는 방향 바꾸기"
            >
              <Icon
                name={view === "td" ? "deployed_code" : "grid_view"}
                size={18}
              />
              {view === "td" ? "입체로 보기" : "위에서 보기"}
            </button>
            <button
              type="button"
              className="play-control play-quality"
              aria-pressed={quality === "low"}
              onClick={() => {
                const q = quality === "low" ? "standard" : "low";
                setQuality(q);
                try {
                  window.localStorage.setItem(QUALITY_KEY, q);
                } catch {
                  /* 무시 */
                }
              }}
              title="움직임이 느릴 때 켜 보세요"
            >
              <Icon
                name={quality === "low" ? "check_circle" : "speed"}
                size={18}
              />
              가볍게 보기
            </button>
          </GlassSurface>
          {showPerf && perf && (
            <div className="perf" data-testid="perf">
              {`rAF ${perf.rafFps} fps (목표 ${QUALITY[perf.quality].fps})
render CPU ${perf.renderMsAvg} ms · p95 ${perf.renderMsP95} ms
그린 오브젝트 ${perf.objectsDrawn}/${perf.objects}
시점 ${VIEW_LABEL[perf.view]} · 뷰포트 ${perf.viewport} · DPR ${perf.dpr} · 맵 ${perf.mapSize}
캐시 바닥 ${perf.chunkCacheMB}MB · 스프라이트 ${perf.spriteCacheMB}MB
JS heap ${perf.heapMB ?? "측정 불가"}${perf.heapMB !== null ? " MB" : ""}`}
            </div>
          )}
        </div>
      </div>

      <div
        className="joy"
        onPointerDown={onJoy}
        onPointerMove={onJoy}
        onPointerUp={onJoy}
        onPointerCancel={onJoy}
        aria-label="이동 조이스틱"
        role="application"
      >
        <div className="joy-knob" ref={knobRef} />
      </div>
      <GlassSurface
        {...PLAY_GLASS}
        className="play-interact"
        data-disabled={(!dialog && nearCompleted) || (!near && !dialog && !nearObject) || undefined}
      >
        <button
          type="button"
          className="play-control"
          onClick={interact}
          disabled={(!dialog && nearCompleted) || (!near && !dialog && !nearObject) || !!scriptChoice}
          title={
            nearCompleted && !dialog ? "이미 완료한 문제예요" : !near && !dialog && !nearObject ? "안내판이나 캐릭터 가까이 가 보세요" : undefined
          }
        >
          <Icon
            name={
              dialog
                ? "close"
                : nearCompleted
                  ? "check_circle"
                  : near?.type === "quiz"
                  ? "quiz"
                  : near?.type === "sign"
                    ? "description"
                    : "chat_bubble"
            }
            size={21}
          />
          {dialog
            ? "닫기"
            : nearCompleted
              ? "완료"
              : near?.type === "quiz"
              ? "퀴즈 풀기"
              : near?.type === "sign"
                ? "읽기"
                : nearObject ? `${nearObject.name} 살펴보기` : "말 걸기"}
        </button>
      </GlassSurface>

      {dialog?.kind === "sign" && (
        <GlassSurface
          {...PLAY_GLASS}
          frost={0.8}
          className="play-dialog"
          contentClassName="play-dialog-content"
          role="dialog"
          aria-label="안내판"
        >
          <h4>안내판</h4>
          <p>{dialog.i.text}</p>
          <div className="play-dialog-actions">
            <button
              type="button"
              className="play-control play-control-accent"
              onClick={() => setDialog(null)}
            >
              확인 <Icon name="check" size={18} />
            </button>
          </div>
        </GlassSurface>
      )}
      {dialog?.kind === "quiz" && (
        <GlassSurface
          {...PLAY_GLASS}
          frost={0.8}
          className="play-dialog"
          contentClassName="play-dialog-content"
          role="dialog"
          aria-label="퀴즈"
        >
          <h4>퀴즈</h4>
          <p>{dialog.i.question}</p>
          <div className="play-answers">
            {dialog.i.choices.map((c, k) => (
              <button
                key={k}
                type="button"
                className={`play-answer ${dialog.picked !== null && k === dialog.i.answer ? "is-right" : ""} ${dialog.picked === k && k !== dialog.i.answer ? "is-wrong" : ""}`}
                onClick={() => pick(k)}
                disabled={dialog.picked !== null}
              >
                {k + 1}. {c}
              </button>
            ))}
          </div>
          {dialog.picked !== null && (
            <div className="play-dialog-actions">
              <b className="play-answer-feedback" role="status">
                {dialog.picked === dialog.i.answer
                  ? "정답이에요!"
                  : "아쉬워요, 정답을 확인하세요"}
              </b>
              <button
                type="button"
                className="play-control play-control-accent"
                onClick={() => setDialog(null)}
              >
                확인 <Icon name="check" size={18} />
              </button>
            </div>
          )}
        </GlassSurface>
      )}
      <div className="fade" style={{ opacity: fading ? 1 : 0 }} />
      {showHint && (
        <div className="hint play-hint">
          방향키로 이동 · 스페이스 키로 말 걸기 · 포털로 이동
        </div>
      )}
    </main>
  );
}
