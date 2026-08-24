"use client";

/**
 * 게임 중 실시간 리더보드 — 학급 친구들이 지금 어디까지 갔는지 보여 준다.
 *
 * 게임(어솔) 코드가 아니라 그 위에 얹는 오버레이다. 데이터는 QuizRunStudent 가
 * 이미 구독 중인 runs 를 그대로 받는다 — 리스너를 새로 열지 않는다.
 *
 * 화면을 가리면 안 되므로 접을 수 있게 두고, 접었을 때는 내 등수만 남긴다.
 * 3D 화면 위에 뜨므로 pointer-events 는 이 패널에만 준다.
 */

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useNameMask } from "@/components/NameMask";
import type { QuizRun, RankBreakdown } from "@/lib/quizrun";

export function QuizRunLeaderboard({
  ranking,
  runs,
  uid,
}: {
  ranking: RankBreakdown[];
  runs: QuizRun[];
  uid: string;
}) {
  const { mask } = useNameMask();
  const [open, setOpen] = useState(true);
  const myRank = ranking.findIndex((r) => r.uid === uid);
  const scoreByUid = new Map(runs.map((r) => [r.uid, r.score ?? 0]));

  if (ranking.length === 0) return null;

  return (
    <div className="pointer-events-none absolute right-2 top-2 z-20 flex max-w-[46vw] flex-col items-end gap-1.5 sm:right-3 sm:top-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur"
        aria-expanded={open}
      >
        <Icon name="leaderboard" size={14} />
        {myRank >= 0 ? `내 순위 ${myRank + 1}등` : "순위"}
        <Icon name={open ? "expand_less" : "expand_more"} size={14} />
      </button>

      {open && (
        <ol className="pointer-events-auto max-h-[46vh] w-52 overflow-y-auto rounded-2xl bg-black/60 p-1.5 text-white backdrop-blur">
          {ranking.map((r, i) => {
            const isMe = r.uid === uid;
            return (
              <li
                key={r.uid}
                className={`flex items-center gap-1.5 rounded-xl px-2 py-1 ${
                  isMe ? "bg-white/25 font-black" : ""
                }`}
              >
                <span className="w-4 shrink-0 text-center text-[11px] font-bold tabular-nums opacity-80">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">
                  {mask(r.name)}
                </span>
                {/* 맵 단계 — 몇 번째 맵을 달리는 중인지 */}
                <span className="shrink-0 rounded-full bg-white/20 px-1.5 text-[10px] font-bold tabular-nums">
                  맵{r.stageIndex + 1}
                </span>
                <span className="w-7 shrink-0 text-right text-xs font-black tabular-nums">
                  {r.collected}
                </span>
                <span className="w-11 shrink-0 text-right text-[10px] tabular-nums opacity-75">
                  {Math.round(scoreByUid.get(r.uid) ?? 0).toLocaleString()}
                </span>
              </li>
            );
          })}
          <li className="mt-1 flex items-center gap-1.5 px-2 pb-0.5 text-[10px] opacity-60">
            <span className="ml-auto">개수</span>
            <span className="w-11 text-right">점수</span>
          </li>
        </ol>
      )}
    </div>
  );
}
