"use client";

/**
 * 퀴즈런 인트로 — 교사가 시작을 누르면 학생 전원에게 한 번 재생된다.
 *
 * 끝나는 시각은 영상 재생 여부와 무관하게 게임 문서의 playStartedAt +
 * QUIZRUN_INTRO_SEC 로 고정돼 있다. 그래서
 *   · 건너뛴 학생은 대기 화면에서 남은 초를 보며 기다리고,
 *   · 늦게 들어온 학생은 영상 중간부터 이어 본다.
 * 결과적으로 모두 같은 순간에 게임을 시작한다 — 건너뛰기가 플레이 시간
 * 이득이 되지 않는다.
 *
 * 소리: 브라우저는 사용자 조작 없는 자동재생에서 소리를 막는다. 소리를 켠
 * 채로 먼저 시도하고, 거부되면 음소거로 재생하며 "소리 켜기" 버튼을 띄운다.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  QUIZRUN_INTRO_SEC,
  QUIZRUN_INTRO_VIDEO,
  getIntroRemainingSec,
} from "@/lib/quizrun";

export function QuizRunIntro({
  playStartedAt,
  onDone,
}: {
  /** 교사가 시작을 누른 서버 시각 */
  playStartedAt: number;
  /** 인트로 구간이 끝났을 때 (모든 학생에게 같은 순간) */
  onDone: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [muted, setMuted] = useState(false);
  const [remaining, setRemaining] = useState(() =>
    getIntroRemainingSec(playStartedAt) ?? 0
  );

  // 남은 시간은 각자의 시계가 아니라 playStartedAt 을 기준으로 매초 다시 센다.
  useEffect(() => {
    const tick = () => {
      const left = getIntroRemainingSec(playStartedAt) ?? 0;
      setRemaining(left);
      if (left <= 0) onDone();
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [playStartedAt, onDone]);

  // 인트로가 도는 20초 동안 3D 게임 모듈을 미리 받아 둔다 — 영상이 끝나자마자
  // 바로 들어가도록.
  useEffect(() => {
    void import("@/components/quizrun/EarsoulGamePage").catch(() => {});
  }, []);

  // 늦게 들어온 학생은 영상 중간부터 — 모두 같은 지점을 본다.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || skipped) return;
    const elapsed = QUIZRUN_INTRO_SEC - (getIntroRemainingSec(playStartedAt) ?? 0);
    if (elapsed > 0.5) video.currentTime = elapsed;

    video.muted = false;
    video.play().catch(() => {
      // 소리 있는 자동재생이 막혔다 — 음소거로 틀고 켜는 버튼을 준다
      video.muted = true;
      setMuted(true);
      video.play().catch(() => {});
    });
  }, [playStartedAt, skipped]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black">
      {skipped ? (
        <div className="flex flex-col items-center gap-4 text-white">
          <span className="text-5xl font-black tabular-nums">{remaining}</span>
          <p className="text-sm font-bold text-white/80">
            친구들과 같이 시작해요
          </p>
        </div>
      ) : (
        <video
          ref={videoRef}
          src={QUIZRUN_INTRO_VIDEO}
          className="h-full w-full object-contain"
          playsInline
          autoPlay
          preload="auto"
        />
      )}

      <div className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-2 px-4">
        {muted && !skipped && (
          <button
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              video.muted = false;
              setMuted(false);
              void video.play().catch(() => {});
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-black"
          >
            <Icon name="volume_up" size={16} />
            소리 켜기
          </button>
        )}
        {!skipped && (
          <button
            onClick={() => setSkipped(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/25 px-4 py-2 text-sm font-bold text-white backdrop-blur transition hover:bg-white/35"
          >
            건너뛰기
            <span className="tabular-nums opacity-80">{remaining}</span>
            <Icon name="skip_next" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
