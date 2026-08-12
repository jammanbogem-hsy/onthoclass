"use client";

// 시장 지수 요약 스트립 — 토스증권 홈 상단처럼 지수 5종을 가로 스크롤 카드로 보여준다.
//  · 실제 지수명(코스피/나스닥/VIX 등)은 절대 노출하지 않는다 — MARKET_INDICES 의 name/tip 만 사용.
//  · 스파크라인/등락색은 국내 관례(상승=빨강 --trade-up, 하락=파랑 --trade-down).
//  · ? 툴팁은 모바일 우선(클릭 토글·바깥 탭 닫힘·한 번에 하나만) 말풍선.
//  · 데이터가 없으면(watchTradingMarket null / 키 누락) 오류처럼 보이지 않게 스트립을 숨긴다.
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { MARKET_INDICES, type MarketIndex, type MarketIndexMeta, type TradingMarket } from "@/lib/trading";
import { fmtPct, signColor } from "@/components/trade/util";

// ---------- 값 포맷 ----------
function fmtIndexValue(meta: MarketIndexMeta, value: number): string {
  // 두근두근 지수(VIX)는 소수 첫째 자리, 환율은 정수+"원", 나머지는 소수 둘째 자리.
  if (meta.key === "vix") {
    return value.toLocaleString("ko-KR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }
  if (meta.unit === "원") {
    return `${Math.round(value).toLocaleString("ko-KR")}원`;
  }
  return value.toLocaleString("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------- 두근두근 지수 상태 뱃지 ----------
// 값이 클수록 단계감 있게 강해지도록 M3 컨테이너 톤을 계단식으로.
function vixStatus(value: number): { label: string; bg: string; fg: string } {
  if (value < 15)
    return {
      label: "차분해요",
      bg: "var(--md-sys-color-secondary-container)",
      fg: "var(--md-sys-color-on-secondary-container)",
    };
  if (value < 25)
    return {
      label: "보통이에요",
      bg: "var(--md-sys-color-surface-container-highest)",
      fg: "var(--md-sys-color-on-surface-variant)",
    };
  if (value < 35)
    return {
      label: "두근두근해요",
      bg: "var(--md-sys-color-tertiary-container)",
      fg: "var(--md-sys-color-on-tertiary-container)",
    };
  return {
    label: "많이 불안해요",
    bg: "var(--md-sys-color-error-container)",
    fg: "var(--md-sys-color-on-error-container)",
  };
}

// ---------- 미니 스파크라인 ----------
function Sparkline({
  data,
  up,
  width = 64,
  height = 28,
}: {
  data: number[];
  up: boolean;
  width?: number;
  height?: number;
}) {
  const gid = useId();
  if (!data || data.length < 2) {
    // 데이터 부족 — 자리만 비워 카드 정렬을 유지(오류처럼 보이지 않게).
    return <span aria-hidden style={{ width, height }} className="block shrink-0" />;
  }
  const PAD = 2;
  const n = data.length;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const x = (i: number) => PAD + (i / (n - 1)) * (width - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / range) * (height - PAD * 2);
  const line = data
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)} ${height} L${x(0).toFixed(1)} ${height} Z`;
  const color = up ? "var(--trade-up)" : "var(--trade-down)";
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block shrink-0"
      role="presentation"
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------- 두근두근 지수(VIX) 게이지 ----------
// 상태 4단계를 구간 색으로, 지금 값의 위치를 삼각 마커로 표시.
const VIX_GAUGE_MAX = 45;
const VIX_ZONES: { to: number; color: string; label: string }[] = [
  { to: 15, color: "var(--md-sys-color-secondary)", label: "차분" },
  { to: 25, color: "var(--md-sys-color-outline)", label: "보통" },
  { to: 35, color: "var(--md-sys-color-tertiary)", label: "두근두근" },
  { to: VIX_GAUGE_MAX, color: "var(--md-sys-color-error)", label: "불안" },
];

function VixGauge({ value }: { value: number }) {
  const pct = (Math.min(Math.max(value, 0), VIX_GAUGE_MAX) / VIX_GAUGE_MAX) * 100;
  let prevTo = 0;
  return (
    <div className="mt-2">
      <div className="relative pt-4">
        {/* 지금 값 마커 */}
        <div
          className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${pct}%` }}
        >
          <span className="whitespace-nowrap rounded-full bg-[var(--md-sys-color-inverse-surface)] px-1.5 py-0.5 text-[10px] font-extrabold text-[var(--md-sys-color-inverse-on-surface)]">
            지금 {value.toFixed(1)}
          </span>
          <Icon
            name="arrow_drop_down"
            size={16}
            fill
            className="-mt-0.5 text-[var(--md-sys-color-inverse-surface)]"
          />
        </div>
        {/* 구간 막대 */}
        <div className="flex h-2.5 w-full overflow-hidden rounded-full">
          {VIX_ZONES.map((z, i) => {
            const width = ((z.to - prevTo) / VIX_GAUGE_MAX) * 100;
            prevTo = z.to;
            return (
              <span
                key={z.label}
                style={{ width: `${width}%`, background: z.color }}
                className={i > 0 ? "ml-px" : ""}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[9px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
        {VIX_ZONES.map((z) => (
          <span key={z.label}>{z.label}</span>
        ))}
      </div>
    </div>
  );
}

// ---------- 지수 카드 ----------
const POP_W = 224;

function IndexCard({
  meta,
  data,
  open,
  onToggle,
}: {
  meta: MarketIndexMeta;
  data: MarketIndex | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // 말풍선은 가로 스크롤 컨테이너의 클리핑을 피하려고 fixed 로 띄운다.
  // 열려 있는 동안 스크롤/리사이즈에 맞춰 위치를 다시 계산한다.
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const compute = () => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let left = r.left + r.width / 2;
      left = Math.min(
        window.innerWidth - POP_W / 2 - 8,
        Math.max(POP_W / 2 + 8, left)
      );
      setPos({ top: r.bottom + 8, left });
    };
    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [open]);

  const help = (
    <button
      ref={btnRef}
      type="button"
      onClick={onToggle}
      aria-label="지수 설명"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? `index-tip-${meta.key}` : undefined}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,transparent)]"
      style={open ? { color: "var(--md-sys-color-primary)" } : undefined}
    >
      <Icon name="help" size={15} fill={open} />
    </button>
  );

  const nameRow = (
    <div className="flex items-center gap-0.5">
      <span className="truncate text-sm font-bold text-[var(--md-sys-color-on-surface)]">
        {meta.name}
      </span>
      {help}
    </div>
  );

  const popover =
    open && pos ? (
      <div
        id={`index-tip-${meta.key}`}
        role="tooltip"
        className="fixed z-50 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-highest)] px-3 py-2 text-xs font-medium leading-relaxed text-[var(--md-sys-color-on-surface)] shadow-[var(--md-sys-elevation-2)]"
        style={{
          top: pos.top,
          left: pos.left,
          width: POP_W,
          transform: "translateX(-50%)",
        }}
      >
        {meta.tip}
        {meta.key === "vix" && data && <VixGauge value={data.value} />}
      </div>
    ) : null;

  // 시세 준비 전(키 누락) — 이름/툴팁은 유지하되 값은 감춰 오류처럼 보이지 않게.
  if (!data) {
    return (
      <div
        data-pop={meta.key}
        className="relative flex flex-col justify-between rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-3.5 py-3"
      >
        {nameRow}
        <p className="mt-2 text-sm font-bold text-[var(--md-sys-color-on-surface-variant)]">
          시세 준비 중
        </p>
        {popover}
      </div>
    );
  }

  const pct = data.changePct ?? 0;
  const up = pct >= 0;
  const vix = meta.key === "vix" ? vixStatus(data.value) : null;

  return (
    <div
      data-pop={meta.key}
      className="relative flex items-center gap-2 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-3.5 py-3"
    >
      <div className="min-w-0 flex-1">
        {nameRow}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="text-lg font-black leading-tight text-[var(--md-sys-color-on-surface)] tabular-nums">
            {fmtIndexValue(meta, data.value)}
          </span>
          {vix && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[11px] font-bold"
              style={{ background: vix.bg, color: vix.fg }}
            >
              {vix.label}
            </span>
          )}
        </div>
        <div
          className="mt-0.5 flex items-center gap-0.5 text-xs font-bold tabular-nums"
          style={{ color: signColor(pct) }}
        >
          <Icon
            name={pct > 0 ? "arrow_drop_up" : pct < 0 ? "arrow_drop_down" : "remove"}
            size={18}
            fill
            className="-mx-0.5 shrink-0"
          />
          {fmtPct(pct)}
        </div>
      </div>
      <Sparkline data={data.spark ?? []} up={up} />
      {popover}
    </div>
  );
}

