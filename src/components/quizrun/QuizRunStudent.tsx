"use client";

/**
 * 퀴즈런 학생 진입 — 로비 → 게임 → 결과.
 *
 * 3D(three.js/rapier)는 브라우저 전용이라 QuizRunStage 를 SSR 없이 동적으로
 * 불러온다. 러닝크루는 정적 내보내기(output:"export")라, 서버에서 프리렌더되면
 * 빌드가 깨진다.
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useNameMask } from "@/components/NameMask";
import type { Game } from "@/lib/games";
import { requestClassXp } from "@/lib/xp";
import {
  computeRanking,
  joinRun,
  watchRuns,
  type QuizRun,
  type QuizRunConfig,
} from "@/lib/quizrun";

const QuizRunStage = dynamic(
  () => import("@/components/quizrun/QuizRunStage").then((m) => m.QuizRunStage),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-white/80">
        게임을 불러오는 중…
      </div>
    ),
  }
);

export function QuizRunStudent({
  cid,
  game,
  uid,
  name,
  onMinimize,
}: {
  cid: string;
  game: Game;
  uid: string;
  name: string;
  onMinimize: () => void;
}) {
  const { mask } = useNameMask();
  const cfg = game.quiz as QuizRunConfig | undefined;
  const [runs, setRuns] = useState<QuizRun[]>([]);
  // "한 번만 실행" 가드 — state 로 두면 effect 안에서 setState 를 부르게 되어
  // 불필요한 렌더가 한 번 더 돈다. ref 는 렌더를 유발하지 않는다.
  const joined = useRef(false);
  const xpSent = useRef(false);

  useEffect(() => watchRuns(cid, game.id, setRuns), [cid, game.id]);

  const mine = runs.find((r) => r.uid === uid) ?? null;
  const ranking = useMemo(() => computeRanking(runs), [runs]);
  const myRank = ranking.findIndex((r) => r.uid === uid);

  // 참여 등록 (한 번만)
  useEffect(() => {
    if (joined.current || !cfg) return;
    joined.current = true;
    void joinRun(cid, game.id, uid, name, cfg).catch(() => {});
  }, [cfg, cid, game.id, uid, name]);

  // 게임이 끝나면 점수를 XP 로 요청한다 — 지급은 교사 승인 후.
  // 3D 게임이라 클라이언트 값을 그대로 신뢰할 수 없어, 교사가 한 번 걸러준다.
  useEffect(() => {
    if (game.status !== "done" || xpSent.current || !mine) return;
    xpSent.current = true;
    void requestClassXp(cid, uid, {
      activity: `quizrun:${game.id}`,
      label: `퀴즈런 · ${game.link.name}`,
      score: Math.round(mine.score),
      reason: `정답 ${mine.correct}개 · 점수 ${Math.round(mine.score)}`,
    }).catch(() => {});
  }, [game.status, game.id, game.link.name, mine, cid, uid]);

  if (!cfg) return null;

  const playing = game.status === "play";
  const done = game.status === "done";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--md-sys-color-scrim)]/70 p-2 backdrop-blur-sm sm:p-4">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-black/55 px-3 py-1.5 text-sm font-bold text-white backdrop-blur">
          퀴즈런 · {game.link.name}
        </span>
        <button
          onClick={onMinimize}
          className="ml-auto rounded-full bg-black/55 p-2 text-white backdrop-blur"
          aria-label="접기"
        >
          <Icon name="close_fullscreen" size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {playing && mine ? (
          <QuizRunStage
            cid={cid}
            gid={game.id}
            uid={uid}
            cfg={cfg}
            run={mine}
            onFinish={() => {}}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl bg-[var(--md-sys-color-surface)] p-6">
            {done ? (
              <>
                <p className="text-xl font-black">게임 끝!</p>
                {myRank >= 0 && (
                  <p className="text-sm font-bold text-[var(--md-sys-color-primary)]">
                    {myRank + 1}등 · {ranking[myRank].total}점
                  </p>
                )}
                {mine && (
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    정답 {mine.correct}개 · 점수 {Math.round(mine.score)}
                  </p>
                )}
                <div className="mt-2 w-full max-w-sm">
                  {ranking.slice(0, 5).map((r, i) => (
                    <div
                      key={r.uid}
                      className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm ${
                        r.uid === uid
                          ? "bg-[var(--md-sys-color-primary-container)] font-bold text-[var(--md-sys-color-on-primary-container)]"
                          : ""
                      }`}
                    >
                      <span className="w-5 text-xs font-bold">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {mask(r.name)}
                      </span>
                      <span className="tabular-nums">{r.total}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  경험치는 선생님이 확인한 뒤 지급돼요
                </p>
              </>
            ) : (
              <>
                <Icon
                  name="sports_esports"
                  size={44}
                  className="text-[var(--md-sys-color-primary)]"
                />
                <p className="text-lg font-bold">곧 시작해요!</p>
                <p className="text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
                  문제를 풀어 <b>러닝 에너지</b>를 채우고
                  <br />
                  공을 굴려 아이템을 모으세요.
                </p>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  참여 {runs.length}명 · 선생님이 시작하면 자동으로 열려요
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
