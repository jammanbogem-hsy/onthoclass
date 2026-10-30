// 아바타: 바탕 몸(Tripo, 반팔·반바지) + 몸에 꼭 맞는 옷 껍데기(비옷·조끼·장화) + 딱딱한 아이템(Tripo 모자·안경·배낭…)
// 옷 껍데기: 바탕 몸 겉면을 상자 모양으로 잘라(삼각형을 평면에서 정확히 자름) 살짝 부풀린 것이라 몸을 뚫거나 뜨지 않는다
import * as THREE from "three";

// mesh: 바탕 몸 메시, toLocal: 메시 좌표 → 낚시꾼 몸 좌표(발바닥 y=0, 앞이 -z, 옆 x)
export function analyze(mesh, toLocal) {
  const g = mesh.geometry, pos = g.attributes.position, n = pos.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  const nor = g.attributes.normal, P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(toLocal);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(toLocal); P.set([v.x, v.y, v.z], i * 3);
    v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); N.set([v.x, v.y, v.z], i * 3);
  }
  // 같은 자리 꼭짓점(텍스처 이음매)끼리 법선을 평균: 부풀려도 틈이 벌어지지 않게
  const groups = new Map();
  for (let i = 0; i < n; i++) { const k = `${Math.round(P[i * 3] * 2000)},${Math.round(P[i * 3 + 1] * 2000)},${Math.round(P[i * 3 + 2] * 2000)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
  const SN = new Float32Array(n * 3);
  for (const ids of groups.values()) { let x = 0, y = 0, z = 0; for (const i of ids) { x += N[i * 3]; y += N[i * 3 + 1]; z += N[i * 3 + 2]; } const l = Math.hypot(x, y, z) || 1; for (const i of ids) SN.set([x / l, y / l, z / l], i * 3); }
  // 기준점: 머리(위 45%)·몸통·주먹
  let H = 0; for (let i = 0; i < n; i++) H = Math.max(H, P[i * 3 + 1]);
  const hx = [], hz = [], q = (a, t) => a[Math.floor((a.length - 1) * t)];
  let tb = -1e9, tf = 1e9, hand = 1e9;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1] / H, z = P[i * 3 + 2];
    if (y > .55) { hx.push(x); hz.push(z); }
    if (y > .3 && y < .4 && Math.abs(x) < .08 * H) { tb = Math.max(tb, z); } // 등(어깨까지 내려온 머리카락은 빼려고 가슴 아래만)
    if (y > .3 && y < .5) hand = Math.min(hand, z);
    if (y > .24 && y < .3) tf = Math.min(tf, z); // 배(팔 아래)
  }
  hx.sort((a, b) => a - b); hz.sort((a, b) => a - b);
  const A = {
    H, hand,
    head: { top: H, cx: (q(hx, .02) + q(hx, .98)) / 2, cz: (q(hz, .02) + q(hz, .98)) / 2, w: q(hx, .995) - q(hx, .005), front: q(hz, .003), back: q(hz, .997) },
    torso: { back: tb, front: tf },
  };
  // 주먹: 양쪽(x<0, x>0)에서 가장 앞(z 최소)인 점 둘레의 가운데. 비옷·조끼는 이 둘레(구)를 빼서 주먹을 밖에 둔다
  A.fists = [-1, 1].map((sx) => {
    let tip = -1; for (let i = 0; i < n; i++) { const x = P[i * 3], y = P[i * 3 + 1] / H; if (y > .28 && y < .47 && x * sx > 0 && (tip < 0 || P[i * 3 + 2] < P[tip * 3 + 2])) tip = i; }
    if (tip < 0) return null;
    const c = [0, 0, 0]; let m = 0;
    for (let i = 0; i < n; i++) if (Math.hypot(P[i * 3] - P[tip * 3], P[i * 3 + 1] - P[tip * 3 + 1], P[i * 3 + 2] - P[tip * 3 + 2]) < .055 * H) { c[0] += P[i * 3]; c[1] += P[i * 3 + 1]; c[2] += P[i * 3 + 2]; m++; }
    return c.map((v) => v / m);
  }).filter(Boolean);
  // 높이 y 에서 얼굴 가운데 앞면(z 가장 작은 값): 안경·수염 붙일 자리
  A.frontAt = (yq) => { let z = 1e9; for (let i = 0; i < n; i++) if (Math.abs(P[i * 3] - A.head.cx) < .06 * H && Math.abs(P[i * 3 + 1] - yq) < .02 * H) z = Math.min(z, P[i * 3 + 2]); return z < 1e8 ? z : A.head.front; };
  return { P, SN, n, index: g.index, A };
}

// 상자(평면 여러 개) 안쪽만 남기고 법선 쪽으로 off 만큼 부풀린 껍데기. planes: [[nx,ny,nz,d]] → nx*x+ny*y+nz*z+d >= 0 이 안쪽
export function shell(S, planes, off, material) {
  const idx = S.index ? S.index.array : null, tri = idx ? idx.length / 3 : S.n / 3, out = [], nrm = [];
  const vert = (i) => [S.P[i * 3], S.P[i * 3 + 1], S.P[i * 3 + 2], S.SN[i * 3], S.SN[i * 3 + 1], S.SN[i * 3 + 2]];
  const lerp = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
  for (let t = 0; t < tri; t++) {
    let poly = [0, 1, 2].map((k) => vert(idx ? idx[t * 3 + k] : t * 3 + k));
    for (const pl of planes) {
      let [a, b, c, d] = pl;
      if (pl.length === 5) { // 구(주먹): 삼각형 가운데에서 구 중심 쪽 방향의 접평면으로 자른다(바깥만 남김)
        const [, cx, cy, cz, r] = pl, m = [0, 1, 2].map((k) => poly.reduce((t, p) => t + p[k], 0) / poly.length), dx = m[0] - cx, dy = m[1] - cy, dz = m[2] - cz, l = Math.hypot(dx, dy, dz);
        if (l > r * 1.6) continue;
        if (l < 1e-6) { poly = []; break; }
        a = dx / l; b = dy / l; c = dz / l; d = -(a * cx + b * cy + c * cz) - r;
      }
      const nxt = [], D = poly.map((p) => a * p[0] + b * p[1] + c * p[2] + d);
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k], q = poly[(k + 1) % poly.length], dp = D[k], dq = D[(k + 1) % poly.length];
        if (dp >= 0) nxt.push(p);
        if ((dp >= 0) !== (dq >= 0)) nxt.push(lerp(p, q, dp / (dp - dq)));
      }
      poly = nxt; if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    const o = poly.map((p) => { const l = Math.hypot(p[3], p[4], p[5]) || 1; return [p[0] + p[3] / l * off, p[1] + p[4] / l * off, p[2] + p[5] / l * off, p[3] / l, p[4] / l, p[5] / l]; });
    for (let k = 1; k + 1 < o.length; k++) for (const q of [o[0], o[k], o[k + 1]]) { out.push(q[0], q[1], q[2]); nrm.push(q[3], q[4], q[5]); }
  }
  // 법선은 바탕 몸의 매끈한 법선을 그대로(삼각형마다 각진 면이 보이지 않게)
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  return new THREE.Mesh(g, material);
}

// 옷 모양(상자). 좌표는 낚시꾼 몸 기준(키 H, 앞 -z, 옆 x). P: 몸마다 다른 값(단발머리처럼 어깨까지 내려온 머리는 빼야 하니까)
export function cut(S, kind, P = {}) {
  const { H, hand, torso } = S.A, Y = (k) => k * H;
  const above = (y) => [0, 1, 0, -y], below = (y) => [0, -1, 0, y], behind = (z) => [0, 0, 1, -z];
  const hairOut = [...(P.backZ != null ? [[0, 0, -1, P.backZ]] : []), ...(P.sideX != null ? [[1, 0, 0, P.sideX], [-1, 0, 0, P.sideX]] : [])];
  const fists = (r) => S.A.fists.map((f) => ["s", f[0], f[1], f[2], Y(r)]);
  if (kind === "coat") return [above(Y(.195)), below(Y(P.coatTop ?? .497)), ...(P.handPlane ? [behind(hand + Y(.07))] : fists(.06)), ...hairOut]; // 반바지까지 덮는 긴 비옷, 주먹은 밖에
  // 조끼: 앞이 트인 모양(팔뚝은 가슴 앞에 있어서 그 앞은 뺀다)
  if (kind === "vest") { const k = .9, w = Y(P.vestW ?? .118), y0 = Y(.38); return [above(Y(.26)), below(Y(P.vestTop ?? .49)), behind(P.vestFront ?? torso.front + Y(P.vestOpen ?? 0)), [-1, -k, 0, w + k * y0], [1, -k, 0, w + k * y0], ...fists(.075), ...hairOut]; } // 팔·소매는 밖에, 어깨로 갈수록 좁게
  if (kind === "boots") return [below(Y(.19))];
  return [];
}
