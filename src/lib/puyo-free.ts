// 뿌요뿌요 자유 대전 — 쉬는 시간에 학생끼리 1:1. 경험치·만보 보상 없음, 서버 함수 없음.
//   classes/{cid}/control/puyoFree   : { enabled } 교사 잠금 스위치
//   classes/{cid}/puyoFree/{roomId}  : 방(wait → play → done)
//   RTDB puyoFree/{cid}/{roomId}/{uid}: 경기 중 보드(실시간)
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, limit, runTransaction, serverTimestamp, setDoc, updateDoc, type Timestamp } from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";

export const FREE_SEC = 120;
export const FREE_READY_MS = 6000;
/** 방이 이만큼 오래 기다리면 목록에서 뺀다(방장이 창을 닫은 경우 등). */
export const FREE_WAIT_TTL_MS = 10 * 60 * 1000;

export type FreeRoom = {
  id: string; host: string; hostName: string; status: "wait" | "play" | "done"; seed: number;
  createdAt: number; guest?: string; guestName?: string; startedAt?: number;
  scores?: Record<string, number>; winner?: string | null;
};

const ms = (v: unknown) => (v as Timestamp | undefined)?.toMillis?.() ?? 0;
function mapRoom(id: string, d: Record<string, unknown>): FreeRoom {
  return { ...(d as Omit<FreeRoom, "id" | "createdAt" | "startedAt">), id, createdAt: ms(d.createdAt), startedAt: d.startedAt ? ms(d.startedAt) : undefined };
}
/** 경기 시작·종료 시각(서버 시각 ms). */
export const freeTimes = (r: FreeRoom) => {
  const startsAt = (r.startedAt ?? 0) + FREE_READY_MS;
  return { startsAt, endsAt: startsAt + FREE_SEC * 1000 };
};

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
export function watchFreeRoom(cid: string, id: string, cb: (room: FreeRoom | null) => void) {
  return onSnapshot(doc(roomsCol(cid), id), s => cb(s.exists() ? mapRoom(s.id, s.data()) : null), () => cb(null));
}
export async function createFreeRoom(cid: string, host: string, hostName: string) {
  const ref = doc(roomsCol(cid));
  await setDoc(ref, { host, hostName, status: "wait", seed: Math.floor(Math.random() * 2147483646) + 1, createdAt: serverTimestamp() });
  return ref.id;
}
/** 참가 — 두 명이 동시에 눌러도 한 명만 들어가도록 트랜잭션. */
export async function joinFreeRoom(cid: string, id: string, guest: string, guestName: string) {
  const ref = doc(roomsCol(cid), id);
  await runTransaction(getDbClient(), async tx => {
    const s = await tx.get(ref);
    if (!s.exists() || s.data().status !== "wait") throw new Error("이미 시작했거나 없어진 방이에요.");
    if (s.data().host === guest) throw new Error("내가 만든 방이에요.");
    tx.update(ref, { guest, guestName, status: "play", startedAt: serverTimestamp() });
  });
}
export async function cancelFreeRoom(cid: string, id: string) {
  await deleteDoc(doc(roomsCol(cid), id));
}
export async function finishFreeRoom(cid: string, id: string, scores: Record<string, number>, winner: string | null) {
  await updateDoc(doc(roomsCol(cid), id), { status: "done", scores, winner });
}
