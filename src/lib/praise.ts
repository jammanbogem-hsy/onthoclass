// 또래 칭찬(학생 → 학생) + 학급 온도계
//   classes/{cid}/praises/{id}                    : 칭찬(작성자/교사만 읽기 → 받는 사람에겐 익명)
//   classes/{cid}/praiseInbox/{toUid}/items/{id}  : 받은함(보낸 사람 정보 없음 → 익명 보장)
//   classes/{cid}/control/thermometer             : { degree } 학급 온도(승인 1건당 +1, 기본 0)
//
// 흐름: 학생이 친구+이유로 칭찬 작성(pending) → 교사 승인 시
//   ① 받은 학생 inbox 에 이유 기록(익명) + 축하 효과
//   ② 학급 온도계 +1
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDbClient } from "@/lib/firebase";
import { sendEffect } from "@/lib/live";

export type PraiseStatus = "pending" | "approved" | "rejected";

export type Praise = {
  id: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  toName: string;
  reason: string;
  status: PraiseStatus;
  createdAt: number | null;
  decidedAt: number | null; // 승인/반려 시각
  // 다른 반 칭찬: 받는 반(=이 문서가 저장된 cid)으로 보내진 칭찬.
  crossClass?: boolean;
  fromCid?: string; // 보낸 학생의 출처 반(보안 규칙 검증용)
  fromCidName?: string; // 출처 반 이름(교사 표시용)
};

export type ReceivedPraise = { id: string; reason: string; at: number | null };

/** 다른 반 칭찬을 보낼 수 있는 대상 반 (교사가 연결) */
export type CrossPeer = { cid: string; name: string };

const praiseCol = (cid: string) =>
  collection(getDbClient(), "classes", cid, "praises");
const inboxCol = (cid: string, uid: string) =>
  collection(getDbClient(), "classes", cid, "praiseInbox", uid, "items");
const thermoRef = (cid: string) =>
  doc(getDbClient(), "classes", cid, "control", "thermometer");
const crossRef = (cid: string) =>
  doc(getDbClient(), "classes", cid, "control", "crossPraise");

/** 한 학급의 승인된 칭찬 총 개수 — 서버 집계(count)로 문서를 받지 않고 센다(대시보드 학급별 표시용).
 *  교사 권한이 없는 반(규칙 거부)에선 throw 하므로 호출부에서 catch 한다. */
export async function countApprovedPraises(cid: string): Promise<number> {
  const snap = await getCountFromServer(
    query(praiseCol(cid), where("status", "==", "approved"))
  );
  return snap.data().count;
}

/** 학생이 친구를 칭찬(이유 포함) — 승인 전(pending) 상태로 저장 */
export async function sendPraise(
  cid: string,
  from: User,
  toUid: string,
  toName: string,
  reason: string
): Promise<void> {
  const ref = doc(praiseCol(cid));
  await setDoc(ref, {
    fromUid: from.uid,
    fromName: from.displayName ?? "친구",
    toUid,
    toName: toName ?? "",
    reason: reason.trim(),
    status: "pending",
    createdAt: serverTimestamp(),
    decidedAt: null,
  });
}

/**
 * 여러 친구를 한 번에 칭찬 — 선택한 대상마다 pending 칭찬 문서를 한 배치로 생성.
 * 같은 이유가 모든 대상에게 적용된다. (각 문서가 fromUid==본인·toUid≠본인·pending
 * 이라 기존 보안 규칙을 그대로 충족 — 규칙 변경 불필요.)
 */
export async function sendPraises(
  cid: string,
  from: User,
  targets: { uid: string; name: string }[],
  reason: string
): Promise<void> {
  const valid = targets.filter((t) => t.uid && t.uid !== from.uid);
  if (valid.length === 0) return;
  const db = getDbClient();
  const batch = writeBatch(db);
  const r = reason.trim();
  const fromName = from.displayName ?? "친구";
  for (const t of valid) {
    batch.set(doc(praiseCol(cid)), {
      fromUid: from.uid,
      fromName,
      toUid: t.uid,
      toName: t.name ?? "",
      reason: r,
      status: "pending",
      createdAt: serverTimestamp(),
      decidedAt: null,
    });
  }
  await batch.commit();
}

