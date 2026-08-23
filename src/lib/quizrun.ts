// 퀴즈런 — 문제를 풀어 얻은 "러닝 에너지"로 3D 공을 굴리는 학급 게임 (Gimkit 형식)
//
// 빙고(games.ts)와 데이터가 전혀 겹치지 않아 별도 파일로 둔다. 공유하는 것은
// 게임 껍데기(생성·시작·종료·결과·XP)뿐이고, 그 연결은 games.ts 의 kind 분기가 맡는다.
//
// 경로:
//   classes/{cid}/games/{gameId}                      : 게임 문서 (kind="quiz-run")
//   classes/{cid}/games/{gameId}/runs/{uid}           : 학생별 진행 상태
//
// 설계 메모 — 에너지는 "움직일 때만" 닳는다. 멈춰서 다음 목표를 찾는 동안은
// 줄지 않으므로, 초등학생이 화면을 살피는 시간에 벌을 받지 않는다.
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";

/* ───────────────── 문항 ───────────────── */

/** 퀴즈런 문항. 객관식만 지원(주관식은 2차).
 *  러닝크루 차시 문항(lessons.ts Question)의 options/answerIndex 와 같은 모양이라
 *  기존 문항을 그대로 가져오거나 문서 자동 생성(parseSurveyDoc) 결과를 꽂을 수 있다. */
export type QuizItem = {
  id: string;
  prompt: string;
  options: string[];
  /** 정답 위치(0-based) */
  answerIndex: number;
};

/* ───────────────── 설정 ───────────────── */

/** 난이도 프리셋 — 다음 크기 단계로 넘어가는 점수 문턱을 몇 배로 할지.
 *  어솔의 단계 해금 기준(mechanics.getStageProgress)에 곱해 쓴다. */
export type Difficulty = "easy" | "normal" | "hard";

export const DIFFICULTY: Record<
  Difficulty,
  { label: string; goalMultiplier: number }
> = {
  easy: { label: "쉬움", goalMultiplier: 0.7 },
  normal: { label: "보통", goalMultiplier: 1 },
  hard: { label: "어려움", goalMultiplier: 1.4 },
};

/** 기본값 — 수업에서 한 번 돌려본 뒤 조정할 수 있도록 전부 교사 설정으로 뺐다.
 *  drainPerSec 5 / chargePerCorrect 30 = 정답 1개당 6초 이동, 10분에 약 50문제.
 *  (충전÷감소 비율이 체감을 결정한다 — 숫자 하나만 바꾸면 리듬이 깨진다) */
export const QUIZRUN_DEFAULTS = {
  durationSec: 600,
  energyStart: 100,
  energyMax: 500,
  drainPerSec: 5,
  chargePerCorrect: 30,
  wrongLockSec: 3,
  difficulty: "normal" as Difficulty,
};

export type QuizRunConfig = {
  /** 게임 길이(초) */
  durationSec: number;
  /** 시작 에너지 */
  energyStart: number;
  /** 에너지 상한 — 없으면 문제만 몰아 풀고 한 번에 클리어하는 극단 플레이가 나온다 */
  energyMax: number;
  /** 움직이는 동안 초당 소모 */
  drainPerSec: number;
  /** 정답 1개당 충전 */
  chargePerCorrect: number;
  /** 오답 시 잠금(초) — 이 동안 다음 문제로 못 넘어간다 */
  wrongLockSec: number;
  difficulty: Difficulty;
  /** 문제 세트 */
  items: QuizItem[];
};

/* ───────────────── 학생 진행 상태 ───────────────── */

export type QuizRunStatus = "idle" | "playing" | "done";

export type QuizRun = {
  uid: string;
  name: string;
  status: QuizRunStatus;
  /** 현재 에너지 */
  energy: number;
  /** 게임 점수(어솔 수집 점수) */
  score: number;
  /** 공 반지름 — 크기 카테고리 채점에 쓴다 */
  ballRadius: number;
  /** 도달한 맵 단계(0-based) */
  stageIndex: number;
  correct: number;
  wrong: number;
  /** 이 학생용으로 섞인 문항 순서(QuizItem.id 배열).
   *  학생마다 다르게 섞고, 다 풀면 다시 섞어 순환한다. */
  order: string[];
  /** order 안에서 다음에 낼 위치 */
  cursor: number;
  startedAt: number | null;
  finishedAt: number | null;
  lastActiveAt: number | null;
};

/* ───────────────── 문항 순서 (순수 함수 — 테스트 가능) ───────────────── */

/** 학생별 문항 순서를 만든다. seed 를 uid 로 주면 학생마다 다르고, 같은 학생은
 *  새로고침해도 같은 순서를 유지한다(진행 중 순서가 뒤집히지 않도록). */
