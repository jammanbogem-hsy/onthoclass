// 아이디어 섬 — 러닝크루 학급과 따로 돌아가는 땅따먹기 브레인스토밍(별도 사이트 /idea).
// 진행자(구글 로그인)가 세션을 열면 참여 코드·QR 이 생기고, 참여자는 닉네임만 넣고(익명 로그인) 들어온다.
//
// ideaSessions/{sid}                 {ownerId, ownerName, title, detail, code, size(30|60|100), status("open"|"closed"), createdAt}
// ideaSessions/{sid}/players/{uid}   {name, at}               참여자 본인이 만든다(열린 세션만)
// ideaSessions/{sid}/ideas/{uid_n}   {uid, name, text, at}    문서 이름 = 본인uid_번호(0~19) → 한 사람 최대 20개(규칙으로 강제)
// ideaCodes/{code}                   {sid, ownerId}           6자리 참여 코드 → 세션
//
// 권한(firestore.rules): 세션 만들기는 구글 로그인 계정만, 고치기·마감은 진행자만.
// 참여 코드를 아는 로그인 사용자(익명 포함)는 세션·참여자·아이디어를 읽을 수 있다.
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { signInAnonymously, type User } from "firebase/auth";
import { getAuthClient, getDbClient } from "@/lib/firebase";
import { IDEA_MAX_LEN, IDEAS_PER_STUDENT, type Idea } from "@/lib/brainstorm";

export type IdeaSession = {
  id: string; ownerId: string; ownerName: string; title: string; detail: string;
  code: string; size: number; status: "open" | "closed"; createdAt: number;
};
export type Player = { uid: string; name: string; at: number };

/** 예상 인원(판 크기) 고르기 */
export const SESSION_SIZES = [30, 60, 100] as const;
export const NAME_MAX = 12;
export const TITLE_MAX = 80;
export const DETAIL_MAX = 300;
/** 한 세션에 들어올 수 있는 사람 수(화면·성능 기준, 화면에서만 막는다) */
export const PLAYER_CAP = 150;

const db = () => getDbClient();
const sessionRef = (sid: string) => doc(db(), "ideaSessions", sid);

