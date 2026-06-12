"use client";

import { Icon } from "@/components/Icon";
import type { BadgeDef } from "@/lib/badges";

/** 배지 1개 — 원형 아이콘 + 라벨. 획득(earned)이면 색, 아니면 회색. */
export function BadgeChip({
  badge,
  earned = true,
  size = 56,
  selected = false,
  onClick,
  title,
}: {
  badge: BadgeDef;
  earned?: boolean;
  size?: number;
  selected?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const ring = selected
    ? "ring-[3px] ring-offset-2 ring-[var(--md-sys-color-primary)] ring-offset-[var(--md-sys-color-surface-container-low)]"
    : "";
  const circle = earned
    ? {
        background: `linear-gradient(150deg, hsl(${badge.hue} 85% 66%), hsl(${badge.hue} 78% 46%))`,
        color: "#fff",
        boxShadow: `0 6px 16px hsl(${badge.hue} 70% 45% / 0.4), inset 0 1px 1px rgba(255,255,255,0.4)`,
      }
    : {
        background:
          "linear-gradient(150deg, var(--md-sys-color-surface-container-high), var(--md-sys-color-surface-container-highest))",
        color: "var(--md-sys-color-outline)",
      };

  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      title={title ?? badge.desc}
      className={`flex flex-col items-center gap-1.5 ${onClick ? "cursor-pointer transition hover:-translate-y-0.5" : ""}`}
    >
      <span
        className={`relative flex items-center justify-center rounded-full ${ring} ${earned ? "" : "opacity-70"}`}
        style={{ width: size, height: size, ...circle }}
      >
        {/* 광택(상단 하이라이트) */}
        <span
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: earned
              ? "radial-gradient(circle at 32% 26%, rgba(255,255,255,0.55), transparent 58%)"
              : "none",
          }}
        />
        {/* 내부 링 */}
        <span
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: Math.max(3, Math.round(size * 0.07)),
            border: earned
              ? "1.5px solid rgba(255,255,255,0.45)"
              : "1.5px solid var(--md-sys-color-outline-variant)",
          }}
        />
        <Icon
          name={earned ? badge.icon : "lock"}
          size={Math.round(size * 0.46)}
          className="relative"
        />
        {/* 선택 체크 — 우상단 코너 배지 */}
        {selected && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white shadow ring-2 ring-[var(--md-sys-color-surface-container-low)]">
            <Icon name="check" size={13} />
          </span>
        )}
      </span>
      <span
        className={`max-w-[5rem] truncate text-center text-xs font-semibold ${
          selected
            ? "text-[var(--md-sys-color-primary)]"
            : earned
              ? "text-[var(--md-sys-color-on-surface)]"
              : "text-[var(--md-sys-color-outline)]"
        }`}
      >
        {badge.label}
      </span>
    </Wrapper>
  );
}
