// 1:1 메시지 (교사 ↔ 학생, 실시간)
//
// classes/{cid}/threads/{studentUid}/messages/{mid}                 클래스 레벨 DM
// classes/{cid}/lessons/{lid}/threads/{studentUid}/messages/{mid}   차시 레벨 DM
//
// 모든 글은 onSnapshot 구독. 알림은 별도 트리거(차후)로.
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDbClient } from "@/lib/firebase";

export type Msg = {
  id: string;
  authorUid: string;
  authorName: string;
  authorRole: "teacher" | "student";
  text: string;
  scope: "class" | "lesson";
  lessonId?: string; // scope==="lesson" 일 때만
  createdAt: number | null;
};

const classCol = (cid: string, studentUid: string) =>
  collection(getDbClient(), "classes", cid, "threads", studentUid, "messages");

const lessonCol = (cid: string, lid: string, studentUid: string) =>
  collection(
    getDbClient(),
    "classes",
    cid,
    "lessons",
    lid,
    "threads",
    studentUid,
    "messages"
  );

function mapMsg(
  id: string,
  v: Record<string, unknown>,
  scope: "class" | "lesson",
  lessonId?: string
): Msg {
  const ts = v.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    authorUid: (v.authorUid as string) ?? "",
    authorName: (v.authorName as string) ?? "",
    authorRole: ((v.authorRole as string) ?? "student") as
      | "teacher"
      | "student",
    text: (v.text as string) ?? "",
    scope,
    lessonId,
    createdAt: ts?.toMillis ? ts.toMillis() : null,
  };
}

export function watchClassMessages(
  cid: string,
  studentUid: string,
  cb: (m: Msg[]) => void,
  onError?: (e: Error) => void
): () => void {
  return onSnapshot(
    classCol(cid, studentUid),
    (snap) =>
      cb(
        snap.docs
          .map((d) => mapMsg(d.id, d.data(), "class"))
          .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      ),
    (err) => {
      console.error("[watchClassMessages]", err);
      onError?.(err);
      cb([]);
    }
  );
}

export function watchLessonMessages(
  cid: string,
  lid: string,
  studentUid: string,
  cb: (m: Msg[]) => void,
  onError?: (e: Error) => void
): () => void {
  return onSnapshot(
    lessonCol(cid, lid, studentUid),
    (snap) =>
      cb(
        snap.docs
          .map((d) => mapMsg(d.id, d.data(), "lesson", lid))
          .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      ),
    (err) => {
      console.error("[watchLessonMessages]", err);
      onError?.(err);
      cb([]);
    }
  );
}

/** 학급 + 선택한 차시들의 메시지를 시간순 머지 구독 */
export function watchAllForStudent(
  cid: string,
  studentUid: string,
  lessonIds: string[],
  cb: (m: Msg[]) => void
): () => void {
  const buckets = new Map<string, Msg[]>();
  buckets.set("__class", []);
  for (const lid of lessonIds) buckets.set(lid, []);

  const emit = () => {
    const all: Msg[] = [];
    for (const arr of buckets.values()) all.push(...arr);
    all.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    cb(all);
  };

  const unsubs: (() => void)[] = [];
  unsubs.push(
    watchClassMessages(cid, studentUid, (m) => {
      buckets.set("__class", m);
      emit();
    })
  );
  for (const lid of lessonIds) {
    unsubs.push(
      watchLessonMessages(cid, lid, studentUid, (m) => {
        buckets.set(lid, m);
        emit();
      })
    );
  }
  return () => unsubs.forEach((u) => u());
}

/** 메시지함(교사용): 학생별 '최근 한 줄' 요약 */
export type InboxRow = {
  studentUid: string;
  studentName: string;
  lastText: string;
  lastAuthorRole: "teacher" | "student";
  lastAt: number | null;
  count: number; // 그 학생의 클래스 스레드 메시지 수
};

/**
 * 학급 전체 학생의 메시지(클래스 + 모든 차시 스레드)를 한 번에 구독해
 * 학생별 최근 메시지 요약을 만든다. 교사 메시지함(모든 학생이 보낸 것을 한눈에)용.
 * 학생이 차시 화면에서 보낸 메시지(차시 레벨 스레드)도 포함한다.
 */
export function watchClassInbox(
  cid: string,
  students: { uid: string; displayName: string }[],
  lessonIds: string[],
  cb: (rows: InboxRow[]) => void
): () => void {
  // 학생별로 (클래스 + 각 차시) 메시지를 버킷에 모은다.
  const buckets = new Map<string, Map<string, Msg[]>>(); // uid → (sourceKey → msgs)
  const nameOf = new Map(students.map((s) => [s.uid, s.displayName]));
  for (const s of students) buckets.set(s.uid, new Map());

  const emit = () => {
    const rows: InboxRow[] = students.map((s) => {
      const bySrc = buckets.get(s.uid);
      const all: Msg[] = [];
      if (bySrc) for (const arr of bySrc.values()) all.push(...arr);
      all.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      const recent = all[all.length - 1];
      return {
        studentUid: s.uid,
        studentName: nameOf.get(s.uid) ?? "학생",
        lastText: recent?.text ?? "",
        lastAuthorRole: recent?.authorRole ?? "student",
        lastAt: recent?.createdAt ?? null,
        count: all.length,
      };
    });
    // 대화가 있는 학생을 위로(최근순), 없는 학생은 아래로(이름순)
    rows.sort((a, b) => {
      if (a.count > 0 && b.count === 0) return -1;
      if (a.count === 0 && b.count > 0) return 1;
      if (a.count > 0 && b.count > 0)
        return (b.lastAt ?? 0) - (a.lastAt ?? 0);
      return a.studentName.localeCompare(b.studentName);
    });
    cb(rows);
  };

  const unsubs: (() => void)[] = [];
  for (const s of students) {
    // 클래스 레벨
    unsubs.push(
      watchClassMessages(cid, s.uid, (m) => {
        buckets.get(s.uid)?.set("__class", m);
        emit();
      })
    );
    // 차시 레벨 (학생이 차시 화면에서 보낸 메시지 포함)
    for (const lid of lessonIds) {
      unsubs.push(
        watchLessonMessages(cid, lid, s.uid, (m) => {
          buckets.get(s.uid)?.set(`lesson:${lid}`, m);
          emit();
        })
      );
    }
  }
  emit();
  return () => unsubs.forEach((u) => u());
}

export async function sendClassMessage(
  cid: string,
  studentUid: string,
  user: User,
  role: "teacher" | "student",
  text: string
): Promise<void> {
  const ref = doc(classCol(cid, studentUid));
  await setDoc(ref, {
    authorUid: user.uid,
    authorName: user.displayName ?? (role === "teacher" ? "교사" : "학생"),
    authorRole: role,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
}

export async function sendLessonMessage(
  cid: string,
  lid: string,
  studentUid: string,
  user: User,
  role: "teacher" | "student",
  text: string
): Promise<void> {
  const ref = doc(lessonCol(cid, lid, studentUid));
  await setDoc(ref, {
    authorUid: user.uid,
    authorName: user.displayName ?? (role === "teacher" ? "교사" : "학생"),
    authorRole: role,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
}
