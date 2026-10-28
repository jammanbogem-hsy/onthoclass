// 잼만보 낚시터 — Three.js 2.5D 낚시 게임
// 보글보글 거품(등급·가짜)에 낚싯대를 던지고, 걸리면 방향키 콤보로 끌어올린다.
// 물고기·낚시꾼 모델은 Tripo. 물고기 동작은 정점 셰이더로 몸을 휜다(종마다 뼈 구성이 달라서).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (k, dt) => Math.min(1, dt * k);

// ------------------------------------------------------------------ 물고기 도감
// notes: 눌러야 할 방향키 수, win: 한 칸 제한 시간(초), mash: 연타 구간 수(마지막 끌어올리기 포함), zig: 좌우 버티기 구간 수
// water: fresh(민물) / sea(바다), disp: 화면 속 길이, len: 실제 크기(cm)
const T_COMMON = { notes: 6, win: 1.35, mash: 0, zig: 0 }, T_NORMAL = { notes: 9, win: 1.1, mash: 1, zig: 0 };
const T_RARE = { notes: 11, win: .95, mash: 1, zig: 1 }, T_LEGEND = { notes: 15, win: .8, mash: 2, zig: 2 };
const SPECIES = {
  // 민물
  boot:      { water: "fresh", name: "낡은 장화",  tier: "꽝",   points: 0,   disp: 0.42, len: [24, 30],   notes: 3, win: 1.6, mash: 0, zig: 0 },
  minnow:    { water: "fresh", name: "송사리",    tier: "흔함", points: 10,  disp: 0.6,  len: [3, 6],     ...T_COMMON, notes: 5, win: 1.4 },
  pirami:    { water: "fresh", name: "피라미",    tier: "흔함", points: 14,  disp: 0.7,  len: [8, 16],    ...T_COMMON },
  crucian:   { water: "fresh", name: "붕어",      tier: "흔함", points: 20,  disp: 0.95, len: [15, 32],   ...T_COMMON, notes: 7, win: 1.25 },
  bluegill:  { water: "fresh", name: "블루길",    tier: "흔함", points: 22,  disp: 0.8,  len: [10, 25],   ...T_COMMON, notes: 7, win: 1.25 },
  carp:      { water: "fresh", name: "잉어",      tier: "보통", points: 45,  disp: 1.4,  len: [40, 85],   ...T_NORMAL },
  bass:      { water: "fresh", name: "배스",      tier: "보통", points: 50,  disp: 1.2,  len: [25, 60],   ...T_NORMAL },
  trout:     { water: "fresh", name: "송어",      tier: "보통", points: 55,  disp: 1.2,  len: [25, 60],   ...T_NORMAL, zig: 1 },
  catfish:   { water: "fresh", name: "메기",      tier: "희귀", points: 80,  disp: 1.7,  len: [45, 110],  ...T_RARE },
  eel:       { water: "fresh", name: "뱀장어",    tier: "희귀", points: 90,  disp: 1.9,  len: [40, 100],  ...T_RARE, zig: 2 },
  mandarin:  { water: "fresh", name: "쏘가리",    tier: "희귀", points: 95,  disp: 1.2,  len: [25, 55],   ...T_RARE, notes: 12, win: .9 },
  snakehead: { water: "fresh", name: "가물치",    tier: "희귀", points: 100, disp: 1.6,  len: [40, 90],   ...T_RARE, notes: 12, win: .9 },
  sturgeon:  { water: "fresh", name: "철갑상어",  tier: "전설", points: 220, disp: 2.4,  len: [100, 190], ...T_LEGEND },
  goldkoi:   { water: "fresh", name: "황금 잉어", tier: "전설", points: 320, disp: 1.7,  len: [60, 95],   ...T_LEGEND, notes: 16, win: .75 },
  // 바다
  can:       { water: "sea", name: "녹슨 깡통",   tier: "꽝",   points: 0,   disp: 0.4,  len: [8, 12],    notes: 3, win: 1.6, mash: 0, zig: 0 },
  jack:      { water: "sea", name: "전갱이",      tier: "흔함", points: 14,  disp: 0.8,  len: [15, 35],   ...T_COMMON },
  mackerel:  { water: "sea", name: "고등어",      tier: "흔함", points: 18,  disp: 1.0,  len: [25, 45],   ...T_COMMON },
  rockfish:  { water: "sea", name: "우럭",        tier: "흔함", points: 25,  disp: 0.95, len: [20, 50],   ...T_COMMON, notes: 7, win: 1.25 },
  puffer:    { water: "sea", name: "복어",        tier: "보통", points: 45,  disp: 0.75, len: [15, 40],   ...T_NORMAL },
  cutlass:   { water: "sea", name: "갈치",        tier: "보통", points: 48,  disp: 2.2,  len: [60, 150],  ...T_NORMAL, zig: 1 },
  seabream:  { water: "sea", name: "참돔",        tier: "보통", points: 50,  disp: 1.2,  len: [30, 80],   ...T_NORMAL },
  flounder:  { water: "sea", name: "광어",        tier: "보통", points: 55,  disp: 1.2,  len: [35, 90],   ...T_NORMAL },
  yellowtail:{ water: "sea", name: "방어",        tier: "희귀", points: 100, disp: 1.8,  len: [60, 110],  ...T_RARE },
  sunfish:   { water: "sea", name: "개복치",      tier: "희귀", points: 120, disp: 1.8,  len: [100, 250], ...T_RARE, notes: 12, win: .9 },
  tuna:      { water: "sea", name: "참치",        tier: "전설", points: 250, disp: 2.4,  len: [120, 280], ...T_LEGEND },
  marlin:    { water: "sea", name: "청새치",      tier: "전설", points: 320, disp: 2.8,  len: [180, 400], ...T_LEGEND, notes: 16, win: .75 },
};
const TIER_ORDER = ["흔함", "보통", "희귀", "전설", "꽝"];
const TIER_COLOR = { "꽝": "#6b7280", "흔함": "#3f8f5a", "보통": "#2f7fc0", "희귀": "#8a4fd8", "전설": "#d79a12" };
const PLACES = {
  fresh: { name: "민물 낚시터", junk: "boot" },
  sea: { name: "바다 낚시터", junk: "can" },
};
let PLACE = "fresh";
const placeIds = (w = PLACE) => Object.keys(SPECIES).filter((id) => SPECIES[id].water === w).sort((a, b) => TIER_ORDER.indexOf(SPECIES[a].tier) - TIER_ORDER.indexOf(SPECIES[b].tier) || SPECIES[a].points - SPECIES[b].points);

// 거품 등급 — 색이 화려할수록 대물. 보라·금빛·무지개는 가끔 가짜(물결이 없다). table 은 등급별 확률(같은 등급 안에서는 고르게)
const SPOT_TYPES = {
  white:   { name: "잔거품",     color: "#ffffff", weight: 38, life: [18, 26], r: 1.0,  rate: 9,  table: { "꽝": 14, "흔함": 86 } },
  blue:    { name: "파란 거품",  color: "#4fc3ff", weight: 30, life: [16, 24], r: 1.1,  rate: 12, table: { "꽝": 5, "흔함": 36, "보통": 49, "희귀": 10 } },
  purple:  { name: "보라 거품",  color: "#b26bff", weight: 18, life: [14, 20], r: 1.2,  rate: 15, table: { "보통": 18, "희귀": 72, "전설": 10 }, fake: 0.3 },
  gold:    { name: "금빛 거품",  color: "#ffd23f", weight: 10, life: [11, 15], r: 1.3,  rate: 19, table: { "희귀": 14, "전설": 86 }, fake: 0.3 },
  rainbow: { name: "무지개 거품", color: "rainbow", weight: 4, life: [9, 12],  r: 1.45, rate: 26, table: { "전설": 100 }, fake: 0.3, bonus: 2 },
};
const FAKE_TABLE = { "꽝": 70, "흔함": 30 };
function pickSpecies(tierTable) {
  const tier = pick(tierTable), ids = placeIds().filter((id) => SPECIES[id].tier === tier);
  return ids[Math.floor(Math.random() * ids.length)];
}
function pick(table) {
  let sum = 0; for (const k in table) sum += table[k];
  let r = Math.random() * sum;
  for (const k in table) { r -= table[k]; if (r <= 0) return k; }
  return Object.keys(table)[0];
}

// ------------------------------------------------------------------ 렌더러·장면
const stage = $("stage");
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const SKY = new THREE.Color("#9fdcf0");
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 22, 42);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight("#f2fff8", "#4a6a44", 0.75));
const sun = new THREE.DirectionalLight("#fff0d0", 1.0); sun.position.set(-6, 10, 6); scene.add(sun);

const grad = new THREE.DataTexture(new Uint8Array([90, 165, 240]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: grad, ...extra });

function resize() {
  const w = innerWidth, h = innerHeight;
  // 화면 가로를 약 720픽셀로 그린 뒤 키워서 살짝 픽셀 느낌
  renderer.setPixelRatio(Math.min(1, 720 / Math.max(320, Math.min(w, h * 1.7))));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 58 : 40;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();

// ------------------------------------------------------------------ 물과 물가 (둥근 해안선)
const POND = { x: 0, z: -6.5, rx: 11, rz: 8.6 };
const shoreNoise = (a) => 1 + 0.07 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 5 + 2.4) + 0.03 * Math.sin(a * 9);
function pondPoint(a, k = 1) {
  const n = shoreNoise(a) * k;
  return new THREE.Vector2(POND.x + Math.cos(a) * POND.rx * n, POND.z + Math.sin(a) * POND.rz * n);
}
const DECK_Z = POND.z + POND.rz * shoreNoise(Math.PI / 2); // 연못 아래쪽 물가(바다에서는 해변 끝)
const pondGroup = new THREE.Group(), seaGroup = new THREE.Group();
scene.add(pondGroup, seaGroup);
const waterMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: 0 }, sea: { value: 0 } },
  vertexShader: "varying vec2 vP; void main(){ vec4 w = modelMatrix*vec4(position,1.); vP = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }",
  fragmentShader: `uniform float t; uniform float sea; varying vec2 vP;
    void main(){
      float w = sin(vP.x*1.6 + t*1.1) + sin(vP.y*2.1 - t*0.8) + sin((vP.x+vP.y)*1.05 + t*.55);
      vec3 c = mix(vec3(.10,.45,.58), vec3(.20,.62,.72), smoothstep(-1.,2.,w));
      float band = step(2.35, w + sin(vP.x*7.+t)*.15);
      c = mix(c, vec3(.85,.98,.95), band*.5);
      float d = length((vP - vec2(${POND.x.toFixed(1)}, ${POND.z.toFixed(1)})) / vec2(${POND.rx.toFixed(1)}, ${POND.rz.toFixed(1)}));
      vec3 pc = mix(c, vec3(.06,.28,.42), smoothstep(.75,.0,d)*.35);
      pc = mix(pc, vec3(.55,.85,.8), smoothstep(.8,1.0,d)*.45);
      // 바다: 더 짙은 파랑, 멀수록 깊고, 해변 쪽은 옥빛 + 밀려오는 흰 물결
      vec3 sc = mix(vec3(.05,.33,.62), vec3(.16,.55,.80), smoothstep(-1.,2.,w));
      sc = mix(sc, vec3(.85,.97,1.), band*.45);
      float shore = ${DECK_Z.toFixed(2)} - vP.y;
      sc = mix(sc, vec3(.03,.18,.42), smoothstep(6., 30., shore)*.6);
      sc = mix(sc, vec3(.35,.85,.82), smoothstep(5., .0, shore)*.55);
      float foam = step(.6, sin(shore*2.2 - t*1.6 + sin(vP.x*.7)*.8)) * smoothstep(3., .4, shore);
      sc = mix(sc, vec3(1.), foam*.6);
      c = mix(pc, sc, sea);
      gl_FragColor = vec4(c,1.);
      #include <colorspace_fragment>
    }`,
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 150), waterMat);
water.rotation.x = -Math.PI / 2; water.position.set(0, 0, -50); scene.add(water);

