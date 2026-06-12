"use client";

import { Icon } from "@/components/Icon";
import type { Game, GameSubmission } from "@/lib/games";

/**
 * 게임 종료 후 최종 결과(올림픽 랭킹) — 교사 콘솔/학생 화면 공용.
 * 이름은 호출부가 nameOf 로 주입(교사=멤버 displayName, 학생=제출 name).
 * myUid 가 주어지면 본인 행을 강조한다.
 */
export function GameResults({
  game,
  subs,
  nameOf,
  myUid,
}: {
  game: Game;
  subs: GameSubmission[];
  nameOf: (uid: string) => string;
  myUid?: string;
}) {
  const ranked = [...game.ranks].sort((a, b) => a.rank - b.rank);
  const rankedUids = new Set(game.ranks.map((r) => r.uid));
  // 빙고는 완성했지만 상한(maxPlayers) 초과로 순위에 못 든 학생
  const finishedUnranked = subs
    .filter((s) => !rankedUids.has(s.uid) && s.status === "done")
    .sort((a, b) => (a.finishedAtTurn ?? 0) - (b.finishedAtTurn ?? 0));

  const medalOf = (rank: number): string => `${rank}등`;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <header className="flex flex-col items-center gap-1 text-center">
        <p className="text-xs font-bold tracking-[0.3em] text-[var(--md-sys-color-tertiary)]">
          GAME OVER
        </p>
        <h2 className="flex items-center gap-2 text-3xl font-black sm:text-4xl">
          <Icon name="emoji_events" size={32} />
          최종 결과
        </h2>
      </header>

      {ranked.length === 0 ? (
        <p className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-4 text-center text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">
          이번 게임은 빙고를 완성한 친구가 없었어요.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {ranked.map((p) => {
            const isMe = !!myUid && p.uid === myUid;
            return (
              <li
                key={p.uid}
                className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 ${
                  isMe
                    ? "border-[var(--md-sys-color-tertiary)] bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
                    : "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                }`}
              >
                <span className="w-10 shrink-0 text-center text-2xl font-black leading-none">
                  {medalOf(p.rank)}
                </span>
                <span className="line-clamp-1 flex-1 text-lg font-extrabold">
                  {nameOf(p.uid)}
                  {isMe && (
                    <span className="ml-1 text-xs font-bold opacity-70">(나)</span>
                  )}
                </span>
                <span className="text-xs font-bold opacity-80">
                  {p.doneAtTurn}번째에 완성
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {finishedUnranked.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold tracking-[0.2em] text-[var(--md-sys-color-on-surface-variant)]">
            완성 (순위 밖)
          </p>
          {finishedUnranked.map((s) => {
            const isMe = !!myUid && s.uid === myUid;
            return (
              <div
                key={s.uid}
                className="flex items-center gap-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] px-4 py-2 text-[var(--md-sys-color-on-surface)]"
              >
                <Icon name="check_circle" size={18} />
                <span className="line-clamp-1 flex-1 text-sm font-bold">
                  {nameOf(s.uid)}
                  {isMe && (
                    <span className="ml-1 text-xs font-bold opacity-60">(나)</span>
                  )}
                </span>
                <span className="text-[11px] font-bold opacity-70">완성</span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
