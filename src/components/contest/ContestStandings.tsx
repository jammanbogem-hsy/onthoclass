"use client";

// 주식대회 순위표 — 시상대(금은동) + 전체 순위. 교사 화면과 학생 화면이 같이 쓴다.
// 값은 서버(getStockContestStandings)가 "개설 시점 대비" 로 계산해 내려준 것 그대로다.
import { Icon } from "@/components/Icon";
import {
  contestRank,
  contestValueText,
  type ContestMetric,
  type ContestStanding,
} from "@/lib/contest";
import { pnlStyleFixed, signed } from "@/components/trade/util";

const MEDAL = ["#d9a400", "#9098a1", "#b0763a"];

export function ContestStandings({
  rows,
  metric,
  /** 여러 학급 합동이면 이름 옆에 학급을 붙인다. */
  showClass,
  /** 내 줄을 강조(학생 화면). */
  myUid,
}: {
  rows: ContestStanding[];
  metric: ContestMetric;
  showClass?: boolean;
  myUid?: string;
}) {
  // 대회 기간에 한 번도 거래하지 않은 학생은 등수에서 빼고 아래에 따로 적는다.
  const active = contestRank(
    rows.filter((r) => r.tradeCount > 0 || r.pnl !== 0),
    metric
  );
  const idle = rows.filter((r) => r.tradeCount === 0 && r.pnl === 0);

  if (active.length === 0) {
    return (
      <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
        아직 대회가 시작된 뒤로 거래한 학생이 없어요.
        <br />
        학생들이 사고팔면 여기에 등수가 나타나요.
      </p>
    );
  }

  return (
    <>
      {/* 시상대 — 2위·1위·3위 순으로 놓아 가운데가 1위 */}
      <div className="mb-3 grid grid-cols-3 items-end gap-2">
        {[1, 0, 2].map((i) => {
          const r = active[i];
          if (!r) return <div key={i} />;
          const tall = i === 0;
          return (
            <div
              key={r.uid}
              className="flex flex-col items-center justify-end rounded-2xl px-2 py-3 text-center"
              style={{
                background: `color-mix(in srgb, ${MEDAL[i]} 14%, var(--md-sys-color-surface-container))`,
                minHeight: tall ? 138 : 116,
              }}
            >
              <Icon name="trophy" size={tall ? 32 : 25} fill style={{ color: MEDAL[i] }} />
              <p
                className={`mt-1 w-full truncate font-black ${tall ? "text-base" : "text-sm"}`}
              >
                {r.name}
              </p>
              {showClass && (
                <p className="w-full truncate text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                  {r.className}
                </p>
              )}
              <p
                className={`font-black tabular-nums ${tall ? "text-xl" : "text-lg"}`}
                style={pnlStyleFixed(metric === "pct" ? r.pct : r.pnl)}
              >
                {contestValueText(r, metric)}
              </p>
              <p className="text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
                {i + 1}위
              </p>
            </div>
          );
        })}
      </div>

      <ul className="flex flex-col gap-1.5">
        {active.map((r, i) => {
          const mine = !!myUid && r.uid === myUid;
          return (
            <li
              key={r.uid}
              className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5"
              style={{
                background: mine
                  ? "var(--md-sys-color-primary-container)"
                  : "var(--md-sys-color-surface-container)",
              }}
            >
              <span className="flex w-6 shrink-0 items-center justify-center">
                {i < 3 ? (
                  <Icon name="trophy" size={20} fill style={{ color: MEDAL[i] }} />
                ) : (
                  <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
                    {i + 1}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {r.name}
                  {showClass && (
                    <span className="ml-1.5 text-[11px] font-normal text-[var(--md-sys-color-on-surface-variant)]">
                      {r.className}
                    </span>
                  )}
                  {mine && (
                    <span className="ml-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-1.5 py-0.5 text-[10px] font-extrabold text-[var(--md-sys-color-on-primary)]">
                      나
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                  시작 {Math.round(r.startAssets).toLocaleString()} → 지금{" "}
                  {Math.round(r.nowAssets).toLocaleString()} 만보 · 매매 {r.tradeCount}번
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className="text-base font-black tabular-nums"
                  style={pnlStyleFixed(metric === "pct" ? r.pct : r.pnl)}
                >
                  {contestValueText(r, metric)}
                </p>
                <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                  {metric === "pct"
                    ? `대회 손익 ${signed(r.pnl)}`
                    : `수익률 ${r.pct > 0 ? "+" : ""}${r.pct.toFixed(1)}%`}
                  {" · 실현 "}
                  {signed(r.realizedInContest)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {idle.length > 0 && (
        <p className="mt-2 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-[11px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
          <b>{idle.length}명</b>은 대회가 시작된 뒤로 거래가 없어 등수에서 빠졌어요 (
          {idle.map((r) => r.name).join(", ")})
        </p>
      )}
    </>
  );
}
