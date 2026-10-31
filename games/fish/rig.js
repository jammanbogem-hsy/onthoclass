// 낚시꾼 뼈대: Tripo 몸은 뼈가 없는 한 덩어리라, 몸 비율(analyze 결과)에서 관절 자리를 정해 뼈를 심고
// 꼭짓점마다 가장 가까운 뼈 마디(선분) 몇 개에 무게를 나눠 준다(자동 스키닝). 옷 껍데기도 같은 뼈를 따라 움직인다.
// 좌표는 몸 기준(발바닥 0, 앞 -z, 키 H). 뼈의 쉬는 자세 = 모델 그대로(두 주먹을 가슴 앞에 모아 낚싯대를 쥔 자세), 회전 0
import * as THREE from "three";

const NAMES = ["hips", "spine", "chest", "head", "uArmL", "fArmL", "uArmR", "fArmR", "thighL", "shinL", "thighR", "shinR"];

// 팔꿈치: 어깨 아래·주먹 사이에서 팔(몸통 옆) 꼭짓점 중 가장 낮고 뒤쪽인 곳(굽힌 팔의 꺾인 끝)
function elbowOf(S, sx, sh, fist, torsoW) {
  const { P, n } = S, H = S.A.H; let best = null, m = [0, 0, 0], k = 0;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    if (x * sx < torsoW || y > sh[1] - .06 * H || y < fist[1] - .2 * H || z < fist[2] + .04 * H) continue;
    const s = -y + z * .5; if (!best || s > best.s) best = { s, x, y, z };
  }
  if (!best) return [sh[0] * 1.05, sh[1] - .17 * H, (fist[2] + sh[2]) / 2 + .05 * H];
  for (let i = 0; i < n; i++) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; if (x * sx > torsoW && Math.hypot(x - best.x, y - best.y, z - best.z) < .045 * H) { m[0] += x; m[1] += y; m[2] += z; k++; } }
  return [m[0] / k, m[1] / k + .015 * H, m[2] / k];
}

export function buildRig(S, prof = {}) {
  const A = S.A, H = A.H, zm = (A.torso.front + A.torso.back) / 2, shY = (prof.vestTopH ?? .76) * H - .035 * H, torsoW = (prof.vestW ?? .1) * H;
  const fist = (sx) => { const f = A.fists.find((f) => f[0] * sx > 0) || [sx * .06 * H, .66 * H, A.torso.front - .08 * H]; return f; };
  // 다리 가운데 x: 무릎 높이(키 27%)의 꼭짓점 |x| 평균
  let lx = 0, ln = 0; for (let i = 0; i < S.n; i++) if (Math.abs(S.P[i * 3 + 1] / H - .27) < .01) { lx += Math.abs(S.P[i * 3]); ln++; }
  lx = ln ? lx / ln : .055 * H;
  const J = {
    hips: [0, .5 * H, zm], spine: [0, .58 * H, zm], chest: [0, .66 * H, zm], head: [0, shY + .02 * H, zm],
    uArmL: [-torsoW - .015 * H, shY, zm], uArmR: [torsoW + .015 * H, shY, zm],
    thighL: [-lx, .49 * H, zm], thighR: [lx, .49 * H, zm], shinL: [-lx, .27 * H, zm], shinR: [lx, .27 * H, zm],
  };
  J.fArmL = elbowOf(S, -1, J.uArmL, fist(-1), torsoW); J.fArmR = elbowOf(S, 1, J.uArmR, fist(1), torsoW);
  const parent = { spine: "hips", chest: "spine", head: "chest", uArmL: "chest", fArmL: "uArmL", uArmR: "chest", fArmR: "uArmR", thighL: "hips", shinL: "thighL", thighR: "hips", shinR: "thighR" };
  const bones = {}, root = new THREE.Group(); root.name = "rig";
  for (const k of NAMES) {
    const b = new THREE.Bone(); b.name = k; bones[k] = b;
    const p = J[k], q = parent[k] ? J[parent[k]] : [0, 0, 0]; b.position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]); b.userData.rest = b.position.clone();
    (parent[k] ? bones[parent[k]] : root).add(b);
  }
  root.updateMatrixWorld(true);
  const list = NAMES.map((k) => bones[k]), skeleton = new THREE.Skeleton(list);
  // 무게용 마디(선분): 뼈 번호, 시작, 끝. 가슴은 어깨 사이 가로 마디도, 발은 발목→발끝
  const fL = fist(-1), fR = fist(1), toe = (x) => [x, .02 * H, A.torso.front - .05 * H];
  const seg = [
    [0, [0, .44 * H, zm], [0, .55 * H, zm]], [0, [-lx, .5 * H, zm], [lx, .5 * H, zm]],
    [1, [0, .55 * H, zm], [0, .63 * H, zm]],
    [2, [0, .63 * H, zm], [0, shY, zm]], [2, [-torsoW * .8, shY - .02 * H, zm], [torsoW * .8, shY - .02 * H, zm]],
    [3, [0, shY + .04 * H, A.head.cz], [0, H, A.head.cz]],
    [4, J.uArmL, J.fArmL], [5, J.fArmL, fL], [6, J.uArmR, J.fArmR], [7, J.fArmR, fR],
    [8, J.thighL, J.shinL], [9, J.shinL, [-lx, .06 * H, zm]], [9, [-lx, .06 * H, zm], toe(-lx)],
    [10, J.thighR, J.shinR], [11, J.shinR, [lx, .06 * H, zm]], [11, [lx, .06 * H, zm], toe(lx)],
  ].map(([b, a, c]) => ({ b, a: new THREE.Vector3(...a), c: new THREE.Vector3(...c) }));
  const hand = { L: new THREE.Vector3(fL[0] - J.fArmL[0], fL[1] - J.fArmL[1], fL[2] - J.fArmL[2]), R: new THREE.Vector3(fR[0] - J.fArmR[0], fR[1] - J.fArmR[1], fR[2] - J.fArmR[2]) };
  return { root, bones, skeleton, seg, J, H, hand, box: { w: torsoW, top: shY - .03 * H, front: A.torso.front - .025 * H } };
}

