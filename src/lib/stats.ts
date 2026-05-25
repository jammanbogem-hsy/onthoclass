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
};

function mean(a: number[]): number {
  return a.reduce((s, v) => s + v, 0) / a.length;
}
function sampleSd(a: number[], m: number): number {
  if (a.length < 2) return 0;
  const v = a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1);
  return Math.sqrt(v);
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
    };
  }
  const se = sdDiff / Math.sqrt(n);
  const t = meanDiff / se;
  const p = tTwoTailedP(t, df);
  const d = meanDiff / sdDiff;
  return { n, meanPre, meanPost, meanDiff, sdDiff, t, df, p, d };
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
