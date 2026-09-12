"use client";

/**
 * 게임 이력의 퀴즈런 상세 — 지난 퀴즈런의 순위와 러닝볼 전시를 다시 본다.
 *
 * 빙고 이력은 제출 단어를 워드클라우드·지식맵으로 분석하지만, 퀴즈런에는
 * 제출 단어가 없다(문제를 풀어 공을 굴린다). 그래서 같은 자리에 순위표와
 * 전시를 대신 놓는다. 사진과 저장(PNG/HTML/PDF)은 결과 화면과 같은 것을 쓴다.
 *
 * 실시간이 필요 없는 화면이라 구독 대신 한 번만 읽는다.
 */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useNameMask } from "@/components/NameMask";
import type { Game } from "@/lib/games";
import { computeRanking, getRuns, type QuizRun } from "@/lib/quizrun";
import { QuizRunGallery } from "@/components/quizrun/QuizRunGallery";

const MEDAL = ["#d9a400", "#9098a1", "#b0763a"];

export function QuizRunHistoryPanel({
  cid,
  game,
}: {
  cid: string;
  game: Game;
}) {
  const { mask } = useNameMask();
  const [runs, setRuns] = useState<QuizRun[] | null>(null);
  const [failed, setFailed] = useState(false);

  // 다른 게임을 고르면 호출부가 key 로 이 컴포넌트를 새로 만든다 —
  // 그래서 여기서 이전 결과를 지우는 초기화가 필요 없다.
  useEffect(() => {
    let alive = true;
    getRuns(cid, game.id)
      .then((r) => alive && setRuns(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [cid, game.id]);

  const ranking = useMemo(() => computeRanking(runs ?? []), [runs]);
  const totalCorrect = (runs ?? []).reduce((s, r) => s + (r.correct ?? 0), 0);
  const totalWrong = (runs ?? []).reduce((s, r) => s + (r.wrong ?? 0), 0);
  const accuracy =
    totalCorrect + totalWrong > 0
      ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-black text-[var(--md-sys-color-on-surface)]">
          {game.link.name || "이름 없는 게임"}
        </h3>
        <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
          퀴즈런 · 문제 {game.quiz?.items.length ?? 0}개 · 제한{" "}
          {Math.round((game.quiz?.durationSec ?? 0) / 60)}분
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "참여", value: `${runs?.length ?? 0}명` },
          { label: "총 정답", value: `${totalCorrect}개` },
          { label: "정답률", value: `${accuracy}%` },
          {
            label: "최고 기록",
            value: ranking[0] ? `${ranking[0].collected}개` : "—",
          },
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

      <section className="flex flex-col gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-extrabold">
          <Icon name="leaderboard" size={18} />
          순위
          <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
            모은 오브젝트 개수 순
          </span>
        </h4>

        {failed ? (
          <p className="rounded-2xl bg-[var(--md-sys-color-error-container)] px-4 py-6 text-center text-sm font-semibold text-[var(--md-sys-color-on-error-container)]">
            기록을 불러오지 못했어요.
          </p>
        ) : runs === null ? (
          <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            불러오는 중…
          </p>
        ) : ranking.length === 0 ? (
          <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] py-8 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            참여 기록이 없는 게임이에요.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {ranking.map((r, i) => {
              const run = runs.find((x) => x.uid === r.uid);
              return (
                <li
                  key={r.uid}
                  className="flex items-center gap-2.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-3 py-2"
                >
                  <span className="flex w-7 shrink-0 justify-center">
                    {i < 3 ? (
                      <Icon
                        name="trophy"
                        size={18}
                        fill
                        style={{ color: MEDAL[i] }}
                      />
                    ) : (
                      <span className="text-xs font-bold tabular-nums opacity-70">
                        {i + 1}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {mask(r.name)}
                  </span>
                  <span className="shrink-0 rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-bold tabular-nums">
                    맵 {r.stageIndex + 1}
                  </span>
                  <span className="shrink-0 text-sm font-black tabular-nums">
                    {r.collected}
                    <span className="ml-0.5 text-[11px] font-bold">개</span>
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums opacity-75">
                    {Math.round(run?.score ?? 0).toLocaleString()}점
                  </span>
                  <span className="w-20 shrink-0 text-right text-[11px] tabular-nums opacity-70">
                    정답 {r.correct}/{r.correct + r.wrong}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {runs && (
        <QuizRunGallery
          ranking={ranking}
          runs={runs}
          uid=""
          title={`퀴즈런 · ${game.link.name}`}
        />
      )}
    </div>
  );
}
