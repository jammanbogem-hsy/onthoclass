// 무한 캔버스 문서 — classes/{cid}/canvas/{docId}
// 카드(텍스트/링크) + 화살표 연결. 옵시디언/JSON Canvas와 유사한 평면 모델.
//
// [v2 동시편집 모델] 카드/연결을 부모 doc 의 배열이 아니라 "카드별 문서"로 분리.
//   canvas/{docId}/nodes/{nodeId}, canvas/{docId}/edges/{edgeId}
//   → 20명이 동시에 편집해도 서로의 카드를 덮어쓰지 않고(클로버 제거),
//     변경된 카드만 스냅샷으로 전파되어 렉이 크게 준다.
//   부모 doc 은 메타(name/pages/groupColorMode/schema/updatedAt)만 보관.
//   schema>=2 = v2 마이그레이션 완료. 레거시 배열(nodes/edges)은 마이그레이션 시 비운다.
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import type { DocumentReference } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDbClient } from "@/lib/firebase";
import type { Attachment } from "@/lib/lessons";

export const CANVAS_SCHEMA = 2; // 현재 데이터 모델 버전(카드별 문서)

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
  attachments?: Attachment[]; // 사진/음성 첨부(패들렛식)
  page?: string; // 소속 페이지 id (없으면 첫 페이지)
  createdAt?: number | null; // 생성 시각(ms) — 규칙형(grid) 정렬 기준. 레거시는 없음.
};

export type CardEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  page?: string;
  authorUid?: string;
};

export type CanvasPage = {
  id: string;
  name: string;
  color?: string | null; // 탭 색상 (없으면 기본)
  pattern?: string | null; // 탭 패턴: none|dots|stripes|grid|checker
};

// 부모 doc 메타 (+ 마이그레이션 전 보드의 레거시 배열을 함께 노출)
export type CanvasMeta = {
  id: string;
  name: string;
  pages: CanvasPage[];
  groupColorMode?: boolean; // 모둠별 카드 색 구분(교사 토글)
  layoutMode: "free" | "grid"; // 자유형(무한 캔버스) | 규칙형(반응형 격자). 교사만 변경.
  schema: number; // 0/없음=레거시, 2=카드별 문서
  legacyNodes: CardNode[]; // schema<2 일 때만 의미 있음
  legacyEdges: CardEdge[];
  updatedAt: number | null;
};

// 스냅샷 변경 단위(카드별 문서) — hasPendingWrites 로 내 로컬 쓰기/서버확정을 구분
export type NodeChange = {
  type: "added" | "modified" | "removed";
  node: CardNode;
  hasPendingWrites: boolean;
};

// lid 가 있으면 차시별 보드, 없으면 학급 레벨 캔버스
const canvasCol = (cid: string, lid?: string) =>
  lid
    ? collection(getDbClient(), "classes", cid, "lessons", lid, "canvas")
    : collection(getDbClient(), "classes", cid, "canvas");

const canvasRef = (cid: string, docId: string, lid?: string) =>
  doc(canvasCol(cid, lid), docId);
const nodesCol = (cid: string, docId: string, lid?: string) =>
  collection(canvasRef(cid, docId, lid), "nodes");
const edgesCol = (cid: string, docId: string, lid?: string) =>
  collection(canvasRef(cid, docId, lid), "edges");

function mapMeta(id: string, v: Record<string, unknown>): CanvasMeta {
  const ts = v.updatedAt as { toMillis?: () => number } | undefined;
  let pages = Array.isArray(v.pages) ? (v.pages as CanvasPage[]) : [];
  if (pages.length === 0) pages = [{ id: "p1", name: "1페이지" }];
  return {
    id,
    name: (v.name as string) ?? "캔버스",
    pages,
    groupColorMode: !!v.groupColorMode,
    layoutMode: v.layoutMode === "grid" ? "grid" : "free",
    schema: typeof v.schema === "number" ? (v.schema as number) : 0,
    legacyNodes: Array.isArray(v.nodes) ? (v.nodes as CardNode[]) : [],
    legacyEdges: Array.isArray(v.edges) ? (v.edges as CardEdge[]) : [],
    updatedAt: ts?.toMillis ? ts.toMillis() : null,
  };
}

