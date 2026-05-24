"use client";

import { useEffect, useState } from "react";
import Lottie from "lottie-react";

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * 학생용 활동 잠금 전체화면 — Sandy Loading 모션 + 남은 시간.
 * 모든 입력을 가로막고, until 시각이 지나면 onExpire 를 호출한다.
 */
export function ActivityLockOverlay({
  until,
  lottieSrc = "/Sandy%20Loading.json",
  onExpire,
}: {
  until: number | null;
  lottieSrc?: string;
  onExpire?: () => void;
}) {
  const [data, setData] = useState<object | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    fetch(lottieSrc)
      .then((r) => r.json())
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lottieSrc]);

  // 남은 시간 카운트다운 (until 이 있을 때만)
  useEffect(() => {
    if (until == null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [until]);

  // 시간 만료 → onExpire (자동 해제)
  useEffect(() => {
    if (until != null && now >= until) onExpire?.();
  }, [until, now, onExpire]);

  const remaining = until != null ? until - now : null;

  return (
    <div
      // 모든 포인터/키 입력 차단 (캡처 단계에서 막음)
      onClickCapture={(e) => e.stopPropagation()}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onKeyDownCapture={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="활동 잠금"
      className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-[var(--md-sys-color-surface)]/92 backdrop-blur-md"
    >
      <div className="h-[min(64vh,640px)] w-[min(64vh,640px)] max-w-[90vw]">
        {data ? (
          <Lottie animationData={data} loop autoplay />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-[var(--md-sys-color-surface-container-high)]" />
        )}
      </div>
      <p className="-mt-4 text-4xl font-extrabold text-[var(--md-sys-color-on-surface)] sm:text-5xl">
        잠깐 멈춰요 ✋
      </p>
      <p className="mt-2 text-base text-[var(--md-sys-color-on-surface-variant)] sm:text-lg">
        선생님이 활동을 잠시 멈췄어요. 화면을 봐 주세요.
      </p>
      {remaining != null && (
        <p
          className="mt-6 font-mono text-7xl font-black tabular-nums text-[var(--md-sys-color-primary)] sm:text-8xl"
          style={{ fontFeatureSettings: '"tnum"' }}
        >
          {fmt(remaining)}
        </p>
      )}
    </div>
  );
}
