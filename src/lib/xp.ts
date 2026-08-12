// 게이미피케이션 — 학생 경험치(XP)/레벨 + 퀘스트(미션)
// 컬렉션:
//   classes/{cid}/xp/{uid}            : { xp, updatedAt }
//   classes/{cid}/xp/{uid}/log/{id}   : { amount, reason, by, at }  (지급 내역)
//   classes/{cid}/quests/{qid}        : 미션 + 학생별 완료 맵(completions)
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";
import type { ActivityKind } from "@/lib/lessons";

export type QuestTarget = "all" | "group" | "individual";

// 미션과 연계된 차시 활동(예: 캔버스 보드)
export type QuestLink = {
  lessonId: string;
  lessonTitle: string;
  activityId: string; // 활동(질문) id — 빈 문자열이면 차시 전체
  activityKind: ActivityKind;
  activityTitle: string;
};

// 연계 활동으로 바로 가는 경로
export function questLinkUrl(cid: string, link: QuestLink): string {
  if (link.activityKind === "canvas" && link.activityId)
    return `/canvas/?class=${cid}&lesson=${link.lessonId}&q=${link.activityId}`;
  return `/lesson/?class=${cid}&id=${link.lessonId}`;
}

export type Quest = {
  id: string;
  title: string;
  description: string;
  xp: number;
  targetType: QuestTarget;
  assigneeUids: string[];
  groupId?: string | null;
  groupName?: string | null;
  link?: QuestLink | null;
  createdBy: string;
  createdAt: number | null;
  completions: Record<string, { at: number; by: string }>;
};

const xpCol = (cid: string) => collection(getDbClient(), "classes", cid, "xp");
const xpDocRef = (cid: string, uid: string) =>
  doc(getDbClient(), "classes", cid, "xp", uid);
const questsCol = (cid: string) =>
  collection(getDbClient(), "classes", cid, "quests");
// 만보 지갑 — 양(+)의 XP 적립을 그대로 미러링한다(src/lib/manbo.ts 와 동일 경로).
const manboDocRef = (cid: string, uid: string) =>
  doc(getDbClient(), "classes", cid, "manbo", uid);

// ---------- 레벨 곡선 ----------
// 레벨업에 필요한 경험치: 첫 레벨업 100, 이후 레벨업마다 +10씩 증가.
//   Lv1→2:100  Lv2→3:110  Lv3→4:120 …
// 누적 임계값 T(n) = 100·(n-1) + 5·(n-1)·(n-2)
//   T(1)=0  T(2)=100  T(3)=210  T(4)=330 …
function thresholdAt(n: number): number {
  return 100 * (n - 1) + 5 * (n - 1) * (n - 2);
}
export function xpLevel(xp: number) {
  const x = Math.max(0, Math.floor(xp || 0));
  let level = 1;
  while (thresholdAt(level + 1) <= x) level++;
  const curStart = thresholdAt(level);
  const nextAt = thresholdAt(level + 1);
  const span = nextAt - curStart;
  const into = x - curStart;
  return {
    level,
    into,
    span,
    curStart,
    nextAt,
    remaining: nextAt - x,
    pct: span ? Math.min(1, into / span) : 0,
  };
}

// ---------- XP 읽기 ----------
export function watchXp(
  cid: string,
  cb: (map: Record<string, number>) => void
): () => void {
  return onSnapshot(
    xpCol(cid),
    (snap) => {
      const m: Record<string, number> = {};
      snap.docs.forEach((d) => {
        m[d.id] = (d.data().xp as number) ?? 0;
      });
      cb(m);
    },
    () => cb({})
  );
}

export async function getXp(cid: string, uid: string): Promise<number> {
  const s = await getDoc(xpDocRef(cid, uid));
  return s.exists() ? ((s.data().xp as number) ?? 0) : 0;
}

export async function getXpMap(
  cid: string
): Promise<Record<string, number>> {
  const snap = await getDocs(xpCol(cid));
  const m: Record<string, number> = {};
  snap.docs.forEach((d) => {
    m[d.id] = (d.data().xp as number) ?? 0;
  });
  return m;
}

export type XpLogEntry = {
  id: string;
  amount: number;
  reason: string;
  by: string;
  at: number | null;
};

export function watchXpLog(
  cid: string,
  uid: string,
  cb: (items: XpLogEntry[]) => void,
  max = 30
): () => void {
  return onSnapshot(
    collection(xpDocRef(cid, uid), "log"),
    (snap) => {
      const list = snap.docs.map((d) => {
        const v = d.data();
        const ts = v.at as { toMillis?: () => number } | undefined;
        return {
          id: d.id,
          amount: (v.amount as number) ?? 0,
          reason: (v.reason as string) ?? "",
          by: (v.by as string) ?? "",
          at: ts?.toMillis ? ts.toMillis() : null,
        };
      });
      list.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
      cb(list.slice(0, max));
    },
    () => cb([])
  );
}

