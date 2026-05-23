// 읽기전용 공유 지식맵 — 현재 온톨로지를 스냅샷으로 저장하고
// 로그인 없이 열람 가능한 공개 문서(shares/{id})로 발행한다.
// 학생 식별정보(sources uid)는 저장 시 제거하고 집계 수(sourceCount)만 남긴다.
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";
import type { Ontology } from "@/lib/lessons";

export type ShareDoc = {
  id: string;
  title: string;
  ontology: Ontology;
  ownerUid: string;
  createdAt: number | null;
};

// 공개 문서에서 개인정보 제거: 노드의 sources(학생 uid) 삭제, 집계는 유지
function sanitize(o: Ontology): Ontology {
  return {
    ...o,
    nodes: (o.nodes ?? []).map((n) => {
      const { sources: _drop, ...rest } = n;
      void _drop;
      return { ...rest, sourceCount: n.sourceCount ?? n.sources?.length ?? 0 };
    }),
    edges: (o.edges ?? []).map((e) => ({ ...e })),
  };
}

export async function createShare(
  ontology: Ontology,
  title: string,
  ownerUid: string
): Promise<string> {
  const ref = doc(collection(getDbClient(), "shares")); // 임의 20자 토큰
  await setDoc(ref, {
    ownerUid,
    title,
    ontology: sanitize(ontology),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getShare(id: string): Promise<ShareDoc | null> {
  const snap = await getDoc(doc(getDbClient(), "shares", id));
  if (!snap.exists()) return null;
  const v = snap.data();
  const ts = v.createdAt as { toMillis?: () => number } | undefined;
  return {
    id: snap.id,
    title: (v.title as string) ?? "지식맵",
    ontology: v.ontology as Ontology,
    ownerUid: (v.ownerUid as string) ?? "",
    createdAt: ts?.toMillis ? ts.toMillis() : null,
  };
}
