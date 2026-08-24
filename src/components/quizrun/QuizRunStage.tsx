"use client";

/**
 * 퀴즈런 학생 화면 — 3D 게임 + 에너지 + 문제 오버레이를 묶는다.
 *
 * 어솔의 GamePage(985줄)를 그대로 옮기지 않고 필요한 조립만 다시 썼다.
 * 원본은 자체 CSS 클래스·라우터·튜토리얼 코치마크에 묶여 있어, 러닝크루로
 * 가져오면 스타일 부채가 그대로 따라온다. 게임의 핵심(물리·수집·성장)은
 * GameCanvas 와 엔진 모듈에 있으므로 그쪽을 재사용하고 껍데기만 새로 만든다.
 *
 * 에너지 게이트는 GameCanvas 의 기존 `paused` prop 을 그대로 쓴다 —
 * 물리·렌더 코드를 건드리지 않고 이동만 멈출 수 있다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { GameCanvas, type PlayerMapPose } from "@/components/quizrun/GameCanvas";
import { QuestionOverlay } from "@/components/quizrun/QuestionOverlay";
import type { ControlVector } from "@/components/quizrun/TouchJoystick";
import { fallbackLearningPack } from "@/lib/quizrun-engine/data/learningPack";
import { getCollectedObjectsInOrder } from "@/lib/quizrun-engine/collectionOrder";
import { calculateBallRadius } from "@/lib/quizrun-engine/growth";
import { charge, drain } from "@/lib/quizrun-engine/energy";
import {
  createEmptyPowerUps,
  createPowerUpPickups,
  type ActivePowerUps,
  type PowerUpPickup,
} from "@/lib/quizrun-engine/powerUps";
import type { LearningObject } from "@/lib/quizrun-engine/types";
import {
  nextItem,
  patchRun,
  type QuizItem,
  type QuizRun,
  type QuizRunConfig,
} from "@/lib/quizrun";

/** Firestore 쓰기 간격(ms). 매 프레임 쓰면 요금과 쿼터가 터진다 —
 *  에너지는 화면에만 부드럽게 반영하고, 서버에는 주기적으로만 올린다. */
const SYNC_MS = 3000;

