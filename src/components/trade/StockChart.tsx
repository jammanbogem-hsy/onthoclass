"use client";

// 경량 SVG 일봉 캔들 차트 + 거래량 막대 — 외부 라이브러리 없이 순수 SVG 로 그린다.
//  · candles 는 최신순(newest-first)으로 들어오므로 시간순으로 뒤집어 왼→오로 그린다.
//  · 국내 관례: 양봉(종가>시가)=상승 빨강(--trade-up), 음봉(종가<시가)=하락 파랑(--trade-down).
//  · 몸통=시가↔종가, 꼬리=고가↔저가. 도지(시가=종가)는 가는 가로선.
//  · 표시 가격은 전부 toMbPrice 로 만보 환산.
//  · 하단 밴드(약 22%)에 거래량 막대 — 같은 x축, 그날 등락색을 낮은 불투명도로.
//  · 터치/호버 시 그날 날짜·시가·고가·저가·종가(만보) 툴팁(HTML 오버레이). 없어도 동작엔 지장 없음.
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { toMbPrice, type Candle } from "@/lib/trading";

// 차트 레이아웃(px). 폭은 컨테이너 실측값(반응형), 높이는 고정.
const H = 176;
const PAD_X = 8;
const PAD_TOP = 14;
const PAD_BOT = 10;
const GAP = 8; // 가격 패널 ↔ 거래량 밴드 사이
const VOL_FRAC = 0.22; // 거래량 밴드 높이 비율

const PLOT_H = H - PAD_TOP - PAD_BOT;
const VOL_H = PLOT_H * VOL_FRAC;
const PRICE_H = PLOT_H - GAP - VOL_H;
const PRICE_TOP = PAD_TOP;
const VOL_BOTTOM = H - PAD_BOT;

const TIP_W = 180; // 라벨(시가/고가/저가/종가) + 값이 줄바꿈 없이 한 줄에 들어갈 정도로 여유 있게

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const fmtDayLabel = (t: number, weekly: boolean): string => {
  const d = new Date(t);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return weekly ? `${md} 주간` : `${md} (${WD[d.getDay()]})`;
};
const nf = (n: number): string => Math.round(n).toLocaleString();