// 꼭짓점(몸 좌표)마다 가까운 마디 4개까지 무게(거리의 -6제곱). 같은 뼈 마디가 여럿이면 가까운 것 하나만
// off: 옷 껍데기처럼 몸에서 법선 방향으로 부풀린 것이면 그만큼 되돌린 자리(= 바로 아래 몸)로 재서 몸과 같은 무게를 받게 한다
export function skinWeights(geom, rig, toBody, off = 0) {
  const pos = geom.attributes.position, n = pos.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), v = new THREE.Vector3(), t = new THREE.Vector3(), ab = new THREE.Vector3(), eps = rig.H * .01;
  const best = new Float32Array(12);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i); if (toBody) v.applyMatrix4(toBody);
    if (off) { t.fromBufferAttribute(geom.attributes.normal, i); v.addScaledVector(t, -off); }
    best.fill(0);
    // 몸통 안(옆구리·가슴)은 팔뼈를 따르지 않는다: 위팔이 몸통 바로 옆에 붙어 있어 팔을 들면 옆구리가 같이 딸려 올라가던 것
    const inTorso = Math.abs(v.x) < rig.box.w && v.y < rig.box.top && v.z > rig.box.front;
    for (const s of rig.seg) {
      if (inTorso && s.b >= 4 && s.b <= 7) continue;
      ab.subVectors(s.c, s.a); const u = Math.max(0, Math.min(1, t.subVectors(v, s.a).dot(ab) / Math.max(1e-9, ab.lengthSq())));
      const d = t.copy(s.a).addScaledVector(ab, u).distanceTo(v) + eps, w = 1 / d ** 6;
      if (w > best[s.b]) best[s.b] = w;
    }
    const idx = [...best.keys()].sort((a, b) => best[b] - best[a]).slice(0, 4), tot = idx.reduce((a, k) => a + best[k], 0);
    idx.forEach((k, j) => { si[i * 4 + j] = k; sw[i * 4 + j] = best[k] / tot; });
  }
  geom.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  geom.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
}

// 자세: 값은 라디안. lean(+뒤로 젖힘)·twist(허리 비틀기)·crouch(0~1 무릎 굽힘)·arm(+팔을 앞위로 듦)·elbow(+팔 펴기)·reach(팔 벌림)·nod(+고개 숙임)
export function poseRig(rig, p) {
  const B = rig.bones, H = rig.H;
  for (const b of Object.values(B)) { b.quaternion.identity(); b.position.copy(b.userData.rest); }
  B.hips.position.y -= (p.crouch || 0) * .05 * H;
  B.spine.rotation.set((p.lean || 0) * .45, (p.twist || 0) * .5, (p.tilt || 0) * .5);
  B.chest.rotation.set((p.lean || 0) * .55, (p.twist || 0) * .5, (p.tilt || 0) * .5);
  B.head.rotation.set((p.nod || 0) - (p.lean || 0) * .5, -(p.twist || 0) * .4, 0);
  for (const [s, k] of [["L", -1], ["R", 1]]) {
    const arm = (p.arm || 0) + (p["arm" + s] || 0), el = (p.elbow || 0) + (p["elbow" + s] || 0);
    B["uArm" + s].rotation.set(arm, 0, k * (p.reach || 0));
    B["fArm" + s].rotation.set(el, 0, 0);
    B["thigh" + s].rotation.set((p.crouch || 0) * .55, 0, 0);
    B["shin" + s].rotation.set(-(p.crouch || 0) * .9, 0, 0);
  }
}

// 손(주먹) 가운데의 몸 좌표 위치: 낚싯대가 여기서 이어진다
export function handPos(rig, out, rootInv) {
  const l = rig.hand.L.clone().applyMatrix4(rig.bones.fArmL.matrixWorld), r = rig.hand.R.clone().applyMatrix4(rig.bones.fArmR.matrixWorld);
  out.addVectors(l, r).multiplyScalar(.5); if (rootInv) out.applyMatrix4(rootInv);
  return out;
}
