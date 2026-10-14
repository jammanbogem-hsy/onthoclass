"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { AVATAR_PAGES } from "@/lib/users";

/** 아바타 선택 모달 — 페이지 탭으로 이동, 고르면 팝 애니메이션 후 onSelect */
export function AvatarPicker({
  current,
  isStudent = false,
  customAvatarURL = "",
  customAvatarUsed = false,
  onClose,
  onSelect,
  onCustomUpload,
}: {
  current?: string;
  isStudent?: boolean;
  customAvatarURL?: string;
  customAvatarUsed?: boolean;
  onClose: () => void;
  onSelect: (path: string) => Promise<void> | void;
  onCustomUpload?: (file: File) => Promise<string>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [previewURL, setPreviewURL] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const previewURLRef = useRef("");
  // 현재 아바타가 들어있는 페이지를 기본 선택
  const [page, setPage] = useState(() => {
    const idx = AVATAR_PAGES.findIndex((pg) =>
      current ? pg.items.includes(current) : false
    );
    return idx >= 0 ? idx : 0;
  });

  useEffect(
    () => () => {
      if (previewURLRef.current) URL.revokeObjectURL(previewURLRef.current);
    },
    []
  );

  function updateUploadFile(file: File | null) {
    if (previewURLRef.current) URL.revokeObjectURL(previewURLRef.current);
    const url = file ? URL.createObjectURL(file) : "";
    previewURLRef.current = url;
    setPreviewURL(url);
    setUploadFile(file);
  }

  async function choose(path: string) {
    if (busy) return;
    setPicked(path);
    setBusy(true);
    try {
      await onSelect(path);
      setTimeout(onClose, 420);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "프로필 사진을 바꾸지 못했어요."
      );
      setBusy(false);
      setPicked(null);
    }
  }

  async function confirmCustomUpload() {
    if (!uploadFile || !onCustomUpload || busy) return;
    setBusy(true);
    setError("");
    try {
      const url = await onCustomUpload(uploadFile);
      setPicked(url);
      setTimeout(onClose, 420);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "이미지를 업로드하지 못했어요."
      );
      setBusy(false);
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

        {isStudent && (
          <div className="mb-3 rounded-2xl bg-[var(--md-sys-color-surface-container)] p-3">
            {customAvatarURL ? (
              <button
                type="button"
                onClick={() => choose(customAvatarURL)}
                disabled={busy}
                className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition hover:bg-black/5 ${
                  sel === customAvatarURL
                    ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]"
                    : "border-[var(--md-sys-color-outline)]"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={customAvatarURL}
                  alt="내가 올린 프로필 사진"
                  className="h-12 w-12 rounded-full object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">내가 올린 사진</span>
                  <span className="block text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    업로드 기회 사용 완료 · 언제든 다시 선택 가능
                  </span>
                </span>
                {sel === customAvatarURL && <Icon name="check" size={18} />}
              </button>
            ) : !customAvatarUsed && onCustomUpload ? (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setError("");
                    updateUploadFile(file);
                    event.currentTarget.value = "";
                  }}
                />
                {uploadFile && previewURL ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewURL}
                      alt="업로드할 프로필 사진 미리보기"
                      className="h-14 w-14 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">이 사진으로 확정할까요?</p>
                      <p className="text-xs text-[var(--md-sys-color-error)]">
                        직접 사진 업로드는 계정당 한 번만 가능해요.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={confirmCustomUpload}
                          disabled={busy}
                          className="rounded-full bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {busy ? "업로드 중…" : "이 사진으로 확정"}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateUploadFile(null)}
                          disabled={busy}
                          className="rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-bold"
                        >
                          다시 고르기
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--md-sys-color-primary)] px-3 py-2.5 text-sm font-bold text-[var(--md-sys-color-primary)] hover:bg-black/5"
                  >
                    <Icon name="add_photo_alternate" size={18} />
                    내 사진으로 만들기 (1회)
                  </button>
                )}
              </>
            ) : (
              <p className="text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
                직접 사진 업로드 기회를 이미 사용했어요.
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="mb-3 rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs font-semibold text-[var(--md-sys-color-on-error-container)]">
            {error}
          </p>
        )}

        {/* 페이지 탭 */}
        <div className="mb-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {AVATAR_PAGES.map((pg, i) => (
            <button
              key={pg.label}
              onClick={() => setPage(i)}
              className={`rounded-full px-2 py-1.5 text-xs font-bold transition sm:text-sm ${
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
