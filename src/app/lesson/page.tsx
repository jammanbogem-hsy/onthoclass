"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard, GlassButton } from "@/components/Glass";
import { TopBar } from "@/components/TopBar";
import { RichEditor, blocksToPlainText } from "@/components/RichEditor";
import { BlockView } from "@/components/BlockEditor";
import { Icon } from "@/components/Icon";
import { SentimentBar } from "@/components/GraphView";
import { ExpandableGraph } from "@/components/ExpandableGraph";
import { EmotionPanel } from "@/components/EmotionPanel";
import { CommentThread } from "@/components/CommentThread";
import { MessagesFab } from "@/components/MessagesFab";
import { useDialog } from "@/components/Dialog";
import {
  getMyRole,
  listMembers,
  type Member,
  type Role,
} from "@/lib/classes";
import { listGroups, type Group } from "@/lib/groups";
import {
  createQuestion,
  deleteQuestion,
  getLesson,
  getMyQuestionSubmission,
  getOntology,
  cloneQuestionsToPhase,
  copyLessonToClass,
  getClassInsights,
  linkLessonLineage,
  listLessons,
  saveClassInsights,
  listQuestionSubmissions,
  listQuestions,
  reorderQuestions,
  watchQuestions,
  watchQuestionSubmissions,
  saveOntology,
  seedQuestionsFromLesson,
  setReflectionSubmission,
  submitQuestionResponse,
  updateQuestion,
  type ActivityKind,
  type Lesson,
  type Ontology,
  type Phase,
  type QLink,
  type Question,
  type Submission,
} from "@/lib/lessons";
import { ReflectAvgBadge } from "@/components/ReflectAvgBadge";
import { grantXp } from "@/lib/xp";
import { listSourceClasses, type SourceClass } from "@/lib/teams";
import { listProjects, type Project } from "@/lib/projects";
import { buildPrePostOverlay, filterOverlayByMode } from "@/lib/compare";
import { PREPOST_COLOR } from "@/lib/palette";
import {
  canonicalizeOntology,
  extractOntology,
  wikiInsights,
  type WikiInsights,
} from "@/lib/ai";
import {
  applyLabelClusters,
  diffPrePost,
  EMPTY_ONTOLOGY,
  filterOntologyByStudent,
  hashLabels,
  hashResponses,
  mergeOntologies,
} from "@/lib/ontology";
import { PrePostTable } from "@/components/CompareTable";
import {
  createResource,
  deleteResource,
  listResources,
  type Resource,
  type ResourceType,
} from "@/lib/resources";

/* ===================================================================== *
 *  차시 상세: 질문 N개(전/후·링크) · 질문별 제출(마스터-디테일) ·
 *  학생별 카드 · 온톨로지 지식 맵
 *  주의(메모리 교훈): 컴포넌트는 모두 모듈 최상위 정의 + ctx props.
 * ===================================================================== */

function LessonDetail() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const cid = params.get("class");
  const lid = params.get("id");

  const [role, setRole] = useState<Role | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [lesson, setLesson] = useState<Lesson | null | "missing">(null);
  const [phase, setPhase] = useState<Phase>("pre");

  const isTeacher = role === "teacher";

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  const reload = useCallback(() => {
    if (!user || !cid || !lid) return;
    getMyRole(cid, user.uid).then(setRole);
    listMembers(cid).then(setMembers).catch(() => {});
    getLesson(cid, lid).then((l) => setLesson(l ?? "missing"));
  }, [user, cid, lid]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading || !user || lesson === null || !cid || !lid) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
      </main>
    );
  }

  if (lesson === "missing") {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <GlassCard className="p-10 text-center">
          <p className="font-semibold">차시를 찾을 수 없습니다.</p>
          <button
            className="mt-4 text-sm text-[var(--accent)] underline"
            onClick={() => router.push(`/class/?id=${cid}`)}
          >
            학급으로 돌아가기
          </button>
        </GlassCard>
      </main>
    );
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <button
          onClick={() => router.push(`/class/?id=${cid}`)}
          className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--md-sys-color-on-surface-variant)] transition hover:text-[var(--md-sys-color-on-surface)]"
        >
          <Icon name="arrow_back" size={18} />
          학급
        </button>

        <GlassCard strong className="animate-float-in p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">
                  {lesson.title}
                </h1>
                {isTeacher && (
                  <ReflectAvgBadge cid={cid} lid={lid} realtime size={16} />
                )}
              </div>
              <p className="mt-1 text-sm text-black/55 dark:text-white/55">
                {lesson.date || "날짜 미지정"} · {isTeacher ? "교사" : "학생"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isTeacher && lesson.originLessonId && (
                <button
                  onClick={() =>
                    router.push(`/compare/?group=${lesson.originLessonId}`)
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2 text-xs font-semibold text-[var(--md-sys-color-primary)] transition hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
                  title="이 수업을 가진 학급들의 지식맵을 비교"
                >
                  <Icon name="compare" size={15} />
                  이 수업 학급 비교
                </button>
              )}
              {isTeacher && <CopyLessonButton cid={cid} lid={lid} />}
              <ShareButton />
            </div>
          </div>

          <div className="mt-5 flex rounded-full bg-black/5 p-0.5 dark:bg-white/10">
            {(["pre", "post"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  phase === p
                    ? "bg-white/80 text-black/80 shadow-sm dark:bg-white/20 dark:text-white"
                    : "text-black/45 dark:text-white/45"
                }`}
              >
                {p === "pre" ? "수업 전" : "수업 후"}
              </button>
            ))}
          </div>
        </GlassCard>

        {isTeacher ? (
          <TeacherPanel
            cid={cid}
            lid={lid}
            phase={phase}
            lesson={lesson}
          />
        ) : (
          <StudentPanel cid={cid} lid={lid} phase={phase} />
        )}

        <ResourcesCard cid={cid} lid={lid} canEdit={isTeacher} />
      </main>
      <MessagesFab
        cid={cid}
        scope="lesson"
        lessonId={lid}
        viewerRole={isTeacher ? "teacher" : "student"}
        students={members.filter((m) => m.role === "student")}
      />
    </>
  );
}

function ShareButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-4 py-2 text-xs font-semibold text-[var(--accent-strong)]"
    >
      <Icon name={copied ? "check" : "link"} size={16} />
      {copied ? "링크 복사됨" : "학생 공유 링크"}
    </button>
  );
}

/* ---------- 차시를 다른 학급으로 복제 (학급 간 비교용 계보 생성) ---------- */
function CopyLessonButton({ cid, lid }: { cid: string; lid: string }) {
  const { user } = useAuth();
  const dialog = useDialog();
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<SourceClass[] | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    // 차시 생성 권한이 있는 '내 학급'만 복제 대상으로(팀원 학급엔 쓰기 불가)
    listSourceClasses(user.uid)
      .then((cs) => setClasses(cs.filter((c) => c.mine && c.cid !== cid)))
      .catch(() => setClasses([]));
  }, [open, user, cid]);

  async function copyTo(c: SourceClass) {
    if (!user || busy) return;
    setBusy(c.cid);
    try {
      await copyLessonToClass(cid, lid, c.cid, user);
      setOpen(false);
      await dialog.confirm({
        title: "복제 완료",
        body: `“${c.name}” 학급으로 이 차시(활동 포함)를 복제했습니다. 학급 간 비교에서 ‘같은 수업’으로 묶여 비교됩니다. (학생 응답은 복제되지 않습니다)`,
        okLabel: "확인",
      });
    } catch (e) {
      await dialog.confirm({
        title: "복제 실패",
        body: e instanceof Error ? e.message : "복제 중 오류가 발생했습니다.",
        okLabel: "확인",
      });
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline)] px-4 py-2 text-xs font-semibold text-[var(--md-sys-color-primary)] transition hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
        title="이 차시를 내 다른 학급·팀원 학급으로 복제 (학급 간 비교용)"
      >
        <Icon name="content_copy" size={15} />
        다른 학급으로 복제
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <GlassCard
            strong
            className="flex max-h-[80vh] w-full max-w-sm flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">다른 학급으로 복제</h2>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <p className="mb-3 text-xs text-black/55">
              활동(질문·문항·보드 등)까지 복제됩니다. 학생 응답·지식맵은 복제되지
              않으며, 두 학급은 ‘같은 수업’으로 묶여 비교됩니다.
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {classes === null ? (
                <p className="py-8 text-center text-sm text-black/40">
                  불러오는 중…
                </p>
              ) : classes.length === 0 ? (
                <p className="py-8 text-center text-sm text-black/40">
                  복제할 다른 학급이 없습니다.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {classes.map((c) => (
                    <li key={c.cid}>
                      <button
                        disabled={!!busy}
                        onClick={() => copyTo(c)}
                        className="flex w-full items-center gap-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] px-3 py-2.5 text-left text-sm hover:bg-black/5 disabled:opacity-50"
                      >
                        <Icon
                          name={c.mine ? "school" : "groups"}
                          size={16}
                          className="text-[var(--md-sys-color-primary)]"
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {c.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-black/45">
                          {busy === c.cid ? "복제 중…" : c.teacher}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </GlassCard>
        </div>
      )}
    </>
  );
}

/* ---------- 링크 첨부 ---------- */
function LinksEditor({
  links,
  onChange,
  groups = [],
  students = [],
}: {
  links: QLink[];
  onChange: (l: QLink[]) => void;
  groups?: Group[];
  students?: Member[];
}) {
  const set = (i: number, patch: Partial<QLink>) =>
    onChange(links.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const linkMode = (lk: QLink): "all" | "groups" | "students" =>
    (lk.audGroupIds?.length ?? 0) > 0
      ? "groups"
      : (lk.audUids?.length ?? 0) > 0
        ? "students"
        : "all";
  // 선택 0개여도 모둠/개별 모드 유지하도록 명시 상태
  const [modes, setModes] = useState<
    Record<number, "all" | "groups" | "students">
  >({});

  return (
    <div className="mt-3 flex flex-col gap-2">
      {links.map((lk, i) => {
        const mode = modes[i] ?? linkMode(lk);
        const g = lk.audGroupIds ?? [];
        const u = lk.audUids ?? [];
        return (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] p-2.5"
          >
            <div className="flex items-center gap-2">
              <input
                className="m3-field !py-1.5 !text-xs flex-1"
                placeholder="링크 제목"
                value={lk.title}
                onChange={(e) => set(i, { title: e.target.value })}
              />
              <input
                className="m3-field !py-1.5 !text-xs flex-[2]"
                placeholder="https://…"
                value={lk.url}
                onChange={(e) => set(i, { url: e.target.value })}
              />
              <button
                onClick={() => onChange(links.filter((_, j) => j !== i))}
                className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)]"
                title="링크 삭제"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            {/* 링크별 대상 (기본 전체) */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-black/45">대상:</span>
              {(
                [
                  ["all", "전체"],
                  ["groups", "모둠"],
                  ["students", "개별"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => {
                    setModes((p) => ({ ...p, [i]: m }));
                    if (m === "all") set(i, { audGroupIds: [], audUids: [] });
                    else if (m === "groups") set(i, { audUids: [] });
                    else set(i, { audGroupIds: [] });
                  }}
                  className={`rounded-full px-2 py-0.5 font-semibold transition ${
                    mode === m
                      ? "bg-[var(--md-sys-color-primary)] text-white"
                      : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-primary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
              {mode === "groups" &&
                (groups.length ? (
                  groups.map((gr) => {
                    const on = g.includes(gr.id);
                    return (
                      <button
                        key={gr.id}
                        onClick={() =>
                          set(i, {
                            audGroupIds: on
                              ? g.filter((x) => x !== gr.id)
                              : [...g, gr.id],
                          })
                        }
                        className={`rounded-full px-2 py-0.5 ${
                          on
                            ? "bg-[var(--md-sys-color-secondary-container)] font-semibold text-[var(--md-sys-color-on-secondary-container)]"
                            : "bg-black/5 dark:bg-white/10"
                        }`}
                      >
                        {gr.name}
                      </button>
                    );
                  })
                ) : (
                  <span className="text-black/40">
                    학급 화면 “모둠”에서 먼저 생성
                  </span>
                ))}
              {mode === "students" &&
                students.map((s) => {
                  const on = u.includes(s.uid);
                  return (
                    <button
                      key={s.uid}
                      onClick={() =>
                        set(i, {
                          audUids: on
                            ? u.filter((x) => x !== s.uid)
                            : [...u, s.uid],
                        })
                      }
                      className={`rounded-full px-2 py-0.5 ${
                        on
                          ? "bg-[var(--md-sys-color-secondary-container)] font-semibold text-[var(--md-sys-color-on-secondary-container)]"
                          : "bg-black/5 dark:bg-white/10"
                      }`}
                    >
                      {s.displayName}
                    </button>
                  );
                })}
            </div>
          </div>
        );
      })}
      <button
        onClick={() => onChange([...links, { title: "", url: "" }])}
        className="self-start inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1 text-xs font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
      >
        <Icon name="add_link" size={14} />
        링크 추가
      </button>
    </div>
  );
}

/** 프로토콜 없는 URL 보정 (예: naver.com → https://naver.com) */
export function normalizeUrl(u: string): string {
  const s = (u || "").trim();
  if (!s) return s;
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  return "https://" + s.replace(/^\/+/, "");
}

function LinkChips({
  links,
  viewerUid,
  viewerGroupIds = [],
}: {
  links: QLink[];
  viewerUid?: string;
  viewerGroupIds?: string[];
}) {
  const valid = links.filter((l) => {
    if (!l.url.trim()) return false;
    const g = l.audGroupIds ?? [];
    const u = l.audUids ?? [];
    if (g.length === 0 && u.length === 0) return true; // 전체
    if (viewerUid && u.includes(viewerUid)) return true;
    if (g.some((x) => viewerGroupIds.includes(x))) return true;
    return false;
  });
  if (!valid.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {valid.map((lk, i) => (
        <a
          key={i}
          href={normalizeUrl(lk.url)}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-3 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] px-4 py-3 transition hover:border-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary-container)]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-white">
            <Icon name="link" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
              {lk.title || lk.url}
            </span>
            <span className="block truncate text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {normalizeUrl(lk.url)}
            </span>
          </span>
          <Icon
            name="open_in_new"
            size={18}
            className="shrink-0 text-[var(--md-sys-color-primary)]"
          />
        </a>
      ))}
    </div>
  );
}

