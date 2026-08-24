"use client";

/**
 * 퀴즈런 교사 콘솔 — 실시간 진행 + 결과.
 *
 * 빙고 콘솔(GameConsole)과 별개다. 빙고는 차례를 돌리는 진행자 역할이지만
 * 퀴즈런에서 교사는 시작·종료만 하고 나머지는 지켜본다.
 *
 * 순위는 4개 카테고리(점수·정답수·공크기·단계)를 각각 0~100 으로 환산해
 * 가중합한 총점 기준 — 게임을 잘하는 학생만 이기지 않도록 정답 수 비중을
 * 점수와 같게 뒀다.
 */

import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/Glass";
import { Icon } from "@/components/Icon";
import { useNameMask } from "@/components/NameMask";
import { setGameStatus, clearActiveGame, type Game } from "@/lib/games";
import {
  computeRanking,
  watchRuns,
  RANK_WEIGHTS,
  type QuizRun,
} from "@/lib/quizrun";

const CATEGORY_LABEL: Record<keyof typeof RANK_WEIGHTS, string> = {
  score: "점수",
  correct: "정답 수",
  ballRadius: "공 크기",
  stageIndex: "단계",
};

export function QuizRunConsole({
  cid,
  game,
  onClose,
}: {
  cid: string;
  game: Game;
  onClose: () => void;
}) {
  const { mask } = useNameMask();
  const [runs, setRuns] = useState<QuizRun[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => watchRuns(cid, game.id, setRuns), [cid, game.id]);

  const ranking = useMemo(() => computeRanking(runs), [runs]);
  const playing = runs.filter((r) => r.status === "playing").length;
  const totalCorrect = runs.reduce((s, r) => s + (r.correct ?? 0), 0);
  const totalWrong = runs.reduce((s, r) => s + (r.wrong ?? 0), 0);
  const accuracy =
    totalCorrect + totalWrong > 0
      ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100)
      : 0;

  const started = game.status === "play";
  const done = game.status === "done";

  async function start() {
    setBusy(true);
    try {
      await setGameStatus(cid, game.id, "play");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      await setGameStatus(cid, game.id, "done");
      await clearActiveGame(cid);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--md-sys-color-scrim)]/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <GlassCard
        strong
        className="flex h-[88vh] max-h-[860px] w-full max-w-4xl animate-float-in flex-col overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Icon
              name="sports_esports"
              size={20}
              className="text-[var(--md-sys-color-primary)]"
            />
            퀴즈런
            <span className="text-sm font-normal text-[var(--md-sys-color-on-surface-variant)]">
              {game.link.name}
            </span>
          </h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* 요약 */}
        <div className="grid grid-cols-2 gap-2 px-5 pt-4 sm:grid-cols-4">
          {[
            { label: "참여", value: `${runs.length}명` },
            { label: "진행 중", value: `${playing}명` },
            { label: "총 정답", value: `${totalCorrect}개` },
            { label: "정답률", value: `${accuracy}%` },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-3 text-center"
            >
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                {s.label}
              </p>
              <p className="mt-0.5 text-base font-extrabold">{s.value}</p>
            </div>
          ))}
        </div>

        {/* 순위 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <p className="mb-2.5 flex items-center gap-1.5 text-sm font-bold">
            <Icon
              name="leaderboard"
              size={18}
              className="text-[var(--md-sys-color-primary)]"
            />
            순위
            <span className="text-xs font-normal text-[var(--md-sys-color-on-surface-variant)]">
              4개 항목을 100점 만점으로 환산해 합산
            </span>
          </p>

          {ranking.length === 0 ? (
            <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] py-10 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
              아직 참여한 학생이 없어요.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {ranking.map((r, i) => {
                const run = runs.find((x) => x.uid === r.uid);
                return (
                  <li
                    key={r.uid}
                    className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex w-6 shrink-0 justify-center">
                        {i < 3 ? (
                          <Icon
                            name="trophy"
                            size={20}
                            fill
                            style={{
                              color: ["#d9a400", "#9098a1", "#b0763a"][i],
                            }}
                          />
                        ) : (
                          <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
                            {i + 1}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">
                        {mask(r.name)}
                      </span>
                      {run?.status === "playing" && (
                        <span className="shrink-0 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2 py-0.5 text-[11px] font-bold text-[var(--md-sys-color-on-tertiary-container)]">
                          진행 중
                        </span>
                      )}
                      <span className="shrink-0 text-base font-black tabular-nums">
                        {r.total}
                      </span>
                    </div>
                    {/* 카테고리별 환산값 — 왜 이 순위인지 교사가 알 수 있게 */}
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-8 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      {(
                        Object.keys(CATEGORY_LABEL) as (keyof typeof RANK_WEIGHTS)[]
                      ).map((k) => (
                        <span key={k} className="tabular-nums">
                          {CATEGORY_LABEL[k]} {r.parts[k]}
                        </span>
                      ))}
                      {run && (
                        <span className="tabular-nums">
                          · 정답 {run.correct}/{run.correct + run.wrong}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 진행 제어 */}
        <div className="flex items-center gap-2 border-t border-[var(--md-sys-color-outline-variant)] px-5 py-3">
          {!started && !done && (
            <button
              onClick={start}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] disabled:opacity-40"
            >
              <Icon name="play_arrow" size={18} />
              게임 시작
            </button>
          )}
          {started && (
            <button
              onClick={finish}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--md-sys-color-error-container)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-error-container)] disabled:opacity-40"
            >
              <Icon name="stop_circle" size={18} />
              게임 종료
            </button>
          )}
          {done && (
            <p className="flex-1 text-center text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">
              종료된 게임입니다
            </p>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
