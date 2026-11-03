"use client";

// /touch 뽑기 소환 연출 — 족제비 '번개돌이'가 두 팔을 들어 기를 모으고, 하늘에서 번개가 내리꽂히면
// 그 힘으로 뽑기 릴이 돌기 시작한다. 그 뒤엔 화면 구석에서 지켜보다 당첨되면 폴짝 뛰며 기뻐한다.
//   3D: Tripo로 만든 모델(public/touch/ferret.glb, 믹사모 뼈대) + 코드로 만든 동작(팔 조준·떨림·점프)
//   2D: 번개·빨려드는 빛 알갱이·하늘 번쩍임은 캔버스에 직접 그린다.
// three.js는 처음 뽑을 때(혹은 화면이 한가할 때) 불러와서 첫 화면을 무겁게 하지 않는다.
// 모델을 못 불러와도 번개 연출만으로 진행하고, 뽑기는 절대 막지 않는다.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type * as THREE_NS from "three";

export type SummonHandle = {
  /** 기 모으기 → 번개. onBurst는 번개가 터지는 순간 한 번 불린다. */
  play: (onBurst: () => void) => void;
  /** 당첨! — 구석의 번개돌이가 기뻐한다. */
  cheer: () => void;
  busy: () => boolean;
};

type Sfx = (name: "charge" | "thunder" | "zap", gain?: number) => { stop: (f?: number) => void } | null;

const MODEL_URL = "/touch/ferret.glb?v=1";

// 타임라인(초)
const RISE = 0.35; // 올라오기
const RAISE = 0.95; // 팔 다 들기
const BURST = 2.15; // 번개!
const AWAY = 2.75; // 구석으로 물러나기 완료
const CORNER_HOLD = 9; // 당첨 안 오면 이만큼 뒤 사라짐

type Rig = {
  THREE: typeof THREE_NS;
  renderer: THREE_NS.WebGLRenderer;
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  root: THREE_NS.Object3D; // 위치·크기 조절용
  model: THREE_NS.Object3D | null;
  bones: Record<string, THREE_NS.Bone>;
  rest: Map<THREE_NS.Bone, THREE_NS.Quaternion>;
  glowL: THREE_NS.Sprite;
  glowR: THREE_NS.Sprite;
  aura: THREE_NS.Sprite;
  height: number;
  mats: THREE_NS.MeshStandardMaterial[];
};

let rigPromise: Promise<Rig | null> | null = null;
// 3D(WebGL)를 못 쓰는 기기(하드웨어 가속 꺼진 학교 PC·크롬북 등)용: Tripo 모델을 찍은 그림
let flatImg: HTMLImageElement | null = null;
function getFlat() {
  if (!flatImg && typeof Image !== "undefined") {
    flatImg = new Image();
    flatImg.src = "/touch/ferret.png?v=1";
  }
  return flatImg;
}

function glowTexture(THREE: typeof THREE_NS, inner: string, outer: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "#ffffff");
  gr.addColorStop(0.18, inner);
  gr.addColorStop(0.5, outer);
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

