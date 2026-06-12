"use client";

import { forwardRef, useId } from "react";

type Size = "md" | "lg";

/**
 * M3 아웃라인 텍스트 필드 — 라벨/supporting/error/글자수 지원. 초등 친화 큰 사이즈.
 * .m3-field 베이스 재사용(전역 정의)으로 26종 ad-hoc input 변형을 prop 으로 대체.
 */
export const TextField = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
    label?: string;
    supporting?: string;
    error?: string;
    uiSize?: Size;
    counter?: boolean;
  }
>(function TextField(
  {
    label,
    supporting,
    error,
    uiSize = "lg",
    counter,
    className = "",
    id,
    maxLength,
    value,
    ...rest
  },
  ref
) {
  const auto = useId();
  const fieldId = id || auto;
  const len = typeof value === "string" ? value.length : 0;
  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label
          htmlFor={fieldId}
          className="px-0.5 text-sm font-bold text-[var(--md-sys-color-on-surface-variant)]"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={fieldId}
        value={value}
        maxLength={maxLength}
        className={`m3-field ${uiSize === "lg" ? "m3-field-lg" : ""} ${
          error ? "!border-[var(--md-sys-color-error)]" : ""
        } ${className}`}
        {...rest}
      />
      {(supporting || error || (counter && maxLength)) && (
        <div className="flex items-center justify-between gap-2 px-0.5">
          <span
            className={`text-xs ${
              error
                ? "font-semibold text-[var(--md-sys-color-error)]"
                : "text-[var(--md-sys-color-on-surface-variant)]"
            }`}
          >
            {error || supporting || ""}
          </span>
          {counter && maxLength && (
            <span className="shrink-0 text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {len}/{maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

/** M3 멀티라인 필드 — 글자수 카운터 옵션. */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> & {
    label?: string;
    supporting?: string;
    error?: string;
    counter?: boolean;
  }
>(function Textarea(
  {
    label,
    supporting,
    error,
    counter,
    className = "",
    id,
    maxLength,
    value,
    rows = 4,
    ...rest
  },
  ref
) {
  const auto = useId();
  const fieldId = id || auto;
  const len = typeof value === "string" ? value.length : 0;
  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label
          htmlFor={fieldId}
          className="px-0.5 text-sm font-bold text-[var(--md-sys-color-on-surface-variant)]"
        >
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        value={value}
        maxLength={maxLength}
        className={`m3-field resize-none ${
          error ? "!border-[var(--md-sys-color-error)]" : ""
        } ${className}`}
        {...rest}
      />
      {(supporting || error || (counter && maxLength)) && (
        <div className="flex items-center justify-between gap-2 px-0.5">
          <span
            className={`text-xs ${
              error
                ? "font-semibold text-[var(--md-sys-color-error)]"
                : "text-[var(--md-sys-color-on-surface-variant)]"
            }`}
          >
            {error || supporting || ""}
          </span>
          {counter && maxLength && (
            <span className="shrink-0 text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {len}/{maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
