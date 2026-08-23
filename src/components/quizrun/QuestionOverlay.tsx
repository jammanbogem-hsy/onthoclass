"use client";

/**
 * 문제 오버레이 — 3D 게임 위에 뜨는 문제 풀기 화면.
 *
 * 확정 사양:
 *   · 정답 → 에너지 충전 + 정답 화면. X 를 누르면 게임 복귀, 안 누르면 계속 풀기
 *     (에너지를 미리 쌓아두는 전략을 허용. 상한 500 이 과열을 막는다)
 *   · 오답 → 충전 없음 + wrongLockSec(3초) 잠금 후 자동으로 다음 문제
 *     재도전이 없으므로 찍어서 뚫을 수 없고, 3초가 실질 패널티가 된다
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import type { QuizItem } from "@/lib/quizrun";

type Phase = { t: "asking" } | { t: "correct" } | { t: "wrong"; left: number };

export function QuestionOverlay({
  item,
  energy,
  energyMax,
  chargePerCorrect,
  wrongLockSec,
  onAnswer,
  onClose,
}: {
  item: QuizItem | null;
  energy: number;
  energyMax: number;
  chargePerCorrect: number;
  wrongLockSec: number;
  /** 채점 결과를 상위로 — 에너지 충전·통계 반영은 상위가 담당 */
  onAnswer: (correct: boolean) => void;
  /** 게임으로 돌아가기 */
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ t: "asking" });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 문제가 바뀌면 다시 풀 수 있는 상태로
  useEffect(() => {
    setPhase({ t: "asking" });
  }, [item?.id]);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    []
  );

  const pick = useCallback(
    (i: number) => {
      if (phase.t !== "asking" || !item) return;
      const correct = i === item.answerIndex;
      onAnswer(correct);
      if (correct) {
        setPhase({ t: "correct" });
        return;
      }
      // 오답 — 3초 잠금 후 다음 문제로 (onAnswer 가 이미 다음 문제를 물려놨다)
      setPhase({ t: "wrong", left: wrongLockSec });
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => {
        setPhase((p) => {
          if (p.t !== "wrong") return p;
          if (p.left <= 1) {
            if (timer.current) clearInterval(timer.current);
            return { t: "asking" };
          }
          return { t: "wrong", left: p.left - 1 };
        });
      }, 1000);
    },
    [phase.t, item, onAnswer, wrongLockSec]
  );

  if (!item) return null;
  const pct = Math.max(0, Math.min(100, (energy / energyMax) * 100));

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--md-sys-color-scrim)]/60 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col gap-3 rounded-3xl bg-[var(--md-sys-color-surface-container-high)] p-5 shadow-[var(--md-sys-elevation-3)]">
        {/* 에너지 게이지 — 왜 문제를 푸는지 항상 보이게 */}
        <div className="flex items-center gap-2">
          <Icon
            name="bolt"
            size={18}
            className="text-[var(--md-sys-color-primary)]"
          />
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container-highest)]">
            <div
              className="h-full rounded-full bg-[var(--md-sys-color-primary)] transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-sm font-black tabular-nums">
            {Math.round(energy)}
          </span>
        </div>

        {phase.t === "correct" ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--md-sys-color-tertiary-container)]">
              <Icon
                name="check"
                size={36}
                className="text-[var(--md-sys-color-on-tertiary-container)]"
              />
            </span>
            <p className="text-xl font-black">정답!</p>
            <p className="text-sm font-bold text-[var(--md-sys-color-primary)]">
              에너지 +{chargePerCorrect}
            </p>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              계속 풀면 에너지를 더 모을 수 있어요
            </p>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-5 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)]"
              >
                <Icon name="close" size={16} />
                게임으로
              </button>
              <button
                type="button"
                onClick={() => setPhase({ t: "asking" })}
                className="rounded-full border border-[var(--md-sys-color-outline)] px-5 py-2.5 text-sm font-bold text-[var(--md-sys-color-primary)]"
              >
                계속 풀기
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-lg font-bold leading-snug">{item.prompt}</p>
            <div className="flex flex-col gap-2">
              {item.options.map((o, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={phase.t === "wrong"}
                  onClick={() => pick(i)}
                  className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-4 py-3 text-left text-sm font-semibold transition hover:border-[var(--md-sys-color-primary)] disabled:opacity-40"
                >
                  {o}
                </button>
              ))}
            </div>

            {phase.t === "wrong" ? (
              <p className="flex items-center justify-center gap-2 rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-error-container)]">
                <Icon name="timer" size={16} />
                아쉬워요 · {phase.left}초 뒤 다음 문제
              </p>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="self-center rounded-full px-4 py-1.5 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
              >
                게임으로 돌아가기
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
