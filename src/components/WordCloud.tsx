"use client";

/**
 * 개념어 워드클라우드 — 제출 빈도(count)에 비례해 글자 크기.
 * 빈도가 높을수록 가운데에 오도록 'center-out' 배치(가장 많은 단어가 중앙, 적을수록 바깥).
 * CSS 기반(외부 의존 없음).
 */
const PALETTE = [
  "#0F6E56",
  "#c2410c",
  "#4f7cff",
  "#7c3aed",
  "#be123c",
  "#0891b2",
  "#15803d",
  "#a16207",
];

/** 빈도 내림차순 배열을 가운데가 1등이 되도록 재배치: [.. 4,2,1,3,5 ..] */
function centerOut<T>(sortedDesc: T[]): T[] {
  const out: T[] = [];
  sortedDesc.forEach((item, i) => {
    if (i % 2 === 0) out.push(item);
    else out.unshift(item);
  });
  return out;
}

export function WordCloud({
  items,
  max = 60,
  color,
}: {
  items: { word: string; count: number }[];
  max?: number;
  /** 지정 시 모든 단어를 이 색으로(빈도에 따라 농도/굵기만 변함) — 학급별/공통 구분용.
   *  미지정 시 빈도 순위 기반 무지개 팔레트(기본). */
  color?: string;
}) {
  const ranked = [...items]
    .filter((i) => i.word && i.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
  if (ranked.length === 0)
    return (
      <p className="rounded-2xl bg-[var(--md-sys-color-surface)] p-4 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
        표시할 개념어가 없어요.
      </p>
    );
  const hi = ranked[0].count;
  const lo = ranked[ranked.length - 1].count;
  // 색은 빈도(rank)로, 배치는 center-out 으로 — 큰 단어가 가운데 + 진한 색
  const arranged = centerOut(ranked.map((it, rank) => ({ ...it, rank })));
  return (
    <div className="flex min-h-[140px] flex-wrap content-center items-center justify-center gap-x-3 gap-y-1 rounded-2xl bg-[var(--md-sys-color-surface)] p-5">
      {arranged.map((it) => {
        const t = hi === lo ? 1 : (it.count - lo) / (hi - lo);
        const size = 0.8 + t * 2.0; // rem
        return (
          <span
            key={it.word}
            title={`${it.count}회 제출`}
            className="leading-none"
            style={{
              fontSize: `${size.toFixed(2)}rem`,
              color: color ?? PALETTE[it.rank % PALETTE.length],
              fontWeight: 600 + Math.round(t * 3) * 100,
              opacity: 0.6 + t * 0.4,
            }}
          >
            {it.word}
          </span>
        );
      })}
    </div>
  );
}
