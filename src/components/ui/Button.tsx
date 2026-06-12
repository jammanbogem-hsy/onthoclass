"use client";

import { forwardRef } from "react";
import { Icon } from "@/components/Icon";

type Variant = "filled" | "tonal" | "outlined" | "text" | "danger";
type Size = "sm" | "md" | "lg";

/**
 * M3 버튼 — variant × size. state layer(hover/active 오버레이) + focus ring 포함.
 * 초등 친화: 기본 size="md"가 높이 ~44px, "lg"는 ~52px. 색은 토큰만 사용.
 */
const VARIANT_CLS: Record<Variant, string> = {
  filled:
    "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:brightness-105",
  tonal:
    "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] hover:brightness-[0.97]",
  outlined:
    "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,transparent)]",
  text: "text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]",
  danger:
    "bg-[var(--md-sys-color-error)] text-white hover:brightness-105",
};

const SIZE_CLS: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-[15px] gap-2",
  lg: "h-[52px] px-6 text-base gap-2",
};

const ICON_SIZE: Record<Size, number> = { sm: 16, md: 18, lg: 20 };

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
    icon?: string;
    iconRight?: string;
    fullWidth?: boolean;
  }
>(function Button(
  {
    variant = "filled",
    size = "md",
    icon,
    iconRight,
    fullWidth,
    className = "",
    children,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      className={`inline-flex select-none items-center justify-center rounded-full font-bold transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] ${VARIANT_CLS[variant]} ${SIZE_CLS[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={ICON_SIZE[size]} />}
      {children}
      {iconRight && <Icon name={iconRight} size={ICON_SIZE[size]} />}
    </button>
  );
});

const ICONBTN_SIZE: Record<Size, string> = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-12 w-12",
};

/** M3 아이콘 버튼 — 큰 터치 타깃(40~48px) + state layer. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: string;
    size?: Size;
    variant?: "standard" | "tonal" | "danger";
    label: string;
  }
>(function IconButton(
  { icon, size = "md", variant = "standard", label, className = "", ...rest },
  ref
) {
  const v =
    variant === "tonal"
      ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]"
      : variant === "danger"
        ? "text-[var(--md-sys-color-error)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-error)_10%,transparent)]"
        : "text-[var(--md-sys-color-on-surface-variant)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,transparent)]";
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] ${v} ${ICONBTN_SIZE[size]} ${className}`}
      {...rest}
    >
      <Icon name={icon} size={ICON_SIZE[size]} />
    </button>
  );
});
