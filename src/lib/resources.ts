// 자료/링크 — 차시에 붙는 이동 가능한 모듈 (플랫 컬렉션 → lessonId 변경으로 이동)
// classes/{cid}/resources/{rid} : { lessonId, type, title, url, order }
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDbClient } from "@/lib/firebase";

export type ResourceType = "link" | "file" | "note";

export type Resource = {
  id: string;
  lessonId: string;
  type: ResourceType;
  title: string;
  url: string; // link/file URL, note 는 빈 값
  order: number;
  createdBy: string;
  createdAt: number | null;
};

const col = (cid: string) =>
  collection(getDbClient(), "classes", cid, "resources");

function map(id: string, v: Record<string, unknown>): Resource {
  const ts = v.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    lessonId: (v.lessonId as string) ?? "",
    type: (v.type as ResourceType) ?? "link",
    title: (v.title as string) ?? "",
    url: (v.url as string) ?? "",
    order: (v.order as number) ?? 0,
    createdBy: (v.createdBy as string) ?? "",
    createdAt: ts?.toMillis ? ts.toMillis() : null,
  };
}

export async function createResource(
  cid: string,
  user: User,
  lessonId: string,
  data: { type: ResourceType; title: string; url: string }
): Promise<string> {
  const ref = doc(col(cid));
  await setDoc(ref, {
    lessonId,
    type: data.type,
    title: data.title.trim(),
    url: data.url.trim(),
    order: Date.now(),
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** 특정 차시의 자료 목록 */
export async function listResources(
  cid: string,
  lessonId: string
): Promise<Resource[]> {
  const snap = await getDocs(
    query(col(cid), where("lessonId", "==", lessonId))
  );
  return snap.docs
    .map((d) => map(d.id, d.data()))
    .sort((a, b) => a.order - b.order);
}

/** 학급 전체 자료 (빌더에서 차시별로 분배) */
export async function listAllResources(
  cid: string
): Promise<Resource[]> {
  const snap = await getDocs(col(cid));
  return snap.docs
    .map((d) => map(d.id, d.data()))
    .sort((a, b) => a.order - b.order);
}

/** 자료를 다른 차시로 이동 */
export async function moveResource(
  cid: string,
  rid: string,
  lessonId: string,
  order?: number
): Promise<void> {
  await setDoc(
    doc(getDbClient(), "classes", cid, "resources", rid),
    order === undefined ? { lessonId } : { lessonId, order },
    { merge: true }
  );
}

export async function deleteResource(
  cid: string,
  rid: string
): Promise<void> {
  await deleteDoc(doc(getDbClient(), "classes", cid, "resources", rid));
}
