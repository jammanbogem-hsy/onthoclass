"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { answerQuiz, cloneState, createState, incomingGarbage, input, quizDue, receive, revive, tick, type Action, type PuyoState } from "@/lib/puyo-engine";
import { planMove, playMove, type BotMove } from "@/lib/puyo-bot";
import { pickQuestion, type PuyoQuiz } from "@/lib/puyo-quiz";
import type { PuyoRules } from "@/lib/puyo-rules";
import { BattleStage, useSound } from "./PuyoBattle";
import type { QuizFeedback } from "./PuyoQuizPrompt";

const READY_MS = 4000;
const BOT_NAMES = ["젤리 로봇", "말랑 로봇", "통통 로봇"];

type Bot = { state: PuyoState; plan: BotMove | null; at: number; think: number; quizAt: number };

/**
 * 선생님 테스트 플레이 — 지금 고른 규칙(시간·1:1/4인·문제 풀기)으로 컴퓨터 친구와 실제 경기 화면을 해 본다.
 * 내 기기 안에서만 돌아가고 아무것도 저장하지 않는다(학생 화면·기록·경험치와 무관).
 */
/** 한 판의 시드·시작/끝 시각 — 버튼을 누르는 순간(이벤트 처리기)에 만든다. */
export type TestRound = { seed: number; startsAt: number; endsAt: number };
export function newTestRound(durationSec: number): TestRound {
  const startsAt = Date.now() + READY_MS;
  return { seed: Math.floor(Math.random() * 2147483646) + 1, startsAt, endsAt: startsAt + durationSec * 1000 };
}

export function PuyoTestPlay({ rules, quiz, round, onAgain, onClose }: { rules: PuyoRules; quiz: PuyoQuiz | null; round: TestRound; onAgain: () => void; onClose: () => void }) {
  return <TestMatch key={round.seed} rules={rules} quiz={quiz} round={round} onClose={onClose} onAgain={onAgain} />;
}

