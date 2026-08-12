"use client";

// 우리 반 수익률 랭킹 — 서버(getTradingRanking)가 정본인 positions 로 계산해 내려준다.
// 학생은 남의 positions 를 직접 읽을 수 없어 예전에는 체결 내역(trades)을 시간순으로
// "재생"해 보유/평단을 복원했는데, 체결 스냅샷은 그때의 만보 단가라 종목의 만보 환산
// 배율(mbDivisor)이 바뀌면 현재 시세와 단위가 어긋나 허위 수익률이 나왔다. 지금은 교사용
// '트레이딩 관리'와 같은 데이터·같은 수식을 쓰므로 두 화면 숫자가 항상 일치한다.
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  fetchTradingRanking,
  watchRecentTrades,
  type RankingRow,
  type TradingPrices,
} from "@/lib/trading";
import { fmtMb, fmtPct, pnlColor } from "@/components/trade/util";

function RankRowItem({ row, rank, mine }: { row: RankingRow; rank: number; mine: boolean }) {
  return (
    <li
      className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5"
      style={{
        background: mine
          ? "var(--md-sys-color-primary-container)"
          : "var(--md-sys-color-surface-container)",
      }}
    >
      <span className="flex w-6 shrink-0 items-center justify-center">
        {rank <= 3 ? (
          <Icon
            name="trophy"
            size={20}
            fill
            style={{ color: ["#d9a400", "#9098a1", "#b0763a"][rank - 1] }}
          />
        ) : (
          <span
            className="text-xs font-bold"
            style={{
              color: mine
                ? "var(--md-sys-color-on-primary-container)"
                : "var(--md-sys-color-on-surface-variant)",
            }}
          >
            {rank}
          </span>
        )}
      </span>
      <p
        className="min-w-0 flex-1 truncate text-sm font-bold"
        style={{
          color: mine
            ? "var(--md-sys-color-on-primary-container)"
            : "var(--md-sys-color-on-surface)",
        }}
      >
        {row.name}
        {mine && (
          <span className="ml-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-1.5 py-0.5 text-[10px] font-extrabold text-[var(--md-sys-color-on-primary)]">
            나
          </span>
        )}
      </p>
      <div className="shrink-0 text-right">
        <p className="text-sm font-extrabold" style={{ color: pnlColor(row.returnPct) }}>
          {fmtPct(row.returnPct)}
        </p>
        <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
          {row.totalPnl >= 0 ? "+" : ""}
          {fmtMb(row.totalPnl)}
        </p>
      </div>
    </li>
  );
}

export function RankingBoard({
  cid,
  prices,
  myUid,
}: {
  cid: string;
  /** 계산에는 쓰지 않고 갱신 신호로만 쓴다 — 시세가 바뀌면 수익률도 바뀐다. */
  prices: TradingPrices | null;
  myUid?: string;
}) {
  const [rows, setRows] = useState<RankingRow[] | null>(null);
  // 친구가 방금 체결하면 랭킹도 바로 움직이도록, 최신 체결 1건을 갱신 트리거로 구독한다.
  const [lastTradeId, setLastTradeId] = useState("");

  useEffect(
    () => watchRecentTrades(cid, (list) => setLastTradeId(list[0]?.id ?? ""), 1),
    [cid]
  );

  const priceAt = prices?.updatedAt ?? 0;
  useEffect(() => {
    let alive = true;
    fetchTradingRanking(cid)
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch(() => {
        if (alive) setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [cid, priceAt, lastTradeId]);

  const list = rows ?? [];
  const myIndex = list.findIndex((r) => r.uid === myUid);
  const top = list.slice(0, 10);
  const mineOutsideTop = myIndex >= 10 ? list[myIndex] : null;

  return (
    <>
      <h2 className="mb-2 mt-8 flex items-center gap-2 text-lg font-bold">
        <Icon name="leaderboard" size={20} className="text-[var(--md-sys-color-primary)]" />
        우리 반 수익률 랭킹
      </h2>
      <div className="rounded-3xl bg-[var(--md-sys-color-surface-container-low)] p-4">
        {rows === null ? (
          <p className="py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            불러오는 중…
          </p>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            아직 거래한 친구가 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {top.map((r, i) => (
              <RankRowItem key={r.uid} row={r} rank={i + 1} mine={r.uid === myUid} />
            ))}
            {mineOutsideTop && (
              <>
                <li className="py-0.5 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  ···
                </li>
                <RankRowItem row={mineOutsideTop} rank={myIndex + 1} mine />
              </>
            )}
          </ul>
        )}
      </div>
    </>
  );
}
