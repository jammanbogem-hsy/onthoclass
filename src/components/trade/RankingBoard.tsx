"use client";

// 우리 반 수익률 랭킹 — 서버(getTradingRanking)가 정본인 positions 로 계산해 내려준다.
// 학생은 남의 positions 를 직접 읽을 수 없어 예전에는 체결 내역(trades)을 시간순으로
// "재생"해 보유/평단을 복원했는데, 체결 스냅샷은 그때의 만보 단가라 종목의 만보 환산
// 배율(mbDivisor)이 바뀌면 현재 시세와 단위가 어긋나 허위 수익률이 나왔다. 지금은 교사용
// '트레이딩 관리'와 같은 데이터·같은 수식을 쓰므로 같은 수식을 사용하되 랭킹은 캐시의 집계 시각 기준이다.
import { useEffect, useState } from "react";
import { usePageVisible } from "@/hooks/usePageVisible";
import { Icon } from "@/components/Icon";
import {
  fetchTradingRanking,
  type RankingRow,
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
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-bold"
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
        {/* 내 줄에만 손익 내역을 편다 — 친구 줄까지 펼치면 표가 복잡해진다. */}
        {mine && (
          <p className="text-[11px] font-semibold text-[var(--md-sys-color-on-primary-container)] opacity-80">
            실현 {row.realized >= 0 ? "+" : ""}
            {Math.round(row.realized).toLocaleString()} · 평가{" "}
            {row.unrealized >= 0 ? "+" : ""}
            {Math.round(row.unrealized).toLocaleString()}
          </p>
        )}
      </div>
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
  myUid,
}: {
  cid: string;
  myUid?: string;
}) {
  const [rows, setRows] = useState<RankingRow[] | null>(null);
  const visible = usePageVisible();
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await fetchTradingRanking(cid);
        if (alive) { setRows(result.rows); setGeneratedAt(result.generatedAt); setError(""); }
      } catch {
        if (alive) setError("랭킹을 불러오지 못했어요. 잠시 후 자동으로 다시 조회합니다.");
      } finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => { alive = false; clearInterval(timer); };
  }, [cid, visible]);

  const list = rows ?? [];
  const myIndex = list.findIndex((r) => r.uid === myUid);
  const top = list.slice(0, 10);
  const mineOutsideTop = myIndex >= 10 ? list[myIndex] : null;

  return (
    <>
      <h2 className="mb-2 mt-8 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-lg font-bold">
        <Icon name="leaderboard" size={20} className="text-[var(--md-sys-color-primary)]" />
        우리 반 수익률 랭킹
        <span className="text-xs font-normal text-[var(--md-sys-color-on-surface-variant)]">
          총손익(실현+평가) ÷ 주식 사는 데 쓴 만보
        </span>
      </h2>
      <p className="mb-2 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">30초 주기로 조회 · {generatedAt ? `${new Date(generatedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit" })} 집계 기준` : "학급 공용 집계로 거래 반영이 늦을 수 있어요."}</p>
      {error && <p role="status" className="mb-2 text-xs text-[var(--md-sys-color-error)]">{error}</p>}
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
