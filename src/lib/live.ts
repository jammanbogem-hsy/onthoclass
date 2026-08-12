// 실시간 교실 제어 — 교사 → 학생
//   classes/{cid}/signals/{uid}   : 특정 학생에게 보내는 1회성 효과(미션완료/레벨업)
//   classes/{cid}/control/lock    : 학급 전체 활동 잠금(Sandy 타이머)
import {
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getDbClient } from "@/lib/firebase";

// ---------- 개별 효과 신호 ----------
export type EffectKind =
  | "mission"
  | "level"
  | "present"
  | "badge"
  | "praise";

export type EffectSignal = {
  kind: EffectKind;
  title: string;
  subtitle?: string;
  by: string;
  nonce: number; // 변경 감지용(같은 효과 재전송도 트리거)
};

const signalRef = (cid: string, uid: string) =>
  doc(getDbClient(), "classes", cid, "signals", uid);

/** 교사 → 학생: 효과 전달(학생 화면에서 즉시 축하 연출) */
export async function sendEffect(
  cid: string,
  uid: string,
  effect: { kind: EffectKind; title: string; subtitle?: string },
  by: string
): Promise<void> {
  await setDoc(signalRef(cid, uid), {
    kind: effect.kind,
    title: effect.title,
    subtitle: effect.subtitle ?? "",
    by,
    nonce: Date.now() + Math.floor(Math.random() * 1000),
    at: serverTimestamp(),
  });
}

/** 본인에게 온 효과 신호 구독 */
export function watchSignal(
  cid: string,
  uid: string,
  cb: (sig: EffectSignal | null) => void
): () => void {
  return onSnapshot(
    signalRef(cid, uid),
    (snap) => {
      if (!snap.exists()) return cb(null);
      const v = snap.data();
      cb({
        kind: (v.kind as EffectKind) ?? "mission",
        title: (v.title as string) ?? "",
        subtitle: (v.subtitle as string) || undefined,
        by: (v.by as string) ?? "",
        nonce: (v.nonce as number) ?? 0,
      });
    },
    () => cb(null)
  );
}

// ---------- 활동 잠금(Sandy 타이머) ----------
export type ActivityLock = {
  active: boolean;
  until: number | null; // epoch ms — 이 시각이 지나면 자동 해제
  startedAt: number | null;
  durationMs: number;
  by: string;
};

const lockRef = (cid: string) =>
  doc(getDbClient(), "classes", cid, "control", "lock");

/** 학급 전체 활동 잠금 켜기 — durationMs 동안 학생 활동 차단 */
export async function startLock(
  cid: string,
  durationMs: number,
  by: string
): Promise<void> {
  const now = Date.now();
  await setDoc(lockRef(cid), {
    active: true,
    startedAt: now,
    durationMs: Math.max(0, Math.floor(durationMs)),
    until: durationMs > 0 ? now + Math.floor(durationMs) : null,
    by,
    at: serverTimestamp(),
  });
}

/** 잠금 해제(교사가 도중에 끄기) */
export async function stopLock(cid: string): Promise<void> {
  await setDoc(
    lockRef(cid),
    { active: false, until: deleteField(), at: serverTimestamp() },
    { merge: true }
  );
}

export function watchLock(
  cid: string,
  cb: (lock: ActivityLock | null) => void
): () => void {
  return onSnapshot(
    lockRef(cid),
    (snap) => {
      if (!snap.exists()) return cb(null);
      const v = snap.data();
      cb({
        active: Boolean(v.active),
        until: typeof v.until === "number" ? (v.until as number) : null,
        startedAt: typeof v.startedAt === "number" ? (v.startedAt as number) : null,
        durationMs: (v.durationMs as number) ?? 0,
        by: (v.by as string) ?? "",
      });
    },
    () => cb(null)
  );
}

// ---------- 발표 모드(전체 기본 효과 + 발표자 무지개) ----------
// active : 전체 학생에게 기본 발표 효과 적용(관람·잠금)
// uid    : 그 중 무지개 발표 화면을 추가로 받는 발표자(없으면 모두 기본)
export type PresentState = {
  active: boolean;
  uid: string | null;
  name: string;
  cheer: string;
  by: string;
};

const presentRef = (cid: string) =>
  doc(getDbClient(), "classes", cid, "control", "present");

/** 전체 학생에게 기본 발표 효과 적용(아직 발표자 없음) */
export async function startPresent(cid: string, by: string): Promise<void> {
  await setDoc(presentRef(cid), {
    active: true,
    uid: null,
    name: "",
    cheer: "",
    by,
    at: serverTimestamp(),
  });
}

