"use client";

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function GlassCard({
  children,
  className,
  interactive,
  strong,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  interactive?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={cx(
        strong ? "glass-strong" : "glass",
        interactive && "glass-interactive cursor-pointer",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function GlassButton({
  children,
  className,
  variant = "ghost",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "accent" | "ghost";
}) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 px-6 text-sm font-medium tracking-[0.1px] select-none transition",
        "h-10 rounded-full",
        variant === "accent"
          ? "btn-accent"
          : "border border-[var(--md-sys-color-outline)] bg-transparent text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