/* ---------- 리프(질문) 로더 + 롤업 (LLM은 변경된 질문에만) ---------- */
type LeafData = {
  subsByQ: Record<string, Submission[]>;
  leaves: Record<string, Ontology | null>;
  names: Record<string, string>;
};

function useLeaves(cid: string, lid: string, questions: Question[]) {
  const qidsKey = questions.map((q) => q.id).join(",");
  const [data, setData] = useState<LeafData>({
    subsByQ: {},
    leaves: {},
    names: {},
  });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const [gen, setGen] = useState<"idle" | "running" | "error">("idle");
  const [genMsg, setGenMsg] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const subsByQ: Record<string, Submission[]> = {};
      const leaves: Record<string, Ontology | null> = {};
      const names: Record<string, string> = {};
      await Promise.all(
        questions.map(async (q) => {
          const subs = await listQuestionSubmissions(cid, lid, q.id).catch(
            () => [] as Submission[]
          );
          subsByQ[q.id] = subs;
          for (const s of subs) names[s.uid] = s.studentName;
          leaves[q.id] = await getOntology(cid, lid, `q:${q.id}`).catch(
            () => null
          );
        })
      );
      if (alive) setData({ subsByQ, leaves, names });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, lid, qidsKey, tick]);

  const answeredOf = useCallback(
    (qid: string) =>
      (data.subsByQ[qid] ?? []).filter((s) => s.content.trim()),
    [data.subsByQ]
  );

  const staleQids = useMemo(
    () =>
      questions
        .filter((q) => {
          // 질문·보드(canvas)만 온톨로지 분석 (문항/링크/성찰 제외)
          if (q.kind !== "question" && q.kind !== "canvas") return false;
          const ans = (data.subsByQ[q.id] ?? []).filter((s) =>
            s.content.trim()
          );
          if (ans.length === 0) return false;
          const leaf = data.leaves[q.id];
          const h = hashResponses(
            ans.map((s) => ({ uid: s.uid, content: s.content }))
          );
          return !leaf || leaf.inputHash !== h;
        })
        .map((q) => q.id),
    [questions, data]
  );

  const merged = useMemo(
    () =>
      mergeOntologies(
        Object.values(data.leaves).filter(Boolean) as Ontology[]
      ),
    [data.leaves]
  );

  const generateStale = useCallback(async () => {
    if (staleQids.length === 0) return;
    setGen("running");
    setGenMsg("");
    try {
      for (const qid of staleQids) {
        const q = questions.find((x) => x.id === qid)!;
        const ans = answeredOf(qid);
        if (ans.length === 0) continue;
        const result = await extractOntology({
          classId: cid,
          phase: q.phase,
          question: blocksToPlainText(q.text),
          responses: ans.map((s) => ({
            studentId: s.uid,
            text: blocksToPlainText(s.content),
          })),
        });
        await saveOntology(cid, lid, `q:${qid}`, {
          ...result,
          inputHash: hashResponses(
            ans.map((s) => ({ uid: s.uid, content: s.content }))
          ),
        });
      }
      setGen("idle");
      reload();
    } catch (e) {
      setGen("error");
      setGenMsg(e instanceof Error ? e.message : "분석 중 오류가 발생했습니다.");
    }
  }, [staleQids, questions, answeredOf, cid, lid, reload]);

  return { data, merged, staleQids, gen, genMsg, generateStale, reload };
}

