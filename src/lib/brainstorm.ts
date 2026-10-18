// 브레인스토밍 활동 — 학생이 선생님 주제에 아이디어를 자유롭게 쓰면 땅따먹기 판에 말풍선으로 뜬다.
//
// classes/{cid}/lessons/{lid}/questions/{qid}                 활동(kind="brainstorm", 제목·본문 = 주제)
// classes/{cid}/lessons/{lid}/questions/{qid}/ideas/{ideaId}  아이디어 한 개 {uid, name, text, at}
//
// 권한(firestore.rules): 학급 구성원은 읽기, 본인 이름으로만 쓰기, 지우기는 본인·선생님.
//
// 여러 반 함께하기(섬 연결) — 반마다 자기 차시에 브레인스토밍 활동이 하나씩 있고(아이디어도 반마다 따로 저장),
// 그 활동들을 '세계' 하나로 묶어 한 바다에 반별 섬으로 보여 준다.
// brainstormWorlds/{wid}              {ownerId, islands:[{cid,lid,qid,name}], cids:[cid], createdAt}
// brainstormWorlds/{wid}/seats/{uid}  {cid} — 묶인 반의 구성원이 판을 열 때 스스로 앉는 자리.
//   다른 반 섬의 아이디어 읽기는 '그 반 활동이 이 세계를 가리키고 + 내 자리가 묶인 반 구성원'일 때만 허용된다.
import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { createQuestion, updateQuestion, type Question } from "@/lib/lessons";
import { getDbClient } from "@/lib/firebase";

export type Idea = { id: string; uid: string; name: string; text: string; at: number };

/** 아이디어 한 개 글자 수 · 학생 한 명이 낼 수 있는 아이디어 수 */
export const IDEA_MAX_LEN = 100;
export const IDEAS_PER_STUDENT = 20;

const ideasCol = (cid: string, lid: string, qid: string) =>
  collection(getDbClient(), "classes", cid, "lessons", lid, "questions", qid, "ideas");

export function brainstormUrl(cid: string, lid: string, qid: string) {
  return `/brainstorm/?class=${encodeURIComponent(cid)}&lesson=${encodeURIComponent(lid)}&q=${encodeURIComponent(qid)}`;
}

