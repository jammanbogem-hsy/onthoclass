// 사용자 계정 문서 + 온보딩(역할 가입)
//
// users/{uid}: role('teacher'|'student'), name(가입 시 입력), displayName/email/photoURL
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
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
  school: string; // 소속 학교(가입 시 선택, 교사용). 없으면 ""
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
  const db = getDbClient();
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const base = {
    email: user.email ?? "",
    photoURL: user.photoURL ?? "",
  };
  if (!snap.exists()) {
    // merge:true 로 생성 — 이메일 가입 직후 setUserSchool 가 먼저 doc 을 만들었어도
    // school 등 기존 필드를 보존한다(레이스 안전).
    await setDoc(ref, { ...base, createdAt: serverTimestamp() }, { merge: true });
  } else if (!snap.data()?.createdAt) {
    // 기존 문서에 createdAt 이 없으면(레이스로 school 이 먼저 쓰인 경우) 채워준다.
    await setDoc(ref, { ...base, createdAt: serverTimestamp() }, { merge: true });
  } else {
    await setDoc(ref, base, { merge: true });
  }
}

/**
 * 공개 회원 수 — 로그인 전(비인증)에도 사용 가능.
 * Admin Cloud Function(publicMemberCount)이 users 수를 집계·캐시해 반환한다.
 * 클라이언트 컬렉션 집계 권한에 의존하지 않아 콜드 스타트에도 안정적.
 * 실패해도 0 반환(throw 안 함) — 화면은 0이면 카운트 줄을 숨긴다.
 */
export async function getPublicMemberCount(): Promise<number> {
  try {
    const fn = httpsCallable<unknown, { count: number }>(
      getFunctionsClient(),
      "publicMemberCount"
    );
    const res = await fn({});
    const n = res.data?.count;
    return typeof n === "number" && isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** 소속 학교 저장(본인 user 문서). 빈 값이면 무시. */
export async function setUserSchool(
  uid: string,
  school: string
): Promise<void> {
  if (!school.trim()) return;
  await setDoc(
    doc(getDbClient(), "users", uid),
    { school: school.trim() },
    { merge: true }
  ).catch(() => {});
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
    school: (v.school as string) ?? "",
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

/** 교사 회원가입 — 이름 + 시스템 코드(+ 선택: 학교).
 *  코드 검증과 role 부여는 서버(claimTeacherRole)에서 admin 권한으로 처리한다.
 *  (클라이언트는 role 을 'teacher' 로 직접 쓸 수 없도록 규칙으로 잠겨 있음)
 *  학교는 본인 user 문서에 직접 기록(규칙상 role 외 자기 문서 쓰기 허용). */
export async function completeTeacherOnboarding(
  user: User,
  name: string,
  systemCode: string,
  school = ""
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
  if (school.trim()) {
    await setDoc(
      doc(getDbClient(), "users", user.uid),
      { school: school.trim() },
      { merge: true }
    ).catch(() => {});
  }
}

export type ClaimableStudent = { id: string; name: string; photoURL: string };

/** 학급 코드로 그 반의 학생 명단 조회(이름으로 이어가기 선택용). */
export async function listClaimableStudents(code: string): Promise<{
  classId: string;
  className: string;
  students: ClaimableStudent[];
}> {
  const fn = httpsCallable<
    { code: string },
    { classId: string; className: string; students: ClaimableStudent[] }
  >(getFunctionsClient(), "listClaimableStudents");
  const res = await fn({ code: code.trim() });
  return res.data;
}

/** 이름으로 이어가기 — 기존 학생 프로필(fromUid)의 데이터를 현재 계정으로 인계. */
export async function claimStudentProfile(
  code: string,
  fromUid: string
): Promise<{ classId: string }> {
  const fn = httpsCallable<
    { code: string; fromUid: string },
    { ok: true; classId: string }
  >(getFunctionsClient(), "claimStudentProfile");
  const res = await fn({ code: code.trim(), fromUid });
  return { classId: res.data.classId };
}

/** 교사용: 한 학급의 두 학생 프로필 합치기(fromUid 데이터를 toUid 로 병합 후 중복 제거). */
export async function mergeStudentProfiles(
  classId: string,
  fromUid: string,
  toUid: string
): Promise<{ moved: Record<string, number>; errors: string[] }> {
  const fn = httpsCallable<
    { classId: string; fromUid: string; toUid: string },
    { ok: true; moved: Record<string, number>; errors: string[] }
  >(getFunctionsClient(), "mergeStudentProfiles");
  const res = await fn({ classId, fromUid, toUid });
  return { moved: res.data.moved, errors: res.data.errors };
}

/** 학생 회원가입 — 이름 + 학급 코드. 서버(Cloud Function)에서 코드 매칭+멤버 등록. */
export async function completeStudentOnboarding(
  _user: User,
  name: string,
  classCode: string
): Promise<{ classId: string }> {
  if (!name.trim()) throw new Error("이름을 입력해 주세요.");
  const trimmed = classCode.trim();
  if (!trimmed) throw new Error("학급 코드를 입력해 주세요.");
  const fn = httpsCallable<
    { code: string; displayName: string },
    { id: string }
  >(getFunctionsClient(), "joinClassByCode");
  try {
    const res = await fn({ code: trimmed, displayName: name.trim() });
    return { classId: res.data.id };
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "";
    if (code.includes("not-found"))
      throw new Error("학급 코드를 찾을 수 없습니다.");
    throw new Error("학급 참여에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