// 땅: 큰 판에 연못 모양 구멍을 뚫고, 모서리를 둥글게 깎아(베벨) 모래 물가가 보이게
{
  const outer = new THREE.Shape();
  outer.moveTo(-40, -40); outer.lineTo(40, -40); outer.lineTo(40, 30); outer.lineTo(-40, 30); outer.closePath();
  const hole = new THREE.Path();
  for (let i = 0; i <= 96; i++) { const p = pondPoint((i / 96) * Math.PI * 2, 1.0); i ? hole.lineTo(p.x, p.y) : hole.moveTo(p.x, p.y); }
  outer.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(outer, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.55, bevelSegments: 5, curveSegments: 12 });
  geo.rotateX(Math.PI / 2); // 위로 보이는 면 = 처음 면
  const land = new THREE.Mesh(geo, [toon("#7cc15a"), toon("#e2c98e")]);
  land.position.y = 0.32; pondGroup.add(land);
}
// 둥근 바위·덤불·부들·나무·꽃 (모두 둥근 도형)
const rock = (x, z, s) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), toon(Math.random() < .5 ? "#a9b3b8" : "#8f9aa1")); m.scale.set(s * rand(1, 1.5), s * rand(.55, .8), s * rand(.9, 1.3)); m.position.set(x, 0.15, z); m.rotation.y = rand(0, 3); pondGroup.add(m); };
const bush = (x, z, s) => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(rand(.45, .7) * s, 10, 8), toon(i % 2 ? "#4f9a3f" : "#5fb048")); b.position.set(rand(-.5, .5) * s, rand(.3, .6) * s, rand(-.3, .3) * s); g.add(b); } g.position.set(x, 0.55, z); pondGroup.add(g); };
const tree = (x, z, s) => {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.18 * s, .26 * s, 1.6 * s, 8), toon("#8a5a32")); trunk.position.y = .8 * s; g.add(trunk);
  for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(rand(.7, 1.0) * s, 10, 8), toon(i % 2 ? "#3f8f3a" : "#52a944")); c.position.set(rand(-.6, .6) * s, (1.8 + rand(0, .9)) * s, rand(-.5, .5) * s); g.add(c); }
  g.position.set(x, 0.6, z); pondGroup.add(g);
};
const cattail = (x, z) => { const h = rand(.8, 1.5); const st = new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, h, 5), toon("#8db04a")); st.position.set(x, h / 2 + .1, z); st.rotation.z = rand(-.15, .15); pondGroup.add(st); const top = new THREE.Mesh(new THREE.CapsuleGeometry(.07, .22, 3, 6), toon("#7a4a26")); top.position.set(x + st.rotation.z * -h / 2, h + .1, z); pondGroup.add(top); };
const flower = (x, z) => { const c = ["#ff8fb1", "#fff17a", "#ffffff", "#b38cff"][Math.floor(rand(0, 4))]; const f = new THREE.Mesh(new THREE.SphereGeometry(.09, 6, 5), toon(c)); f.position.set(x, .72, z); pondGroup.add(f); };
for (let i = 0; i < 64; i++) {
  const a = (i / 64) * Math.PI * 2 + rand(-.03, .03);
  if (Math.sin(a) > 0.82 && Math.abs(Math.cos(a)) < 0.3) continue; // 낚시꾼 자리 비우기
  const edge = pondPoint(a, 1.0), out = pondPoint(a, rand(1.08, 1.16)), far = pondPoint(a, rand(1.3, 1.7));
  if (i % 3 === 0) rock(edge.x, edge.y, rand(.25, .5));
  if (i % 2 === 0) cattail(out.x + rand(-.3, .3), out.y + rand(-.3, .3)), cattail(out.x + rand(-.4, .4), out.y + rand(-.4, .4));
  if (i % 4 === 1) bush(far.x, far.y, rand(.8, 1.3));
  if (i % 5 === 2) tree(far.x * 1.05, far.y - 1.5, rand(1, 1.5));
  if (i % 2 === 1) flower(out.x + rand(-.6, .6), out.y + rand(.3, 1));
}
// 연잎
for (let i = 0; i < 12; i++) {
  const a = rand(0, Math.PI * 2), p = pondPoint(a, rand(.6, .88));
  const pr = rand(.2, .34), pad = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, .04, 14, 1, false, 0.4, Math.PI * 2 - 0.4), toon("#63a94a"));
  pad.position.set(p.x, .03, p.y); pad.rotation.y = rand(0, 6); pondGroup.add(pad);
}
// 나무 데크(낚시꾼 자리)
const deck = new THREE.Group(); scene.add(deck);
for (let i = 0; i < 6; i++) {
  const plank = new THREE.Mesh(new THREE.BoxGeometry(2.2, .14, .4), toon(i % 2 ? "#b07a44" : "#c38a50"));
  plank.position.set(0, .42, DECK_Z - .4 - i * .42); deck.add(plank);
}
for (const x of [-1, 1]) for (const k of [0, 1]) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.11, .13, 1.2, 8), toon("#7a4f2a")); post.position.set(x, -.05, DECK_Z - .5 - k * 1.9); deck.add(post);
}
const STAND = new THREE.Vector3(0, .49, DECK_Z - 2.1);

// ------------------------------------------------------------------ 바다 낚시터: 모래 해변(양옆이 앞으로 굽은 작은 만)·야자수·바위·먼 섬·등대·부표
const seaFront = (x) => DECK_Z + .3 - Math.max(0, Math.abs(x) - 3.4) * 1.35 + .45 * Math.sin(x * .45 + 1);
{
  const sh = new THREE.Shape();
  sh.moveTo(-60, 40);
  for (let i = 0; i <= 120; i++) { const x = -60 + i; sh.lineTo(x, Math.max(-38, seaFront(x))); }
  sh.lineTo(60, 40); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: .6, bevelEnabled: true, bevelThickness: .3, bevelSize: .7, bevelSegments: 5, curveSegments: 8 });
  geo.rotateX(Math.PI / 2);
  const beach = new THREE.Mesh(geo, [toon("#f2dca2"), toon("#d6b97c")]);
  beach.position.y = .3; seaGroup.add(beach);
}
const seaRock = (x, z, sc) => { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), toon(Math.random() < .5 ? "#8c96a0" : "#727e8a")); m.scale.set(sc * rand(1, 1.5), sc * rand(.6, 1), sc * rand(.9, 1.3)); m.position.set(x, sc * .2, z); m.rotation.set(rand(0, 1), rand(0, 3), 0); seaGroup.add(m); };
const palm = (x, z, sc, lean) => {
  const g = new THREE.Group();
  let px = 0, py = 0;
  for (let i = 0; i < 7; i++) { // 마디진 줄기가 살짝 휘어 올라간다
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(.15 * sc, .19 * sc, .5 * sc, 7), toon(i % 2 ? "#a7743f" : "#8e6033"));
    px += lean * i * .03 * sc; py += .46 * sc; seg.position.set(px, py, 0); seg.rotation.z = -lean * i * .06; g.add(seg);
  }
  for (let k = 0; k < 7; k++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5), toon(k % 2 ? "#3f9a45" : "#55b94e"));
    const a = k / 7 * Math.PI * 2;
    leaf.scale.set(1.3 * sc, .1 * sc, .32 * sc);
    leaf.position.set(px + Math.cos(a) * .9 * sc, py + .1 * sc, Math.sin(a) * .9 * sc);
    leaf.rotation.set(0, -a, -.45); g.add(leaf);
  }
  for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.SphereGeometry(.13 * sc, 7, 6), toon("#6b4a26")); c.position.set(px + rand(-.15, .15) * sc, py - .1 * sc, rand(-.15, .15) * sc); g.add(c); }
  g.position.set(x, .55, z); seaGroup.add(g);
};
for (const sx of [-1, 1]) {
  for (const [x, sc] of [[5.2, .95], [7.4, 1.25], [10, 1.15], [13, 1.4]]) palm(sx * x, seaFront(sx * x) + 1.4 + rand(0, .8), sc, -sx * rand(.8, 1.3));
  for (let i = 0; i < 9; i++) { const x = sx * rand(5, 17), z = seaFront(x) - rand(-.3, .9); seaRock(x, z, rand(.3, .8)); }
}
// 파라솔
{
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1.9, 6), toon("#ffffff")); pole.position.y = .95; g.add(pole);
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.1, .45, 12, 1, true), toon("#ff6b6b", { side: THREE.DoubleSide })); top.position.y = 1.9; g.add(top);
  const stripe = new THREE.Mesh(new THREE.ConeGeometry(1.12, .46, 12, 1, true, 0, Math.PI / 3), toon("#fff8e8", { side: THREE.DoubleSide })); stripe.position.y = 1.9; g.add(stripe);
  const stripe2 = stripe.clone(); stripe2.rotation.y = Math.PI * 2 / 3; g.add(stripe2);
  const stripe3 = stripe.clone(); stripe3.rotation.y = Math.PI * 4 / 3; g.add(stripe3);
  g.position.set(-6.4, .55, seaFront(-6.4) + 1.2); g.rotation.z = .1; g.scale.setScalar(.75); seaGroup.add(g);
}
// 먼 섬과 등대
const island = (x, z, r, h) => {
  const g = new THREE.Group();
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.2, .3, 20), toon("#f2dca2")); sand.position.y = .05; g.add(sand);
  const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon("#4f9a46")); hill.scale.y = h; g.add(hill);
  g.position.set(x, 0, z); seaGroup.add(g);
};
island(-16, -46, 5, .6); island(9, -54, 7, .45); island(25, -42, 3.5, .8);
{
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 1), toon("#7d8791")); base.scale.y = .55; g.add(base);
  for (let i = 0; i < 5; i++) { const ring = new THREE.Mesh(new THREE.CylinderGeometry(.62 - i * .05, .67 - i * .05, .7, 12), toon(i % 2 ? "#ffffff" : "#ff5a5a")); ring.position.y = 1 + i * .7; g.add(ring); }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .5, 10), toon("#fff3a0", { emissive: "#ffd23f", emissiveIntensity: .8 })); lamp.position.y = 4.75; g.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(.6, .6, 10), toon("#ff5a5a")); cap.position.y = 5.3; g.add(cap);
  g.position.set(-8.5, 0, -24); g.scale.setScalar(.9); seaGroup.add(g);
}
const buoys = [];
for (const [x, z, c] of [[-7, -14, "#ff5a5a"], [8, -18, "#ffd23f"], [3, -26, "#ff5a5a"]]) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(.32, 10, 8), toon(c)); g.add(b);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.33, .33, .12, 10), toon("#ffffff")); g.add(band);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .6, 5), toon("#ffffff")); pole.position.y = .45; g.add(pole);
  g.position.set(x, .05, z); seaGroup.add(g); buoys.push(g);
}
const PLACE_LOOK = {
  fresh: { sky: "#9fdcf0", fog: [22, 42], sea: 0 },
  sea: { sky: "#86cdf7", fog: [34, 95], sea: 1 },
};
function setPlace(place) {
  PLACE = place;
  const L = PLACE_LOOK[place];
  pondGroup.visible = place === "fresh"; seaGroup.visible = place === "sea";
  SKY.set(L.sky); scene.fog.color.copy(SKY); scene.fog.near = L.fog[0]; scene.fog.far = L.fog[1];
  waterMat.uniforms.sea.value = L.sea;
}
setPlace("fresh");

