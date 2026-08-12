"use client";

// 집중 잠금 오버레이 — 교사가 클래스앱에서 '집중 모드'를 켜면 학생 화면 전체를 덮는다.
// 타이머 없이 교사가 끌 때까지 유지된다(학생은 닫을 수 없음).
// 다른 모달들과 같은 카드형 디자인 + public 애니메이션(Lottie) 사용.
import { useEffect, useState } from "react";
import { LottieIcon } from "@/components/LottieIcon";

export function FocusLockOverlay({ message }: { message?: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 10);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 px-6 backdrop-blur-sm"
      style={{ opacity: shown ? 1 : 0, transition: "opacity .35s ease" }}
      role="dialog"
      aria-label="집중 시간"
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-[var(--md-sys-color-surface)] px-6 py-8 text-center shadow-2xl"
        style={{ transform: shown ? "scale(1)" : "scale(.94)", transition: "transform .35s cubic-bezier(.2,.8,.2,1)" }}
      >
        <LottieIcon src="/Cute%20Mascot%20Jumping%20Character.json" size={148} className="mx-auto" />
        <p className="mt-1 text-xs font-bold text-[var(--md-sys-color-primary)]">
          집중 시간이에요
        </p>
        <h1 className="mt-1 text-3xl font-black text-[var(--md-sys-color-on-surface)]">집중! 👀</h1>
        <p className="mt-3 text-base font-semibold leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
          {message?.trim() || "선생님을 봐 주세요. 잠시 화면을 멈출게요."}
        </p>
        <p className="mt-6 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] opacity-70">
          선생님이 풀어 주면 다시 활동할 수 있어요.
        </p>
      </div>
    </div>
  );
}
