// 차시(lesson) · 질문 · 제출 · 온톨로지 Firestore 헬퍼
//
// classes/{cid}/lessons/{lid}                                 차시 (제목, 날짜)
// classes/{cid}/lessons/{lid}/questions/{qid}                 질문 (phase·본문·링크)
// classes/{cid}/lessons/{lid}/questions/{qid}/submissions/{uid}  질문별 학생 제출
// classes/{cid}/lessons/{lid}/submissions/{uid}               (레거시) phase 통합 제출
// classes/{cid}/lessons/{lid}/ontology/{scope}                추출된 지식 그래프
//   scope: "pre" | "post" (phase 통합) | "student:{uid}:{phase}" (학생별)
//          | "q:{qid}" (질문별)
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDbClient } from "@/lib/firebase";

export type Phase = "pre" | "post";

export type Lesson = {
  id: string;
  title: string;
  date: string; // yyyy-mm-dd
  preQuestion: string;
  postQuestion: string;
  projectId: string | null; // 상위 프로젝트 (null = 미분류)
  parentLessonId: string | null; // 1단계 차시 중첩
  order: number; // 정렬 순서
  color: string | null; // 색상 라벨 키
  icon: string | null; // Material Symbols 아이콘 이름
  pinned: boolean; // 상단 고정
  createdBy: string;
  createdAt: number | null;
};

export type Submission = {
  uid: string;
  studentName: string;
  phase: Phase;
  content: string; // 마크다운 (표/글 자유) — 성찰: 배운 내용/느낀 점
  understanding?: number; // 수업 후 성찰: 이해도 별점 1~5
  interest?: number; // 수업 후 성찰: 흥미도 하트 1~5
  application?: string; // 수업 후 성찰: 배운 걸 어디에 쓸 수 있을까
  submittedAt: number | null;
};

export type QLink = {
  title: string;
  url: string;
  // 링크별 대상 (둘 다 비면 전체 = 활동 대상 따름)
  audGroupIds?: string[];
  audUids?: string[];
};

// 활동 종류: 질문 · 문항 · 링크 · 보드(캔버스) · 수업후 성찰(이해도/흥미도+서술)
export type ActivityKind =
  | "question"
  | "quiz"
  | "link"
  | "canvas"
  | "reflection";

export type Question = {
  id: string;
  phase: Phase;
  kind: ActivityKind;
  title: string; // 활동 제목(교사 입력, 비면 기본 라벨)
  text: string; // RichEditor JSON (또는 평문)
  links: QLink[];
  options: string[]; // 문항(quiz) 선택지
  answerIndex: number; // 문항 정답 인덱스 (-1 = 미설정)
  audGroupIds: string[]; // 대상 모둠 (비어있고 audUids도 비면 전체)
  audUids: string[]; // 대상 학생 uid
  order: number;
  allowResubmit: boolean; // 제출 후 학생 수정 허용 여부 (교사 설정)
  revealAnswer?: boolean; // 문항(quiz): 제출 후 학생에게 정답 공개(공개 시 잠금)
  boardMode?: "shared" | "group"; // 보드(canvas): 공용 1개 / 모둠별 따로
  clonedFrom?: string; // 복제 원본 질문 id (수업 전→후 가져오기 등)
  createdBy: string;
  createdAt: number | null;
};

export type OntologyNode = {
  id: string;
  label: string;
  type: "concept" | "keyword" | "emotion";
  weight: number;
  sentiment: "positive" | "neutral" | "negative";
  sourceCount?: number; // 언급한 서로 다른 학생 수
  sources?: string[]; // 언급한 학생ID 목록
};
export type OntologyEdge = {
  source: string;
  target: string;
  relation: string;
  weight: number;
  evidence?: string; // 관계 근거 한 줄
  sourceCount?: number; // 관계가 드러난 학생 수
};
export type Ontology = {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  overallSentiment: { positive: number; neutral: number; negative: number };
  summary: string;
  generatedAt?: number | null;
  inputHash?: string; // 더티 체크용 입력 해시 (질문 리프에만 기록)
  /** 정준화(동의어 통합) 결과의 별칭 맵 — canonicalId → [원본 라벨들] */
  aliases?: Record<string, string[]>;
};

