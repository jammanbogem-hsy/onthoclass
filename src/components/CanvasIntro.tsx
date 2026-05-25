"use client";

import { useEffect, useState } from "react";
import Lottie from "lottie-react";

/**
 * 캔버스 진입 인트로 — Paint Brush 모션 + 환영 문구.
 * 일정 시간 뒤 자동으로 사라진다(클릭하면 즉시 닫힘).
 */
export function CanvasIntro({
  name,
  lottieSrc = "/Paint%20Brush.json",
  title = "멋진 캔버스를 꾸며봅시다!",
  duration = 2400,
  onDone,
}: {
  name?: string;
  lottieSrc?: string;
  title?: string;
  duration?: number;
  onDone: () => void;
}) {
  const [data, setData] = useState<object | null>(null);
  const [closing, setClosing] = useState(false);

  // 애니메이션 데이터 로드
  useEffect(() => {
    let alive = true;
    fetch(lottieSrc)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lottieSrc]);

  // 자동 닫힘 (페이드아웃 후 onDone)
  useEffect(() => {
    const t1 = setTimeout(() => setClosing(true), duration);
    const t2 = setTimeout(onDone, duration + 320);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [duration, onDone]);

  return (
    <div
      onClick={() => {
        setClosing(true);
        setTimeout(onDone, 320);
      }}
      role="dialog"
      aria-label={title}
      className={`fixed inset-0 z-[80] flex flex-col items-center justify-center bg-[var(--md-sys-color-surface)]/80 backdrop-blur-sm transition-opacity duration-300 ${
        closing ? "opacity-0" : "animate-float-in opacity-100"
      }`}
    >
      {name && (
        <p className="text-3xl font-extrabold text-[var(--md-sys-color-primary)] sm:text-4xl">
          {name}님,
        </p>
      )}
      <div className="-mt-1 h-[min(40vh,300px)] w-[min(40vh,300px)] max-w-[80vw]">
        {data ? (
          <Lottie animationData={data} loop autoplay />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-[var(--md-sys-color-surface-container-high)]" />
        )}
      </div>
      <p
        className="-mt-2 text-2xl font-extrabold text-[var(--md-sys-color-on-surface)] sm:text-3xl"
        style={{ letterSpacing: "0.02em" }}
      >
        {title}
      </p>
    </div>
  );
}
