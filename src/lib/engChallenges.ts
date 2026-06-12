// 5단원 3차시 길찾기 챌린지 — Firestore 데이터 레이어 (LMS 학급과 분리).
//   engActivities/5-3/challenges/{cid}                 ← 공개: 지도+시작점+안내문
//   engActivities/5-3/challenges/{cid}/private/answer  ← 비공개 정답(목적지)
//   engActivities/5-3/challenges/{cid}/solvers/{uid}   ← 정답 맞힌 사람(만든이/교사만 열람)
// 채점은 보안 규칙이 비공개 answer 를 get()으로 대조 → 클라우드 함수 불필요.
// 점수는 도출값: (내가 만든 챌린지의 정답자 수 + 내가 맞힌 수) × POINTS_PER_SOLVE.
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";
import {
  ACTIVITY_ID,
  POINTS_PER_SOLVE,
  type Challenge,
  type DirectionEnding,
  type DirectionStep,
  type GridSize,
  type Player,
  type Solver,
  type Start,
} from "@/app/eng/5-3/types";

// ─────────────────── 참가자 식별 (학교 + 6학년 반) ───────────────────
function playerRef(uid: string) {
  return doc(getDbClient(), "engActivities", ACTIVITY_ID, "players", uid);
}
/** 내 참가자 식별 조회 (없으면 null → 시작 전 학교·반 입력 필요) */
export async function getPlayer(uid: string): Promise<Player | null> {
  const d = await getDoc(playerRef(uid));
  if (!d.exists()) return null;
  const v = d.data();
  return {
    uid,
    schoolName: (v.schoolName as string) ?? "",
    classNo: (v.classNo as number) ?? 0,
  };
}
/** 참가자 식별 저장 (학교명 + 6학년 반) */
export async function savePlayer(
  uid: string,
  schoolName: string,
  classNo: number
): Promise<void> {
  await setDoc(
    playerRef(uid),
    { uid, schoolName, classNo, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

function challengesCol() {
  return collection(getDbClient(), "engActivities", ACTIVITY_ID, "challenges");
}

export type NewChallenge = {
  gridSize: GridSize;
  board: (string | null)[];
  start: Start; // 가장자리 진입 화살표(건물 아님)
  steps: DirectionStep[];
  ending: DirectionEnding;
  destination: string; // 정답(목적지 place id)
};

/** 챌린지 생성: 공개 문서 + 비공개 정답 문서를 한 배치로 저장. 생성 id 반환. */
// 공개 문서에는 실명(creatorName)을 저장하지 않는다 — 글로벌 컬렉션이라 로그인한
// 누구에게나 노출되던 PII 누수 차단. 작성자 식별은 creatorUid(불투명)만.
export async function createChallenge(
  uid: string,
  data: NewChallenge,
  player?: { schoolName?: string; classNo?: number }
): Promise<string> {
  const db = getDbClient();
  const ref = doc(challengesCol());
  const answerRef = doc(db, ref.path, "private", "answer");
  const batch = writeBatch(db);
  batch.set(ref, {
    creatorUid: uid,
    gridSize: data.gridSize,
    board: data.board,
    start: data.start,
    steps: data.steps,
    ending: data.ending,
    destination: data.destination, // 목적지 공개 — 푸는 학생이 지도에서 목표 확인
    schoolName: player?.schoolName ?? "", // 같은 반 친구만 풀도록 필터
    classNo: player?.classNo ?? 0,
    createdAt: serverTimestamp(),
  });
  // creatorUid 를 함께 저장 → 규칙이 같은 배치의 challenge 문서를 get() 하지 않아도
  // 소유권을 검증/제한할 수 있다(배치 내 문서는 규칙 get 으로 안 보임).
  batch.set(answerRef, { destination: data.destination, creatorUid: uid });
  await batch.commit();
  return ref.id;
}

function toChallenge(id: string, v: Record<string, unknown>): Challenge {
  return {
    id,
    creatorUid: v.creatorUid as string,
    gridSize: v.gridSize as GridSize,
    board: (v.board as (string | null)[]) ?? [],
    start: v.start as Start,
    steps: (v.steps as DirectionStep[]) ?? [],
    ending: v.ending as DirectionEnding,
    destination: (v.destination as string) ?? "",
    schoolName: (v.schoolName as string) ?? "",
    classNo: (v.classNo as number) ?? 0,
    createdAt: v.createdAt,
  };
}

/** 모든 챌린지(최신순). */
export async function listChallenges(): Promise<Challenge[]> {
  const snap = await getDocs(query(challengesCol(), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => toChallenge(d.id, d.data()));
}

/** 내가 만든 챌린지. */
export async function listMyChallenges(uid: string): Promise<Challenge[]> {
  const snap = await getDocs(query(challengesCol(), where("creatorUid", "==", uid)));
  return snap.docs.map((d) => toChallenge(d.id, d.data()));
}

function solverRef(cid: string, uid: string) {
  return doc(getDbClient(), "engActivities", ACTIVITY_ID, "challenges", cid, "solvers", uid);
}
function toSolver(v: Record<string, unknown>): Solver {
  return {
    uid: v.uid as string,
    steps: (v.steps as DirectionStep[]) ?? [],
    ending: (v.ending as DirectionEnding) ?? null,
    status: (v.status as Solver["status"]) ?? "pending",
    creatorMark: (v.creatorMark as Solver["creatorMark"]) ?? null,
    schoolName: (v.schoolName as string) ?? "",
    classNo: (v.classNo as number) ?? 0,
    createdAt: v.createdAt,
  };
}

/** 특정 챌린지의 제출 목록(출제자/교사만). 다중 솔버 탭 채점용. */
export async function listSolvers(challengeId: string): Promise<Solver[]> {
  const snap = await getDocs(
    collection(getDbClient(), "engActivities", ACTIVITY_ID, "challenges", challengeId, "solvers")
  );
  return snap.docs.map((d) => toSolver(d.data()));
}

/** 제출 실시간 구독(출제자 채점 화면) */
export function watchSolvers(
  challengeId: string,
  cb: (solvers: Solver[]) => void
): () => void {
  return onSnapshot(
    collection(getDbClient(), "engActivities", ACTIVITY_ID, "challenges", challengeId, "solvers"),
    (snap) => cb(snap.docs.map((d) => toSolver(d.data()))),
    () => cb([])
  );
}

/** 푼 학생이 작성한 길안내문 제출(pending). 재제출하면 갱신(다시 대기). */
export async function submitSolution(
  cid: string,
  uid: string,
  steps: DirectionStep[],
  ending: DirectionEnding | null,
  player?: { schoolName?: string; classNo?: number }
): Promise<void> {
  await setDoc(solverRef(cid, uid), {
    uid,
    steps,
    ending: ending ?? null,
    status: "pending",
    creatorMark: null,
    schoolName: player?.schoolName ?? "",
    classNo: player?.classNo ?? 0,
    createdAt: serverTimestamp(),
  });
}

/** 내 제출(상태 확인) */
export async function getMySolve(cid: string, uid: string): Promise<Solver | null> {
  const d = await getDoc(solverRef(cid, uid));
  return d.exists() ? toSolver(d.data()) : null;
}

/** 출제자 1차 체크 — creatorMark 만 변경(규칙으로 강제). */
export async function setCreatorMark(
  cid: string,
  solverUid: string,
  ok: boolean
): Promise<void> {
  await setDoc(solverRef(cid, solverUid), { creatorMark: ok ? "ok" : "no" }, { merge: true });
}

/** 교사 확정 — status 확정(정답 처리/반려). */
export async function confirmSolve(
  cid: string,
  solverUid: string,
  approved: boolean
): Promise<void> {
  await setDoc(
    solverRef(cid, solverUid),
    { status: approved ? "approved" : "rejected" },
    { merge: true }
  );
}

export type MySolve = { challengeId: string; status: Solver["status"] };

/** 내가 제출한 챌린지들(collectionGroup) + 상태. 실패해도 throw 하지 않고 [] 반환
 *  (collectionGroup 권한/인덱스 이슈가 점수·채점 화면 전체를 막지 않도록). */
export async function listMySolves(uid: string): Promise<MySolve[]> {
  try {
    const snap = await getDocs(
      query(collectionGroup(getDbClient(), "solvers"), where("uid", "==", uid))
    );
    return snap.docs.map((d) => ({
      challengeId: d.ref.parent.parent?.id ?? "",
      status: (d.data().status as Solver["status"]) ?? "pending",
    }));
  } catch (e) {
    console.error("listMySolves(collectionGroup) 실패", e);
    return [];
  }
}

export type MyScore = {
  points: number;
  createdSolvedCount: number; // 내 챌린지가 '정답 확정'된 횟수
  solvedCount: number; // 내가 푼 것 중 '정답 확정' 수
};

/** 내 점수 — 교사가 확정한(approved) 것만 점수에 반영. 실패해도 0점으로 반환(화면 안 멈춤). */
export async function getMyScore(uid: string): Promise<MyScore> {
  try {
    // collectionGroup(solvers) 질의는 solvers read 규칙(solverUid==uid)을 정적으로
    // 만족하지 못해 거부된다 → 풀기 탭과 동일하게 챌린지별 getMySolve 로 도출한다.
    const [mine, all] = await Promise.all([
      listMyChallenges(uid).catch(() => [] as Challenge[]),
      listChallenges().catch(() => [] as Challenge[]),
    ]);
    // 내가 만든 챌린지가 '정답 확정'된 횟수
    const counts = await Promise.all(
      mine.map((c) => listSolvers(c.id).catch(() => [] as Solver[]))
    );
    const createdSolvedCount = counts.reduce(
      (a, s) => a + s.filter((x) => x.status === "approved").length,
      0
    );
    // 내가 푼 것 중 '정답 확정' 수 — 내 것이 아닌 챌린지마다 본인 제출 문서를 조회.
    const others = all.filter((c) => c.creatorUid !== uid);
    const solves = await Promise.all(
      others.map((c) => getMySolve(c.id, uid).catch(() => null))
    );
    const solvedCount = solves.filter(
      (s) => s && s.status === "approved"
    ).length;
    return {
      points: (createdSolvedCount + solvedCount) * POINTS_PER_SOLVE,
      createdSolvedCount,
      solvedCount,
    };
  } catch (e) {
    console.error("getMyScore 실패", e);
    return { points: 0, createdSolvedCount: 0, solvedCount: 0 };
  }
}

/** 비공개 정답 조회(만든이/교사만). 미리보기·교사 확인용. */
export async function getAnswer(challengeId: string): Promise<string | null> {
  const snap = await getDoc(
    doc(getDbClient(), "engActivities", ACTIVITY_ID, "challenges", challengeId, "private", "answer")
  );
  return snap.exists() ? ((snap.data().destination as string) ?? null) : null;
}
