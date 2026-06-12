"use client";

import { useEffect, useRef, useState } from "react";
import {
  setGameStatus,
  teacherForceNextCaller,
  type Game,
  type GameSubmission,
} from "@/lib/games";

/**
 * 교사 측 항상-켜진 게임 자동조종 — 콘솔(모달)을 닫아도 동작하도록 class-admin 에 상시 마운트.
 * (활성 게임이 있는 한 콘솔 열림/닫힘과 무관하게 살아 있음. UI 없음.)
 *
 * 1) 자동 종료: endWinners 충족 / 전원 완성 / 단어 소진 → status="done"
 * 2) 자동 차례 이관: 현재 차례 학생이 done(자동마크로 차례 중 완성 등)이면 활성 학생에게 차례 이관
 */
export function GameAutoPilot({
  cid,
  game,
  subs,
}: {
  cid: string;
  game: Game;
  subs: GameSubmission[];
}) {
  const playersOnBoard = subs.filter((s) => s.boardReady);
  const doneCount = playersOnBoard.filter((s) => s.status === "done").length;
  const everyoneDone =
    playersOnBoard.length > 0 &&
    playersOnBoard.every((s) => s.status === "done");
  const reachedWinners =
    game.config.endWinners > 0 && doneCount >= game.config.endWinners;
  const wordsExhausted =
    game.candidates.length > 0 &&
    game.turn.calledWords.length >= game.candidates.length;
  const shouldEnd =
    game.status === "play" &&
    (reachedWinners || everyoneDone || wordsExhausted);

  const endedRef = useRef(false);
  useEffect(() => {
    if (!shouldEnd) {
      endedRef.current = false;
      return;
    }
    if (endedRef.current) return;
    endedRef.current = true;
    setGameStatus(cid, game.id, "done").catch(() => {
      endedRef.current = false;
    });
  }, [shouldEnd, cid, game]);

  // 차례 묶임 방지 — 현재 caller 가 done 이거나(자동마크 완성) 자리를 비우면(튕김/창닫음)
  // 활성 학생에게 자동 이관. 자리비움은 heartbeat(lastActiveAt) 가 20초 이상 끊긴 것으로 판정.
  const AWAY_MS = 20000;
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (game.status !== "play") return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [game.status]);

  const callerUid = game.turn.currentUid;
  const callerSub = callerUid
    ? subs.find((s) => s.uid === callerUid)
    : undefined;
  const callerDone = !!callerSub && callerSub.status === "done";
  const callerAway =
    !!callerSub &&
    callerSub.status !== "done" &&
    now - (callerSub.lastActiveAt ?? now) > AWAY_MS;
  const activeCount = subs.filter(
    (s) => s.boardReady && s.status !== "done"
  ).length;
  const shouldAdvance =
    game.status === "play" && (callerDone || callerAway) && activeCount > 0;

  const advanceRef = useRef(false);
  useEffect(() => {
    if (!shouldAdvance) {
      advanceRef.current = false;
      return;
    }
    if (advanceRef.current) return;
    advanceRef.current = true;
    teacherForceNextCaller(cid, game.id, null, subs)
      .catch(() => {})
      .finally(() => {
        advanceRef.current = false;
      });
  }, [shouldAdvance, cid, game.id, subs]);

  return null;
}
