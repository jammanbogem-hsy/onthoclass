"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { AVATAR_PAGES } from "@/lib/users";

/** 아바타 선택 모달 — 1·2페이지 탭으로 이동, 고르면 팝 애니메이션 후 onSelect */
export function AvatarPicker({
  current,
  onClose,
  onSelect,
}: {
  current?: string;
  onClose: () => void;
  onSelect: (path: string) => Promise<void> | void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 현재 아바타가 들어있는 페이지를 기본 선택
  const [page, setPage] = useState(() => {
    const idx = AVATAR_PAGES.findIndex((pg) =>
      current ? pg.items.includes(current) : false
    );
    return idx >= 0 ? idx : 0;
  });

  async function choose(path: string) {
    if (busy) return;
    setPicked(path);
    setBusy(true);
    try {
      await onSelect(path);
      setTimeout(onClose, 420);
    } catch {
      setBusy(false);
      setPicked(null);
    }
  }

  const sel = picked ?? current ?? "";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <style>{`
        @keyframes jam-avatar-pop {
          0% { transform: scale(1) }
          40% { transform: scale(1.18) }
          70% { transform: scale(0.94) }
          100% { transform: scale(1) }
        }
        .jam-avatar-cell{ transition: transform .18s ease, box-shadow .18s ease; }
        .jam-avatar-cell:hover{ transform: scale(1.08); }
      `}</style>
      <div
        className="flex max-h-[82vh] w-full max-w-lg flex-col rounded-3xl bg-[var(--md-sys-color-surface-container-high)] p-6 shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Icon
              name="face"
              size={20}
              className="text-[var(--md-sys-color-primary)]"
            />
            프로필 사진 선택
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* 페이지 탭 */}
        <div className="mb-3 flex justify-center gap-2">
          {AVATAR_PAGES.map((pg, i) => (
            <button
              key={pg.label}
              onClick={() => setPage(i)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                page === i
                  ? "bg-[var(--md-sys-color-primary)] text-white"
                  : "border border-[var(--md-sys-color-outline)] text-black/55 hover:bg-black/5"
              }`}
            >
              {pg.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-4 overflow-y-auto px-2 py-2 sm:grid-cols-5">
          {AVATAR_PAGES[page].items.map((src) => {
            const active = sel === src;
            return (
              <button
                key={src}
                onClick={() => choose(src)}
                disabled={busy}
                className={`jam-avatar-cell relative aspect-square overflow-hidden rounded-2xl border-2 ${
                  active
                    ? "border-[var(--md-sys-color-primary)] ring-2 ring-[var(--md-sys-color-primary)]"
                    : "border-transparent"
                }`}
                style={
                  picked === src
                    ? { animation: "jam-avatar-pop .42s ease both" }
                    : undefined
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {active && (
                  <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white shadow">
                    <Icon name="check" size={13} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 선택 안함 → 기본 구글 프로필 */}
        <button
          onClick={() => choose("")}
          disabled={busy}
          className={`mt-4 flex items-center justify-center gap-1.5 rounded-full border py-2.5 text-sm font-semibold transition ${
            sel === ""
              ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
              : "border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
          }`}
        >
          <Icon name="hide_image" size={16} />
          선택 안함 (기본 구글 프로필)
        </button>
      </div>
    </div>
  );
}
