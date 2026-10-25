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
import { charUrl, MOA_PREFIX, type BrainChar } from "@/lib/brainstorm-chars";

export type Actor = { uid: string; char: BrainChar; x: number; y: number; ideas: number };
/** 판 확대·이동 상태 — 화면 왼쪽 위 판 좌표(x, y)와 배율(s) */
export type BoardView = { x: number; y: number; s: number };

type Template = { scene: THREE.Object3D; clips: THREE.AnimationClip[]; scale: number; lift: number; flat?: boolean };
type Live = {
  uid: string; charId: string; kind: BrainChar["kind"]; root: THREE.Group; body: THREE.Object3D;
  mixer: THREE.AnimationMixer | null; actions: Record<string, THREE.AnimationAction>;
  phase: number; ideas: number; hopAt: number; nextWalk: number;
  /** 건너뛴 프레임 동안 쌓인 시간(많을 때 동작을 격프레임으로) */
  acc: number; slot: number;
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

export function CharacterLayer({ actors, viewW, viewH, charH, view, onLoaded, onFail, frameRef }: {
  actors: Actor[]; viewW: number; viewH: number; charH: number; view: BoardView;
  /** 판보다 넓은 바다 영역 — 확대했을 때 판 밖(바다 여백)에 걸친 캐릭터도 그린다 */
  frameRef?: React.RefObject<HTMLElement | null>;
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
    renderer.domElement.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb0b8d0, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1); sun.position.set(-120, 260, 300); scene.add(sun);
    // 판 좌표 그대로: x 오른쪽, y 아래(그래서 -y), z 는 아래쪽 캐릭터가 앞
    const cam = new THREE.OrthographicCamera(0, viewW, 0, -viewH, -2000, 2000);
    cam.position.set(0, 0, 1000); cam.lookAt(0, 0, 0);

    // 캔버스는 바다 전체를 덮는다. pad = 판 가장자리에서 바다 가장자리까지(px), bw/bh = 판 크기(px)
    const geo = { l: 0, t: 0, r: 0, b: 0, bw: 1, bh: 1 };
    const resize = () => {
      const r = host.getBoundingClientRect(); const f = frameRef?.current?.getBoundingClientRect() ?? r;
      Object.assign(geo, { l: r.left - f.left, t: r.top - f.top, r: f.right - r.right, b: f.bottom - r.bottom, bw: Math.max(1, r.width), bh: Math.max(1, r.height) });
      const s = renderer.domElement.style;
      s.left = `${-geo.l}px`; s.top = `${-geo.t}px`; s.width = `${f.width}px`; s.height = `${f.height}px`;
      renderer.setSize(Math.max(1, f.width), Math.max(1, f.height), false);
    };
    const ro = new ResizeObserver(resize); ro.observe(host); if (frameRef?.current) ro.observe(frameRef.current); resize();

    const gradient = toonGradient();
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const templates = new Map<string, Promise<Template | null>>();
    const lives = new Map<string, Live>();
    let disposed = false;

    const loadTemplate = (id: string) => {
      let p = templates.get(id);
      if (!p && id.startsWith(MOA_PREFIX)) {
        // 모아 월드 캐릭터: 그림 한 장을 판 위에 세운다(바닥 가운데 기준, 외곽선은 그림에 이미 있음)
        p = new THREE.TextureLoader().loadAsync(id.slice(MOA_PREFIX.length)).then(tex => {
          tex.colorSpace = THREE.SRGBColorSpace;
          const img = tex.image as { width: number; height: number };
          const h = charH * 1.35, w = h * (img.width / Math.max(1, img.height));
          const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2, 0);
          const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthWrite: false }));
          const g = new THREE.Group(); g.add(mesh);
          return { scene: g, clips: [], scale: 1, lift: 0, flat: true } as Template;
        }).catch(() => null);
        templates.set(id, p);
      }
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
      const body = t.flat ? t.scene.clone() : cloneSkinned(t.scene);
      if (!t.flat) addOutline(body, t.scale);
      body.scale.setScalar(t.scale); body.position.y = t.lift;
      const root = new THREE.Group(); root.add(body);
      root.rotation.x = 0.18; // 판을 살짝 내려다보는 느낌
      const mixer = t.clips.length ? new THREE.AnimationMixer(body) : null;
      const actions: Record<string, THREE.AnimationAction> = {};
      if (mixer) for (const c of t.clips) actions[c.name.replace(/^preset:(quadruped:)?/, "")] = mixer.clipAction(c);
      if (actions.idle) actions.idle.play();
      const live: Live = { uid: a.uid, charId: a.char.id, kind: a.char.kind, root, body, mixer, actions, phase: Math.random() * Math.PI * 2, ideas: a.ideas, hopAt: -10, nextWalk: 2 + Math.random() * 6, acc: 0, slot: lives.size % 2 };
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
    let frame = 0; let tick = 0;
    // 기기가 버거워하면(크롬북 등) 2D 그림으로 바꾼다 — 불러오기가 끝난 뒤(4초부터) 3초마다 화면 갱신 간격을 재서
    // 평균 25fps 밑이면 3D 를 끈다. 3D 를 끄면 판 전체(말풍선·확대)가 훨씬 가벼워진다.
    const born = performance.now(); let last = born; let gapSum = 0; let gapN = 0; let winAt = born;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const nowP = performance.now(); const gap = nowP - last; last = nowP;
      if (document.hidden) { gapSum = 0; gapN = 0; winAt = nowP; return; }
      if (nowP - born > 4000 && lives.size > 0 && gap < 1000) {
        gapSum += gap; gapN++;
        if (nowP - winAt > 3000) {
          if (gapSum / gapN > 40) { cbs.current.onFail(); return; }
          gapSum = 0; gapN = 0; winAt = nowP;
        }
      }
      const v = viewRef.current; tick++;
      // 캐릭터가 많으면 둥실 움직임은 30fps(20명 넘게)·20fps(40명 넘게)로만 그린다 — 확대·이동 중에는 판과 어긋나지 않게 매 프레임
      // 화면(바다 전체)에 보이는 판 좌표 범위 — 판 밖 여백만큼 더 넓다
      const ux = viewW / v.s / geo.bw; const uy = viewH / v.s / geo.bh;
      const L = v.x - geo.l * ux; const R = v.x + viewW / v.s + geo.r * ux; const T = v.y - geo.t * uy; const B = v.y + viewH / v.s + geo.b * uy;
      const camMoved = cam.left !== L || cam.right !== R || cam.top !== -T || cam.bottom !== -B;
      const step = lives.size > 40 ? 3 : lives.size > 20 ? 2 : 1;
      if (!camMoved && tick % step) return;
      const dt = Math.min(clock.getDelta(), 0.1); const t = clock.elapsedTime;
      // 화면 밖(확대해서 안 보이는 섬)의 캐릭터는 그리지도 움직이지도 않는다.
      // 여러 반이 모여 캐릭터가 많으면 뼈 동작은 한 프레임씩 번갈아(반씩) 계산한다.
      const x0 = L - charH; const x1 = R + charH; const y0 = T - charH * 0.5; const y1 = B + charH * 1.5;
      const many = lives.size > 40;
      for (const l of lives.values()) {
        const p = l.root.position;
        const vis = p.x > x0 && p.x < x1 && -p.y > y0 && -p.y < y1;
        l.root.visible = vis;
        if (!vis) { l.acc += dt; continue; }
        l.acc += dt;
        if (!many || (Math.floor(tick / step) + l.slot) % 2 === 0) { l.mixer?.update(Math.min(l.acc, 0.25)); l.acc = 0; }
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
      if (camMoved) {
        cam.left = L; cam.right = R; cam.top = -T; cam.bottom = -B; cam.updateProjectionMatrix();
      }
      renderer.render(scene, cam);
    };
    loop();

    return () => {
      disposed = true; cancelAnimationFrame(frame); ro.disconnect();
      renderer.dispose(); renderer.domElement.remove();
      sync.current = () => {};
    };
  }, [viewW, viewH, charH, frameRef]);

  useEffect(() => { sync.current(actors); }, [actors]);

  return <div ref={hostRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true" />;
}
