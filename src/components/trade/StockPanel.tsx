"use client";

// 종목 상세 콘텐츠(헤더 + 차트 + 종목안내 + 매수/매도) — 컨테이너 독립적.
//  · 모바일: StockSheet 가 이 컴포넌트를 바텀시트 모달 안에 넣어 사용.
//  · 데스크톱: /trade 페이지가 이 컴포넌트를 우측 고정 패널 카드 안에 그대로 넣어 사용.
//  · onClose 가 없으면(데스크톱 인라인) 닫기 버튼을 그리지 않는다 — 그 외 동작은 완전히 동일.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  executeTrade,
  fetchCandles,
  maxAffordableQty,
  toMbPrice,
  tradeFee,
  type Candle,
  type StockQuote,
  type TradeSide,
  type TradingStock,
} from "@/lib/trading";
import { StockChart } from "@/components/trade/StockChart";
import {
  aggregateWeekly,
  arrow,
  fmtMb,
  fmtPct,
  fmtVolume,
  signColor,
} from "@/components/trade/util";

// 차트 기간 필터 — 기본 1달. 1주·1달=일봉, 3달·1년=주봉(주 단위 집계).
type Period = "1w" | "1m" | "3m" | "1y";
const PERIODS: { key: Period; label: string }[] = [
  { key: "1w", label: "1주" },
  { key: "1m", label: "1달" },
  { key: "3m", label: "3달" },
  { key: "1y", label: "1년" },
];

// 종목 안내 2열 그리드 셀 — 라벨(+보조설명) / 값.
function InfoCell({
  label,
  hint,
  value,
  valueColor,
}: {
  label: string;
  hint?: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-2.5">
      <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </p>
      {hint && (
        <p className="text-[11px] leading-tight text-[var(--md-sys-color-on-surface-variant)] opacity-80">
          {hint}
        </p>
      )}
      <p
        className="mt-0.5 text-base font-extrabold"
        style={{ color: valueColor ?? "var(--md-sys-color-on-surface)" }}
      >
        {value}
      </p>
    </div>
  );
}

export type StockPanelProps = {
  cid: string;
  stock: TradingStock;
  quote: StockQuote | undefined;
  holdingQty: number;
  avgCost: number;
  balance: number;
  marketOpen: boolean;
  nextOpenText: string | null;
  /** 교사 보기 모드 — 거래 컨트롤을 모두 숨기고 차트·시세만 보여주는 관전 시트. */
  viewer?: boolean;
};

