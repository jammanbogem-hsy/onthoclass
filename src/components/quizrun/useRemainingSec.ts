"use client";

/**
 * 퀴즈런 제한시간 카운트다운.
 *
 * 학생 화면과 교사 콘솔이 같은 값을 보여야 하므로, 기준은 각자의 시계가 아니라
 * 게임 문서의 playStartedAt(서버 시각)이다. 늦게 들어온 학생도 같은 순간에
 * 끝난다.
 *
 * 제한이 없거나(설정 없음) 아직 시작 전이면 null 을 돌려준다 — 호출부는 그때
 * 카운트다운을 감춘다.
 */

import { useEffect, useState } from "react";
import { getRemainingSec } from "@/lib/quizrun";

export function useRemainingSec(
  playStartedAt: number | null | undefined,
  durationSec: number | null | undefined,
  active: boolean
): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !playStartedAt || !durationSec) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active, playStartedAt, durationSec]);

  return getRemainingSec(playStartedAt, durationSec, now);
}