/** 발표자 지정 — 해당 학생은 무지개 발표 화면, 나머지는 기본(관람) */
export async function setPresenter(
  cid: string,
  uid: string,
  name: string,
  cheer: string,
  by: string
): Promise<void> {
  await setDoc(
    presentRef(cid),
    {
      active: true,
      uid,
      name: name ?? "",
      cheer: cheer ?? "",
      by,
      at: serverTimestamp(),
    },
    { merge: true }
  );
}

/** 발표자 해제 — 전체 기본 효과는 유지하고 무지개만 거둠 */
export async function clearPresenter(cid: string): Promise<void> {
  await setDoc(
    presentRef(cid),
    { uid: null, name: "", cheer: "", at: serverTimestamp() },
    { merge: true }
  );
}

/** 발표 모드 완전 종료(전체 효과·발표자 모두 해제) */
export async function stopPresent(cid: string): Promise<void> {
  await setDoc(
    presentRef(cid),
    { active: false, uid: null, at: serverTimestamp() },
    { merge: true }
  );
}

export function watchPresent(
  cid: string,
  cb: (state: PresentState | null) => void
): () => void {
  return onSnapshot(
    presentRef(cid),
    (snap) => {
      if (!snap.exists()) return cb(null);
      const v = snap.data();
      cb({
        active: Boolean(v.active),
        uid: (v.uid as string) || null,
        name: (v.name as string) ?? "",
        cheer: (v.cheer as string) ?? "",
        by: (v.by as string) ?? "",
      });
    },
    () => cb(null)
  );
}

// ---------- 클래스앱 콘솔(교안 슬라이드쇼 + 교사 제어) ----------
// classes/{cid}/control/classapp 한 문서에 집중 잠금 + 링크 모달 상태를 함께 담는다.
//  · focus : 학생 화면 전체를 덮는 집중 모달(교사가 끌 때까지 유지, 타이머 없음)
//  · link  : 학생 화면에 띄우는 링크 모달(nonce 가 바뀌면 다시 표시)
export type ClassAppControl = {
  focusActive: boolean;
  focusMessage: string;
  linkActive: boolean;
  linkUrl: string;
  linkTitle: string;
  linkNonce: number;
  by: string;
};

const classAppRef = (cid: string) =>
  doc(getDbClient(), "classes", cid, "control", "classapp");

/** 집중 잠금 켜기/끄기 — active=true 면 학생 화면을 덮어 활동 차단(교사가 끌 때까지). */
export async function setFocusLock(
  cid: string,
  active: boolean,
  message: string,
  by: string
): Promise<void> {
  await setDoc(
    classAppRef(cid),
    { focusActive: active, focusMessage: message ?? "", by, at: serverTimestamp() },
    { merge: true }
  );
}

/** 학생 화면에 링크 모달 띄우기(nonce 갱신 → 닫았던 학생도 다시 표시). */
export async function pushLink(
  cid: string,
  url: string,
  title: string,
  by: string
): Promise<void> {
  await setDoc(
    classAppRef(cid),
    {
      linkActive: true,
      linkUrl: url ?? "",
      linkTitle: title ?? "",
      linkNonce: Date.now() + Math.floor(Math.random() * 1000),
      by,
      at: serverTimestamp(),
    },
    { merge: true }
  );
}

/** 링크 모달 내리기 */
export async function clearLink(cid: string, by: string): Promise<void> {
  await setDoc(
    classAppRef(cid),
    { linkActive: false, by, at: serverTimestamp() },
    { merge: true }
  );
}

/** 콘솔 종료 시 모든 제어 해제(집중 잠금·링크) — 학생이 잠긴 채 남지 않도록. */
export async function clearClassApp(cid: string, by: string): Promise<void> {
  await setDoc(
    classAppRef(cid),
    { focusActive: false, linkActive: false, by, at: serverTimestamp() },
    { merge: true }
  );
}

export function watchClassApp(
  cid: string,
  cb: (state: ClassAppControl | null) => void
): () => void {
  return onSnapshot(
    classAppRef(cid),
    (snap) => {
      if (!snap.exists()) return cb(null);
      const v = snap.data();
      cb({
        focusActive: Boolean(v.focusActive),
        focusMessage: (v.focusMessage as string) ?? "",
        linkActive: Boolean(v.linkActive),
        linkUrl: (v.linkUrl as string) ?? "",
        linkTitle: (v.linkTitle as string) ?? "",
        linkNonce: (v.linkNonce as number) ?? 0,
        by: (v.by as string) ?? "",
      });
    },
    () => cb(null)
  );
}

