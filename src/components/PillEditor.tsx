"use client";

/**
 * 내 배지 그라데이션 편집기 (학생용).
 *
 * 프리셋만으로는 원하는 색이 안 나와서, 두 색과 방향을 직접 고를 수 있게 했다.
 * 색은 색상환(hue)으로만 고른다 — 밝기까지 열어주면 흰 글자가 안 보이는 조합이
 * 나오므로, 밝기는 hueSwatch 의 hue별 보정값(흰 글자 대비 4.5:1 이상)으로 고정한다.
 */

import { useState } from "react";
import { Icon } from "@/components/Icon";
import {
  PILL_STYLES,
  formatPillGradient,
  hueSwatch,
  parsePillGradient,
  pillGradientCss,
  type PillGradient,
  type PillStyle,
} from "@/lib/colorTheme";

/** 색상환 클릭 → 각도(hue). 12시가 0도. */
function hueFromClick(e: React.MouseEvent<HTMLDivElement>): number {
  const r = e.currentTarget.getBoundingClientRect();
  const deg =
    (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) *
      180) /
      Math.PI +
    90;
  return Math.round((deg + 360) % 360);
}

function HueWheel({
  label,
  hue,
  onPick,
}: {
  label: string;
  hue: number;
  onPick: (h: number) => void;
}) {
  const rad = ((hue - 90) * Math.PI) / 180;
  const R = 40;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </span>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${label} 색 고르기, 현재 ${hue}도`}
        onClick={(e) => onPick(hueFromClick(e))}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          onPick((hue + (e.key === "ArrowRight" ? 5 : -5) + 360) % 360);
        }}
        className="relative h-24 w-24 cursor-crosshair rounded-full shadow-inner"
        style={{
          background:
            "conic-gradient(from 0deg, hsl(0 70% 55%), hsl(60 70% 55%), hsl(120 70% 55%), hsl(180 70% 55%), hsl(240 70% 55%), hsl(300 70% 55%), hsl(360 70% 55%))",
        }}
      >
        <div className="absolute inset-4 flex items-center justify-center rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[11px] font-bold tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
          {hue}°
        </div>
        <span
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{
            left: 48 + R * Math.cos(rad),
            top: 48 + R * Math.sin(rad),
            background: hueSwatch(hue),
          }}
        />
      </div>
    </div>
  );
}

export function PillEditor({
  value,
  onSave,
  onClose,
}: {
  /** 편집을 시작할 값. 없으면 기본 조합에서 출발한다. */
  value: string | null;
  onSave: (v: string) => void;
  onClose: () => void;
}) {
  const [g, setG] = useState<PillGradient>(
    () => parsePillGradient(value) ?? { from: 200, to: 320, style: "h" }
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--md-sys-color-scrim)]/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="내 배지 색 만들기"
        className="w-full max-w-sm animate-float-in rounded-3xl bg-[var(--md-sys-color-surface-container-high)] p-5 shadow-[var(--md-sys-elevation-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-base font-bold">
            <Icon
              name="gradient"
              size={18}
              className="text-[var(--md-sys-color-primary)]"
            />
            내 배지 만들기
          </h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* 미리보기 — 실제 배지와 같은 모양으로 */}
        <div
          className="mb-4 flex h-12 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: pillGradientCss(g) }}
        >
          <Icon name="military_tech" size={16} fill />
          <span className="ml-1.5">마이페이지</span>
        </div>

        <div className="mb-4 flex justify-center gap-4">
          <HueWheel
            label="시작 색"
            hue={g.from}
            onPick={(from) => setG((p) => ({ ...p, from }))}
          />
          <HueWheel
            label="끝 색"
            hue={g.to}
            onPick={(to) => setG((p) => ({ ...p, to }))}
          />
        </div>

        <p className="mb-1.5 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
          모양
        </p>
        <div className="mb-4 grid grid-cols-4 gap-1.5">
          {PILL_STYLES.map((st) => (
            <button
              key={st.key}
              onClick={() => setG((p) => ({ ...p, style: st.key as PillStyle }))}
              aria-pressed={g.style === st.key}
              className={`rounded-xl py-2 text-xs font-bold transition ${
                g.style === st.key
                  ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                  : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)]"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onSave(formatPillGradient(g))}
            className="flex-1 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)]"
          >
            이 색으로 하기
          </button>
          <button
            onClick={onClose}
            className="rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-surface-variant)]"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
