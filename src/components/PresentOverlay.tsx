"use client";

import { useEffect, useState } from "react";
import Lottie from "lottie-react";

/**
 * 발표 독려 효과 — 무지개 배경 + Sparkles 모션 + "발표해봅시다!" 문구.
 * 잠깐 보여주고 자동으로 사라진다(클릭하면 즉시 닫힘).
 */
export function PresentOverlay({
  title = "발표해봅시다!",
  subtitle,
  lottieSrc = "/Sparkles%20Loop%20Loader%20ai.json",
  duration = 5200,
  onDone,
}: {
  title?: string;
  subtitle?: string;
  lottieSrc?: string;
  duration?: number;
  onDone: () => void;
}) {
  const [data, setData] = useState<object | null>(null);
  const [closing, setClosing] = useState(false);

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

  useEffect(() => {
    const t1 = setTimeout(() => setClosing(true), duration);
    const t2 = setTimeout(onDone, duration + 360);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [duration, onDone]);

  return (
    <div
      onClick={() => {
        setClosing(true);
        setTimeout(onDone, 360);
      }}
      role="dialog"
      aria-label={title}
      className={`jam-present-bg fixed inset-0 z-[85] flex flex-col items-center justify-center transition-opacity duration-300 ${
        closing ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="h-[min(50vh,460px)] w-[min(50vh,460px)] max-w-[88vw]">
        {data ? (
          <Lottie animationData={data} loop autoplay />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-white/25" />
        )}
      </div>
      <p
        className="-mt-2 text-5xl font-black text-white sm:text-6xl"
        style={{ textShadow: "0 2px 18px rgba(0,0,0,0.28)" }}
      >
        {title}
      </p>
      {subtitle && (
        <p
          className="mt-3 text-2xl font-bold text-white/90"
          style={{ textShadow: "0 1px 10px rgba(0,0,0,0.25)" }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
