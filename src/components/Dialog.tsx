"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "@/components/Icon";

/**
 * 전역 모달 다이얼로그 — window.prompt/confirm 대체
 * 사용:
 *   const dialog = useDialog();
 *   const v = await dialog.prompt({ title: "새 차시 제목" });
 *   if (await dialog.confirm({ title: "삭제", body: "...", danger: true })) ...
 */

type PromptOpts = {
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  okLabel?: string;
};
type ConfirmOpts = {
  title: string;
  body?: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type Pending =
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void }
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void };

type Ctx = {
  prompt: (o: PromptOpts) => Promise<string | null>;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
};

const DialogCtx = createContext<Ctx | null>(null);

export function useDialog(): Ctx {
  const v = useContext(DialogCtx);
  if (!v) throw new Error("DialogProvider 없음");
  return v;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setText(opts.defaultValue ?? "");
        setPending({ kind: "prompt", opts, resolve });
      }),
    []
  );

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        setPending({ kind: "confirm", opts, resolve });
      }),
    []
  );

  // 열릴 때 input 포커스
  useEffect(() => {
    if (pending?.kind === "prompt") {
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [pending]);

  // Esc 닫기
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  function cancel() {
    if (!pending) return;
    if (pending.kind === "prompt") pending.resolve(null);
    else pending.resolve(false);
    setPending(null);
  }
  function ok() {
    if (!pending) return;
    if (pending.kind === "prompt") pending.resolve(text);
    else pending.resolve(true);
    setPending(null);
  }

  return (
    <DialogCtx.Provider value={{ prompt, confirm }}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={cancel}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6">
              <p className="text-lg font-semibold">{pending.opts.title}</p>
              {pending.kind === "prompt" && pending.opts.description && (
                <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {pending.opts.description}
                </p>
              )}
              {pending.kind === "confirm" && pending.opts.body && (
                <p className="mt-2 text-sm leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
                  {pending.opts.body}
                </p>
              )}
            </div>
            {pending.kind === "prompt" && (
              <div className="px-6 pt-4">
                <input
                  ref={inputRef}
                  className="m3-field w-full !py-2.5 text-sm"
                  placeholder={pending.opts.placeholder}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) ok();
                  }}
                />
              </div>
            )}
            <div className="flex justify-end gap-2 px-6 py-5">
              <button
                onClick={cancel}
                className="rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2 text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
              >
                {pending.kind === "confirm"
                  ? pending.opts.cancelLabel ?? "취소"
                  : "취소"}
              </button>
              <button
                onClick={ok}
                className={`inline-flex items-center gap-1 rounded-full px-5 py-2 text-sm font-semibold text-white ${
                  pending.kind === "confirm" && pending.opts.danger
                    ? "bg-[var(--md-sys-color-error)]"
                    : "bg-[var(--md-sys-color-primary)]"
                }`}
              >
                {pending.kind === "confirm" && pending.opts.danger && (
                  <Icon name="delete" size={16} />
                )}
                {pending.kind === "confirm"
                  ? pending.opts.okLabel ?? (pending.opts.danger ? "삭제" : "확인")
                  : pending.opts.okLabel ?? "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogCtx.Provider>
  );
}
