"use client";

/**
 * M3 스위치 — 접근 가능한 토글(role=switch, 키보드 Space/Enter). 손코딩 div 토글 대체.
 * 트랙 52×32, 핸들 OFF 16 / ON 24, 켜짐 시 primary. label 클릭으로도 토글.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}) {
  const toggle = () => !disabled && onChange(!checked);
  const knob = (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={toggle}
      className={`relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] ${
        checked
          ? "bg-[var(--md-sys-color-primary)]"
          : "bg-[var(--md-sys-color-surface-container-highest)] ring-2 ring-inset ring-[var(--md-sys-color-outline)]"
      }`}
    >
      <span
        className={`pointer-events-none absolute rounded-full transition-all ${
          checked
            ? "right-1 h-6 w-6 bg-[var(--md-sys-color-on-primary)]"
            : "left-[7px] h-4 w-4 bg-[var(--md-sys-color-outline)]"
        }`}
      />
    </button>
  );
  if (!label) return knob;
  return (
    <label
      className={`inline-flex items-center gap-2.5 ${
        disabled ? "opacity-40" : "cursor-pointer"
      }`}
    >
      {knob}
      <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
        {label}
      </span>
    </label>
  );
}