function TestMatch({ rules, quiz, round, onClose, onAgain }: { rules: PuyoRules; quiz: PuyoQuiz | null; round: TestRound; onClose: () => void; onAgain: () => void }) {
  const { seed } = round;
  const botCount = rules.size === 4 ? 3 : 1;
  const times = useMemo(() => ({ startsAt: round.startsAt, endsAt: round.endsAt }), [round.startsAt, round.endsAt]);
  const me = useRef<PuyoState>(createState(seed));
  const bots = useRef<Bot[]>(Array.from({ length: botCount }, () => ({ state: createState(seed), plan: null, at: 0, think: 0, quizAt: 0 })));
  const [view, setView] = useState<PuyoState>(() => createState(seed));
  const [botViews, setBotViews] = useState<PuyoState[]>(() => Array.from({ length: botCount }, () => createState(seed)));
  const [now, setNow] = useState(round.startsAt - READY_MS);
  const [feedback, setFeedback] = useState<QuizFeedback | null>(null);
  const sound = useSound(); const soundRef = useRef(sound);
  useEffect(() => { soundRef.current = sound; }, [sound]);

  useEffect(() => {
    let frame = 0; let prev = performance.now(); let draw = prev; let lastEvent = -1;
    const loop = (at: number) => {
      const t = Date.now(); const dt = Math.min(100, at - prev); prev = at;
      const live = t >= times.startsAt && t < times.endsAt;
      if (live) {
        const s = me.current;
        if (!(quiz && quizDue(s, quiz.every))) { tick(s, dt); if (s.phase === "over") revive(s); }
        for (const b of bots.current) {
          const bs = b.state;
          if (quiz && quizDue(bs, quiz.every)) {
            // 컴퓨터 친구도 문제를 푼다 — 2~4초 생각하고 대부분 맞힌다
            if (!b.quizAt) b.quizAt = t + 2000 + Math.random() * 2000;
            else if (t >= b.quizAt) { answerQuiz(bs, Math.random() < 0.75, quiz.bonus, quiz.penalty); b.quizAt = 0; }
            continue;
          }
          if (bs.phase === "fall" && bs.active) {
            if (!b.plan) { b.plan = planMove(bs, 0.7); b.at = t; b.think = 650 + Math.random() * 900; }
            else if (t - b.at >= b.think) { playMove(bs, b.plan); b.plan = null; }
          }
          tick(bs, dt); if (bs.phase === "over") revive(bs);
        }
        // 공격은 모두에게 똑같이: 각자 받을 방해 = 나머지 모두가 보낸 공격의 합
        const all = [s, ...bots.current.map(b => b.state)];
        const total = all.reduce((n, p) => n + p.sent, 0);
        for (const p of all) receive(p, incomingGarbage(total - p.sent, all.length - 1));
      }
      if (at - draw > 32) {
        draw = at; setNow(t); setView(cloneState(me.current)); setBotViews(bots.current.map(b => cloneState(b.state)));
        const s = me.current;
        if (s.event !== lastEvent) { lastEvent = s.event; if (["clear", "attack", "allclear", "garbage"].includes(s.effect)) soundRef.current.play(s.chain, s.effect === "garbage"); }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [quiz, times]);

  const action = useCallback((a: Action) => {
    const t = Date.now(); const s = me.current;
    if (quiz && quizDue(s, quiz.every)) return;
    if (t >= times.startsAt && t < times.endsAt) { input(s, a); setView(cloneState(s)); }
  }, [quiz, times]);

  const answer = useCallback((i: number) => {
    const s = me.current; if (!quiz || !quizDue(s, quiz.every)) return;
    const item = pickQuestion(quiz.items, `test:${seed}`, s.asked ?? 0); if (!item) return;
    const ok = i === item.answerIndex;
    answerQuiz(s, ok, quiz.bonus, quiz.penalty, { item: quiz.items.indexOf(item), pick: i }); setView(cloneState(s));
    setFeedback({ key: Date.now(), ok, bonus: quiz.bonus, penalty: quiz.penalty, answer: `${item.answerIndex + 1}번 ${item.options[item.answerIndex]}` });
    if (ok) soundRef.current.play(3);
  }, [quiz, seed]);
  useEffect(() => { if (!feedback) return; const t = setTimeout(() => setFeedback(null), 1600); return () => clearTimeout(t); }, [feedback]);

  const seconds = Math.max(0, Math.ceil((times.endsAt - now) / 1000));
  const countdown = Math.ceil((times.startsAt - now) / 1000);
  const over = now >= times.endsAt;
  const names = BOT_NAMES.slice(0, botCount);
  const scores = [view.score, ...botViews.map(b => b.score)];
  const rank = 1 + scores.filter(v => v > view.score).length;
  const result = over ? {
    title: "테스트 플레이 끝",
    headline: botCount > 1 ? `${rank}등` : view.score > scores[1] ? "YOU WIN!" : view.score === scores[1] ? "DRAW" : "GOOD GAME",
    score: ["나", ...names].map((n, i) => `${n} ${scores[i].toLocaleString("ko-KR")}`).join(" · ") + (quiz && (view.asked ?? 0) > 0 ? ` · 문제 ${view.right ?? 0}/${view.asked}` : ""),
    reward: "테스트 경기는 저장되지 않아요",
  } : null;
  const showQuiz = quiz && !over && countdown <= 0 && quizDue(view, quiz.every);
  const item = showQuiz ? pickQuestion(quiz.items, `test:${seed}`, view.asked ?? 0) : null;

  return <BattleStage themeSeed={seed} view={view} oppState={botViews[0]} meName="선생님(테스트)" oppName={names[0]}
    myScore={view.score} theirScore={botViews[0].score}
    others={botCount > 1 ? botViews.map((b, i) => ({ name: names[i], state: b })) : undefined}
    seconds={seconds} countdown={countdown} mineIndex={0} rules={rules} flow={over ? "reward" : countdown > 0 ? "ready" : "battle"}
    notice={!over && countdown <= 0 ? "테스트 플레이 — 저장되지 않아요. 컴퓨터 친구와 실제 경기 화면을 미리 해 봐요." : undefined}
    result={result} action={action} sound={sound} onBack={onClose} backLabel="테스트 끝내기"
    resultAction={{ label: "한 번 더 테스트", icon: "replay", onClick: onAgain }}
    quiz={quiz ? { every: quiz.every, onAnswer: answer, feedback, prompt: item ? { item, number: (view.asked ?? 0) + 1 } : null } : undefined} />;
}
