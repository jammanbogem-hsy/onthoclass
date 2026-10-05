"use client";

import { useEffect, useRef } from "react";
import type { QuizItem } from "@/lib/quizrun";
import styles from "./PuyoBattle.module.css";

export type QuizFeedback = { key: number; ok: boolean; bonus: number; penalty: number; answer: string };

/**
 * 문제 카드 — 내 보드가 멈춘 동안 경기 화면 가운데에 뜬다. 보기 4개를 크게, 숫자키 1~4 로도 고른다.
 * 한 번 고르면 끝(다시 누르기 막음). 결과는 아래 QuizToast 가 짧게 알려 준다.
 */
export function PuyoQuizPrompt({ item, number, every, onAnswer }: { item: QuizItem; number: number; every: number; onAnswer: (index: number) => void }) {
  const done = useRef(false);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { done.current = false; first.current?.focus({ preventScroll: true }); }, [item.id, number]);
  const pick = (i: number) => { if (done.current) return; done.current = true; onAnswer(i); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= item.options.length) { e.preventDefault(); pick(n - 1); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // pick 은 매 렌더 새로 만들어지지만 done ref 로만 동작한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);
  return <div className={styles.quizLayer} role="dialog" aria-modal="true" aria-labelledby="puyo-quiz-q">
    <div className={styles.quizCard}>
      <span className={styles.quizTag}>문제 {number} · 뿌요 {every}번마다</span>
      <h2 id="puyo-quiz-q" className={styles.quizQ}>{item.prompt}</h2>
      <div className={styles.quizOptions}>
        {item.options.map((o, i) => <button key={i} ref={i === 0 ? first : undefined} type="button" className={styles.quizOption} data-n={i + 1} onClick={() => pick(i)}>
          <b>{i + 1}</b><span>{o}</span>
        </button>)}
      </div>
      <small className={styles.quizHint}>내 보드는 잠깐 멈춰 있어요 · 숫자키 1~{item.options.length}로도 고를 수 있어요</small>
    </div>
  </div>;
}

/** 답한 직후 1.6초 — 정답이면 점수, 오답이면 정답과 방해 뿌요 안내. 게임은 바로 이어진다. */
export function QuizToast({ fb }: { fb: QuizFeedback }) {
  return <div key={fb.key} className={`${styles.quizToast} ${fb.ok ? styles.quizToastOk : styles.quizToastNo}`} role="status">
    {fb.ok ? <><strong>정답!</strong><span>+{fb.bonus.toLocaleString("ko-KR")}점</span></>
      : <><strong>아쉬워요</strong><span>정답: {fb.answer}{fb.penalty > 0 ? ` · 방해 뿌요 ${fb.penalty}개` : ""}</span></>}
  </div>;
}