export function StockChart({
  candles,
  days = 30,
  weekly = false,
  divisor,
}: {
  candles: Candle[];
  /** 종목 포인트 컬러 — 캔들 색은 등락색으로 정하므로 여기선 쓰지 않지만 props 계약 유지. */
  color: string;
  days?: number;
  /** true 면 주봉(집계) — 툴팁/라벨을 '주간'으로 표기. */
  weekly?: boolean;
  /** 종목별 만보 환산 배율 — 생략하면 기본(MB_DIVISOR). */
  divisor?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  const [active, setActive] = useState<number | null>(null);

  // 컨테이너 실측 폭 추적(반응형)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      if (cw > 0) setW(cw);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 최신순 → 시간순, 최근 days 개만
  const chron = useMemo(
    () => [...candles].reverse().slice(-days),
    [candles, days]
  );

  if (chron.length < 2) {
    return (
      <div
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] text-sm text-[var(--md-sys-color-on-surface-variant)]"
        style={{ height: H }}
      >
        <Icon name="show_chart" size={18} className="shrink-0" />
        차트를 그릴 데이터가 아직 없어요
      </div>
    );
  }

  const n = chron.length;
  const innerW = Math.max(1, w - 2 * PAD_X);
  const slotW = innerW / n;
  const bodyW = Math.max(3, Math.min(slotW * 0.6, 13));
  const cx = (i: number) => PAD_X + (i + 0.5) * slotW;

  // 만보 환산 OHLC + 가격 도메인
  let lo = Infinity;
  let hi = -Infinity;
  const mb = chron.map((c) => {
    const o = toMbPrice(c.o, divisor);
    const h = toMbPrice(c.h, divisor);
    const l = toMbPrice(c.l, divisor);
    const cl = toMbPrice(c.c, divisor);
    if (l < lo) lo = l;
    if (h > hi) hi = h;
    return { o, h, l, c: cl };
  });
  const headroom = (hi - lo) * 0.06 || 1; // 위아래 여백으로 꼬리가 가장자리에 붙지 않게
  const dMin = lo - headroom;
  const dRange = hi + headroom - dMin || 1;
  const py = (v: number) => PRICE_TOP + (1 - (v - dMin) / dRange) * PRICE_H;

  const maxV = Math.max(1, ...chron.map((c) => c.v || 0));

  const dirColor = (c: Candle) =>
    c.c > c.o ? "var(--trade-up)" : c.c < c.o ? "var(--trade-down)" : "var(--trade-flat)";

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - PAD_X) / slotW)));
    setActive(i);
  }

  const tipLeft =
    active != null
      ? Math.max(TIP_W / 2 + 2, Math.min(w - TIP_W / 2 - 2, cx(active)))
      : 0;
  const a =
    active != null ? { c: chron[active], m: mb[active], x: cx(active) } : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height: H }}>
      <svg
        width={w}
        height={H}
        viewBox={`0 0 ${w} ${H}`}
        className="block"
        style={{ touchAction: "pan-y" }}
        role="img"
        aria-label={`${weekly ? "주봉" : "일봉"} 캔들 차트와 거래량`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setActive(null)}
        onPointerCancel={() => setActive(null)}
      >
        {/* 선택 슬롯 하이라이트 + 세로 가이드 */}
        {active != null && (
          <g>
            <rect
              x={cx(active) - slotW / 2}
              y={PRICE_TOP}
              width={slotW}
              height={VOL_BOTTOM - PRICE_TOP}
              rx={4}
              fill="var(--md-sys-color-on-surface)"
              opacity={0.05}
            />
            <line
              x1={cx(active)}
              y1={PRICE_TOP}
              x2={cx(active)}
              y2={VOL_BOTTOM}
              stroke="var(--md-sys-color-outline-variant)"
              strokeWidth={1}
            />
          </g>
        )}

        {/* 거래량 밴드 바닥선(리시브) */}
        <line
          x1={PAD_X}
          y1={VOL_BOTTOM}
          x2={w - PAD_X}
          y2={VOL_BOTTOM}
          stroke="var(--md-sys-color-outline-variant)"
          strokeWidth={1}
        />

        {/* 캔들 + 거래량 막대 */}
        {chron.map((c, i) => {
          const x = cx(i);
          const col = dirColor(c);
          const m = mb[i];
          const yH = py(m.h);
          const yL = py(m.l);
          const yO = py(m.o);
          const yC = py(m.c);
          const bodyTop = Math.min(yO, yC);
          const bodyH = Math.abs(yO - yC);
          const v = c.v || 0;
          const vh = v > 0 ? Math.max(1.5, (v / maxV) * VOL_H) : 0;
          return (
            <g key={c.t ?? i}>
              {/* 거래량 */}
              {vh > 0 && (
                <rect
                  x={x - bodyW / 2}
                  y={VOL_BOTTOM - vh}
                  width={bodyW}
                  height={vh}
                  rx={1.5}
                  fill={col}
                  fillOpacity={0.32}
                />
              )}
              {/* 꼬리(고가↔저가) */}
              <line
                x1={x}
                y1={yH}
                x2={x}
                y2={yL}
                stroke={col}
                strokeWidth={1.4}
                strokeLinecap="round"
              />
              {/* 몸통(시가↔종가) — 도지는 가는 가로선 */}
              {bodyH < 1.2 ? (
                <line
                  x1={x - bodyW / 2}
                  y1={bodyTop}
                  x2={x + bodyW / 2}
                  y2={bodyTop}
                  stroke={col}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              ) : (
                <rect
                  x={x - bodyW / 2}
                  y={bodyTop}
                  width={bodyW}
                  height={bodyH}
                  rx={2}
                  fill={col}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* 툴팁(HTML 오버레이) */}
      {a && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-highest)] px-2.5 py-1.5 shadow-[var(--md-sys-elevation-2)]"
          style={{ left: tipLeft, top: 4, width: TIP_W, transform: "translateX(-50%)" }}
        >
          <p className="mb-1 text-center text-[11px] font-bold text-[var(--md-sys-color-on-surface)]">
            {fmtDayLabel(a.c.t, weekly)}
          </p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
            <div className="flex items-center justify-between gap-1.5">
              <dt className="shrink-0 whitespace-nowrap text-[var(--md-sys-color-on-surface-variant)]">시가</dt>
              <dd className="whitespace-nowrap font-semibold text-[var(--md-sys-color-on-surface)]">
                {nf(a.m.o)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-1.5">
              <dt className="shrink-0 whitespace-nowrap text-[var(--md-sys-color-on-surface-variant)]">고가</dt>
              <dd className="whitespace-nowrap font-semibold" style={{ color: "var(--trade-up)" }}>
                {nf(a.m.h)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-1.5">
              <dt className="shrink-0 whitespace-nowrap text-[var(--md-sys-color-on-surface-variant)]">저가</dt>
              <dd className="whitespace-nowrap font-semibold" style={{ color: "var(--trade-down)" }}>
                {nf(a.m.l)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-1.5">
              <dt className="shrink-0 whitespace-nowrap text-[var(--md-sys-color-on-surface-variant)]">종가</dt>
              <dd className="whitespace-nowrap font-bold" style={{ color: dirColor(a.c) }}>
                {nf(a.m.c)}
              </dd>
            </div>
          </dl>
          <p className="mt-1 text-center text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
            단위: 만보
          </p>
        </div>
      )}
    </div>
  );
}
