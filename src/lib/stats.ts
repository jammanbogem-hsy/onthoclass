// 대응표본 t검정 + Cohen's d + t분포 양측 p값 (외부 의존성 0).
// p값은 정규화 불완전베타 함수(Numerical Recipes)로 정확히 계산.

function gammaln(xx: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = xx;
  const x = xx;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y++;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

// 정규화 불완전베타 I_x(a,b)
function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    gammaln(a + b) -
      gammaln(a) -
      gammaln(b) +
      a * Math.log(x) +
      b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

// 자유도 df 인 t분포에서 양측 p값
export function tTwoTailedP(t: number, df: number): number {
  if (df <= 0) return 1;
  if (!isFinite(t)) return 0;
  return betai(df / 2, 0.5, df / (df + t * t));
}

export type WilcoxonResult = {
  n: number; // 0이 아닌 차이 개수
  w: number; // 부호순위 통계량 min(W+, W-)
  z: number; // 정규근사 z (부호 = 변화 방향)
  p: number; // 양측 p (연속성·동점 보정)
};

export type PairedResult = {
  n: number; // 짝(전·후 모두 응답) 학생 수
  meanPre: number;
  meanPost: number;
  meanDiff: number;
  sdDiff: number;
  t: number;
  df: number;
  p: number;
  d: number; // Cohen's d (대응)
  g: number; // Hedges' g (소표본 편향 보정)
  ciLow: number; // 평균차 95% CI 하한
  ciHigh: number; // 평균차 95% CI 상한
  wilcoxon: WilcoxonResult | null; // 비모수(소표본·비정규 대비)
};

function mean(a: number[]): number {
  return a.reduce((s, v) => s + v, 0) / a.length;
}
function sampleSd(a: number[], m: number): number {
  if (a.length < 2) return 0;
  const v = a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1);
  return Math.sqrt(v);
}

// 표준정규 CDF (erf 근사, A&S 7.1.26)
function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return s * y;
}
function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// 양측 alpha 의 t 임계값 (tTwoTailedP 역산, 이분법)
function tCritical(df: number, alpha: number): number {
  if (df <= 0) return 0;
  let lo = 0;
  let hi = 1000;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (tTwoTailedP(mid, df) > alpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 대응표본 Wilcoxon 부호순위 검정 (비모수). 정규근사 + 동점·연속성 보정. */
export function wilcoxonSignedRank(
  pairs: { pre: number; post: number }[]
): WilcoxonResult | null {
  const diffs = pairs.map((p) => p.post - p.pre).filter((d) => d !== 0);
  const n = diffs.length;
  if (n < 1) return null;
  // |차이| 오름차순 정렬 → 평균순위(동점 평균)
  const order = diffs.map((_, i) => i).sort(
    (a, b) => Math.abs(diffs[a]) - Math.abs(diffs[b])
  );
  const ranks = new Array<number>(n);
  let tieCorr = 0;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && Math.abs(diffs[order[j + 1]]) === Math.abs(diffs[order[i]]))
      j++;
    const avgRank = (i + j) / 2 + 1; // 1-based 평균순위
    const g = j - i + 1;
    if (g > 1) tieCorr += g * g * g - g;
    for (let k = i; k <= j; k++) ranks[order[k]] = avgRank;
    i = j + 1;
  }
  let wPlus = 0;
  let wMinus = 0;
  for (let k = 0; k < n; k++) {
    if (diffs[k] > 0) wPlus += ranks[k];
    else wMinus += ranks[k];
  }
  const w = Math.min(wPlus, wMinus);
  const meanW = (n * (n + 1)) / 4;
  const varW = (n * (n + 1) * (2 * n + 1)) / 24 - tieCorr / 48;
  const sd = Math.sqrt(Math.max(0, varW));
  if (sd === 0) return { n, w, z: 0, p: 1 };
  const z = (wPlus - meanW) / sd;
  const zc = Math.max(0, Math.abs(wPlus - meanW) - 0.5) / sd; // 연속성 보정
  const p = Math.min(1, 2 * (1 - normalCdf(zc)));
  return { n, w, z, p };
}

/** Holm-Bonferroni 다중비교 보정 — 입력 p값 배열 → 보정된 p값 배열 */
export function holmAdjust(pvals: number[]): number[] {
  const m = pvals.length;
  const order = pvals
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p - b.p);
  const adj = new Array<number>(m);
  let prev = 0;
  order.forEach((o, k) => {
    const a = Math.min(1, (m - k) * o.p);
    prev = Math.max(prev, a); // 단조 증가 강제
    adj[o.i] = prev;
  });
  return adj;
}

// 대응표본 t검정. pairs 가 2쌍 미만이면 null(검정 불가).
export function pairedTTest(
  pairs: { pre: number; post: number }[]
): PairedResult | null {
  const n = pairs.length;
  if (n < 2) return null;
  const pre = pairs.map((p) => p.pre);
  const post = pairs.map((p) => p.post);
  const diffs = pairs.map((p) => p.post - p.pre);
  const meanPre = mean(pre);
  const meanPost = mean(post);
  const meanDiff = mean(diffs);
  const sdDiff = sampleSd(diffs, meanDiff);
  const df = n - 1;
  // Hedges 소표본 보정계수 J. df=1(n=2)에선 근사식 1-3/(4·df-1)=0 으로 붕괴해
  // g가 항상 0이 되므로, df<2 에선 보정 없이 J=1(g=d)로 둔다.
  const J = df >= 2 ? 1 - 3 / (4 * df - 1) : 1;
  const wilcoxon = wilcoxonSignedRank(pairs);
  if (sdDiff === 0) {
    const noChange = meanDiff === 0;
    return {
      n,
      meanPre,
      meanPost,
      meanDiff,
      sdDiff,
      t: noChange ? 0 : Infinity,
      df,
      p: noChange ? 1 : 0,
      d: noChange ? 0 : Infinity,
      g: noChange ? 0 : Infinity,
      ciLow: meanDiff,
      ciHigh: meanDiff,
      wilcoxon,
    };
  }
  const se = sdDiff / Math.sqrt(n);
  const t = meanDiff / se;
  const p = tTwoTailedP(t, df);
  const d = meanDiff / sdDiff;
  const g = d * J;
  const tc = tCritical(df, 0.05);
  const ciLow = meanDiff - tc * se;
  const ciHigh = meanDiff + tc * se;
  return {
    n,
    meanPre,
    meanPost,
    meanDiff,
    sdDiff,
    t,
    df,
    p,
    d,
    g,
    ciLow,
    ciHigh,
    wilcoxon,
  };
}

// 효과크기 해석(절대값 기준)
export function cohenLabel(d: number): string {
  const a = Math.abs(d);
  if (!isFinite(a)) return "매우 큼";
  if (a < 0.2) return "미미";
  if (a < 0.5) return "작음";
  if (a < 0.8) return "중간";
  return "큼";
}