// ------------------------------------------------------------------ 입자
function makePoints(n, size) {
  const pos = new Float32Array(n * 3).fill(-99), col = new Float32Array(n * 3).fill(1);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: true }));
  pts.frustumCulled = false; scene.add(pts);
  return { n, pos, col, g, vel: new Float32Array(n * 3), life: new Float32Array(n), next: 0 };
}
const drops = makePoints(400, 0.13);
const WHITE = new THREE.Color("#f4fbff");
function splash(x, z, n, power = 1, color = WHITE, y = .05) {
  for (let i = 0; i < n; i++) {
    const k = drops.next++ % drops.n;
    drops.pos.set([x + rand(-.25, .25), y, z + rand(-.25, .25)], k * 3);
    drops.vel.set([rand(-1.8, 1.8) * power, rand(1.8, 4.5) * power, rand(-1.8, 1.8) * power], k * 3);
    drops.col.set([color.r, color.g, color.b], k * 3); drops.life[k] = rand(.4, .9);
  }
}
function stepDrops(dt) {
  const P = drops;
  for (let k = 0; k < P.n; k++) {
    if (P.life[k] <= 0) { P.pos[k * 3 + 1] = -99; continue; }
    P.life[k] -= dt; P.vel[k * 3 + 1] -= 10 * dt;
    for (let a = 0; a < 3; a++) P.pos[k * 3 + a] += P.vel[k * 3 + a] * dt;
  }
  P.g.attributes.position.needsUpdate = true; P.g.attributes.color.needsUpdate = true;
}
const ringGeo = new THREE.RingGeometry(.86, 1, 32);
const rings = [];
function ripple(x, z, size = 1, color = "#effffb", life = .9) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .035, z); scene.add(m);
  rings.push({ m, age: 0, size, life });
}
function stepRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.age += dt;
    r.m.scale.setScalar(.1 + (r.age / r.life) * 1.3 * r.size);
    r.m.material.opacity = Math.max(0, .85 * (1 - r.age / r.life));
    if (r.age > r.life) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); }
  }
}

// 거품: 반짝이는 공 (등급 색, 무지개는 색이 돈다)
const BUBBLES = 420;
const bubbleMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshToonMaterial({ gradientMap: grad, transparent: true, opacity: .9, emissive: "#ffffff", emissiveIntensity: .3 }), BUBBLES);
bubbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bubbleMesh.frustumCulled = false; scene.add(bubbleMesh);
const bub = Array.from({ length: BUBBLES }, () => ({ life: 1, max: 1, x: 0, y: -9, z: 0, vy: 0, s: .1, c: new THREE.Color(), rainbow: false, hue: 0 }));
let bubNext = 0;
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();
function emitBubble(x, z, size, color, rainbow) {
  const b = bub[bubNext++ % BUBBLES];
  Object.assign(b, { life: 0, max: rand(.7, 1.3), x, z, y: -.12, vy: rand(.18, .35), s: size * rand(.6, 1.2), rainbow, hue: rand(0, 1) });
  b.c.set(color === "rainbow" ? "#ffffff" : color);
}
function stepBubbles(dt, t) {
  for (let i = 0; i < BUBBLES; i++) {
    const b = bub[i];
    if (b.life >= b.max) { tmpM.makeScale(0, 0, 0); bubbleMesh.setMatrixAt(i, tmpM); bubbleMesh.setColorAt(i, b.c); continue; }
    b.life += dt; b.y = Math.min(.06, b.y + b.vy * dt);
    const k = b.life / b.max, pop = k > .85 ? 1 + (k - .85) * 4 : 1;
    const s = b.s * Math.min(1, k * 4) * pop * (1 + Math.sin(t * 12 + i) * .06);
    tmpM.makeScale(s, s * .8, s).setPosition(b.x, b.y, b.z);
    bubbleMesh.setMatrixAt(i, tmpM);
    if (b.rainbow) tmpC.setHSL((b.hue + t * .6) % 1, .9, .65); else tmpC.copy(b.c);
    bubbleMesh.setColorAt(i, tmpC);
  }
  bubbleMesh.instanceMatrix.needsUpdate = true;
  if (bubbleMesh.instanceColor) bubbleMesh.instanceColor.needsUpdate = true;
}

// ------------------------------------------------------------------ 거품 자리
const spots = [];
const glowGeo = new THREE.CircleGeometry(1, 32);
function spotPos() {
  for (let tries = 0; tries < 40; tries++) {
    const a = rand(Math.PI * 1.05, Math.PI * 1.95), k = rand(.25, .78), p = pondPoint(a, k);
    if (p.y > DECK_Z - 3.2) continue; // 데크 바로 앞은 비운다
    if (PLACE === "sea" && p.y > seaFront(p.x) - 1.6) continue; // 바다: 만 양쪽 모래밭 위는 안 된다
    if (spots.every((s) => Math.hypot(s.x - p.x, s.z - p.y) > 3.4)) return p;
  }
  return new THREE.Vector2(rand(-2, 2), POND.z - rand(0, 3));
}
function rollType() {
  let sum = 0; for (const k in SPOT_TYPES) sum += SPOT_TYPES[k].weight;
  let r = Math.random() * sum;
  for (const k in SPOT_TYPES) { r -= SPOT_TYPES[k].weight; if (r <= 0) return k; }
  return "white";
}
function newSpot(type = rollType()) {
  const T = SPOT_TYPES[type], p = spotPos();
  const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: T.color === "rainbow" ? "#ffffff" : T.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(p.x, .025, p.y); scene.add(glow);
  const s = { x: p.x, z: p.y, type, T, fake: Math.random() < (T.fake || 0), age: 0, life: rand(...T.life), glow, busy: false };
  spots.push(s);
  return s;
}
function removeSpot(s) { const i = spots.indexOf(s); if (i >= 0) spots.splice(i, 1); scene.remove(s.glow); s.glow.material.dispose(); }
function resetSpots() { while (spots.length) removeSpot(spots[0]); newSpot("white"); newSpot("blue"); newSpot(); }
function stepSpots(dt, t) {
  if (spots.length < 3 || (spots.length < 4 && Math.random() < dt * .03)) newSpot();
  for (const s of [...spots]) {
    if (!s.busy) s.age += dt;
    const T = s.T, left = s.life - s.age;
    const fade = Math.min(1, s.age / 1.2, Math.max(0, left / 1.5));
    const pulse = .75 + .25 * Math.sin(t * (s.fake ? 7 : 3) + s.x);
    s.glow.material.opacity = fade * (s.type === "white" ? .18 : .32) * pulse;
    if (T.color === "rainbow") s.glow.material.color.setHSL((t * .5) % 1, .9, .6);
    s.glow.scale.setScalar(T.r * (1 + .06 * Math.sin(t * 2)));
    // 진짜 거품: 잔거품이 끊임없이 + 물결. 가짜: 큰 거품이 띄엄띄엄, 물결 없음
    const rate = (s.fake ? T.rate * .4 : T.rate) * fade;
    if (Math.random() < dt * rate) {
      const a = rand(0, Math.PI * 2), d = rand(0, T.r * .75);
      emitBubble(s.x + Math.cos(a) * d, s.z + Math.sin(a) * d, (s.fake ? .3 : .15 + (s.type === "white" ? 0 : .07)) * rand(.8, 1.4), T.color, T.color === "rainbow");
    }
    if (!s.fake && Math.random() < dt * (s.type === "white" ? .8 : 1.5) * fade) ripple(s.x + rand(-.3, .3), s.z + rand(-.3, .3), T.r * .6, T.color === "rainbow" ? "#ffffff" : "#effffb", 1);
    if (left <= 0 && !s.busy) removeSpot(s);
  }
}
function spotAt(x, z) {
  let best = null;
  for (const s of spots) { const d = Math.hypot(s.x - x, s.z - z); if (d < s.T.r * 1.5 && (!best || d < best.d)) best = { s, d }; }
  return best?.s ?? null;
}

// ------------------------------------------------------------------ 낚시꾼
const angler = new THREE.Group(); angler.position.copy(STAND); scene.add(angler);
const body = new THREE.Group(); angler.add(body); // 기울기·점프용
const HAND = new THREE.Vector3(0.12, 0.62, -0.32); // 몸 기준 손 위치(모델 불러오면 다시 정함)
function voxelAngler() { // 모델을 못 불러왔을 때 쓰는 간단한 인형
  const g = new THREE.Group();
  const add = (geo, c, x, y, z) => { const m = new THREE.Mesh(geo, toon(c)); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.CapsuleGeometry(.24, .35, 4, 10), "#ffc23a", 0, .55, 0);
  add(new THREE.SphereGeometry(.25, 14, 10), "#f6d0aa", 0, 1.02, 0);
  add(new THREE.CylinderGeometry(.34, .34, .05, 16), "#9aa35a", 0, 1.2, 0);
  add(new THREE.SphereGeometry(.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), "#9aa35a", 0, 1.18, 0);
  add(new THREE.CapsuleGeometry(.09, .2, 3, 8), "#3c6fd0", -.1, .14, 0); add(new THREE.CapsuleGeometry(.09, .2, 3, 8), "#3c6fd0", .1, .14, 0);
  add(new THREE.CapsuleGeometry(.07, .3, 3, 8), "#ffc23a", -.14, .62, -.2).rotation.x = 1.2; add(new THREE.CapsuleGeometry(.07, .3, 3, 8), "#ffc23a", .14, .62, -.2).rotation.x = 1.2;
  return g;
}
let anglerModel = voxelAngler(); body.add(anglerModel);
const A = { lean: 0, side: 0, jump: 0, vy: 0, kick: 0, slump: 0, cast: 0 };

