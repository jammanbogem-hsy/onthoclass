// 뿌요뿌요 자유 대전 — 쉬는 시간에 학생끼리 2~4명. 경험치·만보 보상 없음, 서버 함수 없음.
//   classes/{cid}/control/puyoFree   : { enabled } 교사 잠금 스위치
//   classes/{cid}/puyoFree/{roomId}  : 방(wait → play → done), members = { uid: 이름 } 최대 4명
//   RTDB puyoFree/{cid}/{roomId}/{uid}: 경기 중 보드(실시간)
// 공격은 '모두에게 똑같이' — 내가 보낸 방해 뿌요를 나머지 모두가 같은 양만큼 받는다.
import { collection, deleteDoc, deleteField, doc, onSnapshot, orderBy, query, limit, runTransaction, serverTimestamp, setDoc, updateDoc, type Timestamp } from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";

export const FREE_SEC = 120;
export const FREE_READY_MS = 6000;
export const FREE_MAX = 4;
/** 방이 이만큼 오래 기다리면 목록에서 뺀다(방장이 창을 닫은 경우 등). */
export const FREE_WAIT_TTL_MS = 10 * 60 * 1000;

export type FreeRoom = {
  id: string; host: string; hostName: string; status: "wait" | "play" | "done"; seed: number;
  createdAt: number; members: Record<string, string>; startedAt?: number;
  scores?: Record<string, number>; winner?: string | null;
};

const ms = (v: unknown) => (v as Timestamp | undefined)?.toMillis?.() ?? 0;
function mapRoom(id: string, d: Record<string, unknown>): FreeRoom {
  const members = (d.members && typeof d.members === "object" ? d.members : {}) as Record<string, string>;
  return { ...(d as Omit<FreeRoom, "id" | "createdAt" | "startedAt" | "members">), id, members, createdAt: ms(d.createdAt), startedAt: d.startedAt ? ms(d.startedAt) : undefined };
}
/** 자리 순서 — 방장이 첫째, 나머지는 uid 순(모든 화면에서 같게). */
export const seats = (r: FreeRoom) => [r.host, ...Object.keys(r.members).filter(u => u !== r.host).sort()];
/** 경기 시작·종료 시각(서버 시각 ms). */
export const freeTimes = (r: FreeRoom) => {
  const startsAt = (r.startedAt ?? 0) + FREE_READY_MS;
  return { startsAt, endsAt: startsAt + FREE_SEC * 1000 };
};
/** 점수 순위 — 같은 점수는 같은 등수. */
export function standings(scores: Record<string, number>, ids: string[]) {
  const sorted = [...ids].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
  return sorted.map(uid => ({ uid, score: scores[uid] ?? 0, rank: 1 + sorted.filter(o => (scores[o] ?? 0) > (scores[uid] ?? 0)).length }));
}

const switchRef = (cid: string) => doc(getDbClient(), "classes", cid, "control", "puyoFree");
export function watchFreeOpen(cid: string, cb: (open: boolean) => void) {
  return onSnapshot(switchRef(cid), s => cb(s.data()?.enabled === true), () => cb(false));
}
export async function setFreeOpen(cid: string, enabled: boolean) {
  await setDoc(switchRef(cid), { enabled, at: serverTimestamp() });
}

const roomsCol = (cid: string) => collection(getDbClient(), "classes", cid, "puyoFree");
export function watchFreeRooms(cid: string, cb: (rooms: FreeRoom[]) => void, error?: (e: Error) => void) {
  return onSnapshot(query(roomsCol(cid), orderBy("createdAt", "desc"), limit(60)), s => cb(s.docs.map(d => mapRoom(d.id, d.data()))), error);
}
export async function createFreeRoom(cid: string, host: string, hostName: string) {
  const ref = doc(roomsCol(cid));
  await setDoc(ref, { host, hostName, status: "wait", seed: Math.floor(Math.random() * 2147483646) + 1, members: { [host]: hostName }, createdAt: serverTimestamp() });
  return ref.id;
}
/** 참가 — 여러 명이 동시에 눌러도 4명을 넘지 않도록 트랜잭션. */
export async function joinFreeRoom(cid: string, id: string, uid: string, name: string) {
  const ref = doc(roomsCol(cid), id);
  await runTransaction(getDbClient(), async tx => {
    const s = await tx.get(ref);
    const d = s.data();
    if (!s.exists() || d?.status !== "wait") throw new Error("이미 시작했거나 없어진 방이에요.");
    const members = (d.members ?? {}) as Record<string, string>;
    if (members[uid]) return;
    if (Object.keys(members).length >= FREE_MAX) throw new Error("방이 꽉 찼어요(최대 4명).");
    tx.update(ref, { [`members.${uid}`]: name });
  });
}
/** 기다리는 방에서 나가기(방장이 아닌 사람). */
export async function leaveFreeRoom(cid: string, id: string, uid: string) {
  await updateDoc(doc(roomsCol(cid), id), { [`members.${uid}`]: deleteField() });
}
/** 방장이 시작 — 시작 시각은 서버 시각으로만 기록된다. */
export async function startFreeRoom(cid: string, id: string) {
  await updateDoc(doc(roomsCol(cid), id), { status: "play", startedAt: serverTimestamp() });
}
export async function cancelFreeRoom(cid: string, id: string) {
  await deleteDoc(doc(roomsCol(cid), id));
}
export async function finishFreeRoom(cid: string, id: string, scores: Record<string, number>, winner: string | null) {
  await updateDoc(doc(roomsCol(cid), id), { status: "done", scores, winner });
}
