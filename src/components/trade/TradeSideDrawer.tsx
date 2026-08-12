"use client";

// 데스크톱 전용 — "우리 반 거래 소식"·"수익률 랭킹"을 우측 가장자리에서 꺼냈다 집어넣는
// 슬라이드 사이드바. 항상 차지하는 고정 컬럼 대신, 필요할 때만 펼쳐보는 서랍 형태.
// 닫혀 있을 때도 우측 가장자리에 손잡이 탭이 항상 보인다.
import { useEffect } from "react";
import { Icon } from "@/components/Icon";

export function TradeSideDrawer({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  // Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <>
      {/* 닫혀 있을 때 항상 보이는 손잡이 탭 */}
      <button
        onClick={() => onOpenChange(true)}
        aria-label="거래 소식·랭킹 열기"
        className={`fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-2xl bg-[var(--md-sys-color-primary)] px-2.5 py-4 text-[var(--md-sys-color-on-primary)] shadow-[var(--md-sys-elevation-2)] transition-all duration-300 hover:px-3 ${
          open ? "pointer-events-none translate-x-full opacity-0" : "translate-x-0 opacity-100"
        }`}
      >
        <Icon name="chevron_left" size={18} />
        <span
          className="text-xs font-extrabold"
          style={{ writingMode: "vertical-rl" }}
        >
          거래 소식 · 랭킹
        </span>
      </button>

      {/* 배경 — 서랍이 열려 있을 때만, 클릭하면 닫힘 */}
      <div
        aria-hidden
        onClick={() => onOpenChange(false)}
        className={`fixed inset-0 z-40 bg-[rgba(0,0,0,0.2)] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* 슬라이드 패널 */}
      <aside
        role="complementary"
        aria-label="거래 소식과 랭킹"
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[380px] flex-col bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)] transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-4">
          <Icon name="leaderboard" size={20} className="text-[var(--md-sys-color-primary)]" />
          <p className="text-base font-extrabold">거래 소식 · 랭킹</p>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="닫기"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
          >
            <Icon name="chevron_right" size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">{children}</div>
      </aside>
    </>
  );
}
