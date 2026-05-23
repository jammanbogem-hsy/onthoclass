// 학급(클래스) Firestore 헬퍼 — 정식 스키마 v1 (docs/SCHEMA.md 참고)
//
// classes/{classId}                : 학급 메타
// classes/{classId}/members/{uid}  : 멤버 + 역할(teacher/student)
import {
  arrayUnion,
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDbClient } from "@/lib/firebase";

export type Role = "teacher" | "student";

export type ClassRoom = {
  id: string;
  name: string;
  subject: string;
  description: string;
  ownerId: string;
  code: string;
  colorIndex: number;
  /** members 서브컬렉션 집계로 채워짐 (목록/상세에서 setMemberCount) */
  memberCount: number;
  archived: boolean;
  createdAt: number | null;
};

export type Member = {
  uid: string;
  role: Role;
  displayName: string;
  photoURL: string;
  joinedAt: number | null;
};

// 한글 학급 코드: 색상 + 동물 (예: 파란고양이)
const CODE_COLORS = [
  "빨간", "파란", "노란", "초록", "보라", "검은", "하얀",
  "분홍", "주황", "갈색", "회색", "청록", "남색", "연두",
];
const CODE_ANIMALS = [
  "고양이", "강아지", "토끼", "호랑이", "사자", "곰", "여우",
  "사슴", "펭귄", "부엉이", "다람쥐", "거북이", "고래", "돌고래",
  "코끼리", "판다", "늑대", "수달", "햄스터", "기린",
];

function genCode() {
  const c = CODE_COLORS[Math.floor(Math.random() * CODE_COLORS.length)];
  const a = CODE_ANIMALS[Math.floor(Math.random() * CODE_ANIMALS.length)];
  return `${c}${a}`;
}

function profile(u: User) {
  return {
    displayName: u.displayName ?? "이름없음",
    photoURL: u.photoURL ?? "",
  };
}

