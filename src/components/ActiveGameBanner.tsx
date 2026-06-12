"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import {
  endGame,
  type Game,
  type GameSubmission,
} from "@/lib/games";

/**
 * 활성 학급 게임 안내 배너 (교사용).
 * - 게임이 진행 중임을 학급 관리 상단에서 항상 보이게 표시
 * - "콘솔 열기"로 모니터링 콘솔 진입
 * - "게임 종료"는 한 번 더 확인 단계를 거쳐 실수 방지
 *
 * subs 는 부모(class-admin)에서 한 번만 구독해 prop 으로 전달 — 중복 리스너 제거.
 */
export function ActiveGameBanner({
  cid,
  game,
  subs,
  onOpenConsole,
}: {
  cid: string;
  game: Game;
  subs: GameSubmission[];
  onOpenConsole: () => void;
}) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doEnd() {
    setBusy(true);
    try {
      await endGame(cid, game.id);
    } finally {
      setBusy(false);
      setConfirmEnd(false);
    }
  }

  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--md-sys-color-tertiary)] bg-[var(--md-sys-color-tertiary-container)] px-4 py-2.5 text-[var(--md-sys-color-on-tertiary-container)] animate-float-in"
      role="status"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-tertiary)] text-white">
        <Icon name="grid_view" size={18} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm font-bold">
          학급 게임 진행 중 · 개념 빙고
          <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--md-sys-color-tertiary)] align-middle" />
        </p>
        <p className="truncate text-xs">
          {game.link.name} · 참여 <b>{subs.length}</b>명 ·{" "}
          {game.config.boardSize}×{game.config.boardSize} 보드 · 단어{" "}
          {game.config.wordsPerStudent}개 · 빙고 {game.config.bingoTarget}줄
        </p>
      </div>
      <button
        onClick={onOpenConsole}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[var(--md-sys-color-on-tertiary-container)] shadow-sm transition hover:brightness-105"
      >
        <Icon name="dashboard" size={14} />
        콘솔 열기
      </button>
      {confirmEnd ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-xs font-semibold">정말 종료할까요?</span>
          <button
            onClick={() => setConfirmEnd(false)}
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--md-sys-color-on-tertiary-container)] hover:bg-black/5"
          >
            취소
          </button>
          <button
            onClick={doEnd}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-error)] px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
          >
            <Icon name="stop_circle" size={13} />
            종료
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmEnd(true)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--md-sys-color-error)] bg-white/40 px-3 py-1.5 text-xs font-semibold text-[var(--md-sys-color-error)] hover:bg-white/70"
          title="실수로 시작한 게임 즉시 끄기"
        >
          <Icon name="stop_circle" size={14} />
          게임 종료
        </button>
      )}
    </div>
  );
}