// 낚싯대 (손에서 이어지는 휘는 막대) · 찌 · 줄
const rodSegs = Array.from({ length: 14 }, (_, k) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.03 - k * .0015, .034 - k * .0015, 1, 6), toon(k > 11 ? "#ff4d6d" : k % 4 === 0 ? "#3a2a20" : "#5a3c26"));
  scene.add(m); return m;
});
const bobber = new THREE.Group();
bobber.add(new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon("#ff3b4a")));
bobber.add(new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon("#ffffff")));
const stick = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .2, 5), toon("#ff3b4a")); stick.position.y = .14; bobber.add(stick);
bobber.visible = false; scene.add(bobber);
const lineGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 24 }, () => new THREE.Vector3()));
const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: "#ffffff" })); line.frustumCulled = false; scene.add(line);
const rod = { tip: new THREE.Vector3() };
const rodBuzz = new THREE.Vector2(); // 낚싯대 끝 떨림
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _ctrl = new THREE.Vector3(), _tip = new THREE.Vector3();
function placeRod(hand, dirOut, pullTo, bend) {
  // 손에서 앞·위로 뻗은 낚싯대를 줄 쪽으로 휜다 (이차 곡선)
  const L = 2.6;
  _tip.copy(hand).addScaledVector(dirOut, L).lerp(pullTo, clamp(bend, 0, 1.3) * .5);
  _tip.y -= clamp(bend, 0, 1.3) * .6; // 휘면 끝이 아래로 처진다
  _tip.x += rodBuzz.x; _tip.y += rodBuzz.y;
  _ctrl.copy(hand).addScaledVector(dirOut, L * (.62 - clamp(bend, 0, 1.3) * .12));
  rod.tip.copy(_tip);
  const P = (u, out) => out.set(
    (1 - u) ** 2 * hand.x + 2 * (1 - u) * u * _ctrl.x + u * u * _tip.x,
    (1 - u) ** 2 * hand.y + 2 * (1 - u) * u * _ctrl.y + u * u * _tip.y,
    (1 - u) ** 2 * hand.z + 2 * (1 - u) * u * _ctrl.z + u * u * _tip.z);
  rodSegs.forEach((m, k) => {
    P(k / rodSegs.length, _p0); P((k + 1) / rodSegs.length, _p1);
    m.position.copy(_p0).add(_p1).multiplyScalar(.5);
    m.scale.y = _p0.distanceTo(_p1) + .01;
    m.quaternion.setFromUnitVectors(_up, _d.copy(_p1).sub(_p0).normalize());
  });
}
function drawLine(to, slack) {
  const pts = lineGeo.attributes.position;
  for (let k = 0; k < 24; k++) {
    const u = k / 23;
    _a.lerpVectors(rod.tip, to, u); _a.y -= Math.sin(u * Math.PI) * slack;
    pts.setXYZ(k, _a.x, Math.max(_a.y, .02), _a.z);
  }
  pts.needsUpdate = true;
}

// ------------------------------------------------------------------ 물고기 모델 (Tripo) + 셰이더 휘기
const loader = new GLTFLoader();
const models = {};
const BEND_GLSL = `
  vec4 fp = uFish * vec4(transformed, 1.0);
  float ft = clamp(fp.x + 0.5, 0.0, 1.0);
  float fs = 1.0 - ft;
  float fc = abs(ft - 0.5) * 2.0;
  fp.z += uBend.z * (fc * fc - 0.35) + uBend.y * fs * fs * sin(uBend.x - fs * 3.2) + uBend.w * ft * ft * sin(uBend.x + 1.2);
  transformed = (uFishInv * fp).xyz;
`;
function bendMaterial(base, U, outline) {
  const m = outline
    ? new THREE.MeshBasicMaterial({ color: "#2a1408", side: THREE.BackSide })
    : new THREE.MeshToonMaterial({ map: base.map, color: base.map ? "#ffffff" : base.color, gradientMap: grad });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBend = U.bend; sh.uniforms.uFish = U.fish; sh.uniforms.uFishInv = U.fishInv;
    sh.vertexShader = "uniform vec4 uBend; uniform mat4 uFish; uniform mat4 uFishInv;\n" + sh.vertexShader.replace("#include <project_vertex>",
      (outline ? "transformed += normalize(objectNormal) * 0.006;\n" : "") + BEND_GLSL + "#include <project_vertex>");
  };
  m.customProgramCacheKey = () => (outline ? "fish-outline" : "fish-toon");
  return m;
}
function bodyPoints(root, step = 9) {
  const out = [], v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i); if (o.isSkinnedMesh) o.applyBoneTransform(i, v); out.push(v.applyMatrix4(o.matrixWorld).clone()); }
  });
  return out;
}
async function loadFish(id, file, yaw = 0, roll = 0) {
  const gltf = await loader.loadAsync(file);
  const root = gltf.scene, holder = new THREE.Group(), turn = new THREE.Group();
  turn.add(root); holder.add(turn);
  root.traverse((o) => { if (o.isMesh && o.material.map) { o.material.map.magFilter = THREE.NearestFilter; o.material.map.colorSpace = THREE.SRGBColorSpace; } });
  turn.rotation.set(THREE.MathUtils.degToRad(roll), THREE.MathUtils.degToRad(yaw), 0, "YXZ"); // 머리 +x (모델마다 눈으로 확인한 값)
  const size = new THREE.Box3().setFromPoints(bodyPoints(holder)).getSize(new THREE.Vector3());
  turn.scale.setScalar(1 / Math.max(size.x, 1e-3));
  const box2 = new THREE.Box3().setFromPoints(bodyPoints(holder));
  turn.position.sub(box2.getCenter(new THREE.Vector3()));
  models[id] = { holder, half: box2.getSize(new THREE.Vector3()).multiplyScalar(.5) };
}
async function loadAngler(file, yaw = 0) {
  const gltf = await loader.loadAsync(file);
  const root = gltf.scene, turn = new THREE.Group(); turn.add(root);
  root.traverse((o) => { if (o.isMesh) { const m = o.material; if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; o.material = new THREE.MeshToonMaterial({ map: m.map, color: m.map ? "#ffffff" : m.color, gradientMap: grad }); } });
  turn.rotation.y = THREE.MathUtils.degToRad(yaw);
  const box = new THREE.Box3().setFromPoints(bodyPoints(turn));
  const s = 1.35 / (box.max.y - box.min.y); turn.scale.setScalar(s);
  const b2 = new THREE.Box3().setFromPoints(bodyPoints(turn));
  turn.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
  body.remove(anglerModel); anglerModel = turn; body.add(turn);
  // 모델이 쥔 막대 끝(가장 앞쪽 점)에서 우리 낚싯대가 이어진다
  let tipPt = null;
  for (const p of bodyPoints(turn, 3)) if (p.y > .3 && p.y < 1.1 && (!tipPt || p.z < tipPt.z)) tipPt = p;
  if (tipPt) HAND.copy(tipPt).add(new THREE.Vector3(0, 0, .02)); else HAND.set(0.05, .62, -.4);
}

class Fish {
  constructor(id, sizeT) {
    const sp = SPECIES[id], m = models[id];
    this.id = id; this.sp = sp;
    this.group = new THREE.Group(); this.body = new THREE.Group(); this.group.add(this.body);
    this.len = sp.disp * (.85 + sizeT * .35);
    this.U = { bend: { value: new THREE.Vector4() } };
    if (m) {
      const norm = SkeletonUtils.clone(m.holder);
      norm.scale.setScalar(this.len); this.body.add(norm); this.norm = norm;
      this.halfH = m.half.y * this.len;
      norm.updateMatrixWorld(true);
      const normInv = norm.matrixWorld.clone().invert(), meshes = [];
      norm.traverse((o) => { if (o.isMesh) meshes.push(o); });
      for (const o of meshes) {
        // 메시 좌표 → 물고기 공간(머리 +x, 길이 1) 변환은 복제 직후 한 번만 정하면 된다
        const fish = new THREE.Matrix4().multiplyMatrices(normInv, o.matrixWorld);
        const U = { bend: this.U.bend, fish: { value: fish }, fishInv: { value: fish.clone().invert() } };
        const base = o.material;
        o.material = bendMaterial(base, U, false); o.frustumCulled = false;
        const ol = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, bendMaterial(base, U, true)) : new THREE.Mesh(o.geometry, bendMaterial(base, U, true));
        if (o.isSkinnedMesh) ol.bind(o.skeleton, o.bindMatrix);
        ol.position.copy(o.position); ol.quaternion.copy(o.quaternion); ol.scale.copy(o.scale); ol.frustumCulled = false;
        o.parent.add(ol);
      }
    } else {
      const b = new THREE.Mesh(new THREE.SphereGeometry(.5, 12, 8), toon("#e8a040")); b.scale.set(this.len, this.len * .45, this.len * .3); this.body.add(b);
      this.halfH = this.len * .22;
    }
    scene.add(this.group);
  }
  // phase: 꼬리 물결 위상, amp: 꼬리 흔들기, arc: C자 휘기, head: 머리 흔들기 (몸길이 비율)
  wave(phase, amp, arc, head = amp * .3) { this.U.bend.value.set(phase, amp, arc, head); if (!this.norm) this.body.rotation.y = Math.sin(phase) * amp; }
  mouth(out) { return this.norm ? out.set(.48, 0, 0).applyMatrix4(this.norm.matrixWorld) : out.set(this.len * .48, 0, 0).applyMatrix4(this.body.matrixWorld); }
  dispose() { scene.remove(this.group); }
}

// ------------------------------------------------------------------ 소리
// assets/sfx 에 일레븐랩스로 만든 효과음이 있으면 그걸 쓰고, 없으면 칩튠 신스로 낸다.
let ac = null;
function audio() { if (!ac) try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; } if (ac?.state === "suspended") ac.resume(); return ac; }
function tone(freq, dur, type = "sine", vol = .15, slide = 0, delay = 0) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur);
}
function noise(dur, vol = .12, hp = 800, delay = 0) {
  const a = audio(); if (!a) return;
  const b = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  f.type = "highpass"; f.frequency.value = hp; g.gain.value = vol;
  s.buffer = b; s.connect(f).connect(g).connect(a.destination); s.start(a.currentTime + delay);
}
const SAMPLES = {};
fetch("assets/sfx/sfx.json").then((r) => (r.ok ? r.json() : {})).then((list) => {
  const a = audio(); if (!a) return;
  for (const [name, file] of Object.entries(list)) fetch(`assets/sfx/${file}`).then((r) => r.arrayBuffer()).then((buf) => a.decodeAudioData(buf)).then((b) => { SAMPLES[name] = prepSample(b); }).catch(() => {});
}).catch(() => {});
// 앞쪽 무음은 건너뛰고(박자에 딱 붙게) 크기는 고르게 맞춘다
function prepSample(b) {
  const d = b.getChannelData(0); let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  let on = 0; while (on < d.length && Math.abs(d[on]) < peak * .08) on++;
  return { b, offset: Math.max(0, on / b.sampleRate - .004), gain: peak > 0 ? Math.min(3, .7 / peak) : 1 };
}
function sample(name, { rate = 1, vol = .8, delay = 0 } = {}) {
  const S = SAMPLES[name]; if (!S || !ac) return false;
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = S.b; s.playbackRate.value = rate; g.gain.value = vol * S.gain;
  s.connect(g).connect(ac.destination); s.start(ac.currentTime + delay, S.offset);
  return true;
}
const semi = (n) => Math.pow(2, n / 12);

