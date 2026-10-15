// 브레인스토밍 활동 — 학생이 선생님 주제에 아이디어를 자유롭게 쓰면 땅따먹기 판에 말풍선으로 뜬다.
//
// classes/{cid}/lessons/{lid}/questions/{qid}                 활동(kind="brainstorm", 제목·본문 = 주제)
// classes/{cid}/lessons/{lid}/questions/{qid}/ideas/{ideaId}  아이디어 한 개 {uid, name, text, at}
//
// 권한(firestore.rules): 학급 구성원은 읽기, 본인 이름으로만 쓰기, 지우기는 본인·선생님.
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
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
