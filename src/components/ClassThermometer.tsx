"use client";

import { Icon } from "@/components/Icon";

/**
 * 학급 온도계 — 친구 칭찬이 승인될 때마다 0.1도씩 오른다(기본 0도).
 * 전체 멤버에게 학급 페이지에 표시.
 */
export function ClassThermometer({ degree }: { degree: number }) {
  const goal = 100; // 시각화 기준(넘으면 가득 + 실제 수치 표기)
  const pct = Math.max(0, Math.min(100, (degree / goal) * 100));
  // 온도에 따라 차가운 파랑 → 따뜻한 빨강
  const hue = 210 - (Math.min(degree, goal) / goal) * 210;

  return (
    <div className="my-7 flex items-center gap-4 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-5 py-4">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={{ background: `hsl(${hue} 80% 92%)`, color: `hsl(${hue} 75% 42%)` }}
      >
        <Icon name="device_thermostat" size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
            학급 온도계
          </span>
          <span
            className="text-lg font-black tabular-nums"
            style={{ color: `hsl(${hue} 75% 42%)` }}
          >
            {degree.toFixed(1)}°C
          </span>
        </div>
        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container-highest)]">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, hsl(205 80% 60%), hsl(${hue} 80% 55%))`,
            }}
          />
        </div>
        <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          친구를 칭찬할 때마다 0.1도씩 올라가요.
        </p>
      </div>
    </div>
  );
}
