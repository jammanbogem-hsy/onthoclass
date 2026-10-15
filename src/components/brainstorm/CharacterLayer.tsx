"use client";

// 브레인스토밍 판 3D 캐릭터 층 — 판 위에 투명한 WebGL 캔버스 하나를 겹쳐, 학생마다 캐릭터를 집 칸에 세운다.
// 판 좌표(뷰박스)를 그대로 쓰는 정사영 카메라라서 말풍선(HTML)과 위치가 정확히 맞는다.
// 브롤스타즈 느낌: 명암 3단계 셀 셰이딩 + 굵은 검정 외곽선(뒷면을 노멀 방향으로 부풀린 껍데기).
// 움직임: 사람은 대기 동작, 새 아이디어면 점프, 아이디어가 지워지면 아파하기. 동물은 가끔 걷기, 새는 통통 뛰기.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { charUrl, type BrainChar } from "@/lib/brainstorm-chars";

export type Actor = { uid: string; char: BrainChar; x: number; y: number; ideas: number };
/** 판 확대·이동 상태 — 화면 왼쪽 위 판 좌표(x, y)와 배율(s) */
export type BoardView = { x: number; y: number; s: number };

type Template = { scene: THREE.Object3D; clips: THREE.AnimationClip[]; scale: number; lift: number };
type Live = {
  uid: string; charId: string; kind: BrainChar["kind"]; root: THREE.Group; body: THREE.Object3D;
  mixer: THREE.AnimationMixer | null; actions: Record<string, THREE.AnimationAction>;
  phase: number; ideas: number; hopAt: number; nextWalk: number;
};

const OUTLINE = 0.55; // 외곽선 두께(판 좌표)

function toonGradient() {
  const steps = new Uint8Array([95, 175, 255]);
  const t = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}

/** 원래 재질의 그림(map)은 살리고 셀 셰이딩 재질로 바꾼다(반짝임 없음). */
function toToon(scene: THREE.Object3D, gradient: THREE.Texture) {
  scene.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const old = m.material as THREE.MeshStandardMaterial;
    m.material = new THREE.MeshToonMaterial({ map: old.map ?? null, color: old.color ?? new THREE.Color(0xffffff), gradientMap: gradient });
    m.frustumCulled = false; // 스킨 애니메이션 중 잘려 보이지 않게
  });
}

/** 외곽선 껍데기 — 모델 크기(scale)에 맞춰 노멀 방향으로 OUTLINE 만큼 부풀린 검정 뒷면. */
function addOutline(root: THREE.Object3D, scale: number) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x1b1b29, side: THREE.BackSide });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", `vec3 transformed = position + normal * ${(OUTLINE / scale).toFixed(5)};`);
  };
  const meshes: THREE.Mesh[] = [];
  root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.hull) meshes.push(m); });
  for (const m of meshes) {
    const sk = m as THREE.SkinnedMesh;
    let hull: THREE.Mesh;
    if (sk.isSkinnedMesh) { const skinned = new THREE.SkinnedMesh(sk.geometry, mat); skinned.bind(sk.skeleton, sk.bindMatrix); hull = skinned; }
    else hull = new THREE.Mesh(m.geometry, mat);
    hull.userData.hull = true; hull.frustumCulled = false;
    hull.position.copy(m.position); hull.quaternion.copy(m.quaternion); hull.scale.copy(m.scale);
    m.parent?.add(hull);
  }
}

