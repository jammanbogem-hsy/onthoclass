// 무한 캔버스 문서 — classes/{cid}/canvas/{docId}
// 카드(텍스트/링크) + 화살표 연결. 옵시디언/JSON Canvas와 유사한 평면 모델.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDbClient } from "@/lib/firebase";

export type CardKind = "text" | "link";

export type CardNode = {
  id: string;
  kind: CardKind;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  url?: string;
  color?: string | null;
  authorUid?: string;
  authorName?: string;
  page?: string; // 소속 페이지 id (없으면 첫 페이지)
};

export type CardEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  page?: string;
};

export type CanvasPage = {
  id: string;
  name: string;
  color?: string | null; // 탭 색상 (없으면 기본)
  pattern?: string | null; // 탭 패턴: none|dots|stripes|grid|checker
};

export type CanvasDoc = {
  id: string;
  name: string;
  pages: CanvasPage[];
  nodes: CardNode[];
  edges: CardEdge[];
  groupColorMode?: boolean; // 모둠별 카드 색 구분(교사 토글)
  updatedAt: number | null;
};

// lid 가 있으면 차시별 보드, 없으면 학급 레벨 캔버스
const canvasCol = (cid: string, lid?: string) =>
  lid
    ? collection(getDbClient(), "classes", cid, "lessons", lid, "canvas")
    : collection(getDbClient(), "classes", cid, "canvas");

function mapDoc(id: string, v: Record<string, unknown>): CanvasDoc {
  const ts = v.updatedAt as { toMillis?: () => number } | undefined;
  const nodes = Array.isArray(v.nodes) ? (v.nodes as CardNode[]) : [];
  const edges = Array.isArray(v.edges) ? (v.edges as CardEdge[]) : [];
  let pages = Array.isArray(v.pages) ? (v.pages as CanvasPage[]) : [];
  if (pages.length === 0) pages = [{ id: "p1", name: "1페이지" }];
  return {
    id,
    name: (v.name as string) ?? "캔버스",
    pages,
    nodes,
    edges,
    groupColorMode: !!v.groupColorMode,
    updatedAt: ts?.toMillis ? ts.toMillis() : null,
  };
}

export async function getCanvas(
  cid: string,
  docId: string
): Promise<CanvasDoc | null> {
  const d = await getDoc(doc(canvasCol(cid), docId));
  return d.exists() ? mapDoc(d.id, d.data()) : null;
}

export async function listCanvas(cid: string): Promise<CanvasDoc[]> {
  const snap = await getDocs(canvasCol(cid));
  return snap.docs
    .map((d) => mapDoc(d.id, d.data()))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export async function ensureCanvas(
  cid: string,
  docId: string,
  name: string,
  lid?: string
): Promise<void> {
  const ref = doc(canvasCol(cid, lid), docId);
  const s = await getDoc(ref);
  if (!s.exists()) {
    await setDoc(ref, {
      name,
      pages: [{ id: "p1", name: "1페이지" }],
      nodes: [],
      edges: [],
      updatedAt: serverTimestamp(),
    });
  }
}

export async function saveCanvas(
  cid: string,
  docId: string,
  patch: Partial<
    Pick<CanvasDoc, "name" | "pages" | "nodes" | "edges" | "groupColorMode">
  >,
  lid?: string
): Promise<void> {
  await setDoc(
    doc(canvasCol(cid, lid), docId),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export function watchCanvas(
  cid: string,
  docId: string,
  cb: (d: CanvasDoc | null) => void,
  lid?: string
): () => void {
  return onSnapshot(
    doc(canvasCol(cid, lid), docId),
    (snap) => cb(snap.exists() ? mapDoc(snap.id, snap.data()) : null),
    () => cb(null)
  );
}

/* ---------- 카드 피드백: 댓글 + 반응(추천/공감) ----------
   카드 문서(노드 배열)와 분리된 서브컬렉션에 저장하고,
   보드 전체를 단일 리스너로 구독해 카드별로 필터링한다. */

export type ReactionType = "like" | "empathy" | "great";

export const REACTIONS: {
  type: ReactionType;
  icon: string;
  label: string;
  color: string;
}[] = [
  { type: "like", icon: "thumb_up", label: "추천", color: "#4f7cff" },
  { type: "empathy", icon: "favorite", label: "공감", color: "#ef4444" },
  { type: "great", icon: "star", label: "최고", color: "#f5a623" },
];

export type Feedback = {
  id: string;
  kind: "comment" | "reaction";
  cardId: string;
  uid: string;
  name: string;
  photo: string;
  text?: string;
  type?: ReactionType;
  createdAt: number | null;
};

const feedbackCol = (cid: string, docId: string, lid?: string) =>
  collection(doc(canvasCol(cid, lid), docId), "feedback");

export function watchFeedback(
  cid: string,
  docId: string,
  cb: (items: Feedback[]) => void,
  lid?: string
): () => void {
  return onSnapshot(
    feedbackCol(cid, docId, lid),
    (snap) => {
      const list = snap.docs.map((d) => {
        const v = d.data();
        const ts = v.createdAt as { toMillis?: () => number } | undefined;
        return {
          id: d.id,
          kind: (v.kind as "comment" | "reaction") ?? "comment",
          cardId: (v.cardId as string) ?? "",
          uid: (v.uid as string) ?? "",
          name: (v.name as string) ?? "",
          photo: (v.photo as string) ?? "",
          text: (v.text as string) ?? "",
          type: v.type as ReactionType | undefined,
          createdAt: ts?.toMillis ? ts.toMillis() : null,
        } as Feedback;
      });
      cb(list);
    },
    () => cb([])
  );
}

export async function addComment(
  cid: string,
  docId: string,
  cardId: string,
  user: { uid: string; name: string; photo: string },
  text: string,
  lid?: string
): Promise<void> {
  if (!text.trim()) return;
  const ref = doc(feedbackCol(cid, docId, lid));
  await setDoc(ref, {
    kind: "comment",
    cardId,
    uid: user.uid,
    name: user.name,
    photo: user.photo,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
}

export async function deleteFeedback(
  cid: string,
  docId: string,
  fid: string,
  lid?: string
): Promise<void> {
  await deleteDoc(doc(feedbackCol(cid, docId, lid), fid));
}

// 반응 토글 — (카드,사용자,종류)당 1개. 켜면 생성, 끄면 삭제.
export async function toggleReaction(
  cid: string,
  docId: string,
  cardId: string,
  user: { uid: string; name: string; photo: string },
  type: ReactionType,
  on: boolean,
  lid?: string
): Promise<void> {
  const id = `r_${cardId}_${user.uid}_${type}`;
  const ref = doc(feedbackCol(cid, docId, lid), id);
  if (on) {
    await setDoc(ref, {
      kind: "reaction",
      cardId,
      uid: user.uid,
      name: user.name,
      photo: user.photo,
      type,
      createdAt: serverTimestamp(),
    });
  } else {
    await deleteDoc(ref);
  }
}

// User 객체에서 작성자 표시 정보 추출 (호출부 편의)
export function actorOf(
  user: User | null,
  profileName?: string,
  profileAvatar?: string
): { uid: string; name: string; photo: string } {
  return {
    uid: user?.uid ?? "",
    name: profileName || user?.displayName || "익명",
    photo: profileAvatar || user?.photoURL || "",
  };
}
