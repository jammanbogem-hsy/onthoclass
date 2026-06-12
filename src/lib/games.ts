// 학급 게임 — 개념 빙고
// 상태: draft → submit → select → build → play → done
// 경로:
//   classes/{cid}/games/{gameId}                     : 게임 문서
//   classes/{cid}/games/{gameId}/submissions/{uid}   : 학생별 상태/제출
//   classes/{cid}/control/game                       : 현재 활성 게임 포인터
import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";

export type GameKind = "bingo-concept";
export type GameStatus =
  | "draft" // 교사가 설정 중(미공개)
  | "submit" // 학생 단어 제출
  | "select" // 학생 후보 단어 선정
  | "build" // 학생 빙고판 배치
  | "play" // 진행
  | "done"; // 종료

export type GameOrder = "random" | "pick";

export type BoardSize = 3 | 4 | 5 | 7;

export type GameConfig = {
  boardSize: BoardSize;
  wordsPerStudent: number; // 학생 1인 제출 단어 수
  bingoTarget: number; // 완성 시 종료 빙고 라인 수
  order: GameOrder; // 차례 방식
  /** 단어 옆에 "한 줄 의미"를 함께 받는다(학습 효과↑). 기본 ON */
  allowMeaning: boolean;
  /** 게임 종료 시점: 0 = 전원 완성 시, N>0 = N명 완성 시 자동 종료(단어 소진/교사 수동은 항상). 기본 0 */
  endWinners: number;
};

/** 빙고 후보 단어 — 학생 제출/선정/교사 강제 채택 정보까지 보관 */
export type GameCandidate = {
  word: string;
  /** 단어를 제출한 학생 uid 들(중복 제거) */
  submittedBy: string[];
  /** 선정 단계에서 이 단어를 고른 학생 uid 들 */
  selectedBy: string[];
  /** 대표 한 줄 의미 (선택) */
  meaning?: string;
  /** 교사가 강제로 후보에 채택 */
  pinnedByTeacher?: boolean;
};

export type GameLink = {
  // 둘 중 하나(혹은 둘 다) — UI 픽커가 보장
  projectId?: string;
  lessonId?: string;
  name: string; // 표시용 (선택한 항목 이름)
};

export type Game = {
  id: string;
  kind: GameKind;
  status: GameStatus;
  config: GameConfig;
  link: GameLink;
  /** 선정 단계 풀 + 가중치(submittedBy/selectedBy). 교사가 최종 확정하면 status→build */
  candidates: GameCandidate[];
  turn: {
    round: number;
    history: string[]; // 이번 라운드에 이미 차례를 가진 학생 uid
    currentUid: string | null;
    calledWords: string[]; // 이번 게임 호출된 단어
  };
  ranks: { uid: string; rank: number; doneAtTurn: number }[];
  by: string;
  createdAt: number | null;
  updatedAt: number | null;
};

export type GameSubmissionStatus =
  | "joining"
  | "writing"
  | "submitted"
  | "ready" // 빙고판 배치 완료
  | "playing"
  | "done";

export type GameSubmission = {
  uid: string;
  name: string;
  status: GameSubmissionStatus;
  words: string[];
  /** 각 단어의 한 줄 의미(선택). words 와 길이/순서 동일. allowMeaning=true 일 때만 사용 */
  meanings?: string[];
  picked: string[]; // 선정 단계에서 학생이 고른 후보 단어들
  board: (string | null)[]; // boardSize² 배열, null=빈칸
  boardReady: boolean;
  marked: string[]; // 본인 보드에서 마크한 단어
  bingo: number; // 완성한 빙고 라인 수
  finishedAt: number | null;
  finishedAtTurn: number | null;
  lastActiveAt: number | null; // heartbeat (작성중/응답안함 판정)
  /** 학생이 탭을 벗어남 — 즉시 "응답안함" 으로 판정 (visibilitychange 로 갱신) */
  inactive?: boolean;
};

// ---------------- 경로 헬퍼 ----------------
const gameRef = (cid: string, gid: string) =>
  doc(getDbClient(), "classes", cid, "games", gid);
const subCol = (cid: string, gid: string) =>
  collection(getDbClient(), "classes", cid, "games", gid, "submissions");
const subRef = (cid: string, gid: string, uid: string) =>
  doc(getDbClient(), "classes", cid, "games", gid, "submissions", uid);
const activeRef = (cid: string) =>
  doc(getDbClient(), "classes", cid, "control", "game");

function randId(): string {
  return "g_" + Math.random().toString(36).slice(2, 10);
}

// ---------------- 생성/시작 ----------------
/**
 * 게임 생성 + 활성 포인터 지정. status="submit" 으로 즉시 학생 제출 모집을 연다.
 * 반환 = 생성된 gameId
 */