/* ---------- 교사 ---------- */
function TeacherPanel({
  cid,
  lid,
  phase,
  lesson,
}: {
  cid: string;
  lid: string;
  phase: Phase;
  lesson: Lesson;
}) {
  const { user } = useAuth();
  const dialog = useDialog();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"qa" | "students" | "graph">("qa");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [crossOpen, setCrossOpen] = useState(false);
  // 활동 드래그앤드랍 순서 변경 — 사이(삽입 위치)에 줄 표시
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overBefore, setOverBefore] = useState(true);
  function clearDrag() {
    setDragId(null);
    setOverId(null);
  }
  async function reorderTo(targetId: string, before: boolean) {
    if (!dragId || dragId === targetId) return;
    const ids = phaseQs.map((q) => q.id);
    const from = ids.indexOf(dragId);
    if (from < 0) return;
    ids.splice(from, 1); // 끌던 항목 제거
    const ti = ids.indexOf(targetId);
    if (ti < 0) return;
    ids.splice(before ? ti : ti + 1, 0, dragId); // 사이에 삽입
    // 낙관적 반영
    const orderMap = new Map(ids.map((id, i) => [id, i]));
    setQuestions((prev) =>
      prev.map((q) =>
        orderMap.has(q.id) ? { ...q, order: orderMap.get(q.id)! } : q
      )
    );
    await reorderQuestions(cid, lid, ids).catch(() => {});
  }
  // 차시 전체 지식맵 분석(질문 리프) — 단일 분석 진입점
  const analysis = useLeaves(cid, lid, questions);
  const [bubbleOpen, setBubbleOpen] = useState(true);
  const staleKey = analysis.staleQids.join(",");
  useEffect(() => {
    setBubbleOpen(true);
  }, [staleKey]);
  const staleTitles = analysis.staleQids.map(
    (qid) => questions.find((q) => q.id === qid)?.title?.trim() || "질문"
  );
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Member[]>([]);

  useEffect(() => {
    listGroups(cid).then(setGroups).catch(() => {});
    listMembers(cid)
      .then((m) => setStudents(m.filter((x) => x.role === "student")))
      .catch(() => {});
  }, [cid]);

  const load = useCallback(() => {
    if (!user) return;
    seedQuestionsFromLesson(cid, lid, lesson, user)
      .then((qs) => {
        setQuestions(qs);
        setLoaded(true);
      })
      .catch(() => {
        listQuestions(cid, lid).then((qs) => {
          setQuestions(qs);
          setLoaded(true);
        });
      });
  }, [cid, lid, user, lesson]);

  useEffect(() => {
    load();
  }, [load]);

  const phaseQs = useMemo(
    () =>
      questions
        .filter((q) => q.phase === phase)
        .sort((a, b) => a.order - b.order),
    [questions, phase]
  );

  const [menuOpen, setMenuOpen] = useState(false);

  async function addActivity(kind: ActivityKind) {
    if (!user) return;
    setMenuOpen(false);
    setAdding(true);
    try {
      const maxOrder = phaseQs.reduce((m, q) => Math.max(m, q.order), 0);
      await createQuestion(cid, lid, user, {
        phase,
        kind,
        options: kind === "quiz" ? ["", ""] : [],
        order: maxOrder + 1,
      });
      load();
    } finally {
      setAdding(false);
    }
  }

  async function doImport(sources: Question[]) {
    if (!user || importing || sources.length === 0) return;
    setImporting(true);
    try {
      await cloneQuestionsToPhase(cid, lid, sources, "post", user);
      load();
      setImportOpen(false);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full bg-black/5 p-0.5 dark:bg-white/10">
          {(
            [
              ["qa", "질문 · 제출"],
              ["students", "학생별"],
              ["graph", "지식 맵"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                view === k
                  ? "bg-white/80 text-black/80 shadow-sm dark:bg-white/20 dark:text-white"
                  : "text-black/45 dark:text-white/45"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 차시 전체 분석 (단일 진입점) */}
          <div className="relative">
            <GlassButton
              variant={analysis.staleQids.length > 0 ? "accent" : "ghost"}
              className="!px-4 !py-2 text-xs"
              onClick={async () => {
                await analysis.generateStale();
                load();
              }}
              disabled={
                analysis.gen === "running" || analysis.staleQids.length === 0
              }
              title="차시 전체 지식맵 분석 (변경된 활동만)"
            >
              <Icon name="network_intelligence" size={16} />
              {analysis.gen === "running"
                ? "분석 중…"
                : analysis.staleQids.length > 0
                  ? `분석 (${analysis.staleQids.length})`
                  : "분석 완료"}
            </GlassButton>
            {analysis.staleQids.length > 0 &&
              bubbleOpen &&
              analysis.gen !== "running" && (
                <div className="absolute right-0 top-12 z-30 w-72 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-2 shadow-[var(--md-sys-elevation-3)]">
                  <span className="absolute -top-1.5 right-6 h-3 w-3 rotate-45 border-l border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]" />
                  <div className="flex items-center justify-between px-2 py-1">
                    <p className="flex items-center gap-1.5 text-sm font-bold">
                      <Icon
                        name="network_intelligence"
                        size={15}
                        className="text-[var(--md-sys-color-primary)]"
                      />
                      재분석 필요
                    </p>
                    <button
                      onClick={() => setBubbleOpen(false)}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-black/40 hover:bg-black/5"
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                  <ul className="divide-y divide-[var(--md-sys-color-outline-variant)]">
                    {staleTitles.slice(0, 6).map((t, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 px-2 py-2 text-sm"
                      >
                        <Icon
                          name="fiber_new"
                          size={15}
                          className="shrink-0 text-amber-500"
                        />
                        <span className="min-w-0 flex-1 truncate">{t}</span>
                        <span className="shrink-0 text-[11px] font-semibold text-amber-600">
                          새 응답
                        </span>
                      </li>
                    ))}
                    {staleTitles.length > 6 && (
                      <li className="px-2 py-1.5 text-xs text-black/40">
                        외 {staleTitles.length - 6}개
                      </li>
                    )}
                  </ul>
                  <div className="p-1.5">
                    <button
                      onClick={async () => {
                        await analysis.generateStale();
                        load();
                      }}
                      className="btn-accent w-full py-2 text-xs font-semibold"
                    >
                      지금 분석 ({analysis.staleQids.length})
                    </button>
                  </div>
                </div>
              )}
          </div>

          {view === "qa" && (
            <>
            {phase === "post" && (
              <button
                onClick={() => setImportOpen(true)}
                className="inline-flex h-10 items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-4 text-xs font-medium text-[var(--md-sys-color-primary)] transition hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
                title="수업 전 활동을 골라 수업 후로 복제 (사전/사후 비교용)"
              >
                <Icon name="content_copy" size={15} />
                수업 전 활동 가져오기
              </button>
            )}
            <button
              onClick={() => setCrossOpen(true)}
              className="inline-flex h-10 items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-4 text-xs font-medium text-[var(--md-sys-color-primary)] transition hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
              title="내 다른 학급·팀원 학급의 활동 가져오기"
            >
              <Icon name="groups" size={15} />
              다른 학급에서 가져오기
            </button>
            <div className="relative">
            <GlassButton
              variant="accent"
              className="!px-4 !py-2 text-xs"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={adding}
            >
              <Icon name="add" size={16} />
              활동 추가
              <Icon name="expand_more" size={16} />
            </GlassButton>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="glass-strong absolute right-0 top-11 z-20 w-44 animate-float-in p-1.5">
                  {(
                    [
                      ["question", "edit_note", "질문 추가", "자유 서술 응답"],
                      ["quiz", "quiz", "문항 출제", "선택지 + 정답"],
                      ["link", "link", "링크 제공", "자료 링크 (제출 없음)"],
                      ["canvas", "dashboard", "보드 (캔버스)", "학생 협업 카드 보드"],
                      [
                        "reflection",
                        "rate_review",
                        "수업 후 성찰",
                        "이해도·흥미도 + 배운 점",
                      ],
                    ] as const
                  )
                    // 수업 전에는 '수업 후 성찰' 활동을 제공하지 않음
                    .filter(([k]) => !(phase === "pre" && k === "reflection"))
                    .map(([k, icon, label, desc]) => (
                    <button
                      key={k}
                      onClick={() => addActivity(k)}
                      className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <Icon
                        name={icon}
                        size={18}
                        className="mt-0.5 text-[var(--md-sys-color-primary)]"
                      />
                      <span>
                        <span className="block text-sm font-semibold">
                          {label}
                        </span>
                        <span className="block text-[11px] text-black/45 dark:text-white/45">
                          {desc}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            </div>
            </>
          )}
        </div>
      </div>

      {importOpen && (
        <ImportPreModal
          preQuestions={questions.filter((q) => q.phase === "pre")}
          alreadyCloned={
            new Set(
              questions
                .filter((q) => q.phase === "post" && q.clonedFrom)
                .map((q) => q.clonedFrom as string)
            )
          }
          busy={importing}
          onClose={() => setImportOpen(false)}
          onImport={doImport}
        />
      )}

      {crossOpen && user && (
        <CrossImportModal
          myCid={cid}
          myLid={lid}
          phase={phase}
          uid={user.uid}
          onClose={() => setCrossOpen(false)}
          onImport={async (sources, src) => {
            if (!user || sources.length === 0) return;
            await cloneQuestionsToPhase(cid, lid, sources, phase, user);
            // 단일 출처 차시면 이 차시를 '같은 수업' 계보로 연결 → 학급 간 비교에 잡힘
            if (src && src.cid !== cid) {
              await linkLessonLineage(cid, lid, src.cid, src.lid, user).catch(
                () => {}
              );
            }
            load();
            setCrossOpen(false);
          }}
        />
      )}

      {!loaded ? (
        <div className="h-40 animate-pulse rounded-2xl bg-white/40 dark:bg-white/5" />
      ) : view === "qa" ? (
        phaseQs.length === 0 ? (
          <GlassCard className="p-10 text-center text-sm text-black/40">
            아직 활동이 없습니다. 우측 상단의 “활동 추가”로 시작하세요.
          </GlassCard>
        ) : (
          phaseQs.map((q, i) => {
            const showLine = !!dragId && overId === q.id && dragId !== q.id;
            return (
            <div
              key={q.id}
              onDragOver={(e) => {
                if (!dragId || dragId === q.id) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setOverId(q.id);
                setOverBefore(e.clientY < r.top + r.height / 2);
              }}
              onDrop={(e) => {
                e.preventDefault();
                reorderTo(q.id, overBefore);
                clearDrag();
              }}
              className={`relative rounded-2xl transition ${
                dragId === q.id ? "opacity-50" : ""
              }`}
            >
              {/* 삽입 위치 줄 (사이) */}
              {showLine && (
                <div
                  className={`pointer-events-none absolute left-1 right-1 z-30 flex items-center gap-1 ${
                    overBefore ? "-top-2.5" : "-bottom-2.5"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--md-sys-color-primary)]" />
                  <span className="h-1 flex-1 rounded-full bg-[var(--md-sys-color-primary)]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--md-sys-color-primary)]" />
                </div>
              )}
              {/* 드래그 핸들 */}
              <button
                draggable
                onDragStart={(e) => {
                  setDragId(q.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={clearDrag}
                className="absolute -left-3 top-1/2 z-20 hidden h-8 w-6 -translate-y-1/2 cursor-grab items-center justify-center rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-black/40 shadow-sm hover:text-black/70 active:cursor-grabbing md:flex"
                title="끌어서 순서 변경"
              >
                <Icon name="drag_indicator" size={18} />
              </button>
              {q.kind === "reflection" ? (
                <ReflectionTeacher
                  cid={cid}
                  lid={lid}
                  question={q}
                  index={i}
                  onChanged={load}
                />
              ) : (
                <QuestionRow
                  cid={cid}
                  lid={lid}
                  question={q}
                  index={i}
                  groups={groups}
                  students={students}
                  allQuestions={questions}
                  onChanged={load}
                />
              )}
            </div>
            );
          })
        )
      ) : view === "students" ? (
        <StudentCards
          cid={cid}
          lid={lid}
          phase={phase}
          questions={phaseQs}
        />
      ) : (
        <MergedMapSection
          cid={cid}
          lid={lid}
          phase={phase}
          questions={phaseQs}
          lessonTitle={lesson.title}
        />
      )}
    </div>
  );
}

/* ---------- 질문 1개: 좌(편집) ↔ 우(제출 결과) 마스터-디테일 ---------- */
function QuestionRow({
  cid,
  lid,
  question,
  index,
  groups,
  students,
  allQuestions,
  onChanged,
}: {
  cid: string;
  lid: string;
  question: Question;
  index: number;
  groups: Group[];
  students: Member[];
  allQuestions: Question[];
  onChanged: () => void;
}) {
  const dialog = useDialog();
  const rowRouter = useRouter();
  const [draft, setDraft] = useState(question.text);
  const [links, setLinks] = useState<QLink[]>(question.links);
  const [options, setOptions] = useState<string[]>(question.options);
  const [answerIdx, setAnswerIdx] = useState(question.answerIndex);
  const [allowResubmit, setAllowResubmit] = useState(question.allowResubmit);
  const [revealAnswer, setRevealAnswer] = useState(!!question.revealAnswer);
  const [boardMode, setBoardMode] = useState<"shared" | "group">(
    question.boardMode === "group" ? "group" : "shared"
  );
  const [audGroupIds, setAudGroupIds] = useState<string[]>(
    question.audGroupIds
  );
  const [audUids, setAudUids] = useState<string[]>(question.audUids);
  const [audMode, setAudMode] = useState<"all" | "groups" | "students">(
    question.audGroupIds.length
      ? "groups"
      : question.audUids.length
        ? "students"
        : "all"
  );
  const [title, setTitle] = useState(question.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [subIdx, setSubIdx] = useState(0);
  const [statsOpen, setStatsOpen] = useState(false);
  const [audExpanded, setAudExpanded] = useState(false);
  const [ontology, setOntology] = useState<Ontology | null>(null);
  const [gen, setGen] = useState<"idle" | "running" | "error">("idle");
  const [genMsg, setGenMsg] = useState("");

  const scope = `q:${question.id}`;

  useEffect(() => {
    setDraft(question.text);
    setLinks(question.links);
    setOptions(question.options);
    setAnswerIdx(question.answerIndex);
    setAllowResubmit(question.allowResubmit);
    setRevealAnswer(!!question.revealAnswer);
    setBoardMode(question.boardMode === "group" ? "group" : "shared");
    setAudGroupIds(question.audGroupIds);
    setAudUids(question.audUids);
    setTitle(question.title);
    setAudMode(
      question.audGroupIds.length
        ? "groups"
        : question.audUids.length
          ? "students"
          : "all"
    );
  }, [question]);

  const isQuiz = question.kind === "quiz";
  const isLink = question.kind === "link";
  const isCanvas = question.kind === "canvas";
  const kindLabel = isQuiz
    ? "문항"
    : isLink
      ? "링크"
      : isCanvas
        ? "보드"
        : "질문";

  // 같은 활동의 수업 전↔후 짝:
  //  - 복제관계: 한쪽이 다른 쪽을 복제(clonedFrom) 했거나
  //  - 같은 출처 복제: 다른 학급의 같은 활동을 전/후로 각각 가져온 경우(clonedFrom 공유)
  //  - 같은 제목(반대 phase)
  const partner = useMemo(
    () =>
      (allQuestions ?? []).find(
        (q) =>
          q.id !== question.id &&
          q.phase !== question.phase &&
          q.kind === question.kind &&
          (q.clonedFrom === question.id ||
            question.clonedFrom === q.id ||
            (!!question.clonedFrom &&
              q.clonedFrom === question.clonedFrom) ||
            (!!question.title.trim() &&
              q.title.trim() === question.title.trim()))
      ),
    [allQuestions, question]
  );
  // 전/후 비교는 '수업 후' 쪽 행에서 한 번만 노출
  const compareInfo = partner
    ? {
        preQid: question.phase === "pre" ? question.id : partner.id,
        postQid: question.phase === "post" ? question.id : partner.id,
        showHere: question.phase === "post",
      }
    : null;

  // 제목 저장 + 같은 이름(반대 phase) 활동이 있으면 짝짓기 제안
  async function saveTitleAndMaybePair() {
    setEditingTitle(false);
    const t = title.trim();
    if (t === question.title.trim()) return;
    await updateQuestion(cid, lid, question.id, { title: t });
    onChanged();
    if (!t) return;
    const src = (allQuestions ?? []).find(
      (q) =>
        q.id !== question.id &&
        q.phase !== question.phase &&
        q.kind === question.kind &&
        q.title.trim() === t
    );
    if (!src) return;
    // 이 활동이 (거의) 비어 있을 때만 가져오기 제안
    const empty =
      !blocksToPlainText(question.text).trim() &&
      (question.links?.length ?? 0) === 0 &&
      (question.options?.length ?? 0) === 0;
    if (!empty) return;
    const ok = await dialog.confirm({
      title: "수업 전/후 짝 만들기",
      body: `${
        src.phase === "pre" ? "수업 전" : "수업 후"
      } ‘${t}’ 활동과 이름이 같습니다. 그 내용(본문·링크·선택지)을 가져와 전·후 비교 짝으로 만들까요?`,
      okLabel: "내용 가져오기",
      cancelLabel: "이름만",
    });
    if (!ok) return;
    await updateQuestion(cid, lid, question.id, {
      text: src.text,
      links: src.links,
      options: src.options,
      answerIndex: src.answerIndex,
      clonedFrom: src.id,
    });
    onChanged();
  }

  useEffect(() => {
    // 제출 실시간 구독 — 학생 응답이 즉시 반영
    return watchQuestionSubmissions(cid, lid, question.id, setSubs);
  }, [cid, lid, question.id]);

  useEffect(() => {
    if (!statsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStatsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [statsOpen]);

  useEffect(() => {
    getOntology(cid, lid, scope).then(setOntology).catch(() => {});
  }, [cid, lid, scope]);

  const answered = subs.filter((s) => s.content.trim());
  const curHash = hashResponses(
    answered.map((s) => ({ uid: s.uid, content: s.content }))
  );
  const stale = ontology
    ? ontology.inputHash !== curHash
    : answered.length > 0;

  // 현재 폼이 서버에 저장된 값과 다른가(=미저장 변경 있음)
  const dirty = useMemo(() => {
    const cur = JSON.stringify({
      t: title.trim(),
      x: draft,
      l: links.filter((l) => l.title || l.url),
      o: options.map((o) => o.trim()).filter(Boolean),
      a: answerIdx,
      g: audGroupIds,
      u: audUids,
      r: allowResubmit,
      v: revealAnswer,
      b: boardMode,
    });
    const sv = JSON.stringify({
      t: question.title.trim(),
      x: question.text,
      l: question.links,
      o: question.options,
      a: question.answerIndex,
      g: question.audGroupIds,
      u: question.audUids,
      r: question.allowResubmit,
      v: !!question.revealAnswer,
      b: question.boardMode === "group" ? "group" : "shared",
    });
    return cur !== sv;
  }, [
    title,
    draft,
    links,
    options,
    answerIdx,
    audGroupIds,
    audUids,
    allowResubmit,
    revealAnswer,
    boardMode,
    question,
  ]);

  async function save() {
    await updateQuestion(cid, lid, question.id, {
      title: title.trim(),
      text: draft,
      links: links.filter((l) => l.title || l.url),
      options: options.map((o) => o.trim()).filter(Boolean),
      answerIndex: answerIdx,
      audGroupIds,
      audUids,
      allowResubmit,
      revealAnswer,
      boardMode,
    });
    setSavedAt(new Date().toLocaleTimeString());
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
    onChanged();
  }

  async function remove() {
    if (
      !(await dialog.confirm({
        title: "활동 삭제",
        body: "이 활동과 제출물을 삭제할까요? 되돌릴 수 없습니다.",
        danger: true,
      }))
    )
      return;
    await deleteQuestion(cid, lid, question.id);
    onChanged();
  }

  async function generate() {
    if (answered.length === 0) {
      setGen("error");
      setGenMsg("분석할 제출이 없습니다.");
      return;
    }
    setGen("running");
    setGenMsg("");
    try {
      const result = await extractOntology({
        classId: cid,
        phase: question.phase,
        question: blocksToPlainText(draft),
        responses: answered.map((s) => ({
          studentId: s.uid,
          text: blocksToPlainText(s.content),
        })),
      });
      const saved = { ...result, inputHash: curHash };
      await saveOntology(cid, lid, scope, saved);
      setOntology(saved);
      setGen("idle");
    } catch (e) {
      setGen("error");
      setGenMsg(e instanceof Error ? e.message : "분석 중 오류가 발생했습니다.");
    }
  }

  return (
    <GlassCard className="p-0">
      <div
        className={`grid gap-0 ${
          isLink
            ? ""
            : "lg:grid-cols-2 lg:divide-x lg:divide-black/5 dark:lg:divide-white/10"
        }`}
      >
        {/* 좌: 활동 편집 */}
        <div className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              {editingTitle ? (
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={saveTitleAndMaybePair}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing)
                      (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") {
                      setTitle(question.title);
                      setEditingTitle(false);
                    }
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-[var(--md-sys-color-primary)] bg-transparent px-2 py-0.5 text-sm font-semibold outline-none"
                  placeholder={`${kindLabel} ${index + 1}`}
                />
              ) : (
                <span
                  className="cursor-text truncate rounded px-1 hover:bg-black/5 dark:hover:bg-white/10"
                  title="클릭해 제목 수정"
                  onClick={() => setEditingTitle(true)}
                >
                  {title.trim() || `${kindLabel} ${index + 1}`}
                </span>
              )}
              <span className="rounded-full bg-[var(--md-sys-color-primary-container)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-sys-color-on-primary-container)]">
                {kindLabel}
              </span>
              <span className="rounded-full bg-[var(--md-sys-color-secondary-container)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-sys-color-on-secondary-container)]">
                {question.phase === "pre" ? "수업 전" : "수업 후"}
              </span>
            </p>
            <div className="flex items-center gap-2">
              {dirty ? (
                <GlassButton
                  variant="accent"
                  className="!px-3 !py-1.5 text-xs"
                  onClick={save}
                >
                  저장
                </GlassButton>
              ) : (
                <span
                  title={savedAt ? `저장됨 ${savedAt}` : "저장됨"}
                  className={`inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-primary)] px-3 py-1.5 text-xs font-bold text-[var(--md-sys-color-primary)] ${
                    savedFlash ? "bg-[var(--md-sys-color-primary-container)]" : ""
                  }`}
                >
                  <Icon name="check_circle" size={14} fill />
                  {savedFlash ? "저장됨!" : "저장됨 · 수정 가능"}
                </span>
              )}
              <button
                onClick={remove}
                className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)]"
                title="활동 삭제"
              >
                <Icon name="delete" size={18} />
              </button>
            </div>
          </div>
          <RichEditor key={`q-${question.id}`} value={draft} onChange={setDraft} />

          {isQuiz && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-black/55 dark:text-white/55">
                선택지 (정답 라디오 선택)
              </p>
              {options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={answerIdx === oi}
                    onChange={() => setAnswerIdx(oi)}
                    title="정답으로 지정"
                  />
                  <input
                    className="m3-field !py-1.5 !text-sm flex-1"
                    placeholder={`선택지 ${oi + 1}`}
                    value={opt}
                    onChange={(e) =>
                      setOptions(
                        options.map((x, j) =>
                          j === oi ? e.target.value : x
                        )
                      )
                    }
                  />
                  <button
                    onClick={() => {
                      setOptions(options.filter((_, j) => j !== oi));
                      if (answerIdx === oi) setAnswerIdx(-1);
                    }}
                    className="text-black/30 hover:text-rose-500"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setOptions([...options, ""])}
                className="self-start inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1 text-xs font-medium text-[var(--md-sys-color-primary)]"
              >
                <Icon name="add" size={14} />
                선택지 추가
              </button>
            </div>
          )}

          {isCanvas && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  rowRouter.push(
                    `/canvas/?class=${cid}&lesson=${lid}&q=${question.id}`
                  )
                }
                className="btn-accent inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
              >
                <Icon name="dashboard" size={16} />
                보드 열기
              </button>
              {/* 공용 / 모둠별 보드 토글 */}
              <div className="inline-flex overflow-hidden rounded-full border border-[var(--md-sys-color-outline)]">
                {(
                  [
                    ["shared", "공용 보드", "groups"],
                    ["group", "모둠별 보드", "workspaces"],
                  ] as const
                ).map(([mode, label, icon]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setBoardMode(mode)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold transition ${
                      boardMode === mode
                        ? "bg-[var(--md-sys-color-primary)] text-white"
                        : "text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
                    }`}
                  >
                    <Icon name={icon} size={14} />
                    {label}
                  </button>
                ))}
              </div>
              {boardMode === "group" && (
                <span className="text-[11px] text-black/45">
                  모둠마다 보드가 따로 생기고, 학생은 자기 모둠 보드만 편집합니다.
                </span>
              )}
            </div>
          )}

          {!isQuiz && !isCanvas && (
            <LinksEditor
              links={links}
              onChange={setLinks}
              groups={groups}
              students={students}
            />
          )}

          {!isLink && !isCanvas && (
            <button
              type="button"
              onClick={() => setAllowResubmit((v) => !v)}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-medium"
              title="저장을 눌러야 반영됩니다"
            >
              <span
                className={`flex h-4 w-7 items-center rounded-full p-0.5 transition ${
                  allowResubmit
                    ? "justify-end bg-[var(--md-sys-color-primary)]"
                    : "justify-start bg-black/20"
                }`}
              >
                <span className="h-3 w-3 rounded-full bg-white" />
              </span>
              제출 후 학생 수정 {allowResubmit ? "허용" : "불가"}
            </button>
          )}

          {isQuiz && (
            <button
              type="button"
              onClick={() => setRevealAnswer((v) => !v)}
              className="ml-2 mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-medium"
              title="켜면 학생이 제출한 뒤 정답이 공개되고, 답은 더 이상 수정할 수 없습니다 (저장 필요)"
            >
              <span
                className={`flex h-4 w-7 items-center rounded-full p-0.5 transition ${
                  revealAnswer
                    ? "justify-end bg-[var(--md-sys-color-primary)]"
                    : "justify-start bg-black/20"
                }`}
              >
                <span className="h-3 w-3 rounded-full bg-white" />
              </span>
              제출 후 정답 공개 {revealAnswer ? "켬" : "끔"}
            </button>
          )}

          {/* 대상 지정 — 전체일 땐 한 줄로 접힘 */}
          {audMode === "all" && !audExpanded ? (
            <button
              type="button"
              onClick={() => setAudExpanded(true)}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-black/[0.03] px-3 py-1.5 text-xs text-black/55 transition hover:bg-black/[0.06] dark:bg-white/[0.04] dark:text-white/60"
              title="대상 변경"
            >
              <Icon name="groups" size={14} />
              대상: 전체 학생
              <Icon name="edit" size={12} className="opacity-50" />
            </button>
          ) : (
          <div className="mt-3 rounded-2xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-black/55 dark:text-white/55">
              <Icon name="groups" size={14} />
              대상
            </p>
            <div className="flex gap-1.5">
              {(
                [
                  ["all", "전체"],
                  ["groups", "모둠"],
                  ["students", "개별"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => {
                    setAudMode(m);
                    if (m === "all") {
                      setAudGroupIds([]);
                      setAudUids([]);
                    } else if (m === "groups") {
                      setAudUids([]);
                    } else {
                      setAudGroupIds([]);
                    }
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    audMode === m
                      ? "bg-[var(--md-sys-color-primary)] text-white"
                      : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-primary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {audMode === "groups" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {groups.length === 0 ? (
                  <span className="text-xs text-black/40">
                    학급 화면의 “모둠”에서 먼저 모둠을 만드세요.
                  </span>
                ) : (
                  groups.map((g) => {
                    const on = audGroupIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        onClick={() =>
                          setAudGroupIds(
                            on
                              ? audGroupIds.filter((x) => x !== g.id)
                              : [...audGroupIds, g.id]
                          )
                        }
                        className={`rounded-full px-2.5 py-1 text-xs ${
                          on
                            ? "bg-[var(--md-sys-color-secondary-container)] font-semibold text-[var(--md-sys-color-on-secondary-container)]"
                            : "bg-black/5 dark:bg-white/10"
                        }`}
                      >
                        {g.name} ({g.memberUids.length})
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {audMode === "students" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {students.length === 0 ? (
                  <span className="text-xs text-black/40">
                    학생이 없습니다.
                  </span>
                ) : (
                  students.map((s) => {
                    const on = audUids.includes(s.uid);
                    return (
                      <button
                        key={s.uid}
                        onClick={() =>
                          setAudUids(
                            on
                              ? audUids.filter((x) => x !== s.uid)
                              : [...audUids, s.uid]
                          )
                        }
                        className={`rounded-full px-2.5 py-1 text-xs ${
                          on
                            ? "bg-[var(--md-sys-color-secondary-container)] font-semibold text-[var(--md-sys-color-on-secondary-container)]"
                            : "bg-black/5 dark:bg-white/10"
                        }`}
                      >
                        {s.displayName}
                      </button>
                    );
                  })
                )}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-black/40">
                {audMode === "all"
                  ? "전체 학생에게 표시됩니다."
                  : audMode === "groups"
                    ? audGroupIds.length
                      ? `선택한 ${audGroupIds.length}개 모둠에게만 표시 (저장 필요)`
                      : "표시할 모둠을 선택하세요."
                    : audUids.length
                      ? `선택한 ${audUids.length}명에게만 표시 (저장 필요)`
                      : "표시할 학생을 선택하세요."}
              </p>
              {audMode === "all" && (
                <button
                  onClick={() => setAudExpanded(false)}
                  className="text-[11px] text-black/40 hover:text-black/60"
                >
                  접기
                </button>
              )}
            </div>
          </div>
          )}
        </div>

        {/* 우: 보드 지식맵 패널 */}
        {isCanvas && (
          <div className="bg-white/30 p-6 dark:bg-white/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                이 보드의 지식맵
                <span className="text-xs font-normal text-black/40">
                  제출 {answered.length}명
                </span>
                {ontology &&
                  (stale ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      변경됨
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      최신 ✓
                    </span>
                  ))}
              </p>
              {stale && (
                <span className="text-[11px] text-amber-600">
                  상단 “분석”에서 분석하세요
                </span>
              )}
            </div>
            {ontology && ontology.nodes.length > 0 ? (
              <div className="mt-3">
                <MiniOntology
                  data={ontology}
                  names={Object.fromEntries(
                    answered.map((s) => [s.uid, s.studentName])
                  )}
                  title={`${question.title || "보드"} 지식맵`}
                />
              </div>
            ) : (
              <p className="mt-3 rounded-2xl bg-white/50 px-4 py-6 text-center text-xs text-black/45 dark:bg-white/5">
                보드에서 카드를 “지식맵으로 보내기” 한 뒤 상단 “분석”을 실행하면
                이 보드만의 지식맵이 생성됩니다.
              </p>
            )}
            {compareInfo?.showHere && (
              <PrePostCompare
                cid={cid}
                lid={lid}
                preQid={compareInfo.preQid}
                postQid={compareInfo.postQid}
                names={Object.fromEntries(
                  answered.map((s) => [s.uid, s.studentName])
                )}
              />
            )}
          </div>
        )}

        {/* 우: 결과 패널 (링크·보드는 제출 패널 없음) */}
        {!isLink && !isCanvas && (
        <div className="bg-white/30 p-6 dark:bg-white/5">
          {isQuiz ? (
            <>
              <p className="text-sm font-semibold">
                응답 분포 ({answered.length})
              </p>
              {(() => {
                const hasAnswer = question.answerIndex >= 0;
                const correctOpt = hasAnswer
                  ? question.options[question.answerIndex]
                  : null;
                const correctList = answered.filter(
                  (s) => s.content.trim() === correctOpt
                );
                const wrongList = answered.filter(
                  (s) => s.content.trim() !== correctOpt
                );
                const n = answered.length;
                const cp = n
                  ? Math.round((correctList.length / n) * 100)
                  : 0;
                return (
                  <button
                    type="button"
                    onClick={() => setStatsOpen(true)}
                    className="mt-3 block w-full rounded-2xl bg-white/60 p-3 text-left transition hover:bg-white/90 dark:bg-white/10"
                    title="클릭하면 정답·오답 전체 현황을 봅니다"
                  >
                    {hasAnswer ? (
                      <>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex items-center gap-3">
                          <span className="font-bold text-emerald-700">
                            정답 {correctList.length}명
                            <span className="ml-1 font-normal text-black/45">
                              ({cp}%)
                            </span>
                          </span>
                          <span className="font-bold text-rose-600">
                            오답 {wrongList.length}명
                            <span className="ml-1 font-normal text-black/45">
                              ({n ? 100 - cp : 0}%)
                            </span>
                          </span>
                          </span>
                          <span className="flex items-center gap-0.5 text-xs font-medium text-[var(--md-sys-color-primary)]">
                            전체 현황
                            <Icon name="chevron_right" size={14} />
                          </span>
                        </div>
                        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-rose-200">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${cp}%` }}
                          />
                        </div>
                        {wrongList.length > 0 && (
                          <div className="mt-2">
                            <p className="text-[11px] font-semibold text-rose-600">
                              오답 학생
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {wrongList.map((s) => (
                                <span
                                  key={s.uid}
                                  className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] text-rose-700"
                                  title={s.content}
                                >
                                  {s.studentName}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-black/45">
                        정답을 지정하면 정답률·오답이 집계됩니다. (응답{" "}
                        {n}명)
                      </p>
                    )}
                  </button>
                );
              })()}
              <div className="mt-3 flex flex-col gap-2">
                {question.options.length === 0 ? (
                  <p className="py-4 text-center text-xs text-black/40">
                    선택지를 저장하면 분포가 표시됩니다.
                  </p>
                ) : (
                  question.options.map((opt, oi) => {
                    const cnt = answered.filter(
                      (s) => s.content.trim() === opt
                    ).length;
                    const pct = answered.length
                      ? Math.round((cnt / answered.length) * 100)
                      : 0;
                    const correct = question.answerIndex === oi;
                    return (
                      <div key={oi}>
                        <div className="mb-0.5 flex justify-between text-xs">
                          <span
                            className={
                              correct
                                ? "font-semibold text-emerald-700"
                                : ""
                            }
                          >
                            {correct && "✓ "}
                            {opt || `선택지 ${oi + 1}`}
                          </span>
                          <span className="text-black/45">
                            {cnt}명 ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                          <div
                            className={`h-full ${
                              correct ? "bg-emerald-500" : "bg-blue-400"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {answered.length > 0 &&
                (() => {
                  const i = Math.min(subIdx, answered.length - 1);
                  const s = answered[i];
                  const ok =
                    question.answerIndex >= 0 &&
                    s.content.trim() ===
                      question.options[question.answerIndex];
                  return (
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between">
                        <button
                          onClick={() => setSubIdx(Math.max(0, i - 1))}
                          disabled={i === 0}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5 disabled:opacity-30 dark:bg-white/10"
                        >
                          <Icon name="chevron_left" size={18} />
                        </button>
                        <span className="text-xs font-semibold">
                          {s.studentName} ({i + 1}/{answered.length})
                        </span>
                        <button
                          onClick={() =>
                            setSubIdx(
                              Math.min(answered.length - 1, i + 1)
                            )
                          }
                          disabled={i >= answered.length - 1}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5 disabled:opacity-30 dark:bg-white/10"
                        >
                          <Icon name="chevron_right" size={18} />
                        </button>
                      </div>
                      <div className="rounded-2xl bg-white/60 px-4 py-3 text-sm dark:bg-white/10">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                            question.answerIndex < 0
                              ? "bg-black/5 dark:bg-white/10"
                              : ok
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {s.content || "(무응답)"}
                          {question.answerIndex >= 0 &&
                            (ok ? " · 정답" : " · 오답")}
                        </span>
                        <CommentThread
                          cid={cid}
                          lid={lid}
                          qid={question.id}
                          sid={s.uid}
                          role="teacher"
                        />
                      </div>
                    </div>
                  );
                })()}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  제출 결과 ({answered.length})
                  {ontology &&
                    (stale ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        변경됨
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        최신 ✓
                      </span>
                    ))}
                </p>
                {stale && (
                  <span className="text-[11px] text-amber-600">
                    상단 “분석”에서 재분석하세요
                  </span>
                )}
              </div>
              {answered.length === 0 ? (
                <p className="py-6 text-center text-sm text-black/40">
                  아직 제출이 없습니다.
                </p>
              ) : (
                (() => {
                  const i = Math.min(subIdx, answered.length - 1);
                  const s = answered[i];
                  return (
                    <div className="mt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <button
                          onClick={() => setSubIdx(Math.max(0, i - 1))}
                          disabled={i === 0}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5 disabled:opacity-30 dark:bg-white/10"
                          title="이전 학생"
                        >
                          <Icon name="chevron_left" size={18} />
                        </button>
                        <span className="text-xs font-semibold text-black/55 dark:text-white/55">
                          {s.studentName}{" "}
                          <span className="font-normal text-black/35">
                            ({i + 1}/{answered.length})
                          </span>
                        </span>
                        <button
                          onClick={() =>
                            setSubIdx(Math.min(answered.length - 1, i + 1))
                          }
                          disabled={i >= answered.length - 1}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5 disabled:opacity-30 dark:bg-white/10"
                          title="다음 학생"
                        >
                          <Icon name="chevron_right" size={18} />
                        </button>
                      </div>
                      <div className="rounded-2xl bg-white/60 px-4 py-3 dark:bg-white/10">
                        <div className="text-sm">
                          <RichEditor
                            key={`sub-${s.uid}`}
                            value={s.content}
                            readOnly
                          />
                        </div>
                        <CommentThread
                          cid={cid}
                          lid={lid}
                          qid={question.id}
                          sid={s.uid}
                          role="teacher"
                        />
                      </div>
                    </div>
                  );
                })()
              )}
              {ontology && (
                <div className="mt-4">
                  <MiniOntology
                    data={ontology}
                    names={Object.fromEntries(
                      answered.map((s) => [s.uid, s.studentName])
                    )}
                    title={`${question.title || "질문"} 지식맵`}
                  />
                </div>
              )}
              {compareInfo?.showHere && (
                <PrePostCompare
                  cid={cid}
                  lid={lid}
                  preQid={compareInfo.preQid}
                  postQid={compareInfo.postQid}
                  names={Object.fromEntries(
                    answered.map((s) => [s.uid, s.studentName])
                  )}
                />
              )}
            </>
          )}
        </div>
        )}
      </div>

      {statsOpen && isQuiz && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setStatsOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-[var(--md-sys-color-surface-container-high)] shadow-[var(--md-sys-elevation-3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
              <p className="text-base font-semibold">
                문항 {index + 1} · 정답/오답 현황
              </p>
              <button
                onClick={() => setStatsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)]"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
            {(() => {
              const correctOpt =
                question.answerIndex >= 0
                  ? question.options[question.answerIndex]
                  : null;
              const ok = answered.filter(
                (s) => s.content.trim() === correctOpt
              );
              const ng = answered.filter(
                (s) => s.content.trim() !== correctOpt
              );
              const Row = ({
                s,
                good,
              }: {
                s: Submission;
                good: boolean;
              }) => (
                <li className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-4 py-2.5 text-sm dark:bg-white/10">
                  <span className="font-medium">{s.studentName}</span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      good
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {s.content || "(무응답)"}
                  </span>
                </li>
              );
              return (
                <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-bold text-emerald-700">
                      정답 {ok.length}명
                      {correctOpt && (
                        <span className="ml-1 font-normal text-black/45">
                          · {correctOpt}
                        </span>
                      )}
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {ok.length === 0 ? (
                        <li className="py-4 text-center text-xs text-black/35">
                          없음
                        </li>
                      ) : (
                        ok.map((s) => (
                          <Row key={s.uid} s={s} good />
                        ))
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-bold text-rose-600">
                      오답 {ng.length}명
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {ng.length === 0 ? (
                        <li className="py-4 text-center text-xs text-black/35">
                          없음
                        </li>
                      ) : (
                        ng.map((s) => (
                          <Row key={s.uid} s={s} good={false} />
                        ))
                      )}
                    </ul>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

/* ---------- 학생별 카드 + 학생별 온톨로지 ---------- */
type StudentBundle = {
  uid: string;
  name: string;
  answers: { question: Question; content: string }[];
};

function StaleBar({
  staleCount,
  gen,
  genMsg,
  onRun,
}: {
  staleCount: number;
  gen: "idle" | "running" | "error";
  genMsg: string;
  onRun: () => void;
}) {
  const alert = staleCount > 0;
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-xs ${
        alert
          ? "border border-amber-300 bg-amber-50 dark:bg-amber-500/10"
          : "bg-white/40 dark:bg-white/5"
      }`}
    >
      <span
        className={`flex items-center gap-1.5 ${
          alert
            ? "font-semibold text-amber-700"
            : "text-black/55 dark:text-white/55"
        }`}
      >
        {alert && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[11px] font-extrabold text-white">
            !
          </span>
        )}
        {alert
          ? `새 응답이 들어왔어요 — 미분석 활동 ${staleCount}개. 재분석할까요?`
          : "모든 활동이 최신입니다 · 학생별/통합은 LLM 호출 없이 파생"}
      </span>
      <GlassButton
        variant="accent"
        className="!px-4 !py-2 text-xs"
        onClick={onRun}
        disabled={gen === "running" || staleCount === 0}
      >
        {gen === "running" ? (
          "분석 중… (최대 1분)"
        ) : (
          <>
            <Icon name="network_intelligence" size={16} />
            {alert ? `재분석 (${staleCount})` : "최신"}
          </>
        )}
      </GlassButton>
      {gen === "error" && <p className="w-full text-red-500">{genMsg}</p>}
    </div>
  );
}

/* ---------- 학생별 (LLM 호출 0 — 리프 머지 후 학생 필터) ---------- */
function StudentCards({
  cid,
  lid,
  questions,
}: {
  cid: string;
  lid: string;
  phase: Phase;
  questions: Question[];
}) {
  const { data, merged, staleQids, gen, genMsg, generateStale } = useLeaves(
    cid,
    lid,
    questions
  );

  const bundles = useMemo(() => {
    const map = new Map<string, StudentBundle>();
    for (const q of questions) {
      for (const s of data.subsByQ[q.id] ?? []) {
        if (!s.content.trim()) continue;
        if (!map.has(s.uid))
          map.set(s.uid, { uid: s.uid, name: s.studentName, answers: [] });
        map.get(s.uid)!.answers.push({ question: q, content: s.content });
      }
    }
    return [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "ko")
    );
  }, [questions, data.subsByQ]);

  if (bundles.length === 0) {
    return (
      <GlassCard className="p-10 text-center text-sm text-black/40">
        아직 제출한 학생이 없습니다.
      </GlassCard>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {bundles.map((b) => (
          <StudentCard
            key={b.uid}
            bundle={b}
            ontology={filterOntologyByStudent(merged, b.uid)}
          />
        ))}
      </div>
    </div>
  );
}

function StudentCard({
  bundle,
  ontology,
}: {
  bundle: StudentBundle;
  ontology: Ontology;
}) {
  const has = ontology.nodes.length > 0;
  return (
    <GlassCard className="flex flex-col p-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--md-sys-color-primary-container)] text-xs font-bold text-[var(--md-sys-color-on-primary-container)]">
          {bundle.name.slice(0, 1)}
        </span>
        <p className="text-sm font-semibold">{bundle.name}</p>
        <span className="text-xs font-normal text-black/40">
          · 답변 {bundle.answers.length}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {bundle.answers.map((a, i) => (
          <li
            key={a.question.id}
            className="rounded-2xl bg-white/40 px-4 py-3 dark:bg-white/5"
          >
            <p className="mb-1 text-xs font-semibold text-black/45 dark:text-white/45">
              질문 {i + 1}
            </p>
            <div className="text-sm">
              <RichEditor value={a.content} readOnly />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        {has ? (
          <MiniOntology
            data={ontology}
            names={{ [bundle.uid]: bundle.name }}
            title={`${bundle.name} 지식맵`}
          />
        ) : (
          <p className="rounded-2xl bg-white/40 py-4 text-center text-xs text-black/40 dark:bg-white/5">
            “변경된 질문 분석”을 실행하면 이 학생이 기여한 지식맵이 표시됩니다.
          </p>
        )}
      </div>
    </GlassCard>
  );
}

/* ---------- 통합 지식 맵 (LLM 호출 0 — 리프 머지) ---------- */
function MergedMapSection({
  cid,
  lid,
  phase,
  questions,
  lessonTitle,
}: {
  cid: string;
  lid: string;
  phase: Phase;
  questions: Question[];
  lessonTitle?: string;
}) {
  const { data, merged, staleQids, gen, genMsg, generateStale } = useLeaves(
    cid,
    lid,
    questions
  );
  const leafCount = Object.values(data.leaves).filter(Boolean).length;
  const scope = `norm:${phase}`;

  const [tab, setTab] = useState<"graph" | "emotion">("graph");
  const [norm, setNorm] = useState<Ontology | null>(null);
  const [normGen, setNormGen] = useState<"idle" | "running" | "error">(
    "idle"
  );
  const [normMsg, setNormMsg] = useState("");

  const labelHash = useMemo(() => hashLabels(merged.nodes), [merged]);
  const normFresh = !!norm && norm.inputHash === labelHash;

  useEffect(() => {
    getOntology(cid, lid, scope).then(setNorm).catch(() => {});
  }, [cid, lid, scope]);

  const display =
    normFresh && norm ? norm : merged;

  async function normalize() {
    if (merged.nodes.length === 0) return;
    setNormGen("running");
    setNormMsg("");
    try {
      const lc = await canonicalizeOntology({
        classId: cid,
        nodes: merged.nodes.map((n) => ({
          id: n.id,
          label: n.label,
          sourceCount: n.sourceCount ?? n.sources?.length ?? 0,
        })),
      });
      const applied = applyLabelClusters(merged, lc);
      const saved = { ...applied, inputHash: labelHash };
      await saveOntology(cid, lid, scope, saved);
      setNorm(saved);
      setNormGen("idle");
    } catch (e) {
      setNormGen("error");
      setNormMsg(
        e instanceof Error ? e.message : "정리 중 오류가 발생했습니다."
      );
    }
  }

  // --- 스토리텔링 인사이트 (중첩도 + 대표 응답) ---
  const insScope = `wiki:lesson:${lid}:${phase}`;
  const [insights, setInsights] = useState<
    (WikiInsights & { inputHash?: string }) | null
  >(null);
  const [insGen, setInsGen] = useState<"idle" | "running" | "error">("idle");
  const [insMsg, setInsMsg] = useState("");
  const insFresh = !!insights && !!labelHash && insights.inputHash === labelHash;
  useEffect(() => {
    setInsights(null);
    getClassInsights<WikiInsights>(cid, insScope)
      .then(setInsights)
      .catch(() => {});
  }, [cid, insScope]);

  async function genInsights() {
    if (display.nodes.length === 0) return;
    setInsGen("running");
    setInsMsg("");
    try {
      // 학생 수(중첩 분모) + 대표 응답 샘플(전수 아님, 비용·프라이버시)
      const uidSet = new Set<string>();
      const samples: { student: string; text: string }[] = [];
      for (const q of questions) {
        for (const s of data.subsByQ[q.id] ?? []) {
          if (!s.content.trim()) continue;
          uidSet.add(s.uid);
          if (samples.length < 8)
            samples.push({
              student: s.studentName,
              text: blocksToPlainText(s.content).slice(0, 300),
            });
        }
      }
      const payload = {
        phase,
        studentCount: uidSet.size,
        concepts: display.nodes
          .slice()
          .sort(
            (a, b) =>
              (b.sourceCount ?? b.sources?.length ?? 0) -
              (a.sourceCount ?? a.sources?.length ?? 0)
          )
          .slice(0, 40)
          .map((n) => ({
            id: n.id,
            label: n.label,
            type: n.type,
            sentiment: n.sentiment,
            sourceCount: n.sourceCount ?? n.sources?.length ?? 0,
          })),
        relations: display.edges
          .slice(0, 40)
          .map((e) => ({ source: e.source, target: e.target, relation: e.relation })),
        sampleResponses: samples,
      };
      const res = await wikiInsights({ classId: cid, payload });
      const saved = { ...res, inputHash: labelHash };
      await saveClassInsights(cid, insScope, saved);
      setInsights(saved);
      setInsGen("idle");
    } catch (e) {
      setInsGen("error");
      setInsMsg(e instanceof Error ? e.message : "생성 중 오류가 발생했습니다.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">
            {phase === "pre" ? "수업 전" : "수업 후"} 통합 지식 맵
            <span className="ml-2 text-xs font-normal text-black/40">
              질문 {leafCount}/{questions.length}개 머지 (LLM 0)
            </span>
          </p>
          {merged.nodes.length > 0 && (
            <div className="flex items-center gap-2">
              {normFresh ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  동의어 정리됨 ✓
                </span>
              ) : norm ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  변경됨
                </span>
              ) : null}
              <GlassButton
                variant="ghost"
                className="!h-8 !px-3 text-xs"
                onClick={normalize}
                disabled={normGen === "running" || normFresh}
                title="동의어·표기변형 노드를 통합 (라벨만 LLM, 저비용)"
              >
                {normGen === "running" ? "정리 중…" : "동의어 통합"}
              </GlassButton>
            </div>
          )}
        </div>
        {normGen === "error" && (
          <p className="mt-2 text-xs text-red-500">{normMsg}</p>
        )}

        {merged.nodes.length > 0 ? (
          <div className="mt-4">
            <div className="mb-3 inline-flex rounded-full bg-black/5 p-0.5 dark:bg-white/10">
              {(
                [
                  ["graph", "지식 그래프"],
                  ["emotion", "감정"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    tab === k
                      ? "bg-white/80 text-black/80 shadow-sm dark:bg-white/20 dark:text-white"
                      : "text-black/45 dark:text-white/45"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "graph" ? (
              <>
                {display.summary && (
                  <p className="text-sm leading-relaxed text-black/70 dark:text-white/70">
                    {display.summary}
                  </p>
                )}
                <div className="mt-4">
                  <SentimentBar s={display.overallSentiment} />
                </div>
                <div className="mt-4">
                  <ExpandableGraph
                    data={display}
                    studentNames={data.names}
                    variant="button"
                    title={`${lessonTitle ?? "차시"} 지식맵`}
                  />
                </div>
              </>
            ) : (
              <EmotionPanel data={display} names={data.names} />
            )}
          </div>
        ) : (
          <p className="mt-4 py-6 text-center text-sm text-black/40">
            아직 분석된 질문이 없습니다. 위 “변경된 질문 분석”을 실행하세요.
          </p>
        )}
      </GlassCard>

      {/* 스토리텔링 인사이트 */}
      {display.nodes.length > 0 && (
        <GlassCard className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Icon
                name="auto_stories"
                size={16}
                className="text-[var(--md-sys-color-primary)]"
              />
              인사이트 (중첩도·개별 응답)
              {insFresh && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  최신 ✓
                </span>
              )}
            </p>
            <GlassButton
              variant="accent"
              className="!px-4 !py-2 text-xs"
              onClick={genInsights}
              disabled={insGen === "running" || insFresh}
            >
              {insGen === "running"
                ? "생성 중…"
                : insights
                  ? "다시 생성"
                  : "인사이트 생성"}
            </GlassButton>
          </div>
          {insGen === "error" && (
            <p className="mt-2 text-xs text-red-500">{insMsg}</p>
          )}
          {insights ? (
            <div className="mt-3 flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-black/75 dark:text-white/75">
                {insights.narrative}
              </p>
              {(insights.highlights?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-black/55">
                    <Icon name="person" size={13} />
                    개별 응답에서
                  </p>
                  <ul className="list-disc pl-5 text-sm text-black/70 dark:text-white/70">
                    {insights.highlights!.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}
              {[
                ["다음 수업 질문 제안", insights.followUps],
                ["관찰된 오개념·약점", insights.misconceptions],
                ["보강이 필요한 개념", insights.gaps],
              ].map(([title, arr]) =>
                (arr as string[])?.length ? (
                  <div key={title as string}>
                    <p className="mb-1 text-xs font-semibold text-black/55">
                      {title as string}
                    </p>
                    <ul className="list-disc pl-5 text-sm text-black/70 dark:text-white/70">
                      {(arr as string[]).map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs text-black/45">
              “인사이트 생성”으로 어떤 개념이 널리 공유됐는지(중첩도)와 개별
              응답의 특이점을 스토리텔링으로 받아보세요. (라벨·언급수와 대표 응답
              샘플만 전송 — 저비용)
            </p>
          )}
        </GlassCard>
      )}
    </div>
  );
}

function MiniOntology({
  data,
  names,
  title,
}: {
  data: Ontology;
  names?: Record<string, string>;
  title?: string;
}) {
  return (
    <div className="rounded-2xl bg-white/40 p-3 dark:bg-white/5">
      {data.summary && (
        <p className="mb-2 text-xs leading-relaxed text-black/60 dark:text-white/60">
          {data.summary}
        </p>
      )}
      <SentimentBar s={data.overallSentiment} />
      <div className="mt-2 overflow-hidden rounded-xl">
        <ExpandableGraph
          data={data}
          studentNames={names}
          variant="button"
          title={title ?? "질문 지식맵"}
        />
      </div>
    </div>
  );
}

/* ---------- 같은 활동 수업 전↔후 비교 (복제 또는 같은 제목으로 짝지음) ---------- */
function PrePostCompare({
  cid,
  lid,
  preQid,
  postQid,
  names,
}: {
  cid: string;
  lid: string;
  preQid: string;
  postQid: string;
  names: Record<string, string>;
}) {
  const [pre, setPre] = useState<Ontology | null>(null);
  const [post, setPost] = useState<Ontology | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"graph" | "table">("graph");
  const [mode, setMode] = useState<"all" | "pre" | "post" | "both" | "diff">(
    "all"
  );

  useEffect(() => {
    getOntology(cid, lid, `q:${preQid}`).then(setPre).catch(() => {});
    getOntology(cid, lid, `q:${postQid}`).then(setPost).catch(() => {});
  }, [cid, lid, preQid, postQid]);

  const { overlay, statusByKey, counts } = useMemo(
    () => buildPrePostOverlay(pre, post),
    [pre, post]
  );
  const changes = useMemo(
    () => diffPrePost(pre ?? EMPTY_ONTOLOGY, post ?? EMPTY_ONTOLOGY),
    [pre, post]
  );

  // 선택한 강조 모드에 맞는 노드만 남긴 그래프
  const display = useMemo(
    () => filterOverlayByMode(overlay, statusByKey, mode),
    [overlay, statusByKey, mode]
  );

  if (overlay.nodes.length === 0) return null;

  const legend: [typeof mode, string, number][] = [
    ["all", "전체", counts.pre + counts.both + counts.post],
    ["pre", "수업 전만", counts.pre],
    ["both", "공통", counts.both],
    ["post", "수업 후 신규", counts.post],
    ["diff", "차이(전·후만)", counts.pre + counts.post],
  ];

  return (
    <div className="mt-4 border-t border-black/5 pt-4 dark:border-white/10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-sm font-semibold"
      >
        <span className="flex items-center gap-1.5">
          <Icon name="compare_arrows" size={16} className="text-[var(--md-sys-color-primary)]" />
          이 활동의 수업 전↔후 비교
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} size={18} />
      </button>
      {open && (
        <div className="mt-3">
          {/* 그래프 / 표 보기 토글 */}
          <div className="mb-2 inline-flex rounded-full bg-black/5 p-0.5 dark:bg-white/10">
            {(
              [
                ["graph", "그래프"],
                ["table", "표"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  view === v
                    ? "bg-white/80 text-black/80 shadow-sm dark:bg-white/20"
                    : "text-black/45"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {view === "table" ? (
            <PrePostTable changes={changes} />
          ) : (
            <>
              {/* 강조 필터 탭 (바깥 + 확대 모달 공용) */}
              <CompareTabs
                colors={PREPOST_COLOR}
                legend={legend}
                mode={mode}
                setMode={setMode}
                className="mb-2"
              />
              <div className="overflow-hidden rounded-xl">
                {display.nodes.length === 0 ? (
                  <p className="rounded-xl bg-white/50 px-4 py-6 text-center text-xs text-black/45 dark:bg-white/5">
                    해당하는 개념이 없습니다.
                  </p>
                ) : (
                  <ExpandableGraph
                    data={display}
                    studentNames={names}
                    variant="button"
                    title={`수업 전/후 비교 · ${
                      legend.find(([m]) => m === mode)?.[1] ?? "전체"
                    }`}
                    nodeColor={(node) =>
                      PREPOST_COLOR[statusByKey[node.id] ?? "both"]
                    }
                    modalHeader={
                      <CompareTabs
                        colors={PREPOST_COLOR}
                        legend={legend}
                        mode={mode}
                        setMode={setMode}
                      />
                    }
                  />
                )}
              </div>
              <p className="mt-2 text-[11px] text-black/45">
                주황=수업 전만 있던 개념, 자홍=전·후 공통(지속), 초록=수업 후
                새로 등장. 위 버튼으로 사전/사후/공통/차이만 강조해 볼 수 있어요.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* 사전/사후/공통/차이 강조 탭 (비교 그래프 공용) */
function CompareTabs<M extends string>({
  colors,
  legend,
  mode,
  setMode,
  className,
}: {
  colors: Record<string, string>;
  legend: [M, string, number][];
  mode: M;
  setMode: (m: M) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ""}`}>
      {legend.map(([m, label, n]) => {
        const active = mode === m;
        const dot =
          m === "pre"
            ? colors.pre
            : m === "post"
              ? colors.post
              : m === "both"
                ? colors.both
                : null;
        return (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              active
                ? "bg-[var(--md-sys-color-primary)] text-white"
                : "border border-[var(--md-sys-color-outline)] text-black/60 hover:bg-black/5 dark:text-white/60"
            }`}
          >
            {dot && (
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: active ? "#fff" : dot }}
              />
            )}
            {label}
            <span className={active ? "opacity-80" : "text-black/40"}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- 학생 ---------- */
function StudentPanel({
  cid,
  lid,
  phase,
}: {
  cid: string;
  lid: string;
  phase: Phase;
}) {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [myGroupIds, setMyGroupIds] = useState<string[]>([]);

  useEffect(() => {
    // 실시간 — 교사의 질문/수정허용/대상 변경이 즉시 학생에 반영
    return watchQuestions(cid, lid, setQuestions);
  }, [cid, lid]);

  useEffect(() => {
    if (!user) return;
    listGroups(cid)
      .then((gs) =>
        setMyGroupIds(
          gs.filter((g) => g.memberUids.includes(user.uid)).map((g) => g.id)
        )
      )
      .catch(() => {});
  }, [cid, user]);

  const phaseQs = useMemo(
    () =>
      (questions ?? [])
        .filter((q) => q.phase === phase)
        .filter((q) => {
          // 대상: 전체(비어있음) | 내 모둠 포함 | 내 uid 포함
          if (q.audGroupIds.length === 0 && q.audUids.length === 0)
            return true;
          if (user && q.audUids.includes(user.uid)) return true;
          if (q.audGroupIds.some((g) => myGroupIds.includes(g))) return true;
          return false;
        })
        .sort((a, b) => a.order - b.order),
    [questions, phase, user, myGroupIds]
  );

  if (questions === null) {
    return (
      <div className="mt-4 h-40 animate-pulse rounded-2xl bg-white/40 dark:bg-white/5" />
    );
  }
  if (phaseQs.length === 0) {
    return (
      <GlassCard className="mt-4 p-10 text-center text-sm text-black/40">
        아직 등록된 {phase === "pre" ? "수업 전" : "수업 후"} 활동이 없습니다.
      </GlassCard>
    );
  }
  return (
    <div className="mt-4 flex flex-col gap-4">
      {phaseQs.map((q, i) =>
        q.kind === "reflection" ? (
          <ReflectionStudent key={q.id} cid={cid} lid={lid} question={q} index={i} />
        ) : (
          <StudentQuestionCard
            key={q.id}
            cid={cid}
            lid={lid}
            question={q}
            index={i}
            myGroupIds={myGroupIds}
          />
        )
      )}
    </div>
  );
}

function StudentQuestionCard({
  cid,
  lid,
  question,
  index,
  myGroupIds,
}: {
  cid: string;
  lid: string;
  question: Question;
  index: number;
  myGroupIds: string[];
}) {
  const { user } = useAuth();
  const sRouter = useRouter();
  const isQuiz = question.kind === "quiz";
  const isLink = question.kind === "link";
  const isCanvas = question.kind === "canvas";
  const kindLabel = isQuiz
    ? "문항"
    : isLink
      ? "링크"
      : isCanvas
        ? "보드"
        : "질문";

  const [content, setContent] = useState("");
  const [choice, setChoice] = useState("");
  const [mine, setMine] = useState<Submission | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || isLink) {
      setReady(true);
      return;
    }
    setReady(false);
    getMyQuestionSubmission(cid, lid, question.id, user.uid).then((s) => {
      setMine(s);
      if (isQuiz) {
        setChoice(s?.content ?? "");
      } else {
        setContent(s && s.content.trim() ? s.content : question.text);
      }
      setReady(true);
    });
    // 활동(id)·사용자 변경 시에만 초기화한다. question.text 변경(교사 실시간
    // 편집)으로 재실행하면 학생이 작성 중인 내용을 덮어쓰므로 의존성에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cid, lid, question.id, isQuiz, isLink]);

  const value = isQuiz ? choice : content;
  const hasAnswer = isQuiz
    ? choice.trim().length > 0
    : blocksToPlainText(content).trim().length > 0;
  // 제출 doc이 있으면(서버타임스탬프 미해석이어도) 제출된 것으로 간주
  const submitted =
    !!mine && (!!mine.submittedAt || mine.content.trim().length > 0);
  // 문항 정답 공개: 제출 후 공개되며, 공개되면 답을 더 못 바꾼다(부정행위 방지)
  const quizRevealed = isQuiz && submitted && !!question.revealAnswer;
  const locked = (submitted && !question.allowResubmit) || quizRevealed;
  const prevAns = isQuiz
    ? (mine?.content ?? "")
    : blocksToPlainText(mine?.content ?? "").trim();
  const curAns = isQuiz ? choice : blocksToPlainText(content).trim();
  const dirty = submitted && curAns !== prevAns;
  const canSubmit =
    !busy && ready && hasAnswer && !locked && (!submitted || dirty);
  const correct =
    isQuiz &&
    submitted &&
    question.answerIndex >= 0 &&
    choice === question.options[question.answerIndex];

  async function submit() {
    if (!user || !hasAnswer || !canSubmit) return;
    setBusy(true);
    try {
      await submitQuestionResponse(
        cid,
        lid,
        question.id,
        user,
        question.phase,
        value
      );
      setMine({
        uid: user.uid,
        studentName: user.displayName ?? "나",
        phase: question.phase,
        content: value,
        submittedAt: Date.now(),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard className="p-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {question.title.trim() || `${kindLabel} ${index + 1}`}
          <span className="rounded-full bg-[var(--md-sys-color-primary-container)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-sys-color-on-primary-container)]">
            {kindLabel}
          </span>
          <span className="rounded-full bg-[var(--md-sys-color-secondary-container)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-sys-color-on-secondary-container)]">
            {question.phase === "pre" ? "수업 전" : "수업 후"}
          </span>
        </p>
        {!isLink && submitted && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <Icon name="check" size={14} />
            제출 완료
            <span className="font-normal text-emerald-700/70">
              · {question.allowResubmit ? "수정 가능" : "수정 불가"}
            </span>
          </span>
        )}
      </div>
      {blocksToPlainText(question.text).trim() ? (
        <RichEditor key={`qv-${question.id}`} value={question.text} readOnly />
      ) : (
        !isLink && <p className="text-sm text-black/40">본문이 없습니다.</p>
      )}
      <LinkChips
        links={question.links}
        viewerUid={user?.uid}
        viewerGroupIds={myGroupIds}
      />

      {isCanvas ? (
        <>
          <button
            onClick={() =>
              sRouter.push(
                `/canvas/?class=${cid}&lesson=${lid}&q=${question.id}`
              )
            }
            className="btn-accent mt-4 flex w-full items-center justify-center gap-1.5 px-5 py-3 text-sm font-semibold"
          >
            <Icon name="dashboard" size={18} />
            보드 참여하기
          </button>
          {question.boardMode === "group" && (
            <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-black/45">
              <Icon name="workspaces" size={13} />
              우리 모둠 전용 보드로 들어갑니다.
            </p>
          )}
        </>
      ) : isLink ? (
        <p className="mt-4 rounded-2xl bg-white/40 py-4 text-center text-sm text-black/45 dark:bg-white/5">
          위 자료/링크를 확인하세요. (제출이 없는 활동입니다)
        </p>
      ) : (
        <div className="mt-4 border-t border-black/5 pt-4 dark:border-white/10">
          <p className="mb-2 text-sm font-semibold">내 답변</p>
          {!ready ? (
            <div className="h-32 animate-pulse rounded-2xl bg-white/40 dark:bg-white/5" />
          ) : isQuiz ? (
            <div className="flex flex-col gap-2">
              {question.options.length === 0 ? (
                <p className="text-sm text-black/40">
                  선택지가 아직 없습니다.
                </p>
              ) : (
                question.options.map((opt, oi) => {
                  const picked = choice === opt;
                  const revealOk =
                    quizRevealed &&
                    question.answerIndex >= 0 &&
                    oi === question.answerIndex;
                  return (
                    <label
                      key={oi}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition ${
                        revealOk
                          ? "border-emerald-400 bg-emerald-50"
                          : picked
                            ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]"
                            : "border-[var(--md-sys-color-outline-variant)]"
                      } ${locked ? "pointer-events-none opacity-80" : ""}`}
                    >
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        checked={picked}
                        onChange={() => setChoice(opt)}
                        disabled={locked}
                      />
                      {opt || `선택지 ${oi + 1}`}
                      {revealOk && (
                        <span className="ml-auto text-xs font-semibold text-emerald-700">
                          정답
                        </span>
                      )}
                    </label>
                  );
                })
              )}
              {quizRevealed && question.answerIndex >= 0 ? (
                <p
                  className={`text-xs font-semibold ${
                    correct ? "text-emerald-700" : "text-rose-600"
                  }`}
                >
                  {correct ? "정답입니다 ✓" : "오답입니다"}
                </p>
              ) : submitted ? (
                <p className="text-xs text-black/45">
                  제출 완료 — 정답은 선생님이 공개하면 표시됩니다.
                </p>
              ) : null}
            </div>
          ) : locked ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <BlockView value={mine?.content ?? content} />
            </div>
          ) : (
            <RichEditor
              key={`a-${question.id}`}
              value={content}
              onChange={setContent}
              readOnly={locked}
            />
          )}
          {locked ? (
            <div className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700">
              <Icon name="lock" size={18} />
              {quizRevealed
                ? "제출 완료 · 정답이 공개되어 수정할 수 없습니다"
                : "제출 완료 · 교사가 수정을 잠갔습니다 (수정 불가)"}
            </div>
          ) : (
            <button
              className="btn-accent mt-3 flex w-full items-center justify-center gap-1.5 px-5 py-3 text-sm font-semibold disabled:opacity-60"
              disabled={!canSubmit}
              onClick={submit}
            >
              {submitted && !dirty && <Icon name="check" size={18} />}
              {busy
                ? "제출 중…"
                : !submitted
                  ? "제출하기"
                  : dirty
                    ? "수정 제출"
                    : "제출 완료"}
            </button>
          )}
        </div>
      )}
      {user && !isLink && !isCanvas && (
        <CommentThread
          cid={cid}
          lid={lid}
          qid={question.id}
          sid={user.uid}
          role="student"
        />
      )}
    </GlassCard>
  );
}

function ResourcesCard({
  cid,
  lid,
  canEdit,
}: {
  cid: string;
  lid: string;
  canEdit: boolean;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<Resource[]>([]);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<ResourceType>("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const reload = useCallback(() => {
    listResources(cid, lid).then(setItems).catch(() => {});
  }, [cid, lid]);
  useEffect(() => {
    reload();
  }, [reload]);

  async function add() {
    if (!user || !title.trim()) return;
    await createResource(cid, user, lid, { type, title, url });
    setTitle("");
    setUrl("");
    setAdding(false);
    reload();
  }

  return (
    <GlassCard className="mt-4 p-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="folder" size={18} />
          자료 / 링크 ({items.length})
        </p>
        {canEdit && (
          <button
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
          >
            <Icon name="add" size={14} />
            추가
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-3 flex flex-col gap-2 rounded-xl bg-[var(--md-sys-color-surface-container)] p-3">
          <div className="flex gap-2">
            {(["link", "file", "note"] as ResourceType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  type === t
                    ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]"
                    : "text-[var(--md-sys-color-on-surface-variant)]"
                }`}
              >
                {t === "link" ? "링크" : t === "file" ? "파일" : "메모"}
              </button>
            ))}
          </div>
          <input
            className="m3-field !py-2 !text-sm"
            placeholder="제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {type !== "note" && (
            <input
              className="m3-field !py-2 !text-sm"
              placeholder="URL (https://...)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          )}
          <button
            className="btn-accent self-end px-4 py-2 text-xs font-semibold"
            disabled={!title.trim()}
            onClick={add}
          >
            저장
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
          자료가 없습니다.{" "}
          {canEdit && "추가하거나 학급 빌더에서 다른 차시의 자료를 끌어오세요."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-xl bg-[var(--md-sys-color-surface-container)] px-4 py-2.5"
            >
              <Icon
                name={
                  r.type === "link"
                    ? "link"
                    : r.type === "file"
                      ? "attach_file"
                      : "sticky_note_2"
                }
                size={18}
                className="text-[var(--md-sys-color-on-surface-variant)]"
              />
              {r.url ? (
                <a
                  href={normalizeUrl(r.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm text-[var(--md-sys-color-primary)] hover:underline"
                >
                  {r.title || r.url}
                </a>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm">
                  {r.title}
                </span>
              )}
              {canEdit && (
                <button
                  onClick={async () => {
                    await deleteResource(cid, r.id);
                    reload();
                  }}
                  className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)]"
                >
                  <Icon name="delete" size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

export default function LessonPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <div className="animate-pulse text-sm text-black/40">
            불러오는 중…
          </div>
        </main>
      }
    >
      <LessonDetail />
    </Suspense>
  );
}

/* ---------- 수업 후 성찰: 이해도(별)·흥미도(하트) + 배운 점 ---------- */
function RatingRow({
  value,
  onChange,
  icon,
  color,
  readonly,
  size = 30,
  center,
}: {
  value: number;
  onChange?: (n: number) => void;
  icon: string;
  color: string;
  readonly?: boolean;
  size?: number;
  center?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 ${center ? "justify-center" : ""}`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const full = value >= n;
        const half = !full && value >= n - 0.5;
        return (
          <button
            key={n}
            type="button"
            disabled={readonly}
            // 한 번 클릭=정수, 같은 칸 다시 클릭=반 점(0.5)
            onClick={() => onChange?.(value === n ? n - 0.5 : n)}
            className={readonly ? "" : "transition hover:scale-110"}
            style={{ lineHeight: 0 }}
            title={`${n}점 (다시 누르면 ${n - 0.5}점)`}
          >
            <span
              style={{
                position: "relative",
                display: "inline-block",
                width: size,
                height: size,
              }}
            >
              <span style={{ position: "absolute", inset: 0, color: "#d6dbe2" }}>
                <Icon name={icon} size={size} fill />
              </span>
              {(full || half) && (
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    overflow: "hidden",
                    width: full ? "100%" : "50%",
                    color,
                  }}
                >
                  <Icon name={icon} size={size} fill />
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ReflectionStudent({
  cid,
  lid,
  question,
  index,
}: {
  cid: string;
  lid: string;
  question: Question;
  index: number;
}) {
  const { user } = useAuth();
  const [mine, setMine] = useState<Submission | null>(null);
  const [open, setOpen] = useState(false);
  const [u, setU] = useState(0);
  const [it, setIt] = useState(0);
  const [text, setText] = useState("");
  const [app, setApp] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMyQuestionSubmission(cid, lid, question.id, user.uid).then((s) => {
      setMine(s);
      if (s) {
        setU(s.understanding ?? 0);
        setIt(s.interest ?? 0);
        setText(s.content ?? "");
        setApp(s.application ?? "");
      }
    });
  }, [user, cid, lid, question.id]);

  const submitted = !!mine && (mine.understanding ?? 0) > 0;
  const title = question.title.trim() || `수업 후 성찰 ${index + 1}`;

  async function confirm() {
    if (!user || u === 0 || it === 0 || busy) return;
    setBusy(true);
    try {
      await setReflectionSubmission(
        cid,
        lid,
        question.id,
        user.uid,
        user.displayName ?? "학생",
        question.phase,
        {
          understanding: u,
          interest: it,
          content: text.trim(),
          application: app.trim(),
        }
      );
      setMine({
        uid: user.uid,
        studentName: user.displayName ?? "학생",
        phase: question.phase,
        content: text.trim(),
        understanding: u,
        interest: it,
        application: app.trim(),
        submittedAt: Date.now(),
      });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard className="p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {title}
          <span className="rounded-full bg-[var(--md-sys-color-primary-container)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-sys-color-on-primary-container)]">
            성찰
          </span>
        </p>
        {submitted && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <Icon name="check" size={14} />
            제출 완료
          </span>
        )}
      </div>

      {submitted ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="flex items-center gap-2 text-sm">
              <span className="w-12 text-black/55">이해도</span>
              <RatingRow value={mine!.understanding ?? 0} icon="star" color="#f5a623" readonly size={22} />
            </span>
            <span className="flex items-center gap-2 text-sm">
              <span className="w-12 text-black/55">흥미도</span>
              <RatingRow value={mine!.interest ?? 0} icon="favorite" color="#ef4444" readonly size={22} />
            </span>
          </div>
          {mine!.content && (
            <div className="rounded-xl bg-[var(--md-sys-color-surface-container)] p-3 text-sm">
              <p className="mb-0.5 text-[11px] font-semibold text-black/45">
                배운 내용 / 느낀 점
              </p>
              <p className="whitespace-pre-wrap">{mine!.content}</p>
            </div>
          )}
          {mine!.application && (
            <div className="rounded-xl bg-[var(--md-sys-color-surface-container)] p-3 text-sm">
              <p className="mb-0.5 text-[11px] font-semibold text-black/45">
                어디에 쓸 수 있을까?
              </p>
              <p className="whitespace-pre-wrap">{mine!.application}</p>
            </div>
          )}
          {question.allowResubmit !== false ? (
            <button
              onClick={() => setOpen(true)}
              className="self-start text-xs font-semibold text-[var(--md-sys-color-primary)] hover:underline"
            >
              수정하기
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 self-start text-xs text-black/45">
              <Icon name="lock" size={13} />
              제출 후 수정이 잠겨 있습니다
            </span>
          )}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="btn-accent inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold"
        >
          <Icon name="rate_review" size={16} />
          성찰 작성하기
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <GlassCard
            strong
            className="w-full max-w-md animate-float-in p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">{title}</h2>
            <div className="mt-5 flex flex-col gap-5">
              <div>
                <p className="mb-2 text-center text-sm font-semibold text-black/65">
                  학습 내용 이해도
                </p>
                <RatingRow
                  value={u}
                  onChange={setU}
                  icon="star"
                  color="#f5a623"
                  size={48}
                  center
                />
              </div>
              <div>
                <p className="mb-2 text-center text-sm font-semibold text-black/65">
                  흥미도
                </p>
                <RatingRow
                  value={it}
                  onChange={setIt}
                  icon="favorite"
                  color="#ef4444"
                  size={48}
                  center
                />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-semibold text-black/65">
                  배운 내용 / 느낀 점
                </p>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  placeholder="오늘 배운 내용을 적어 보세요."
                  className="m3-field w-full !py-2 !text-sm"
                />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-semibold text-black/65">
                  배운 걸 나중에 어디에 쓸 수 있을까?
                </p>
                <textarea
                  value={app}
                  onChange={(e) => setApp(e.target.value)}
                  rows={3}
                  placeholder="배운 내용이 쓰일 만한 상황·분야를 적어 보세요."
                  className="m3-field w-full !py-2 !text-sm"
                />
              </div>
              <button
                onClick={confirm}
                disabled={busy || u === 0 || it === 0}
                className="btn-accent px-5 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "저장 중…" : "확정"}
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </GlassCard>
  );
}

function ReflectionTeacher({
  cid,
  lid,
  question,
  index,
  onChanged,
}: {
  cid: string;
  lid: string;
  question: Question;
  index: number;
  onChanged: () => void;
}) {
  const dialog = useDialog();
  const { user } = useAuth();
  const [subs, setSubs] = useState<Submission[]>([]);
  const [title, setTitle] = useState(question.title);
  const [rewarded, setRewarded] = useState<Record<string, number>>({});

  useEffect(
    () => watchQuestionSubmissions(cid, lid, question.id, setSubs),
    [cid, lid, question.id]
  );

  async function reward(s: Submission) {
    if (!user) return;
    const v = await dialog.prompt({
      title: `${s.studentName}에게 경험치`,
      description: "성찰 응답에 대한 보상 경험치를 입력하세요.",
      defaultValue: "10",
      placeholder: "숫자",
      okLabel: "지급",
    });
    if (v === null) return;
    const amt = parseInt(v, 10);
    if (!amt) return;
    await grantXp(
      cid,
      [s.uid],
      amt,
      `성찰 보상: ${title.trim() || "수업 후 성찰"}`,
      user.uid
    ).catch(() => {});
    setRewarded((p) => ({ ...p, [s.uid]: (p[s.uid] ?? 0) + amt }));
  }

  const answered = subs.filter((s) => (s.understanding ?? 0) > 0);
  const avg = (key: "understanding" | "interest") =>
    answered.length
      ? answered.reduce((a, s) => a + (s[key] ?? 0), 0) / answered.length
      : 0;
  const avgU = avg("understanding");
  const avgI = avg("interest");

  async function saveTitle() {
    if (title.trim() && title.trim() !== question.title) {
      await updateQuestion(cid, lid, question.id, { title: title.trim() });
      onChanged();
    }
  }
  async function remove() {
    if (
      await dialog.confirm({
        title: "활동 삭제",
        body: "이 성찰 활동과 학생 응답을 모두 삭제할까요?",
        danger: true,
      })
    ) {
      await deleteQuestion(cid, lid, question.id);
      onChanged();
    }
  }

  return (
    <GlassCard className="p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            placeholder={`수업 후 성찰 ${index + 1}`}
            className="min-w-0 rounded-lg border border-transparent bg-transparent px-1 text-sm font-semibold hover:border-[var(--md-sys-color-outline-variant)] focus:border-[var(--md-sys-color-primary)] focus:outline-none"
          />
          <span className="shrink-0 rounded-full bg-[var(--md-sys-color-primary-container)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-sys-color-on-primary-container)]">
            성찰
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={async () => {
              await updateQuestion(cid, lid, question.id, {
                allowResubmit: question.allowResubmit === false,
              });
              onChanged();
            }}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-medium"
            title="학생이 제출 후 성찰을 수정할 수 있는지"
          >
            <span
              className={`flex h-4 w-7 items-center rounded-full p-0.5 transition ${
                question.allowResubmit !== false
                  ? "justify-end bg-[var(--md-sys-color-primary)]"
                  : "justify-start bg-black/20"
              }`}
            >
              <span className="h-3 w-3 rounded-full bg-white" />
            </span>
            제출 후 수정 {question.allowResubmit !== false ? "허용" : "불가"}
          </button>
          <button
            onClick={remove}
            className="flex h-8 w-8 items-center justify-center rounded-full text-black/35 hover:bg-rose-100 hover:text-rose-600"
            title="활동 삭제"
          >
            <Icon name="delete" size={16} />
          </button>
        </div>
      </div>

      {/* 평균 요약 */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-2.5">
          <Icon name="star" size={18} fill style={{ color: "#f5a623" }} />
          <span className="text-sm text-black/55">이해도 평균</span>
          <span className="text-lg font-extrabold">{avgU.toFixed(1)}</span>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-2.5">
          <Icon name="favorite" size={18} fill style={{ color: "#ef4444" }} />
          <span className="text-sm text-black/55">흥미도 평균</span>
          <span className="text-lg font-extrabold">{avgI.toFixed(1)}</span>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-2.5">
          <Icon name="group" size={18} className="text-[var(--md-sys-color-primary)]" />
          <span className="text-sm text-black/55">응답</span>
          <span className="text-lg font-extrabold">{answered.length}명</span>
        </div>
      </div>

      {/* 학생별 응답 표 */}
      {answered.length === 0 ? (
        <p className="py-6 text-center text-sm text-black/40">
          아직 제출한 학생이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--md-sys-color-outline-variant)] text-left text-xs text-black/50">
                <th className="py-2 pr-3 font-semibold">학생</th>
                <th className="py-2 pr-3 font-semibold">이해도</th>
                <th className="py-2 pr-3 font-semibold">흥미도</th>
                <th className="py-2 pr-3 font-semibold">배운 내용 / 느낀 점</th>
                <th className="py-2 pr-3 font-semibold">어디에 쓸까</th>
                <th className="py-2 font-semibold">보상</th>
              </tr>
            </thead>
            <tbody>
              {answered.map((s) => (
                <tr
                  key={s.uid}
                  className="border-b border-[var(--md-sys-color-outline-variant)] align-top"
                >
                  <td className="py-2 pr-3 font-medium">{s.studentName}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-0.5">
                      <Icon name="star" size={14} fill style={{ color: "#f5a623" }} />
                      {s.understanding}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-0.5">
                      <Icon name="favorite" size={14} fill style={{ color: "#ef4444" }} />
                      {s.interest}
                    </span>
                  </td>
                  <td className="py-2 pr-3 whitespace-pre-wrap text-black/75">
                    {s.content || "—"}
                  </td>
                  <td className="py-2 pr-3 whitespace-pre-wrap text-black/75">
                    {s.application || "—"}
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => reward(s)}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-primary)] px-2.5 py-1 text-xs font-bold text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
                    >
                      <Icon name="bolt" size={14} />
                      {rewarded[s.uid] ? `+${rewarded[s.uid]} 지급됨` : "경험치"}
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="py-2 pr-3">평균</td>
                <td className="py-2 pr-3 text-[#f5a623]">{avgU.toFixed(1)}</td>
                <td className="py-2 pr-3 text-[#ef4444]">{avgI.toFixed(1)}</td>
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3" />
                <td className="py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}


/* ---------- 수업 전 활동 선택 가져오기 모달 ---------- */
const IMPORT_KIND_LABEL: Record<string, string> = {
  question: "질문",
  quiz: "문항",
  link: "링크",
  canvas: "보드",
  reflection: "성찰",
};
function ImportPreModal({
  preQuestions,
  alreadyCloned,
  busy,
  onClose,
  onImport,
}: {
  preQuestions: Question[];
  alreadyCloned: Set<string>;
  busy: boolean;
  onClose: () => void;
  onImport: (sources: Question[]) => void;
}) {
  const importable = preQuestions
    .filter((q) => !alreadyCloned.has(q.id))
    .sort((a, b) => a.order - b.order);
  const [sel, setSel] = useState<Set<string>>(
    () => new Set(importable.map((q) => q.id))
  );
  const allChecked = importable.length > 0 && importable.every((q) => sel.has(q.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <GlassCard
        strong
        className="flex max-h-[82vh] w-full max-w-md flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Icon
              name="content_copy"
              size={20}
              className="text-[var(--md-sys-color-primary)]"
            />
            수업 전 활동 가져오기
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <p className="mb-3 text-xs text-black/50">
          가져올 활동을 선택하세요. 수업 후로 복제되며 학생 응답은 새로 받습니다.
        </p>

        {preQuestions.length === 0 ? (
          <p className="py-8 text-center text-sm text-black/40">
            수업 전 활동이 없습니다.
          </p>
        ) : (
          <>
            <button
              onClick={() =>
                setSel(allChecked ? new Set() : new Set(importable.map((q) => q.id)))
              }
              className="mb-2 self-start text-xs font-semibold text-[var(--md-sys-color-primary)] hover:underline"
            >
              {allChecked ? "전체 해제" : "전체 선택"}
            </button>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ul className="flex flex-col gap-1.5">
                {preQuestions
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((q) => {
                    const cloned = alreadyCloned.has(q.id);
                    const picked = sel.has(q.id);
                    return (
                      <li key={q.id}>
                        <label
                          className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition ${
                            cloned
                              ? "border-transparent opacity-50"
                              : picked
                                ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]"
                                : "border-[var(--md-sys-color-outline-variant)] hover:bg-black/5"
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={cloned || busy}
                            checked={picked && !cloned}
                            onChange={(e) =>
                              setSel((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.add(q.id);
                                else n.delete(q.id);
                                return n;
                              })
                            }
                            className="h-5 w-5 shrink-0 accent-[var(--md-sys-color-primary)]"
                          />
                          <span className="shrink-0 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 text-[10px] font-medium text-black/55">
                            {IMPORT_KIND_LABEL[q.kind] ?? q.kind}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {q.title.trim() || "(제목 없음)"}
                          </span>
                          {cloned && (
                            <span className="shrink-0 text-[11px] font-semibold text-black/40">
                              이미 가져옴
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
              </ul>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-full border border-[var(--md-sys-color-outline)] px-5 py-2.5 text-sm font-semibold text-black/60 hover:bg-black/5"
              >
                취소
              </button>
              <button
                disabled={busy || sel.size === 0}
                onClick={() =>
                  onImport(importable.filter((q) => sel.has(q.id)))
                }
                className="btn-accent px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "가져오는 중…" : `가져오기 (${sel.size})`}
              </button>
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
}

/* ---------- 가져오기 모달의 클래스 HDD 트리 노드(모듈 최상위) ---------- */
type ImportTreeCtx = {
  expanded: Set<string>;
  sel: Map<string, Question>;
  toggle: (id: string) => void;
  toggleLesson: (l: Lesson) => void;
  toggleAct: (lid: string, q: Question) => void;
  actsByLesson: Record<string, Question[] | null>;
  childProjects: (pid: string | null) => Project[];
  lessonsOf: (pid: string | null) => Lesson[];
};

function ImportLessonNode({
  l,
  depth,
  ctx,
}: {
  l: Lesson;
  depth: number;
  ctx: ImportTreeCtx;
}) {
  const open = ctx.expanded.has(`l:${l.id}`);
  const acts = ctx.actsByLesson[l.id];
  return (
    <li>
      <button
        onClick={() => ctx.toggleLesson(l)}
        style={{ paddingLeft: 8 + depth * 16 }}
        className="flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-left text-sm hover:bg-black/5"
      >
        <Icon
          name={open ? "expand_more" : "chevron_right"}
          size={16}
          className="shrink-0 text-black/40"
        />
        <Icon name="menu_book" size={15} className="shrink-0 text-black/45" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {l.title || "(제목 없음)"}
        </span>
        <span className="shrink-0 text-[11px] text-black/40">{l.date}</span>
      </button>
      {open && (
        <ul>
          {acts === null || acts === undefined ? (
            <li
              style={{ paddingLeft: 8 + (depth + 1) * 16 }}
              className="py-1.5 text-xs text-black/40"
            >
              불러오는 중…
            </li>
          ) : acts.length === 0 ? (
            <li
              style={{ paddingLeft: 8 + (depth + 1) * 16 }}
              className="py-1.5 text-xs text-black/40"
            >
              활동이 없습니다.
            </li>
          ) : (
            acts.map((q) => {
              const picked = ctx.sel.has(`${l.id}:${q.id}`);
              return (
                <li key={q.id}>
                  <label
                    style={{ paddingLeft: 8 + (depth + 1) * 16 }}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg py-2 pr-2 text-sm ${
                      picked
                        ? "bg-[var(--md-sys-color-primary-container)]"
                        : "hover:bg-black/5"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={picked}
                      onChange={() => ctx.toggleAct(l.id, q)}
                      className="h-4 w-4 shrink-0 accent-[var(--md-sys-color-primary)]"
                    />
                    <span className="shrink-0 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 text-[10px] font-medium text-black/55">
                      {IMPORT_KIND_LABEL[q.kind] ?? q.kind}
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--md-sys-color-secondary-container)] px-1.5 text-[10px] font-medium text-[var(--md-sys-color-on-secondary-container)]">
                      {q.phase === "pre" ? "전" : "후"}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {q.title.trim() || "(제목 없음)"}
                    </span>
                  </label>
                </li>
              );
            })
          )}
        </ul>
      )}
    </li>
  );
}

function ImportProjectNode({
  p,
  depth,
  ctx,
}: {
  p: Project;
  depth: number;
  ctx: ImportTreeCtx;
}) {
  const open = ctx.expanded.has(`p:${p.id}`);
  const subs = ctx.childProjects(p.id);
  const ls = ctx.lessonsOf(p.id);
  return (
    <li>
      <button
        onClick={() => ctx.toggle(`p:${p.id}`)}
        style={{ paddingLeft: 8 + depth * 16 }}
        className="flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-left text-sm hover:bg-black/5"
      >
        <Icon
          name={open ? "expand_more" : "chevron_right"}
          size={16}
          className="shrink-0 text-black/40"
        />
        <Icon
          name={open ? "folder_open" : "folder"}
          size={15}
          className="shrink-0 text-[var(--md-sys-color-primary)]"
        />
        <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
      </button>
      {open && (
        <ul>
          {subs.map((sp) => (
            <ImportProjectNode key={sp.id} p={sp} depth={depth + 1} ctx={ctx} />
          ))}
          {ls.map((l) => (
            <ImportLessonNode key={l.id} l={l} depth={depth + 1} ctx={ctx} />
          ))}
          {subs.length === 0 && ls.length === 0 && (
            <li
              style={{ paddingLeft: 8 + (depth + 1) * 16 }}
              className="py-1.5 text-xs text-black/40"
            >
              비어 있습니다.
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/* ---------- 다른 학급(내 다른 반·팀원 반)에서 활동 가져오기 ---------- */
function CrossImportModal({
  myCid,
  myLid,
  phase,
  uid,
  onClose,
  onImport,
}: {
  myCid: string;
  myLid: string;
  phase: Phase;
  uid: string;
  onClose: () => void;
  // src: 선택 활동이 모두 한 출처 차시일 때 그 차시(계보 연결용), 아니면 null
  onImport: (
    sources: Question[],
    src: { cid: string; lid: string } | null
  ) => Promise<void>;
}) {
  const [classes, setClasses] = useState<SourceClass[] | null>(null);
  const [srcClass, setSrcClass] = useState<SourceClass | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actsByLesson, setActsByLesson] = useState<
    Record<string, Question[] | null>
  >({});
  // 선택한 활동: key = `${lessonId}:${qid}` → Question
  const [sel, setSel] = useState<Map<string, Question>>(new Map());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listSourceClasses(uid).then(setClasses).catch(() => setClasses([]));
  }, [uid]);

  async function openClass(c: SourceClass) {
    setSrcClass(c);
    setLoadingTree(true);
    setExpanded(new Set());
    setActsByLesson({});
    setSel(new Map());
    const [ls, ps] = await Promise.all([
      listLessons(c.cid).catch(() => [] as Lesson[]),
      listProjects(c.cid).catch(() => [] as Project[]),
    ]);
    setLessons(ls.sort((a, b) => a.order - b.order));
    setProjects(ps);
    setLoadingTree(false);
  }

  function toggle(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function toggleLesson(l: Lesson) {
    if (!srcClass) return;
    toggle(`l:${l.id}`);
    if (actsByLesson[l.id] === undefined) {
      setActsByLesson((m) => ({ ...m, [l.id]: null })); // 로딩중 표시
      const qs = await listQuestions(srcClass.cid, l.id).catch(
        () => [] as Question[]
      );
      setActsByLesson((m) => ({
        ...m,
        [l.id]: qs.sort((a, b) => a.order - b.order),
      }));
    }
  }

  const childProjects = (pid: string | null) =>
    projects.filter((p) => (p.parentProjectId ?? null) === pid);
  const lessonsOf = (pid: string | null) =>
    lessons.filter((l) => (l.projectId ?? null) === pid);

  function toggleAct(lid: string, q: Question) {
    const key = `${lid}:${q.id}`;
    setSel((m) => {
      const n = new Map(m);
      if (n.has(key)) n.delete(key);
      else n.set(key, q);
      return n;
    });
  }

  // 차시 노드 (활동 목록 펼침)
  // 트리 노드(모듈 최상위 컴포넌트)에 넘길 컨텍스트
  const treeCtx: ImportTreeCtx = {
    expanded,
    sel,
    toggle,
    toggleLesson,
    toggleAct,
    actsByLesson,
    childProjects,
    lessonsOf,
  };

  const title = srcClass
    ? `${srcClass.name} · 클래스 HDD`
    : "출처 학급 선택";
  const rootProjects = childProjects(null);
  const rootLessons = lessonsOf(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <GlassCard
        strong
        className="flex max-h-[82vh] w-full max-w-md flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-bold">
            {srcClass && (
              <button
                onClick={() => {
                  setSrcClass(null);
                  setLessons([]);
                  setProjects([]);
                  setSel(new Map());
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/5"
              >
                <Icon name="arrow_back" size={16} />
              </button>
            )}
            <Icon
              name="groups"
              size={18}
              className="text-[var(--md-sys-color-primary)]"
            />
            <span className="truncate">{title}</span>
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* 1) 학급 선택 */}
          {!srcClass &&
            (classes === null ? (
              <p className="py-8 text-center text-sm text-black/40">
                불러오는 중…
              </p>
            ) : classes.length === 0 ? (
              <p className="py-8 text-center text-sm text-black/40">
                가져올 학급이 없습니다.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {classes.map((c) => (
                  <li key={c.cid}>
                    <button
                      onClick={() => openClass(c)}
                      className="flex w-full items-center gap-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] px-3 py-2.5 text-left text-sm hover:bg-black/5"
                    >
                      <Icon
                        name={c.mine ? "school" : "groups"}
                        size={16}
                        className="text-[var(--md-sys-color-primary)]"
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {c.name}
                      </span>
                      <span className="shrink-0 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 text-[10px] text-black/55">
                        {c.teacher}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ))}

          {/* 2) 클래스 HDD 트리 */}
          {srcClass &&
            (loadingTree ? (
              <p className="py-8 text-center text-sm text-black/40">
                불러오는 중…
              </p>
            ) : rootProjects.length === 0 &&
              rootLessons.length === 0 &&
              lessons.length === 0 ? (
              <p className="py-8 text-center text-sm text-black/40">
                차시가 없습니다.
              </p>
            ) : (
              <ul className="flex flex-col">
                {rootProjects.map((p) => (
                  <ImportProjectNode key={p.id} p={p} depth={0} ctx={treeCtx} />
                ))}
                {rootLessons.length > 0 && (
                  <li>
                    <div
                      style={{ paddingLeft: 8 }}
                      className="flex items-center gap-2 py-2 text-xs font-semibold text-black/40"
                    >
                      <Icon name="folder_open" size={15} />
                      미분류 (프로젝트 없음)
                    </div>
                    <ul>
                      {rootLessons.map((l) => (
                        <ImportLessonNode
                          key={l.id}
                          l={l}
                          depth={1}
                          ctx={treeCtx}
                        />
                      ))}
                    </ul>
                  </li>
                )}
              </ul>
            ))}
        </div>

        {srcClass && sel.size > 0 && (
          <div className="mt-4 flex items-center justify-end gap-2">
            <span className="mr-auto text-xs text-black/45">
              {phase === "pre" ? "수업 전" : "수업 후"}으로 복제됩니다
            </span>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  // 선택 활동의 출처 차시(키 = `${lid}:${qid}`)가 하나뿐이면
                  // 계보 연결 대상으로 전달 → 학급 간 비교에 자동으로 잡힘
                  const lids = new Set(
                    [...sel.keys()].map((k) => k.split(":")[0])
                  );
                  const src =
                    srcClass && lids.size === 1
                      ? { cid: srcClass.cid, lid: [...lids][0] }
                      : null;
                  await onImport([...sel.values()], src);
                } finally {
                  setBusy(false);
                }
              }}
              className="btn-accent px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "가져오는 중…" : `가져오기 (${sel.size})`}
            </button>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