// 사투 중 깔리는 칩튠 박자. 연타 소리는 가까운 16분 박자에 붙여서 리듬이 맞게 들린다.
const BEAT = { on: false, bpm: 132, next: 0, step: 0 };
function beatStart(bpm) { const a = audio(); if (!a) return; BEAT.on = true; BEAT.bpm = bpm; BEAT.next = a.currentTime + .05; BEAT.step = 0; }
function beatStop() { BEAT.on = false; }
function beatTick() {
  if (!BEAT.on || !ac) return;
  const sixteenth = 60 / BEAT.bpm / 4;
  while (BEAT.next < ac.currentTime + .12) {
    const d = BEAT.next - ac.currentTime, st = BEAT.step % 16;
    if (st % 4 === 0) tone(st === 0 ? 70 : 60, .16, "sine", .22, -30, d);         // 쿵
    if (st === 4 || st === 12) noise(.09, .07, 1800, d);                             // 짝
    if (st % 2 === 1) noise(.025, .025, 7000, d);                                    // 츳
    if (st % 4 === 2) tone([110, 110, 131, 98][(BEAT.step >> 4) % 4], .1, "square", .03, 0, d); // 베이스
    BEAT.next += sixteenth; BEAT.step++;
  }
}
// 가장 가까운 16분 박자까지 남은 시간(35ms 안쪽이면 그 박자에 붙이고, 아니면 바로)
function onBeat() {
  if (!BEAT.on || !ac) return 0;
  const sixteenth = 60 / BEAT.bpm / 4, wait = BEAT.next - ac.currentTime;
  const w = ((wait % sixteenth) + sixteenth) % sixteenth;
  return w < .035 ? w : 0;
}
const MASH_RIFF = [0, 0, 7, 0, 3, 0, 10, 7, 0, 0, 12, 10, 7, 3, 5, 7]; // 연타할수록 이어지는 리프
const NOTE_PITCH = { up: 784, right: 880, down: 659, left: 587, reel: 523 };
const NOTE_SEMI = { up: 4, right: 7, down: 2, left: 0, reel: -5 };
const SFX = {
  cast: () => sample("cast", { vol: .6 }) || (noise(.25, .06, 2500), tone(420, .3, "triangle", .07, 600)),
  plop: () => sample("plop") || (tone(330, .2, "sine", .22, -220), noise(.12, .05, 1500)),
  nibble: () => tone(760, .05, "square", .05),
  bite: () => sample("bite") || (tone(988, .09, "square", .1), tone(1318, .14, "square", .1, 0, .08)),
  hook: () => sample("hook") || (noise(.2, .14, 500), tone(220, .25, "sawtooth", .08, 400)),
  hit: (dir, perfect) => {
    const d = onBeat();
    if (dir === "reel") return sample("reel", { delay: d, rate: perfect ? 1.15 : 1 }) || (noise(.12, .08, 2500, d), tone(523, .14, "square", .08, 500, d));
    if (!sample(perfect ? "perfect" : "tap", { delay: d, rate: semi(NOTE_SEMI[dir]) * .9, vol: .7 })) tone(NOTE_PITCH[dir] * (perfect ? 2 : 1), .09, "square", .07, 0, d);
    noise(.05, .04, 3000, d);
  },
  mash: (n, need) => { // n번째 연타: 리프를 따라 올라가고, 큰 놈일수록 낮고 묵직하게
    const d = onBeat(), up = MASH_RIFF[(n - 1) % 16] + Math.floor((n - 1) / 16) * 12, heavy = need > 14 ? -5 : 0;
    const drum = n % 4 === 0 ? "snare" : "taiko";
    if (!sample(drum, { delay: d, rate: semi((n * .4) | 0) })) { if (drum === "snare") noise(.08, .1, 1500, d); else tone(90, .1, "sine", .25, -40, d); }
    tone(262 * semi(up + heavy), .07, "square", .06, 0, d);
  },
  mashDone: () => sample("perfect", { rate: 1.3 }) || [0, 4, 7, 12].forEach((k, i) => tone(523 * semi(k), .08, "square", .07, 0, i * .04)),
  miss: () => sample("miss") || (tone(160, .25, "sawtooth", .12, -60), noise(.2, .1, 300)),
  splash: () => sample("splash", { vol: .5, rate: rand(.9, 1.15) }) || noise(.35, .12, 400),
  snap: () => sample("snap") || (noise(.3, .22, 2000), tone(1400, .25, "sawtooth", .07, -1200)),
  catch: () => sample("catch") || [523, 659, 784, 1046].forEach((f, i) => tone(f, .16, "square", .07, 0, i * .09)),
  legend: () => sample("legend") || [523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => tone(f, .2, "square", .07, 0, i * .08)),
  lose: () => { tone(400, .2, "triangle", .1); tone(300, .3, "triangle", .1, 0, .15); },
};