/**
 * 다른 반 칭찬 — 받는 반(targetCid)의 praises 에 pending 문서를 생성.
 * 받을 학생은 빈 값(toUid:"")으로 두고, 친구 이름(toName)만 적는다.
 * 받는 반 교사가 이름을 보고 실제 학생과 매칭해 승인한다(approvePraise 의 assignTo).
 * 보안 규칙은 출처 반(fromCid)이 targetCid 를 칭찬 허용 목록(allowedCids)에
 * 넣었을 때만 작성을 허용한다.
 */
export async function sendCrossPraise(
  targetCid: string,
  from: User,
  fromCid: string,
  fromCidName: string,
  toName: string,
  reason: string
): Promise<void> {
  const name = toName.trim();
  const r = reason.trim();
  if (!name || !r) return;
  await setDoc(doc(praiseCol(targetCid)), {
    fromUid: from.uid,
    fromName: from.displayName ?? "친구",
    toUid: "",
    toName: name,
    reason: r,
    status: "pending",
    createdAt: serverTimestamp(),
    decidedAt: null,
    crossClass: true,
    fromCid,
    fromCidName: fromCidName ?? "",
  });
}

/** 학생/교사: 이 반의 학생이 칭찬할 수 있는 다른 반 목록 읽기 */
export async function listCrossPeers(cid: string): Promise<CrossPeer[]> {
  try {
    const snap = await getDoc(crossRef(cid));
    if (!snap.exists()) return [];
    const peers = (snap.data().peers as CrossPeer[]) ?? [];
    return peers.filter((p) => p && p.cid && p.name);
  } catch {
    return [];
  }
}