export async function ensureCanvas(
  cid: string,
  docId: string,
  name: string,
  lid?: string
): Promise<void> {
  const ref = canvasRef(cid, docId, lid);
  const s = await getDoc(ref);
  if (!s.exists()) {
    await setDoc(ref, {
      name,
      pages: [{ id: "p1", name: "1페이지" }],
      nodes: [],
      edges: [],
      layoutMode: "free", // 기본 배치: 자유형(무한 캔버스)
      schema: CANVAS_SCHEMA, // 새 보드는 바로 v2
      updatedAt: serverTimestamp(),
    });
  }
}

// 부모 doc(메타) 구독
export function watchCanvasMeta(
  cid: string,
  docId: string,
  cb: (m: CanvasMeta | null) => void,
  lid?: string
): () => void {
  return onSnapshot(
    canvasRef(cid, docId, lid),
    (snap) => cb(snap.exists() ? mapMeta(snap.id, snap.data()) : null),
    () => cb(null)
  );
}

function nodeFrom(v: Record<string, unknown>): CardNode {
  return {
    id: (v.id as string) ?? "",
    kind: (v.kind as CardKind) ?? "text",
    x: typeof v.x === "number" ? (v.x as number) : 0,
    y: typeof v.y === "number" ? (v.y as number) : 0,
    w: typeof v.w === "number" ? (v.w as number) : 220,
    h: typeof v.h === "number" ? (v.h as number) : 120,
    text: (v.text as string) ?? "",
    url: v.url as string | undefined,
    color: (v.color as string | null) ?? null,
    authorUid: v.authorUid as string | undefined,
    authorName: v.authorName as string | undefined,
    attachments: Array.isArray(v.attachments)
      ? (v.attachments as Attachment[])
      : undefined,
    page: v.page as string | undefined,
    createdAt: (() => {
      const c = v.createdAt as
        | { toMillis?: () => number }
        | number
        | undefined;
      if (typeof c === "number") return c;
      return c?.toMillis ? c.toMillis() : null;
    })(),
  };
}

// nodes 서브컬렉션 구독 — docChanges 단위로 전달(변경 카드만 갱신).
// includeMetadataChanges: 내 로컬 쓰기(hasPendingWrites)→서버확정 전이를 감지해
// shield 해제(ack)에 쓰기 위함.
export function watchNodes(
  cid: string,
  docId: string,
  onChanges: (changes: NodeChange[]) => void,
  lid?: string
): () => void {
  return onSnapshot(
    nodesCol(cid, docId, lid),
    { includeMetadataChanges: true },
    (snap) => {
      const changes = snap.docChanges().map((c) => ({
        type: c.type,
        node: nodeFrom(c.doc.data()),
        hasPendingWrites: c.doc.metadata.hasPendingWrites,
      }));
      if (changes.length) onChanges(changes);
    },
    () => onChanges([])
  );
}

function edgeFrom(v: Record<string, unknown>): CardEdge {
  return {
    id: (v.id as string) ?? "",
    from: (v.from as string) ?? "",
    to: (v.to as string) ?? "",
    label: v.label as string | undefined,
    page: v.page as string | undefined,
    authorUid: v.authorUid as string | undefined,
  };
}

// edges 서브컬렉션 구독 — 전체 목록(엣지는 변경 빈도가 낮아 단순 목록으로 충분)
export function watchEdges(
  cid: string,
  docId: string,
  cb: (edges: CardEdge[]) => void,
  lid?: string
): () => void {
  return onSnapshot(
    edgesCol(cid, docId, lid),
    (snap) => cb(snap.docs.map((d) => edgeFrom(d.data()))),
    () => cb([])
  );
}

// ---------- 카드별 쓰기(granular) ----------
function clean<T extends Record<string, unknown>>(o: T): T {
  // Firestore 는 undefined 를 거부 → 제거
  const out: Record<string, unknown> = {};
  for (const k in o) if (o[k] !== undefined) out[k] = o[k];
  return out as T;
}