async function loadRig(canvas: HTMLCanvasElement): Promise<Rig | null> {
  try {
    const THREE = await import("three");
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7fb0, 2.2));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
    key.position.set(2, 4, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 1.0);
    fill.position.set(-3, 1.5, 4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xb7a8ff, 2.4); // 뒤에서 비추는 보랏빛 테두리 — 어두운 하늘에서 몸이 또렷하게
    rim.position.set(0, 3, -4);
    scene.add(rim);
    const rimL = new THREE.PointLight(0xb9a6ff, 0, 8);
    rimL.position.set(0, 3, 1.5);
    rimL.name = "zap";
    scene.add(rimL);

    const root = new THREE.Group();
    scene.add(root);

    const tex = glowTexture(THREE, "rgba(190,230,255,0.95)", "rgba(140,120,255,0.35)");
    const mk = (s: number) => {
      const m = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true })
      );
      m.scale.setScalar(s);
      m.renderOrder = 10;
      return m;
    };
    const glowL = mk(0.3);
    const glowR = mk(0.3);
    const aura = mk(2);
    aura.material.opacity = 0;
    aura.material.depthTest = true; // 몸 뒤에서만 빛나게
    aura.renderOrder = 0;
    scene.add(glowL, glowR, aura);

    let model: THREE_NS.Object3D | null = null;
    const bones: Record<string, THREE_NS.Bone> = {};
    const rest = new Map<THREE_NS.Bone, THREE_NS.Quaternion>();
    const mats: THREE_NS.MeshStandardMaterial[] = [];
    let height = 1.6;
    try {
      const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      model = gltf.scene;
      model.traverse((o) => {
        const b = o as THREE_NS.Bone;
        if (b.isBone) {
          // "mixamorig:LeftArm" → "LeftArm"
          bones[b.name.replace(/^.*[:_]/, "").replace(/^mixamorig/, "")] = b;
          rest.set(b, b.quaternion.clone());
        }
        const m = o as THREE_NS.Mesh;
        if (m.isMesh) {
          m.frustumCulled = false;
          const mm = m.material as THREE_NS.MeshStandardMaterial;
          if (mm && "emissive" in mm) mats.push(mm);
        }
      });
      // Tripo 뼈대는 +X를 바라본다 → 카메라(+Z) 쪽으로 돌려 세운다
      model.rotation.y = -Math.PI / 2;
      model.updateMatrixWorld(true);
      // 발이 땅(0)에, 가운데가 x=0 에 오게
      const box = new THREE.Box3().setFromObject(model);
      height = box.max.y - box.min.y || 1.6;
      const s = 1.6 / height;
      model.scale.setScalar(s);
      const box2 = new THREE.Box3().setFromObject(model);
      model.position.x -= (box2.max.x + box2.min.x) / 2;
      model.position.z -= (box2.max.z + box2.min.z) / 2;
      model.position.y -= box2.min.y;
      height = 1.6;
      root.add(model);
    } catch {
      model = null; // 번개만으로 진행
    }
    return { THREE, renderer, scene, camera, root, model, bones, rest, glowL, glowR, aura, height, mats };
  } catch {
    return null;
  }
}

// 지그재그 번개 경로(중점 흔들기) + 가지
type Pt = { x: number; y: number };
function boltPath(a: Pt, b: Pt, rough: number, depth = 6): Pt[] {
  let pts = [a, b];
  let off = rough;
  for (let d = 0; d < depth; d++) {
    const next: Pt[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const mx = (p.x + q.x) / 2;
      const my = (p.y + q.y) / 2;
      const nx = -(q.y - p.y);
      const ny = q.x - p.x;
      const len = Math.hypot(nx, ny) || 1;
      const k = (Math.random() - 0.5) * off;
      next.push({ x: mx + (nx / len) * k, y: my + (ny / len) * k }, q);
    }
    pts = next;
    off *= 0.55;
  }
  return pts;
}
function strokeBolt(g: CanvasRenderingContext2D, pts: Pt[], w: number, alpha: number) {
  g.save();
  g.globalAlpha = alpha;
  g.lineJoin = "round";
  g.lineCap = "round";
  const path = () => {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) g.lineTo(p.x, p.y);
  };
  g.shadowColor = "rgba(170,150,255,1)";
  g.shadowBlur = w * 6;
  g.strokeStyle = "rgba(160,140,255,0.55)";
  g.lineWidth = w * 4;
  path();
  g.stroke();
  g.shadowBlur = w * 3;
  g.strokeStyle = "rgba(225,235,255,0.95)";
  g.lineWidth = w * 1.6;
  path();
  g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = "#ffffff";
  g.lineWidth = Math.max(1, w * 0.6);
  path();
  g.stroke();
  g.restore();
}
type Bolt = { pts: Pt[]; branches: Pt[][]; born: number; life: number; w: number };
function makeBolt(from: Pt, to: Pt, w: number, now: number, life: number): Bolt {
  const pts = boltPath(from, to, Math.hypot(to.x - from.x, to.y - from.y) * 0.28);
  const branches: Pt[][] = [];
  const nb = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < nb; i++) {
    const s = pts[Math.floor(pts.length * (0.15 + Math.random() * 0.6))];
    const ang = Math.atan2(to.y - from.y, to.x - from.x) + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.7);
    const L = Math.hypot(to.x - from.x, to.y - from.y) * (0.15 + Math.random() * 0.25);
    branches.push(boltPath(s, { x: s.x + Math.cos(ang) * L, y: s.y + Math.sin(ang) * L }, L * 0.35, 4));
  }
  return { pts, branches, born: now, life, w };
}

