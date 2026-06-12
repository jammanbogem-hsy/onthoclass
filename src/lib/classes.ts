// 학급(클래스) Firestore 헬퍼 — 정식 스키마 v1 (docs/SCHEMA.md 참고)
//
// classes/{classId}                : 학급 메타
// classes/{classId}/members/{uid}  : 멤버 + 역할(teacher/student)
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { User } from "firebase/auth";
import { getDbClient, getFunctionsClient } from "@/lib/firebase";

type JoinResult = {
  id: string;
  name: string;
  subject: string;
  description: string;
  ownerId: string;
  code: string;
  colorIndex: number;
  archived: boolean;
};

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

/** 학급 그룹(폴더) — 교사가 학급을 묶어 정리. classes 데이터와 독립. */
export type ClassGroup = {
  id: string;
  ownerUid: string;
  name: string;
  classIds: string[];
  order: number;
  colorIndex: number;
  createdAt: number | null;
};

// 한글 학급 코드: 색상 + 동물 + 자연어 3단어 (예: 파란고양이태양)
// 단어만으로 외우기 쉬우면서도 조합 공간을 충분히 키워(14×20×50=14,000) 무차별
// 대입을 어렵게 한다. 코드 유일성은 classCodes/{code} 인덱스로 보장하고(충돌 시
// 재생성), 실제 무차별 대입 방어는 joinClassByCode 의 실패횟수 레이트리밋이 담당한다.
const CODE_COLORS = [
  "빨간", "파란", "노란", "초록", "보라", "검은", "하얀",
  "분홍", "주황", "갈색", "회색", "청록", "남색", "연두",
];
const CODE_ANIMALS = [
  "고양이", "강아지", "토끼", "호랑이", "사자", "곰", "여우",
  "사슴", "펭귄", "부엉이", "다람쥐", "거북이", "고래", "돌고래",
  "코끼리", "판다", "늑대", "수달", "햄스터", "기린",
];
const CODE_NATURE = [
  "태양", "달빛", "별빛", "바다", "하늘", "구름", "무지개", "바람",
  "번개", "단풍", "새싹", "나무", "숲속", "산봉", "강물", "호수",
  "섬마", "우주", "행성", "은하", "폭포", "모래", "조개", "진주",
  "보석", "황금", "수정", "등대", "풍차", "기차", "로켓", "돛배",
  "연꽃", "종소", "북소", "피리", "거울", "보물", "깃발", "노을",
  "이슬", "안개", "햇살", "별똥", "꽃밭", "잔디", "이끼", "서리",
  "메아", "물결",
];