// 카드 생성(setDoc — 반드시 새로 만든다)
export async function createNode(
  cid: string,
  docId: string,
  node: CardNode,
  lid?: string
): Promise<void> {
  await setDoc(doc(nodesCol(cid, docId, lid), node.id), {
    ...clean(node as unknown as Record<string, unknown>),
    // 규칙형(grid) 정렬 기준. 생성 시 1회만 서버시각으로 확정.
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// 카드 일부 수정(updateDoc — 문서가 없으면 실패 → 삭제된 카드 부활 방지)
export async function patchNode(
  cid: string,
  docId: string,
  nodeId: string,
  patch: Partial<CardNode>,
  lid?: string
): Promise<void> {
  await updateDoc(doc(nodesCol(cid, docId, lid), nodeId), {
    ...clean(patch as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  });
}

// 첨부 원자 추가(arrayUnion) — 동시 추가도 둘 다 보존, 전체배열 덮어쓰기 금지
export async function addNodeAttachments(
  cid: string,
  docId: string,
  nodeId: string,
  atts: Attachment[],
  lid?: string
): Promise<void> {
  if (atts.length === 0) return;
  await updateDoc(doc(nodesCol(cid, docId, lid), nodeId), {
    attachments: arrayUnion(...(atts as unknown as Record<string, unknown>[])),
    updatedAt: serverTimestamp(),
  });
}

// 첨부 원자 삭제(arrayRemove)
export async function removeNodeAttachment(
  cid: string,
  docId: string,
  nodeId: string,
  att: Attachment,
  lid?: string
): Promise<void> {
  await updateDoc(doc(nodesCol(cid, docId, lid), nodeId), {
    attachments: arrayRemove(att as unknown as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  });
}

// 카드 삭제 + 참조 엣지 정리(원자 batch). 카드 피드백(댓글/반응)은 별도 best-effort.
//  feedback delete 규칙은 "본인 것 or 교사"라, 남이 단 댓글/반응까지 한 batch 에 넣으면
//  학생이 인기 카드를 지울 때 batch 전체가 권한거부로 롤백된다 → 분리해 무음 실패 허용.
//  (고아 feedback 은 watchFeedback 집계가 존재하지 않는 cardId 를 무시하므로 표시상 무해)
export async function deleteNodeAndRefs(
  cid: string,
  docId: string,
  nodeId: string,
  lid?: string
): Promise<void> {
  const db = getDbClient();
  const batch = writeBatch(db);
  batch.delete(doc(nodesCol(cid, docId, lid), nodeId));
  // 양끝 참조 엣지
  const [efrom, eto] = await Promise.all([
    getDocs(query(edgesCol(cid, docId, lid), where("from", "==", nodeId))),
    getDocs(query(edgesCol(cid, docId, lid), where("to", "==", nodeId))),
  ]);
  const edgeIds = new Set<string>();
  [...efrom.docs, ...eto.docs].forEach((d) => {
    if (!edgeIds.has(d.id)) {
      edgeIds.add(d.id);
      batch.delete(d.ref);
    }
  });
  await batch.commit();
  // 카드 피드백 정리 — 별도/개별 best-effort(본인·교사 것만 통과, 나머지는 무시)
  try {
    const fb = await getDocs(
      query(feedbackCol(cid, docId, lid), where("cardId", "==", nodeId))
    );
    await Promise.all(fb.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  } catch {
    /* noop */
  }
}

// ---------- 엣지 쓰기 ----------
export async function createEdge(
  cid: string,
  docId: string,
  edge: CardEdge,
  lid?: string
): Promise<void> {
  await setDoc(doc(edgesCol(cid, docId, lid), edge.id), {
    ...clean(edge as unknown as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  });
}

export async function patchEdge(
  cid: string,
  docId: string,
  edgeId: string,
  patch: Partial<CardEdge>,
  lid?: string
): Promise<void> {
  await updateDoc(doc(edgesCol(cid, docId, lid), edgeId), {
    ...clean(patch as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteEdgeDoc(
  cid: string,
  docId: string,
  edgeId: string,
  lid?: string
): Promise<void> {
  await deleteDoc(doc(edgesCol(cid, docId, lid), edgeId));
}

// 페이지 삭제 시 그 페이지 카드/엣지를 일괄 삭제(교사). 청크 batch(<=450).
export async function deleteNodesOnPage(
  cid: string,
  docId: string,
  pageId: string,
  isFirstPage: boolean,
  lid?: string
): Promise<void> {
  const db = getDbClient();
  const [nodesSnap, edgesSnap] = await Promise.all([
    getDocs(nodesCol(cid, docId, lid)),
    getDocs(edgesCol(cid, docId, lid)),
  ]);
  const onPage = (p?: string) => p === pageId || (isFirstPage && !p);
  const removed = new Set<string>();
  const refs: DocumentReference[] = [];
  nodesSnap.docs.forEach((d) => {
    if (onPage((d.data().page as string | undefined) ?? undefined)) {
      removed.add(d.id);
      refs.push(d.ref);
    }
  });
  edgesSnap.docs.forEach((d) => {
    const e = d.data();
    if (removed.has(e.from as string) || removed.has(e.to as string))
      refs.push(d.ref);
  });
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

// 보드 배치 모드(자유형/규칙형) — 교사만. 부모 메타 doc 갱신 → 학생 보드도 실시간 전환.
export async function setBoardLayoutMode(
  cid: string,
  docId: string,
  mode: "free" | "grid",
  lid?: string
): Promise<void> {
  await updateDoc(canvasRef(cid, docId, lid), {
    layoutMode: mode,
    updatedAt: serverTimestamp(),
  });
}

// 메타(name/pages/groupColorMode)만 부분 갱신
export async function saveCanvasMeta(
  cid: string,
  docId: string,
  patch: Partial<Pick<CanvasMeta, "name" | "pages" | "groupColorMode">>,
  lid?: string
): Promise<void> {
  await setDoc(
    canvasRef(cid, docId, lid),
    { ...clean(patch as Record<string, unknown>), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// ---------- 레거시(단일 doc 배열) → 카드별 문서 마이그레이션 ----------
// 어떤 편집자(canEdit)나 카드/연결을 "시드"(멱등 batch)할 수 있고,
// schema 승격 + 레거시 배열 비움은 교사만(규칙). 학생이 먼저 열어도 시드는 되어
// 렌더는 서브컬렉션으로 전환되고(useSub), 승격은 교사가 열 때 마무리된다.
export async function migrateCanvasToV2(
  cid: string,
  docId: string,
  meta: CanvasMeta,
  canFlipSchema: boolean,
  lid?: string
): Promise<boolean> {
  if (meta.schema >= CANVAS_SCHEMA) return false;
  const db = getDbClient();
  // 1) 노드/엣지 시드(멱등: id 고정 setDoc) — 청크 batch
  const seedRefs: { ref: DocumentReference; data: Record<string, unknown> }[] =
    [];
  for (const n of meta.legacyNodes)
    seedRefs.push({
      ref: doc(nodesCol(cid, docId, lid), n.id),
      data: clean(n as unknown as Record<string, unknown>),
    });
  for (const e of meta.legacyEdges)
    seedRefs.push({
      ref: doc(edgesCol(cid, docId, lid), e.id),
      data: clean(e as unknown as Record<string, unknown>),
    });
  for (let i = 0; i < seedRefs.length; i += 450) {
    const batch = writeBatch(db);
    seedRefs
      .slice(i, i + 450)
      .forEach(({ ref, data }) =>
        batch.set(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true })
      );
    await batch.commit();
  }
  // 2) 시드 완료 후에만 승격 + 레거시 배열 비움(원자) → split-brain/구버전 부활 차단.
  //    교사가 아니면(규칙상 거부) 승격은 건너뛴다 — 다음에 교사가 열 때 마무리.
  if (canFlipSchema) {
    await setDoc(
      canvasRef(cid, docId, lid),
      {
        schema: CANVAS_SCHEMA,
        nodes: [],
        edges: [],
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch(() => {});
  }
  return true;
}

/* ---------- 카드 피드백: 댓글 + 반응(추천/공감) ----------
   카드 문서(노드)와 분리된 서브컬렉션에 저장하고,
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
  collection(canvasRef(cid, docId, lid), "feedback");

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
