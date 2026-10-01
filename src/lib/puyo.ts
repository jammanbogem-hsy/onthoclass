import { collection, deleteField, doc, onSnapshot, runTransaction, query, where, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDbClient, getFunctionsClient } from "@/lib/firebase";
import type { GameLink } from "@/lib/games";
import { parseState, type PuyoState } from "@/lib/puyo-engine";
import { normalizeRules, type PuyoPlan, type PuyoRules } from "@/lib/puyo-rules";

export type PuyoPlayer = { uid: string; name: string; teacher: boolean };
export type PuyoResult = { winner: string | null; reason: "topout" | "time" | "disconnect" | "teacher"; scores: Record<string, number>; at: number; reward?: { uid: string; xp: number } };
export type PuyoMatch = { id: string; a: string; b: string; seed: number; result: PuyoResult | null };
export type PuyoConfig = Partial<Omit<PuyoRules, "durationSec">> & { durationSec: number; round?: number; prevResting?: string[]; carry?: string[]; resting?: { uid: string; name: string }[]; realtime?: boolean; startsAt?: number; endsAt?: number; players?: PuyoPlayer[]; rosterIds?: string[]; matches?: PuyoMatch[] };
export type PuyoPresence = { uid: string; name: string; online: boolean; at: number };
export type PuyoRun = { uid: string; score: number; sent: number; maxChain: number; lost: boolean; seq: number; at: number; state: PuyoState | null };
const path = (cid: string, gid: string) => `classes/${cid}/games/${gid}`;
export const puyoUrl = (cid: string, gid: string) => `/puyo/?class=${encodeURIComponent(cid)}&game=${encodeURIComponent(gid)}`;

/** 다음 판으로 넘겨 줄 정보: 몇 번째 판인지, 직전에 쉰 친구(먼저 짝 받기), 직전 참가자(대기실 미리 체크). */
export type PuyoRoundCarry = { round: number; prevResting: string[]; carry: string[] };
export async function createPuyoGame(cid: string, by: string, rules: Partial<PuyoRules>, link: GameLink = { name: "뿌요뿌요" }, carry?: PuyoRoundCarry) {
  const ref = doc(collection(getDbClient(), "classes", cid, "games"));
  const batch = writeBatch(getDbClient());
  batch.set(ref, { kind: "puyo", status: "draft", by, link, puyo: { ...normalizeRules(rules), round: carry?.round ?? 1, prevResting: carry?.prevResting ?? [], carry: carry?.carry ?? [] }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(doc(getDbClient(), "classes", cid, "control", "game"), { gameId: ref.id, at: serverTimestamp() });
  await batch.commit(); return ref.id;
}
export function presence(cid: string, gid: string, uid: string, name: string) {
  const ref = doc(getDbClient(), path(cid, gid), "puyoPresence", uid);
  let active = true;
  const send = (online = true) => setDoc(ref, { uid, name, online, at: serverTimestamp() }).catch(() => {});
  void send(); const timer = setInterval(() => { if (active) void send(); }, 6000);
  const pagehide = () => { void send(false); };
  window.addEventListener("pagehide", pagehide);
  return () => { active = false; clearInterval(timer); window.removeEventListener("pagehide", pagehide); void send(false); };
}
export function watchPuyoPresence(cid: string, gid: string, cb: (players: PuyoPresence[]) => void, error?: (e: Error) => void) {
  return onSnapshot(collection(getDbClient(), path(cid, gid), "puyoPresence"), snap => cb(snap.docs.map(d => ({ ...d.data(), uid: d.id, at: d.data().at?.toMillis?.() ?? 0 } as PuyoPresence))), error);
}
export function watchPuyoRuns(cid: string, gid: string, cb: (players: PuyoRun[]) => void, error?: (e: Error) => void, onlyUids?: string[]) {
  const col = collection(getDbClient(), path(cid, gid), "puyoStates");
  return onSnapshot(onlyUids?.length ? query(col, where("uid", "in", onlyUids)) : col, snap => cb(snap.docs.map(d => {
    const data = d.data(); const state = parseState(data.state);
    return { ...data, uid: d.id, at: data.at?.toMillis?.() ?? 0, state } as PuyoRun;
  })), error);
}
export async function savePuyoRun(cid: string, gid: string, uid: string, state: PuyoState, seq: number) {
  await setDoc(doc(getDbClient(), path(cid, gid), "puyoStates", uid), {
    uid, score: state.score, sent: state.sent, maxChain: state.maxChain, lost: state.phase === "over", seq,
    state: JSON.stringify(state), at: serverTimestamp(),
  });
}
/** 대기실에서 확정한 대진표로 시작한다. 서버가 규칙(홀수 처리·인원)과 접속 상태를 다시 확인한다. */
export async function startPuyo(cid: string, gid: string, plan: PuyoPlan) {
  return (await httpsCallable(getFunctionsClient(), "puyoStart")({ cid, gid, pairs: plan.pairs, resting: plan.resting })).data;
}
/** 같은 규칙으로 한 판 더 — 새 대기실을 열고 학급의 활성 게임을 옮긴다(학생은 자동으로 따라온다). */
export async function nextPuyoRound(cid: string, by: string, prev: { link: GameLink; puyo?: PuyoConfig }) {
  const p = prev.puyo;
  const resting = (p?.resting ?? []).map(r => r.uid);
  const played = (p?.players ?? []).filter(x => !x.teacher).map(x => x.uid);
  return createPuyoGame(cid, by, normalizeRules(p), prev.link, { round: (p?.round ?? 1) + 1, prevResting: resting, carry: [...played, ...resting] });
}
export async function finishPuyo(cid: string, gid: string, manual = false) {
  return (await httpsCallable(getFunctionsClient(), "puyoFinish")({ cid, gid, manual })).data;
}
export async function puyoClock(cid: string) {
  const before = Date.now();
  const data = (await httpsCallable<{ cid: string }, { now: number }>(getFunctionsClient(), "puyoClock")({ cid })).data;
  return data.now - (before + Date.now()) / 2;
}

export async function leavePuyoRoom(cid: string, gid: string) {
  const db = getDbClient(); const control = doc(db, "classes", cid, "control", "game");
  await runTransaction(db, async tx => {
    const current = await tx.get(control);
    // Viewing an old result must never dismiss a newer classroom game.
    if (current.data()?.gameId === gid) tx.update(control, { gameId: deleteField(), at: serverTimestamp() });
  });
}
