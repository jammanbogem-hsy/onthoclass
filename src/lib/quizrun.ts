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
  getDoc,
  getDocs,
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
  xpDivisor: 200,
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
  /** 게임 점수를 경험치로 바꿀 때 나눌 값 — 교사가 정한다.
   *  반마다 점수대가 달라서 고정 비율로는 맞출 수 없다(600점이 곧 600 XP 가
   *  되면 너무 많다). 없으면 기본값을 쓴다(옛 게임 문서 호환). */
  xpDivisor?: number;
  /** 문제 세트 */
  items: QuizItem[];
};

/** 게임 점수 → 경험치. 교사가 정한 비율로 나누고 올림한다(1점이라도 얻으면 1 XP).
 *  값이 없거나 0 이하면(옛 게임 문서·잘못된 값) 기본 비율로 떨어진다 —
 *  여기서 1 로 떨어지면 점수가 그대로 XP 가 되어 학급 레벨이 무너진다. */
export function xpFromScore(score: number, divisor?: number): number {
  const raw = Math.floor(divisor ?? 0);
  const d = raw > 0 ? raw : QUIZRUN_DEFAULTS.xpDivisor;
  return Math.max(0, Math.ceil(Math.max(0, score) / d));
}

/* ───────────────── 학생 진행 상태 ───────────────── */

export type QuizRunStatus = "idle" | "playing" | "done";

