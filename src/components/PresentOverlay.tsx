"use client";

import { useEffect, useState } from "react";
import Lottie from "lottie-react";

/**
 * 발표 모드 전체화면(지속형) — 교사가 종료할 때까지 유지하며 모든 입력을 막는다.
 * - presenter: 발표 중인 학생 → 무지개 배경 + Sparkles + "발표해봅시다!"
 * - audience : 나머지 학생 → 차분한 배경 + "○○님이 발표 중이에요" (관람·집중)
 */
export function PresentOverlay({
  variant,
  name,
  cheer,
  lottieSrc = "/Sparkles%20Loop%20Loader%20ai.json",
}: {
  variant: "presenter" | "audience";
  name?: string;
  cheer?: string;
  lottieSrc?: string;
}) {
  const [data, setData] = useState<object | null>(null);

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

  const presenter = variant === "presenter";

  return (
    <div
      onClickCapture={(e) => e.stopPropagation()}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onKeyDownCapture={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="발표 모드"
      className={`fixed inset-0 z-[88] flex flex-col items-center justify-center ${
        presenter
          ? "jam-present-bg"
          : "bg-[var(--md-sys-color-surface)]/95 backdrop-blur-md"
      }`}
    >
      <div className="h-[min(46vh,420px)] w-[min(46vh,420px)] max-w-[86vw]">
        {data ? (
          <Lottie animationData={data} loop autoplay />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-white/25" />
        )}
      </div>

      {presenter ? (
        <>
          <p
            className="-mt-2 text-5xl font-black text-white sm:text-6xl"
            style={{ textShadow: "0 2px 18px rgba(0,0,0,0.28)" }}
          >
            {name ? `${name}님, 발표해봅시다!` : "발표해봅시다!"}
          </p>
          {cheer && (
            <p
              className="mt-3 text-2xl font-bold text-white/90"
              style={{ textShadow: "0 1px 10px rgba(0,0,0,0.25)" }}
            >
              {cheer}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="-mt-2 text-3xl font-extrabold text-[var(--md-sys-color-on-surface)] sm:text-4xl">
            {name ? `${name}님이 발표 중이에요 👏` : "발표 시간이에요 ✋"}
          </p>
          <p className="mt-2 text-base text-[var(--md-sys-color-on-surface-variant)] sm:text-lg">
            {name ? "발표에 집중해 주세요." : "잠시 화면을 멈추고 발표를 기다려요."}
          </p>
        </>
      )}
    </div>
  );
}