/** 교사: 이 반의 학생이 칭찬할 수 있는 다른 반 목록 설정(연결) */
export async function setCrossPeers(
  cid: string,
  peers: CrossPeer[]
): Promise<void> {
  const clean = peers.filter((p) => p && p.cid && p.cid !== cid && p.name);
  await setDoc(
    crossRef(cid),
    {
      peers: clean,
      allowedCids: clean.map((p) => p.cid),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function mapPraise(id: string, v: Record<string, unknown>): Praise {
  const c = v.createdAt as { toMillis?: () => number } | undefined;
  const d = v.decidedAt as { toMillis?: () => number } | undefined;
  // 구버전(approved 불리언) 호환
  const status: PraiseStatus =
    (v.status as PraiseStatus) ?? (v.approved ? "approved" : "pending");
  return {
    id,
    fromUid: (v.fromUid as string) ?? "",
    fromName: (v.fromName as string) ?? "친구",
    toUid: (v.toUid as string) ?? "",
    toName: (v.toName as string) ?? "",
    reason: (v.reason as string) ?? "",
    status,
    createdAt: c?.toMillis ? c.toMillis() : null,
    decidedAt: d?.toMillis ? d.toMillis() : null,
    crossClass: (v.crossClass as boolean) ?? false,
    fromCid: (v.fromCid as string) ?? "",
    fromCidName: (v.fromCidName as string) ?? "",
  };
}

/** 교사용: 모든 칭찬 구독(상태별 분류는 호출측에서) */
export function watchPraises(
  cid: string,
  cb: (list: Praise[]) => void
): () => void {
  return onSnapshot(
    praiseCol(cid),
    (snap) => {
      const list = snap.docs
        .map((d) => mapPraise(d.id, d.data()))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      cb(list);
    },
    () => cb([])
  );
}

/** 학생: 내가 보낸 칭찬(상태 포함) 구독 */
export function watchSentPraises(
  cid: string,
  uid: string,
  cb: (list: Praise[]) => void
): () => void {
  return onSnapshot(
    query(praiseCol(cid), where("fromUid", "==", uid)),
    (snap) => {
      const list = snap.docs
        .map((d) => mapPraise(d.id, d.data()))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      cb(list);
    },
    () => cb([])
  );
}

/** 학생: 내가 받은 칭찬(익명·이유만) 구독 */
export function watchReceivedPraises(
  cid: string,
  uid: string,
  cb: (list: ReceivedPraise[]) => void
): () => void {
  return onSnapshot(
    inboxCol(cid, uid),
    (snap) => {
      const list = snap.docs
        .map((d) => {
          const v = d.data();
          const t = v.at as { toMillis?: () => number } | undefined;
          return {
            id: d.id,
            reason: (v.reason as string) ?? "",
            at: t?.toMillis ? t.toMillis() : null,
          };
        })
        .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
      cb(list);
    },
    () => cb([])
  );
}

/**
 * 교사 승인 — 받은함 기록(익명) + 축하 효과 + 학급 온도 +0.1.
 * 다른 반 칭찬(toUid 가 빈 값)인 경우 assignTo 로 받을 학생을 지정해 매칭한다.
 */
export async function approvePraise(
  cid: string,
  p: Praise,
  by: string,
  assignTo?: { uid: string; name: string }
): Promise<void> {
  const toUid = assignTo?.uid || p.toUid;
  if (!toUid) throw new Error("받을 학생을 먼저 선택해 주세요.");
  // 상태 변경 + 받은함 기록 + 온도계를 한 배치로 원자 커밋 — 부분 실패로
  // '승인됐지만 받은함/온도가 누락'되는 불일치를 방지한다.
  const db = getDbClient();
  const batch = writeBatch(db);
  batch.update(doc(praiseCol(cid), p.id), {
    status: "approved",
    decidedAt: serverTimestamp(),
    approvedBy: by,
    ...(assignTo ? { toUid: assignTo.uid, toName: assignTo.name } : {}),
  });
  // 받은함(익명: 보낸 사람 정보 없음)
  batch.set(doc(inboxCol(cid, toUid), p.id), {
    reason: p.reason,
    at: serverTimestamp(),
  });
  // 학급 온도계 +0.1 (문서 없으면 생성)
  batch.set(
    thermoRef(cid),
    { degree: increment(0.1), updatedAt: serverTimestamp() },
    { merge: true }
  );
  await batch.commit();
  // 받은 학생에게 익명 칭찬 축하 효과(best-effort: 실패해도 승인은 유효)
  try {
    await sendEffect(
      cid,
      toUid,
      {
        kind: "praise",
        title: "친구가 당신을 칭찬했어요 💛",
        subtitle: p.reason ? `"${p.reason}"` : undefined,
      },
      by
    );
  } catch {
    /* 효과 전송 실패는 무시 */
  }
}

/**
 * 과거에 승인된 칭찬을 익명 받은함에 채워 넣음(백필) — 받은함 도입 이전 데이터 보정.
 * 교사 권한으로 실행(idempotent: 같은 id 로 merge).
 */
export async function backfillInbox(
  cid: string,
  praises: Praise[]
): Promise<number> {
  const approved = praises.filter((p) => p.status === "approved" && p.toUid);
  await Promise.all(
    approved.map((p) =>
      setDoc(
        doc(inboxCol(cid, p.toUid), p.id),
        { reason: p.reason, at: serverTimestamp() },
        { merge: true }
      )
    )
  );
  return approved.length;
}

/** 교사 반려 — 삭제 대신 상태만 'rejected'(작성자 내역에 남김) */
export async function rejectPraise(cid: string, id: string): Promise<void> {
  await updateDoc(doc(praiseCol(cid), id), {
    status: "rejected",
    decidedAt: serverTimestamp(),
  });
}

/** 학급 온도 구독 (기본 0도) */
export function watchThermometer(
  cid: string,
  cb: (degree: number) => void
): () => void {
  return onSnapshot(
    thermoRef(cid),
    (snap) => cb(snap.exists() ? ((snap.data().degree as number) ?? 0) : 0),
    () => cb(0)
  );
}