export type QuizRun = {
  uid: string;
  name: string;
  status: QuizRunStatus;
  /** 현재 에너지 */
  energy: number;
  /** 게임 점수(어솔 수집 점수) — 표시용. 등수는 collected 로 낸다 */
  score: number;
  /** 모은 오브젝트 총 개수 — 등수의 기준 */
  collected: number;
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
  /** 끝난 순간의 공 사진(Storage 다운로드 URL). 학급 전시에 쓴다. */
  shotUrl?: string;
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

export type RankBreakdown = {
  uid: string;
  name: string;
  /** 등수의 기준 — 모은 오브젝트 개수 */
  collected: number;
  /** 동점을 가르는 값 + 교사에게 보여 줄 참고치 */
  correct: number;
  wrong: number;
  stageIndex: number;
  /** 완주까지 걸린 시간(초). 아직 진행 중이면 null */
  elapsedSec: number | null;
};

/**
 * 등수 = 모은 오브젝트 개수.
 *
 * 예전에는 점수·정답수·공크기·단계를 0~100 으로 환산해 가중합했다. 레벨마다
 * 정해진 개수를 모아야 다음 레벨이 열리는 방식으로 바꾸면서 그 환산이 필요
 * 없어졌다 — 개수 하나로 진행도가 온전히 표현되고, 오브젝트를 모으려면
 * 에너지가 필요하고 에너지는 정답으로만 차니 정답 수도 이미 반영된다.
 *
 * 순서: 개수 많은 순 → 정답 많은 순 → 먼저 완주한 순.
 * 교사가 아이들에게 그대로 설명할 수 있는 규칙이어야 한다.
 */
export function computeRanking(runs: QuizRun[]): RankBreakdown[] {
  return runs
    .map((r) => ({
      uid: r.uid,
      name: r.name,
      collected: r.collected ?? 0,
      correct: r.correct ?? 0,
      wrong: r.wrong ?? 0,
      stageIndex: r.stageIndex ?? 0,
      elapsedSec:
        r.finishedAt && r.startedAt
          ? Math.max(1, Math.round((r.finishedAt - r.startedAt) / 1000))
          : null,
    }))
    .sort(
      (a, b) =>
        b.collected - a.collected ||
        b.correct - a.correct ||
        (a.elapsedSec ?? Number.POSITIVE_INFINITY) -
          (b.elapsedSec ?? Number.POSITIVE_INFINITY),
    );
}

/* ───────────────── 인트로 영상 · 제한시간 (순수 함수) ───────────────── */

/** 인트로 영상 경로. public/ 에 두고 hosting 에서 길게 캐시한다. */
export const QUIZRUN_INTRO_VIDEO = "/quizrun/quizrun-main-intro.mp4";

/** 인트로 구간(초). 실제 영상 길이(19.92초)를 올림한 값이다.
 *  영상을 교체하면 이 값도 함께 맞춰야 한다. */
export const QUIZRUN_INTRO_SEC = 20;

/**
 * 실제로 게임이 시작되는 시각.
 *
 * 교사가 시작을 누른 뒤 인트로 구간만큼 지난 순간이며, 제한시간은 여기서부터
 * 잰다. 영상을 건너뛴 학생도 이 시각까지는 대기하므로 모두가 같은 순간에
 * 시작하고 같은 순간에 끝난다 — 건너뛰기가 플레이 시간 이득이 되지 않는다.
 */
export function getGameStartAt(
  playStartedAt: number | null | undefined
): number | null {
  return playStartedAt ? playStartedAt + QUIZRUN_INTRO_SEC * 1000 : null;
}

/** 인트로가 끝나기까지 남은 초. 0 이면 게임 시작, null 이면 인트로 없음. */
export function getIntroRemainingSec(
  playStartedAt: number | null | undefined,
  now: number = Date.now()
): number | null {
  const startAt = getGameStartAt(playStartedAt);
  if (startAt === null) return null;
  return Math.max(0, Math.ceil((startAt - now) / 1000));
}

/* ───────────────── 제한시간 (순수 함수) ───────────────── */

/**
 * 남은 시간(초). 기준은 게임 문서의 playStartedAt(서버 시각)이라 학생마다
 * 늦게 들어와도 같은 시각에 끝난다.
 *
 * 시작 시각이나 설정이 없으면 null — "제한 없음"으로 보고 카운트다운을
 * 감춘다. 옛 게임 문서에는 playStartedAt 이 없어서 이 경우가 실제로 생긴다.
 */
export function getRemainingSec(
  playStartedAt: number | null | undefined,
  durationSec: number | null | undefined,
  now: number = Date.now()
): number | null {
  if (!playStartedAt || !durationSec || durationSec <= 0) return null;
  const left = playStartedAt + durationSec * 1000 - now;
  return Math.max(0, Math.ceil(left / 1000));
}

/** 3661 → "61:01" (분:초). 초등학생이 읽기 쉽게 분 단위까지만 쓴다. */
export function formatClock(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/* ───────────────── 경로 & 구독 ───────────────── */

const runCol = (cid: string, gid: string) =>
  collection(getDbClient(), "classes", cid, "games", gid, "runs");
const runRef = (cid: string, gid: string, uid: string) =>
  doc(getDbClient(), "classes", cid, "games", gid, "runs", uid);

/**
 * 참여 등록.
 *
 * 이미 문서가 있으면 진행 상태(점수·수집 개수·문항 위치)를 절대 건드리지
 * 않는다. 예전에는 초기값을 merge 로 덮어써서, 학생이 새로고침하거나 화면을
 * 접었다 펴면 그때까지 모은 점수가 0 으로 돌아갔다.
 *
 * 게임 도중에 들어와도 그대로 동작한다(중간 입장).
 */
export async function joinRun(
  cid: string,
  gid: string,
  uid: string,
  name: string,
  cfg: QuizRunConfig
): Promise<void> {
  const ref = runRef(cid, gid, uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    // 이름은 바뀔 수 있으니 갱신하되, 진행 상태는 손대지 않는다
    await updateDoc(ref, { name, lastActiveAt: serverTimestamp() });
    return;
  }

  await setDoc(ref, {
    uid,
    name,
    status: "idle",
    energy: cfg.energyStart,
    score: 0,
    collected: 0,
    ballRadius: 0.42,
    stageIndex: 0,
    correct: 0,
    wrong: 0,
    order: shuffleOrder(cfg.items, uid),
    cursor: 0,
    startedAt: null,
    finishedAt: null,
    lastActiveAt: serverTimestamp(),
  });
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

/** 지난 게임의 기록을 한 번만 읽는다 — 이력 화면처럼 실시간이 필요 없는 곳에서. */
export async function getRuns(cid: string, gid: string): Promise<QuizRun[]> {
  const snap = await getDocs(runCol(cid, gid));
  return snap.docs.map((d) => d.data() as QuizRun);
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

/* ───────────────── 지난 문제 세트 재활용 ───────────────── */

/** 지난 퀴즈런의 문제 세트 요약 — 새 게임을 만들 때 골라서 불러온다.
 *  같은 단원을 여러 반에서 하면 매번 다시 입력하게 되므로 필요하다. */
export type PastQuizSet = {
  gameId: string;
  /** 연결됐던 프로젝트·차시 이름 (없으면 "이름 없음") */
  label: string;
  items: QuizItem[];
  createdAt: number | null;
};

/**
 * 이 학급의 지난 퀴즈런 문제 세트를 최신순으로 가져온다.
 *
 * 정렬은 클라이언트에서 한다 — 별도 색인을 만들지 않기 위해서다(게임 문서는
 * 학급당 수십 개 규모라 전부 읽어도 부담이 없다). 문항이 없는 게임은 거른다.
 */
export async function listPastQuizSets(cid: string): Promise<PastQuizSet[]> {
  const snap = await getDocs(
    collection(getDbClient(), "classes", cid, "games")
  );
  const out: PastQuizSet[] = [];
  for (const d of snap.docs) {
    const v = d.data() as Record<string, unknown>;
    if (v.kind !== "quiz-run") continue;
    const quiz = v.quiz as QuizRunConfig | undefined;
    const items = Array.isArray(quiz?.items) ? quiz.items : [];
    if (items.length === 0) continue;
    const link = v.link as { name?: string } | undefined;
    const ts = v.createdAt as { toMillis?: () => number } | undefined;
    out.push({
      gameId: d.id,
      label: link?.name?.trim() || "이름 없음",
      items,
      createdAt: ts?.toMillis ? ts.toMillis() : null,
    });
  }
  return out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/** 불러온 문항에 새 id 를 부여한다 — 원본과 id 가 겹치면 학생별 순서 셔플에서
 *  같은 문제가 두 번 잡힐 수 있다. */
export function cloneItems(items: QuizItem[]): QuizItem[] {
  return items.map((it) => ({
    ...it,
    id: "q_" + Math.random().toString(36).slice(2, 10),
    options: [...it.options],
  }));
}

/* ───────────────── 차시 문항 가져오기 ───────────────── */

/**
 * 러닝크루 차시 문항(kind="quiz")을 퀴즈런 문항으로 변환한다.
 *
 * 두 모델이 options/answerIndex 로 같은 모양이라 변환이랄 게 거의 없다.
 * 다만 퀴즈런은 정답이 반드시 있어야 하므로(에너지 충전 판정) 정답 미설정이거나
 * 설문·투표용(ungraded)인 문항은 걸러낸다.
 */
export function fromLessonQuestions(
  questions: {
    id: string;
    kind: string;
    title?: string;
    text?: string;
    options?: string[];
    answerIndex?: number;
    ungraded?: boolean;
  }[],
  /** 문항 본문이 리치텍스트 JSON 이라 평문화가 필요하다 — 호출부가 주입한다 */
  toPlainText: (text: string) => string
): QuizItem[] {
  const out: QuizItem[] = [];
  for (const q of questions) {
    if (q.kind !== "quiz" || q.ungraded) continue;
    const options = (q.options ?? []).filter((o) => o.trim());
    const ai = q.answerIndex ?? -1;
    if (options.length < 2 || ai < 0 || ai >= options.length) continue;
    const prompt =
      (q.title?.trim() || toPlainText(q.text ?? "").trim()).slice(0, 300);
    if (!prompt) continue;
    out.push({
      id: "q_" + Math.random().toString(36).slice(2, 10),
      prompt,
      options,
      answerIndex: ai,
    });
  }
  return out;
}
