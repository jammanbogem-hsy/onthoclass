import { getApp } from "firebase/app";
import { connectDatabaseEmulator, getDatabase, get, onValue, ref, set, serverTimestamp, type Database } from "firebase/database";
import { getDbClient } from "./firebase";
import { parseState, type PuyoState } from "./puyo-engine";
import type { PuyoRun } from "./puyo";
let database: Database | undefined;
export const PUYO_LIVE_INTERVAL_MS = 100;
export function getPuyoDatabase() {
  if (database) return database;
  getDbClient();
  const emulated = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
  database = getDatabase(getApp(), emulated ? "https://demo-puyo-default-rtdb.firebaseio.com" : "https://jammanboeng-default-rtdb.asia-southeast1.firebasedatabase.app");
  if (emulated) connectDatabaseEmulator(database, "127.0.0.1", 9000);
  return database;
}
const board = (cid: string, gid: string, uid: string) => ref(getPuyoDatabase(), `puyo/${cid}/${gid}/boards/${uid}`);
function run(uid: string, data: Record<string, unknown> | null): PuyoRun | null {
  const state = parseState(data?.state);
  if (!state || typeof data?.at !== "number" || state.score !== data.score || state.sent !== data.sent) return null;
  return { uid, state, score: state.score, sent: state.sent, maxChain: state.maxChain, lost: state.phase === "over", seq: 0, at: data.at };
}
export async function getPuyoLive(cid: string, gid: string, uid: string) {
  return run(uid, (await get(board(cid, gid, uid))).val());
}
export function watchPuyoLive(cid: string, gid: string, uid: string, cb: (run: PuyoRun | null) => void) {
  return onValue(board(cid, gid, uid), snap => cb(run(uid, snap.val())), () => cb(null));
}
export async function savePuyoLive(cid: string, gid: string, uid: string, state: PuyoState) {
  await set(board(cid, gid, uid), { state: JSON.stringify(state), score: state.score, sent: state.sent, lost: state.phase === "over", maxChain: state.maxChain, at: serverTimestamp() });
}
export function watchPuyoConnection(cb: (connected: boolean) => void) {
  return onValue(ref(getPuyoDatabase(), ".info/connected"), snap => cb(snap.val() === true));
}

// ── 자유 대전 보드(puyoFree/{cid}/{roomId}/{uid}) ─────────────────────────────
const freeBoard = (cid: string, room: string, uid: string) => ref(getPuyoDatabase(), `puyoFree/${cid}/${room}/${uid}`);
export function watchFreeLive(cid: string, room: string, uid: string, cb: (run: PuyoRun | null) => void) {
  return onValue(freeBoard(cid, room, uid), snap => cb(run(uid, snap.val())), () => cb(null));
}
export async function saveFreeLive(cid: string, room: string, uid: string, state: PuyoState) {
  await set(freeBoard(cid, room, uid), { state: JSON.stringify(state), score: state.score, sent: state.sent, lost: false, maxChain: state.maxChain, at: serverTimestamp() });
}
