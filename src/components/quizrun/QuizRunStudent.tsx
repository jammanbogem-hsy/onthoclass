"use client";

/**
 * 퀴즈런 학생 진입 — 로비 → 게임 → 결과.
 *
 * 3D(three.js/rapier)는 브라우저 전용이라 QuizRunStage 를 SSR 없이 동적으로
 * 불러온다. 러닝크루는 정적 내보내기(output:"export")라, 서버에서 프리렌더되면
 * 빌드가 깨진다.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useNameMask } from "@/components/NameMask";
import type { Game } from "@/lib/games";
import { requestClassXp } from "@/lib/xp";
import {
  computeRanking,
  formatClock,
  getGameStartAt,
  getIntroRemainingSec,
  joinRun,
  patchRun,
  watchRuns,
  type QuizRun,
  type QuizRunConfig,
} from "@/lib/quizrun";
import { useRemainingSec } from "@/components/quizrun/useRemainingSec";
import { QuizRunIntro } from "@/components/quizrun/QuizRunIntro";
import { QuizRunLeaderboard } from "@/components/quizrun/QuizRunLeaderboard";
import { QuizRunGallery } from "@/components/quizrun/QuizRunGallery";
import { captureGameShot, uploadGameShot } from "@/lib/quizrunShot";

// 어솔 원본 GamePage — 그래픽·에셋·HUD·연출이 배포본과 동일하다.
// (직접 만든 껍데기는 생김새가 달라 폐기했다)
const EarsoulGamePage = dynamic(
  () =>
    import("@/components/quizrun/EarsoulGamePage").then((m) => m.GamePage),
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

  // 인트로가 끝나야 게임이 시작된다 — 제한시간도 그 시각부터 잰다.
  // (영상을 건너뛴 학생이 더 오래 플레이하지 않도록)
  const gameStartAt = getGameStartAt(game.playStartedAt);
  const remainingSec = useRemainingSec(
    gameStartAt,
    cfg?.durationSec,
    game.status === "play"
  );

  // 인트로 상영 중인지. 옛 게임(playStartedAt 없음)은 인트로 없이 바로 시작한다.
  const [introDone, setIntroDone] = useState(false);
  // 인트로가 매초 상태를 다시 재므로 콜백이 바뀌면 타이머가 계속 재생성된다
  const handleIntroDone = useCallback(() => setIntroDone(true), []);
  const introLeft =
    game.status === "play" ? getIntroRemainingSec(game.playStartedAt) : null;
  const showIntro = !introDone && introLeft !== null && introLeft > 0;

  // 시간이 다 되면 내 기록을 마감한다(등수의 완주 시간이 여기서 정해진다).
  const timeUpSent = useRef(false);
  useEffect(() => {
    if (remainingSec === null || remainingSec > 0) return;
    if (timeUpSent.current || !mine || mine.status === "done") return;
    timeUpSent.current = true;
    void patchRun(cid, game.id, uid, {
      status: "done",
      finishedAt: Date.now(),
    }).catch(() => {});
  }, [remainingSec, mine, cid, game.id, uid]);

  // 게임 화면을 실제로 띄운 적이 있는지 — 사진을 찍을 캔버스가 있었다는 뜻.
  // 한 번 true 가 되면 되돌아가지 않는 값이라, 렌더 중 상태 조정으로 둔다
  // (effect 로 미루면 종료 시점에 한 박자 늦어 캔버스를 놓친다).
  const [sawGame, setSawGame] = useState(false);
  const gameVisible =
    game.status === "play" && !showIntro && remainingSec !== 0 && !!mine;
  if (gameVisible && !sawGame) setSawGame(true);

  // 끝난 순간의 공 사진을 찍어 올린다 — 학급 전시(그리드)에 쓴다.
  const [shotState, setShotState] = useState<"idle" | "done">("idle");
  const gameOver = game.status === "done" || (remainingSec !== null && remainingSec <= 0);
  useEffect(() => {
    if (!gameOver || !sawGame || shotState !== "idle") return;
    let alive = true;
    void (async () => {
      try {
        const blob = await captureGameShot();
        if (blob) {
          const url = await uploadGameShot(cid, game.id, uid, blob);
          await patchRun(cid, game.id, uid, { shotUrl: url });
        }
      } catch {
        // 사진은 부가 기능이다 — 실패해도 결과 화면은 그대로 보여 준다
      }
      if (alive) setShotState("done");
    })();
    return () => {
      alive = false;
    };
  }, [gameOver, sawGame, shotState, cid, game.id, uid]);

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

  // 제한시간이 다 되면 교사가 종료를 누르기 전에도 학생 화면은 결과로 넘어간다.
  // (교사 콘솔도 같은 시각에 게임을 종료하지만, 콘솔이 닫혀 있을 수 있다)
  const timeUp = remainingSec !== null && remainingSec <= 0;
  const playing = game.status === "play" && !timeUp && !showIntro;
  const ended = game.status === "done" || timeUp;
  // 공 사진은 게임이 아직 화면에 있을 때만 찍을 수 있다. 그래서 끝나자마자
  // 결과로 넘기지 않고 캡처가 끝날 때까지 게임을 한 박자 더 붙들어 둔다.
  const capturing = ended && sawGame && shotState !== "done";
  const done = ended && !capturing;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--md-sys-color-scrim)]/70 p-2 backdrop-blur-sm sm:p-4">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-black/55 px-3 py-1.5 text-sm font-bold text-white backdrop-blur">
          퀴즈런 · {game.link.name}
        </span>
        {remainingSec !== null && playing && (
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-black tabular-nums backdrop-blur ${
              remainingSec <= 60
                ? "bg-[var(--md-sys-color-error)] text-[var(--md-sys-color-on-error)]"
                : "bg-black/55 text-white"
            }`}
            aria-label={`남은 시간 ${Math.floor(remainingSec / 60)}분 ${
              remainingSec % 60
            }초`}
          >
            <Icon name="timer" size={16} />
            {formatClock(remainingSec)}
          </span>
        )}
        <button
          onClick={onMinimize}
          className="ml-auto rounded-full bg-black/55 p-2 text-white backdrop-blur"
          aria-label="접기"
        >
          <Icon name="close_fullscreen" size={18} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {showIntro && game.playStartedAt ? (
          <QuizRunIntro
            playStartedAt={game.playStartedAt}
            onDone={handleIntroDone}
          />
        ) : (playing || capturing) && mine ? (
          <>
            <EarsoulGamePage
              cid={cid}
              gid={game.id}
              uid={uid}
              cfg={cfg}
              run={mine}
              onExit={onMinimize}
            />
            {playing && (
              <QuizRunLeaderboard ranking={ranking} runs={runs} uid={uid} />
            )}
            {capturing && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/70 text-white backdrop-blur-sm">
                <Icon name="photo_camera" size={40} />
                <p className="text-lg font-black">결과를 정리하는 중…</p>
                <p className="text-xs opacity-80">공 사진을 찍고 있어요</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto rounded-2xl bg-[var(--md-sys-color-surface)] p-6">
            {done ? (
              <>
                <p className="text-xl font-black">게임 끝!</p>
                {myRank >= 0 && (
                  <p className="text-sm font-bold text-[var(--md-sys-color-primary)]">
                    {myRank + 1}등 · {ranking[myRank].collected}개 모음
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
                      <span className="tabular-nums">{r.collected}개</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  경험치는 선생님이 확인한 뒤 지급돼요
                </p>
                <QuizRunGallery
                  ranking={ranking}
                  runs={runs}
                  uid={uid}
                  title={`퀴즈런 · ${game.link.name}`}
                />
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
