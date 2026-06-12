// 발표 승인(학생 → 교사) + 발표 XP 지급
//   classes/{cid}/presentationRequests/{id} : 발표 횟수 신청(pending → approved/rejected)
//
// 흐름: 학생이 발표 횟수를 신청(pending) → 교사 승인 시
//   ① 발표 1회당 고정 XP(XP_PER_PRESENTATION)를 grantXp 로 지급(만보 자동 미러)
//   ② 신청 문서를 approved 로 갱신 (지급이 실패하면 pending 으로 남음)
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDbClient } from "@/lib/firebase";
import { grantXp } from "@/lib/xp";

export type PresentationRequest = {
  id: string;
  fromUid: string;
  fromName: string;
  count: number;
  status: "pending" | "approved" | "rejected";
  createdAt: number | null;
  decidedAt: number | null;
};

// 발표 1회당 고정 10 XP
export const XP_PER_PRESENTATION = 10;

const reqCol = (cid: string) =>
  collection(getDbClient(), "classes", cid, "presentationRequests");

function mapRequest(
  id: string,
  v: Record<string, unknown>
): PresentationRequest {
  const c = v.createdAt as { toMillis?: () => number } | undefined;
  const d = v.decidedAt as { toMillis?: () => number } | undefined;
  return {
    id,
    fromUid: (v.fromUid as string) ?? "",
    fromName: (v.fromName as string) ?? "학생",
    count: (v.count as number) ?? 0,
    status: (v.status as PresentationRequest["status"]) ?? "pending",
    createdAt: c?.toMillis ? c.toMillis() : null,
    decidedAt: d?.toMillis ? d.toMillis() : null,
  };
}

/** 학생이 발표 횟수를 신청 — 승인 전(pending) 상태로 저장 */
export async function requestPresentationApproval(
  cid: string,
  from: User,
  count: number
): Promise<void> {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new Error("발표 횟수를 1 이상 입력해 주세요.");
  const ref = doc(reqCol(cid));
  await setDoc(ref, {
    fromUid: from.uid,
    fromName: from.displayName ?? "학생",
    count,
    status: "pending",
    createdAt: serverTimestamp(),
    decidedAt: null,
    approvedBy: null,
  });
}

/** 교사용: 모든 발표 신청 구독(상태별 분류는 호출측에서) */
export function watchPresentationRequests(
  cid: string,
  cb: (items: PresentationRequest[]) => void
): () => void {
  return onSnapshot(
    reqCol(cid),
    (snap) => {
      const list = snap.docs
        .map((d) => mapRequest(d.id, d.data()))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      cb(list);
    },
    () => cb([])
  );
}

/** 학생: 내가 보낸 발표 신청(상태 포함) 구독 */
export function watchMyPresentationRequests(
  cid: string,
  uid: string,
  cb: (items: PresentationRequest[]) => void
): () => void {
  return onSnapshot(
    query(reqCol(cid), where("fromUid", "==", uid)),
    (snap) => {
      const list = snap.docs
        .map((d) => mapRequest(d.id, d.data()))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      cb(list);
    },
    () => cb([])
  );
}

/**
 * 교사 승인 — XP 먼저 지급(grantXp), 그 다음 신청 문서를 approved 로 갱신.
 * (지급이 실패하면 문서가 pending 으로 남아 재시도 가능)
 */
export async function approvePresentationRequest(
  cid: string,
  req: PresentationRequest,
  by: string
): Promise<void> {
  await grantXp(
    cid,
    [req.fromUid],
    req.count * XP_PER_PRESENTATION,
    `발표 승인: ${req.count}회`,
    by
  );
  await updateDoc(doc(reqCol(cid), req.id), {
    status: "approved",
    decidedAt: serverTimestamp(),
    approvedBy: by,
  });
}

/** 교사 반려 — 삭제 대신 상태만 'rejected' */
export async function rejectPresentationRequest(
  cid: string,
  id: string
): Promise<void> {
  await updateDoc(doc(reqCol(cid), id), {
    status: "rejected",
    decidedAt: serverTimestamp(),
  });
}
