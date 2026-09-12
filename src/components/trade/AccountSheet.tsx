"use client";

// MTS 계좌 화면 — [잔고] 와 [실현손익] 두 탭.
// 학생 본인(/trade)과 교사가 학생을 눌렀을 때(TradingAdminModal) 같은 컴포넌트를 쓴다.
//  · 잔고: 총손익·총매입·총평가·실현손익 요약 + 종목별 매입가/현재가·보유수량·평가손익·수익률
//  · 실현손익: 기간을 골라 실현손익 요약 + 일별/종목별 표
// 손익 색은 국내 관례(수익=빨강, 손실=파랑). .trade-scope 안팎 어디서나 같은 색이 나오도록
// CSS 변수가 아니라 고정색(util 의 PNL_UP/PNL_DOWN)을 쓴다.
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  TRADE_PERIODS,
  dailyRealized,
  periodStartMs,
  symbolRealized,
  type PeriodKey,
  type Trade,
  type TradingStats,
} from "@/lib/trading";
import { pnlStyleFixed, signed } from "@/components/trade/util";

const num = (n: number) => Math.round(n).toLocaleString();
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

/** KST 날짜 표기 — 2026/08/26 */
function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 요약 카드의 작은 항목 한 칸 */
function Cell({
  label,
  value,
  style,
}: {
  label: string;
  value: string;
  style?: { color: string };
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-3 py-2">
      <span className="shrink-0 text-xs text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </span>
      <span className="truncate text-sm font-bold tabular-nums" style={style}>
        {value}
      </span>
    </div>
  );
}