export function shuffleOrder(items: QuizItem[], seed: string): string[] {
  const ids = items.map((i) => i.id);
  // djb2 로 seed → 정수, 그걸 선형합동생성기에 물려 결정적 셔플(Fisher-Yates)
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  let s = h >>> 0 || 1;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

/** 다음에 낼 문항을 고른다. 끝에 닿으면 다시 섞어 순환한다(같은 문제가 연달아
 *  나오지 않도록, 재셔플 결과의 첫 문항이 직전과 같으면 한 칸 밀어준다). */
export function nextItem(
  items: QuizItem[],
  run: Pick<QuizRun, "order" | "cursor" | "uid">,
  lastId?: string
): { item: QuizItem | null; order: string[]; cursor: number } {
  const byId = new Map(items.map((i) => [i.id, i]));
  let { order, cursor } = run;
  if (order.length === 0) order = shuffleOrder(items, run.uid);
  if (cursor >= order.length) {
    // 한 바퀴 다 돌았다 — 회차를 섞어 다시 시작
    order = shuffleOrder(items, `${run.uid}:${Date.now()}`);
    cursor = 0;
    if (order.length > 1 && order[0] === lastId) {
      [order[0], order[1]] = [order[1], order[0]];
    }
  }
  const item = byId.get(order[cursor]) ?? null;
  return { item, order, cursor };
}

/* ───────────────── 총점 (순수 함수) ───────────────── */

/** 순위 카테고리별 가중치 — 정답 수 비중을 점수와 같게 둬서, 게임을 잘하는 학생만
 *  이기지 않고 문제를 많이 맞힌 학생이 상위에 오도록 했다(학습 활동이므로). */
export const RANK_WEIGHTS = {
  score: 0.3,
  correct: 0.3,
  ballRadius: 0.3,
  stageIndex: 0.1,
} as const;

export type RankBreakdown = {
  uid: string;
  name: string;
  /** 카테고리별 0~100 환산값 */
  parts: Record<keyof typeof RANK_WEIGHTS, number>;
  total: number;
};

/** 4개 카테고리를 각각 0~100으로 환산한 뒤 가중합.
 *  그냥 더하면 자릿수가 큰 '점수'가 순위를 독식하므로 반드시 환산이 필요하다. */
export function computeRanking(runs: QuizRun[]): RankBreakdown[] {
  const keys = Object.keys(RANK_WEIGHTS) as (keyof typeof RANK_WEIGHTS)[];
  const max: Record<string, number> = {};
  for (const k of keys) max[k] = Math.max(...runs.map((r) => r[k] ?? 0), 0);

  return runs
    .map((r) => {
      const parts = {} as Record<keyof typeof RANK_WEIGHTS, number>;
      let total = 0;
      for (const k of keys) {
        // 최댓값이 0이면(아무도 못 함) 전원 0 — 나눗셈 폭발 방지
        const norm = max[k] > 0 ? ((r[k] ?? 0) / max[k]) * 100 : 0;
        parts[k] = Math.round(norm * 10) / 10;
        total += norm * RANK_WEIGHTS[k];
      }
      return { uid: r.uid, name: r.name, parts, total: Math.round(total * 10) / 10 };
    })
    .sort((a, b) => b.total - a.total);
}

/* ───────────────── 경로 & 구독 ───────────────── */

const runCol = (cid: string, gid: string) =>
  collection(getDbClient(), "classes", cid, "games", gid, "runs");
const runRef = (cid: string, gid: string, uid: string) =>
  doc(getDbClient(), "classes", cid, "games", gid, "runs", uid);

export async function joinRun(
  cid: string,
  gid: string,
  uid: string,
  name: string,
  cfg: QuizRunConfig
): Promise<void> {
  await setDoc(
    runRef(cid, gid, uid),
    {
      uid,
      name,
      status: "idle",
      energy: cfg.energyStart,
      score: 0,
      ballRadius: 0.42,
      stageIndex: 0,
      correct: 0,
      wrong: 0,
      order: shuffleOrder(cfg.items, uid),
      cursor: 0,
      startedAt: null,
      finishedAt: null,
      lastActiveAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function patchRun(
  cid: string,
  gid: string,
  uid: string,
  patch: Partial<QuizRun>
): Promise<void> {
  await updateDoc(runRef(cid, gid, uid), {
    ...patch,
    lastActiveAt: serverTimestamp(),
  });
}

export function watchRuns(
  cid: string,
  gid: string,
  cb: (runs: QuizRun[]) => void
): () => void {
  return onSnapshot(runCol(cid, gid), (snap) => {
    cb(snap.docs.map((d) => d.data() as QuizRun));
  });
}
