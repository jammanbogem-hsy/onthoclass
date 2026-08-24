"use client";

/**
 * 어솔 MaterialControls 대체판.
 *
 * 원본은 @material/web 커스텀 엘리먼트(<md-filled-button> 등)를 썼다. 러닝크루는
 * 그 패키지를 쓰지 않고, 커스텀 엘리먼트는 JSX 타입 선언·SSR 처리도 따로 필요하다.
 * 호출부 API(M3Button/M3IconButton/M3Switch/M3LinearProgress)는 그대로 두고
 * 내부만 일반 요소로 바꿔, 어솔 CSS(.quizrun-root 범위)가 그대로 입혀지게 했다.
 *
 * data-variant 로 종류를 노출하므로 스킨에서 모양을 잡는다.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { MaterialIcon, type MaterialIconName } from "./MaterialIcon";

type ButtonVariant = "filled" | "tonal" | "outlined" | "text";

interface M3ButtonProps
  extends Pick<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "aria-label" | "autoFocus" | "className" | "disabled" | "onClick"
  > {
  children: ReactNode;
  icon?: MaterialIconName;
  variant?: ButtonVariant;
}

export function M3Button({
  children,
  className = "",
  disabled,
  icon,
  variant = "filled",
  ...props
}: M3ButtonProps) {
  return (
    <button
      type="button"
      data-variant={variant}
      className={`m3-btn ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <MaterialIcon name={icon} />}
      {children}
    </button>
  );
}

interface M3IconButtonProps {
  "aria-label": string;
  className?: string;
  icon: MaterialIconName;
  onClick: () => void;
  selected?: boolean;
  toggle?: boolean;
}

export function M3IconButton({
  className = "",
  icon,
  selected,
  toggle,
  ...props
}: M3IconButtonProps) {
  return (
    <button
      type="button"
      data-selected={selected ? "true" : "false"}
      aria-pressed={toggle ? Boolean(selected) : undefined}
      className={`m3-icon-btn ${className}`}
      {...props}
    >
      <MaterialIcon name={icon} />
    </button>
  );
}

interface M3SwitchProps {
  "aria-label": string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function M3Switch({ checked, onChange, ...props }: M3SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-checked={checked ? "true" : "false"}
      className="m3-switch"
      onClick={() => onChange(!checked)}
      {...props}
    >
      <span className="m3-switch__thumb" />
    </button>
  );
}

interface M3LinearProgressProps {
  "aria-label": string;
  "aria-valuetext": string;
  className?: string;
  value: number;
}

export function M3LinearProgress({
  value,
  className = "",
  ...props
}: M3LinearProgressProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={`m3-progress ${className}`}
      {...props}
    >
      <span className="m3-progress__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function M3CircularProgress({ className = "" }: { className?: string }) {
  return <span className={`m3-spinner ${className}`} aria-hidden="true" />;
}