export async function createGame(
  cid: string,
  by: string,
  link: GameLink,
  config: GameConfig
): Promise<string> {
  const gid = randId();
  const g: Omit<Game, "id" | "createdAt" | "updatedAt"> = {
    kind: "bingo-concept",
    // 로비 단계: 학생이 참여만 한 상태로 모이고, 교사가 "단어 받기 시작" 을 누르면 submit 으로 전이
    status: "draft",
    config,
    link,
    candidates: [],
    turn: { round: 0, history: [], currentUid: null, calledWords: [] },
    ranks: [],
    by,
  };
  await setDoc(gameRef(cid, gid), {
    ...g,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(activeRef(cid), {
    gameId: gid,
    at: serverTimestamp(),
  });
  return gid;
}

/** 게임 상태 갱신 */
export async function setGameStatus(
  cid: string,
  gid: string,
  status: GameStatus
): Promise<void> {
  await updateDoc(gameRef(cid, gid), {
    status,
    updatedAt: serverTimestamp(),
  });
}

/** 활성 게임 포인터 해제 (종료 시) */
export async function clearActiveGame(cid: string): Promise<void> {
  await setDoc(
    activeRef(cid),
    { gameId: deleteField(), at: serverTimestamp() },
    { merge: true }
  );
}

/** 게임 종료 — 상태 done + 활성 포인터 해제 */
export async function endGame(cid: string, gid: string): Promise<void> {
  await setGameStatus(cid, gid, "done");
  await clearActiveGame(cid);
}

// ---------------- 구독 ----------------
/** 활성 게임 포인터를 따라가 현재 진행 중인 Game 문서를 콜백으로 전달 */
export function watchActiveGame(
  cid: string,
  cb: (g: Game | null) => void
): () => void {
  let offGame: (() => void) | null = null;
  const offPtr = onSnapshot(
    activeRef(cid),
    (snap) => {
      const gid = (snap.exists() ? (snap.data().gameId as string) : "") || "";
      if (offGame) {
        offGame();
        offGame = null;
      }
      if (!gid) {
        cb(null);
        return;
      }
      offGame = onSnapshot(
        gameRef(cid, gid),
        (gs) => cb(gs.exists() ? mapGame(gs.id, gs.data()) : null),
        () => cb(null)
      );
    },
    () => cb(null)
  );
  return () => {
    offPtr();
    if (offGame) offGame();
  };
}

/** 특정 게임 문서 구독 (gameId 알 때) */
export function watchGame(
  cid: string,
  gid: string,
  cb: (g: Game | null) => void
): () => void {
  return onSnapshot(
    gameRef(cid, gid),
    (snap) => cb(snap.exists() ? mapGame(snap.id, snap.data()) : null),
    () => cb(null)
  );
}

/** 학급의 모든 게임 1회 조회 (이력) — 최신 생성순 */
export async function getGames(cid: string): Promise<Game[]> {
  const snap = await getDocs(
    collection(getDbClient(), "classes", cid, "games")
  );
  const list = snap.docs.map((d) => mapGame(d.id, d.data()));
  list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return list;
}

/** 특정 게임의 학생 제출 1회 조회 (이력 상세) */
export async function getGameSubmissions(
  cid: string,
  gid: string
): Promise<GameSubmission[]> {
  const snap = await getDocs(subCol(cid, gid));
  return snap.docs.map((d) => mapSubmission(d.id, d.data()));
}

/** 게임의 모든 학생 제출 구독 */
export function watchGameSubmissions(
  cid: string,
  gid: string,
  cb: (list: GameSubmission[]) => void
): () => void {
  return onSnapshot(
    subCol(cid, gid),
    (snap) => cb(snap.docs.map((d) => mapSubmission(d.id, d.data()))),
    () => cb([])
  );
}

/** 본인 제출 단건 구독 */
export function watchMySubmission(
  cid: string,
  gid: string,
  uid: string,
  cb: (s: GameSubmission | null) => void
): () => void {
  return onSnapshot(
    subRef(cid, gid, uid),
    (snap) =>
      cb(snap.exists() ? mapSubmission(uid, snap.data()) : null),
    () => cb(null)
  );
}

// ---------------- 학생 액션 ----------------
/** 참여하기 — 본인 제출 문서 생성(없으면). 로비 단계는 status="joining" */
export async function joinGame(
  cid: string,
  gid: string,
  uid: string,
  name: string
): Promise<void> {
  await setDoc(
    subRef(cid, gid, uid),
    {
      uid,
      name,
      status: "joining",
      words: [],
      picked: [],
      board: [],
      boardReady: false,
      marked: [],
      bingo: 0,
      finishedAt: null,
      finishedAtTurn: null,
      lastActiveAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** 본인 제출의 표시 이름만 갱신(이미 참여한 뒤 정확한 학급 이름이 늦게 도착했을 때 보정). */
export async function setGameName(
  cid: string,
  gid: string,
  uid: string,
  name: string
): Promise<void> {
  await setDoc(subRef(cid, gid, uid), { name }, { merge: true });
}

/** 교사: 로비 → 단어 받기 시작. status="submit" 으로 전이 */
export async function startSubmitPhase(
  cid: string,
  gid: string
): Promise<void> {
  await setGameStatus(cid, gid, "submit");
}

/** 활동 heartbeat — 작성중/응답안함 판정용 */
export async function pingActive(
  cid: string,
  gid: string,
  uid: string
): Promise<void> {
  await setDoc(
    subRef(cid, gid, uid),
    { lastActiveAt: serverTimestamp(), inactive: false },
    { merge: true }
  );
}

/** 탭 이탈/복귀 즉시 반영 — visibilitychange 에서 호출 */
export async function setInactive(
  cid: string,
  gid: string,
  uid: string,
  inactive: boolean
): Promise<void> {
  await setDoc(
    subRef(cid, gid, uid),
    inactive
      ? { inactive: true }
      : { inactive: false, lastActiveAt: serverTimestamp() },
    { merge: true }
  );
}

/** 학생 단어 제출 — status="submitted" + words(+optional meanings) 저장 */
export async function submitGameWords(
  cid: string,
  gid: string,
  uid: string,
  words: string[],
  meanings?: string[]
): Promise<void> {
  await setDoc(
    subRef(cid, gid, uid),
    {
      words,
      ...(meanings ? { meanings } : {}),
      status: "submitted",
      lastActiveAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** 학생 선정 단계 — 후보 단어 N²개 선택 저장 */
export async function setStudentPicks(
  cid: string,
  gid: string,
  uid: string,
  picked: string[]
): Promise<void> {
  await setDoc(
    subRef(cid, gid, uid),
    { picked, lastActiveAt: serverTimestamp() },
    { merge: true }
  );
}

/** 학생 빙고판 완성 — status="ready" + board 저장. board 의 null = FREE(자동 완성) 칸 */
export async function submitBoard(
  cid: string,
  gid: string,
  uid: string,
  board: (string | null)[]
): Promise<void> {
  // 보드 검증 — 빙고판 만들기 단계(build)에서만, 보드의 모든 단어는 확정 후보여야 함.
  // (정상 플레이는 후보 단어만 배치하므로 영향 없음. 변조/깨진 보드만 차단.)
  await runTransaction(getDbClient(), async (tx) => {
    const gRef = gameRef(cid, gid);
    const gSnap = await tx.get(gRef);
    if (!gSnap.exists()) throw new Error("게임을 찾을 수 없습니다");
    const game = mapGame(gSnap.id, gSnap.data());
    if (game.status !== "build")
      throw new Error("빙고판 만들기 단계에서만 제출할 수 있습니다");
    const candidateWords = new Set(game.candidates.map((c) => c.word));
    for (const w of board) {
      if (w !== null && !candidateWords.has(w))
        throw new Error("보드에 후보가 아닌 단어가 있습니다");
    }
    tx.set(
      subRef(cid, gid, uid),
      {
        board,
        boardReady: true,
        status: "ready",
        lastActiveAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/** 학생: 빙고판 재편집으로 돌아가기 */
export async function reopenBoard(
  cid: string,
  gid: string,
  uid: string
): Promise<void> {
  await setDoc(
    subRef(cid, gid, uid),
    { boardReady: false, status: "submitted", lastActiveAt: serverTimestamp() },
    { merge: true }
  );
}

/** 교사: build → play 전이 + 첫 차례 학생 랜덤 선정.
 * boardReady 인 학생 중 랜덤. 한 명도 없으면 currentUid=null 로 두고 status 만 변경. */
export async function advanceToPlay(
  cid: string,
  gid: string,
  subs: GameSubmission[]
): Promise<void> {
  const eligible = subs.filter((s) => s.boardReady);
  const firstUid =
    eligible.length > 0
      ? eligible[Math.floor(Math.random() * eligible.length)].uid
      : null;
  // 상태 가드 — 빙고판 만들기 단계(build)에서만. 재진입/오상태/중복클릭으로
  // 진행 중인 게임의 turn 이 초기화되는 사고 방지.
  await runTransaction(getDbClient(), async (tx) => {
    const ref = gameRef(cid, gid);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("게임을 찾을 수 없습니다");
    const g = mapGame(snap.id, snap.data());
    if (g.status !== "build")
      throw new Error("빙고판 만들기 단계에서만 시작할 수 있습니다");
    tx.update(ref, {
      status: "play",
      "turn.round": 1,
      "turn.history": [],
      "turn.currentUid": firstUid,
      "turn.calledWords": [],
      updatedAt: serverTimestamp(),
    });
  });
}

// ---------------- 플레이 단계 ----------------

/**
 * 학생: 본인 차례에 단어 호출 + 다음 차례 학생 지정.
 *
 * 회전 규칙:
 * - random 모드: nextUidHint 무시, 서버가 eligible 중 랜덤 선택
 * - pick 모드: nextUidHint 사용 (유효성 검사 후). 없거나 부적합하면 랜덤 폴백
 * - eligible = boardReady && status!=="done" && !history(이번 라운드)
 * - 라운드 안 eligible 이 비면: round++, history 비움, 새 라운드 시작
 * - active 자체가 0 이면: currentUid=null (게임 정체 — 교사 종료)
 *
 * subs 는 호출 시점의 학생 제출 목록 — 라운드 회전 계산용으로 클라이언트가 전달.
 */
export async function studentCall(
  cid: string,
  gid: string,
  uid: string,
  word: string,
  nextUidHint: string | null,
  subs: GameSubmission[]
): Promise<void> {
  await runTransaction(getDbClient(), async (tx) => {
    const ref = gameRef(cid, gid);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("게임을 찾을 수 없습니다");
    const g = mapGame(snap.id, snap.data());
    if (g.status !== "play") throw new Error("플레이 단계가 아닙니다");
    if (g.turn.currentUid !== uid) throw new Error("내 차례가 아닙니다");
    if (g.turn.calledWords.includes(word))
      throw new Error("이미 호출된 단어입니다");
    if (!g.candidates.some((c) => c.word === word))
      throw new Error("후보에 없는 단어입니다");

    const newCalled = [...g.turn.calledWords, word];
    const newHistory = [...g.turn.history, uid];

    const active = subs.filter(
      (s) => s.boardReady && s.status !== "done"
    );
    const eligibleThisRound = active.filter(
      (s) => !newHistory.includes(s.uid)
    );

    // 학생이 자기 자신을 "다음 차례"로 지목해 차례를 독점하는 것 방지(pick 모드).
    // 본인을 가리키는 힌트는 무시 → 아래 로직이 본인 제외 후보에서 선택.
    const hint = nextUidHint === uid ? null : nextUidHint;

    let nextRound = g.turn.round;
    let finalHistory: string[] = newHistory;
    let nextUid: string | null = null;

    if (eligibleThisRound.length === 0) {
      // 라운드 종료 → 새 라운드. 방금 호출한 본인 제외. pick 모드면 학생이 고른
      // "다음 라운드 첫 차례"(nextUidHint)를 사용, 없으면 랜덤(본인 제외).
      nextRound = g.turn.round + 1;
      finalHistory = [];
      const pool = active.filter((s) => s.uid !== uid);
      const candidates = pool.length > 0 ? pool : active;
      if (hint && candidates.some((s) => s.uid === hint)) {
        nextUid = hint;
      } else {
        nextUid =
          candidates.length > 0
            ? candidates[Math.floor(Math.random() * candidates.length)].uid
            : null;
      }
    } else if (hint && eligibleThisRound.some((s) => s.uid === hint)) {
      nextUid = hint;
    } else {
      nextUid =
        eligibleThisRound[
          Math.floor(Math.random() * eligibleThisRound.length)
        ].uid;
    }

    tx.update(ref, {
      "turn.calledWords": newCalled,
      "turn.history": finalHistory,
      "turn.round": nextRound,
      "turn.currentUid": nextUid,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * 교사: 강제로 다음 차례 학생 지정 (정체 해소용). uid=null 이면 랜덤.
 * 학생이 자리 비웠을 때 게임을 살려두는 안전장치.
 */
export async function teacherForceNextCaller(
  cid: string,
  gid: string,
  nextUid: string | null,
  subs: GameSubmission[]
): Promise<void> {
  await runTransaction(getDbClient(), async (tx) => {
    const ref = gameRef(cid, gid);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("게임을 찾을 수 없습니다");
    const g = mapGame(snap.id, snap.data());
    if (g.status !== "play") throw new Error("플레이 단계가 아닙니다");
    const active = subs.filter(
      (s) => s.boardReady && s.status !== "done"
    );
    if (active.length === 0) return;
    const cur = g.turn.currentUid;
    // 현재 차례자는 자동/랜덤 이관 후보에서 제외 — 같은 학생이 연속 2번 되는 것 방지.
    // (단, 현재 차례자만 남아 있으면 어쩔 수 없이 본인)
    const eligibleThisRound = active.filter(
      (s) => !g.turn.history.includes(s.uid) && s.uid !== cur
    );
    let nextRound = g.turn.round;
    let finalHistory: string[] = g.turn.history;
    let pick: string | null = null;
    if (nextUid && active.some((s) => s.uid === nextUid)) {
      // 교사가 명시적으로 지정한 학생은 그대로(현재 차례자라도 교사 의도 존중)
      pick = nextUid;
    } else if (eligibleThisRound.length > 0) {
      pick =
        eligibleThisRound[
          Math.floor(Math.random() * eligibleThisRound.length)
        ].uid;
    } else {
      // 라운드 종료 + 새 라운드 랜덤(현재 차례자 제외, 없으면 본인)
      nextRound = g.turn.round + 1;
      finalHistory = [];
      const pool = active.filter((s) => s.uid !== cur);
      const candidates = pool.length > 0 ? pool : active;
      pick =
        candidates[Math.floor(Math.random() * candidates.length)].uid;
    }
    // 유일한 활성 학생이 현재(자리비움/완료) 차례자뿐이면 넘길 곳이 없음 —
    // 자동조종이 5초마다 같은 학생을 재지정하는 무의미한 쓰기(churn) 방지(no-op).
    if (pick === cur && !nextUid) return;

    tx.update(ref, {
      "turn.history": finalHistory,
      "turn.round": nextRound,
      "turn.currentUid": pick,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * 교사: 단어 강제 호출 (학생이 자리 비웠을 때 게임 진행을 막지 않기 위함).
 * studentCall 과 같은 회전 로직을 따른다 — 현재 차례 학생을 history 에 넣고 다음으로 패스.
 */
export async function teacherCallWord(
  cid: string,
  gid: string,
  word: string,
  subs: GameSubmission[]
): Promise<void> {
  await runTransaction(getDbClient(), async (tx) => {
    const ref = gameRef(cid, gid);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("게임을 찾을 수 없습니다");
    const g = mapGame(snap.id, snap.data());
    if (g.status !== "play") throw new Error("플레이 단계가 아닙니다");
    if (g.turn.calledWords.includes(word))
      throw new Error("이미 호출된 단어입니다");
    if (!g.candidates.some((c) => c.word === word))
      throw new Error("후보에 없는 단어입니다");

    const newCalled = [...g.turn.calledWords, word];
    // 현재 차례 학생이 있으면 history 추가 (그들의 차례를 소비)
    const currentUid = g.turn.currentUid;
    const newHistory =
      currentUid && !g.turn.history.includes(currentUid)
        ? [...g.turn.history, currentUid]
        : g.turn.history;

    const active = subs.filter(
      (s) => s.boardReady && s.status !== "done"
    );
    const eligibleThisRound = active.filter(
      (s) => !newHistory.includes(s.uid)
    );
    let nextRound = g.turn.round;
    let finalHistory = newHistory;
    let nextUid: string | null = null;
    if (eligibleThisRound.length === 0) {
      // 라운드 종료 → 새 라운드. 방금 차례를 소비한 학생은 제외(연속 차례 방지).
      nextRound = g.turn.round + 1;
      finalHistory = [];
      const pool = active.filter((s) => s.uid !== currentUid);
      const pick = pool.length > 0 ? pool : active;
      nextUid =
        pick.length > 0
          ? pick[Math.floor(Math.random() * pick.length)].uid
          : null;
    } else {
      nextUid =
        eligibleThisRound[
          Math.floor(Math.random() * eligibleThisRound.length)
        ].uid;
    }
    tx.update(ref, {
      "turn.calledWords": newCalled,
      "turn.history": finalHistory,
      "turn.round": nextRound,
      "turn.currentUid": nextUid,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * 교사: 호출 취소 (마지막/잘못 호출된 단어 되돌리기).
 * 이미 그 단어로 done 처리된 학생이 있으면 거부.
 */
export async function uncallWord(
  cid: string,
  gid: string,
  word: string
): Promise<void> {
  await runTransaction(getDbClient(), async (tx) => {
    const ref = gameRef(cid, gid);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("게임을 찾을 수 없습니다");
    const g = mapGame(snap.id, snap.data());
    if (g.status !== "play") throw new Error("플레이 단계가 아닙니다");
    const idx = g.turn.calledWords.indexOf(word);
    if (idx < 0) return;
    // 이 단어가 호출된 시점(누적 호출 수) 이후에 빙고를 완성해 순위에 든 학생이 있으면
    // 취소를 거부한다 — 취소하면 그 학생의 완성 근거(호출 이력)가 사라져 "유령 1등"이 됨.
    // (호출 취소 UI 는 마지막 호출 단어만 허용하므로 보통 removedAtCount === 현재 호출 수)
    const removedAtCount = idx + 1;
    const conflict = g.ranks.some((r) => r.doneAtTurn >= removedAtCount);
    if (conflict)
      throw new Error("이미 이 단어로 빙고를 완성한 학생이 있어 호출을 취소할 수 없어요");
    const next = [...g.turn.calledWords];
    next.splice(idx, 1);
    tx.update(ref, {
      "turn.calledWords": next,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * 빙고 라인 수 계산 — 가로/세로/대각선 \, /.
 * board: boardSize² 배열, marked: 마크된 단어 set.
 * 빈칸(null) = FREE(자동 완성) 칸으로 항상 채워진 것으로 본다(후보 단어 < N² 일 때).
 */
export function countBingoLines(
  board: (string | null)[],
  marked: string[],
  N: number
): number {
  const set = new Set(marked);
  const filled = (i: number): boolean => {
    const w = board[i];
    if (w === null) return true; // FREE
    return !!w && set.has(w);
  };
  let count = 0;
  // 가로
  for (let r = 0; r < N; r++) {
    let all = true;
    for (let c = 0; c < N; c++) {
      if (!filled(r * N + c)) {
        all = false;
        break;
      }
    }
    if (all) count++;
  }
  // 세로
  for (let c = 0; c < N; c++) {
    let all = true;
    for (let r = 0; r < N; r++) {
      if (!filled(r * N + c)) {
        all = false;
        break;
      }
    }
    if (all) count++;
  }
  // 대각선 \
  {
    let all = true;
    for (let i = 0; i < N; i++) {
      if (!filled(i * N + i)) {
        all = false;
        break;
      }
    }
    if (all) count++;
  }
  // 대각선 /
  {
    let all = true;
    for (let i = 0; i < N; i++) {
      if (!filled(i * N + (N - 1 - i))) {
        all = false;
        break;
      }
    }
    if (all) count++;
  }
  return count;
}

/**
 * 빙고 라인을 이루는 셀 인덱스 집합 — 학생 화면에서 줄을 빛나게 강조.
 */
export function bingoLineCells(
  board: (string | null)[],
  marked: string[],
  N: number
): Set<number> {
  const set = new Set(marked);
  const filled = (i: number) => {
    const w = board[i];
    if (w === null) return true; // FREE(자동 완성) 칸
    return !!w && set.has(w);
  };
  const cells = new Set<number>();
  const lines: number[][] = [];
  for (let r = 0; r < N; r++) {
    const row: number[] = [];
    for (let c = 0; c < N; c++) row.push(r * N + c);
    lines.push(row);
  }
  for (let c = 0; c < N; c++) {
    const col: number[] = [];
    for (let r = 0; r < N; r++) col.push(r * N + c);
    lines.push(col);
  }
  {
    const d: number[] = [];
    for (let i = 0; i < N; i++) d.push(i * N + i);
    lines.push(d);
  }
  {
    const d: number[] = [];
    for (let i = 0; i < N; i++) d.push(i * N + (N - 1 - i));
    lines.push(d);
  }
  for (const ln of lines) if (ln.every(filled)) ln.forEach((i) => cells.add(i));
  return cells;
}

/**
 * 학생: 본인 보드의 셀(단어) 마크.
 * - 이미 호출된 단어만 가능
 * - bingoTarget 달성 시 ranks[] 에 트랜잭션으로 atomic 등록
 */
export async function markCell(
  cid: string,
  gid: string,
  uid: string,
  word: string
): Promise<void> {
  await runTransaction(getDbClient(), async (tx) => {
    const gRef = gameRef(cid, gid);
    const sRef = subRef(cid, gid, uid);
    const gSnap = await tx.get(gRef);
    const sSnap = await tx.get(sRef);
    if (!gSnap.exists() || !sSnap.exists())
      throw new Error("게임/제출 문서가 없습니다");
    const game = mapGame(gSnap.id, gSnap.data());
    const sub = mapSubmission(uid, sSnap.data());

    if (game.status !== "play") throw new Error("플레이 단계가 아닙니다");
    if (!game.turn.calledWords.includes(word))
      throw new Error("아직 호출되지 않은 단어입니다");
    if (!sub.board.includes(word))
      throw new Error("내 보드에 없는 단어입니다");
    if (sub.marked.includes(word)) return; // 이미 마크 — 멱등

    const N = game.config.boardSize;
    const newMarked = [...sub.marked, word];
    const lines = countBingoLines(sub.board, newMarked, N);

    const subUpdates: Record<string, unknown> = {
      marked: newMarked,
      bingo: lines,
      status: "playing",
      lastActiveAt: serverTimestamp(),
    };

    // 빙고 목표 달성 + 아직 ranks 에 없음 → 등록
    const alreadyRanked = game.ranks.some((r) => r.uid === uid);
    if (
      lines >= game.config.bingoTarget &&
      sub.status !== "done" &&
      !alreadyRanked
    ) {
      const doneAtTurn = game.turn.calledWords.length;
      // 올림픽 랭킹 — 같은 차례(doneAtTurn) 완성자는 같은 순위. 별도 인원 상한 없음
      // (게임 종료 시점=endWinners 이 순위 인원도 결정한다).
      const sameTurnEntry = game.ranks.find(
        (r) => r.doneAtTurn === doneAtTurn
      );
      const myRank =
        sameTurnEntry?.rank ??
        1 + game.ranks.filter((r) => r.doneAtTurn < doneAtTurn).length;
      subUpdates.status = "done";
      subUpdates.finishedAt = serverTimestamp();
      subUpdates.finishedAtTurn = doneAtTurn;
      tx.update(gRef, {
        ranks: [...game.ranks, { uid, rank: myRank, doneAtTurn }],
        updatedAt: serverTimestamp(),
      });
    }

    tx.update(sRef, subUpdates);
  });
}

/**
 * 학생: 마크 취소 (오마크 되돌리기).
 * 이미 done 된 학생은 보호.
 */
export async function unmarkCell(
  cid: string,
  gid: string,
  uid: string,
  word: string
): Promise<void> {
  await runTransaction(getDbClient(), async (tx) => {
    const sRef = subRef(cid, gid, uid);
    const sSnap = await tx.get(sRef);
    if (!sSnap.exists()) return;
    const sub = mapSubmission(uid, sSnap.data());
    if (sub.status === "done") return; // 완료 후엔 잠금
    if (!sub.marked.includes(word)) return;
    const gSnap = await tx.get(gameRef(cid, gid));
    if (!gSnap.exists()) return;
    const game = mapGame(gSnap.id, gSnap.data());
    const N = game.config.boardSize;
    const newMarked = sub.marked.filter((w) => w !== word);
    const lines = countBingoLines(sub.board, newMarked, N);
    tx.update(sRef, {
      marked: newMarked,
      bingo: lines,
      lastActiveAt: serverTimestamp(),
    });
  });
}

/** 교사: 게임을 선정 단계로 진입 — 모든 학생의 단어/의미를 모아 candidates 풀 생성 */
export async function advanceToSelect(
  cid: string,
  gid: string,
  subs: GameSubmission[]
): Promise<void> {
  // 단어를 normalize 해서 중복 제거(공백/대소문자 무시), 제출자 누적
  const byKey = new Map<string, GameCandidate>();
  for (const s of subs) {
    s.words.forEach((w, i) => {
      const key = (w || "").trim();
      if (!key) return;
      const lo = key.toLowerCase();
      const cur =
        byKey.get(lo) ??
        ({
          word: key,
          submittedBy: [],
          selectedBy: [],
        } as GameCandidate);
      if (!cur.submittedBy.includes(s.uid)) cur.submittedBy.push(s.uid);
      const mn = s.meanings?.[i]?.trim();
      if (mn && !cur.meaning) cur.meaning = mn;
      byKey.set(lo, cur);
    });
  }
  const candidates = Array.from(byKey.values());
  // 상태 가드 — 단어 제출 단계(submit)에서만. 재진입/오상태/중복클릭으로 진행 단계가
  // 망가지지 않도록 트랜잭션으로 현재 status 를 확인 후 전이.
  await runTransaction(getDbClient(), async (tx) => {
    const ref = gameRef(cid, gid);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("게임을 찾을 수 없습니다");
    const g = mapGame(snap.id, snap.data());
    if (g.status !== "submit")
      throw new Error("단어 제출 단계에서만 진행할 수 있습니다");
    tx.update(ref, {
      candidates,
      status: "select",
      updatedAt: serverTimestamp(),
    });
  });
}

/** 교사: 최종 후보 확정(선정 결과 → build 단계). 의미/제출자 정보 보존 */
export async function finalizeCandidates(
  cid: string,
  gid: string,
  finalCandidates: GameCandidate[]
): Promise<void> {
  if (finalCandidates.length === 0)
    throw new Error("최소 1개 이상의 개념이 필요합니다");
  // 상태 가드 — 선정 단계(select)에서만. 재진입/오상태/중복클릭 방지.
  await runTransaction(getDbClient(), async (tx) => {
    const ref = gameRef(cid, gid);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("게임을 찾을 수 없습니다");
    const g = mapGame(snap.id, snap.data());
    if (g.status !== "select")
      throw new Error("개념 선정 단계에서만 진행할 수 있습니다");
    tx.update(ref, {
      candidates: finalCandidates,
      status: "build",
      updatedAt: serverTimestamp(),
    });
  });
}

/** 제출 후 수정으로 되돌리기 (필요 시) */
export async function reopenWriting(
  cid: string,
  gid: string,
  uid: string
): Promise<void> {
  await setDoc(
    subRef(cid, gid, uid),
    { status: "writing", lastActiveAt: serverTimestamp() },
    { merge: true }
  );
}

// ---------------- mapper ----------------
// 후보 단어를 새 GameCandidate[] 형태로 정규화 — 옛 string[] 데이터 호환
function normalizeCandidates(v: unknown): GameCandidate[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => {
    if (typeof x === "string") {
      return { word: x, submittedBy: [], selectedBy: [] };
    }
    const o = x as Partial<GameCandidate>;
    return {
      word: o.word ?? "",
      submittedBy: Array.isArray(o.submittedBy) ? o.submittedBy : [],
      selectedBy: Array.isArray(o.selectedBy) ? o.selectedBy : [],
      ...(o.meaning ? { meaning: o.meaning } : {}),
      ...(o.pinnedByTeacher ? { pinnedByTeacher: true } : {}),
    };
  });
}

function mapGame(id: string, v: Record<string, unknown>): Game {
  const ts = (k: string) => {
    const t = v[k] as { toMillis?: () => number } | undefined;
    return t?.toMillis ? t.toMillis() : null;
  };
  const cfg = (v.config as Partial<GameConfig>) ?? {};
  const link = (v.link as GameLink) ?? { name: "" };
  const turn = (v.turn as Game["turn"]) ?? {
    round: 0,
    history: [],
    currentUid: null,
    calledWords: [],
  };
  return {
    id,
    kind: (v.kind as GameKind) ?? "bingo-concept",
    status: (v.status as GameStatus) ?? "draft",
    config: {
      boardSize: (cfg.boardSize as BoardSize) ?? 5,
      wordsPerStudent: cfg.wordsPerStudent ?? 5,
      bingoTarget: cfg.bingoTarget ?? 1,
      order: (cfg.order as GameOrder) ?? "random",
      allowMeaning: cfg.allowMeaning ?? true,
      endWinners: cfg.endWinners ?? 0,
    },
    link,
    // 후보 = 새 GameCandidate[] 우선, 옛 string[] 호환
    candidates: normalizeCandidates(v.candidates),
    turn: {
      round: turn.round ?? 0,
      history: Array.isArray(turn.history) ? turn.history : [],
      currentUid: turn.currentUid ?? null,
      calledWords: Array.isArray(turn.calledWords) ? turn.calledWords : [],
    },
    ranks: Array.isArray(v.ranks) ? (v.ranks as Game["ranks"]) : [],
    by: (v.by as string) ?? "",
    createdAt: ts("createdAt"),
    updatedAt: ts("updatedAt"),
  };
}

function mapSubmission(
  uid: string,
  v: Record<string, unknown>
): GameSubmission {
  const ts = (k: string) => {
    const t = v[k] as { toMillis?: () => number } | undefined;
    return t?.toMillis ? t.toMillis() : null;
  };
  return {
    uid,
    name: (v.name as string) ?? "",
    status: (v.status as GameSubmissionStatus) ?? "joining",
    words: Array.isArray(v.words) ? (v.words as string[]) : [],
    ...(Array.isArray(v.meanings)
      ? { meanings: v.meanings as string[] }
      : {}),
    ...(typeof v.inactive === "boolean" ? { inactive: v.inactive } : {}),
    picked: Array.isArray(v.picked) ? (v.picked as string[]) : [],
    board: Array.isArray(v.board) ? (v.board as (string | null)[]) : [],
    boardReady: !!v.boardReady,
    marked: Array.isArray(v.marked) ? (v.marked as string[]) : [],
    bingo: (v.bingo as number) ?? 0,
    finishedAt: ts("finishedAt"),
    finishedAtTurn:
      typeof v.finishedAtTurn === "number"
        ? (v.finishedAtTurn as number)
        : null,
    lastActiveAt: ts("lastActiveAt"),
  };
}

// ---------------- 상태 분류 ----------------
/**
 * 학생 활동 상태 분류 — 모니터링 그리드 테두리 색용.
 * - submitted: status==="submitted" 이상(이미 단어 제출 완료)
 * - writing : 최근 20초 안에 heartbeat (10초 간격 ping 의 2배 마진)
 * - idle    : 그 외 (응답안함)
 */
export type LiveStatus = "submitted" | "writing" | "joined" | "idle";

/**
 * 학생 활동 상태 분류.
 * - submitted: 단어 제출 이상
 * - writing  : submit 단계에서 최근 20초 안에 heartbeat
 * - joined   : 로비 단계(draft) 에서 참여 완료(아직 작성 단계 아님)
 * - idle     : 그 외 (응답안함)
 */
export function liveStatusOf(
  s: GameSubmission | undefined,
  game: Game,
  now = Date.now()
): LiveStatus {
  if (!s) return "idle";

  // 단계별 "완료" 기준 — 같은 status 라도 단계에 따라 다르게 판단
  switch (game.status) {
    case "draft":
      // 로비 — 참여만 했으면 참여 완료
      return s.inactive ? "joined" : "joined";
    case "submit":
      if (
        s.status === "submitted" ||
        s.status === "ready" ||
        s.status === "playing" ||
        s.status === "done"
      )
        return "submitted";
      break;
    case "select": {
      // 학생 선정 목표는 보드 차원 N (SelectPanel 과 동일). 교사 완료 판정도 N 으로 통일.
      const target = Math.min(
        game.config.boardSize,
        game.candidates.length
      );
      if (s.picked.length >= target) return "submitted";
      break;
    }
    case "build":
      if (s.boardReady || s.status === "ready" || s.status === "playing" || s.status === "done")
        return "submitted";
      break;
    case "play":
    case "done":
      return "submitted";
  }

  // 미완료 상태 — 활동 흔적으로 작성중/응답안함 판단
  if (s.inactive) return "idle";
  const last = s.lastActiveAt ?? 0;
  if (now - last < 10000) return "writing";
  return "idle";
}

/** 상태별 M3 토큰 색 — 하드코딩 회피, 사이트 컨벤션 준수 */
export function liveColorVar(s: LiveStatus): string {
  return s === "submitted"
    ? "var(--md-sys-color-primary)"
    : s === "writing"
      ? "var(--md-sys-color-tertiary)"
      : s === "joined"
        ? "var(--md-sys-color-secondary)"
        : "var(--md-sys-color-outline)";
}
