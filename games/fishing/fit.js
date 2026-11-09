// 얼굴·목 맞춤: 손으로 고른 숫자 대신 실제 모델을 재서 붙인다
// - 몸을 정면에서 직교 카메라로 그려(GPU, 한 번) 픽셀마다 가장 앞 표면의 깊이·색·머리카락 여부를 읽는다 → 피부 깊이 지도, 눈 위치
// - 안경·수염은 같은 격자로 아이템 뒷면(앞부분만)을 그려, 피부에 '닿을 때까지' 뒤로 민다(앞머리·이마가 아니라 콧등·볼에 닿게)
// - 목은 높이마다 단면 반지름을 재서 턱 아래 가장 가는 곳을 찾는다(목도리 자리)
// 좌표는 몸 기준(발바닥 0, 앞 -z, 키 H)
import * as THREE from "three";

const VS = `attribute float hairW; varying vec3 vB; varying vec2 vUv; varying float vH;
void main() { vUv = uv; vH = hairW; vec4 w = modelMatrix * vec4(position, 1.); vB = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
// mode 0: r,g = 깊이(16비트), b = 덮임, a = 머리카락 / mode 1: 텍스처 색
const FS = `precision highp float; uniform int mode; uniform float z0, z1, zClip, zMin, back; uniform sampler2D map; uniform bool hasMap; varying vec3 vB; varying vec2 vUv; varying float vH;
void main() {
  if (vB.z > zClip || vB.z < zMin) discard; // 일부 깊이만(안경테·멜빵 뺀 가방 몸통)
  if (mode == 1) { gl_FragColor = vec4(hasMap ? texture2D(map, vUv).rgb : vec3(.5), 1.); return; }
  float t = clamp((vB.z - z0) / (z1 - z0), 0., 1.) * 255.; gl_FragColor = vec4(floor(t) / 255., fract(t), 1., vH);
}`;
const mats = new Map();
function mat(mode, map, U) {
  const k = mode + ":" + (map?.uuid || "");
  let m = mats.get(k);
  if (!m) { m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide, uniforms: { mode: { value: mode }, z0: { value: 0 }, z1: { value: 1 }, zClip: { value: 1e9 }, zMin: { value: -1e9 }, back: { value: 0 }, map: { value: map || null }, hasMap: { value: !!map } } }); mats.set(k, m); }
  for (const [n, v] of Object.entries(U)) m.uniforms[n].value = v;
  return m;
}

// 격자 G = {x0,x1,y0,y1,nx,ny}. parts: [{geometry, matrix(→몸 좌표), map}]. back: 뒤(+z)에서 앞으로 보며 가장 뒤 표면을 잰다
// zClip: 앞에서 볼 땐 이보다 뒤, 뒤에서 볼 땐 이보다 앞만 그린다(안경의 앞부분만 재기)
function render(renderer, parts, G, { z0, z1, back = false, zClip, zMin, mode = 0 }) {
  const sc = new THREE.Scene(), w = G.x1 - G.x0, h = G.y1 - G.y0;
  const U = { z0, z1, back: back ? 1 : 0, zClip: zClip ?? 1e9, zMin: zMin ?? -1e9 };
  for (const p of parts) { const m = new THREE.Mesh(p.geometry, mat(mode, mode ? p.map : null, U)); m.matrixAutoUpdate = false; m.matrix.copy(p.matrix); m.frustumCulled = false; sc.add(m); }
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0, z1 - z0 + .02);
  cam.position.set((G.x0 + G.x1) / 2, (G.y0 + G.y1) / 2, back ? z1 + .01 : z0 - .01); if (!back) cam.rotation.y = Math.PI;
  cam.updateMatrixWorld(true);
  const rt = new THREE.WebGLRenderTarget(G.nx, G.ny), prev = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(), buf = new Uint8Array(G.nx * G.ny * 4);
  renderer.setRenderTarget(rt); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(sc, cam);
  renderer.readRenderTargetPixels(rt, 0, 0, G.nx, G.ny, buf);
  renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca); rt.dispose();
  // 앞에서 본 그림은 좌우가 뒤집혀 있다 → 배열은 언제나 x0→x1, y0→y1 순서로
  const out = new Uint8Array(buf.length);
  for (let j = 0; j < G.ny; j++) for (let c = 0; c < G.nx; c++) { const i = back ? c : G.nx - 1 - c; out.set(buf.subarray((j * G.nx + c) * 4, (j * G.nx + c) * 4 + 4), (j * G.nx + i) * 4); }
  return out;
}
const depthOf = (px, k, z0, z1) => px[k * 4 + 2] > 127 ? z0 + (px[k * 4] + px[k * 4 + 1] / 255) / 255 * (z1 - z0) : NaN;

// 몸 얼굴 스캔(몸마다 한 번). mesh: 바탕 몸(hairW 속성이 있음), toBody: 메시→몸 좌표
export function scanFace(renderer, mesh, toBody, A) {
  const H = A.H, hd = A.head, G = { x0: hd.cx - hd.w * .6, x1: hd.cx + hd.w * .6, y0: H * .66, y1: H * 1.0 };
  G.nx = 160; G.ny = Math.round(G.nx * (G.y1 - G.y0) / (G.x1 - G.x0));
  const z0 = hd.front - H * .05, z1 = hd.back + H * .02, parts = [{ geometry: mesh.geometry, matrix: toBody, map: mesh.material.map }];
  const dp = render(renderer, parts, G, { z0, z1 }), cp = render(renderer, parts, G, { z0, z1, mode: 1 });
  const N = G.nx * G.ny, skin = new Float32Array(N).fill(NaN), surf = new Float32Array(N).fill(NaN), dark = new Uint8Array(N);
  const dx = (G.x1 - G.x0) / G.nx, dy = (G.y1 - G.y0) / G.ny, X = (i) => G.x0 + (i + .5) * dx, Y = (j) => G.y0 + (j + .5) * dy;
  for (let k = 0; k < N; k++) {
    const z = depthOf(dp, k, z0, z1); if (Number.isNaN(z)) continue;
    surf[k] = z; const hair = dp[k * 4 + 3] > 127; if (!hair) skin[k] = z;
    const lum = (.2126 * cp[k * 4] + .7152 * cp[k * 4 + 1] + .0722 * cp[k * 4 + 2]) / 255;
    if (!hair && lum < .09) dark[k] = 1;
  }
  // 눈: 얼굴 위쪽 피부에 둘러싸인 어두운 덩어리(머리카락에 붙은 것은 앞머리 끝이라 뺀다). 좌우 덩어리 중 높이가 맞는 가장 큰 쌍
  const seen = new Uint8Array(N), blobs = [];
  for (let k = 0; k < N; k++) {
    if (!dark[k] || seen[k] || Y(k / G.nx | 0) < H * .74) continue;
    const q = [k], c = { n: 0, x: 0, y: 0, edge: false }; seen[k] = 1;
    while (q.length) {
      const t = q.pop(), ti = t % G.nx, tj = t / G.nx | 0; c.n++; c.x += X(ti); c.y += Y(tj);
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = ti + a, nj = tj + b, nk = nj * G.nx + ni; if (ni < 0 || nj < 0 || ni >= G.nx || nj >= G.ny) continue; if (Number.isNaN(skin[nk])) c.edge = true; else if (dark[nk] && !seen[nk]) { seen[nk] = 1; q.push(nk); } }
    }
    c.x /= c.n; c.y /= c.n; if (!c.edge && c.n >= 6) blobs.push(c);
  }
  let pair = null;
  for (const l of blobs) for (const r of blobs) {
    if (l.x > hd.cx - hd.w * .06 || r.x < hd.cx + hd.w * .06 || Math.abs(l.y - r.y) > H * .02) continue;
    const s = Math.min(l.n, r.n) - Math.abs(l.x + r.x - 2 * hd.cx) / dx; if (!pair || s > pair.s) pair = { s, l, r };
  }
  const eyes = pair ? [pair.l, pair.r] : [];
  const face = { G, skin, surf, z0, z1, X, Y, dx, dy };
  if (eyes.length === 2) { face.eyes = eyes.map(({ x, y, n }) => ({ x, y, n })); face.eyeY = (eyes[0].y + eyes[1].y) / 2; face.eyeX = (eyes[0].x + eyes[1].x) / 2; }
  face.neck = neckOf(mesh, toBody, A);
  // 머리 옆 피부(머리카락 아닌 꼭짓점): 안경 다리가 지나갈 높이·깊이에서 얼굴 가운데부터 피부까지 가장 먼 가로 거리
  const pos = mesh.geometry.attributes.position, hw = mesh.geometry.attributes.hairW, v = new THREE.Vector3(), side = [];
  for (let i = 0; i < pos.count; i++) { if (hw && hw.getX(i) > .5) continue; v.fromBufferAttribute(pos, i).applyMatrix4(toBody); if (v.y > H * .7) side.push(v.x - hd.cx, v.y, v.z); }
  face.sideAt = (y0, y1, z0, z1) => { let m = 0; for (let i = 0; i < side.length; i += 3) if (side[i + 1] > y0 && side[i + 1] < y1 && side[i + 2] > z0 && side[i + 2] < z1) m = Math.max(m, Math.abs(side[i])); return m; };
  return face;
}

// 목: 어깨~턱 사이 높이마다 몸 가운데 둘레 점들의 평균 반지름을 재서 가장 가는 높이(옷 껍데기 없는 맨몸 기준)
function neckOf(mesh, toBody, A) {
  const H = A.H, pos = mesh.geometry.attributes.position, v = new THREE.Vector3(), cz = (A.torso.front + A.torso.back) / 2, bins = new Map();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(toBody); const y = v.y / H; if (y < .64 || y > .86) continue;
    const r = Math.hypot(v.x - A.head.cx, v.z - cz); if (r > H * .12) continue; // 팔·주먹은 빼고
    const b = Math.round(y * 200); let e = bins.get(b); if (!e) bins.set(b, e = { r: [], z: [], x: [] }); e.r.push(r); e.z.push(v.z); e.x.push(v.x);
  }
  let best = null;
  for (const [b, e] of bins) { if (e.r.length < 8) continue; e.r.sort((p, q) => p - q); const r = e.r[Math.floor(e.r.length * .9)]; if (!best || r < best.r) best = { y: b / 200 * H, r, zf: Math.min(...e.z), zb: Math.max(...e.z) }; }
  return best;
}

// 안경·수염: o(몸 좌표에 놓인 아이템, 아직 부모 없음)의 앞부분 뒷면이 피부에 gap 만큼 떨어져 닿도록 z를 옮긴다
// 반환: 옮긴 거리와 닿은 픽셀 수(검증용)
// xIn: 테 가운데에서 이 비율(반너비 기준) 안쪽만 닿게 본다 — 바깥쪽 다리·경첩이 볼 옆에 먼저 닿아 테가 떠 버리는 것 막기
// yMax: 이 높이보다 위(테 윗단)는 닿는지 보지 않는다 — 안경은 콧등·아래 테로 얹히고, 이마가 눈보다 튀어나온 얼굴에서 윗단 때문에 뜨지 않게
export function pushToSkin(renderer, o, face, { slab = .4, gap = .004, xIn = .8, yMax = 1e9 } = {}) {
  o.updateMatrixWorld(true);
  const parts = [], box = new THREE.Box3().setFromObject(o);
  o.traverse((m) => { if (m.isMesh) parts.push({ geometry: m.geometry, matrix: m.matrixWorld.clone() }); });
  const { G, skin, z0, z1 } = face, zFront = box.min.z, zClip = zFront + (box.max.z - zFront) * slab;
  const iz0 = zFront - .02, iz1 = zClip + .02, rp = render(renderer, parts, G, { z0: iz0, z1: iz1, back: true, zClip: zClip });
  let need = Infinity, hits = 0, at = null; const xc = (box.min.x + box.max.x) / 2, xr = (box.max.x - box.min.x) / 2 * xIn;
  for (let k = 0; k < G.nx * G.ny; k++) {
    const r = depthOf(rp, k, iz0, iz1); if (Number.isNaN(r) || Number.isNaN(skin[k])) continue;
    if (Math.abs(face.X(k % G.nx) - xc) > xr || face.Y(k / G.nx | 0) > yMax) continue;
    hits++; const d = skin[k] - gap - r; if (d < need) { need = d; at = [face.X(k % G.nx), face.Y(k / G.nx | 0), skin[k], r]; }
  }
  if (!hits) return { dz: 0, hits: 0, box };
  o.position.z += need; o.updateMatrixWorld(true);
  return { dz: need, hits, box, at };
}

// 아이템의 앞부분(slab)을 정면에서 본 덮인 영역의 가운데·좌우 반쪽 가운데(렌즈 자리) — 아이템 단위 좌표
// xIn: 가운데 이 비율(전체 너비 기준 반쪽) 안만 — 옆에 달린 스노클 관 같은 것은 빼고
export function lensOf(o, slab = .4, xIn = .35, toLocal = null) {
  o.updateMatrixWorld(true);
  const pts = [], v = new THREE.Vector3();
  o.traverse((m) => { if (!m.isMesh) return; const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); if (toLocal) v.applyMatrix4(toLocal); pts.push(v.x, v.y, v.z); } });
  const box = new THREE.Box3(); for (let i = 0; i < pts.length; i += 3) box.expandByPoint(v.set(pts[i], pts[i + 1], pts[i + 2]));
  const zc = box.min.z + (box.max.z - box.min.z) * slab, L = { n: 0, x: 0, y: 0 }, R = { n: 0, x: 0, y: 0 }, cx = (box.min.x + box.max.x) / 2;
  for (let i = 0; i < pts.length; i += 3) { const x = pts[i], y = pts[i + 1], z = pts[i + 2]; if (z > zc || Math.abs(x - cx) > (box.max.x - box.min.x) * xIn) continue; const s = x < cx ? L : R; s.n++; s.x += x; s.y += y; }
  const c = (s) => s.n ? { x: s.x / s.n, y: s.y / s.n } : null;
  return { L: c(L), R: c(R), y: (L.y + R.y) / Math.max(1, L.n + R.n), box };
}

// 입은 몸(맨몸+옷 껍데기)의 등 지도: 뒤에서 본 가장 뒤 표면 z. parts: [{geometry, matrix}] (몸 좌표)
export function scanBack(renderer, parts, A) {
  const H = A.H, G = { x0: -H * .32, x1: H * .32, y0: H * .2, y1: H * .9, nx: 96 }; G.ny = Math.round(G.nx * (G.y1 - G.y0) / (G.x1 - G.x0));
  const z0 = A.torso.front - H * .15, z1 = A.torso.back + H * .2, px = render(renderer, parts, G, { z0, z1, back: true }), N = G.nx * G.ny, d = new Float32Array(N);
  for (let k = 0; k < N; k++) d[k] = depthOf(px, k, z0, z1);
  const dx = (G.x1 - G.x0) / G.nx, dy = (G.y1 - G.y0) / G.ny, X = (i) => G.x0 + (i + .5) * dx, Y = (j) => G.y0 + (j + .5) * dy;
  // (x,y) 둘레에서 가장 뒤 표면(없으면 NaN)
  const at = (x, y0, y1, xr = dx) => { let m = NaN; for (let j = 0; j < G.ny; j++) { const y = Y(j); if (y < y0 || y > y1) continue; for (let i = 0; i < G.nx; i++) { if (Math.abs(X(i) - x) > xr) continue; const v = d[j * G.nx + i]; if (!Number.isNaN(v)) m = Number.isNaN(m) ? v : Math.max(m, v); } } return m; };
  return { G, d, X, Y, dx, dy, at };
}

// 등 아이템: 앞면(멜빵처럼 앞쪽 skip 비율은 빼고)이 등 표면에 gap 만큼 떨어져 닿도록 앞으로 당긴다
export function pushOntoBack(renderer, o, back, { skip = .2, gap = .004, xIn = .7 } = {}) {
  o.updateMatrixWorld(true);
  const parts = [], box = new THREE.Box3().setFromObject(o);
  o.traverse((m) => { if (m.isMesh) parts.push({ geometry: m.geometry, matrix: m.matrixWorld.clone() }); });
  const { G, d } = back, zMin = box.min.z + (box.max.z - box.min.z) * skip, iz0 = zMin - .02, iz1 = box.max.z + .02;
  const fp = render(renderer, parts, G, { z0: iz0, z1: iz1, zMin });
  let need = Infinity, hits = 0; const xc = (box.min.x + box.max.x) / 2, xr = (box.max.x - box.min.x) / 2 * xIn;
  for (let k = 0; k < G.nx * G.ny; k++) {
    const f = depthOf(fp, k, iz0, iz1); if (Number.isNaN(f) || Number.isNaN(d[k]) || Math.abs(back.X(k % G.nx) - xc) > xr) continue;
    hits++; need = Math.min(need, f - gap - d[k]);
  }
  if (!hits) return { dz: 0, hits: 0 };
  o.position.z -= need; o.updateMatrixWorld(true);
  return { dz: -need, hits };
}

// 입은 몸의 꼭짓점(몸 좌표) 모음: 목도리처럼 겉면을 감싸는 것의 둘레를 잴 때
export function wornPoints(parts) {
  const out = [], v = new THREE.Vector3();
  for (const p of parts) { const a = p.geometry.attributes.position; for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(p.matrix); out.push(v.x, v.y, v.z); } }
  return new Float32Array(out);
}
// 높이 y ± band 의 몸통 둘레(팔·주먹은 빼고, 가운데에서 rMax 안): 가운데 x,z 와 좌우·앞뒤 반지름
export function ringAt(P, y, band, cx, cz, rMax) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < P.length; i += 3) { if (Math.abs(P[i + 1] - y) > band || Math.hypot(P[i] - cx, P[i + 2] - cz) > rMax) continue; x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2]); }
  return x1 < x0 ? null : { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 };
}
// (x, y) 둘레 r 안에서 가장 앞 표면 z
export function frontAtP(P, x, y, r) { let z = 1e9; for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i] - x) < r && Math.abs(P[i + 1] - y) < r) z = Math.min(z, P[i + 2]); return z; }

// 점 모음 P 에서 가장 가까운 점까지 거리를 빨리 재는 격자(검증·머리핀 붙이기)
export function nearestOf(P, cell) {
  const grid = new Map(), key = (x, y, z) => `${x},${y},${z}`;
  for (let i = 0; i < P.length; i += 3) { const k = key(Math.floor(P[i] / cell), Math.floor(P[i + 1] / cell), Math.floor(P[i + 2] / cell)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i); }
  return (p) => {
    let m = Infinity; const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell);
    for (let r = 0; r <= 4 && m > (r - 1) * cell; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
      if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) !== r) continue;
      for (const i of grid.get(key(cx + a, cy + b, cz + c)) || []) m = Math.min(m, Math.hypot(P[i] - p.x, P[i + 1] - p.y, P[i + 2] - p.z));
    }
    return m;
  };
}
// o 를 dir 반대쪽으로 옮겨 가장 가까운 점이 gap 이 될 때까지(몇 번 되풀이) 붙인다. 반환: 남은 거리
export function settle(o, near, dir, gap) {
  const v = new THREE.Vector3(); let g = Infinity;
  for (let it = 0; it < 6; it++) {
    o.updateMatrixWorld(true); g = Infinity;
    o.traverse((m) => { if (!m.isMesh) return; const a = m.geometry.attributes.position, st = Math.max(1, Math.floor(a.count / 300)); for (let i = 0; i < a.count; i += st) g = Math.min(g, near(v.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld))); });
    if (Math.abs(g - gap) < gap * .3) break;
    o.position.addScaledVector(dir, -(g - gap));
  }
  return g;
}
