"use client";

// 링크 푸시 모달 — 교사가 클래스앱에서 링크를 띄우면 학생 화면에 뜬다.
// 학생은 '열기'로 새 탭에서 보거나 닫을 수 있고, 교사가 새로 띄우면(nonce 변경) 다시 표시된다.
import { LottieIcon } from "@/components/LottieIcon";

export function LinkPushModal({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    host = url;
  }
  return (
    <div
      className="fixed inset-0 z-[88] flex items-center justify-center bg-black/55 px-6"
      role="dialog"
      aria-label="선생님이 보낸 링크"
    >
      <div className="w-full max-w-sm rounded-3xl bg-[var(--md-sys-color-surface)] p-6 text-center shadow-2xl">
        <LottieIcon src="/Loading%2040%20_%20Paperplane.json" size={104} className="mx-auto" />
        <p className="mt-1 text-xs font-bold text-[var(--md-sys-color-primary)]">
          선생님이 링크를 보냈어요
        </p>
        <h2 className="mt-1 text-lg font-black text-[var(--md-sys-color-on-surface)]">
          {title?.trim() || "링크 열어 보기"}
        </h2>
        <p className="mt-1 break-all text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {host}
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 block rounded-full bg-[var(--md-sys-color-primary)] px-6 py-3 text-base font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105"
        >
          열기 →
        </a>
        <button
          onClick={onClose}
          className="mt-2 w-full rounded-full px-6 py-2.5 text-sm font-medium text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
