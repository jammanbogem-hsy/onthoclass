import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Timestamp, FieldValue, getFirestore } from "firebase-admin/firestore";
import { getDatabaseWithUrl } from "firebase-admin/database";
import { randomInt } from "node:crypto";
import { decide, normalizeRules, pairPlayers, validatePlan, type Match, type Run } from "./puyoLogic";

const liveDb = () => getDatabaseWithUrl(process.env.FIREBASE_DATABASE_EMULATOR_HOST ? "https://demo-puyo-default-rtdb.firebaseio.com" : "https://jammanboeng-default-rtdb.asia-southeast1.firebasedatabase.app");
const options = { region: "asia-northeast3", maxInstances: 10, timeoutSeconds: 30 };
function ids(data: unknown) {
  const { cid, gid } = (data || {}) as { cid?: string; gid?: string };
  if (!cid || !gid || !/^[\w-]{1,128}$/.test(cid) || !/^[\w-]{1,128}$/.test(gid)) throw new HttpsError("invalid-argument", "학급과 게임을 확인해 주세요.");
  return { cid, gid };
}
export const puyoClock = onCall(options, async request => {
  const cid = request.data?.cid;
  if (!request.auth || typeof cid !== "string" || !/^[\w-]{1,128}$/.test(cid)) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const member = await getFirestore().doc(`classes/${cid}/members/${request.auth.uid}`).get();
  if (!member.exists) throw new HttpsError("permission-denied", "학급 구성원만 입장할 수 있습니다.");
  return { now: Date.now() };
});
export const puyoStart = onCall(options, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const { cid, gid } = ids(request.data); const uid = request.auth.uid;
  const db = getFirestore(); const ref = db.doc(`classes/${cid}/games/${gid}`);
  const outcome = await db.runTransaction(async tx => {
    const teacher = await tx.get(db.doc(`classes/${cid}/members/${uid}`));
    if (teacher.data()?.role !== "teacher") throw new HttpsError("permission-denied", "선생님만 경기를 시작할 수 있습니다.");
    const game = await tx.get(ref); const data = game.data();
    if (data?.kind !== "puyo" || data.status !== "draft") throw new HttpsError("failed-precondition", "이미 시작되었거나 종료된 게임입니다.");
    // 교사가 게임을 열 때 정한 규칙(제한 시간·짝 방식·홀수 처리·보상)을 서버 범위로 다시 맞춘다.
    const rules = normalizeRules(data.puyo);
    const duration = rules.durationSec;
    // 대기실에서 확정한 대진표(pairs)를 우선 쓰고, 예전 클라이언트(students)는 서버가 무작위로 짝짓는다.
    let pairs: string[][]; let resting: string[] = [];
    try {
      if (request.data.pairs !== undefined) ({ pairs, resting } = validatePlan(request.data.pairs, request.data.resting, uid, rules));
      else {
        const students = request.data.students;
        if (!Array.isArray(students) || students.some(s => typeof s !== "string" || !/^[\w-]{1,128}$/.test(s))) throw new Error("학생 선택을 확인해 주세요.");
        pairs = pairPlayers(students, uid, () => randomInt(0, 1000000) / 1000000);
      }
    } catch (e) { throw new HttpsError("invalid-argument", (e as Error).message); }
    const roster = pairs.flat();
    const docs = await tx.getAll(...roster.map(id => db.doc(`classes/${cid}/members/${id}`)), ...roster.map(id => ref.collection("puyoPresence").doc(id)));
    const restDocs = resting.length ? await tx.getAll(...resting.map(id => db.doc(`classes/${cid}/members/${id}`))) : [];
    if (restDocs.some(d => d.data()?.role !== "student")) throw new HttpsError("failed-precondition", "쉬는 친구 정보를 확인해 주세요.");
    const now = Date.now();
    const players = roster.map((id, i) => {
      const member = docs[i].data(); const live = docs[i + roster.length].data();
      if (!member || (id !== uid && member.role !== "student") || !live?.online || now - (live.at?.toMillis() ?? 0) > 18000) throw new HttpsError("failed-precondition", `${member?.displayName || "선택한 학생"}의 접속이 끊겼습니다. 다시 선택해 주세요.`);
      return { uid: id, name: member.displayName || (id === uid ? "선생님" : "학생"), teacher: id === uid };
    });
    const startsAt = now + 6000; const endsAt = startsAt + duration * 1000;
    const matches: Match[] = pairs.map(([a, b], i) => ({ id: `m${i + 1}`, a, b, seed: randomInt(1, 2147483647), result: null }));
    for (const id of roster) tx.set(ref.collection("puyoStates").doc(id), { uid: id, score: 0, sent: 0, maxChain: 0, lost: false, seq: 0, state: "", at: FieldValue.serverTimestamp() });
    tx.update(ref, { status: "play", "puyo.players": players, "puyo.rosterIds": roster, "puyo.resting": resting.map(id => ({ uid: id, name: restDocs[resting.indexOf(id)].data()?.displayName || "학생" })), "puyo.matches": matches, "puyo.startsAt": startsAt, "puyo.endsAt": endsAt, playStartedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { startsAt, endsAt, matches };
  });
  try {
    const pairs = Object.fromEntries(outcome.matches.flatMap(m => [[m.a, m.id], [m.b, m.id]]));
    await liveDb().ref(`puyo/${cid}/${gid}`).set({ meta: { teacher: uid, players: pairs, startsAt: outcome.startsAt, endsAt: outcome.endsAt } });
    await ref.update({ "puyo.realtime": true });
  } catch (e) { console.warn("Puyo realtime unavailable; using durable fallback", (e as Error).message); }
  return outcome;
});
export const puyoFinish = onCall(options, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const { cid, gid } = ids(request.data); const uid = request.auth.uid;
  const db = getFirestore(); const ref = db.doc(`classes/${cid}/games/${gid}`);
  const outcome = await db.runTransaction(async tx => {
    const member = await tx.get(db.doc(`classes/${cid}/members/${uid}`));
    if (!member.exists) throw new HttpsError("permission-denied", "학급 구성원만 결과를 볼 수 있습니다.");
    const manual = request.data.manual === true;
    if (manual && member.data()?.role !== "teacher") throw new HttpsError("permission-denied", "선생님만 종료할 수 있습니다.");
    const snap = await tx.get(ref); const g = snap.data();
    if (g?.kind !== "puyo") throw new HttpsError("not-found", "뿌요뿌요 게임이 없습니다.");
    if (g.status !== "play") return { done: g.status === "done" };
    const matches = g.puyo.matches as Match[]; const roster = g.puyo.rosterIds as string[];
    const docs = await tx.getAll(...roster.map(id => ref.collection("puyoStates").doc(id)));
    // The fast channel is also the final score source; a slow checkpoint ACK
    // must not erase the last second of play. Writes expire before time judging.
    const frames = g.puyo.realtime ? await liveDb().ref(`puyo/${cid}/${gid}/boards`).get().then(s => s.val() as Record<string, { score: number; sent: number; lost: boolean; maxChain: number; state: string; at: number }> | null).catch(() => null) : null;
    const runs = new Map(docs.map(d => {
      const saved = d.data() as Run; const live = frames?.[d.id];
      return [d.id, live ? { ...saved, score: Math.max(saved.score ?? 0, live.score), lost: !!saved.lost || !!live.lost, at: Timestamp.fromMillis(Math.max(saved.at?.toMillis() ?? 0, live.at)) } : saved];
    }));
    const now = Date.now(); let changed = false;
    const next = matches.map(m => {
      if (m.result) return m;
      const result = decide(m, runs.get(m.a) ?? {}, runs.get(m.b) ?? {}, now, g.puyo.startsAt, g.puyo.endsAt, manual);
      if (result) { changed = true; return { ...m, result }; } return m;
    });
    // Resolve and pay in one transaction. Deterministic logs also guard retries
    // if a teacher later restores a game document from an older snapshot.
    const winXp = normalizeRules(g.puyo).winXp;
    const winners = winXp > 0 ? next.filter((m, i) => !matches[i].result && m.result?.winner) : [];
    const rewardDocs = winners.length ? await tx.getAll(
      ...winners.map(m => db.doc(`classes/${cid}/members/${m.result!.winner}`)),
      ...winners.map(m => db.doc(`classes/${cid}/xp/${m.result!.winner}/log/puyo_${gid}_${m.id}`)),
    ) : [];
    winners.forEach((m, i) => {
      const winner = m.result!.winner!;
      const player = (g.puyo.players as { uid: string; teacher: boolean }[]).find(p => p.uid === winner);
      if (!player || player.teacher || rewardDocs[i].data()?.role !== "student") return;
      m.result!.reward = { uid: winner, xp: winXp };
      if (rewardDocs[i + winners.length].exists) return;
      const xp = db.doc(`classes/${cid}/xp/${winner}`);
      const wallet = db.doc(`classes/${cid}/manbo/${winner}`);
      const logId = `puyo_${gid}_${m.id}`;
      const log = { amount: winXp, reason: "뿌요뿌요 승리", by: "system:puyo", gameId: gid, matchId: m.id, at: FieldValue.serverTimestamp() };
      tx.set(xp, { uid: winner, xp: FieldValue.increment(winXp), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.create(xp.collection("log").doc(logId), log);
      // Existing positive-XP rewards also credit the parallel 만보 wallet.
      tx.set(wallet, { uid: winner, balance: FieldValue.increment(winXp), earned: FieldValue.increment(winXp), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(wallet.collection("log").doc(logId), { ...log, type: "earn" });
    });
    for (const m of next) {
      if (!m.result || matches.find(old => old.id === m.id)?.result) continue;
      for (const id of [m.a, m.b]) {
        const live = frames?.[id]; const saved = docs.find(d => d.id === id)?.data();
        if (live && live.at >= (saved?.at?.toMillis() ?? 0)) tx.update(ref.collection("puyoStates").doc(id), {
          score: live.score, sent: live.sent, lost: live.lost ?? false, maxChain: live.maxChain ?? 0, state: live.state, at: Timestamp.fromMillis(live.at),
        });
      }
    }
    const done = next.every(m => !!m.result);
    if (changed) tx.update(ref, { "puyo.matches": next, status: done ? "done" : "play", updatedAt: FieldValue.serverTimestamp() });
    return { done, matches: next };
  });
  if (outcome.done) await liveDb().ref(`puyo/${cid}/${gid}`).remove().catch(() => {});
  return outcome;
});