// ---------- 스트립 ----------
export function MarketStrip({ market }: { market: TradingMarket | null }) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  // 바깥 탭/Esc 로 말풍선 닫기(한 번에 하나만 열림).
  useEffect(() => {
    if (!openKey) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest(`[data-pop="${openKey}"]`)) return;
      setOpenKey(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenKey(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [openKey]);

  // 데이터가 전혀 없으면(로딩/문서 없음/키 전부 누락) 스트립 자체를 숨긴다.
  const hasData =
    !!market && MARKET_INDICES.some((m) => market.indices[m.key]);
  if (!hasData) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
        <Icon
          name="monitoring"
          size={20}
          className="text-[var(--md-sys-color-primary)]"
        />
        오늘의 시장
      </h2>
      {/* 좌우폭에 반응형 — auto-fit 그리드로 카드가 폭에 맞게 줄지어 채워지고(모자라면 다음 줄로
          내려감), 한 줄에 다 안 들어갈 만큼 넓을 땐 justify-center 로 가운데 정렬된다.
          가로 스크롤 대신 폭에 맞춰 스스로 배치되므로 별도 스크롤 컨테이너가 필요 없다. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,220px))] justify-center gap-3">
          {MARKET_INDICES.map((meta) => (
            <IndexCard
              key={meta.key}
              meta={meta}
              data={market!.indices[meta.key]}
              open={openKey === meta.key}
              onToggle={() =>
                setOpenKey((prev) => (prev === meta.key ? null : meta.key))
              }
            />
          ))}
      </div>
    </section>
  );
}
