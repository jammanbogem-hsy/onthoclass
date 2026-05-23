// 교사 팀 — 개인 코드 공유 → 요청 → 수락으로 팀 구성
//   users/{uid}.teamCode : 공유용 개인 코드
//   teamLinks/{id} : { members:[a,b], requestedBy, status:"pending"|"accepted", names }
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
} from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";
import { getClass, listMyClasses } from "@/lib/classes";

export type SourceClass = {
  cid: string;
  name: string;
  teacher: string; // "내 학급" 또는 팀원 이름
  mine: boolean;
};

export type TeamLink = {
  id: string;
  members: string[];
  requestedBy: string;
  status: "pending" | "accepted";
  names: Record<string, string>;
  createdAt: number | null;
};

function randCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 글자 제외
  let s = "";
  for (let i = 0; i < 6; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// 내 공유 코드 보장(없으면 생성)
export async function getOrCreateTeamCode(uid: string): Promise<string> {
  const ref = doc(getDbClient(), "users", uid);
  const snap = await getDoc(ref);
  const cur = snap.exists() ? (snap.data().teamCode as string | undefined) : undefined;
  if (cur) return cur;
  const code = randCode();
  await setDoc(ref, { teamCode: code }, { merge: true });
  return code;
}

// 코드로 교사 찾기
export async function findTeacherByCode(
  code: string
): Promise<{ uid: string; name: string } | null> {
  const snap = await getDocs(
    query(collection(getDbClient(), "users"), where("teamCode", "==", code.trim().toUpperCase()))
  );
  const d = snap.docs.find((x) => (x.data().role as string) === "teacher");
  if (!d) return null;
  return { uid: d.id, name: (d.data().name as string) ?? "교사" };
}

// 팀 요청 보내기 (이미 있으면 무시)
export async function requestTeam(
  me: { uid: string; name: string },
  other: { uid: string; name: string }
): Promise<void> {
  if (me.uid === other.uid) throw new Error("본인 코드입니다.");
  const pairId = [me.uid, other.uid].sort().join("__");
  const ref = doc(getDbClient(), "teamLinks", pairId);
  const existing = await getDoc(ref);
  if (existing.exists()) return; // 이미 요청/연결됨
  await setDoc(ref, {
    members: [me.uid, other.uid],
    requestedBy: me.uid,
    status: "pending",
    names: { [me.uid]: me.name, [other.uid]: other.name },
    createdAt: serverTimestamp(),
  });
}

export function watchTeamLinks(
  uid: string,
  cb: (links: TeamLink[]) => void
): () => void {
  return onSnapshot(
    query(
      collection(getDbClient(), "teamLinks"),
      where("members", "array-contains", uid)
    ),
    (snap) => {
      const list = snap.docs.map((d) => {
        const v = d.data();
        const ts = v.createdAt as { toMillis?: () => number } | undefined;
        return {
          id: d.id,
          members: Array.isArray(v.members) ? (v.members as string[]) : [],
          requestedBy: (v.requestedBy as string) ?? "",
          status: (v.status as "pending" | "accepted") ?? "pending",
          names: (v.names as Record<string, string>) ?? {},
          createdAt: ts?.toMillis ? ts.toMillis() : null,
        };
      });
      cb(list);
    },
    () => cb([])
  );
}

export async function acceptTeam(linkId: string): Promise<void> {
  await updateDoc(doc(getDbClient(), "teamLinks", linkId), {
    status: "accepted",
  });
}

export async function removeTeamLink(linkId: string): Promise<void> {
  await deleteDoc(doc(getDbClient(), "teamLinks", linkId));
}

// 활동을 가져올 수 있는 출처 학급: 내 학급 + 팀원 학급
export async function listSourceClasses(uid: string): Promise<SourceClass[]> {
  const db = getDbClient();
  const result: SourceClass[] = [];
  const mine = await listMyClasses(uid).catch(() => []);
  mine.forEach((c) =>
    result.push({ cid: c.id, name: c.name, teacher: "내 학급", mine: true })
  );

  const linksSnap = await getDocs(
    query(
      collection(db, "teamLinks"),
      where("members", "array-contains", uid)
    )
  ).catch(() => null);
  const accepted = (linksSnap?.docs ?? [])
    .map((d) => d.data())
    .filter((v) => v.status === "accepted");
  for (const l of accepted) {
    const otherUid = (l.members as string[]).find((m) => m !== uid);
    if (!otherUid) continue;
    const teacher = (l.names as Record<string, string>)?.[otherUid] ?? "교사";
    const u = await getDoc(doc(db, "users", otherUid)).catch(() => null);
    const ids = ((u?.data()?.classIds as string[]) ?? []).filter(Boolean);
    for (const cid of ids) {
      const c = await getClass(cid).catch(() => null);
      if (c) result.push({ cid: c.id, name: c.name, teacher, mine: false });
    }
  }
  return result;
}
