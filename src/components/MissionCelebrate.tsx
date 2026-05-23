"use client";

import { useEffect, useState } from "react";
import Lottie from "lottie-react";

/**
 * 축하 오버레이 — Lottie 모션(lottieSrc) + 문구.
 * 자동으로 닫히지 않고, 확인 버튼(또는 바깥 클릭)을 눌러야 꺼진다.
 */
export function MissionCelebrate({
  title,
  subtitle,
  kicker = "MISSION CLEAR",
  lottieSrc = "/mission-success.json",
  onDone,
}: {
  title: string;
  subtitle?: string;
  kicker?: string;
  lottieSrc?: string;
  onDone: () => void;
}) {
  const [data, setData] = useState<object | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
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

  return (
    <div
      onClick={onDone}
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/65 backdrop-blur-sm"
      role="dialog"
      aria-label={title}
    >
      {/* 큰 애니메이션 (배경 박스 없이) */}
      <div className="h-[min(56vh,520px)] w-[min(56vh,520px)] max-w-[92vw]">
        {data ? (
          <Lottie animationData={data} loop autoplay />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-white/10" />
        )}
      </div>
      {/* 문구 — 크고 두껍게, 흰색 */}
      <div className="-mt-6 flex flex-col items-center gap-2 text-center text-white">
        <p className="text-xl font-extrabold tracking-[0.25em] text-white/90">
          {kicker}
        </p>
        <p
          className="text-5xl font-black sm:text-6xl"
          style={{ textShadow: "0 2px 16px rgba(0,0,0,0.35)" }}
        >
          {title}
        </p>
        {subtitle && (
          <p className="text-2xl font-bold text-white/85">{subtitle}</p>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDone();
          }}
          className="mt-8 min-w-[220px] rounded-full bg-white px-16 py-5 text-2xl font-extrabold text-[var(--md-sys-color-primary)] shadow-xl transition hover:scale-105"
        >
          확인
        </button>
      </div>
    </div>
  );
}