const lessonsCol = (cid: string) =>
  collection(getDbClient(), "classes", cid, "lessons");

export async function createLesson(
  cid: string,
  user: User,
  data: { title: string; date: string }
): Promise<string> {
  const ref = doc(lessonsCol(cid));
  await setDoc(ref, {
    title: data.title.trim(),
    date: data.date,
    preQuestion: "",
    postQuestion: "",
    projectId: null,
    parentLessonId: null,
    order: Date.now(),
    color: null,
    icon: null,
    pinned: false,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** 차시 메타 수정 (제목·색상·고정) */
export async function updateLesson(
  cid: string,
  lid: string,
  patch: {
    title?: string;
    color?: string | null;
    icon?: string | null;
    pinned?: boolean;
  }
): Promise<void> {
  const p: Record<string, unknown> = { ...patch };
  if (typeof p.title === "string") p.title = (p.title as string).trim();
  await setDoc(
    doc(getDbClient(), "classes", cid, "lessons", lid),
    p,
    { merge: true }
  );
}

export async function listLessons(cid: string): Promise<Lesson[]> {
  const snap = await getDocs(lessonsCol(cid));
  return snap.docs
    .map((d) => mapLesson(d.id, d.data()))
    .sort((a, b) => a.order - b.order);
}

/** 차시 이동/재정렬 (프로젝트·중첩·순서 변경) */
export async function moveLesson(
  cid: string,
  lid: string,
  patch: {
    projectId?: string | null;
    parentLessonId?: string | null;
    order?: number;
  }
): Promise<void> {
  await setDoc(
    doc(getDbClient(), "classes", cid, "lessons", lid),
    patch,
    { merge: true }
  );
}

export async function getLesson(
  cid: string,
  lid: string
): Promise<Lesson | null> {
  const d = await getDoc(doc(getDbClient(), "classes", cid, "lessons", lid));
  return d.exists() ? mapLesson(d.id, d.data()) : null;
}

export async function updateQuestions(
  cid: string,
  lid: string,
  patch: { preQuestion?: string; postQuestion?: string }
): Promise<void> {
  await setDoc(
    doc(getDbClient(), "classes", cid, "lessons", lid),
    patch,
    { merge: true }
  );
}

export async function deleteLesson(cid: string, lid: string): Promise<void> {
  await deleteDoc(doc(getDbClient(), "classes", cid, "lessons", lid));
}

/* ---------- 제출 ---------- */
export async function submitResponse(
  cid: string,
  lid: string,
  user: User,
  phase: Phase,
  content: string
): Promise<void> {
  await setDoc(
    doc(getDbClient(), "classes", cid, "lessons", lid, "submissions", user.uid),
    {
      uid: user.uid,
      studentName: user.displayName ?? "이름없음",
      phase,
      content,
      submittedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getMySubmission(
  cid: string,
  lid: string,
  uid: string
): Promise<Submission | null> {
  const d = await getDoc(
    doc(getDbClient(), "classes", cid, "lessons", lid, "submissions", uid)
  );
  return d.exists() ? mapSubmission(d.data()) : null;
}

export async function listSubmissions(
  cid: string,
  lid: string
): Promise<Submission[]> {
  const snap = await getDocs(
    collection(getDbClient(), "classes", cid, "lessons", lid, "submissions")
  );
  return snap.docs.map((d) => mapSubmission(d.data()));
}

/* ---------- 질문 (차시당 N개, phase별, 링크 첨부) ---------- */
const questionsCol = (cid: string, lid: string) =>
  collection(getDbClient(), "classes", cid, "lessons", lid, "questions");

export async function listQuestions(
  cid: string,
  lid: string
): Promise<Question[]> {
  const snap = await getDocs(questionsCol(cid, lid));
  return snap.docs
    .map((d) => mapQuestion(d.id, d.data()))
    .sort((a, b) => a.order - b.order);
}

/** 질문 실시간 구독 (교사 설정 변경이 학생에 즉시 전파). 반환값 호출로 해제 */
export function watchQuestions(
  cid: string,
  lid: string,
  cb: (qs: Question[]) => void
): () => void {
  return onSnapshot(
    questionsCol(cid, lid),
    (snap) =>
      cb(
        snap.docs
          .map((d) => mapQuestion(d.id, d.data()))
          .sort((a, b) => a.order - b.order)
      ),
    () => cb([])
  );
}

export async function createQuestion(
  cid: string,
  lid: string,
  user: User,
  data: {
    phase: Phase;
    kind?: ActivityKind;
    title?: string;
    text?: string;
    links?: QLink[];
    options?: string[];
    answerIndex?: number;
    audGroupIds?: string[];
    audUids?: string[];
    order?: number;
    allowResubmit?: boolean;
    revealAnswer?: boolean;
    boardMode?: "shared" | "group";
  }
): Promise<string> {
  const ref = doc(questionsCol(cid, lid));
  await setDoc(ref, {
    phase: data.phase,
    kind: data.kind ?? "question",
    title: data.title ?? "",
    text: data.text ?? "",
    links: data.links ?? [],
    options: data.options ?? [],
    answerIndex: data.answerIndex ?? -1,
    audGroupIds: data.audGroupIds ?? [],
    audUids: data.audUids ?? [],
    order: data.order ?? Date.now(),
    allowResubmit: data.allowResubmit ?? true,
    revealAnswer: data.revealAnswer ?? false,
    boardMode: data.boardMode ?? "shared",
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * 선택한 활동들을 현재 phase로 복제(예: 수업 전 → 수업 후).
 * 학생 제출물은 복제하지 않음. clonedFrom으로 원본을 표시.
 * 반환: 복제한 활동 수.
 */
export async function cloneQuestionsToPhase(
  cid: string,
  lid: string,
  sources: Question[],
  toPhase: Phase,
  user: User
): Promise<number> {
  if (sources.length === 0) return 0;
  const all = await listQuestions(cid, lid);
  let order = all
    .filter((q) => q.phase === toPhase)
    .reduce((m, q) => Math.max(m, q.order), 0);
  const batch = writeBatch(getDbClient());
  for (const q of sources) {
    order += 1;
    const ref = doc(questionsCol(cid, lid));
    batch.set(ref, {
      phase: toPhase,
      kind: q.kind,
      title: q.title,
      text: q.text,
      links: q.links,
      options: q.options,
      answerIndex: q.answerIndex,
      audGroupIds: q.audGroupIds,
      audUids: q.audUids,
      order,
      allowResubmit: q.allowResubmit,
      boardMode: q.boardMode ?? "shared",
      clonedFrom: q.id,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return sources.length;
}

// 활동 순서 일괄 변경 (드래그앤드랍 재정렬)
export async function reorderQuestions(
  cid: string,
  lid: string,
  orderedIds: string[]
): Promise<void> {
  const batch = writeBatch(getDbClient());
  orderedIds.forEach((qid, i) => {
    batch.set(doc(questionsCol(cid, lid), qid), { order: i }, { merge: true });
  });
  await batch.commit();
}

export async function updateQuestion(
  cid: string,
  lid: string,
  qid: string,
  patch: {
    title?: string;
    text?: string;
    links?: QLink[];
    options?: string[];
    answerIndex?: number;
    audGroupIds?: string[];
    audUids?: string[];
    order?: number;
    allowResubmit?: boolean;
    revealAnswer?: boolean;
    boardMode?: "shared" | "group";
    clonedFrom?: string;
  }
): Promise<void> {
  await setDoc(
    doc(getDbClient(), "classes", cid, "lessons", lid, "questions", qid),
    patch,
    { merge: true }
  );
}

export async function deleteQuestion(
  cid: string,
  lid: string,
  qid: string
): Promise<void> {
  await deleteDoc(
    doc(getDbClient(), "classes", cid, "lessons", lid, "questions", qid)
  );
}

/**
 * 레거시 preQuestion/postQuestion → questions 컬렉션 1회 이관.
 * 질문이 하나도 없고 레거시 본문이 있을 때만 생성. 교사 호출 전제.
 * 변경이 있었으면 새 질문 목록을 반환, 아니면 기존 목록 반환.
 */
export async function seedQuestionsFromLesson(
  cid: string,
  lid: string,
  lesson: Lesson,
  user: User
): Promise<Question[]> {
  const existing = await listQuestions(cid, lid);
  if (existing.length > 0) return existing;
  const seeds: Phase[] = [];
  if (lesson.preQuestion.trim()) seeds.push("pre");
  if (lesson.postQuestion.trim()) seeds.push("post");
  if (seeds.length === 0) return existing;
  let order = Date.now();
  for (const phase of seeds) {
    await createQuestion(cid, lid, user, {
      phase,
      text: phase === "pre" ? lesson.preQuestion : lesson.postQuestion,
      order: order++,
    });
  }
  return listQuestions(cid, lid);
}

/* ---------- 질문별 제출 ---------- */
const qSubCol = (cid: string, lid: string, qid: string) =>
  collection(
    getDbClient(),
    "classes",
    cid,
    "lessons",
    lid,
    "questions",
    qid,
    "submissions"
  );

export async function submitQuestionResponse(
  cid: string,
  lid: string,
  qid: string,
  user: User,
  phase: Phase,
  content: string
): Promise<void> {
  await setDoc(
    doc(qSubCol(cid, lid, qid), user.uid),
    {
      uid: user.uid,
      studentName: user.displayName ?? "이름없음",
      phase,
      content,
      submittedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** 특정 학생(uid)을 위한 제출 기록 — 보드 카드→지식맵 전송용(교사가 작성) */
export async function setQuestionSubmissionFor(
  cid: string,
  lid: string,
  qid: string,
  uid: string,
  studentName: string,
  phase: Phase,
  content: string
): Promise<void> {
  await setDoc(
    doc(qSubCol(cid, lid, qid), uid),
    {
      uid,
      studentName,
      phase,
      content,
      submittedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// 수업 후 성찰 제출 (이해도/흥미도 별점 + 서술)
export async function setReflectionSubmission(
  cid: string,
  lid: string,
  qid: string,
  uid: string,
  studentName: string,
  phase: Phase,
  data: {
    understanding: number;
    interest: number;
    content: string;
    application: string;
  }
): Promise<void> {
  await setDoc(
    doc(qSubCol(cid, lid, qid), uid),
    {
      uid,
      studentName,
      phase,
      content: data.content,
      understanding: data.understanding,
      interest: data.interest,
      application: data.application,
      submittedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getMyQuestionSubmission(
  cid: string,
  lid: string,
  qid: string,
  uid: string
): Promise<Submission | null> {
  const d = await getDoc(doc(qSubCol(cid, lid, qid), uid));
  return d.exists() ? mapSubmission(d.data()) : null;
}

export async function listQuestionSubmissions(
  cid: string,
  lid: string,
  qid: string
): Promise<Submission[]> {
  const snap = await getDocs(qSubCol(cid, lid, qid));
  return snap.docs.map((d) => mapSubmission(d.data()));
}

/** 질문별 제출 실시간 구독 (학생 응답 즉시 반영). 반환값 호출로 해제 */
export function watchQuestionSubmissions(
  cid: string,
  lid: string,
  qid: string,
  cb: (subs: Submission[]) => void
): () => void {
  return onSnapshot(
    qSubCol(cid, lid, qid),
    (snap) => cb(snap.docs.map((d) => mapSubmission(d.data()))),
    () => cb([])
  );
}

/* ---------- 산출물 댓글(피드백) ---------- */
export type SubComment = {
  id: string;
  authorUid: string;
  authorName: string;
  authorRole: "teacher" | "student";
  text: string;
  createdAt: number | null;
};

const commentsCol = (cid: string, lid: string, qid: string, sid: string) =>
  collection(
    getDbClient(),
    "classes",
    cid,
    "lessons",
    lid,
    "questions",
    qid,
    "submissions",
    sid,
    "comments"
  );

export async function addSubComment(
  cid: string,
  lid: string,
  qid: string,
  sid: string,
  user: User,
  role: "teacher" | "student",
  text: string
): Promise<void> {
  const ref = doc(commentsCol(cid, lid, qid, sid));
  await setDoc(ref, {
    authorUid: user.uid,
    authorName: user.displayName ?? (role === "teacher" ? "교사" : "학생"),
    authorRole: role,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
}

export async function listSubComments(
  cid: string,
  lid: string,
  qid: string,
  sid: string
): Promise<SubComment[]> {
  const snap = await getDocs(commentsCol(cid, lid, qid, sid));
  return snap.docs
    .map((d) => {
      const v = d.data() as Record<string, unknown>;
      const ts = v.createdAt as { toMillis?: () => number } | undefined;
      return {
        id: d.id,
        authorUid: (v.authorUid as string) ?? "",
        authorName: (v.authorName as string) ?? "",
        authorRole: ((v.authorRole as string) ?? "student") as
          | "teacher"
          | "student",
        text: (v.text as string) ?? "",
        createdAt: ts?.toMillis ? ts.toMillis() : null,
      };
    })
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

function mapSubComment(
  id: string,
  v: Record<string, unknown>
): SubComment {
  const ts = v.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    authorUid: (v.authorUid as string) ?? "",
    authorName: (v.authorName as string) ?? "",
    authorRole: ((v.authorRole as string) ?? "student") as
      | "teacher"
      | "student",
    text: (v.text as string) ?? "",
    createdAt: ts?.toMillis ? ts.toMillis() : null,
  };
}

/** 실시간 구독. 반환값 호출로 해제 */
export function watchSubComments(
  cid: string,
  lid: string,
  qid: string,
  sid: string,
  cb: (list: SubComment[]) => void
): () => void {
  return onSnapshot(
    commentsCol(cid, lid, qid, sid),
    (snap) =>
      cb(
        snap.docs
          .map((d) => mapSubComment(d.id, d.data()))
          .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      ),
    () => cb([])
  );
}

export async function deleteSubComment(
  cid: string,
  lid: string,
  qid: string,
  sid: string,
  cmtId: string
): Promise<void> {
  await deleteDoc(doc(commentsCol(cid, lid, qid, sid), cmtId));
}

/** 학생의 미제출 질문 수 (대시보드 "할 일") */
export async function studentOpenCount(
  cid: string,
  uid: string
): Promise<number> {
  const lessons = await listLessons(cid);
  let open = 0;
  await Promise.all(
    lessons.map(async (l) => {
      const qs = await listQuestions(cid, l.id).catch(() => [] as Question[]);
      await Promise.all(
        qs.map(async (q) => {
          const mine = await getMyQuestionSubmission(
            cid,
            l.id,
            q.id,
            uid
          ).catch(() => null);
          if (!mine || !mine.content.trim()) open += 1;
        })
      );
    })
  );
  return open;
}

/* ---------- 온톨로지 저장/조회 ---------- */
export async function saveOntology(
  cid: string,
  lid: string,
  scope: string,
  data: Ontology
): Promise<void> {
  await setDoc(
    doc(getDbClient(), "classes", cid, "lessons", lid, "ontology", scope),
    { ...data, generatedAt: serverTimestamp() }
  );
}

export async function getOntology(
  cid: string,
  lid: string,
  scope: string
): Promise<Ontology | null> {
  const d = await getDoc(
    doc(getDbClient(), "classes", cid, "lessons", lid, "ontology", scope)
  );
  return d.exists() ? (d.data() as Ontology) : null;
}

/* ---------- 클래스 레벨 온톨로지 (위계 머지/정규화 캐시) ---------- */
export async function saveClassOntology(
  cid: string,
  scope: string,
  data: Ontology
): Promise<void> {
  await setDoc(doc(getDbClient(), "classes", cid, "ontology", scope), {
    ...data,
    generatedAt: serverTimestamp(),
  });
}

export async function getClassOntology(
  cid: string,
  scope: string
): Promise<Ontology | null> {
  const d = await getDoc(doc(getDbClient(), "classes", cid, "ontology", scope));
  return d.exists() ? (d.data() as Ontology) : null;
}

/** 위키 인사이트 캐시 (임의 shape + inputHash) */
export async function saveClassInsights(
  cid: string,
  scope: string,
  data: Record<string, unknown>
): Promise<void> {
  await setDoc(doc(getDbClient(), "classes", cid, "ontology", scope), {
    ...data,
    generatedAt: serverTimestamp(),
  });
}

export async function getClassInsights<T = Record<string, unknown>>(
  cid: string,
  scope: string
): Promise<(T & { inputHash?: string }) | null> {
  const d = await getDoc(doc(getDbClient(), "classes", cid, "ontology", scope));
  return d.exists() ? (d.data() as T & { inputHash?: string }) : null;
}

/* ---------- 매퍼 ---------- */
function mapLesson(id: string, v: Record<string, unknown>): Lesson {
  const ts = v.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    title: (v.title as string) ?? "",
    date: (v.date as string) ?? "",
    preQuestion: (v.preQuestion as string) ?? "",
    postQuestion: (v.postQuestion as string) ?? "",
    projectId: (v.projectId as string) ?? null,
    parentLessonId: (v.parentLessonId as string) ?? null,
    order: (v.order as number) ?? 0,
    color: (v.color as string) ?? null,
    icon: (v.icon as string) ?? null,
    pinned: Boolean(v.pinned),
    createdBy: (v.createdBy as string) ?? "",
    createdAt: ts?.toMillis ? ts.toMillis() : null,
  };
}

function mapQuestion(id: string, v: Record<string, unknown>): Question {
  const ts = v.createdAt as { toMillis?: () => number } | undefined;
  const rawLinks = Array.isArray(v.links) ? (v.links as unknown[]) : [];
  return {
    id,
    phase: ((v.phase as Phase) ?? "pre"),
    kind: ((v.kind as ActivityKind) ?? "question"),
    title: (v.title as string) ?? "",
    text: (v.text as string) ?? "",
    options: Array.isArray(v.options)
      ? (v.options as unknown[]).map((o) => String(o ?? ""))
      : [],
    answerIndex:
      typeof v.answerIndex === "number" ? (v.answerIndex as number) : -1,
    audGroupIds: Array.isArray(v.audGroupIds)
      ? (v.audGroupIds as unknown[]).map((x) => String(x))
      : [],
    audUids: Array.isArray(v.audUids)
      ? (v.audUids as unknown[]).map((x) => String(x))
      : [],
    links: rawLinks
      .map((l) => {
        const o = (l ?? {}) as Record<string, unknown>;
        return {
          title: (o.title as string) ?? "",
          url: (o.url as string) ?? "",
          audGroupIds: Array.isArray(o.audGroupIds)
            ? (o.audGroupIds as unknown[]).map((x) => String(x))
            : [],
          audUids: Array.isArray(o.audUids)
            ? (o.audUids as unknown[]).map((x) => String(x))
            : [],
        };
      })
      .filter((l) => l.title || l.url),
    order: (v.order as number) ?? 0,
    allowResubmit: v.allowResubmit !== false, // 미설정/기존 문서는 허용(true)
    revealAnswer: v.revealAnswer === true,
    boardMode: v.boardMode === "group" ? "group" : "shared",
    clonedFrom:
      typeof v.clonedFrom === "string" ? (v.clonedFrom as string) : undefined,
    createdBy: (v.createdBy as string) ?? "",
    createdAt: ts?.toMillis ? ts.toMillis() : null,
  };
}

function mapSubmission(v: Record<string, unknown>): Submission {
  const ts = v.submittedAt as { toMillis?: () => number } | undefined;
  return {
    uid: (v.uid as string) ?? "",
    studentName: (v.studentName as string) ?? "이름없음",
    phase: ((v.phase as Phase) ?? "pre"),
    content: (v.content as string) ?? "",
    understanding:
      typeof v.understanding === "number"
        ? (v.understanding as number)
        : undefined,
    interest:
      typeof v.interest === "number" ? (v.interest as number) : undefined,
    application:
      typeof v.application === "string" ? (v.application as string) : undefined,
    submittedAt: ts?.toMillis ? ts.toMillis() : null,
  };
}
