import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { randomInt } from "node:crypto";
import { decide, pairPlayers, type Match, type Run } from "./puyoLogic";

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
  const students = request.data.students;
  if (!Array.isArray(students) || students.some(s => typeof s !== "string" || !/^[\w-]{1,128}$/.test(s))) throw new HttpsError("invalid-argument", "학생 선택을 확인해 주세요.");
  let pairs: string[][];
  try { pairs = pairPlayers(students, uid, () => randomInt(0, 1000000) / 1000000); }
  catch (e) { throw new HttpsError("invalid-argument", (e as Error).message); }
  const roster = pairs.flat(); const db = getFirestore(); const ref = db.doc(`classes/${cid}/games/${gid}`);
  return db.runTransaction(async tx => {
    const teacher = await tx.get(db.doc(`classes/${cid}/members/${uid}`));
    if (teacher.data()?.role !== "teacher") throw new HttpsError("permission-denied", "선생님만 경기를 시작할 수 있습니다.");
    const game = await tx.get(ref); const data = game.data();
    if (data?.kind !== "puyo" || data.status !== "draft") throw new HttpsError("failed-precondition", "이미 시작되었거나 종료된 게임입니다.");
    const duration = data.puyo?.durationSec;
    if (!Number.isInteger(duration) || duration < 60 || duration > 900) throw new HttpsError("invalid-argument", "제한 시간은 1~15분입니다.");
    const docs = await tx.getAll(...roster.map(id => db.doc(`classes/${cid}/members/${id}`)), ...roster.map(id => ref.collection("puyoPresence").doc(id)));
    const now = Date.now();
    const players = roster.map((id, i) => {
      const member = docs[i].data(); const live = docs[i + roster.length].data();
      if (!member || (id !== uid && member.role !== "student") || !live?.online || now - (live.at?.toMillis() ?? 0) > 18000) throw new HttpsError("failed-precondition", `${member?.displayName || "선택한 학생"}의 접속이 끊겼습니다. 다시 선택해 주세요.`);
      return { uid: id, name: member.displayName || (id === uid ? "선생님" : "학생"), teacher: id === uid };
    });
    const startsAt = now + 6000; const endsAt = startsAt + duration * 1000;
    const matches: Match[] = pairs.map(([a, b], i) => ({ id: `m${i + 1}`, a, b, seed: randomInt(1, 2147483647), result: null }));
    for (const id of roster) tx.set(ref.collection("puyoStates").doc(id), { uid: id, score: 0, sent: 0, maxChain: 0, lost: false, seq: 0, state: "", at: FieldValue.serverTimestamp() });
    tx.update(ref, { status: "play", "puyo.players": players, "puyo.rosterIds": roster, "puyo.matches": matches, "puyo.startsAt": startsAt, "puyo.endsAt": endsAt, playStartedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { startsAt, endsAt, matches };
  });
});
export const puyoFinish = onCall(options, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const { cid, gid } = ids(request.data); const uid = request.auth.uid;
  const db = getFirestore(); const ref = db.doc(`classes/${cid}/games/${gid}`);
  return db.runTransaction(async tx => {
    const member = await tx.get(db.doc(`classes/${cid}/members/${uid}`));
    if (!member.exists) throw new HttpsError("permission-denied", "학급 구성원만 결과를 볼 수 있습니다.");
    const manual = request.data.manual === true;
    if (manual && member.data()?.role !== "teacher") throw new HttpsError("permission-denied", "선생님만 종료할 수 있습니다.");
    const snap = await tx.get(ref); const g = snap.data();
    if (g?.kind !== "puyo") throw new HttpsError("not-found", "뿌요뿌요 게임이 없습니다.");
    if (g.status !== "play") return { done: g.status === "done" };
    const matches = g.puyo.matches as Match[]; const roster = g.puyo.rosterIds as string[];
    const docs = await tx.getAll(...roster.map(id => ref.collection("puyoStates").doc(id)));
    const runs = new Map(docs.map(d => [d.id, d.data() as Run]));
    const now = Date.now(); let changed = false;
    const next = matches.map(m => {
      if (m.result) return m;
      const result = decide(m, runs.get(m.a) ?? {}, runs.get(m.b) ?? {}, now, g.puyo.startsAt, g.puyo.endsAt, manual);
      if (result) { changed = true; return { ...m, result }; } return m;
    });
    const done = next.every(m => !!m.result);
    if (changed) tx.update(ref, { "puyo.matches": next, status: done ? "done" : "play", updatedAt: FieldValue.serverTimestamp() });
    return { done, matches: next };
  });
});