// ---------- 교사 접속 차시(학생에게 "선생님 접속 중" 실시간 표시) ----------
// classes/{cid}/control/teacherViewing 의 teachers 맵에 교사별 현재 차시를 기록.
// 교사는 차시 페이지에서 하트비트로 갱신, 떠나면 lid=null 로 비운다. 학생은
// onSnapshot 으로 실시간 구독하고, 최근(TTL 이내) 갱신만 "접속 중"으로 본다.
export const TEACHER_VIEW_TTL = 90_000; // 90초 내 갱신만 유효(크래시 자동 정리용)
export type TeacherViewing = {
  uid: string;
  name: string;
  lid: string;
  title: string;
  at: number | null;
};

const teacherViewingRef = (cid: string) =>
  doc(getDbClient(), "classes", cid, "control", "teacherViewing");

/** 교사가 보고 있는 차시를 기록(하트비트마다 호출). */
export async function setTeacherViewing(
  cid: string,
  uid: string,
  name: string,
  lid: string,
  title: string
): Promise<void> {
  await setDoc(
    teacherViewingRef(cid),
    { teachers: { [uid]: { name, lid, title, at: serverTimestamp() } } },
    { merge: true }
  );
}

/** 교사가 차시에서 나감(접속 표시 해제). */
export async function clearTeacherViewing(
  cid: string,
  uid: string
): Promise<void> {
  await setDoc(
    teacherViewingRef(cid),
    { teachers: { [uid]: { lid: null, at: serverTimestamp() } } },
    { merge: true }
  );
}

/** 학생용 실시간 구독 — 현재 교사가 보고 있는 차시 목록(staleness 필터는 호출측). */
export function watchTeacherViewing(
  cid: string,
  cb: (list: TeacherViewing[]) => void
): () => void {
  return onSnapshot(
    teacherViewingRef(cid),
    (snap) => {
      const teachers = (snap.data()?.teachers ?? {}) as Record<
        string,
        {
          name?: string;
          lid?: string | null;
          title?: string;
          at?: { toMillis?: () => number };
        }
      >;
      const list: TeacherViewing[] = [];
      for (const [uid, v] of Object.entries(teachers)) {
        if (!v.lid) continue;
        list.push({
          uid,
          name: v.name || "선생님",
          lid: v.lid,
          title: v.title || "",
          at: v.at?.toMillis ? v.at.toMillis() : null,
        });
      }
      cb(list);
    },
    () => cb([])
  );
}

// ---------- 공지 전광판(헤더 슬라이딩 배너) ----------
// active 인 동안 학생 헤더에 text 가 마퀴(흐르는) 애니메이션으로 표시된다.
// 교사가 고른 색상 팔레트(id) 로 배너 톤을 결정한다.
export type NoticeColor = { id: string; label: string; bg: string; fg: string };
export const NOTICE_COLORS: NoticeColor[] = [
  { id: "slate", label: "차분", bg: "#37474f", fg: "#ffffff" },
  { id: "green", label: "초록", bg: "#2e7d32", fg: "#ffffff" },
  { id: "blue", label: "파랑", bg: "#1565c0", fg: "#ffffff" },
  { id: "violet", label: "보라", bg: "#5e35b1", fg: "#ffffff" },
  { id: "rose", label: "핑크", bg: "#c2185b", fg: "#ffffff" },
  { id: "amber", label: "노랑", bg: "#ff8f00", fg: "#1a1a1a" },
];
export function noticeColor(id: string): NoticeColor {
  return NOTICE_COLORS.find((c) => c.id === id) ?? NOTICE_COLORS[0];
}

export type NoticeState = {
  active: boolean;
  text: string;
  color: string;
  by: string;
};

const noticeRef = (cid: string) =>
  doc(getDbClient(), "classes", cid, "control", "notice");

/** 공지 시작 — 종료할 때까지 학생 헤더에 흐르는 배너로 표시 */
export async function startNotice(
  cid: string,
  text: string,
  color: string,
  by: string
): Promise<void> {
  await setDoc(noticeRef(cid), {
    active: true,
    text: text ?? "",
    color: color ?? NOTICE_COLORS[0].id,
    by,
    at: serverTimestamp(),
  });
}

/** 공지 종료 */
export async function stopNotice(cid: string): Promise<void> {
  await setDoc(
    noticeRef(cid),
    { active: false, at: serverTimestamp() },
    { merge: true }
  );
}

export function watchNotice(
  cid: string,
  cb: (state: NoticeState | null) => void
): () => void {
  return onSnapshot(
    noticeRef(cid),
    (snap) => {
      if (!snap.exists()) return cb(null);
      const v = snap.data();
      cb({
        active: Boolean(v.active),
        text: (v.text as string) ?? "",
        color: (v.color as string) || NOTICE_COLORS[0].id,
        by: (v.by as string) ?? "",
      });
    },
    () => cb(null)
  );
}