/** 학급 개설 — 개설자는 teacher 멤버로 등록 */
export async function createClass(
  owner: User,
  data: { name: string; subject: string; description: string }
): Promise<string> {
  const db = getDbClient();
  const classRef = doc(collection(db, "classes"));
  const memberRef = doc(db, "classes", classRef.id, "members", owner.uid);

  const batch = writeBatch(db);
  batch.set(classRef, {
    name: data.name.trim(),
    subject: data.subject.trim(),
    description: data.description.trim(),
    ownerId: owner.uid,
    code: genCode(),
    colorIndex: Math.floor(Math.random() * 5),
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(memberRef, {
    uid: owner.uid,
    classId: classRef.id,
    role: "teacher" as Role,
    ...profile(owner),
    joinedAt: serverTimestamp(),
  });
  // 소속 학급 id를 사용자 문서에 기록 (collectionGroup 없이 '내 학급' 조회)
  batch.set(
    doc(db, "users", owner.uid),
    { classIds: arrayUnion(classRef.id) },
    { merge: true }
  );
  await batch.commit();
  return classRef.id;
}

/** 코드로 참여 — student 멤버로 등록 */
export async function joinClassByCode(
  code: string,
  user: User
): Promise<ClassRoom> {
  const db = getDbClient();
  const snap = await getDocs(
    query(
      collection(db, "classes"),
      where("code", "==", code.trim())
    )
  );
  if (snap.empty) throw new Error("해당 코드의 학급을 찾을 수 없습니다.");

  const classDoc = snap.docs[0];
  const memberRef = doc(
    db,
    "classes",
    classDoc.id,
    "members",
    user.uid
  );
  const existing = await getDoc(memberRef);

  const batch = writeBatch(db);
  if (!existing.exists()) {
    batch.set(memberRef, {
      uid: user.uid,
      classId: classDoc.id,
      role: "student" as Role,
      ...profile(user),
      joinedAt: serverTimestamp(),
    });
  }
  batch.set(
    doc(db, "users", user.uid),
    { classIds: arrayUnion(classDoc.id) },
    { merge: true }
  );
  await batch.commit();
  return mapClass(classDoc.id, classDoc.data());
}

/** 내 학급 목록 — users/{uid}.classIds 기반 (collectionGroup 미사용) */
export async function listMyClasses(uid: string): Promise<ClassRoom[]> {
  const db = getDbClient();
  const userDoc = await getDoc(doc(db, "users", uid));
  const ids = ((userDoc.data()?.classIds as string[]) ?? []).filter(
    Boolean
  );
  if (ids.length === 0) return [];

  // documentId in 쿼리는 10개 제한 → 청크 분할
  const rooms: ClassRoom[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const cs = await getDocs(
      query(collection(db, "classes"), where(documentId(), "in", chunk))
    );
    cs.forEach((d) => rooms.push(mapClass(d.id, d.data())));
  }
  await Promise.all(
    rooms.map(async (r) => {
      r.memberCount = await getMemberCount(r.id);
    })
  );
  return rooms.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/** members 서브컬렉션 집계 카운트 */
export async function getMemberCount(classId: string): Promise<number> {
  const db = getDbClient();
  const agg = await getCountFromServer(
    collection(db, "classes", classId, "members")
  );
  return agg.data().count;
}

export async function getClass(id: string): Promise<ClassRoom | null> {
  const db = getDbClient();
  const d = await getDoc(doc(db, "classes", id));
  return d.exists() ? mapClass(d.id, d.data()) : null;
}

/** 학급 메타 수정 (이름·과목·설명) — 교사만 (규칙) */
export async function updateClass(
  id: string,
  patch: { name?: string; subject?: string; description?: string }
): Promise<void> {
  const p: Record<string, unknown> = { ...patch };
  if (typeof p.name === "string") p.name = (p.name as string).trim();
  if (typeof p.subject === "string")
    p.subject = (p.subject as string).trim();
  await setDoc(doc(getDbClient(), "classes", id), p, { merge: true });
}

export async function getMyRole(
  classId: string,
  uid: string
): Promise<Role | null> {
  const db = getDbClient();
  const d = await getDoc(doc(db, "classes", classId, "members", uid));
  return d.exists() ? ((d.data().role as Role) ?? null) : null;
}

export async function listMembers(classId: string): Promise<Member[]> {
  const db = getDbClient();
  // 복합 인덱스(orderBy 2개) 회피 → 전체 읽고 클라이언트 정렬
  const snap = await getDocs(
    collection(db, "classes", classId, "members")
  );
  const list = snap.docs.map((d) => {
    const v = d.data();
    const ts = v.joinedAt as { toMillis?: () => number } | undefined;
    return {
      uid: (v.uid as string) ?? d.id,
      role: (v.role as Role) ?? "student",
      displayName: (v.displayName as string) ?? "이름없음",
      photoURL: (v.photoURL as string) ?? "",
      joinedAt: ts?.toMillis ? ts.toMillis() : null,
    };
  });
  return list.sort(
    (a, b) =>
      a.role.localeCompare(b.role) ||
      (a.joinedAt ?? 0) - (b.joinedAt ?? 0)
  );
}

// 실시간 멤버 구독 (아바타/이름 변경 즉시 반영)
export function watchMembers(
  classId: string,
  cb: (members: Member[]) => void
): () => void {
  return onSnapshot(
    collection(getDbClient(), "classes", classId, "members"),
    (snap) => {
      const list = snap.docs.map((d) => {
        const v = d.data();
        const ts = v.joinedAt as { toMillis?: () => number } | undefined;
        return {
          uid: (v.uid as string) ?? d.id,
          role: (v.role as Role) ?? "student",
          displayName: (v.displayName as string) ?? "이름없음",
          photoURL: (v.photoURL as string) ?? "",
          joinedAt: ts?.toMillis ? ts.toMillis() : null,
        };
      });
      cb(
        list.sort(
          (a, b) =>
            a.role.localeCompare(b.role) ||
            (a.joinedAt ?? 0) - (b.joinedAt ?? 0)
        )
      );
    },
    () => cb([])
  );
}

function mapClass(id: string, v: Record<string, unknown>): ClassRoom {
  const ts = v.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    name: (v.name as string) ?? "",
    subject: (v.subject as string) ?? "",
    description: (v.description as string) ?? "",
    ownerId: (v.ownerId as string) ?? "",
    code: (v.code as string) ?? "",
    colorIndex: (v.colorIndex as number) ?? 0,
    memberCount: 0, // listMyClasses / getMemberCount 에서 채움
    archived: Boolean(v.archived),
    createdAt: ts?.toMillis ? ts.toMillis() : null,
  };
}
