// 모둠(그룹) — classes/{cid}/groups/{gid}
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

export type Group = {
  id: string;
  name: string;
  color: string | null;
  memberUids: string[];
  order: number;
  createdBy: string;
  createdAt: number | null;
};

const groupsCol = (cid: string) =>
  collection(getDbClient(), "classes", cid, "groups");

export async function listGroups(cid: string): Promise<Group[]> {
  const snap = await getDocs(groupsCol(cid));
  return snap.docs
    .map((d) => {
      const v = d.data() as Record<string, unknown>;
      const ts = v.createdAt as { toMillis?: () => number } | undefined;
      return {
        id: d.id,
        name: (v.name as string) ?? "",
        color: (v.color as string) ?? null,
        memberUids: Array.isArray(v.memberUids)
          ? (v.memberUids as unknown[]).map((x) => String(x))
          : [],
        order: (v.order as number) ?? 0,
        createdBy: (v.createdBy as string) ?? "",
        createdAt: ts?.toMillis ? ts.toMillis() : null,
      };
    })
    .sort((a, b) => a.order - b.order);
}

export async function createGroup(
  cid: string,
  user: User,
  name: string
): Promise<string> {
  const ref = doc(groupsCol(cid));
  await setDoc(ref, {
    name: name.trim() || "새 모둠",
    color: null,
    memberUids: [],
    order: Date.now(),
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateGroup(
  cid: string,
  gid: string,
  patch: { name?: string; color?: string | null; memberUids?: string[] }
): Promise<void> {
  const p: Record<string, unknown> = { ...patch };
  if (typeof p.name === "string") p.name = (p.name as string).trim();
  await setDoc(doc(groupsCol(cid), gid), p, { merge: true });
}

export async function deleteGroup(
  cid: string,
  gid: string
): Promise<void> {
  await deleteDoc(doc(groupsCol(cid), gid));
}
