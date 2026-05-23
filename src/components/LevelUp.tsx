"use client";

import { useEffect, useMemo } from "react";
import { Icon } from "@/components/Icon";

const COLORS = [
  "#ff6f91",
  "#ffb86b",
  "#ffe66d",
  "#23b27a",
  "#4f7cff",
  "#a66bff",
];

/** 축하 오버레이 — 컨페티(폭죽) + 카드 팝. 약 3.6초 후 자동 닫힘(클릭으로도 닫힘). */
export function LevelUp({
  title,
  subtitle,
  kicker = "축하합니다",
  icon = "military_tech",
  className,
  onDone,
}: {
  title: string;
  subtitle?: string;
  kicker?: string;
  icon?: string;
  className?: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 3600);
    return () => clearTimeout(t);
  }, [onDone]);

  // 컨페티 조각 (마운트 시 1회 생성)
  const pieces = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        left: Math.random() * 100,
        bg: COLORS[i % COLORS.length],
        delay: Math.random() * 0.6,
        dur: 2.4 + Math.random() * 1.6,
        size: 6 + Math.random() * 8,
        rot: Math.random() * 360,
        sway: (Math.random() * 2 - 1) * 60,
        round: Math.random() > 0.5,
      })),
    []
  );

  return (
    <div
      onClick={onDone}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-label={title}
    >
      <style>{`
        @keyframes jam-confetti-fall {
          0% { transform: translate3d(0,-12vh,0) rotate(0deg); opacity: 1 }
          100% { transform: translate3d(var(--sway), 112vh, 0) rotate(720deg); opacity: 1 }
        }
        @keyframes jam-lvl-pop {
          0% { transform: scale(0.4); opacity: 0 }
          55% { transform: scale(1.08); opacity: 1 }
          70% { transform: scale(0.97) }
          100% { transform: scale(1); opacity: 1 }
        }
        @keyframes jam-lvl-ring {
          0% { transform: scale(0.6); opacity: 0.7 }
          100% { transform: scale(2.4); opacity: 0 }
        }
        @keyframes jam-badge-spin {
          0% { transform: rotate(0deg) }
          100% { transform: rotate(360deg) }
        }
      `}</style>

      {/* 컨페티 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((p, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              top: 0,
              left: `${p.left}%`,
              width: p.size,
              height: p.size * (p.round ? 1 : 1.6),
              background: p.bg,
              borderRadius: p.round ? "9999px" : "2px",
              ["--sway" as string]: `${p.sway}px`,
              transform: `rotate(${p.rot}deg)`,
              animation: `jam-confetti-fall ${p.dur}s linear ${p.delay}s forwards`,
            }}
          />
        ))}
      </div>

      {/* 카드 */}
      <div
        className={`relative flex flex-col items-center gap-3 rounded-3xl bg-white px-10 py-9 text-center shadow-2xl ${className ?? ""}`}
        style={{ animation: "jam-lvl-pop 0.6s cubic-bezier(.2,.9,.3,1.2) both" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="relative flex h-20 w-20 items-center justify-center">
          <span
            className="absolute inset-0 rounded-full"
            style={{
              border: "3px solid var(--md-sys-color-primary)",
              animation: "jam-lvl-ring 1.1s ease-out 0.2s infinite",
            }}
          />
          <span
            className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white"
            style={{ animation: "jam-badge-spin 6s linear infinite" }}
          >
            <Icon name={icon} size={42} fill />
          </span>
        </span>
        <p className="text-sm font-bold tracking-wide text-[var(--md-sys-color-primary)]">
          {kicker}
        </p>
        <p className="text-3xl font-extrabold">{title}</p>
        {subtitle && <p className="text-sm text-black/55">{subtitle}</p>}
        <button
          onClick={onDone}
          className="btn-accent mt-1 px-6 py-2.5 text-sm font-semibold"
        >
          확인
        </button>
      </div>
    </div>
  );
}