export function AccountSheet({
  stats,
  trades,
  balance,
  period,
  onPeriodChange,
}: {
  /** 이 사람의 종합 성적 — tradingStats() 결과 */
  stats: TradingStats;
  /** 이 사람의 체결 전체 이력(fillTradePnl 적용본) */
  trades: Trade[];
  /** 지갑 잔액(현금) */
  balance: number;
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
}) {
  const [tab, setTab] = useState<"balance" | "realized">("balance");
  const [by, setBy] = useState<"day" | "symbol">("day");

  const from = useMemo(() => periodStartMs(period), [period]);
  const days = useMemo(() => dailyRealized(trades, from), [trades, from]);
  const symbols = useMemo(() => symbolRealized(trades, from), [trades, from]);
  const periodLabel = TRADE_PERIODS.find((p) => p.key === period)?.label ?? "";

  return (
    <div className="flex flex-col gap-3">
      {/* 탭 */}
      <div className="flex gap-1.5">
        {(
          [
            ["balance", "잔고", "account_balance_wallet"],
            ["realized", "실현손익", "receipt_long"],
          ] as const
        ).map(([k, label, icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`inline-flex flex-1 items-center justify-center gap-1 rounded-full px-3 py-2 text-sm font-bold transition ${
              tab === k
                ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)]"
            }`}
          >
            <Icon name={icon} size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === "balance" ? (
        <>
          {/* 잔고 요약 — 키움 '국내잔고'의 총손익 카드 구조 */}
          <div className="overflow-hidden rounded-2xl border border-[var(--md-sys-color-outline-variant)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2 bg-[var(--md-sys-color-surface-container)] px-3 py-3">
              <span className="text-sm font-bold">총 손익</span>
              <span
                className="text-2xl font-black tabular-nums"
                style={pnlStyleFixed(stats.totalPnl)}
              >
                {signed(stats.totalPnl)}
                <span className="ml-1 text-sm font-bold">만보</span>
                <span className="ml-2 text-base font-extrabold">
                  {pct(stats.returnPct)}
                </span>
              </span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
              <Cell label="총 매입" value={num(stats.cost)} />
              <Cell label="총 평가" value={num(stats.value)} />
              <Cell
                label="실현손익"
                value={signed(stats.realized)}
                style={pnlStyleFixed(stats.realized)}
              />
              <Cell
                label="평가손익"
                value={signed(stats.unrealized)}
                style={pnlStyleFixed(stats.unrealized)}
              />
              <Cell label="현금(예수금)" value={num(balance)} />
              <Cell label="추정 자산" value={num(balance + stats.value)} />
            </div>
          </div>

          {/* 종목별 잔고 — 매입가/현재가 · 보유수량 · 평가손익/수익률 */}
          {stats.holdings.length === 0 ? (
            <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
              보유 중인 종목이 없어요.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[var(--md-sys-color-outline-variant)]">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="bg-[var(--md-sys-color-surface-container-highest)] text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    <th className="px-3 py-2 text-left font-semibold">종목명</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      매입가
                      <br />
                      현재가
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">보유수량</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      평가손익
                      <br />
                      수익률
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.holdings.map((h) => (
                    <tr
                      key={h.symbol}
                      className="border-t border-[var(--md-sys-color-outline-variant)]"
                    >
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5 font-bold">
                          <Icon
                            name={h.stock?.icon ?? "candlestick_chart"}
                            size={16}
                            style={{ color: h.stock?.color }}
                          />
                          {h.stock?.alias ?? h.symbol}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className="block text-[var(--md-sys-color-on-surface-variant)]">
                          {num(h.avgCost)}
                        </span>
                        <span className="block font-bold" style={pnlStyleFixed(h.pnl)}>
                          {num(h.cur)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">
                        {h.qty}주
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className="block font-bold" style={pnlStyleFixed(h.pnl)}>
                          {signed(h.pnl)}
                        </span>
                        <span
                          className="block text-xs font-bold"
                          style={pnlStyleFixed(h.pnl)}
                        >
                          {pct(h.pct)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          {/* 기간 */}
          <div className="flex flex-wrap items-center gap-1.5">
            {TRADE_PERIODS.map((p) => {
              const on = p.key === period;
              return (
                <button
                  key={p.key}
                  onClick={() => onPeriodChange(p.key)}
                  aria-pressed={on}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    on
                      ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                      : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)]"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* 실현손익 요약 — 키움 '실현손익'의 상단 카드 구조 */}
          <div className="overflow-hidden rounded-2xl border border-[var(--md-sys-color-outline-variant)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2 bg-[var(--md-sys-color-surface-container)] px-3 py-3">
              <span className="text-sm font-bold">실현 손익</span>
              <span
                className="text-2xl font-black tabular-nums"
                style={pnlStyleFixed(stats.period.realized)}
              >
                {signed(stats.period.realized)}
                <span className="ml-1 text-sm font-bold">만보</span>
                {stats.period.sellCost > 0 && (
                  <span className="ml-2 text-base font-extrabold">
                    {pct(stats.period.realizedPct)}
                  </span>
                )}
              </span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
              <Cell label="총 매수" value={num(stats.period.buyAmount)} />
              <Cell label="총 매도" value={num(stats.period.sellAmount)} />
              <Cell label="수수료" value={num(stats.period.fee)} />
              <Cell
                label="매매 횟수"
                value={`${stats.period.buyCount + stats.period.sellCount}번`}
              />
            </div>
          </div>

          {/* 일별 / 종목별 */}
          <div className="flex gap-1.5">
            {(
              [
                ["day", "일별 실현손익"],
                ["symbol", "종목별 실현손익"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setBy(k)}
                aria-pressed={by === k}
                className={`flex-1 rounded-xl px-2 py-1.5 text-xs font-bold transition ${
                  by === k
                    ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]"
                    : "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {(by === "day" ? days.length : symbols.length) === 0 ? (
            <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {periodLabel} 동안 거래한 내역이 없어요.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[var(--md-sys-color-outline-variant)]">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="bg-[var(--md-sys-color-surface-container-highest)] text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    <th className="px-3 py-2 text-left font-semibold">
                      {by === "day" ? "매매일자" : "종목명"}
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">실현손익</th>
                    <th className="px-3 py-2 text-right font-semibold">수익률</th>
                    <th className="px-3 py-2 text-right font-semibold">매수금액</th>
                    <th className="px-3 py-2 text-right font-semibold">매도금액</th>
                  </tr>
                </thead>
                <tbody>
                  {(by === "day" ? days : symbols).map((r) => {
                    const key = "day" in r ? String(r.day) : r.symbol;
                    const sold = "soldQty" in r ? r.soldQty : 0;
                    return (
                      <tr
                        key={key}
                        className="border-t border-[var(--md-sys-color-outline-variant)]"
                      >
                        <td className="whitespace-nowrap px-3 py-2 font-semibold">
                          {"day" in r ? (
                            fmtDay(r.day)
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <Icon
                                name={r.stock?.icon ?? "candlestick_chart"}
                                size={16}
                                style={{ color: r.stock?.color }}
                              />
                              {r.stock?.alias ?? r.symbol}
                              {sold > 0 && (
                                <span className="text-[11px] font-normal text-[var(--md-sys-color-on-surface-variant)]">
                                  {sold}주 팜
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td
                          className="px-3 py-2 text-right font-bold tabular-nums"
                          style={pnlStyleFixed(r.realized)}
                        >
                          {r.sellCost > 0 ? signed(r.realized) : "—"}
                        </td>
                        <td
                          className="px-3 py-2 text-right font-bold tabular-nums"
                          style={pnlStyleFixed(r.realized)}
                        >
                          {r.sellCost > 0 ? pct(r.realizedPct) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                          {r.buyAmount > 0 ? num(r.buyAmount) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                          {r.sellAmount > 0 ? num(r.sellAmount) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
            <Icon name="lightbulb" size={15} className="mt-0.5 shrink-0" />
            <span>
              <b>실현손익</b>은 주식을 팔아서 확정된 손익이에요. 수익률은 그날(그 종목)
              판 주식의 <b>원가 대비</b>로 계산해요. 수수료도 이미 빼고 계산했어요.
            </span>
          </p>
        </>
      )}
    </div>
  );
}
