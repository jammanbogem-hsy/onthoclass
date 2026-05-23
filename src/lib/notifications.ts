// 인앱 알림 — users/{uid}/notifications/{nid}
// 생성은 Cloud Function(admin)만, 클라이언트는 읽기/읽음표시/삭제만.
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";

export type Notif = {
  id: string;
  type: string;
  classId: string;
  lessonId: string;
  text: string;
  link: string;
  readAt: number | null;
  createdAt: number | null;
};

const notifCol = (uid: string) =>
  collection(getDbClient(), "users", uid, "notifications");

function mapNotif(id: string, v: Record<string, unknown>): Notif {
  const c = v.createdAt as { toMillis?: () => number } | undefined;
  const r = v.readAt as { toMillis?: () => number } | undefined;
  return {
    id,
    type: (v.type as string) ?? "",
    classId: (v.classId as string) ?? "",
    lessonId: (v.lessonId as string) ?? "",
    text: (v.text as string) ?? "",
    link: (v.link as string) ?? "",
    readAt: r?.toMillis ? r.toMillis() : null,
    createdAt: c?.toMillis ? c.toMillis() : null,
  };
}

/** 실시간 구독 (최근 30개). 반환값 호출로 구독 해제 */
export function watchNotifications(
  uid: string,
  cb: (list: Notif[]) => void
): () => void {
  const q = query(
    notifCol(uid),
    orderBy("createdAt", "desc"),
    limit(30)
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => mapNotif(d.id, d.data()))),
    () => cb([])
  );
}

export async function markNotifRead(
  uid: string,
  nid: string
): Promise<void> {
  await updateDoc(doc(notifCol(uid), nid), { readAt: serverTimestamp() });
}

export async function markAllNotifsRead(uid: string): Promise<void> {
  const snap = await getDocs(notifCol(uid));
  const batch = writeBatch(getDbClient());
  snap.docs.forEach((d) => {
    if (!d.data().readAt)
      batch.update(d.ref, { readAt: serverTimestamp() });
  });
  await batch.commit();
}