function pick(arr: string[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function genCode() {
  return `${pick(CODE_COLORS)}${pick(CODE_ANIMALS)}${pick(CODE_NATURE)}`;
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

  // 트랜잭션으로 충돌 없는 참여 코드를 예약(classCodes/{code})하고 학급·멤버·소속을
  // 한 번에 커밋한다. classCodes 가 code→classId 를 유일하게 매핑하므로 가입 시
  // .limit(1) 모호함(엉뚱한 학급 배정)이 사라진다.
  await runTransaction(db, async (tx) => {
    let code = "";
    for (let i = 0; i < 10; i++) {
      const cand = genCode();
      // 모든 read 는 write 보다 먼저 수행되어야 한다(트랜잭션 제약).
      const snap = await tx.get(doc(db, "classCodes", cand));
      if (!snap.exists()) {
        code = cand;
        break;
      }
    }
    if (!code) throw new Error("참여 코드 생성에 실패했습니다. 다시 시도해 주세요.");

    tx.set(doc(db, "classCodes", code), {
      classId: classRef.id,
      ownerId: owner.uid,
      createdAt: serverTimestamp(),
    });
    tx.set(classRef, {
      name: data.name.trim(),
      subject: data.subject.trim(),
      description: data.description.trim(),
      ownerId: owner.uid,
      code,
      colorIndex: Math.floor(Math.random() * 12),
      archived: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.set(memberRef, {
      uid: owner.uid,
      classId: classRef.id,
      role: "teacher" as Role,
      ...profile(owner),
      joinedAt: serverTimestamp(),
    });
    // 소속 학급 id를 사용자 문서에 기록 (collectionGroup 없이 '내 학급' 조회)
    tx.set(
      doc(db, "users", owner.uid),
      { classIds: arrayUnion(classRef.id) },
      { merge: true }
    );
  });
  return classRef.id;
}

/**
 * 코드로 참여 — student 멤버로 등록. 서버(Cloud Function)에서 admin 으로 처리해
 * 비멤버가 classes 컬렉션을 직접 조회하지 않도록 한다(초대코드 노출 차단).
 */
export async function joinClassByCode(
  code: string,
  _user: User
): Promise<ClassRoom> {
  const fn = httpsCallable<{ code: string }, JoinResult>(
    getFunctionsClient(),
    "joinClassByCode"
  );
  try {
    const res = await fn({ code: code.trim() });
    const d = res.data;
    return {
      id: d.id,
      name: d.name,
      subject: d.subject,
      description: d.description,
      ownerId: d.ownerId,
      code: d.code,
      colorIndex: d.colorIndex,
      memberCount: 0,
      archived: d.archived,
      createdAt: null,
    };
  } catch (e) {
    const code2 = (e as { code?: string })?.code ?? "";
    if (code2.includes("not-found"))
      throw new Error("해당 코드의 학급을 찾을 수 없습니다.");
    throw new Error("학급 참여에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

/** 내 학급 목록 — users/{uid}.classIds 기반 (collectionGroup 미사용) */
export async function listMyClasses(uid: string): Promise<ClassRoom[]> {
  const db = getDbClient();
  const userDoc = await getDoc(doc(db, "users", uid));
  const ids = ((userDoc.data()?.classIds as string[]) ?? []).filter(
    Boolean
  );
  if (ids.length === 0) return [];

  // 멤버인 학급만 단건 get(규칙: classes get = 멤버/팀원). 컬렉션 list 미사용.
  const docs = await Promise.all(
    ids.map((id) => getDoc(doc(db, "classes", id)).catch(() => null))
  );
  const rooms = docs
    .filter((s): s is NonNullable<typeof s> => !!s && s.exists())
    .map((s) => mapClass(s.id, s.data() as Record<string, unknown>));
  await Promise.all(
    rooms.map(async (r) => {
      r.memberCount = await getMemberCount(r.id);
    })
  );
  // users.classIds 배열 순서를 그대로 유지(드래그 재배치 반영). 정렬하지 않음.
  return rooms;
}

/** members 서브컬렉션 집계 카운트 */
export async function getMemberCount(classId: string): Promise<number> {
  const db = getDbClient();
  const agg = await getCountFromServer(
    collection(db, "classes", classId, "members")
  );
  return agg.data().count;
}

// ---------------- 학급 그룹(폴더) ----------------
function mapClassGroup(id: string, v: Record<string, unknown>): ClassGroup {
  const ts = v.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    ownerUid: (v.ownerUid as string) ?? "",
    name: (v.name as string) ?? "",
    classIds: Array.isArray(v.classIds)
      ? (v.classIds as unknown[]).map((x) => String(x))
      : [],
    order: (v.order as number) ?? 0,
    colorIndex: (v.colorIndex as number) ?? 0,
    createdAt: ts?.toMillis ? ts.toMillis() : null,
  };
}

/** 그룹(폴더) 생성 — 교사 본인 소유 */
export async function createClassGroup(
  ownerUid: string,
  name: string
): Promise<string> {
  const ref = doc(collection(getDbClient(), "classGroups"));
  await setDoc(ref, {
    ownerUid,
    name: name.trim() || "새 폴더",
    classIds: [],
    order: Date.now(),
    colorIndex: Math.floor(Math.random() * 12),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** 폴더 라벨 색상 변경 */
export async function setClassGroupColor(
  groupId: string,
  colorIndex: number
): Promise<void> {
  await updateDoc(doc(getDbClient(), "classGroups", groupId), { colorIndex });
}

/** 내 그룹 목록 (order 오름차순) */
export async function listClassGroups(uid: string): Promise<ClassGroup[]> {
  const snap = await getDocs(
    query(
      collection(getDbClient(), "classGroups"),
      where("ownerUid", "==", uid)
    )
  );
  return snap.docs
    .map((d) => mapClassGroup(d.id, d.data()))
    .sort((a, b) => a.order - b.order);
}

/** 단일 그룹(폴더) 조회 — listClassGroups 항목과 동일 shape, 없으면 null */
export async function getClassGroup(
  groupId: string
): Promise<ClassGroup | null> {
  const d = await getDoc(doc(getDbClient(), "classGroups", groupId));
  return d.exists() ? mapClassGroup(d.id, d.data()) : null;
}

/** 그룹 이름 변경 */
export async function renameClassGroup(
  groupId: string,
  name: string
): Promise<void> {
  await updateDoc(doc(getDbClient(), "classGroups", groupId), {
    name: name.trim() || "새 폴더",
  });
}

/** 학급을 그룹에 넣기/빼기. groupId=null 이면 fromGroupId 에서 제거만. */
export async function setClassGroup(
  classId: string,
  groupId: string | null,
  fromGroupId?: string | null
): Promise<void> {
  const db = getDbClient();
  // 다른 그룹에 있었다면 거기서 제거(한 학급은 한 폴더에만)
  if (fromGroupId && fromGroupId !== groupId) {
    await updateDoc(doc(db, "classGroups", fromGroupId), {
      classIds: arrayRemove(classId),
    });
  }
  if (groupId) {
    await updateDoc(doc(db, "classGroups", groupId), {
      classIds: arrayUnion(classId),
    });
  }
}

/** 그룹 삭제 (학급 데이터는 그대로, 참조만 제거) */
export async function deleteClassGroup(groupId: string): Promise<void> {
  await deleteDoc(doc(getDbClient(), "classGroups", groupId));
}

/** 폴더 안 학급 순서 저장 (드래그 재배치) — classIds 배열을 그대로 덮어씀. */
export async function reorderGroupClasses(
  groupId: string,
  classIds: string[]
): Promise<void> {
  await updateDoc(doc(getDbClient(), "classGroups", groupId), { classIds });
}

/** 미분류(폴더 밖) 학급 순서 저장 — users.classIds 배열 순서로 보관. */
export async function reorderMyClasses(
  uid: string,
  classIds: string[]
): Promise<void> {
  await setDoc(
    doc(getDbClient(), "users", uid),
    { classIds },
    { merge: true }
  );
}

/** 학급 라벨 색상(colorIndex) 변경 — 교사만(규칙). */
export async function setClassColor(
  classId: string,
  colorIndex: number
): Promise<void> {
  await setDoc(
    doc(getDbClient(), "classes", classId),
    { colorIndex },
    { merge: true }
  );
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

/** 본인 멤버 프로필(역할 + 학급 표시 이름). 게임 등에서 정확한 이름이 필요할 때. */
export async function getMemberProfile(
  classId: string,
  uid: string
): Promise<{ role: Role; displayName: string; photoURL: string } | null> {
  const db = getDbClient();
  const d = await getDoc(doc(db, "classes", classId, "members", uid));
  if (!d.exists()) return null;
  const v = d.data();
  return {
    role: (v.role as Role) ?? "student",
    displayName: (v.displayName as string) ?? "",
    photoURL: (v.photoURL as string) ?? "",
  };
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
