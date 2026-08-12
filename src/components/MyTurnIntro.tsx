"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Lottie from "lottie-react";

// 짧은 '딩동' 차임 1회 — WebAudio 합성(에셋 불필요). 자동재생 차단/미지원이면 조용히 무시.
function playTurnChime() {
  try {
    type WinAudio = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctx =
      window.AudioContext || (window as WinAudio).webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    const now = ac.currentTime;
    // 두 음(미→솔) 짧게 — 밝고 부담 없는 알림음
    [
      { f: 659.25, t: 0 },
      { f: 783.99, t: 0.16 },
    ].forEach(({ f, t }) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.22, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.28);
      osc.connect(gain).connect(ac.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.3);
    });
    setTimeout(() => ac.close().catch(() => {}), 900);
  } catch {
    /* 무음 폴백 */
  }
}

/**
 * 내 차례가 막 돌아온 순간을 알리는 풀스크린 인트로.
 *  - 이름 호명("○○야, 네 차례!") + Sparkles 모션 + 차임/진동 1회
 *  - durationMs(기본 1.8초) 후 자동 소멸. 그 자리를 기존 MyTurnOverlay(단어선택)가 이어받음.
 *  - 탭하면 즉시 닫힘. z-[96]로 잠깐 위를 덮었다 사라진다(MyTurnOverlay z-95 위).
 */
export function MyTurnIntro({
  name,
  durationMs = 1800,
  onDone,
}: {
  name: string;
  durationMs?: number;
  onDone: () => void;
}) {
  const [lottie, setLottie] = useState<object | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    let alive = true;
    fetch("/Sparkles%20Loop%20Loader%20ai.json")
      .then((r) => r.json())
      .then((d) => alive && setLottie(d))
      .catch(() => {});
    playTurnChime();
    try {
      navigator.vibrate?.([0, 90, 60, 90]);
    } catch {
      /* noop */
    }
    const t = setTimeout(() => doneRef.current(), durationMs);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [durationMs]);

  if (typeof document === "undefined") return null;
  const display = (name || "").trim();
  return createPortal(
    <div
      role="dialog"
      aria-label="내 차례"
      onClick={() => doneRef.current()}
      className="fixed inset-0 z-[96] flex flex-col items-center justify-center overflow-hidden bg-[var(--md-sys-color-primary)] px-6"
    >
      {/* 배경 가득 차는 반짝임 */}
      <div className="pointer-events-none absolute inset-0 opacity-80">
        {lottie && (
          <Lottie
            animationData={lottie}
            loop
            autoplay
            rendererSettings={{ preserveAspectRatio: "xMidYMid slice" }}
            style={{ width: "100%", height: "100%" }}
          />
        )}
      </div>
      <div className="jam-turn-pop relative flex flex-col items-center gap-3 text-center text-[var(--md-sys-color-on-primary)]">
        <p className="text-base font-extrabold tracking-[0.45em] opacity-85">
          내 차례
        </p>
        <h1 className="font-omu break-keep text-5xl font-black leading-tight sm:text-7xl">
          {display ? `${display}야,` : "내 차례!"}
        </h1>
        <p className="text-2xl font-black sm:text-3xl">네 차례예요! 🎯</p>
        <p className="mt-1 text-sm font-bold opacity-85">
          단어를 골라 빙고를 외쳐요
        </p>
      </div>
    </div>,
    document.body
  );
}
