// 읽기전용 공유 지식맵 — 현재 온톨로지를 스냅샷으로 발행한다.
// 발행은 publishShare Cloud Function(admin)이 처리해 노드의 sources(학생 uid)를
// 서버에서 제거한다. 클라이언트의 shares 직접 쓰기는 규칙으로 차단(변조 방지).
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDbClient, getFunctionsClient } from "@/lib/firebase";
import type { Ontology } from "@/lib/lessons";

export type ShareDoc = {
  id: string;
  title: string;
  ontology: Ontology;
  ownerUid: string;
  createdAt: number | null;
};

export async function createShare(
  ontology: Ontology,
  title: string,
  ownerUid: string
): Promise<string> {
  void ownerUid; // 서버가 인증된 호출자로 ownerUid 를 설정한다.
  const fn = httpsCallable<{ ontology: Ontology; title: string }, { id: string }>(
    getFunctionsClient(),
    "publishShare"
  );
  const res = await fn({ ontology, title });
  return res.data.id;
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
