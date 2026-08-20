"use client";

import { Icon } from "@/components/Icon";

/**
 * 학급 온도계 — 친구 칭찬이 승인될 때마다 0.1도씩 오른다(기본 0도).
 * 전체 멤버에게 학급 페이지에 표시.
 *
 * 색: 예전에는 온도를 파랑→빨강 고정 색상으로 나타냈는데, 테마를 바꿔도 여기만
 * 안 바뀌어 "고장 났다"는 학생 신고가 반복됐다. 이제 테마 색을 쓰되 온도가
 * 오를수록 진해지게 해서 변화도 그대로 보이게 한다.
 * 톤 범위(p-30 → p-10)는 밝은 표면 위 대비가 전 구간 6.8:1 이상이 되도록 잡았다.
 */
export function ClassThermometer({ degree }: { degree: number }) {
  const goal = 100; // 시각화 기준(넘으면 가득 + 실제 수치 표기)
  const pct = Math.max(0, Math.min(100, (degree / goal) * 100));

  // 온도가 높을수록 진한 톤으로. color-mix 로 두 톤 사이를 섞는다.
  const ink = `color-mix(in srgb, var(--md-sys-color-p-10) ${pct}%, var(--md-sys-color-p-30))`;
  const fill = `color-mix(in srgb, var(--md-sys-color-p-40) ${pct}%, var(--md-sys-color-p-70))`;

  return (
    <div className="my-7 flex items-center gap-4 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-5 py-4">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-p-90)]"
        style={{ color: ink }}
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
            style={{ color: ink }}
          >
            {degree.toFixed(1)}°C
          </span>
        </div>
        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container-highest)]">
          <div
            className="h-full rounded-full transition-[width,background-color] duration-500"
            style={{ width: `${pct}%`, background: fill }}
          />
        </div>
        <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          친구를 칭찬할 때마다 0.1도씩 올라가요. 온도가 오를수록 색이 진해져요.
        </p>
      </div>
    </div>
  );
}
