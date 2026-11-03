"use client";

// /touch 뽑기 소환 연출 — 캐릭터가 기를 모으고, 번개가 내리꽂히면 그 힘으로 뽑기 릴이 돌기 시작한다.
// 그 뒤엔 화면 구석에서 지켜보다 당첨되면 기뻐한다. 캐릭터는 다섯(번개돌이·다람쥐·시바·바퀴·비둘기),
// 저마다 다른 동작(문지르기·엉덩이 흔들기·허둥지둥·고개 까딱·날갯짓)과 다른 터짐(도토리·뼈다귀·먼지·깃털).
//   3D: Tripo로 만든 모델(public/touch/<id>.glb, 믹사모 뼈대) + 코드로 만든 동작.
//       브롤스타즈 느낌: 굵은 검은 테두리(뒤집은 껍데기) + 단계 셰이딩(툰).
//   2D: 번개·빨려드는 빛 알갱이·터지는 조각은 캔버스에 직접 그린다.
//   3D(WebGL)를 못 쓰는 기기에서는 같은 캐릭터를 찍은 그림(<id>.png)으로 대신한다.
// three.js는 화면이 한가할 때 불러와 첫 화면을 무겁게 하지 않는다. 무엇이 실패해도 뽑기는 막지 않는다.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type * as THREE_NS from "three";

export type CharId = "ferret" | "squirrel" | "shiba" | "roach" | "pigeon";
type CharDef = {
  name: string;
  emoji: string;
  rgb: [number, number, number]; // 번개·빛 색
  charge: string;
  burst: string;
  bits: string[]; // 터질 때 튀는 조각
};
export const CHARS: Record<CharId, CharDef> = {
  ferret: { name: "번개돌이", emoji: "⚡", rgb: [170, 150, 255], charge: "기 모으는 중", burst: "⚡ 번쩍!", bits: ["✨", "⚡"] },
  squirrel: { name: "다람쥐", emoji: "🐿️", rgb: [255, 160, 60], charge: "도토리 힘 모으는 중", burst: "🌰 도토리 폭탄!", bits: ["🌰", "🍂", "🌰"] },
  shiba: { name: "시바", emoji: "🐕", rgb: [255, 95, 80], charge: "멍멍! 기 모으는 중", burst: "🐾 왕왕!!", bits: ["🦴", "🐾", "❤️"] },
  roach: { name: "바퀴", emoji: "🪳", rgb: [130, 235, 90], charge: "사사삭… 기 모으는 중", burst: "💨 사사사삭!", bits: ["💨", "💥", "✨"] },
  pigeon: { name: "비둘기", emoji: "🕊️", rgb: [160, 140, 255], charge: "구구구… 기 모으는 중", burst: "🪶 구구구구!", bits: ["🪶", "🍞", "🪶"] },
};
export const CHAR_IDS = Object.keys(CHARS) as CharId[];
const V = 1;
const glbUrl = (id: CharId) => `/touch/${id}.glb?v=${V}`;
const pngUrl = (id: CharId) => `/touch/${id}.png?v=${V}`;

export type SummonHandle = {
  /** 기 모으기 → 번개. onBurst는 번개가 터지는 순간 한 번 불린다. */
  play: (onBurst: () => void, char: CharId) => void;
  /** 당첨! — 구석의 캐릭터가 기뻐한다. */
  cheer: () => void;
  busy: () => boolean;
  /** 이 캐릭터들을 미리 받아 둔다 */
  preload: (ids: CharId[]) => void;
};

type Sfx = (name: "charge" | "thunder" | "zap", gain?: number) => { stop: (f?: number) => void } | null;

// 타임라인(초)
const RISE = 0.35; // 올라오기
const RAISE = 0.95; // 기 모으는 자세 완성
const BURST = 2.15; // 번개!
const EXIT0 = BURST + 0.5; // 번개 뒤 잠깐 폼 잡고 → 사라지기 시작

