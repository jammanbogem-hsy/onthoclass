"use client";

/**
 * 퀴즈런 개발 확인용 임시 화면.
 *
 * 3D 렌더링은 코드만 봐서는 도는지 알 수 없어(SSR·물리엔진 초기화 등) 실제로
 * 띄워 확인하기 위한 하네스다. 교사 콘솔 연결이 끝나면 지운다.
 */

import dynamic from "next/dynamic";
import { QUIZRUN_DEFAULTS, type QuizRun, type QuizRunConfig } from "@/lib/quizrun";

// three.js/rapier 는 브라우저 전용 — 정적 내보내기(output:"export")에서 프리렌더되면
// 터지므로 SSR 을 끈다.
const QuizRunStage = dynamic(
  () => import("@/components/quizrun/QuizRunStage").then((m) => m.QuizRunStage),
  { ssr: false, loading: () => <p className="p-8">3D 불러오는 중…</p> }
);

const cfg: QuizRunConfig = {
  ...QUIZRUN_DEFAULTS,
  items: [
    { id: "q1", prompt: "용액이 아닌 것은?", options: ["소금물", "설탕물", "모래"], answerIndex: 2 },
    { id: "q2", prompt: "물에 잘 녹는 것은?", options: ["기름", "소금", "돌"], answerIndex: 1 },
    { id: "q3", prompt: "산성인 것은?", options: ["식초", "비누", "물"], answerIndex: 0 },
  ],
};

const run: QuizRun = {
  uid: "dev", name: "개발확인", status: "playing",
  energy: cfg.energyStart, score: 0, ballRadius: 0.42, stageIndex: 0,
  correct: 0, wrong: 0, order: [], cursor: 0,
  startedAt: null, finishedAt: null, lastActiveAt: null,
};

export default function QuizRunDevPage() {
  return (
    <main className="h-screen w-screen p-2">
      <QuizRunStage
        cid="dev" gid="dev" uid="dev" name="개발확인"
        cfg={cfg} run={run} onFinish={() => console.log("[quizrun] 종료")}
      />
    </main>
  );
}
