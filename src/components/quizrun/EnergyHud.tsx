"use client";

/**
 * 러닝 에너지 게이지 — 어솔 HUD 옆에 붙는 퀴즈런 전용 조각.
 *
 * 어솔 원본에는 없는 요소라 새로 만들되, 마크업·클래스 규칙을 원본 HUD
 * (game-size-status 등)와 같은 방식으로 맞췄다. 스타일은 quizrun-skin.css 에
 * .quizrun-energy* 로 함께 들어간다 — 게임 안에서 이질감이 없도록.
 */

import type { CSSProperties } from "react";

export function EnergyHud({
  energy,
  energyMax,
  drainPerSec,
  onOpenQuiz,
}: {
  energy: number;
  energyMax: number;
  drainPerSec: number;
  onOpenQuiz: () => void;
}) {
  const pct = Math.max(0, Math.min(100, (energy / energyMax) * 100));
  const empty = energy <= 0;
  const seconds = drainPerSec > 0 ? Math.floor(energy / drainPerSec) : 0;

  return (
    <section
      className="quizrun-energy"
      data-empty={empty ? "true" : "false"}
      style={{ "--energy-pct": `${pct}%` } as CSSProperties}
      aria-label={`러닝 에너지 ${Math.round(energy)}, 약 ${seconds}초 이동 가능`}
    >
      <span className="quizrun-energy__label" aria-hidden="true">
        <small>에너지</small>
        <strong>{Math.round(energy)}</strong>
      </span>
      <div className="quizrun-energy__bar" aria-hidden="true">
        <div className="quizrun-energy__fill" />
      </div>
      <button
        type="button"
        className="quizrun-energy__button"
        onClick={onOpenQuiz}
      >
        {empty ? "문제 풀고 충전!" : "문제 풀기"}
      </button>
    </section>
  );
}