export function QuizRunStage({
  cid,
  gid,
  uid,
  cfg,
  run,
  onFinish,
}: {
  cid: string;
  gid: string;
  uid: string;
  cfg: QuizRunConfig;
  run: QuizRun;
  onFinish: () => void;
}) {
  // ── 게임 상태 (화면용 — 서버 동기화는 주기적으로) ──
  const [energy, setEnergy] = useState(run.energy);
  const [score, setScore] = useState(run.score);
  const [correct, setCorrect] = useState(run.correct);
  const [wrong, setWrong] = useState(run.wrong);
  const [collectedIds, setCollectedIds] = useState<string[]>([]);
  const [powerUpIds, setPowerUpIds] = useState<string[]>([]);
  const [quizOpen, setQuizOpen] = useState(false);
  const [order, setOrder] = useState<string[]>(run.order);
  const [cursor, setCursor] = useState(run.cursor);
  const [controlVector] = useState<ControlVector>({ x: 0, z: 0 });
  const [, setPose] = useState<PlayerMapPose>({
    x: 0,
    z: 0,
    headingX: 0,
    headingZ: 1,
  });

  const stage = fallbackLearningPack.stages[0];
  const powerUpPickups = useMemo(() => createPowerUpPickups(stage), [stage]);
  const activePowerUps: ActivePowerUps = useMemo(
    () => createEmptyPowerUps(),
    []
  );

  const attachedObjects = getCollectedObjectsInOrder(
    stage.objects,
    collectedIds
  );
  const ballRadius = calculateBallRadius(
    collectedIds.length,
    stage.tierGoals.map((g) => g.requiredCount)
  );

  // ── 에너지 소모: 움직이는 동안에만 ──
  // GameCanvas 는 키 입력을 내부에서 처리하므로, 여기서는 "이동 중인지"를
  // 플레이어 위치 변화로 감지한다(onPlayerPosition 이 매 프레임 온다).
  const lastPos = useRef<{ x: number; z: number } | null>(null);
  const lastAt = useRef<number>(0); // 첫 프레임에서 채운다(렌더 중 Date.now() 금지)

  const handlePose = useCallback(
    (p: PlayerMapPose) => {
      setPose(p);
      const now = Date.now();
      const prevAt = lastAt.current;
      lastAt.current = now;
      if (prevAt === 0) return; // 첫 프레임 — 간격을 알 수 없다
      const delta = (now - prevAt) / 1000;
      const prev = lastPos.current;
      lastPos.current = { x: p.x, z: p.z };
      if (!prev || delta <= 0 || delta > 1) return; // 탭 복귀 등 큰 간격은 무시
      const moved = Math.hypot(p.x - prev.x, p.z - prev.z) > 0.01;
      if (!moved) return;
      setEnergy((e) => drain(e, true, delta, cfg));
    },
    [cfg]
  );

  const outOfEnergy = energy <= 0;
  // 에너지가 떨어지면 문제 화면을 연다 — effect 로 setState 하면 한 프레임
  // 깜빡이므로 파생값으로 계산한다(학생이 뭘 해야 할지 헤매지 않게).
  const showQuiz = quizOpen || outOfEnergy;

  // ── 수집 ──
  const handleCollect = useCallback((item: LearningObject) => {
    setCollectedIds((ids) => (ids.includes(item.id) ? ids : [...ids, item.id]));
    setScore((s) => s + item.points);
  }, []);

  const handlePowerUp = useCallback((p: PowerUpPickup) => {
    setPowerUpIds((ids) => (ids.includes(p.id) ? ids : [...ids, p.id]));
  }, []);

  // ── 문제 ──
  // 다음 문제는 (문항·순서·커서)에서 결정되는 파생값 — state 로 두고 effect 로
  // 채우면 한 프레임 빈 화면이 뜬다.
  const picked = useMemo(
    () => nextItem(cfg.items, { order, cursor, uid }),
    [cfg.items, order, cursor, uid]
  );
  const item: QuizItem | null = picked.item;

  const handleAnswer = useCallback(
    (isCorrect: boolean) => {
      if (isCorrect) {
        setEnergy((e) => charge(e, cfg));
        setCorrect((c) => c + 1);
      } else {
        setWrong((w) => w + 1);
      }
      // 정답·오답 모두 다음 문제로(재도전 없음).
      // 한 바퀴를 다 돌았으면 nextItem 이 새로 섞은 순서를 여기서 반영한다.
      const after = nextItem(cfg.items, { order, cursor: cursor + 1, uid });
      if (after.order !== order) setOrder(after.order);
      setCursor(after.cursor);
    },
    [cfg, order, cursor, uid]
  );

  // ── 서버 동기화 (주기적) ──
  useEffect(() => {
    const t = setInterval(() => {
      void patchRun(cid, gid, uid, {
        energy,
        score,
        correct,
        wrong,
        ballRadius,
        order,
        cursor,
        status: "playing",
      }).catch(() => {});
    }, SYNC_MS);
    return () => clearInterval(t);
  }, [cid, gid, uid, energy, score, correct, wrong, ballRadius, order, cursor]);

  // ── 제한 시간 ──
  const [left, setLeft] = useState(cfg.durationSec);
  useEffect(() => {
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left > 0) return;
    void patchRun(cid, gid, uid, {
      energy,
      score,
      correct,
      wrong,
      ballRadius,
      status: "done",
      finishedAt: Date.now(),
    }).catch(() => {});
    onFinish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const pct = Math.max(0, Math.min(100, (energy / cfg.energyMax) * 100));

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-black">
      <GameCanvas
        key={stage.id}
        stage={stage}
        attachedObjects={attachedObjects}
        collectedIds={collectedIds}
        ballRadius={ballRadius}
        paused={showQuiz}
        reducedMotion={false}
        controlVector={controlVector}
        activePowerUps={activePowerUps}
        powerUpPickups={powerUpPickups.filter(
          (p) => !powerUpIds.includes(p.id)
        )}
        radarTreasures={[]}
        onPlayerPosition={handlePose}
        onCollect={handleCollect}
        onPowerUpCollect={handlePowerUp}
        onTooLarge={() => {}}
        onPhysicsFeedback={() => {}}
      />

      {/* 상단 HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 p-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-white backdrop-blur">
          <Icon name="bolt" size={16} />
          <div className="h-2 w-28 overflow-hidden rounded-full bg-white/25">
            <div
              className={`h-full rounded-full transition-[width] duration-200 ${
                outOfEnergy ? "bg-red-400" : "bg-emerald-300"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="w-10 text-right text-sm font-black tabular-nums">
            {Math.round(energy)}
          </span>
        </div>

        <div className="pointer-events-auto rounded-full bg-black/55 px-3 py-1.5 text-sm font-black tabular-nums text-white backdrop-blur">
          {mm}:{ss}
        </div>

        <div className="pointer-events-auto rounded-full bg-black/55 px-3 py-1.5 text-sm font-bold text-white backdrop-blur">
          {score}점 · 정답 {correct}
        </div>

        <button
          type="button"
          onClick={() => setQuizOpen(true)}
          className="pointer-events-auto ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-on-primary)] shadow-lg"
        >
          <Icon name="quiz" size={16} />
          문제 풀기
        </button>
      </div>

      {/* 에너지 0 안내 — 왜 안 움직이는지 알려준다 */}

      {showQuiz && item && (
        <QuestionOverlay
          key={item.id}
          item={item}
          energy={energy}
          energyMax={cfg.energyMax}
          chargePerCorrect={cfg.chargePerCorrect}
          wrongLockSec={cfg.wrongLockSec}
          onAnswer={handleAnswer}
          canClose={!outOfEnergy}
          onClose={() => setQuizOpen(false)}
        />
      )}
    </div>
  );
}