type Spark = { x: number; y: number; vx: number; vy: number; tx: number; ty: number; life: number; born: number; hue: number };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const easeOutBack = (x: number) => {
  const t = clamp01(x);
  const c1 = 1.9;
  return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const Summon = forwardRef<SummonHandle, { sfx: Sfx; onShake: (power: number) => void }>(function Summon(
  { sfx, onShake },
  ref
) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLDivElement>(null); // 어두운 하늘 — 캐릭터 '뒤'에 깐다(위에 덮으면 캐릭터가 칙칙해짐)
  const fxRef = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(false);
  const rigRef = useRef<Rig | null>(null);
  const state = useRef({
    t0: 0,
    phase: "idle" as "idle" | "summon" | "corner" | "cheer" | "leave",
    cheerAt: 0,
    leaveAt: 0,
    burstDone: true,
    onBurst: null as null | (() => void),
    bolts: [] as Bolt[],
    sparks: [] as Spark[],
    flash: 0,
    charge: null as null | { stop: (f?: number) => void },
    raf: 0,
    lastSky: 0,
    freeze: null as number | null,
  });
  useEffect(() => {
    (window as unknown as { __summon?: unknown }).__summon = { rigRef, state }; // 점검용
  }, []);
  const sfxRef = useRef(sfx);
  sfxRef.current = sfx;
  const shakeRef = useRef(onShake);
  shakeRef.current = onShake;

  // 화면이 한가할 때 모델 미리 불러오기(첫 뽑기가 바로 시작되게)
  useEffect(() => {
    const go = () => {
      getFlat();
      if (!rigPromise && glRef.current) rigPromise = loadRig(glRef.current);
      void rigPromise?.then((r) => (rigRef.current = r));
    };
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: object) => number }).requestIdleCallback;
    const id = ric ? ric(go, { timeout: 2500 }) : window.setTimeout(go, 1200);
    return () => {
      if (!ric) clearTimeout(id);
    };
  }, []);

  const frame = useCallback((now: number) => {
    const S = state.current;
    const gl = glRef.current;
    const fx = fxRef.current;
    if (!gl || !fx) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    if (fx.width !== Math.round(W * dpr) || fx.height !== Math.round(H * dpr)) {
      fx.width = Math.round(W * dpr);
      fx.height = Math.round(H * dpr);
    }
    const g = fx.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const t = S.freeze ?? (now - S.t0) / 1000; // freeze: 점검용 정지 화면
    const R = rigRef.current;

    // ── 장면 상태 계산 ──
    // 크기/위치: 가운데 크게 → 번개 뒤 왼쪽 아래 구석으로 작게
    const away = S.phase === "summon" ? smooth((t - BURST - 0.15) / (AWAY - BURST - 0.15)) : 1;
    const charge = S.phase === "summon" ? clamp01((t - RAISE) / (BURST - RAISE)) : 0;
    const rise = S.phase === "summon" ? easeOutBack(t / RISE) : 1;
    const cheerT = S.phase === "cheer" ? (now - S.cheerAt) / 1000 : -1;
    const leave = S.phase === "leave" ? smooth((now - S.leaveAt) / 400) : 0;

    // 어두운 하늘 배경
    const dark = S.phase === "summon" ? Math.min(smooth(t / 0.3), 1 - smooth((t - BURST - 0.1) / 0.5)) : 0;
    if (bgRef.current) bgRef.current.style.opacity = dark.toFixed(3);

    // ── 3D 번개돌이 ──
    let pawL: Pt | null = null;
    let pawR: Pt | null = null;
    let head: Pt | null = null;
    if (R && R.model) {
      const { THREE, renderer, scene, camera, root, bones, rest } = R;
      if (gl.width !== Math.round(W * dpr) || gl.height !== Math.round(H * dpr)) {
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
      }
      // 카메라: 기를 모을수록 살짝 다가감
      camera.position.set(0, 1.0, 6.2 - charge * 0.9);
      camera.lookAt(0, 1.0, 0);
      camera.updateMatrixWorld();
      // 화면 가운데 아래 → 구석(화면 왼쪽 아래)으로. 구석 위치는 화면 좌표로 정해서 월드로 바꾼다.
      const vH = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      const vW = vH * camera.aspect;
      const big = Math.min(1.2, (vH * 0.7) / 1.6);
      const small = Math.min(0.55, (vH * 0.3) / 1.6);
      const sc = big + (small - big) * away;
      const cx = 0 + (-vW / 2 + 0.75 * small * 1.6 * 0.6 + vW * 0.03) * away;
      const baseY = 1.0 - vH / 2; // 화면 바닥
      let y = baseY - 1.6 * sc * (1 - rise) * 1.1;
      let squash = 1;
      // 당첨 점프
      if (cheerT >= 0) {
        const j = cheerT % 0.62;
        const hop = Math.sin(clamp01(j / 0.5) * Math.PI);
        y += hop * 0.55 * sc;
        squash = j > 0.5 ? 1 - 0.12 * Math.sin(((j - 0.5) / 0.12) * Math.PI) : 1 + 0.06 * hop;
      }
      y -= leave * 1.6 * sc * 1.3;
      // 기 모으는 동안 덜덜 떨림(점점 세게)
      const tremble = S.phase === "summon" && t < BURST + 0.1 ? charge * charge * 0.035 : 0;
      root.position.set(cx + (Math.random() - 0.5) * tremble, y + (Math.random() - 0.5) * tremble * 0.5, 0);
      root.scale.set(sc / squash ** 0.5, sc * squash, sc / squash ** 0.5);
      root.rotation.y = -0.18 * away + Math.sin(now / 900) * 0.04;

      // 뼈 동작: 매 프레임 쉬는 자세에서 시작해 조준
      for (const [b, q] of rest) {
        b.quaternion.copy(q);
        b.scale.set(1, 1, 1);
      }
      root.updateMatrixWorld(true);
      const up = new THREE.Vector3();
      const tmpA = new THREE.Vector3();
      const tmpB = new THREE.Vector3();
      const qW = new THREE.Quaternion();
      const qP = new THREE.Quaternion();
      const qD = new THREE.Quaternion();
      const aim = (bone: THREE_NS.Bone | undefined, child: THREE_NS.Bone | undefined, dir: THREE_NS.Vector3, w: number) => {
        if (!bone || !child || w <= 0) return;
        bone.getWorldPosition(tmpA);
        child.getWorldPosition(tmpB);
        const cur = tmpB.sub(tmpA).normalize();
        qD.setFromUnitVectors(cur, dir.clone().normalize());
        qD.slerp(new THREE.Quaternion(), 1 - w);
        bone.getWorldQuaternion(qW);
        qW.premultiply(qD);
        (bone.parent as THREE_NS.Object3D).getWorldQuaternion(qP);
        bone.quaternion.copy(qP.invert().multiply(qW));
        bone.updateMatrixWorld(true);
      };
      const turn = (bone: THREE_NS.Bone | undefined, axis: THREE_NS.Vector3, ang: number) => {
        if (!bone || !ang) return;
        bone.getWorldQuaternion(qW);
        qW.premultiply(qD.setFromAxisAngle(axis, ang));
        (bone.parent as THREE_NS.Object3D).getWorldQuaternion(qP);
        bone.quaternion.copy(qP.invert().multiply(qW));
        bone.updateMatrixWorld(true);
      };
      const X = new THREE.Vector3(1, 0, 0);
      // 팔 들기 정도: 소환 중엔 들어 올리고 유지, 번개 뒤엔 내렸다가, 당첨 때 다시 번쩍
      let raise = 0;
      let crouch = 0;
      let lookUp = 0;
      if (S.phase === "summon") {
        const dip = smooth((t - RISE) / 0.18) * (1 - smooth((t - RISE - 0.18) / 0.2)); // 들기 전 움찔(예비동작)
        raise = smooth((t - RISE - 0.12) / (RAISE - RISE - 0.12));
        crouch = dip * 0.6 + (t > BURST ? Math.sin(clamp01((t - BURST) / 0.35) * Math.PI) * 0.8 : 0);
        lookUp = raise * 0.35;
        if (t > BURST + 0.45) raise *= 1 - smooth((t - BURST - 0.45) / 0.35);
      } else if (S.phase === "cheer") {
        raise = 1;
        lookUp = 0.2;
      } else raise = 0.12 + Math.sin(now / 500) * 0.05; // 구석에서 두근두근 대기
      const spread = 0.5 - charge * 0.18; // V자로 번쩍 — 큰 머리 옆으로 손이 보이게, 기가 모일수록 위로 모음
      const wob = (k: number) => (Math.random() - 0.5) * charge * 0.12 * k;
      const sideDir = (sign: number) => new THREE.Vector3(sign * spread + wob(1), 1, 0.12 + wob(1));
      const side = (name: string) => {
        const b = bones[name];
        if (!b) return 1;
        b.getWorldPosition(tmpA);
        return tmpA.x - root.position.x >= 0 ? 1 : -1;
      };
      // 허리 굽힘·뒤로 젖힘
      turn(bones["Spine"], X, -crouch * 0.25 - lookUp * 0.25);
      turn(bones["Head"], X, -lookUp * 0.8);
      for (const s of ["Left", "Right"]) {
        const sg = side(`${s}Arm`);
        const arm = bones[`${s}Arm`];
        const fore = bones[`${s}ForeArm`];
        const hand = bones[`${s}Hand`];
        if (raise > 0) {
          // 짧은 팔을 만화처럼 쭉 늘려 머리 위까지 번쩍
          const st = 1 + 0.45 * raise;
          arm?.scale.set(1, st, 1);
          fore?.scale.set(1, st, 1);
          hand?.scale.set(1, 1 / st, 1);
          const d = sideDir(sg);
          aim(arm, fore, d, raise);
          aim(fore, hand, d, raise);
        }
        // 무릎 살짝 굽히기
        turn(bones[`${s}UpLeg`], X, -crouch * 0.35);
        turn(bones[`${s}Leg`], X, crouch * 0.6);
      }
      // 손 위치(화면 좌표) — 빛 구슬·번개가 꽂힐 자리
      const proj = (b: THREE_NS.Bone | undefined): Pt | null => {
        if (!b) return null;
        b.getWorldPosition(up);
        const v = up.clone().project(camera);
        return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
      };
      pawL = proj(bones["LeftHand"]);
      pawR = proj(bones["RightHand"]);
      head = proj(bones["Head"]);
      // 손의 빛 구슬
      const orb = S.phase === "summon" ? smooth((t - RAISE + 0.25) / 0.4) * (1 - smooth((t - BURST - 0.3) / 0.4)) : 0;
      for (const [sp, nm] of [
        [R.glowL, "LeftHand"],
        [R.glowR, "RightHand"],
      ] as const) {
        const b = bones[nm];
        sp.visible = !!b && orb > 0.01;
        if (b) b.getWorldPosition(sp.position);
        sp.material.opacity = orb;
        sp.scale.setScalar((0.3 + charge * 0.7 + Math.random() * 0.08) * sc * orb);
      }
      R.aura.visible = orb > 0.01;
      R.aura.position.set(root.position.x, root.position.y + 0.9 * sc, -0.8 * sc);
      R.aura.material.opacity = orb * (0.18 + charge * 0.4);
      R.aura.scale.setScalar((1.6 + charge * 1.2 + Math.sin(now / 60) * 0.06) * sc);
      // 번개 맞는 순간 몸이 하얗게 번쩍
      const zapGlow = S.phase === "summon" ? Math.max(0, 1 - Math.abs(t - BURST - 0.05) / 0.25) : 0;
      for (const m of R.mats) {
        m.emissive.setRGB(0.3 * zapGlow, 0.32 * zapGlow, 0.55 * zapGlow);
        m.emissiveIntensity = 1;
      }
      const zl = scene.getObjectByName("zap") as THREE_NS.PointLight;
      if (zl) zl.intensity = charge * 2 + zapGlow * 10;
      renderer.render(scene, camera);
    } else {
      // 3D를 못 쓸 때: 같은 번개돌이 그림을 2D로 — 올라오기·떨림·구석으로·당첨 점프는 똑같이
      const img = getFlat();
      const bigH = H * 0.66;
      const smallH = H * 0.28;
      const h = bigH + (smallH - bigH) * away;
      const w = h; // 정사각 그림
      const cx = W / 2 + (smallH * 0.55 + W * 0.02 - W / 2) * away;
      let bottom = H + h * 0.06 + h * (1 - rise) * 1.1 + leave * h * 1.3;
      if (cheerT >= 0) bottom -= Math.sin(clamp01((cheerT % 0.62) / 0.5) * Math.PI) * h * 0.25;
      const tr = S.phase === "summon" && t < BURST + 0.1 ? charge * charge * 10 : 0;
      const x = cx - w / 2 + (Math.random() - 0.5) * tr;
      const y = bottom - h + (Math.random() - 0.5) * tr * 0.5;
      // 몸 뒤 오라
      const orb = S.phase === "summon" ? smooth((t - RAISE + 0.25) / 0.4) * (1 - smooth((t - BURST - 0.3) / 0.4)) : 0;
      if (orb > 0.01) {
        const gr = g.createRadialGradient(cx, y + h * 0.5, 0, cx, y + h * 0.5, h * (0.55 + charge * 0.3));
        gr.addColorStop(0, `rgba(190,230,255,${0.5 * orb})`);
        gr.addColorStop(1, "rgba(140,120,255,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
      }
      if (img?.complete && img.naturalWidth) {
        const zap = S.phase === "summon" ? Math.max(0, 1 - Math.abs(t - BURST - 0.05) / 0.25) : 0;
        g.save();
        if (zap > 0) g.filter = `brightness(${1 + zap * 0.8})`;
        g.drawImage(img, x, y, w, h);
        g.restore();
      }
      // 그림 속 앞발 자리(번개가 꽂힐 곳)
      pawL = { x: x + w * 0.19, y: y + h * 0.62 };
      pawR = { x: x + w * 0.69, y: y + h * 0.64 };
      head = { x: x + w * 0.45, y: y + h * 0.25 };
    }

    // ── 2D 효과 ──
    const g2 = g;
    if (S.phase === "summon") {
      // 하늘 번쩍(멀리 치는 번개)
      if (t > 0.4 && t < BURST && now - S.lastSky > 260 - charge * 160 && Math.random() < 0.5) {
        S.lastSky = now;
        const x = Math.random() * W;
        S.bolts.push(makeBolt({ x, y: -10 }, { x: x + (Math.random() - 0.5) * W * 0.3, y: H * (0.25 + Math.random() * 0.3) }, 1.2 + charge, now, 140));
        S.flash = Math.max(S.flash, 0.12 + charge * 0.15);
      }
      // 빛 알갱이가 손으로 빨려든다
      if (pawL && pawR && t > RAISE - 0.2 && t < BURST) {
        const n = 2 + Math.floor(charge * 6);
        for (let i = 0; i < n; i++) {
          const target = Math.random() < 0.5 ? pawL : pawR;
          const ang = Math.random() * Math.PI * 2;
          const dist = 160 + Math.random() * Math.max(W, H) * 0.35;
          S.sparks.push({
            x: target.x + Math.cos(ang) * dist,
            y: target.y + Math.sin(ang) * dist,
            vx: 0,
            vy: 0,
            tx: target.x,
            ty: target.y,
            life: 420 + Math.random() * 300,
            born: now,
            hue: 200 + Math.random() * 80,
          });
        }
      }
      // 번개 내리꽂기!
      if (!S.burstDone && t >= BURST) {
        S.burstDone = true;
        const mid = pawL && pawR ? { x: (pawL.x + pawR.x) / 2, y: Math.min(pawL.y, pawR.y) } : { x: W / 2, y: H / 2 };
        for (let k = 0; k < 3; k++)
          S.bolts.push(makeBolt({ x: mid.x + (Math.random() - 0.5) * 120, y: -20 }, { x: mid.x + (k - 1) * 14, y: mid.y }, 4.5 - k, now + k * 70, 520 - k * 80));
        if (pawL) S.bolts.push(makeBolt({ x: pawL.x - 60, y: -20 }, pawL, 2.6, now + 40, 380));
        if (pawR) S.bolts.push(makeBolt({ x: pawR.x + 60, y: -20 }, pawR, 2.6, now + 90, 380));
        S.flash = 1;
        S.charge?.stop(0.05);
        S.charge = null;
        sfxRef.current("thunder", 1);
        sfxRef.current("zap", 0.8);
        shakeRef.current(1);
        const f = S.onBurst;
        S.onBurst = null;
        f?.();
      }
      // 번개 뒤 잔 번개(손에서 사방으로 튀는 전기)
      if (t > BURST && t < BURST + 0.55 && pawL && pawR && Math.random() < 0.35) {
        const src = Math.random() < 0.5 ? pawL : pawR;
        const ang = Math.random() * Math.PI * 2;
        const L = 60 + Math.random() * 140;
        S.bolts.push(makeBolt(src, { x: src.x + Math.cos(ang) * L, y: src.y + Math.sin(ang) * L }, 1.4, now, 120));
      }
    }
    // 알갱이 그리기
    g2.save();
    g2.globalCompositeOperation = "lighter";
    S.sparks = S.sparks.filter((p) => {
      const k = (now - p.born) / p.life;
      if (k >= 1) return false;
      const e = k * k;
      const x = p.x + (p.tx - p.x) * e;
      const y = p.y + (p.ty - p.y) * e;
      const r = 1.5 + (1 - k) * 3;
      g2.fillStyle = `hsla(${p.hue},100%,${70 + k * 25}%,${0.4 + k * 0.6})`;
      g2.beginPath();
      g2.arc(x, y, r, 0, Math.PI * 2);
      g2.fill();
      // 꼬리
      g2.strokeStyle = `hsla(${p.hue},100%,80%,${0.25 * k})`;
      g2.lineWidth = r;
      g2.beginPath();
      g2.moveTo(x, y);
      const e2 = Math.max(0, k - 0.12) ** 2;
      g2.lineTo(p.x + (p.tx - p.x) * e2, p.y + (p.ty - p.y) * e2);
      g2.stroke();
      return true;
    });
    g2.restore();
    // 번개 그리기(깜빡이며 사라짐)
    S.bolts = S.bolts.filter((b) => {
      const k = (now - b.born) / b.life;
      if (k < 0) return true;
      if (k >= 1) return false;
      const flick = k < 0.15 ? 1 : Math.random() < 0.7 ? 1 - k : 0.25;
      strokeBolt(g2, b.pts, b.w, flick);
      for (const br of b.branches) strokeBolt(g2, br, b.w * 0.45, flick * 0.8);
      return true;
    });
    // 화면 전체 번쩍
    if (S.flash > 0.01) {
      g2.fillStyle = `rgba(235,235,255,${S.flash * 0.85})`;
      g2.fillRect(0, 0, W, H);
      S.flash *= 0.86;
    }
    // 머리 위 말풍선 글자
    if (S.phase === "summon" && head && t > RISE && t < BURST + 0.5) {
      const txt = t < BURST ? "기 모으는 중" + ".".repeat(1 + (Math.floor(t * 4) % 3)) : "⚡ 번쩍!";
      const big = t >= BURST;
      const size = big ? Math.min(96, W * 0.09) : Math.min(44, W * 0.045);
      g2.save();
      g2.font = `900 ${size}px system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
      g2.textAlign = "center";
      g2.lineWidth = size * 0.16;
      g2.strokeStyle = "rgba(30,20,70,0.9)";
      g2.fillStyle = big ? "#fff6a8" : "#e9e4ff";
      const yy = H * (big ? 0.2 : 0.14) + size / 2;
      const jitter = big ? (Math.random() - 0.5) * 6 : 0;
      g2.strokeText(txt, W / 2 + jitter, yy + jitter);
      g2.fillText(txt, W / 2 + jitter, yy + jitter);
      g2.restore();
    }

    // ── 다음 단계 ──
    if (S.phase === "summon" && t >= AWAY) {
      S.phase = "corner";
      S.leaveAt = now + CORNER_HOLD * 1000; // 당첨이 안 오면 이때 퇴장
    }
    if (S.phase === "corner" && now >= S.leaveAt) {
      S.phase = "leave";
    }
    if (S.phase === "cheer" && now - S.cheerAt > 2600) {
      S.phase = "leave";
      S.leaveAt = now;
    }
    if (S.phase === "leave" && now - S.leaveAt > 450 && S.bolts.length === 0) {
      S.phase = "idle";
      S.raf = 0;
      g.clearRect(0, 0, W, H);
      rigRef.current?.renderer.clear();
      if (bgRef.current) bgRef.current.style.opacity = "0";
      setOn(false);
      return;
    }
    S.raf = requestAnimationFrame(frame);
  }, []);

  const start = useCallback(() => {
    const S = state.current;
    if (!S.raf) S.raf = requestAnimationFrame(frame);
  }, [frame]);

  useEffect(
    () => () => {
      const S = state.current;
      if (S.raf) cancelAnimationFrame(S.raf);
      S.charge?.stop();
    },
    []
  );

  useImperativeHandle(
    ref,
    () => ({
      busy: () => state.current.phase === "summon",
      play: (onBurst) => {
        const S = state.current;
        if (S.phase === "summon") return;
        setOn(true);
        if (!rigPromise && glRef.current) rigPromise = loadRig(glRef.current);
        const begin = () => {
          S.t0 = performance.now();
          S.phase = "summon";
          S.burstDone = false;
          S.onBurst = onBurst;
          S.bolts = [];
          S.sparks = [];
          S.flash = 0;
          S.charge?.stop();
          S.charge = sfxRef.current("charge", 0.9);
          start();
        };
        // 모델이 아직이면 아주 잠깐(최대 0.8초)만 기다리고, 못 오면 번개만으로 간다
        if (rigRef.current) begin();
        else {
          let done = false;
          const go = () => {
            if (done) return;
            done = true;
            begin();
          };
          void rigPromise?.then((r) => {
            rigRef.current = r;
            go();
          });
          setTimeout(go, 800);
        }
      },
      cheer: () => {
        const S = state.current;
        if (S.phase === "corner" || S.phase === "summon") {
          S.phase = "cheer";
          S.cheerAt = performance.now();
          start();
        }
      },
    }),
    [start]
  );

  return (
    <div aria-hidden className={`pointer-events-none fixed inset-0 z-50 ${on ? "" : "invisible"}`}>
      <div
        ref={bgRef}
        className="absolute inset-0 opacity-0"
        style={{ background: "radial-gradient(ellipse at 50% 75%, rgba(55,35,120,0.72), rgba(6,6,24,0.93) 80%)" }}
      />
      <canvas ref={glRef} className="absolute inset-0 h-full w-full" />
      <canvas ref={fxRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
});
