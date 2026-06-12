// 학생 오류 보고 / 피드백 — 베타 운영 중 증상·의견 수집
// 경로: classes/{cid}/feedback/{fid}
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";
import type { Attachment } from "@/lib/lessons";

export type FeedbackKind = "bug" | "idea" | "other";

export type Feedback = {
  id: string;
  kind: FeedbackKind;
  title: string; // 증상/피드백명(한 줄)
  body: string; // 자세한 내용
  attachments: Attachment[]; // 사진 첨부
  byUid: string;
  byName: string; // 작성 시점의 학급 표시 이름(스냅샷)
  status: "open" | "done"; // 교사 처리 여부
  page?: string; // 작성 당시 경로(디버깅용)
  ua?: string; // user agent(디버깅용)
  createdAt: number | null;
};

const col = (cid: string) =>
  collection(getDbClient(), "classes", cid, "feedback");
const ref = (cid: string, fid: string) =>
  doc(getDbClient(), "classes", cid, "feedback", fid);

function randId() {
  return "fb_" + Math.random().toString(36).slice(2, 10);
}

/** 학생/멤버가 피드백 1건 생성. fid 를 먼저 만들어 첨부 업로드 경로에 쓴다. */
export function newFeedbackId(): string {
  return randId();
}

export async function submitFeedback(
  cid: string,
  fid: string,
  data: {
    kind: FeedbackKind;
    title: string;
    body: string;
    attachments: Attachment[];
    byUid: string;
    byName: string;
    page?: string;
    ua?: string;
  }
): Promise<void> {
  await setDoc(ref(cid, fid), {
    kind: data.kind,
    title: data.title,
    body: data.body,
    attachments: data.attachments,
    byUid: data.byUid,
    byName: data.byName,
    status: "open",
    page: data.page ?? "",
    ua: data.ua ?? "",
    createdAt: serverTimestamp(),
  });
}

/** 교사: 처리 상태 토글 */
export async function setFeedbackStatus(
  cid: string,
  fid: string,
  status: Feedback["status"]
): Promise<void> {
  await updateDoc(ref(cid, fid), { status });
}

function map(id: string, v: Record<string, unknown>): Feedback {
  const ts = v.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    kind: (v.kind as FeedbackKind) ?? "other",
    title: (v.title as string) ?? "",
    body: (v.body as string) ?? "",
    attachments: Array.isArray(v.attachments)
      ? (v.attachments as Attachment[])
      : [],
    byUid: (v.byUid as string) ?? "",
    byName: (v.byName as string) ?? "",
    status: v.status === "done" ? "done" : "open",
    page: (v.page as string) ?? "",
    ua: (v.ua as string) ?? "",
    createdAt: ts?.toMillis ? ts.toMillis() : null,
  };
}

/** 교사: 학급 피드백 전체 구독(최신순) */
export function watchFeedback(
  cid: string,
  cb: (list: Feedback[]) => void
): () => void {
  const q = query(col(cid), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => map(d.id, d.data()))),
    () => cb([])
  );
}
