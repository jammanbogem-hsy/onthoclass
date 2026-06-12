"use client";

import { Icon } from "@/components/Icon";
import type { Game, GameSubmission } from "@/lib/games";

/**
 * 학생이 게임 화면을 닫았을 때 우하단에 떠 있는 작은 도크 버튼.
 * 다시 누르면 게임으로 돌아간다. 단계가 바뀌면 자동으로 다시 풀스크린이 뜨므로
 * 이 도크는 "내가 명시적으로 닫은 단계 동안"만 보인다.
 *
 * - 단계 라벨로 지금 무엇을 할 차례인지 알려주고,
 * - 작은 dot 펄스로 진행 중임을 강조한다.
 */
export function GameStudentDock({
  game,
  mySub,
  onOpen,
}: {
  game: Game;
  mySub: GameSubmission | null;
  onOpen: () => void;
}) {
  const stage = stageHint(game, mySub);
  return (
    <button
      onClick={onOpen}
      className="fixed bottom-5 right-5 z-[91] inline-flex items-center gap-3 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-white px-4 py-3 text-left shadow-2xl transition hover:scale-105 hover:shadow-xl animate-float-in"
      title="학급 게임으로 돌아가기"
    >
      <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white">
        <Icon name="grid_view" size={22} />
        <span className="absolute right-0 top-0 h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--md-sys-color-tertiary)] ring-2 ring-white" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[10px] font-bold tracking-[0.2em] text-[var(--md-sys-color-on-surface-variant)]">
          학급 게임 · 개념 빙고
        </span>
        <span className="text-sm font-extrabold text-[var(--md-sys-color-on-surface)]">
          {stage}
        </span>
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]">
        <Icon name="arrow_forward" size={18} />
      </span>
    </button>
  );
}

function stageHint(game: Game, mySub: GameSubmission | null): string {
  if (!mySub) return "참여하기";
  switch (game.status) {
    case "draft":
      return "곧 시작해요";
    case "submit": {
      const submitted =
        mySub.status === "submitted" ||
        mySub.status === "ready" ||
        mySub.status === "playing" ||
        mySub.status === "done";
      return submitted ? "제출 완료 · 대기" : "단어 제출 차례";
    }
    case "select": {
      const need = Math.min(game.config.boardSize, game.candidates.length);
      const done = mySub.picked.length >= need;
      return done ? "선정 완료 · 대기" : "핵심 단어 선정";
    }
    case "build": {
      const done = mySub.boardReady || mySub.status === "ready";
      return done ? "빙고판 완료 · 대기" : "빙고판 만들기";
    }
    case "play":
      if (mySub.status === "done") return "완료 · 결과";
      // 자동 마크라 보고만 있어도 됨 — 내 차례일 때만 강조
      return game.turn.currentUid === mySub.uid
        ? "내 차례 · 단어 고르기"
        : "플레이 중 · 자동 진행";
    case "done":
      return "최종 결과 보기";
    default:
      return "돌아가기";
  }
}