// ── 사라지는 동작(매번 무작위, 바로 전 것은 피함) ──
// x: 화면 반폭 단위(±1이면 화면 밖), y: 화면 높이 단위(+위), s: 크기 배율, run: 다리 굴리기
export type ExitKind = "dash" | "jump" | "dig" | "zigzag" | "pop" | "zap";
const EXITS: ExitKind[] = ["dash", "jump", "dig", "zigzag", "pop", "zap"];
const EXIT_DUR: Record<ExitKind, number> = { dash: 0.75, jump: 0.85, dig: 0.9, zigzag: 0.95, pop: 0.6, zap: 0.7 };
type ExitPose = { x: number; y: number; s: number; rotY: number; rotZ: number; run: number; crouch: number; hide: boolean; arms: "up" | "back" | "flail" | null };
type ExitCfg = { kind: ExitKind; dir: number; tx: number; ty: number };
const easeIn = (x: number) => {
  const t = clamp01(x);
  return t * t * t;
};
function exitPose(c: ExitCfg, e: number, now: number): ExitPose {
  const o: ExitPose = { x: 0, y: 0, s: 1, rotY: 0, rotZ: 0, run: 0, crouch: 0, hide: e >= 1, arms: null };
  const s = now / 1000;
  if (c.kind === "dash") {
    // 반대쪽으로 살짝 움찔 → 옆으로 돌아 후다닥
    const wind = smooth(e / 0.2) * (1 - smooth((e - 0.2) / 0.1));
    o.rotY = c.dir * (Math.PI / 2) * smooth(e / 0.18);
    o.x = -c.dir * 0.06 * wind + c.dir * 1.35 * easeIn((e - 0.18) / 0.82);
    o.run = e > 0.12 ? 1 : 0;
    o.rotZ = -c.dir * 0.12 * o.run;
    o.y = Math.abs(Math.sin(s * 22)) * 0.025 * o.run;
    o.arms = "back";
  } else if (c.kind === "jump") {
    // 쭈그렸다가 하늘로 슝(돌면서)
    o.crouch = smooth(e / 0.22) * (1 - smooth((e - 0.22) / 0.08)) * 1.2;
    const up = easeIn((e - 0.25) / 0.75);
    o.y = up * 1.5;
    o.rotY = up * Math.PI * 3;
    o.s = 1 - up * 0.3;
    o.arms = "up";
  } else if (c.kind === "dig") {
    // 빙글빙글 돌며 땅속으로 쏙
    const k = smooth(e);
    o.rotY = easeIn(e) * Math.PI * 8;
    o.y = -easeIn((e - 0.15) / 0.85) * 1.05;
    o.crouch = k * 0.6;
    o.arms = "up";
  } else if (c.kind === "zigzag") {
    // 사사삭! 지그재그로 세 번 튀어 목표 구석으로(작아지며)
    const seg = Math.min(2, Math.floor(e * 3));
    const local = smooth((e * 3 - seg) / 0.55);
    const pts = [
      { x: 0, y: 0 },
      { x: c.tx * 0.35 + c.dir * 0.25, y: c.ty * 0.2 },
      { x: c.tx * 0.7 - c.dir * 0.2, y: c.ty * 0.45 },
      { x: c.tx * 1.35, y: c.ty * 0.8 },
    ];
    const a = pts[seg];
    const b = pts[seg + 1];
    o.x = a.x + (b.x - a.x) * local;
    o.y = a.y + (b.y - a.y) * local + Math.sin(local * Math.PI) * 0.06;
    o.rotY = Math.sign(b.x - a.x || 1) * (Math.PI / 2);
    o.s = 1 - e * 0.45;
    o.run = 1;
    o.arms = "flail";
  } else if (c.kind === "pop") {
    // 부르르 떨다가 뿅! 작아져서 사라짐
    const shrink = easeIn((e - 0.35) / 0.65);
    o.s = (1 + Math.sin(e * 40) * 0.06 * (1 - shrink)) * (1 - shrink) + 0.0001;
    o.rotY = shrink * Math.PI * 4;
    o.y = shrink * 0.15;
    o.arms = "up";
  } else {
    // zap: 번개처럼 깜빡깜빡하다 사라짐
    o.hide = e >= 1 || (e > 0.3 && Math.floor(s * 30) % 2 === 0) || e > 0.85;
    o.rotZ = Math.sin(s * 50) * 0.05;
    o.x = (Math.random() - 0.5) * 0.03;
    o.arms = "up";
  }
  return o;
}

type Base = {
  THREE: typeof THREE_NS;
  renderer: THREE_NS.WebGLRenderer;
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  root: THREE_NS.Object3D;
  glowL: THREE_NS.Sprite;
  glowR: THREE_NS.Sprite;
  aura: THREE_NS.Sprite;
  zap: THREE_NS.PointLight;
  grad: THREE_NS.Texture;
};
type Model = {
  obj: THREE_NS.Object3D;
  bones: Record<string, THREE_NS.Bone>;
  rest: Map<THREE_NS.Bone, { q: THREE_NS.Quaternion; s: THREE_NS.Vector3 }>;
  mats: THREE_NS.MeshToonMaterial[];
};

let basePromise: Promise<Base | null> | null = null;
const modelPromises = new Map<CharId, Promise<Model | null>>();
const models = new Map<CharId, Model | null>();
const flats = new Map<CharId, HTMLImageElement>();
function getFlat(id: CharId) {
  let im = flats.get(id);
  if (!im && typeof Image !== "undefined") {
    im = new Image();
    im.src = pngUrl(id);
    flats.set(id, im);
  }
  return im;
}

function glowTexture(THREE: typeof THREE_NS) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "#ffffff");
  gr.addColorStop(0.18, "rgba(255,255,255,0.9)");
  gr.addColorStop(0.5, "rgba(255,255,255,0.3)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

async function loadBase(canvas: HTMLCanvasElement): Promise<Base | null> {
  try {
    const THREE = await import("three");
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    // 툰(단계) 셰이딩은 빛이 또렷해야 단계가 예쁘게 나온다: 정면 위 주광 + 약한 하늘빛 + 뒤 테두리 빛
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a90c0, 1.6));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
    key.position.set(2, 4, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.8);
    fill.position.set(-3, 1.5, 4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xc8bbff, 2.2);
    rim.position.set(0, 3, -4);
    scene.add(rim);
    const zap = new THREE.PointLight(0xb9a6ff, 0, 8);
    zap.position.set(0, 3, 1.5);
    scene.add(zap);
    const root = new THREE.Group();
    scene.add(root);
    const tex = glowTexture(THREE);
    const mk = (s: number, onTop: boolean) => {
      const m = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: !onTop, transparent: true })
      );
      m.scale.setScalar(s);
      m.renderOrder = onTop ? 10 : 0;
      return m;
    };
    const glowL = mk(0.3, true);
    const glowR = mk(0.3, true);
    const aura = mk(2, false);
    scene.add(glowL, glowR, aura);
    // 3단계 툰 그라데이션(어두움·중간·밝음)
    const grad = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 180, 180, 180, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter;
    grad.needsUpdate = true;
    return { THREE, renderer, scene, camera, root, glowL, glowR, aura, zap, grad };
  } catch {
    return null;
  }
}

