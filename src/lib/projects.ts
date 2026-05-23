// 프로젝트 — 차시를 묶는 상위 조직 (구글 클래스룸 주제와 유사)
// classes/{cid}/projects/{pid}
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDbClient } from "@/lib/firebase";

export type Project = {
  id: string;
  name: string;
  order: number;
  parentProjectId: string | null; // 폴더 중첩 (null = 최상위)
  color: string | null;
  icon: string | null;
  pinned: boolean;
  createdBy: string;
  createdAt: number | null;
};

const col = (cid: string) =>
  collection(getDbClient(), "classes", cid, "projects");

export async function createProject(
  cid: string,
  user: User,
  name: string
): Promise<string> {
  const ref = doc(col(cid));
  await setDoc(ref, {
    name: name.trim(),
    order: Date.now(),
    parentProjectId: null,
    color: null,
    icon: null,
    pinned: false,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** 폴더 이동/합치기 (상위 프로젝트·순서 변경) */
export async function moveProject(
  cid: string,
  pid: string,
  patch: { parentProjectId?: string | null; order?: number }
): Promise<void> {
  await setDoc(
    doc(getDbClient(), "classes", cid, "projects", pid),
    patch,
    { merge: true }
  );
}

/** 프로젝트 메타 수정 (이름·색상·고정·순서) */
export async function updateProject(
  cid: string,
  pid: string,
  patch: {
    name?: string;
    color?: string | null;
    icon?: string | null;
    pinned?: boolean;
    order?: number;
    parentProjectId?: string | null;
  }
): Promise<void> {
  const p: Record<string, unknown> = { ...patch };
  if (typeof p.name === "string") p.name = (p.name as string).trim();
  await setDoc(
    doc(getDbClient(), "classes", cid, "projects", pid),
    p,
    { merge: true }
  );
}

export async function listProjects(cid: string): Promise<Project[]> {
  const snap = await getDocs(col(cid));
  return snap.docs
    .map((d) => {
      const v = d.data();
      const ts = v.createdAt as { toMillis?: () => number } | undefined;
      return {
        id: d.id,
        name: (v.name as string) ?? "",
        order: (v.order as number) ?? 0,
        parentProjectId: (v.parentProjectId as string) ?? null,
        color: (v.color as string) ?? null,
        icon: (v.icon as string) ?? null,
        pinned: Boolean(v.pinned),
        createdBy: (v.createdBy as string) ?? "",
        createdAt: ts?.toMillis ? ts.toMillis() : null,
      } as Project;
    })
    .sort((a, b) => a.order - b.order);
}

export async function renameProject(
  cid: string,
  pid: string,
  name: string
): Promise<void> {
  await setDoc(
    doc(getDbClient(), "classes", cid, "projects", pid),
    { name: name.trim() },
    { merge: true }
  );
}

export async function reorderProject(
  cid: string,
  pid: string,
  order: number
): Promise<void> {
  await setDoc(
    doc(getDbClient(), "classes", cid, "projects", pid),
    { order },
    { merge: true }
  );
}

export async function deleteProject(
  cid: string,
  pid: string
): Promise<void> {
  await deleteDoc(doc(getDbClient(), "classes", cid, "projects", pid));
}