const toSession = (id: string, v: Record<string, unknown>): IdeaSession => ({
  id, ownerId: String(v.ownerId ?? ""), ownerName: String(v.ownerName ?? ""), title: String(v.title ?? ""), detail: String(v.detail ?? ""),
  code: String(v.code ?? ""), size: Number(v.size ?? 30), status: v.status === "closed" ? "closed" : "open",
  createdAt: (v.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
});

/** 참여 주소 — QR 에 담는다 */
export const joinUrl = (code: string) => `${typeof window === "undefined" ? "" : window.location.origin}/idea/?c=${code}`;

/** 새 세션 — 겹치지 않는 6자리 코드를 잡을 때까지 몇 번 다시 뽑는다. */
export async function createSession(user: User, title: string, detail: string, size: number) {
  const ref = doc(collection(db(), "ideaSessions"));
  for (let tries = 0; tries < 8; tries++) {
    const code = String(100000 + Math.floor(Math.random() * 900000));
    try {
      await runTransaction(db(), async tx => {
        const c = doc(db(), "ideaCodes", code);
        if ((await tx.get(c)).exists()) throw new Error("taken");
        tx.set(ref, {
          ownerId: user.uid, ownerName: (user.displayName || "진행자").slice(0, 40), title: title.trim().slice(0, TITLE_MAX), detail: detail.trim().slice(0, DETAIL_MAX),
          code, size, status: "open", createdAt: serverTimestamp(),
        });
        tx.set(c, { sid: ref.id, ownerId: user.uid });
      });
      return ref.id;
    } catch (e) {
      if (e instanceof Error && e.message === "taken") continue;
      throw e;
    }
  }
  throw new Error("참여 코드를 만들지 못했어요. 다시 해 주세요.");
}

export function watchSession(sid: string, cb: (s: IdeaSession | null) => void, onError?: (e: Error) => void) {
  return onSnapshot(sessionRef(sid), snap => cb(snap.exists() ? toSession(snap.id, snap.data()) : null), onError);
}

export function watchMySessions(uid: string, cb: (list: IdeaSession[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(query(collection(db(), "ideaSessions"), where("ownerId", "==", uid)),
    snap => cb(snap.docs.map(d => toSession(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)), onError);
}

export async function updateSession(sid: string, patch: Partial<Pick<IdeaSession, "title" | "detail" | "status">>) {
  await updateDoc(sessionRef(sid), patch);
}

/** 세션 지우기 — 아이디어·참여자·코드까지 모두(진행자만) */
export async function deleteSession(s: IdeaSession) {
  for (const sub of ["ideas", "players"]) {
    const snap = await getDocs(collection(db(), "ideaSessions", s.id, sub));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = writeBatch(db());
      snap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
      await b.commit();
    }
  }
  const b = writeBatch(db());
  b.delete(doc(db(), "ideaCodes", s.code));
  b.delete(sessionRef(s.id));
  await b.commit();
}

/** 참여자 로그인 — 이미 로그인돼 있으면(진행자가 직접 시험해 볼 때 등) 그 계정을 그대로 쓴다. */
export async function ensureGuest(): Promise<User> {
  const auth = getAuthClient();
  await auth.authStateReady();
  return auth.currentUser ?? (await signInAnonymously(auth)).user;
}

/** 6자리 코드 → 세션 id (없으면 null) */
export async function resolveCode(code: string) {
  const snap = await getDoc(doc(db(), "ideaCodes", code));
  return snap.exists() ? String(snap.data().sid ?? "") || null : null;
}

export function watchPlayers(sid: string, cb: (list: Player[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(collection(db(), "ideaSessions", sid, "players"), snap => cb(snap.docs.map(d => ({
    uid: d.id, name: String(d.data().name ?? ""), at: d.data().at?.toMillis?.() ?? Date.now(),
  })).sort((a, b) => a.at - b.at)), onError);
}

export async function joinSession(sid: string, uid: string, name: string) {
  await setDoc(doc(db(), "ideaSessions", sid, "players", uid), { name: name.trim().slice(0, NAME_MAX), at: serverTimestamp() });
}

export async function removePlayer(sid: string, uid: string) {
  await deleteDoc(doc(db(), "ideaSessions", sid, "players", uid));
}

export function watchSessionIdeas(sid: string, cb: (ideas: Idea[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(collection(db(), "ideaSessions", sid, "ideas"), snap => cb(snap.docs.map(d => {
    const v = d.data();
    return { id: d.id, uid: String(v.uid ?? ""), name: String(v.name ?? ""), text: String(v.text ?? ""), at: v.at?.toMillis?.() ?? Date.now() };
  }).sort((a, b) => a.at - b.at)), onError);
}

/** 아이디어 쓰기 — 내 아이디어 번호 중 비어 있는 가장 작은 번호 자리에 쓴다(지운 자리는 다시 쓸 수 있다). */
export async function addSessionIdea(sid: string, uid: string, name: string, text: string, mine: Idea[]) {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, IDEA_MAX_LEN);
  if (!clean) return;
  const used = new Set(mine.map(i => i.id));
  let n = 0; while (n < IDEAS_PER_STUDENT && used.has(`${uid}_${n}`)) n++;
  if (n >= IDEAS_PER_STUDENT) throw new Error(`아이디어는 ${IDEAS_PER_STUDENT}개까지 쓸 수 있어요.`);
  await setDoc(doc(db(), "ideaSessions", sid, "ideas", `${uid}_${n}`), { uid, name: name.slice(0, NAME_MAX), text: clean, at: serverTimestamp() });
}

export async function deleteSessionIdea(sid: string, id: string) {
  await deleteDoc(doc(db(), "ideaSessions", sid, "ideas", id));
}

/** 결과 내려받기(엑셀에서 한글이 깨지지 않게 BOM) */
export function ideasCsv(s: IdeaSession, ideas: Idea[]) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const time = (t: number) => new Date(t).toLocaleString("ko-KR", { hour12: false });
  const rows = [["번호", "이름", "아이디어", "쓴 시각"], ...ideas.map((i, k) => [String(k + 1), i.name, i.text, time(i.at)])];
  const body = "﻿" + `${q("주제")},${q(s.title)}\n\n` + rows.map(r => r.map(q).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `아이디어섬-${s.title.slice(0, 20).replace(/[\\/:*?"<>|]/g, "") || s.code}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
