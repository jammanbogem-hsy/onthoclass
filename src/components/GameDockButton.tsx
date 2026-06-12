"use client";

import { Icon } from "@/components/Icon";
import { type Game, type GameSubmission } from "@/lib/games";

/**
 * 활성 게임이 진행 중이지만 콘솔이 접혀 있을 때 우하단에 떠 있는 복원 버튼.
 * 클릭하면 부모가 콘솔을 다시 연다. macOS Dock 아이콘처럼 살짝 펄스/바운스.
 * subs 는 부모에서 한 번만 구독해 prop 으로 전달 — 중복 리스너 제거.
 */
export function GameDockButton({
  game,
  subs,
  onOpen,
}: {
  game: Game;
  subs: GameSubmission[];
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      title="콘솔 다시 열기"
      className="group fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-[var(--md-sys-color-primary)] py-3 pl-3 pr-5 text-[var(--md-sys-color-on-primary)] shadow-[var(--md-sys-elevation-3)] transition hover:scale-105 active:scale-100 animate-float-in"
    >
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
        <Icon name="grid_view" size={20} />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--md-sys-color-tertiary)] ring-2 ring-[var(--md-sys-color-primary)]" />
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[10px] font-extrabold tracking-[0.2em] opacity-80">
          {game.link.name.slice(0, 14)}
        </span>
        <span className="text-sm font-bold">
          콘솔 열기 · {subs.length}명
        </span>
      </span>
    </button>
  );
}
