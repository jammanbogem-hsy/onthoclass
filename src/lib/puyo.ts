import { collection, deleteField, doc, getDocFromServer, getDocs, onSnapshot, runTransaction, query, where, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDbClient, getFunctionsClient } from "@/lib/firebase";
import type { GameLink } from "@/lib/games";
import { parseState, type PuyoState } from "@/lib/puyo-engine";
import { normalizeRules, type PuyoPlan, type PuyoRules } from "@/lib/puyo-rules";
import { normalizeQuiz, type PuyoQuiz } from "@/lib/puyo-quiz";
import { LEAGUE_MAX_ROUNDS, LEAGUE_MIN_ROUNDS, type PuyoLeague } from "@/lib/puyo-league";

export type PuyoPlayer = { uid: string; name: string; teacher: boolean };
export type PuyoResult = { winner: string | null; reason: "topout" | "time" | "disconnect" | "teacher"; scores: Record<string, number>; at: number; reward?: { uid: string; xp: number } };
/** a·b 는 예전 1:1 호환(=ids[0]·ids[1]). 4인 모둠은 ids 에 2~4명. */
export type PuyoMatch = { id: string; a: string; b: string; ids?: string[]; seed: number; result: PuyoResult | null };
/** 이 판에 함께 겨루는 사람들 — 1:1·모둠·예전 기록 모두 같은 방법으로 읽는다. */
export const matchIds = (m: Pick<PuyoMatch, "a" | "b" | "ids">) => (m.ids && m.ids.length >= 2 ? m.ids : [m.a, m.b]);
export type PuyoConfig = Partial<Omit<PuyoRules, "durationSec">> & { durationSec: number; round?: number; prevResting?: string[]; carry?: string[]; resting?: { uid: string; name: string }[]; realtime?: boolean; startsAt?: number; endsAt?: number; players?: PuyoPlayer[]; rosterIds?: string[]; matches?: PuyoMatch[]; quiz?: PuyoQuiz; league?: PuyoLeague };
export type PuyoPresence = { uid: string; name: string; online: boolean; at: number };
export type PuyoRun = { uid: string; score: number; sent: number; maxChain: number; lost: boolean; seq: number; at: number; state: PuyoState | null };
const path = (cid: string, gid: string) => `classes/${cid}/games/${gid}`;
export const puyoUrl = (cid: string, gid: string) => `/puyo/?class=${encodeURIComponent(cid)}&game=${encodeURIComponent(gid)}`;

/** 다음 판으로 넘겨 줄 정보: 몇 번째 판인지, 직전에 쉰 친구(먼저 짝 받기), 직전 참가자(대기실 미리 체크). */
export type PuyoRoundCarry = { round: number; prevResting: string[]; carry: string[] };
/** 리그 새로 시작 — id 는 첫 판 게임 id 를 쓰지 않고 따로 만든다(판마다 같은 값으로 이어짐). */
export function newLeague(total: number, name: string): PuyoLeague {
  const n = Math.max(LEAGUE_MIN_ROUNDS, Math.min(LEAGUE_MAX_ROUNDS, Math.round(total) || LEAGUE_MIN_ROUNDS));
  return { id: "lg_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36), name: name.trim().slice(0, 40) || "뿌요뿌요 리그", round: 1, total: n };
}
export async function createPuyoGame(cid: string, by: string, rules: Partial<PuyoRules>, link: GameLink = { name: "뿌요뿌요" }, carry?: PuyoRoundCarry, quiz?: PuyoQuiz | null, league?: PuyoLeague | null) {
  const ref = doc(collection(getDbClient(), "classes", cid, "games"));
  const batch = writeBatch(getDbClient());
  // 문제 풀기: 쓸 수 있는 문항이 있을 때만 저장(없으면 일반 대전)
  const q = normalizeQuiz(quiz);
  batch.set(ref, { kind: "puyo", status: "draft", by, link, puyo: { ...normalizeRules(rules), round: carry?.round ?? 1, prevResting: carry?.prevResting ?? [], carry: carry?.carry ?? [], ...(q ? { quiz: q } : {}), ...(league ? { league } : {}) }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
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
/** 서버에 저장된 내 경기 상태의 순번(저장 순번 재동기화용). */
export async function readPuyoSeq(cid: string, gid: string, uid: string) {
  const snap = await getDocFromServer(doc(getDbClient(), path(cid, gid), "puyoStates", uid));
  return Number(snap.data()?.seq ?? 0);
}
export async function startPuyo(cid: string, gid: string, plan: PuyoPlan) {
  return (await httpsCallable(getFunctionsClient(), "puyoStart")({ cid, gid, pairs: plan.pairs, resting: plan.resting })).data;
}
/** 같은 규칙으로 한 판 더 — 새 대기실을 열고 학급의 활성 게임을 옮긴다(학생은 자동으로 따라온다). */
export async function nextPuyoRound(cid: string, by: string, prev: { link: GameLink; puyo?: PuyoConfig }) {
  const p = prev.puyo;
  const resting = (p?.resting ?? []).map(r => r.uid);
  const played = (p?.players ?? []).filter(x => !x.teacher).map(x => x.uid);
  // 리그 중이면 다음 판으로(마지막 판 뒤의 '한 판 더'는 리그 밖의 일반 경기)
  const league = p?.league && p.league.round < p.league.total ? { ...p.league, round: p.league.round + 1 } : null;
  return createPuyoGame(cid, by, normalizeRules(p), prev.link, { round: (p?.round ?? 1) + 1, prevResting: resting, carry: [...played, ...resting] }, p?.quiz, league);
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

/** 같은 리그의 게임(판)들 — 판 순서대로. 대기실(겹침 피하기)·리그 순위·대시보드가 쓴다. */
export async function listLeagueGames(cid: string, leagueId: string) {
  const snap = await getDocs(query(collection(getDbClient(), "classes", cid, "games"), where("puyo.league.id", "==", leagueId)));
  return snap.docs.map(d => ({ id: d.id, status: d.data().status as string, puyo: d.data().puyo as PuyoConfig }))
    .filter(g => g.puyo?.league?.id === leagueId)
    .sort((a, b) => (a.puyo.league!.round - b.puyo.league!.round));
}
/** 한 판의 모든 학생 최종 상태(한 번 읽기) — 대시보드 문제 분석용. */
export async function getPuyoRuns(cid: string, gid: string): Promise<PuyoRun[]> {
  const snap = await getDocs(collection(getDbClient(), path(cid, gid), "puyoStates"));
  return snap.docs.map(d => { const data = d.data(); return { ...data, uid: d.id, at: data.at?.toMillis?.() ?? 0, state: parseState(data.state) } as PuyoRun; });
}