export function watchIdeas(cid: string, lid: string, qid: string, cb: (ideas: Idea[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(ideasCol(cid, lid, qid), snap => cb(snap.docs.map(d => {
    const v = d.data();
    // 방금 쓴 내 아이디어는 서버 시각이 오기 전까지 지금 시각으로 둔다
    return { id: d.id, uid: String(v.uid ?? ""), name: String(v.name ?? ""), text: String(v.text ?? ""), at: v.at?.toMillis?.() ?? Date.now() };
  }).sort((a, b) => a.at - b.at)), onError);
}

export async function addIdea(cid: string, lid: string, qid: string, uid: string, name: string, text: string) {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, IDEA_MAX_LEN);
  if (!clean) return;
  await addDoc(ideasCol(cid, lid, qid), { uid, name: name.slice(0, 60), text: clean, at: serverTimestamp() });
}

export async function deleteIdea(cid: string, lid: string, qid: string, id: string) {
  await deleteDoc(doc(ideasCol(cid, lid, qid), id));
}

/* ---------- 여러 반 섬 연결 ---------- */

export type Island = { cid: string; lid: string; qid: string; name: string };
/** shared: 학생에게 다른 반 섬 내용을 보여 줄지(선생님 토글, 처음엔 꺼짐 — 규칙에서도 막는다) */
export type BrainWorld = { id: string; ownerId: string; islands: Island[]; shared: boolean };
/** 한 세계에 묶을 수 있는 반 수 */
export const WORLD_MAX = 9;

const worldRef = (wid: string) => doc(getDbClient(), "brainstormWorlds", wid);

export function watchWorld(wid: string, cb: (w: BrainWorld | null) => void, onError?: (e: Error) => void) {
  return onSnapshot(worldRef(wid), snap => {
    if (!snap.exists()) { cb(null); return; }
    const v = snap.data();
    const islands = (Array.isArray(v.islands) ? v.islands : []).map((x: Record<string, unknown>) => ({
      cid: String(x.cid ?? ""), lid: String(x.lid ?? ""), qid: String(x.qid ?? ""), name: String(x.name ?? ""),
    })).filter((x: Island) => x.cid && x.lid && x.qid);
    cb({ id: snap.id, ownerId: String(v.ownerId ?? ""), islands, shared: v.shared === true });
  }, onError);
}

/** 다른 반 섬 보여 주기 켜기/끄기(세계를 만든 선생님만) */
export async function setWorldShared(wid: string, shared: boolean) {
  await setDoc(worldRef(wid), { shared }, { merge: true });
}

/** 판을 연 학생·선생님의 자리 — 이 반 구성원임을 세계에 알린다(다른 반 섬 읽기 권한의 근거). */
export async function ensureSeat(wid: string, uid: string, cid: string) {
  const ref = doc(getDbClient(), "brainstormWorlds", wid, "seats", uid);
  const cur = await getDoc(ref).catch(() => null);
  if (cur?.exists() && cur.data().cid === cid) return;
  await setDoc(ref, { cid });
}

/**
 * 다른 반에 같은 주제의 브레인스토밍을 열고 섬으로 잇는다.
 * 처음 잇는 거면 세계를 새로 만들고 지금 활동을 첫 섬으로 넣는다.
 */
export async function linkIsland(user: User, from: { cid: string; lid: string; question: Question; className: string }, to: { cid: string; lid: string; name: string }) {
  const db = getDbClient();
  // 화면의 활동 정보가 늦게 갱신됐을 수 있어 저장된 값을 다시 읽는다(세계를 두 번 만들지 않게)
  const fresh = await getDoc(doc(db, "classes", from.cid, "lessons", from.lid, "questions", from.question.id));
  let wid: string | undefined = typeof fresh.data()?.world === "string" && fresh.data()!.world ? fresh.data()!.world : undefined;
  if (!wid) {
    const ref = doc(collection(db, "brainstormWorlds"));
    await setDoc(ref, { ownerId: user.uid, islands: [{ cid: from.cid, lid: from.lid, qid: from.question.id, name: from.className }], cids: [from.cid], createdAt: serverTimestamp() });
    await updateQuestion(from.cid, from.lid, from.question.id, { world: ref.id });
    wid = ref.id;
  }
  const qid = await createQuestion(to.cid, to.lid, user, { phase: from.question.phase, kind: "brainstorm", title: from.question.title, text: from.question.text });
  await updateQuestion(to.cid, to.lid, qid, { world: wid, ...(from.question.published === false ? { published: false } : {}) });
  await runTransaction(db, async tx => {
    const snap = await tx.get(worldRef(wid!));
    const v = snap.data() ?? {};
    const islands = (v.islands ?? []) as Island[];
    if (islands.length >= WORLD_MAX) throw new Error(`섬은 ${WORLD_MAX}개까지 이을 수 있어요.`);
    tx.update(worldRef(wid!), { islands: [...islands, { cid: to.cid, lid: to.lid, qid, name: to.name }], cids: [...new Set([...(v.cids ?? []), to.cid])] });
  });
  return wid;
}

/** 섬 연결 끊기 — 그 반 활동과 아이디어는 그대로 남고, 한 반짜리 판으로 돌아간다. */
export async function unlinkIsland(wid: string, island: Island) {
  const db = getDbClient();
  await runTransaction(db, async tx => {
    const snap = await tx.get(worldRef(wid));
    const islands = ((snap.data()?.islands ?? []) as Island[]).filter(x => !(x.cid === island.cid && x.qid === island.qid));
    tx.update(worldRef(wid), { islands, cids: [...new Set(islands.map(x => x.cid))] });
  });
  await setDoc(doc(db, "classes", island.cid, "lessons", island.lid, "questions", island.qid), { world: deleteField() }, { merge: true });
}