async function loadModel(B: Base, id: CharId): Promise<Model | null> {
  const { THREE } = B;
  try {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().loadAsync(glbUrl(id));
    const obj = gltf.scene;
    const bones: Record<string, THREE_NS.Bone> = {};
    const rest = new Map<THREE_NS.Bone, { q: THREE_NS.Quaternion; s: THREE_NS.Vector3 }>();
    const mats: THREE_NS.MeshToonMaterial[] = [];
    const skinned: THREE_NS.SkinnedMesh[] = [];
    obj.traverse((o) => {
      const b = o as THREE_NS.Bone;
      if (b.isBone) {
        bones[b.name.replace(/^.*[:_]/, "").replace(/^mixamorig/, "")] = b;
        rest.set(b, { q: b.quaternion.clone(), s: b.scale.clone() });
      }
      const m = o as THREE_NS.SkinnedMesh;
      if (m.isMesh) {
        m.frustumCulled = false;
        if (m.isSkinnedMesh) skinned.push(m);
      }
    });
    // ── 브롤스타즈 느낌: 툰 셰이딩 + 굵은 검은 테두리 ──
    for (const m of skinned) {
      const src = m.material as THREE_NS.MeshStandardMaterial;
      const toon = new THREE.MeshToonMaterial({ map: src.map ?? null, color: src.color ?? new THREE.Color(0xffffff), gradientMap: B.grad });
      m.material = toon;
      mats.push(toon);
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!;
      const thick = (bb.max.y - bb.min.y) * 0.014;
      const line = new THREE.MeshBasicMaterial({ color: 0x15121f, side: THREE.BackSide });
      line.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\n transformed += normalize(normal) * ${thick.toFixed(5)};`
        );
      };
      const outline = new THREE.SkinnedMesh(m.geometry, line);
      outline.bind(m.skeleton, m.bindMatrix);
      outline.frustumCulled = false;
      outline.renderOrder = -1;
      m.add(outline);
    }
    // 앞을 보게: 발끝 방향이 +Z(카메라 쪽)가 되도록 돌린다(Tripo 뼈대는 대개 +X를 본다)
    obj.updateMatrixWorld(true);
    const foot = bones["LeftFoot"];
    const toe = bones["LeftToe_End"] ?? bones["LeftToeBase"];
    let yaw = -Math.PI / 2;
    if (foot && toe) {
      const a = foot.getWorldPosition(new THREE.Vector3());
      const b = toe.getWorldPosition(new THREE.Vector3());
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      if (Math.hypot(dx, dz) > 1e-4) yaw = -Math.atan2(dx, dz);
    }
    obj.rotation.y = yaw;
    obj.updateMatrixWorld(true);
    // 발이 땅(0)에, 가운데가 x=0, 키 1.6
    const box = new THREE.Box3().setFromObject(obj);
    const s = 1.6 / (box.max.y - box.min.y || 1.6);
    obj.scale.setScalar(s);
    const box2 = new THREE.Box3().setFromObject(obj);
    obj.position.x -= (box2.max.x + box2.min.x) / 2;
    obj.position.z -= (box2.max.z + box2.min.z) / 2;
    obj.position.y -= box2.min.y;
    return { obj, bones, rest, mats };
  } catch {
    return null;
  }
}

function ensureModel(B: Base, id: CharId) {
  let p = modelPromises.get(id);
  if (!p) {
    p = loadModel(B, id).then((m) => {
      models.set(id, m);
      return m;
    });
    modelPromises.set(id, p);
  }
  return p;
}

// ── 번개 ──
type Pt = { x: number; y: number };
function boltPath(a: Pt, b: Pt, rough: number, depth = 6): Pt[] {
  let pts = [a, b];
  let off = rough;
  for (let d = 0; d < depth; d++) {
    const next: Pt[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const nx = -(q.y - p.y);
      const ny = q.x - p.x;
      const len = Math.hypot(nx, ny) || 1;
      const k = (Math.random() - 0.5) * off;
      next.push({ x: (p.x + q.x) / 2 + (nx / len) * k, y: (p.y + q.y) / 2 + (ny / len) * k }, q);
    }
    pts = next;
    off *= 0.55;
  }
  return pts;
}
function strokeBolt(g: CanvasRenderingContext2D, pts: Pt[], w: number, alpha: number, rgb: [number, number, number]) {
  const [r, gg, b] = rgb;
  g.save();
  g.globalAlpha = alpha;
  g.lineJoin = "round";
  g.lineCap = "round";
  const path = () => {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) g.lineTo(p.x, p.y);
  };
  g.shadowColor = `rgb(${r},${gg},${b})`;
  g.shadowBlur = w * 6;
  g.strokeStyle = `rgba(${r},${gg},${b},0.6)`;
  g.lineWidth = w * 4;
  path();
  g.stroke();
  g.shadowBlur = w * 3;
  g.strokeStyle = `rgba(${Math.min(255, r + 60)},${Math.min(255, gg + 60)},${Math.min(255, b + 60)},0.95)`;
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
type Spark = { x: number; y: number; tx: number; ty: number; life: number; born: number };
type Bit = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; born: number; life: number; ch: string; size: number };

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

// ── 캐릭터별 자세 ──
// arm: [바깥쪽, 위, 앞] 방향(바깥쪽은 좌우 팔마다 알아서 뒤집는다). w: 팔을 얼마나 그 방향으로.
type Dir = [number, number, number];
type Pose = {
  arm?: (sign: number) => Dir;
  fore?: (sign: number) => Dir;
  w: number;
  stretch: number; // 짧은 팔을 만화처럼 늘이기
  spineX: number; // + 앞으로 숙임
  spineZ: number;
  headX: number; // - 고개 들기
  headZ: number;
  hipsY: number; // 엉덩이 좌우 돌리기
  crouch: number;
  dx: number; // 몸 전체 좌우(화면 단위: 키 1.6 기준)
  dy: number; // 몸 전체 위로
  rotY: number;
  chest: number; // 가슴 부풀리기(비율)
};
type PoseIn = { id: CharId; ph: "summon" | "corner" | "cheer" | "leave"; t: number; ch: number; now: number; ct: number };
function poseOf({ id, ph, t, ch, now, ct }: PoseIn): Pose {
  const p: Pose = { w: 0, stretch: 1, spineX: 0, spineZ: 0, headX: 0, headZ: 0, hipsY: 0, crouch: 0, dx: 0, dy: 0, rotY: 0, chest: 1 };
  const s = now / 1000;
  const raise = ph === "summon" ? smooth((t - RISE - 0.1) / (RAISE - RISE - 0.1)) : 0;
  const burstK = ph === "summon" && t > BURST ? Math.sin(clamp01((t - BURST) / 0.45) * Math.PI) : 0; // 터질 때 펄쩍
  const afterBurst = ph === "summon" && t > BURST + 0.45 ? 1 - smooth((t - BURST - 0.45) / 0.35) : 1;
  const hop = (period: number, h: number) => Math.abs(Math.sin((s * Math.PI) / period)) * h;
  const dip = ph === "summon" ? smooth((t - RISE) / 0.18) * (1 - smooth((t - RISE - 0.18) / 0.2)) : 0; // 예비동작 움찔
  p.crouch = dip * 0.6 + burstK * 0.7;
  p.dy = burstK * 0.35;

  if (id === "ferret") {
    if (ph === "summon") {
      const r = raise * afterBurst;
      p.arm = () => [0.5 - ch * 0.18 + (Math.random() - 0.5) * ch * 0.12, 1, 0.12];
      p.w = r;
      p.stretch = 1 + 0.45 * r;
      p.headX = -raise * 0.3;
      p.spineX = -raise * 0.08;
    } else if (ph === "cheer") {
      p.arm = () => [0.5, 1, 0.1];
      p.w = 1;
      p.stretch = 1.4;
      p.dy = hop(0.31, 0.3);
    } else {
      p.arm = () => [1, 0.2, 0.3];
      p.w = 0.15 + Math.sin(s * 2) * 0.05;
    }
  } else if (id === "squirrel") {
    // 앞발을 가슴 앞에서 싹싹 비벼 도토리 힘을 모은다 → 펄쩍
    if (ph === "summon") {
      const rub = Math.sin(s * 28) * (0.25 + ch * 0.25);
      p.arm = () => [0.35, 0.15, 1];
      p.fore = (sg) => [-0.55 + rub * sg, 0.45, 0.8];
      p.w = raise * afterBurst;
      p.dy += hop(0.18, 0.04 + ch * 0.05) * raise;
      p.headZ = Math.sin(s * 9) * 0.06 * ch;
      if (t > BURST) {
        p.arm = () => [0.6, 1, 0.2];
        p.fore = undefined;
        p.w = afterBurst;
        p.stretch = 1.3;
      }
    } else if (ph === "cheer") {
      p.arm = () => [0.6, 1, 0.2];
      p.w = 1;
      p.stretch = 1.3;
      p.dy = hop(0.2, 0.32);
      p.headZ = Math.sin(s * 14) * 0.15;
    } else {
      p.arm = () => [0.3, 0.1, 1];
      p.fore = () => [-0.5, 0.4, 0.8];
      p.w = 0.8;
      p.headZ = Math.floor(s * 2.5) % 3 === 0 ? 0.18 : -0.05; // 고개 갸웃갸웃
      p.dy = Math.sin(s * 1.5) > 0.95 ? 0.06 : 0;
    }
  } else if (id === "shiba") {
    // 몸을 낮추고 엉덩이(꼬리)를 신나게 흔들며 기를 모은다 → 고개 들고 "왕!"
    if (ph === "summon") {
      p.crouch += raise * 0.5 * afterBurst;
      p.hipsY = Math.sin(s * 18) * (0.18 + ch * 0.25) * raise;
      p.headZ = Math.sin(s * 3.5) * 0.28 * raise;
      p.arm = () => [0.35, -0.55, 0.7];
      p.w = raise * 0.8;
      if (t > BURST) {
        p.headX = -0.28 * afterBurst;
        p.arm = () => [0.5, 0.5, 1];
        p.w = afterBurst;
        p.stretch = 1.25;
        p.headZ = 0;
      }
    } else if (ph === "cheer") {
      p.rotY = ct * 7; // 빙글빙글
      p.dy = hop(0.25, 0.25);
      p.arm = () => [0.6, 0.8, 0.4];
      p.w = 1;
      p.stretch = 1.2;
    } else {
      p.hipsY = Math.sin(s * 12) * 0.15;
      p.headZ = Math.sin(s * 1.6) * 0.22;
    }
  } else if (id === "roach") {
    // 사사삭! 좌우로 허둥지둥 움직이며 팔을 마구 흔든다 → 팔 활짝
    if (ph === "summon") {
      const k = 0.4 + ch;
      p.dx = Math.sin(s * 22) * 0.05 * k * raise;
      p.spineZ = Math.sin(s * 31) * 0.08 * k;
      p.headZ = (Math.random() - 0.5) * 0.15 * k;
      p.arm = (sg) => [0.7 + Math.sin(s * 19 + sg) * 0.6, Math.sin(s * 23 * sg) * 0.9, 0.5];
      p.w = raise;
      p.stretch = 1.15;
      if (t > BURST) {
        p.arm = () => [1, 0.85, 0.2];
        p.w = afterBurst;
        p.stretch = 1.35;
      }
    } else if (ph === "cheer") {
      p.dx = Math.sin(ct * 14) * 0.12;
      p.arm = (sg) => [0.6, Math.sin(ct * 16 + sg * 1.6) > 0 ? 1 : 0.2, 0.3];
      p.w = 1;
      p.stretch = 1.3;
      p.dy = hop(0.15, 0.12);
    } else {
      p.dx = Math.sin(s * 9) * 0.015;
      p.headZ = (Math.random() - 0.5) * 0.06;
    }
  } else if (id === "pigeon") {
    // 구구구… 고개를 앞뒤로 까딱이며 가슴을 부풀리고 날개를 퍼덕인다 → 날개 활짝
    if (ph === "summon") {
      p.spineX = Math.sin(s * 9) * 0.14 * raise;
      p.headX = Math.sin(s * 9 + 0.6) * 0.25 * raise;
      p.chest = 1 + 0.12 * ch;
      const flap = Math.sin(s * (10 + ch * 14));
      p.arm = () => [1, 0.15 + flap * (0.35 + ch * 0.5), 0.05];
      p.w = raise;
      p.stretch = 1.15 + ch * 0.15;
      if (t > BURST) {
        p.arm = () => [0.7, 1, 0];
        p.w = afterBurst;
        p.stretch = 1.4;
      }
    } else if (ph === "cheer") {
      const flap = Math.sin(ct * 26);
      p.arm = () => [1, 0.3 + flap * 0.8, 0];
      p.w = 1;
      p.stretch = 1.35;
      p.dy = hop(0.22, 0.28);
      p.chest = 1.1;
    } else {
      p.spineX = Math.sin(s * 5) * 0.08;
      p.headX = Math.sin(s * 5 + 0.6) * 0.18; // 걸으며 고개 까딱
      p.dx = Math.sin(s * 1.2) * 0.04;
    }
  }
  return p;
}

export const Summon = forwardRef<SummonHandle, { sfx: Sfx; onShake: (power: number) => void }>(function Summon(
  { sfx, onShake },
  ref
) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLDivElement>(null); // 어두운 하늘 — 캐릭터 '뒤'에 깐다
  const fxRef = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(false);
  const baseRef = useRef<Base | null>(null);
  const state = useRef({
    t0: 0,
    char: "ferret" as CharId,
    shown: null as CharId | null, // 지금 장면에 올라간 모델
    phase: "idle" as "idle" | "summon" | "corner" | "cheer" | "leave",
    exit: { kind: "dash", dir: 1, tx: 1, ty: 0 } as ExitCfg,
    lastExit: null as ExitKind | null,
    exitFx: false,
    cheerAt: 0,
    leaveAt: 0,
    burstDone: true,
    onBurst: null as null | (() => void),
    bolts: [] as Bolt[],
    sparks: [] as Spark[],
    bits: [] as Bit[],
    flash: 0,
    charge: null as null | { stop: (f?: number) => void },
    raf: 0,
    lastSky: 0,
    freeze: null as number | null,
  });
  useEffect(() => {
    (window as unknown as { __summon?: unknown }).__summon = { baseRef, state, models }; // 점검용
  }, []);
  const sfxRef = useRef(sfx);
  sfxRef.current = sfx;
  const shakeRef = useRef(onShake);
  shakeRef.current = onShake;

  const getBase = useCallback(() => {
    if (!basePromise && glRef.current) basePromise = loadBase(glRef.current);
    return basePromise?.then((b) => (baseRef.current = b)) ?? Promise.resolve(null);
  }, []);
  const preload = useCallback(
    (ids: CharId[]) => {
      ids.forEach(getFlat);
      void getBase().then(async (B) => {
        if (!B) return;
        for (const id of ids) await ensureModel(B, id); // 하나씩(동시에 받으면 첫 화면이 버벅임)
      });
    },
    [getBase]
  );

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
    const C = CHARS[S.char];
    const B = baseRef.current;
    const M = models.get(S.char) ?? null;

    const away = 0; // 구석으로 가지 않고, 그 자리에서 사라지는 동작을 한다
    const exE = S.phase === "summon" ? (t - EXIT0) / EXIT_DUR[S.exit.kind] : 1;
    const X = exE > 0 ? exitPose(S.exit, exE, now) : null;
    const charge = S.phase === "summon" ? clamp01((t - RAISE) / (BURST - RAISE)) : 0;
    const rise = S.phase === "summon" ? easeOutBack(t / RISE) : 1;
    const cheerT = S.phase === "cheer" ? (now - S.cheerAt) / 1000 : -1;
    const leave = S.phase === "leave" ? smooth((now - S.leaveAt) / 400) : 0;
    const dark = S.phase === "summon" ? Math.min(smooth(t / 0.3), 1 - smooth((t - BURST - 0.1) / 0.5)) : 0;
    if (bgRef.current) bgRef.current.style.opacity = dark.toFixed(3);
    const ph = S.phase === "idle" ? "corner" : S.phase;
    const P = poseOf({ id: S.char, ph, t, ch: charge, now, ct: Math.max(0, cheerT) });
    if (X) {
      P.crouch += X.crouch;
      P.dy = 0;
      if (X.arms === "up") {
        P.arm = () => [0.55, 1, 0.1];
        P.fore = undefined;
        P.w = 1;
        P.stretch = 1.25;
      } else if (X.arms === "back") {
        P.arm = () => [0.25, -0.5, -0.8];
        P.fore = undefined;
        P.w = 1;
        P.stretch = 1;
      } else if (X.arms === "flail") {
        P.arm = (sg) => [0.7, Math.sin(now / 40 + sg * 1.6) > 0 ? 0.9 : -0.2, 0.3];
        P.fore = undefined;
        P.w = 1;
        P.stretch = 1.15;
      }
    }
    const tremble = S.phase === "summon" && t < BURST + 0.1 ? charge * charge : 0;
    const orb = S.phase === "summon" ? smooth((t - RAISE + 0.25) / 0.4) * (1 - smooth((t - BURST - 0.3) / 0.4)) : 0;
    const zapGlow = S.phase === "summon" ? Math.max(0, 1 - Math.abs(t - BURST - 0.05) / 0.25) : 0;

    let feet: Pt | null = null;
    let pawL: Pt | null = null;
    let pawR: Pt | null = null;
    if (B && M) {
      const { THREE, renderer, scene, camera, root } = B;
      if (S.shown !== S.char) {
        root.clear();
        root.add(M.obj);
        S.shown = S.char;
      }
      if (gl.width !== Math.round(W * dpr) || gl.height !== Math.round(H * dpr)) {
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
      }
      camera.position.set(0, 1.0, 6.2 - charge * 0.9);
      camera.lookAt(0, 1.0, 0);
      camera.updateMatrixWorld();
      const vH = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      const vW = vH * camera.aspect;
      const big = Math.min(1.2, (vH * 0.7) / 1.6);
      const small = Math.min(0.55, (vH * 0.3) / 1.6);
      const sc = big + (small - big) * away;
      const cx = (-vW / 2 + small * 1.6 * 0.45 + vW * 0.03) * away;
      const baseY = 1.0 - vH / 2;
      const y = baseY - 1.6 * sc * (1 - rise) * 1.1 + P.dy * 1.6 * sc - leave * 1.6 * sc * 1.3;
      const tr = tremble * 0.035;
      const exX = X ? X.x * (vW / 2 + 1.6 * sc * 0.6) : 0;
      const exY = X ? X.y * vH : 0;
      root.position.set(cx + exX + P.dx * 1.6 * sc + (Math.random() - 0.5) * tr, y + exY + (Math.random() - 0.5) * tr * 0.5, 0);
      root.scale.setScalar(sc * (X ? X.s : 1));
      root.rotation.y = -0.18 * away + Math.sin(now / 900) * 0.04 + P.rotY + (X ? X.rotY : 0);
      root.rotation.z = X ? X.rotZ : 0;
      root.visible = !X?.hide;

      // 뼈: 쉬는 자세에서 시작해 조준
      const { bones, rest } = M;
      for (const [b, r] of rest) {
        b.quaternion.copy(r.q);
        b.scale.copy(r.s);
      }
      root.updateMatrixWorld(true);
      const tmpA = new THREE.Vector3();
      const tmpB = new THREE.Vector3();
      const qW = new THREE.Quaternion();
      const qP = new THREE.Quaternion();
      const qD = new THREE.Quaternion();
      const ID = new THREE.Quaternion();
      const aim = (bone: THREE_NS.Bone | undefined, child: THREE_NS.Bone | undefined, dir: THREE_NS.Vector3, w: number) => {
        if (!bone || !child || w <= 0) return;
        bone.getWorldPosition(tmpA);
        child.getWorldPosition(tmpB);
        qD.setFromUnitVectors(tmpB.sub(tmpA).normalize(), dir.clone().normalize());
        qD.slerp(ID, 1 - Math.min(1, w));
        bone.getWorldQuaternion(qW);
        qW.premultiply(qD);
        (bone.parent as THREE_NS.Object3D).getWorldQuaternion(qP);
        bone.quaternion.copy(qP.invert().multiply(qW));
        bone.updateMatrixWorld(true);
      };
      // 캐릭터 기준 축(몸이 돌아도 따라감)
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion);
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(root.quaternion);
      const turn = (bone: THREE_NS.Bone | undefined, axis: THREE_NS.Vector3, ang: number) => {
        if (!bone || !ang) return;
        bone.getWorldQuaternion(qW);
        qW.premultiply(qD.setFromAxisAngle(axis, ang));
        (bone.parent as THREE_NS.Object3D).getWorldQuaternion(qP);
        bone.quaternion.copy(qP.invert().multiply(qW));
        bone.updateMatrixWorld(true);
      };
      const UP = new THREE.Vector3(0, 1, 0);
      turn(bones["Hips"], UP, P.hipsY);
      turn(bones["Spine"], side, P.spineX - P.crouch * 0.2);
      turn(bones["Spine"], fwd, P.spineZ);
      if (P.chest !== 1) bones["Spine2"]?.scale.multiplyScalar(P.chest);
      turn(bones["Head"], side, P.headX);
      turn(bones["Head"], fwd, P.headZ);
      for (const nm of ["Left", "Right"]) {
        const arm = bones[`${nm}Arm`];
        const fore = bones[`${nm}ForeArm`];
        const hand = bones[`${nm}Hand`];
        if (arm && P.arm && P.w > 0) {
          arm.getWorldPosition(tmpA);
          const sg = tmpA.clone().sub(root.position).dot(side) >= 0 ? 1 : -1;
          const toW = (d: Dir) => side.clone().multiplyScalar(d[0] * sg).add(UP.clone().multiplyScalar(d[1])).add(fwd.clone().multiplyScalar(d[2]));
          const st = 1 + (P.stretch - 1) * Math.min(1, P.w);
          arm.scale.y *= st;
          fore?.scale.set(fore.scale.x, fore.scale.y * st, fore.scale.z);
          hand?.scale.set(hand.scale.x, hand.scale.y / st, hand.scale.z);
          const da = toW(P.arm(sg));
          aim(arm, fore, da, P.w);
          aim(fore, hand, P.fore ? toW(P.fore(sg)) : da, P.w);
        }
        const runA = X?.run ? Math.sin(now / 38 + (nm === "Left" ? 0 : Math.PI)) * 0.9 : 0;
        turn(bones[`${nm}UpLeg`], side, -P.crouch * 0.35 + runA);
        turn(bones[`${nm}Leg`], side, P.crouch * 0.6);
      }
      const proj = (b: THREE_NS.Bone | undefined): Pt | null => {
        if (!b) return null;
        const v = b.getWorldPosition(new THREE.Vector3()).project(camera);
        return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
      };
      feet = proj(bones["Hips"]);
      if (feet) feet.y += H * 0.18 * sc;
      pawL = proj(bones["LeftHand"]);
      pawR = proj(bones["RightHand"]);
      const col = new THREE.Color(`rgb(${C.rgb.join(",")})`);
      for (const [sp, nm] of [
        [B.glowL, "LeftHand"],
        [B.glowR, "RightHand"],
      ] as const) {
        const b = bones[nm];
        sp.visible = !!b && orb > 0.01;
        if (b) b.getWorldPosition(sp.position);
        sp.material.color.copy(col);
        sp.material.opacity = orb;
        sp.scale.setScalar((0.3 + charge * 0.7 + Math.random() * 0.08) * sc * orb);
      }
      B.aura.visible = orb > 0.01;
      B.aura.material.color.copy(col);
      B.aura.position.set(root.position.x, root.position.y + 0.9 * sc, -0.8 * sc);
      B.aura.material.opacity = orb * (0.2 + charge * 0.4);
      B.aura.scale.setScalar((1.6 + charge * 1.2 + Math.sin(now / 60) * 0.06) * sc);
      for (const m of M.mats) m.emissive.copy(col).multiplyScalar(0.14 * zapGlow); // 번쩍일 때 살짝만(하얗게 바래지 않게)
      B.zap.color.copy(col);
      B.zap.intensity = charge * 2 + zapGlow * 10;
      renderer.render(scene, camera);
    } else {
      // 3D를 못 쓸 때(또는 아직 못 받았을 때): 같은 캐릭터 그림을 2D로
      if (B && S.shown) {
        B.root.clear();
        S.shown = null;
        B.renderer.clear();
      }
      const img = getFlat(S.char);
      const bigH = H * 0.66;
      const smallH = H * 0.28;
      const h = (bigH + (smallH - bigH) * away) * (X ? X.s : 1);
      const cx = W / 2 + (smallH * 0.55 + W * 0.02 - W / 2) * away + P.dx * h + (X ? X.x * (W / 2 + h * 0.6) : 0);
      const bottom = H + h * 0.06 + h * (1 - rise) * 1.1 + leave * h * 1.3 - P.dy * h * 0.6 - (X ? X.y * H : 0) + (X ? X.crouch * h * 0.05 : 0);
      const tr = tremble * 10;
      const x = cx - h / 2 + (Math.random() - 0.5) * tr;
      const y = bottom - h + (Math.random() - 0.5) * tr * 0.5;
      if (orb > 0.01) {
        const gr = g.createRadialGradient(cx, y + h * 0.5, 0, cx, y + h * 0.5, h * (0.55 + charge * 0.3));
        gr.addColorStop(0, `rgba(${C.rgb.join(",")},${0.5 * orb})`);
        gr.addColorStop(1, `rgba(${C.rgb.join(",")},0)`);
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
      }
      feet = { x: cx, y: bottom - h * 0.05 };
      if (img?.complete && img.naturalWidth && !X?.hide) {
        g.save();
        g.translate(cx, y + h);
        const rY = P.rotY + (X ? X.rotY : 0);
        g.rotate(P.spineZ * 0.6 + P.headZ * 0.3 + (rY ? Math.sin(rY) * 0.15 : 0) + (X ? X.rotZ : 0));
        if (rY) g.scale(Math.cos(rY) || 0.05, 1); // 도는 동작: 가로로 납작해졌다 뒤집힘
        if (X?.run) g.translate(0, -Math.abs(Math.sin(now / 45)) * h * 0.04);
        if (zapGlow > 0) g.filter = `brightness(${1 + zapGlow * 0.8})`;
        g.drawImage(img, -h / 2, -h, h, h);
        g.restore();
      }
      pawL = { x: x + h * 0.25, y: y + h * 0.58 };
      pawR = { x: x + h * 0.75, y: y + h * 0.58 };
    }

    // ── 2D 효과 ──
    const rgb = C.rgb;
    if (S.phase === "summon") {
      if (t > 0.4 && t < BURST && now - S.lastSky > 260 - charge * 160 && Math.random() < 0.5) {
        S.lastSky = now;
        const x = Math.random() * W;
        S.bolts.push(makeBolt({ x, y: -10 }, { x: x + (Math.random() - 0.5) * W * 0.3, y: H * (0.25 + Math.random() * 0.3) }, 1.2 + charge, now, 140));
        S.flash = Math.max(S.flash, 0.12 + charge * 0.15);
      }
      if (pawL && pawR && t > RAISE - 0.2 && t < BURST) {
        const n = 2 + Math.floor(charge * 6);
        for (let i = 0; i < n; i++) {
          const target = Math.random() < 0.5 ? pawL : pawR;
          const ang = Math.random() * Math.PI * 2;
          const dist = 160 + Math.random() * Math.max(W, H) * 0.35;
          S.sparks.push({ x: target.x + Math.cos(ang) * dist, y: target.y + Math.sin(ang) * dist, tx: target.x, ty: target.y, life: 420 + Math.random() * 300, born: now });
        }
      }
      if (!S.burstDone && t >= BURST) {
        S.burstDone = true;
        const mid = pawL && pawR ? { x: (pawL.x + pawR.x) / 2, y: Math.min(pawL.y, pawR.y) } : { x: W / 2, y: H / 2 };
        for (let k = 0; k < 3; k++)
          S.bolts.push(makeBolt({ x: mid.x + (Math.random() - 0.5) * 120, y: -20 }, { x: mid.x + (k - 1) * 14, y: mid.y }, 4.5 - k, now + k * 70, 520 - k * 80));
        if (pawL) S.bolts.push(makeBolt({ x: pawL.x - 60, y: -20 }, pawL, 2.6, now + 40, 380));
        if (pawR) S.bolts.push(makeBolt({ x: pawR.x + 60, y: -20 }, pawR, 2.6, now + 90, 380));
        // 캐릭터 조각이 사방으로 튄다(도토리·뼈다귀·먼지·깃털)
        for (let i = 0; i < 26; i++) {
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
          const sp = 380 + Math.random() * 520;
          S.bits.push({
            x: mid.x, y: mid.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
            born: now, life: 1100 + Math.random() * 700, ch: C.bits[i % C.bits.length], size: 26 + Math.random() * 30,
          });
        }
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
      if (t > BURST && t < BURST + 0.55 && pawL && pawR && Math.random() < 0.35) {
        const src = Math.random() < 0.5 ? pawL : pawR;
        const ang = Math.random() * Math.PI * 2;
        const L = 60 + Math.random() * 140;
        S.bolts.push(makeBolt(src, { x: src.x + Math.cos(ang) * L, y: src.y + Math.sin(ang) * L }, 1.4, now, 120));
      }
    }
    if (X && feet && !X.hide) {
      const k = S.exit.kind;
      if ((k === "dash" || k === "zigzag" || k === "dig") && Math.random() < 0.6)
        S.bits.push({
          x: feet.x + (Math.random() - 0.5) * 40, y: feet.y, vx: -S.exit.dir * (60 + Math.random() * 120), vy: -80 - Math.random() * 120,
          rot: 0, vr: (Math.random() - 0.5) * 4, born: now, life: 500, ch: k === "dig" ? "🟫" : "💨", size: 26 + Math.random() * 20,
        });
    }
    if (X && !S.exitFx && feet) {
      const k = S.exit.kind;
      const fire = (k === "pop" && exE > 0.95) || (k === "zap" && exE > 0.25) || (k === "jump" && exE > 0.25) || (k === "dig" && exE > 0.3);
      if (fire) {
        S.exitFx = true;
        const at = k === "pop" ? { x: feet.x, y: feet.y - H * 0.3 } : feet;
        const ch = k === "pop" ? "✨" : k === "zap" ? "⚡" : k === "jump" ? "💨" : "🟫";
        for (let i = 0; i < 12; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 200 + Math.random() * 300;
          S.bits.push({ x: at.x, y: at.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 200, rot: 0, vr: (Math.random() - 0.5) * 8, born: now, life: 700, ch, size: 24 + Math.random() * 22 });
        }
        if (k === "zap") {
          S.bolts.push(makeBolt({ x: at.x + 30, y: -20 }, { x: at.x, y: at.y - H * 0.3 }, 3.5, now, 300));
          S.flash = Math.max(S.flash, 0.35);
          sfxRef.current("zap", 0.5);
        }
      }
    }
    g.save();
    g.globalCompositeOperation = "lighter";
    S.sparks = S.sparks.filter((p) => {
      const k = (now - p.born) / p.life;
      if (k >= 1) return false;
      const e = k * k;
      const x = p.x + (p.tx - p.x) * e;
      const y = p.y + (p.ty - p.y) * e;
      const r = 1.5 + (1 - k) * 3;
      g.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.4 + k * 0.6})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      return true;
    });
    g.restore();
    S.bolts = S.bolts.filter((b) => {
      const k = (now - b.born) / b.life;
      if (k < 0) return true;
      if (k >= 1) return false;
      const flick = k < 0.15 ? 1 : Math.random() < 0.7 ? 1 - k : 0.25;
      strokeBolt(g, b.pts, b.w, flick, rgb);
      for (const br of b.branches) strokeBolt(g, br, b.w * 0.45, flick * 0.8, rgb);
      return true;
    });
    // 튀는 조각(중력)
    if (S.bits.length) {
      g.save();
      g.textAlign = "center";
      g.textBaseline = "middle";
      S.bits = S.bits.filter((b) => {
        const age = (now - b.born) / 1000;
        if (age * 1000 >= b.life) return false;
        const x = b.x + b.vx * age;
        const y = b.y + b.vy * age + 900 * age * age;
        g.globalAlpha = 1 - clamp01((age * 1000 - b.life + 300) / 300);
        g.save();
        g.translate(x, y);
        g.rotate(b.rot + b.vr * age);
        g.font = `${b.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        g.fillText(b.ch, 0, 0);
        g.restore();
        return true;
      });
      g.restore();
    }
    if (S.flash > 0.01) {
      g.fillStyle = `rgba(235,235,255,${S.flash * 0.85})`;
      g.fillRect(0, 0, W, H);
      S.flash *= 0.86;
    }
    // 글자(브롤스타즈 느낌: 굵은 테두리 + 노란 글씨)
    if (S.phase === "summon" && t > RISE && t < BURST + 0.5) {
      const bigTxt = t >= BURST;
      const txt = bigTxt ? C.burst : `${C.emoji} ${C.charge}${".".repeat(1 + (Math.floor(t * 4) % 3))}`;
      const size = bigTxt ? Math.min(96, W * 0.085) : Math.min(46, W * 0.045);
      g.save();
      g.font = `900 ${size}px system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
      g.textAlign = "center";
      g.lineJoin = "round";
      g.lineWidth = size * 0.22;
      g.strokeStyle = "#15121f";
      g.fillStyle = bigTxt ? "#ffe14d" : "#ffffff";
      const yy = H * (bigTxt ? 0.2 : 0.14) + size / 2;
      const j = bigTxt ? (Math.random() - 0.5) * 6 : 0;
      g.strokeText(txt, W / 2 + j, yy + j);
      g.fillText(txt, W / 2 + j, yy + j);
      g.restore();
    }

    if (S.phase === "summon" && exE >= 1) {
      S.phase = "leave";
      S.leaveAt = now - 400; // 이미 사라졌으니 남은 조각만 끝나면 정리
    }
    if (S.phase === "corner" && now >= S.leaveAt) S.phase = "leave";
    if (S.phase === "cheer" && now - S.cheerAt > 2600) {
      S.phase = "leave";
      S.leaveAt = now;
    }
    if (S.phase === "leave" && now - S.leaveAt > 450 && S.bolts.length === 0 && S.bits.length === 0) {
      S.phase = "idle";
      S.raf = 0;
      g.clearRect(0, 0, W, H);
      baseRef.current?.renderer.clear();
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
      preload,
      play: (onBurst, char) => {
        const S = state.current;
        if (S.phase === "summon") return;
        setOn(true);
        getFlat(char);
        const begin = () => {
          S.char = char;
          S.t0 = performance.now();
          S.phase = "summon";
          const pool = EXITS.filter((k) => k !== S.lastExit);
          const kind = pool[Math.floor(Math.random() * pool.length)];
          const dir = Math.random() < 0.5 ? -1 : 1;
          S.exit = { kind, dir, tx: dir, ty: Math.random() < 0.5 ? 0.6 : -0.15 };
          S.lastExit = kind;
          S.exitFx = false;
          S.burstDone = false;
          S.onBurst = onBurst;
          S.bolts = [];
          S.sparks = [];
          S.bits = [];
          S.flash = 0;
          S.charge?.stop();
          S.charge = sfxRef.current("charge", 0.9);
          start();
        };
        // 모델이 아직이면 아주 잠깐(최대 0.8초)만 기다리고, 못 오면 그림으로 시작(받아지면 그때부터 3D)
        if (models.has(char)) return begin();
        let done = false;
        const go = () => {
          if (done) return;
          done = true;
          begin();
        };
        void getBase().then((B) => (B ? ensureModel(B, char) : null)).then(go);
        setTimeout(go, 800);
      },
      cheer: () => {
        const S = state.current;
        if (S.phase === "corner") {
          S.phase = "cheer";
          S.cheerAt = performance.now();
          start();
        }
      },
    }),
    [start, preload, getBase]
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