export function CharacterLayer({ actors, viewW, viewH, charH, view, onLoaded, onFail }: {
  actors: Actor[]; viewW: number; viewH: number; charH: number; view: BoardView;
  /** 3D 로 그려지기 시작한 학생들(그 학생의 2D 그림은 숨긴다) */
  onLoaded: (uids: string[]) => void;
  /** WebGL 을 못 쓰는 기기 — 2D 그림으로 대신한다 */
  onFail: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sync = useRef<(list: Actor[]) => void>(() => {});
  const cbs = useRef({ onLoaded, onFail });
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { cbs.current = { onLoaded, onFail }; }, [onLoaded, onFail]);

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch { cbs.current.onFail(); return; }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb0b8d0, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1); sun.position.set(-120, 260, 300); scene.add(sun);
    // 판 좌표 그대로: x 오른쪽, y 아래(그래서 -y), z 는 아래쪽 캐릭터가 앞
    const cam = new THREE.OrthographicCamera(0, viewW, 0, -viewH, -2000, 2000);
    cam.position.set(0, 0, 1000); cam.lookAt(0, 0, 0);

    const resize = () => { const r = host.getBoundingClientRect(); renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false); };
    const ro = new ResizeObserver(resize); ro.observe(host); resize();

    const gradient = toonGradient();
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const templates = new Map<string, Promise<Template | null>>();
    const lives = new Map<string, Live>();
    let disposed = false;

    const loadTemplate = (id: string) => {
      let p = templates.get(id);
      if (!p) {
        p = loader.loadAsync(charUrl(id)).then((g: GLTF) => {
          const box = new THREE.Box3().setFromObject(g.scene); const size = box.getSize(new THREE.Vector3());
          const scale = charH / Math.max(size.y, 0.001);
          toToon(g.scene, gradient);
          return { scene: g.scene, clips: g.animations, scale, lift: -box.min.y * scale };
        }).catch(() => null);
        templates.set(id, p);
      }
      return p;
    };

    const spawn = async (a: Actor) => {
      const t = await loadTemplate(a.char.id);
      if (disposed || !t || lives.has(a.uid)) return;
      const body = cloneSkinned(t.scene);
      addOutline(body, t.scale);
      body.scale.setScalar(t.scale); body.position.y = t.lift;
      const root = new THREE.Group(); root.add(body);
      root.rotation.x = 0.18; // 판을 살짝 내려다보는 느낌
      const mixer = t.clips.length ? new THREE.AnimationMixer(body) : null;
      const actions: Record<string, THREE.AnimationAction> = {};
      if (mixer) for (const c of t.clips) actions[c.name.replace(/^preset:(quadruped:)?/, "")] = mixer.clipAction(c);
      if (actions.idle) actions.idle.play();
      const live: Live = { uid: a.uid, charId: a.char.id, kind: a.char.kind, root, body, mixer, actions, phase: Math.random() * Math.PI * 2, ideas: a.ideas, hopAt: -10, nextWalk: 2 + Math.random() * 6 };
      lives.set(a.uid, live); scene.add(root);
      place(live, a);
      cbs.current.onLoaded([...lives.keys()]);
    };

    const place = (l: Live, a: Actor) => { l.root.position.set(a.x, -a.y, a.y * 0.5); };

    const playOnce = (l: Live, name: string) => {
      const act = l.actions[name]; if (!act || !l.mixer) return false;
      act.reset(); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = false; act.fadeIn(0.12).play();
      l.actions.idle?.fadeOut(0.12);
      const back = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== act) return;
        l.mixer?.removeEventListener("finished", back);
        act.fadeOut(0.2); l.actions.idle?.reset().fadeIn(0.2).play();
      };
      l.mixer.addEventListener("finished", back);
      return true;
    };

    sync.current = (list: Actor[]) => {
      const seen = new Set<string>(); const now = clock.elapsedTime;
      for (const a of list) {
        seen.add(a.uid);
        const l = lives.get(a.uid);
        if (!l) { void spawn(a); continue; }
        if (l.charId !== a.char.id) { scene.remove(l.root); lives.delete(a.uid); void spawn(a); continue; }
        place(l, a);
        // 새 아이디어 → 점프(동작 없으면 통통), 지워짐 → 아파하기
        if (a.ideas > l.ideas) { playOnce(l, "jump"); l.hopAt = now; }
        else if (a.ideas < l.ideas) playOnce(l, "hurt");
        l.ideas = a.ideas;
      }
      for (const [uid, l] of lives) if (!seen.has(uid)) { scene.remove(l.root); lives.delete(uid); }
      cbs.current.onLoaded([...lives.keys()]);
    };

    const clock = new THREE.Clock();
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = Math.min(clock.getDelta(), 0.1); const t = clock.elapsedTime;
      for (const l of lives.values()) {
        l.mixer?.update(dt);
        // 모델은 +x 를 보고 있어서 -90° 돌려 정면으로, 거기에 살랑살랑 좌우로
        l.body.rotation.y = -Math.PI / 2 + Math.sin(t * 0.6 + l.phase) * 0.45;
        // 둥실 + 새 아이디어 통통(사람은 점프 동작이 대신한다)
        const since = t - l.hopAt;
        const hop = since >= 0 && since < 0.7 && !(l.kind === "person" && l.actions.jump) ? Math.sin((since / 0.7) * Math.PI) * charH * 0.35 : 0;
        const birdHop = l.kind === "bird" || l.kind === "still" ? Math.max(0, Math.sin(t * 2.2 + l.phase)) ** 6 * charH * 0.12 : 0;
        l.body.position.y = (l.body.userData.baseY ??= l.body.position.y) + Math.sin(t * 2 + l.phase) * charH * 0.025 + hop + birdHop;
        // 동물은 가끔 몇 걸음 걷는다(제자리)
        if (l.kind === "animal" && l.actions.walk && t > l.nextWalk) {
          const w = l.actions.walk; w.reset(); w.setLoop(THREE.LoopRepeat, 2); w.play();
          l.nextWalk = t + 6 + Math.random() * 8;
        }
      }
      // 확대·이동: 판(HTML)과 같은 영역만 보이게 카메라를 맞춘다
      const v = viewRef.current;
      if (cam.left !== v.x || cam.right !== v.x + viewW / v.s || cam.top !== -v.y) {
        cam.left = v.x; cam.right = v.x + viewW / v.s; cam.top = -v.y; cam.bottom = -(v.y + viewH / v.s); cam.updateProjectionMatrix();
      }
      renderer.render(scene, cam);
    };
    loop();

    return () => {
      disposed = true; cancelAnimationFrame(frame); ro.disconnect();
      renderer.dispose(); renderer.domElement.remove();
      sync.current = () => {};
    };
  }, [viewW, viewH, charH]);

  useEffect(() => { sync.current(actors); }, [actors]);

  return <div ref={hostRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true" />;
}
