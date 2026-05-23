// 사용자 계정 문서 + 온보딩(역할 가입)
//
// users/{uid}: role('teacher'|'student'), name(가입 시 입력), displayName/email/photoURL
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { User } from "firebase/auth";
import { getDbClient, getFunctionsClient } from "@/lib/firebase";

export type AccountRole = "teacher" | "student";

export type UserProfile = {
  role: AccountRole | null; // null = 아직 온보딩 안 함
  name: string;
  email: string;
  photoURL: string;
  avatar: string; // 선택한 아바타 경로 (예: /avatar/3.png). ensureUserDoc가 덮지 않음
};

// public/avatar/1.png … N.png
export const AVATAR_COUNT = 23;
export const AVATARS = Array.from(
  { length: AVATAR_COUNT },
  (_, i) => `/avatar/${i + 1}.png`
);
// public/avatar2/1.png … 25.png (2페이지)
export const AVATARS_PAGE2 = Array.from(
  { length: 25 },
  (_, i) => `/avatar2/${i + 1}.png`
);
// 아바타 선택 페이지 목록
export const AVATAR_PAGES: { label: string; items: string[] }[] = [
  { label: "1페이지", items: AVATARS },
  { label: "2페이지", items: AVATARS_PAGE2 },
];

// 교사 가입 코드는 서버(claimTeacherRole)에서만 검증한다 — 클라이언트에 두지 않음.

/** 로그인 시 기본 프로필(이메일/사진) 동기화. 역할은 건드리지 않음. */
export async function ensureUserDoc(user: User): Promise<void> {
  const ref = doc(getDbClient(), "users", user.uid);
  const snap = await getDoc(ref);
  const base = {
    email: user.email ?? "",
    photoURL: user.photoURL ?? "",
  };
  if (!snap.exists()) {
    await setDoc(ref, { ...base, createdAt: serverTimestamp() });
  } else {
    await setDoc(ref, base, { merge: true });
  }
}

export async function getUserProfile(
  uid: string
): Promise<UserProfile | null> {
  const snap = await getDoc(doc(getDbClient(), "users", uid));
  if (!snap.exists()) return null;
  const v = snap.data();
  return {
    role: (v.role as AccountRole) ?? null,
    name: (v.name as string) ?? "",
    email: (v.email as string) ?? "",
    photoURL: (v.photoURL as string) ?? "",
    avatar: (v.avatar as string) ?? "",
  };
}

/**
 * 아바타 선택/변경 — 프로필(avatar) + 소속 학급 멤버(photoURL) 동기화.
 * avatarPath 가 "" 이면 선택 해제 → 기본 구글 프로필(googlePhoto)로 되돌림.
 */
export async function setUserAvatar(
  uid: string,
  avatarPath: string,
  googlePhoto = ""
): Promise<void> {
  const db = getDbClient();
  const memberPhoto = avatarPath || googlePhoto; // 미선택이면 구글 사진
  await setDoc(doc(db, "users", uid), { avatar: avatarPath }, { merge: true });
  // 랭킹/학급 관리/보드가 보는 member.photoURL 도 함께 갱신
  const userDoc = await getDoc(doc(db, "users", uid));
  const ids = ((userDoc.data()?.classIds as string[]) ?? []).filter(Boolean);
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  ids.forEach((cid) => {
    batch.set(
      doc(db, "classes", cid, "members", uid),
      { photoURL: memberPhoto },
      { merge: true }
    );
  });
  await batch.commit();
}

/** 교사 회원가입 — 이름 + 시스템 코드.
 *  코드 검증과 role 부여는 서버(claimTeacherRole)에서 admin 권한으로 처리한다.
 *  (클라이언트는 role 을 'teacher' 로 직접 쓸 수 없도록 규칙으로 잠겨 있음) */
export async function completeTeacherOnboarding(
  user: User,
  name: string,
  systemCode: string
): Promise<void> {
  if (!name.trim()) throw new Error("이름을 입력해 주세요.");
  const fn = httpsCallable<{ code: string; name: string }, { ok: true }>(
    getFunctionsClient(),
    "claimTeacherRole"
  );
  try {
    await fn({ code: systemCode.trim(), name: name.trim() });
  } catch (e) {
    const msg =
      (e as { message?: string })?.message ?? "교사 가입에 실패했습니다.";
    throw new Error(
      /code|permission/i.test(msg) ? "시스템 코드가 올바르지 않습니다." : msg
    );
  }
}

/** 학생 회원가입 — 이름 + 학급 코드(한글). 프로필 + 학급 멤버 동시 등록 */
export async function completeStudentOnboarding(
  user: User,
  name: string,
  classCode: string
): Promise<{ classId: string }> {
  if (!name.trim()) throw new Error("이름을 입력해 주세요.");
  const db = getDbClient();

  const snap = await getDocs(
    query(
      collection(db, "classes"),
      where("code", "==", classCode.trim())
    )
  );
  if (snap.empty) throw new Error("학급 코드를 찾을 수 없습니다.");
  const classDoc = snap.docs[0];

  const batch = writeBatch(db);
  batch.set(
    doc(db, "users", user.uid),
    {
      role: "student",
      name: name.trim(),
      email: user.email ?? "",
      photoURL: user.photoURL ?? "",
      classIds: arrayUnion(classDoc.id),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
  batch.set(
    doc(db, "classes", classDoc.id, "members", user.uid),
    {
      uid: user.uid,
      classId: classDoc.id,
      role: "student",
      displayName: name.trim(),
      photoURL: user.photoURL ?? "",
      joinedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
  return { classId: classDoc.id };
}