// ------------------------------------------------------------------ 화면 효과 (사투 화면은 픽셀 그림)
function pxSvg(rows, fill = "#13162e", rot = 0, extra = "") {
  const h = rows.length, w = rows[0].length;
  let r = "";
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === "#") r += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`; }));
  return `<svg viewBox="0 0 ${w} ${h}"><g fill="${fill}" transform="rotate(${rot} ${w / 2} ${h / 2})">${r}</g>${extra}</svg>`;
}
const UP_PX = ["....##....", "...####...", "..######..", ".########.", "##########", "...####...", "...####...", "...####...", "...####...", "...####..."];
const ARROW_SVG = { up: pxSvg(UP_PX), right: pxSvg(UP_PX, undefined, 90), down: pxSvg(UP_PX, undefined, 180), left: pxSvg(UP_PX, undefined, 270) };
const KEY_HTML = (dir) => dir === "reel" ? `<div class="kb"><span class="kb-desk">SPACE</span><span class="kb-touch">감기</span><small class="kb-desk">릴 감기!</small></div>` : ARROW_SVG[dir];
const HEART = pxSvg([".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."], "#ff4d6d", 0, '<rect x="1" y="1" width="1" height="1" fill="#fff8e8"/>');
document.querySelectorAll(".dpad button").forEach((b) => { b.innerHTML = ARROW_SVG[b.dataset.dir]; });
// 남은 시간 = 열쇠 둘레의 네모 칸(시계 방향으로 꺼진다)
const FRAME_N = 24, frameRects = [];
{
  const svg = $("frame"), L = 142, o = 9, B = 14;
  for (let i = 0; i < FRAME_N; i++) {
    let d = ((i / FRAME_N) * 4 * L + L / 2) % (4 * L), x, y;
    if (d < L) { x = o + d; y = o; } else if (d < 2 * L) { x = o + L; y = o + d - L; } else if (d < 3 * L) { x = o + L - (d - 2 * L); y = o + L; } else { x = o; y = o + L - (d - 3 * L); }
    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r.setAttribute("x", (x - B / 2).toFixed(0)); r.setAttribute("y", (y - B / 2).toFixed(0)); r.setAttribute("width", B); r.setAttribute("height", B);
    svg.appendChild(r); frameRects.push(r);
  }
}
let frameLit = -1;
function setFrame(k) { const n = Math.ceil(k * FRAME_N); if (n === frameLit) return; frameLit = n; frameRects.forEach((r, i) => r.classList.toggle("on", i < n)); }
function pxWave() { const w = $("wave"); w.classList.remove("go"); void w.offsetWidth; w.classList.add("go"); }
function shout(text, cls = "sun", sec = .9) {
  const el = $("shout"); el.textContent = text; el.className = `shout ${cls}`;
  void el.offsetWidth; el.style.animationDuration = `${sec}s`; el.classList.add("pop");
}
function flash(kind) { const el = $("flash"); el.className = "flash"; void el.offsetWidth; el.className = `flash ${kind}`; }
function hint(html) { const h = $("hint"); h.innerHTML = html || ""; h.hidden = !html; }
let shake = 0, punch = 0; // punch: 화면이 쾅 다가오는 정도(+) / 밀려나는 정도(-)
const renderLegend = () => $("legend").innerHTML = Object.values(SPOT_TYPES).map((T) => `<span><i style="background:${T.color === "rainbow" ? "conic-gradient(red,orange,yellow,lime,cyan,blue,violet,red)" : T.color}"></i>${T.name}</span>`).join("") + "<span>물결 없는 거품은 가짜일지도?</span>";
renderLegend();

// ------------------------------------------------------------------ 게임 상태
const G = { playing: false, time: 180, score: 0, caught: [], book: new Set(), ending: false, lastResult: "" };
const R = { state: "idle", spot: null, species: null, target: new THREE.Vector3(), from: new THREE.Vector3(), fly: 0, flyDur: .8, timer: 0, nibbles: 0, dip: 0 };
let F = null; // 사투
let show = null; // 잡은 물고기 연출
let card = 0;

function resetRod() {
  if (R.spot) R.spot.busy = false;
  R.spot = null; R.state = "idle"; bobber.visible = false; $("bite").hidden = true;
  if (G.playing && !show) hint("반짝이는 <em>거품</em>을 눌러 던져요");
}
function castTo(spot) {
  if (R.state !== "idle" || F || show) return;
  audio();
  R.spot = spot; spot.busy = true;
  R.target.set(spot.x + rand(-.25, .25), 0, spot.z + rand(-.25, .25));
  R.from.copy(rod.tip);
  R.fly = 0; R.flyDur = .45 + R.target.distanceTo(angler.position) * .045; R.state = "flying"; bobber.visible = true;
  A.cast = 1; SFX.cast(); hint("");
}
function landed() {
  SFX.plop(); ripple(R.target.x, R.target.z, .8); splash(R.target.x, R.target.z, 10, .45);
  const s = R.spot;
  R.species = pickSpecies(s.fake ? FAKE_TABLE : s.T.table);
  R.timer = rand(1.4, 3.6); R.nibbles = Math.floor(rand(0, 3));
  R.state = "waiting"; hint("찌가 <em>쏙!</em> 들어가면 눌러요. 톡톡은 기다려요");
}
function earlyStrike() {
  shout("앗, 너무 빨라!", "hot", 1); SFX.lose(); flash("red");
  R.spot.age = R.spot.life; // 놀란 물고기가 흩어진다
  resetRod();
}

// 콤보 악보: 한 칸씩 + 우다다(빠른 방향키 묶음 → 감기로 마무리) + 좌우 버티기 + 가끔 감기
// 결정적인 순간(중간 고비·마지막 끌어올리기)은 "계속 연타하세요!" — 연타 속도(초당 횟수)가 기준보다 빠르면 원이 커지고
// 느리면 작아진다. 기준선을 넘으면 성공, 원이 다 사라지면 실패. 기준 속도는 사람 손에 맞춰 초당 2.4~4.6번.
// 같은 물고기라도 클수록(sizeT) 칸이 많고 빠르며, 연타 기준 속도가 높고 오래 버텨야 한다.
const DIRS = ["up", "down", "left", "right"];
// 크기 등급: 같은 물고기도 크기(sizeT)에 따라 월척 > S급 > A급 > B급 > 놔주자급
const GRADES = [
  { min: .92, name: "월척", color: "#ff4d6d", mult: 1.7 },
  { min: .72, name: "S급", color: "#d79a12", mult: 1.3 },
  { min: .45, name: "A급", color: "#3f8f5a", mult: 1.1 },
  { min: .18, name: "B급", color: "#2f7fc0", mult: 1 },
  { min: 0, name: "놔주자급", color: "#6b7280", mult: .5, release: true },
];
const gradeOf = (t) => GRADES.find((g) => t >= g.min);
function mashNote(sp, sizeT, final) {
  const power = Math.min(1, sp.points / 320);
  const hold = 2.4 + power * 1.2 + sizeT * 1.0;   // 초당 이만큼 눌러야 원이 그대로 (어린이 연타 초당 5~7번 기준)
  const dur = 3 + power * 2 + sizeT * 2;          // 기준보다 초당 2번 빠르게 누르면 이만큼 걸려 성공
  return { type: "mash", dir: "any", hold, grow: .65 / (2 * dur), win: 22, final };
}
function makeChart(sp, sizeT) {
  const notes = [];
  let last = "";
  const arrow = () => { let d = DIRS[Math.floor(rand(0, 4))]; if (d === last && Math.random() < .6) d = DIRS[(DIRS.indexOf(d) + 1 + Math.floor(rand(0, 3))) % 4]; last = d; return d; };
  const n = Math.max(3, sp.notes + Math.round(sizeT * 4) - 2), winK = 1.12 - sizeT * .26;
  const mid = Math.max(0, sp.mash - 1);
  const mashAt = new Set(), zigAt = new Set(), burstAt = new Set();
  for (let i = 0; i < mid; i++) mashAt.add(Math.floor(n * (i + 1) / (mid + 1)));
  for (let i = 0; i < sp.zig; i++) zigAt.add(Math.max(1, Math.floor(n * (i + .5) / (sp.zig + .5))));
  const bursts = sp.tier === "흔함" || sp.tier === "꽝" ? (n >= 7 ? 1 : 0) : sp.tier === "보통" ? 1 : 2;
  for (let i = 0; i < bursts; i++) burstAt.add(Math.floor(n * (i + .3) / (bursts + .3)) + 1);
  for (let i = 0; i < n; i++) {
    const win = sp.win * winK * Math.pow(.975, i);
    if (mashAt.has(i)) { notes.push(mashNote(sp, sizeT, false)); last = ""; continue; }
    if (zigAt.has(i)) {
      const first = Math.random() < .5 ? "left" : "right", other = first === "left" ? "right" : "left";
      for (let k = 0; k < 4; k++) notes.push({ type: "tap", dir: k % 2 ? other : first, win: win * .8, zig: true });
      last = ""; continue;
    }
    if (burstAt.has(i)) { // 우다다: 짧은 시간에 방향키 3~4개, 감기로 마무리
      const len = sp.tier === "전설" ? 4 : 3;
      for (let k = 0; k < len; k++) notes.push({ type: "tap", dir: arrow(), win: Math.max(.45, win * .62), burst: true });
      notes.push({ type: "tap", dir: "reel", win: win * .9, finisher: true });
      continue;
    }
    if (i > 1 && Math.random() < .14) { notes.push({ type: "tap", dir: "reel", win }); continue; }
    notes.push({ type: "tap", dir: arrow(), win });
  }
  notes.push(mashNote(sp, sizeT, true)); // 마지막 끌어올리기
  return notes;
}

function hook() {
  if (R.state !== "bite") return;
  $("bite").hidden = true;
  const s = R.spot, sp = SPECIES[R.species];
  SFX.hook(); flash("white"); shake = .5;
  splash(R.target.x, R.target.z, 26, 1.2); ripple(R.target.x, R.target.z, 1.6);
  const sizeT = Math.random();
  const fish = new Fish(R.species, sizeT);
  const chart = makeChart(sp, sizeT);
  const weight = chart.reduce((a, n) => a + (n.type === "mash" ? 3 : n.finisher ? 2 : 1), 0);
  F = { fish, sp, sizeT, chart, i: 0, weight, got: 0, hearts: 3, combo: 0, maxCombo: 0, perfect: 0, t: 0, noteT: 0, gauge: 0, taps: 0, gpop: 0, tapT: [], rate: 0, mood: "",
    from: R.target.clone(), dist0: R.target.distanceTo(angler.position), leap: 0, leapV: 0, heading: 0, phase: 0, pulse: 0, bonus: s.fake ? 1 : s.T.bonus || 1 };
  R.state = "fight"; hint(""); document.body.classList.add("fighting");
  $("fight").hidden = false;
  const gr = gradeOf(sizeT), cm = Math.round(lerp(sp.len[0], sp.len[1], sizeT)), junk = sp.tier === "꽝";
  $("ftier").textContent = junk ? "???" : sp.tier; $("ftier").style.background = TIER_COLOR[sp.tier];
  $("fsize").textContent = junk ? "?" : `${gr.name} 약${cm}cm`; $("fsize").style.background = junk ? "" : gr.color; $("fsize").style.color = junk ? "" : "#fff8e8";
  $("fsize").classList.toggle("xl", gr.name === "월척" && !junk);
  $("fnameText").textContent = junk ? "걸렸다!" : gr.name === "월척" ? "월척이다!!" : sp.tier === "전설" ? "엄청난 힘이다!!" : sp.tier === "희귀" || gr.name === "S급" ? "묵직하다!" : "걸렸다!";
  $("hearts").innerHTML = HEART + HEART + HEART;
  $("combo").hidden = true;
  const big = sp.tier === "전설" || (gr.name === "월척" && sp.points >= 45);
  shout(big ? "대물이다!!" : "걸렸다!", big ? "hot" : "sun", 1);
  if (big) { flash("gold"); SFX.legend(); }
  beatStart(sp.tier === "전설" ? 150 : sp.tier === "희귀" ? 140 : 128);
  showNote();
}
function showNote() {
  const n = F.chart[F.i];
  const cur = $("cur"), key = $("curKey"), mash = n.type === "mash";
  cur.classList.toggle("mashing", mash);
  key.className = `key px k-${n.dir}`; key.innerHTML = mash ? "" : KEY_HTML(n.dir);
  cur.classList.remove("urgent", "pressed");
  key.style.animation = "none"; void key.offsetWidth; key.style.animation = ""; // 다시 튀어나오게
  $("curMash").hidden = !mash; $("curCount").hidden = !mash; $("mashCv").hidden = !mash;
  if (mash) {
    F.gauge = .35; F.taps = 0; F.tapT = []; F.rate = 0; F.mood = ""; $("curCount").textContent = "0";
    $("curMash").innerHTML = `계속 연타하세요!<small id="mashMood"><span class="kb-desk">아무 키나 · 스페이스를 빠르게</span><span class="kb-touch">화면을 빠르게 톡톡톡</span></small>`;
    shout(n.final ? "마지막 한 방!!" : "버텨라!!", "hot", .9);
  }
  if (n.zig && !F.chart[F.i - 1]?.zig) shout("좌우로 버텨!", "lime", .9);
  if (n.burst && !F.chart[F.i - 1]?.burst) shout("우다다다!", "hot", .8);
  if (n.finisher) shout("지금 감아!", "sun", .7);
  $("queue").innerHTML = F.chart.slice(F.i + 1, F.i + 4).map((q) => q.type === "mash" ? `<div class="key px k-mash"><div class="kb">연타</div></div>` : `<div class="key px k-${q.dir}">${KEY_HTML(q.dir)}</div>`).join("");
  F.noteT = 0; frameLit = -1;
}
function judge(text, cls) { const el = $("judge"); el.textContent = text; el.className = `judge ${cls}`; void el.offsetWidth; el.classList.add("go"); }
function press(dir) {
  audio();
  if (R.state === "bite") return hook();
  if (R.state === "waiting" || R.state === "nibble") return earlyStrike();
  if (!F) return;
  const n = F.chart[F.i];
  const cur = $("cur"); cur.classList.add("pressed"); setTimeout(() => cur.classList.remove("pressed"), 70);
  const fp = F.fish.group.position;
  if (n.type === "mash") { // 무엇을 눌러도 된다. 원의 크기는 연타 속도로 정해진다(updateFight)
    F.taps++; F.tapT.push(F.t); F.gpop = 1; F.gauge = Math.min(1, F.gauge + .004);
    const c = $("curCount"); c.textContent = F.taps; c.classList.remove("tick"); void c.offsetWidth; c.classList.add("tick");
    SFX.mash(F.taps, n.hold > 4.4 ? 20 : 8);
    A.kick = .7; shake = Math.max(shake, .1 + F.gauge * .14); F.pulse = 1; punch = .3 + F.gauge * .45;
    splash(fp.x, fp.z, 3 + Math.round(F.gauge * 6), .5 + F.gauge * .6);
    return;
  }
  if (dir === "tap") return; // 화면 톡톡은 연타 때만
  if (dir !== n.dir) return miss("틀렸어!");
  const perfect = F.noteT < n.win * .45;
  F.got += 1; F.combo++; if (perfect) F.perfect++;
  punch = perfect ? 1 : .6; pxWave();
  judge(n.finisher ? (perfect ? "릴 감기 PERFECT!" : "릴 감기!") : perfect ? "PERFECT!" : "GOOD", perfect ? "perfect" : "good");
  if (n.finisher) { F.got += 1; flash("white"); A.kick = 1.4; }
  SFX.hit(dir, perfect);
  A.kick = 1; if (n.zig) A.side = dir === "left" ? -1 : 1;
  shake = Math.max(shake, perfect ? .22 : .12); F.pulse = 1;
  splash(fp.x, fp.z, perfect ? 12 : 6, .8);
  nextNote();
}
function nextNote() {
  F.maxCombo = Math.max(F.maxCombo, F.combo);
  const c = $("combo"); c.hidden = F.combo < 2; $("comboN").textContent = F.combo;
  c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
  F.i++;
  if (F.i >= F.chart.length) return endFight("caught");
  showNote();
}
function mashWin(n) {
  F.got += 3; F.combo += 3; F.perfect++;
  judge(n.final ? "끌어올렸다!!" : "연타 성공!", "perfect"); flash("white"); SFX.mashDone(); pxWave();
  shake = .5; punch = 1.4; A.kick = 1.6; F.leapV = 5;
  nextNote();
}
function updateMash(n, dt) {
  const f = F;
  while (f.tapT.length && f.tapT[0] < f.t - 1) f.tapT.shift();
  f.rate = lerp(f.rate, f.tapT.length / Math.min(1, Math.max(.35, f.noteT)), ease(8, dt));
  if (f.noteT > 1) { const ex = f.rate - n.hold; f.gauge += (ex > 0 ? ex : ex * .7) * n.grow * dt; } // 처음 1초는 손 풀 시간
  f.gpop = Math.max(0, f.gpop - dt * 8);
  const mood = f.noteT < 1 ? "" : f.rate < n.hold - .3 ? "slow" : f.rate > n.hold + 2.2 ? "fire" : "ok";
  if (mood !== f.mood) {
    f.mood = mood;
    const el = $("mashMood");
    if (el && mood) el.innerHTML = mood === "slow" ? '<b style="color:var(--hot)">▼ 더 빨리!!</b>' : mood === "fire" ? '<b style="color:var(--sun)">▲▲ 불타오른다!!</b>' : '<b style="color:var(--lime)">▲ 좋아요, 계속!</b>';
  }
  if (f.gauge >= 1) return mashWin(n);
  if (f.gauge <= 0) return miss("힘이 모자라!");
}
// 연타 원(64×64 캔버스를 키워서 픽셀로 보이게): 안쪽 원 = 연타 힘, 점선 = 기준선, 바깥 점 = 연타 속도(빨간 눈금 = 기준 속도)
const mashCtx = $("mashCv").getContext("2d");
function drawMash(n, k, t) {
  const c = mashCtx, C = 32, target = 21;
  c.clearRect(0, 0 , 64, 64);
  const g = Math.min(1.15, F.gauge), r = Math.max(1.5, g * target * (1 + F.gpop * .08));
  const hot = g > .75;
  c.fillStyle = hot ? "#ff4d6d" : "#ffd23f";
  c.beginPath(); c.arc(C, C, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = "rgba(255,255,255,.55)"; c.beginPath(); c.arc(C - r * .3, C - r * .35, r * .32, 0, Math.PI * 2); c.fill();
  // 기준선(깜빡이는 점선)
  for (let i = 0; i < 36; i++) {
    if (i % 2) continue;
    const a = i / 36 * Math.PI * 2 + t * .8;
    c.fillStyle = g >= .9 && Math.sin(t * 30) > 0 ? "#ffffff" : "#fff8e8";
    c.fillRect(Math.round(C + Math.cos(a) * target) - 1, Math.round(C + Math.sin(a) * target) - 1, 2, 2);
  }
  // 연타 속도계 (꽉 차면 기준 + 초당 3번)
  const dots = 32, top = n.hold + 3, lit = Math.round(Math.min(1, F.rate / top) * dots), mark = Math.round(n.hold / top * dots);
  for (let i = 0; i < dots; i++) {
    const a = -Math.PI / 2 + i / dots * Math.PI * 2;
    c.fillStyle = i === mark ? "#ff4d6d" : i < lit ? (F.rate < n.hold ? "#ffd23f" : "#9cf25a") : "rgba(19,22,46,.6)";
    const sz = i === mark ? 4 : 3;
    c.fillRect(Math.round(C + Math.cos(a) * 29) - sz / 2, Math.round(C + Math.sin(a) * 29) - sz / 2, sz, sz);
  }
}
function miss(text) {
  F.hearts--; F.combo = 0; $("combo").hidden = true;
  judge(text || "MISS", "miss"); SFX.miss(); flash("red"); shake = .6; punch = -1.2;
  A.slump = 1; F.leapV = 3.5; // 물고기가 확 뛰어오른다
  splash(F.fish.group.position.x, F.fish.group.position.z, 20, 1.2); SFX.splash();
  $("hearts").querySelectorAll("svg").forEach((h, k) => { h.classList.toggle("lost", k >= F.hearts); h.classList.toggle("hit", k === F.hearts); });
  if (F.hearts <= 0) return endFight("snap");
  showNote(); // 같은 칸을 다시 (연타는 처음부터)
}
function endFight(result) {
  const f = F; if (!f) return;
  F = null; G.lastResult = result; beatStop(); document.body.classList.remove("fighting");
  $("fight").hidden = true; $("danger").style.boxShadow = "";
  if (R.spot) R.spot.age = R.spot.life; // 그 자리 거품은 끝
  if (result === "caught") {
    const sp = f.sp, cm = Math.round(lerp(sp.len[0], sp.len[1], f.sizeT));
    const junk = !sp.points, gr = gradeOf(f.sizeT);
    const base = sp.points * gr.mult * (.9 + f.sizeT * .2);
    const pts = Math.round((base * (1 + f.perfect * .04) + (sp.points ? f.maxCombo * 2 : 0)) * f.bonus);
    const isNew = !G.book.has(f.fish.id) && !junk;
    G.book.add(f.fish.id); G.caught.push({ id: f.fish.id, cm, pts, grade: junk ? "" : gr.name }); G.score += pts;
    $("score").textContent = G.score; $("count").textContent = G.caught.filter((c) => SPECIES[c.id].points).length;
    $("cardTier").textContent = sp.tier; $("cardTier").style.background = TIER_COLOR[sp.tier];
    $("cardGrade").hidden = junk; $("cardGrade").textContent = gr.name; $("cardGrade").style.background = gr.color;
    $("cardName").textContent = sp.name; $("cardSize").textContent = `${cm}cm`;
    $("cardPoints").textContent = pts ? `+${pts}` : "꽝!";
    $("cardBonus").textContent = [f.perfect ? `PERFECT ${f.perfect}` : "", f.maxCombo > 2 ? `최대 ${f.maxCombo}콤보` : "", f.bonus > 1 ? "무지개 ×2" : "", !junk && gr.release ? "작으니까 다시 놓아줘요" : ""].filter(Boolean).join(" · ");
    $("cardNew").hidden = !isNew;
    const c = $("card"); c.hidden = false; c.style.animation = "none"; void c.offsetWidth; c.style.animation = ""; card = 2.8;
    (sp.tier === "전설" ? SFX.legend : sp.points ? SFX.catch : SFX.lose)();
    if (sp.tier === "전설") flash("gold");
    // 물고기를 들어 올려 데크 위에서 파닥
    f.fish.group.position.set(angler.position.x + 1.1, .5, angler.position.z + .2);
    show = { fish: f.fish, t: 0, y: 1.6, vy: 2, roll: Math.PI / 2, heading: rand(-.5, .5), next: .1, release: !junk && gr.release };
    splash(angler.position.x + 1.1, angler.position.z + .2, 16, .8, WHITE, .5);
    A.jump = 1; A.vy = 4.2;
  } else {
    f.fish.dispose();
    if (result === "snap") { shout("툭! 줄이 끊어졌다", "hot", 1.3); SFX.snap(); A.slump = 1.5; }
    else shout("놓쳤어요…", "cream", 1.2);
  }
  resetRod();
  if (G.ending) setTimeout(finish, 1500);
}

// ------------------------------------------------------------------ 입력
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function waterPoint(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(waterPlane, p) ? p : null;
}
renderer.domElement.addEventListener("pointerdown", (e) => {
  audio();
  if (!G.playing) return;
  if (R.state === "bite") return hook();
  if (R.state === "waiting" || R.state === "nibble") return earlyStrike();
  if (F) return press("tap");
  if (R.state !== "idle" || show) return;
  const p = waterPoint(e); if (!p) return;
  const s = spotAt(p.x, p.z);
  if (s) castTo(s);
  else { shout("거품을 노려요!", "cream", .8); ripple(p.x, p.z, .4); }
});
const KEYMAP = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right" };
addEventListener("keydown", (e) => {
  const dir = KEYMAP[e.code];
  if (dir || e.code === "Space") e.preventDefault();
  if (e.repeat || !G.playing) return;
  if (dir) { pressPad(dir); press(dir); }
  else if (e.code === "Space") { if (F) { pressPad("reel"); press("reel"); } else if (["bite", "waiting", "nibble"].includes(R.state)) press("up"); }
});
function pressPad(dir) { const b = document.querySelector(`[data-dir="${dir}"]`); if (!b) return; b.classList.add("on"); setTimeout(() => b.classList.remove("on"), 90); }
document.querySelectorAll(".dpad button, .reelbtn").forEach((b) => b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); pressPad(b.dataset.dir); press(b.dataset.dir); }));

// ------------------------------------------------------------------ 갱신
const handW = new THREE.Vector3(), rodDir = new THREE.Vector3(), tmpV = new THREE.Vector3();
function updateAngler(dt, t) {
  // 기울기·점프·움찔: 과장된 몸짓
  A.kick = Math.max(0, A.kick - dt * 5); A.slump = Math.max(0, A.slump - dt * 1.4); A.cast = Math.max(0, A.cast - dt * 2.2);
  A.side = lerp(A.side, 0, ease(3, dt));
  if (A.vy > 0 || body.position.y > 0) { A.vy -= 14 * dt; body.position.y = Math.max(0, body.position.y + A.vy * dt); if (body.position.y === 0) A.vy = 0; }
  const mashing = F?.chart[F.i]?.type === "mash";
  const wantLean = F ? .28 + A.kick * .22 + (mashing ? .15 + Math.sin(t * 40) * .05 : 0) : A.cast > .5 ? -.35 : A.cast > 0 ? .3 : 0;
  A.lean = lerp(A.lean, wantLean - A.slump * .35, ease(10, dt));
  body.rotation.x = A.lean; // + 뒤로 젖힘
  body.rotation.z = -A.side * .32 + (F ? Math.sin(t * 13) * .03 : 0) + A.slump * Math.sin(t * 20) * .1;
  const breathe = 1 + Math.sin(t * 2.4) * .015;
  body.scale.set(1 + A.kick * .06, breathe - A.kick * .06, 1 + A.kick * .06);
  body.updateMatrixWorld(true);
  handW.copy(HAND).applyMatrix4(body.matrixWorld);
  const target = F ? F.fish.group.position : R.state !== "idle" ? bobber.position : _a.set(angler.position.x, 0, angler.position.z - 6);
  rodDir.set(target.x - handW.x, 0, target.z - handW.z).normalize().multiplyScalar(.75);
  rodDir.y = F ? .95 + A.kick * .25 : .75; // 싸울 때는 세워 든다
  if (A.cast > .5) rodDir.set(rodDir.x * -.3, 1.4, -rodDir.z * .3 + .3); // 던지기 직전 뒤로 젖힘
  rodDir.normalize();
}
function updateRodAndLine(dt, t) {
  let pullTo = bobber.position, bend = .05, slack = .35;
  if (R.state === "flying") {
    R.fly += dt / R.flyDur; const u = Math.min(1, R.fly);
    bobber.position.lerpVectors(R.from, R.target, u); bobber.position.y += Math.sin(u * Math.PI) * 3;
    slack = .1;
    if (u >= 1) landed();
  } else if (R.state === "waiting" || R.state === "nibble" || R.state === "bite") {
    R.timer -= dt;
    if (R.state === "waiting" && R.timer <= 0) {
      if (R.nibbles > 0) { R.nibbles--; R.state = "nibble"; R.timer = .35; SFX.nibble(); ripple(R.target.x, R.target.z, .4); }
      else {
        R.state = "bite"; const sp = SPECIES[R.species];
        R.timer = sp.tier === "전설" ? .85 : sp.tier === "희귀" ? 1 : 1.2;
        SFX.bite(); splash(R.target.x, R.target.z, 14, .7); ripple(R.target.x, R.target.z, 1);
        $("bite").hidden = false; flash("white"); shake = .25; hint("");
      }
    } else if (R.state === "nibble" && R.timer <= 0) { R.state = "waiting"; R.timer = rand(.6, 1.5); }
    else if (R.state === "bite" && R.timer <= 0) { shout("미끼만 뺏겼어요", "cream", 1.1); SFX.lose(); resetRod(); }
    const dip = R.state === "bite" ? -.2 + Math.sin(t * 34) * .05 : R.state === "nibble" ? -.07 : 0;
    R.dip = lerp(R.dip, dip, ease(20, dt));
    bobber.position.set(R.target.x, .05 + Math.sin(t * 2) * .02 + R.dip, R.target.z);
    bend = R.state === "bite" ? .45 : .06;
  }
  if (F) {
    const urgent = clamp(F.noteT / F.chart[F.i].win, 0, 1), mash = F.chart[F.i]?.type === "mash";
    pullTo = F.fish.mouth(tmpV); bend = .7 + A.kick * .45 + urgent * .3 + (mash ? .3 : 0) + F.pulse * .2;
    const amp = .04 + urgent * .1 + (mash ? .12 : 0);
    rodBuzz.set(Math.sin(t * 47) * amp, Math.sin(t * 61) * amp);
  } else rodBuzz.set(0, R.state === "bite" ? Math.sin(t * 50) * .08 : 0);
  placeRod(handW, rodDir, pullTo, bend);
  line.visible = R.state !== "idle";
  if (line.visible) drawLine(pullTo, F ? .05 : slack);
  line.material.color.set(F && F.noteT > F.chart[F.i].win * .6 ? "#ff4d6d" : "#ffffff");
}
function updateFight(dt, t) {
  if (!F) return;
  const f = F, n = f.chart[f.i];
  f.t += dt; f.noteT += dt; beatTick();
  if (f.noteT >= n.win) { miss(n.type === "mash" ? "힘이 모자라!" : "늦었어!"); if (!F) return; }
  const cn = F.chart[F.i];
  let k = clamp(1 - F.noteT / cn.win, 0, 1);
  if (cn.type === "mash") { updateMash(cn, dt); if (!F) return; if (F.chart[F.i] === cn) drawMash(cn, k, t); }
  else setFrame(k);
  if (F.chart[F.i] !== cn) return;
  if (cn.type === "mash") k = F.gauge < .25 ? F.gauge / .25 * .4 : .4 + F.gauge * .6; // 원이 작아지면 화면이 빨갛게
  $("cur").classList.toggle("urgent", cn.type === "mash" ? F.mood === "slow" : k < .4);
  $("danger").style.boxShadow = k < .4 ? `inset 0 0 ${60 + Math.sin(t * 30) * 20}px ${20 + (1 - k) * 30}px rgba(255, 40, 70, ${((.4 - k) * 1.3).toFixed(2)})` : "";
  // 끌어온 정도
  const prog = f.got / f.weight;
  $("reelFill").style.width = `${Math.round(prog * 100)}%`;
  const dist = Math.max(3.2, f.dist0 * (1 - prog * .7));
  $("reelText").textContent = `${dist.toFixed(1)}m`;
  // 물고기: 줄 끝에서 몸부림 (급할수록, 연타 중일수록 더 세게)
  const ax = angler.position.x, az = angler.position.z;
  const dir = _a.set(f.from.x - ax, 0, f.from.z - az).normalize();
  const sway = Math.sin(t * 1.7) * 1.4 * (1 - prog * .6) + (cn.zig ? A.side * -1.4 : 0);
  const fx = ax + dir.x * dist + dir.z * sway, fz = az + dir.z * dist - dir.x * sway;
  f.pulse = Math.max(0, f.pulse - dt * 3);
  const mash = cn.type === "mash";
  if (mash && Math.random() < dt * 1.6 && f.leap <= 0) f.leapV = 4.5; // 연타 중엔 물 밖으로 펄쩍
  f.leapV -= 15 * dt; f.leap = Math.max(0, f.leap + f.leapV * dt);
  if (f.leap === 0 && f.leapV < -3) { splash(fx, fz, 18, 1.1); ripple(fx, fz, 1.4); SFX.splash(); shake = Math.max(shake, .25); }
  if (f.leap === 0) f.leapV = Math.max(f.leapV, 0);
  const g = f.fish.group;
  g.position.set(fx, f.fish.halfH * .35 + f.leap + Math.abs(Math.sin(t * 10)) * .05, fz);
  const away = Math.atan2(fz - az, fx - ax);
  f.heading = lerp(f.heading, away + Math.sin(t * 2.3) * .7 + (mash ? Math.sin(t * 9) * .5 : 0), ease(4, dt));
  g.rotation.order = "YXZ"; g.rotation.y = -f.heading; g.rotation.z = f.leap > 0 ? Math.sin(t * 8) * .6 : 0;
  const urg = 1 - k;
  f.phase += dt * (6 + urg * 10 + (mash ? 12 : 0) + f.pulse * 8) * Math.PI;
  const amp = .2 + urg * .2 + (mash ? .25 : 0) + f.pulse * .2;
  f.fish.wave(f.phase, amp, Math.sin(t * 1.4) * (.12 + urg * .15), amp * .35);
  f.fish.body.rotation.x = Math.sin(f.phase * .5) * (.15 + urg * .3);
  if (Math.random() < dt * (8 + urg * 30)) splash(fx - Math.cos(f.heading) * f.fish.len * .4, fz - Math.sin(f.heading) * f.fish.len * .4, 2, .5 + urg * .5);
  if (Math.random() < dt * 2.5) ripple(fx, fz, .5 + f.fish.len * .4);
}
function updateShow(dt, t) {
  if (!show) return;
  const s = show, f = s.fish, g = f.group;
  s.t += dt;
  s.vy -= 14 * dt; s.y += s.vy * dt;
  if (s.y <= 0) { s.y = 0; s.vy = 0; s.next -= dt; if (s.next <= 0) { s.vy = rand(2.6, 4.4); s.next = rand(.25, .6); if (Math.random() < .3) s.roll = -s.roll; s.heading += rand(-.7, .7); } }
  const air = s.y > 0, w = t * (air ? 18 : 12), amp = air ? .5 : .25;
  f.wave(w, amp * .5, Math.sin(w * .5) * amp * .5, amp * .3);
  g.rotation.order = "YXZ"; g.rotation.y = s.heading; g.rotation.z = 0;
  f.body.rotation.x = s.roll;
  g.position.y = .5 + f.len * .1 + s.y;
  if (s.release && s.t > 1.6) { // 놔주자급: 물로 퐁당 돌려보낸다
    if (!s.toss) { s.toss = 1; s.vy = 5; s.heading = -Math.PI / 2; }
    g.position.z -= dt * 3.2; g.position.y = .5 + s.y;
    if (s.y <= 0 && s.t > 1.9) { splash(g.position.x, g.position.z, 14, .8); ripple(g.position.x, g.position.z, .8); SFX.plop(); f.dispose(); show = null; resetRod(); }
    return;
  }
  if (s.t > 2.8) { g.scale.multiplyScalar(Math.pow(.02, dt)); if (s.t > 3.3) { f.dispose(); show = null; resetRod(); } }
}

// ------------------------------------------------------------------ 진행
function start() {
  audio(); beatStop(); document.body.classList.remove("fighting");
  if (F) { F.fish.dispose(); F = null; }
  if (show) { show.fish.dispose(); show = null; }
  Object.assign(G, { playing: true, time: 180, score: 0, caught: [], book: new Set(), ending: false });
  $("score").textContent = 0; $("count").textContent = 0; $("timerChip").classList.remove("low");
  $("start").hidden = true; $("end").hidden = true; $("fight").hidden = true; $("card").hidden = true;
  resetSpots(); resetRod();
  shout("시작!", "sun", 1);
}
function finish() {
  if (!G.playing) return;
  G.playing = false; G.ending = false; resetRod(); hint("");
  let best = 0; try { best = +localStorage.getItem("jamfish-best") || 0; if (G.score > best) { best = G.score; localStorage.setItem("jamfish-best", String(best)); } } catch { best = Math.max(best, G.score); }
  $("endScore").textContent = `${G.score}점`;
  $("endBest").textContent = G.score >= best && G.score > 0 ? "최고 기록이에요!" : `최고 기록 ${best}점`;
  $("endList").innerHTML = placeIds().map((id) => {
    const list = G.caught.filter((c) => c.id === id), top = list.reduce((m, c) => (!m || c.cm > m.cm ? c : m), null);
    return `<div class="${list.length ? "" : "none"}"><b class="nm">${SPECIES[id].name}</b><span>${top ? `${list.length}마리 · ${top.grade ? top.grade + " " : ""}${top.cm}cm` : "-"}</span></div>`;
  }).join("");
  $("card").hidden = true; card = 0;
  $("end").hidden = false;
}
async function choosePlace(place) {
  audio();
  document.querySelectorAll("[data-place]").forEach((b) => { b.disabled = true; });
  setPlace(place); renderLegend();
  await loadPlace(place);
  document.querySelectorAll("[data-place]").forEach((b) => { b.disabled = false; });
  start();
}
document.querySelectorAll("[data-place]").forEach((b) => b.addEventListener("click", () => choosePlace(b.dataset.place)));
$("againBtn").addEventListener("click", start);
$("placeBtn").addEventListener("click", () => { $("end").hidden = true; $("start").hidden = false; });

const CAM = { pos: new THREE.Vector3(1.4, 6.4, STAND.z + 7.2), look: new THREE.Vector3(0, 0, POND.z) };
let last = performance.now(), clock = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; clock += dt;
  const t = clock;
  if (G.playing) {
    G.time -= dt;
    const left = Math.max(0, G.time);
    $("timer").textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
    $("timerChip").classList.toggle("low", left < 20);
    if (G.time <= 0 && !G.ending) { if (F) { G.ending = true; shout("마지막 승부!", "hot", 1.2); } else finish(); }
  }
  stepSpots(dt, t); stepBubbles(dt, t);
  updateAngler(dt, t);
  updateFight(dt, t);
  updateRodAndLine(dt, t);
  updateShow(dt, t);
  stepDrops(dt); stepRings(dt);
  if (card > 0) { card -= dt; if (card <= 0) $("card").hidden = true; }
  waterMat.uniforms.t.value = t;
  if (seaGroup.visible) buoys.forEach((b, i) => { b.position.y = .05 + Math.sin(t * 1.6 + i * 2) * .07; b.rotation.z = Math.sin(t * 1.2 + i) * .12; });
  // 카메라: 평소엔 연못 전체, 싸울 때는 낚시꾼 어깨 너머로 다가가 물고기를 본다
  const gp = _c.set(1.4, 6.4, STAND.z + 7.2), gl = _d.set(0, 0, POND.z + 1);
  if (F) { const fp = F.fish.group.position; gp.set(fp.x * .35 + 1.2, 4.6, STAND.z + 5); gl.set(fp.x * .7, 0, (fp.z + STAND.z) / 2 - 1.2); }
  else if (show) { const p = show.fish.group.position; gp.set(p.x + .8, 3.2, p.z + 4.2); gl.set(p.x - .3, .6, p.z - 1); }
  if (camera.aspect < .8) gp.sub(gl).multiplyScalar(1.15).add(gl);
  CAM.pos.lerp(gp, ease(2.2, dt)); CAM.look.lerp(gl, ease(2.6, dt));
  shake = Math.max(0, shake - dt * 1.6);
  camera.position.set(CAM.pos.x + Math.sin(t * 53) * shake * .35, CAM.pos.y + Math.cos(t * 47) * shake * .25, CAM.pos.z);
  punch = lerp(punch, 0, ease(9, dt));
  const baseFov = camera.aspect < .8 ? 58 : 40;
  camera.fov = baseFov - punch * 4 - (F ? 2 + (F.chart[F.i]?.type === "mash" ? 3 : 0) : 0); camera.updateProjectionMatrix();
  camera.lookAt(CAM.look);
  // 집중선: 연타·우다다·급할 때
  const hype = F && (F.chart[F.i]?.type === "mash" || F.chart[F.i]?.burst || F.noteT / F.chart[F.i].win > .6);
  $("speed").classList.toggle("on", !!hype);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
resetSpots();
requestAnimationFrame(frame);

// ------------------------------------------------------------------ 모델 불러오기
// 낚시꾼은 바로, 물고기는 고른 낚시터 것만 불러온다(민물·바다 합치면 크니까)
let MODEL_LIST = [];
const loading = {};
function loadPlace(place) {
  if (loading[place]) return loading[place];
  const list = MODEL_LIST.filter((m) => SPECIES[m.id]?.water === place && !models[m.id]);
  let done = 0;
  const show = () => { $("loadText").textContent = `${PLACES[place].name} 물고기 부르는 중… ${done}/${list.length}`; };
  show();
  return (loading[place] = Promise.all(list.map(async (m) => {
    try { await loadFish(m.id, m.file, m.yaw, m.roll); } catch (e) { console.warn("모델", m.id, e); }
    done++; show();
  })).then(() => { $("loadText").textContent = "준비 완료!"; }));
}
(async () => {
  try { MODEL_LIST = await (await fetch("models.json", { cache: "no-cache" })).json(); } catch { MODEL_LIST = []; }
  const a = MODEL_LIST.find((m) => m.id === "angler");
  $("loadText").textContent = "낚시꾼 준비 중…";
  if (a) try { await loadAngler(a.file, a.yaw); } catch (e) { console.warn("낚시꾼", e); }
  $("loadText").textContent = "낚시터를 골라요!";
  document.querySelectorAll("[data-place]").forEach((b) => { b.disabled = false; });
  loadPlace("fresh"); // 미리 받아 두기
})();

// 점검용 훅
window.__fish = { setPlace, loadPlace, choosePlace, GRADES, SAMPLES, G, R, spots, SPECIES, castTo, press, start, finish, models, get F() { return F; }, newSpot, hook };