export function StockPanel({
  cid,
  stock,
  quote,
  holdingQty,
  avgCost,
  balance,
  marketOpen,
  nextOpenText,
  viewer = false,
  onClose,
}: StockPanelProps & { onClose?: () => void }) {
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [period, setPeriod] = useState<Period>("1m");
  const [side, setSide] = useState<TradeSide>("buy");
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [doneMsg, setDoneMsg] = useState("");

  useEffect(() => {
    let alive = true;
    setCandles(null);
    fetchCandles(stock.symbol)
      .then((c) => alive && setCandles(c))
      .catch(() => alive && setCandles([]));
    return () => {
      alive = false;
    };
  }, [stock.symbol]);

  // 종목이 바뀌면(리스트에서 다른 종목 클릭) 매수/매도 입력 상태 초기화
  useEffect(() => {
    setSide("buy");
    setQty(1);
    setErr("");
    setDoneMsg("");
  }, [stock.symbol]);

  // 사기/팔기 전환 — 수량·메시지 초기화
  function selectSide(s: TradeSide) {
    setSide(s);
    setQty(1);
    setErr("");
    setDoneMsg("");
  }

  // 종목별 만보 환산 배율 — 저가주(예: 만보해운)는 낮은 배율을 써서 하루 변동이 반올림에 묻히지 않게 한다.
  const divisor = stock.mbDivisor;
  const unit = quote?.mbPrice ?? 0;
  const hasPrice = unit > 0;
  // 수수료(0.5%, 최소 1만보) 포함 실제 청구액 기준 최대 매수 가능 수량.
  const maxBuy = hasPrice ? maxAffordableQty(balance, unit) : 0;
  const max = side === "buy" ? maxBuy : holdingQty;
  const canTrade = marketOpen && hasPrice && max >= 1;
  const clampedQty = Math.min(Math.max(1, qty), Math.max(1, max));
  const subtotal = unit * clampedQty;
  const fee = tradeFee(subtotal);
  // 매수: 수수료를 더 냄 / 매도: 수수료만큼 덜 받음 — 서버(executeTrade)와 동일 계산식.
  const total = side === "buy" ? subtotal + fee : Math.max(0, subtotal - fee);

  // 차트에 그릴 캔들 — 기간별로 잘라내거나 주봉으로 집계(전부 최신순 유지).
  const isWeekly = period === "3m" || period === "1y";
  const view = useMemo<Candle[]>(() => {
    const c = candles ?? [];
    if (!c.length) return [];
    if (period === "1w") return c.slice(0, 7); // 최근 일봉 ~7개
    if (period === "1m") return c.slice(0, 22); // 최근 일봉 ~22개
    if (period === "3m") return aggregateWeekly(c.slice(0, 66)); // 주봉 ~13개
    return aggregateWeekly(c); // 1년 — 주봉 ~52개
  }, [candles, period]);

  const periodLabel = PERIODS.find((p) => p.key === period)!.label;

  // 선택 기간 최고/최저(만보)
  let hi = 0;
  let lo = 0;
  if (view.length) {
    hi = toMbPrice(Math.max(...view.map((c) => c.h)), divisor);
    lo = toMbPrice(Math.min(...view.map((c) => c.l)), divisor);
  }

  // 종목 안내 카드용 — 오늘(최신 일봉) / 1년(전체) / 전일 종가
  const list = candles ?? [];
  const today = list[0] ?? null;
  const todayOpen = today ? toMbPrice(today.o, divisor) : 0;
  const todayHigh = today ? toMbPrice(today.h, divisor) : 0;
  const todayLow = today ? toMbPrice(today.l, divisor) : 0;
  const todayVol = today ? today.v : 0;
  let yearHi = 0;
  let yearLo = 0;
  if (list.length) {
    yearHi = toMbPrice(Math.max(...list.map((c) => c.h)), divisor);
    yearLo = toMbPrice(Math.min(...list.map((c) => c.l)), divisor);
  }
  const prevCloseMb = quote
    ? toMbPrice(quote.prevClose, divisor)
    : list[1]
      ? toMbPrice(list[1].c, divisor)
      : 0;
  const hasInfo = today != null;

  function step(delta: number) {
    setQty((q) => {
      const base = Math.min(Math.max(1, q), Math.max(1, max));
      return Math.min(Math.max(1, base + delta), Math.max(1, max));
    });
  }

  async function confirm() {
    if (submitting || !canTrade) return;
    setSubmitting(true);
    setErr("");
    setDoneMsg("");
    try {
      await executeTrade(cid, stock.symbol, side, clampedQty);
      setDoneMsg(
        side === "buy"
          ? `${stock.alias} ${clampedQty}주를 샀어요!`
          : `${stock.alias} ${clampedQty}주를 팔았어요!`
      );
      setQty(1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const changePct = quote?.changePct ?? 0;

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `color-mix(in srgb, ${stock.color} 16%, transparent)` }}
        >
          <Icon name={stock.icon} size={24} style={{ color: stock.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold">{stock.alias}</p>
          <p
            className="flex items-center gap-1 text-sm font-bold"
            style={{ color: signColor(changePct) }}
          >
            {arrow(changePct)} {fmtPct(changePct)}
            <span className="text-[var(--md-sys-color-on-surface-variant)]">
              (어제보다)
            </span>
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
            aria-label="닫기"
          >
            <Icon name="close" size={22} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto p-5">
        {/* 현재가 */}
        <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-3">
          <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            지금 가격
          </p>
          <p className="text-3xl font-black" style={{ color: stock.color }}>
            {hasPrice ? fmtMb(unit) : "시세 준비 중"}
          </p>
        </div>

        {/* 차트 기간 필터 — [1주][1달][3달][1년] */}
        <div className="grid grid-cols-4 gap-1 rounded-full bg-[var(--md-sys-color-surface-container)] p-1">
          {PERIODS.map((p) => {
            const on = period === p.key;
            return (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                aria-pressed={on}
                className="rounded-full py-2 text-sm font-extrabold transition"
                style={
                  on
                    ? {
                        background: "var(--md-sys-color-primary)",
                        color: "var(--md-sys-color-on-primary)",
                      }
                    : { color: "var(--md-sys-color-on-surface-variant)" }
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* 차트 */}
        {candles === null ? (
          <div className="flex h-44 w-full items-center justify-center rounded-2xl bg-[var(--md-sys-color-surface-container)] text-sm text-[var(--md-sys-color-on-surface-variant)]">
            차트 불러오는 중…
          </div>
        ) : (
          <StockChart
            candles={view}
            color={stock.color}
            days={view.length}
            weekly={isWeekly}
            divisor={divisor}
          />
        )}
        {hi > 0 && (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-surface-container)] px-3 py-1.5 font-semibold">
              <span className="text-[var(--md-sys-color-on-surface-variant)]">
                {periodLabel} 최고
              </span>
              <span style={{ color: "var(--trade-up)" }}>{fmtMb(hi)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-surface-container)] px-3 py-1.5 font-semibold">
              <span className="text-[var(--md-sys-color-on-surface-variant)]">
                {periodLabel} 최저
              </span>
              <span style={{ color: "var(--trade-down)" }}>{fmtMb(lo)}</span>
            </span>
          </div>
        )}

        {/* 종목 안내 카드 — 어린이용 회사 소개 + 오늘/1년 시세 요약 */}
        {hasInfo && (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-3">
              <p className="flex items-center gap-1.5 text-sm font-extrabold text-[var(--md-sys-color-on-surface)]">
                <Icon name="info" size={16} style={{ color: stock.color }} />
                이 회사는 어떤 회사예요?
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
                {stock.desc}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-2">
              <InfoCell label="오늘 시가" hint="오늘 문을 연 가격" value={fmtMb(todayOpen)} />
              <InfoCell label="전일 종가" hint="어제 문을 닫은 가격" value={fmtMb(prevCloseMb)} />
              <InfoCell
                label="오늘 고가"
                hint="오늘 가장 비쌌던 가격"
                value={fmtMb(todayHigh)}
                valueColor="var(--trade-up)"
              />
              <InfoCell
                label="오늘 저가"
                hint="오늘 가장 쌌던 가격"
                value={fmtMb(todayLow)}
                valueColor="var(--trade-down)"
              />
              <InfoCell
                label="1년 사이 최고"
                value={fmtMb(yearHi)}
                valueColor="var(--trade-up)"
              />
              <InfoCell
                label="1년 사이 최저"
                value={fmtMb(yearLo)}
                valueColor="var(--trade-down)"
              />
            </dl>

            <div className="flex items-center justify-between rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-3">
              <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                오늘 거래량{" "}
                <span className="text-xs">(오늘 사고판 주식 수)</span>
              </span>
              <span className="text-base font-extrabold text-[var(--md-sys-color-on-surface)]">
                {fmtVolume(todayVol)}
              </span>
            </div>
          </div>
        )}

        {/* 내 보유 */}
        {holdingQty > 0 && (
          <div className="flex items-center justify-between rounded-2xl bg-[var(--md-sys-color-primary-container)] px-4 py-3 text-[var(--md-sys-color-on-primary-container)]">
            <span className="text-sm font-bold">내가 가진 수량</span>
            <span className="text-sm font-extrabold">
              {holdingQty}주 · 평균 {fmtMb(avgCost)}
            </span>
          </div>
        )}

        {/* 거래 영역 — 교사 보기 모드에선 전부 숨김(관전 전용) */}
        {!viewer &&
          (!marketOpen ? (
          <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-4 text-center text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            <Icon name="schedule" size={18} className="mr-1 inline-block align-middle" />
            지금은 거래 시간이 아니에요.
            {nextOpenText && (
              <span className="mt-1 block font-bold text-[var(--md-sys-color-on-surface)]">
                다음 거래: {nextOpenText}
              </span>
            )}
          </div>
        ) : !hasPrice ? (
          <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-4 text-center text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            시세를 불러오는 중이에요. 잠시 후 다시 시도해 주세요.
          </div>
        ) : (
          <>
            {/* 사기 / 팔기 세그먼트 */}
            <div className="grid grid-cols-2 gap-2 rounded-full bg-[var(--md-sys-color-surface-container)] p-1">
              <button
                onClick={() => selectSide("buy")}
                className="rounded-full py-2.5 text-sm font-extrabold transition"
                style={
                  side === "buy"
                    ? { background: "var(--trade-up)", color: "#fff" }
                    : { color: "var(--md-sys-color-on-surface-variant)" }
                }
              >
                사기
              </button>
              <button
                onClick={() => selectSide("sell")}
                disabled={holdingQty <= 0}
                className="rounded-full py-2.5 text-sm font-extrabold transition disabled:opacity-40"
                style={
                  side === "sell"
                    ? { background: "var(--trade-down)", color: "#fff" }
                    : { color: "var(--md-sys-color-on-surface-variant)" }
                }
              >
                팔기
              </button>
            </div>

            {max < 1 ? (
              <p className="flex items-center justify-center gap-1.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-4 text-center text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                <Icon name="sentiment_dissatisfied" size={18} className="shrink-0" />
                {side === "buy"
                  ? "만보가 부족해서 한 주도 살 수 없어요"
                  : "팔 수 있는 주식이 없어요."}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {/* 수량 스텝퍼 */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-[var(--md-sys-color-on-surface-variant)]">
                    몇 주?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => step(-1)}
                      disabled={clampedQty <= 1}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] transition hover:brightness-95 disabled:opacity-40"
                      aria-label="수량 줄이기"
                    >
                      <Icon name="remove" size={22} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={max}
                      value={clampedQty}
                      onChange={(e) =>
                        setQty(parseInt(e.target.value, 10) || 1)
                      }
                      className="w-16 rounded-xl border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface)] py-2 text-center text-lg font-extrabold text-[var(--md-sys-color-on-surface)]"
                    />
                    <button
                      onClick={() => step(1)}
                      disabled={clampedQty >= max}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] transition hover:brightness-95 disabled:opacity-40"
                      aria-label="수량 늘리기"
                    >
                      <Icon name="add" size={22} />
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setQty(max)}
                  className="self-end rounded-full border border-[var(--md-sys-color-outline)] px-4 py-1.5 text-xs font-bold text-[var(--md-sys-color-primary)] transition hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
                >
                  {side === "buy"
                    ? `살 수 있는 최대 (${max}주)`
                    : `가진 만큼 전부 (${max}주)`}
                </button>

                {/* 총액 — 가격과 수수료를 나눠 보여줘서 "거래할 때마다 비용이 든다"를 체감하게 한다. */}
                <div className="flex flex-col gap-1.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                    <span>{fmtMb(subtotal)} ({clampedQty}주 × {fmtMb(unit)})</span>
                    <span>{side === "buy" ? "+" : "−"} 수수료 {fmtMb(fee)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--md-sys-color-on-surface-variant)]">
                      {side === "buy" ? "낼 만보" : "받을 만보"}
                    </span>
                    <span
                      className="text-xl font-black"
                      style={{ color: side === "buy" ? "var(--trade-up)" : "var(--trade-down)" }}
                    >
                      {fmtMb(total)}
                    </span>
                  </div>
                </div>
                <p className="-mt-1 flex items-center gap-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  <Icon name="info" size={13} className="shrink-0" />
                  {side === "buy"
                    ? `거래 뒤 남는 만보 ${fmtMb(balance - total)} · 사고팔 때마다 수수료가 조금씩 들어요`
                    : "실제 증권사처럼 팔 때도 수수료가 조금 빠져요"}
                </p>

                {doneMsg && (
                  <p className="flex items-center justify-center gap-1.5 rounded-2xl bg-[var(--md-sys-color-tertiary-container)] px-4 py-3 text-center text-sm font-extrabold text-[var(--md-sys-color-on-tertiary-container)]">
                    <Icon name="celebration" size={18} className="shrink-0" />
                    {doneMsg}
                  </p>
                )}
                {err && (
                  <p className="rounded-2xl bg-[var(--md-sys-color-error-container)] px-4 py-3 text-sm font-semibold text-[var(--md-sys-color-on-error-container)]">
                    {err}
                  </p>
                )}

                <button
                  onClick={confirm}
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-extrabold text-white shadow-[var(--md-sys-elevation-1)] transition hover:brightness-105 disabled:opacity-50"
                  style={{
                    background:
                      side === "buy" ? "var(--trade-up)" : "var(--trade-down)",
                  }}
                >
                  <Icon
                    name={side === "buy" ? "shopping_cart" : "sell"}
                    size={20}
                  />
                  {submitting
                    ? "처리 중…"
                    : side === "buy"
                      ? `${clampedQty}주 사기`
                      : `${clampedQty}주 팔기`}
                </button>
              </div>
            )}
          </>
        ))}
      </div>
    </>
  );
}
