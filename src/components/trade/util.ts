// 만보 트레이딩 UI 공용 포맷터/색상 헬퍼.
// 등락 색은 국내 관례(상승=빨강, 하락=파랑)를 따르되 Tailwind 기본 팔레트 대신
// .trade-scope 에서 정의한 CSS 변수(--trade-up/--trade-down/--trade-flat)를 쓴다.
import type { Candle } from "@/lib/trading";

/** 만보 금액 표기 — 정수 + 천단위 콤마 + "만보" */
export const fmtMb = (n: number): string =>
  `${Math.round(n).toLocaleString()}만보`;

/** 전일 대비 만보 변화 — 부호 포함(+n만보 / -n만보 / 0만보) */
export function fmtMbDelta(n: number): string {
  const r = Math.round(n);
  if (r === 0) return "0만보";
  return `${r > 0 ? "+" : "-"}${Math.abs(r).toLocaleString()}만보`;
}

/** 거래량(주식 수) 간단 표기 — 예: 1,234만 주 / 3,200주 */
export function fmtVolume(v: number): string {
  const n = Math.round(v || 0);
  if (n <= 0) return "0주";
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만 주`;
  return `${n.toLocaleString()}주`;
}

/**
 * 주 단위 집계 — 일봉(최신순) → 주봉(최신순).
 *  같은 주(월요일 시작)로 묶어: o=주 첫 시가, c=주 마지막 종가, h=주간 최고, l=주간 최저, v=거래량 합.
 *  캔들 t 는 그 주의 월요일(주 시작) epoch ms 로 둔다.
 */
export function aggregateWeekly(daily: Candle[]): Candle[] {
  if (!daily.length) return [];
  const chron = [...daily].reverse(); // 최신순 → 시간순
  const buckets = new Map<number, Candle[]>();
  const order: number[] = [];
  for (const c of chron) {
    const k = weekStart(c.t);
    let group = buckets.get(k);
    if (!group) {
      group = [];
      buckets.set(k, group);
      order.push(k);
    }
    group.push(c);
  }
  const weekly = order.map((k) => {
    const group = buckets.get(k)!;
    const first = group[0];
    const last = group[group.length - 1];
    return {
      t: k,
      o: first.o,
      c: last.c,
      h: Math.max(...group.map((g) => g.h)),
      l: Math.min(...group.map((g) => g.l)),
      v: group.reduce((s, g) => s + (g.v || 0), 0),
    };
  });
  return weekly.reverse(); // 다시 최신순(StockChart 계약)
}

/** 해당 날짜가 속한 주의 월요일 0시 epoch ms(로컬 기준) */
function weekStart(t: number): number {
  const d = new Date(t);
  const dow = (d.getDay() + 6) % 7; // 월=0 … 일=6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow).getTime();
}

/** 등락률(%) 표기 — 부호 + 소수 둘째자리 */
export function fmtPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/** 등락 방향 화살표 */
export function arrow(pct: number): string {
  if (pct > 0) return "▲";
  if (pct < 0) return "▼";
  return "―";
}

/** 등락 방향 → 색상 CSS 변수 */
export function signColor(pct: number): string {
  if (pct > 0) return "var(--trade-up)";
  if (pct < 0) return "var(--trade-down)";
  return "var(--trade-flat)";
}

/** 손익(만보) → 색상 CSS 변수 */
export function pnlColor(pnl: number): string {
  if (pnl > 0) return "var(--trade-up)";
  if (pnl < 0) return "var(--trade-down)";
  return "var(--trade-flat)";
}

/** "n분 전" 상대 시각 */
export function fmtAgo(ms: number | null): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "방금 전";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

const WD = ["일", "월", "화", "수", "목", "금", "토"];

/** 다음 개장 시각(epoch ms)을 초등학생이 읽기 쉬운 한국어로 */
export function fmtNextOpen(ms: number): string {
  const d = new Date(ms);
  const wd = WD[d.getDay()];
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  const min = d.getMinutes();
  const ampm = h < 12 ? "오전" : "오후";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  const minStr = min === 0 ? "" : ` ${min}분`;
  return `${mo}월 ${day}일 (${wd}) ${ampm} ${hh}시${minStr}`;
}
