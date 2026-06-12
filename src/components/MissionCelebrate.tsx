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
  cover = false,
  onDone,
}: {
  title: string;
  subtitle?: string;
  kicker?: string;
  lottieSrc?: string;
  cover?: boolean; // true면 모션이 배경 전체를 덮고 텍스트를 위에 얹는다
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
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden bg-black/65 backdrop-blur-sm"
      role="dialog"
      aria-label={title}
    >
      {cover ? (
        // 배경 전체를 덮는 모션(cover) + 가독성용 스크림
        <>
          <div className="absolute inset-0">
            {data && (
              <Lottie
                animationData={data}
                loop
                autoplay
                rendererSettings={{ preserveAspectRatio: "xMidYMid slice" }}
                style={{ width: "100%", height: "100%" }}
              />
            )}
          </div>
          <div className="absolute inset-0 bg-black/40" />
        </>
      ) : (
        // 큰 애니메이션 (배경 박스 없이)
        <div className="h-[min(56vh,520px)] w-[min(56vh,520px)] max-w-[92vw]">
          {data ? (
            <Lottie animationData={data} loop autoplay />
          ) : (
            <div className="h-full w-full animate-pulse rounded-full bg-white/10" />
          )}
        </div>
      )}
      {/* 문구 — 크고 두껍게, 흰색 */}
      <div
        className={`flex flex-col items-center gap-2 text-center text-white ${
          cover ? "relative z-10 px-4" : "-mt-6"
        }`}
      >
        <p
          className="text-xl font-extrabold tracking-[0.25em] text-white/90"
          style={cover ? { textShadow: "0 2px 12px rgba(0,0,0,0.6)" } : undefined}
        >
          {kicker}
        </p>
        <p
          className="text-5xl font-black sm:text-6xl"
          style={{
            textShadow: cover
              ? "0 3px 22px rgba(0,0,0,0.65)"
              : "0 2px 16px rgba(0,0,0,0.35)",
          }}
        >
          {title}
        </p>
        {subtitle && (
          <p
            className="text-2xl font-bold text-white/90"
            style={cover ? { textShadow: "0 2px 14px rgba(0,0,0,0.6)" } : undefined}
          >
            {subtitle}
          </p>
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