export async function listXpLog(
  cid: string,
  uid: string,
  max = 30
): Promise<XpLogEntry[]> {
  const snap = await getDocs(collection(xpDocRef(cid, uid), "log"));
  const list = snap.docs.map((d) => {
    const v = d.data();
    const ts = v.at as { toMillis?: () => number } | undefined;
    return {
      id: d.id,
      amount: (v.amount as number) ?? 0,
      reason: (v.reason as string) ?? "",
      by: (v.by as string) ?? "",
      at: ts?.toMillis ? ts.toMillis() : null,
    };
  });
  list.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  return list.slice(0, max);
}

// ---------- XP 직접 지급(개별/전체/모둠) ----------
export async function grantXp(
  cid: string,
  uids: string[],
  amount: number,
  reason: string,
  by: string
): Promise<void> {
  const db = getDbClient();
  const targets = [...new Set(uids)].filter(Boolean);
  if (targets.length === 0 || !amount) return;
  const batch = writeBatch(db);
  for (const uid of targets) {
    const ref = xpDocRef(cid, uid);
    batch.set(
      ref,
      { uid, xp: increment(amount), updatedAt: serverTimestamp() },
      { merge: true }
    );
    const logRef = doc(collection(ref, "log"));
    batch.set(logRef, {
      amount,
      reason: reason || (amount >= 0 ? "경험치 지급" : "경험치 차감"),
      by,
      at: serverTimestamp(),
    });
    // 양(+)의 경험치 적립 시 같은 양의 만보를 함께 적립(병행 원장). 차감 시엔 손대지 않음.
    if (amount > 0) {
      const mRef = manboDocRef(cid, uid);
      batch.set(
        mRef,
        {
          uid,
          balance: increment(amount),
          earned: increment(amount),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      const mLogRef = doc(collection(mRef, "log"));
      batch.set(mLogRef, {
        type: "earn",
        amount,
        reason: reason || "경험치 적립",
        by,
        at: serverTimestamp(),
      });
    }
  }
  await batch.commit();
}

// ---------- 퀘스트 ----------
function mapQuest(id: string, v: Record<string, unknown>): Quest {
  const ts = v.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    title: (v.title as string) ?? "",
    description: (v.description as string) ?? "",
    xp: (v.xp as number) ?? 0,
    targetType: (v.targetType as QuestTarget) ?? "all",
    assigneeUids: Array.isArray(v.assigneeUids)
      ? (v.assigneeUids as string[])
      : [],
    groupId: (v.groupId as string) ?? null,
    groupName: (v.groupName as string) ?? null,
    link: (v.link as QuestLink) ?? null,
    createdBy: (v.createdBy as string) ?? "",
    createdAt: ts?.toMillis ? ts.toMillis() : null,
    completions:
      (v.completions as Record<string, { at: number; by: string }>) ?? {},
  };
}

export function watchQuests(
  cid: string,
  cb: (quests: Quest[]) => void
): () => void {
  return onSnapshot(
    questsCol(cid),
    (snap) => {
      const list = snap.docs.map((d) => mapQuest(d.id, d.data()));
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      cb(list);
    },
    () => cb([])
  );
}

export async function listQuests(cid: string): Promise<Quest[]> {
  const snap = await getDocs(questsCol(cid));
  const list = snap.docs.map((d) => mapQuest(d.id, d.data()));
  list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return list;
}

export async function createQuest(
  cid: string,
  data: {
    title: string;
    description: string;
    xp: number;
    targetType: QuestTarget;
    assigneeUids: string[];
    groupId?: string | null;
    groupName?: string | null;
    link?: QuestLink | null;
  },
  by: string
): Promise<string> {
  const ref = doc(questsCol(cid));
  await setDoc(ref, {
    title: data.title.trim() || "새 미션",
    description: data.description.trim(),
    xp: Math.max(0, Math.floor(data.xp || 0)),
    targetType: data.targetType,
    assigneeUids: [...new Set(data.assigneeUids)].filter(Boolean),
    groupId: data.groupId ?? null,
    groupName: data.groupName ?? null,
    link: data.link ?? null,
    createdBy: by,
    createdAt: serverTimestamp(),
    completions: {},
  });
  return ref.id;
}

export async function deleteQuest(cid: string, qid: string): Promise<void> {
  await deleteDoc(doc(questsCol(cid), qid));
}

// 학생별 미션 완료 토글 — 완료 시 보상 XP 지급, 취소 시 회수.
// 트랜잭션으로 서버의 최신 quest 를 다시 읽어 완료여부·보상을 확정하므로
// 동시 토글/보상 변경에도 XP 이중지급·잘못된 회수가 발생하지 않는다.
export async function toggleQuestComplete(
  cid: string,
  quest: Quest,
  uid: string,
  complete: boolean,
  by: string
): Promise<void> {
  const db = getDbClient();
  const qRef = doc(questsCol(cid), quest.id);
  const xpRef = xpDocRef(cid, uid);
  const logRef = doc(collection(xpRef, "log"));
  const mRef = manboDocRef(cid, uid);
  const mLogRef = doc(collection(mRef, "log"));
  await runTransaction(db, async (tx) => {
    const qSnap = await tx.get(qRef);
    if (!qSnap.exists()) return;
    const data = qSnap.data();
    const completions = (data.completions as Record<string, unknown>) ?? {};
    const already = !!completions[uid];
    if (complete === already) return; // 서버 기준으로도 변화 없음 → no-op
    const reward = typeof data.xp === "number" ? (data.xp as number) : 0;
    const delta = complete ? reward : -reward;
    const title = (data.title as string) ?? quest.title;
    tx.update(qRef, {
      [`completions.${uid}`]: complete ? { at: Date.now(), by } : deleteField(),
    });
    tx.set(
      xpRef,
      { uid, xp: increment(delta), updatedAt: serverTimestamp() },
      { merge: true }
    );
    tx.set(logRef, {
      amount: delta,
      reason: `${complete ? "미션 완료" : "미션 취소"}: ${title}`,
      by,
      at: serverTimestamp(),
    });
    // 양(+)의 보상 지급(미션 완료) 시에만 같은 양의 만보를 함께 적립. 회수(음수)는 만보 불변.
    if (delta > 0) {
      tx.set(
        mRef,
        {
          uid,
          balance: increment(delta),
          earned: increment(delta),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(mLogRef, {
        type: "earn",
        amount: delta,
        reason: `미션 완료: ${title}`,
        by,
        at: serverTimestamp(),
      });
    }
  });
}

// 미션 보상 변경 등으로 quest 문서만 갱신하고 싶을 때
export async function updateQuest(
  cid: string,
  qid: string,
  patch: Partial<Pick<Quest, "title" | "description" | "xp">>
): Promise<void> {
  await updateDoc(doc(questsCol(cid), qid), patch);
}

// ─────── 활동 → 학급 경험치 요청 커넥터 (외부 활동을 러닝크루와 연결) ───────
// classes/{cid}/xpRequests/{activity__uid}
//   { uid, activity, label, score, points, reason, status, studentName, createdAt }
// 학급 멤버(학생)가 활동 점수로 경험치를 요청 → 교사가 승인하면 grantXp 로 지급.
// (같은 프로젝트·같은 로그인이라 API 키 불필요 — 어떤 활동이든 requestClassXp 한 줄로 연결)
export type XpRequestStatus = "pending" | "granted" | "declined";
export type XpRequest = {
  id: string;
  uid: string;
  activity: string;
  label: string;
  score: number;
  points: number; // 요청 XP (= ceil(score/3))
  reason: string;
  status: XpRequestStatus;
  studentName: string;
  createdAt: number | null;
};

const xpReqCol = (cid: string) =>
  collection(getDbClient(), "classes", cid, "xpRequests");
const xpReqId = (activity: string, uid: string) =>
  `${activity.replace(/[^a-zA-Z0-9_-]/g, "_")}__${uid}`;
// 요청 경험치 상한 — 클라이언트가 임의 거액을 요청하지 못하도록 캡. 규칙에서도 동일 검증.
export const XP_REQ_CAP = 500;

/** 활동에서 학급 교사에게 경험치 요청. points 미지정 시 ceil(score/3). */
export async function requestClassXp(
  cid: string,
  uid: string,
  input: {
    activity: string;
    label?: string;
    score: number;
    points?: number;
    reason?: string;
    studentName?: string;
  }
): Promise<void> {
  // 점수·요청 XP를 정수·합리적 범위로 정규화(악용/오버플로 방지). 실제 지급도 서버에서 재클램프.
  const score = Math.max(0, Math.min(100000, Math.floor(input.score || 0)));
  const points = Math.max(
    0,
    Math.min(XP_REQ_CAP, Math.floor(input.points ?? Math.ceil(score / 3)))
  );
  // merge: true — 재요청 시에도 '누적 지급액(grantedPoints)'은 보존한다.
  // 이미 지급된 만큼은 다시 지급되지 않도록(이중 지급 차단) decideXpRequest 가 델타만 지급.
  await setDoc(
    doc(xpReqCol(cid), xpReqId(input.activity, uid)),
    {
      uid,
      activity: input.activity,
      label: input.label ?? input.activity,
      score,
      points,
      reason: input.reason ?? "",
      studentName: input.studentName ?? "",
      status: "pending",
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function toXpRequest(id: string, v: Record<string, unknown>): XpRequest {
  const ts = v.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    uid: (v.uid as string) ?? "",
    activity: (v.activity as string) ?? "",
    label: (v.label as string) ?? (v.activity as string) ?? "활동",
    score: (v.score as number) ?? 0,
    points: (v.points as number) ?? 0,
    reason: (v.reason as string) ?? "",
    status: (v.status as XpRequestStatus) ?? "pending",
    studentName: (v.studentName as string) ?? "",
    createdAt: ts?.toMillis ? ts.toMillis() : null,
  };
}

/** 내 경험치 요청(활동별) 상태 조회 */
export async function getMyXpRequest(
  cid: string,
  uid: string,
  activity: string
): Promise<XpRequest | null> {
  const d = await getDoc(doc(xpReqCol(cid), xpReqId(activity, uid)));
  return d.exists() ? toXpRequest(d.id, d.data()) : null;
}

/** 교사 실시간 구독(경험치 요청함) */
export function watchXpRequests(
  cid: string,
  cb: (reqs: XpRequest[]) => void
): () => void {
  return onSnapshot(
    xpReqCol(cid),
    (snap) =>
      cb(
        snap.docs
          .map((d) => toXpRequest(d.id, d.data()))
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      ),
    () => cb([])
  );
}

/**
 * 교사 승인 → XP 지급 + granted, 거절 → declined.
 * 트랜잭션으로 서버의 최신 요청을 다시 읽어 status==='pending' 일 때만 처리한다 →
 * 부분 실패 재시도/중복 클릭에도 XP가 두 번 지급되지 않는다(멱등). 지급액은
 * 서버 문서값을 다시 클램프(XP_REQ_CAP)해 클라이언트 조작도 무력화한다.
 */
export async function decideXpRequest(
  cid: string,
  req: XpRequest,
  approve: boolean,
  by: string
): Promise<void> {
  const db = getDbClient();
  const reqRef = doc(xpReqCol(cid), req.id);
  if (!approve) {
    await runTransaction(db, async (tx) => {
      const s = await tx.get(reqRef);
      if (!s.exists() || s.data().status !== "pending") return;
      tx.update(reqRef, { status: "declined" });
    });
    return;
  }
  const xpRef = xpDocRef(cid, req.uid);
  const logRef = doc(collection(xpRef, "log"));
  const mRef = manboDocRef(cid, req.uid);
  const mLogRef = doc(collection(mRef, "log"));
  await runTransaction(db, async (tx) => {
    const s = await tx.get(reqRef);
    if (!s.exists()) return;
    const d = s.data();
    // 요청액(서버 재클램프)에서 '이미 지급한 누계(grantedPoints)'를 뺀 차액만 지급한다.
    // → 같은 요청을 다시 승인하거나(status 리셋 등) 어떤 경로로 재처리돼도 누계가
    //   요청액을 넘지 않아 '30이 10번' 같은 이중/과지급이 원천 차단된다(불변식).
    const requested = Math.max(
      0,
      Math.min(XP_REQ_CAP, Math.floor((d.points as number) || 0))
    );
    const already = Math.max(0, Math.floor((d.grantedPoints as number) || 0));
    const delta = Math.max(0, requested - already);
    const label = (d.label as string) || (d.activity as string) || "활동";
    if (delta > 0) {
      tx.set(
        xpRef,
        { uid: req.uid, xp: increment(delta), updatedAt: serverTimestamp() },
        { merge: true }
      );
      tx.set(logRef, {
        amount: delta,
        reason: `활동 보상: ${label}`,
        by,
        at: serverTimestamp(),
      });
      tx.set(
        mRef,
        {
          uid: req.uid,
          balance: increment(delta),
          earned: increment(delta),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(mLogRef, {
        type: "earn",
        amount: delta,
        reason: `활동 보상: ${label}`,
        by,
        at: serverTimestamp(),
      });
    }
    tx.update(reqRef, { status: "granted", grantedPoints: already + delta });
  });
}
