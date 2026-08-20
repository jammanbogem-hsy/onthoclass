"use client";

/**
 * 텍스트 복사 버튼.
 *
 * 블록 에디터는 블록마다 별개의 입력칸이라 브라우저가 여러 블록을 걸쳐 드래그
 * 선택하지 못한다. Enter 를 줄바꿈으로 바꿔 새 응답은 한 덩어리가 되지만, 이미
 * 여러 블록으로 저장된 응답은 그대로라 손으로 긁어 복사하기가 번거롭다.
 * 이 버튼은 블록을 평문(줄바꿈 유지)으로 합쳐 한 번에 클립보드로 보낸다.
 */

import { useCallback, useRef, useState, useEffect } from "react";
import { Icon } from "@/components/Icon";

export function CopyTextButton({
  text,
  label = "복사",
  title = "내용을 클립보드로 복사",
  className = "",
}: {
  /** 복사할 평문. 비어 있으면 버튼이 비활성화된다. */
  text: string;
  label?: string;
  title?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const flash = useCallback((v: "ok" | "fail") => {
    setState(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1600);
  }, []);

  const copy = useCallback(async () => {
    const t = text.trim();
    if (!t) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(t);
      } else {
        // 구형 브라우저·비보안 컨텍스트 폴백
        const ta = document.createElement("textarea");
        ta.value = t;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      flash("ok");
    } catch {
      flash("fail");
    }
  }, [text, flash]);

  const disabled = !text.trim();
  return (
    <button
      type="button"
      onClick={copy}
      disabled={disabled}
      title={disabled ? "복사할 내용이 없습니다" : title}
      aria-live="polite"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40 ${
        state === "ok"
          ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
          : state === "fail"
            ? "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]"
            : "text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_10%,transparent)]"
      } ${className}`}
    >
      <Icon
        name={
          state === "ok" ? "check" : state === "fail" ? "error" : "content_copy"
        }
        size={14}
      />
      {state === "ok" ? "복사됨" : state === "fail" ? "실패" : label}
    </button>
  );
}
