"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard, GlassButton } from "@/components/Glass";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import { SentimentBar, GraphView } from "@/components/GraphView";
import { ExpandableGraph } from "@/components/ExpandableGraph";
import { EmotionPanel } from "@/components/EmotionPanel";
import { getMyRole } from "@/lib/classes";
import {
  getClassInsights,
  getClassOntology,
  getOntology,
  listLessons,
  listQuestions,
  listQuestionSubmissions,
  saveClassInsights,
  saveClassOntology,
  saveOntology,
  type Lesson,
  type Ontology,
  type Phase,
  type Question,
  type Submission,
} from "@/lib/lessons";
import { listProjects, type Project } from "@/lib/projects";
import { listGroups, type Group } from "@/lib/groups";
import { buildPrePostOverlay, filterOverlayByMode } from "@/lib/compare";
import { PrePostTable } from "@/components/CompareTable";
import {
  CATEGORY_PALETTE,
  GROUP_COMMON_COLOR,
  PREPOST_COLOR,
} from "@/lib/palette";
import {
  canonicalizeOntology,
  extractOntology,
  wikiInsights,
  type WikiInsights,
} from "@/lib/ai";
import {
  applyLabelClusters,
  diffPrePost,
  filterOntologyByGroup,
  filterOntologyByStudent,
  hashLabels,
  hashResponses,
  mergeOntologies,
} from "@/lib/ontology";
import { blocksToPlainText } from "@/components/RichEditor";

type Entry = {
  lid: string;
  q: Question;
  subs: Submission[];
  leaf: Ontology | null;
};

type Scope =
  | { mode: "all" }
  | { mode: "project"; projectId: string }
  | { mode: "select"; lessonIds: string[] };

function strHash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* 멀티 차시 리프 로더 (LLM은 변경된 질문에만) */
function useMultiLeaves(cid: string, lessonIds: string[]) {
  const key = [...lessonIds].sort().join(",");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const [gen, setGen] = useState<"idle" | "running" | "error">("idle");
  const [genMsg, setGenMsg] = useState("");

  useEffect(() => {
    let alive = true;
    setEntries(null);
    (async () => {
      const ids = key ? key.split(",") : [];
      const all: Entry[] = [];
      const nm: Record<string, string> = {};
      await Promise.all(
        ids.map(async (lid) => {
          const qs = await listQuestions(cid, lid).catch(
            () => [] as Question[]
          );
          await Promise.all(
            qs.map(async (q) => {
              const subs = await listQuestionSubmissions(
                cid,
                lid,
                q.id
              ).catch(() => [] as Submission[]);
              for (const s of subs) nm[s.uid] = s.studentName;
              const leaf = await getOntology(
                cid,
                lid,
                `q:${q.id}`
              ).catch(() => null);
              all.push({ lid, q, subs, leaf });
            })
          );
        })
      );
      if (alive) {
        setEntries(all);
        setNames(nm);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, key, tick]);

  const staleEntries = useMemo(
    () =>
      (entries ?? []).filter((e) => {
        if (e.q.kind !== "question" && e.q.kind !== "canvas") return false;
        const ans = e.subs.filter((s) => s.content.trim());
        if (ans.length === 0) return false;
        const h = hashResponses(
          ans.map((s) => ({ uid: s.uid, content: s.content }))
        );
        return !e.leaf || e.leaf.inputHash !== h;
      }),
    [entries]
  );

  const generateStale = useCallback(async () => {
    if (staleEntries.length === 0) return;
    setGen("running");
    setGenMsg("");
    try {
      for (const e of staleEntries) {
        const ans = e.subs.filter((s) => s.content.trim());
        if (ans.length === 0) continue;
        const result = await extractOntology({
          classId: cid,
          phase: e.q.phase,
          question: blocksToPlainText(e.q.text),
          responses: ans.map((s) => ({
            studentId: s.uid,
            text: blocksToPlainText(s.content),
          })),
        });
        await saveOntology(cid, e.lid, `q:${e.q.id}`, {
          ...result,
          inputHash: hashResponses(
            ans.map((s) => ({ uid: s.uid, content: s.content }))
          ),
        });
      }
      setGen("idle");
      reload();
    } catch (err) {
      setGen("error");
      setGenMsg(
        err instanceof Error ? err.message : "분석 중 오류가 발생했습니다."
      );
    }
  }, [staleEntries, cid, reload]);

  const generateAll = useCallback(async () => {
    const targets = (entries ?? []).filter(
      (e) =>
        (e.q.kind === "question" || e.q.kind === "canvas") &&
        e.subs.some((s) => s.content.trim())
    );
    if (targets.length === 0) return;
    setGen("running");
    setGenMsg("");
    try {
      for (const e of targets) {
        const ans = e.subs.filter((s) => s.content.trim());
        const result = await extractOntology({
          classId: cid,
          phase: e.q.phase,
          question: blocksToPlainText(e.q.text),
          responses: ans.map((s) => ({
            studentId: s.uid,
            text: blocksToPlainText(s.content),
          })),
        });
        await saveOntology(cid, e.lid, `q:${e.q.id}`, {
          ...result,
          inputHash: hashResponses(
            ans.map((s) => ({ uid: s.uid, content: s.content }))
          ),
        });
      }
      setGen("idle");
      reload();
    } catch (err) {
      setGen("error");
      setGenMsg(
        err instanceof Error ? err.message : "분석 중 오류가 발생했습니다."
      );
    }
  }, [entries, cid, reload]);

  return {
    entries,
    names,
    staleEntries,
    gen,
    genMsg,
    generateStale,
    generateAll,
  };
}

function ClassMap() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const cid = params.get("class");

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [scope, setScope] = useState<Scope>({ mode: "all" });
  const [phase, setPhase] = useState<Phase>("pre");
  const [tab, setTab] = useState<
    "summary" | "graph" | "compare" | "groups" | "emotion" | "insight"
  >("summary");
  const [studentUid, setStudentUid] = useState<string>("");

  const [insights, setInsights] = useState<
    (WikiInsights & { inputHash?: string }) | null
  >(null);
  const [insGen, setInsGen] = useState<"idle" | "running" | "error">(
    "idle"
  );
  const [insMsg, setInsMsg] = useState("");
  // 분석 직후 인사이트를 함께 자동 생성하기 위한 플래그
  const [pendingInsight, setPendingInsight] = useState(false);

  const [norm, setNorm] = useState<Ontology | null>(null);
  const [normGen, setNormGen] = useState<"idle" | "running" | "error">(
    "idle"
  );
  const [normMsg, setNormMsg] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !cid) return;
    getMyRole(cid, user.uid).then((r) => setAllowed(r === "teacher"));
    listLessons(cid).then(setLessons).catch(() => {});
    listProjects(cid).then(setProjects).catch(() => {});
    listGroups(cid).then(setGroups).catch(() => {});
  }, [user, cid]);

  // 프로젝트 하위 트리(중첩 폴더) 차시 모으기
  const lessonsInProject = useCallback(
    (pid: string) => {
      const childMap = new Map<string | null, string[]>();
      for (const p of projects) {
        const k = p.parentProjectId;
        childMap.set(k, [...(childMap.get(k) ?? []), p.id]);
      }
      const subtree = new Set<string>([pid]);
      const stack = [pid];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const ch of childMap.get(cur) ?? []) {
          if (!subtree.has(ch)) {
            subtree.add(ch);
            stack.push(ch);
          }
        }
      }
      return lessons
        .filter((l) => l.projectId && subtree.has(l.projectId))
        .map((l) => l.id);
    },
    [projects, lessons]
  );

  const targetLessonIds = useMemo(() => {
    if (scope.mode === "all") return lessons.map((l) => l.id);
    if (scope.mode === "project") return lessonsInProject(scope.projectId);
    return scope.lessonIds;
  }, [scope, lessons, lessonsInProject]);

  const {
    entries,
    names,
    staleEntries,
    gen,
    genMsg,
    generateStale,
    generateAll,
  } = useMultiLeaves(cid ?? "", targetLessonIds);

  const merged = useMemo(() => {
    if (!entries) return null;
    const leaves = entries
      .filter((e) => e.q.phase === phase && e.leaf)
      .map((e) => e.leaf as Ontology);
    return mergeOntologies(leaves);
  }, [entries, phase]);

  const mergedPre = useMemo(
    () =>
      mergeOntologies(
        (entries ?? [])
          .filter((e) => e.q.phase === "pre" && e.leaf)
          .map((e) => e.leaf as Ontology)
      ),
    [entries]
  );
  const mergedPost = useMemo(
    () =>
      mergeOntologies(
        (entries ?? [])
          .filter((e) => e.q.phase === "post" && e.leaf)
          .map((e) => e.leaf as Ontology)
      ),
    [entries]
  );
  const changes = useMemo(
    () => diffPrePost(mergedPre, mergedPost),
    [mergedPre, mergedPost]
  );

  const selKey = useMemo(() => {
    if (scope.mode === "all") return "all";
    if (scope.mode === "project") return `proj:${scope.projectId}`;
    return `sel:${strHash([...scope.lessonIds].sort().join(","))}`;
  }, [scope]);
  const normScope = `norm:${selKey}:${phase}`;
  const labelHash = useMemo(
    () => (merged ? hashLabels(merged.nodes) : ""),
    [merged]
  );
  const normFresh = !!norm && !!labelHash && norm.inputHash === labelHash;

  useEffect(() => {
    setNorm(null);
    if (!cid) return;
    getClassOntology(cid, normScope).then(setNorm).catch(() => {});
  }, [cid, normScope]);

  const base = normFresh && norm ? norm : merged;
  const display = useMemo(() => {
    if (!base) return null;
    return studentUid ? filterOntologyByStudent(base, studentUid) : base;
  }, [base, studentUid]);

  async function normalize() {
    if (!cid || !merged || merged.nodes.length === 0) return;
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
      await saveClassOntology(cid, normScope, saved);
      setNorm(saved);
      setNormGen("idle");
    } catch (e) {
      setNormGen("error");
      setNormMsg(
        e instanceof Error ? e.message : "정리 중 오류가 발생했습니다."
      );
    }
  }

  // 위키 인사이트 (라벨/JSON만 LLM, 범위·phase별 캐시)
  const wikiScope = `wiki:${selKey}:${phase}`;
  const insFresh =
    !!insights && !!labelHash && insights.inputHash === labelHash;
  useEffect(() => {
    setInsights(null);
    if (!cid) return;
    getClassInsights<WikiInsights>(cid, wikiScope)
      .then(setInsights)
      .catch(() => {});
  }, [cid, wikiScope]);

  async function genInsights() {
    if (!cid || !base || base.nodes.length === 0) return;
    setInsGen("running");
    setInsMsg("");
    try {
      // 학생 수(중첩 분모) + 대표 응답 샘플(전수 아님)
      const uidSet = new Set<string>();
      const samples: { student: string; text: string }[] = [];
      for (const e of entries ?? []) {
        if (e.q.phase !== phase) continue;
        for (const s of e.subs) {
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
        concepts: base.nodes.map((n) => ({
          id: n.id,
          label: n.label,
          type: n.type,
          sentiment: n.sentiment,
          sourceCount: n.sourceCount ?? 0,
        })),
        relations: base.edges.map((e) => ({
          source: e.source,
          target: e.target,
          relation: e.relation,
        })),
        changes: changes.map((c) => ({
          label: c.label,
          status: c.status,
          preCount: c.preCount,
          postCount: c.postCount,
        })),
        sampleResponses: samples,
      };
      const res = await wikiInsights({ classId: cid, payload });
      const saved = { ...res, inputHash: labelHash };
      await saveClassInsights(cid, wikiScope, saved);
      setInsights(saved);
      setInsGen("idle");
    } catch (e) {
      setInsGen("error");
      setInsMsg(
        e instanceof Error ? e.message : "생성 중 오류가 발생했습니다."
      );
    }
  }

  // 분석 직후(labelHash 정착) 인사이트 자동 생성 — 따로 누르지 않아도 함께 갱신
  useEffect(() => {
    if (
      pendingInsight &&
      base &&
      base.nodes.length > 0 &&
      labelHash &&
      !insFresh &&
      insGen !== "running"
    ) {
      setPendingInsight(false);
      genInsights();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInsight, base, labelHash, insFresh, insGen]);

  const students = useMemo(
    () =>
      Object.entries(names).sort((a, b) =>
        a[1].localeCompare(b[1], "ko")
      ),
    [names]
  );
  const rootProjects = projects.filter((p) => !p.parentProjectId);

  if (loading || !user || !cid || allowed === null) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
      </main>
    );
  }
  if (!allowed) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <GlassCard className="p-10 text-center">
          <p className="font-semibold">교사만 접근할 수 있습니다.</p>
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <button
          onClick={() => router.push(`/class/?id=${cid}`)}
          className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--md-sys-color-on-surface-variant)] transition hover:text-[var(--md-sys-color-on-surface)]"
        >
          <Icon name="arrow_back" size={18} />
          학급
        </button>

        <GlassCard strong className="animate-float-in p-7">
          <h1 className="text-2xl font-bold tracking-tight">위계별 지식 맵</h1>
          <p className="mt-1 text-sm text-black/55 dark:text-white/55">
            학급 전체 · 프로젝트 · 선택 차시 단위로 온톨로지를 통합합니다.
            (질문 리프 재사용 — 변경분만 LLM 분석)
          </p>

          {/* 범위 선택 */}
          <div className="mt-5 flex flex-wrap gap-2">
            {(
              [
                ["all", "학급 전체"],
                ["project", "프로젝트"],
                ["select", "차시 선택"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() =>
                  setScope(
                    m === "all"
                      ? { mode: "all" }
                      : m === "project"
                        ? {
                            mode: "project",
                            projectId: rootProjects[0]?.id ?? "",
                          }
                        : { mode: "select", lessonIds: [] }
                  )
                }
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  scope.mode === m
                    ? "bg-[var(--md-sys-color-primary)] text-white"
                    : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-primary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {scope.mode === "project" && (
            <select
              className="m3-field mt-3 !py-2 !text-sm"
              value={scope.projectId}
              onChange={(e) =>
                setScope({ mode: "project", projectId: e.target.value })
              }
            >
              {projects.length === 0 && <option value="">(프로젝트 없음)</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {scope.mode === "select" && (
            <div className="mt-3 flex max-h-48 flex-col gap-1 overflow-y-auto rounded-2xl bg-white/40 p-3 dark:bg-white/5">
              {lessons.length === 0 && (
                <p className="text-xs text-black/40">차시가 없습니다.</p>
              )}
              {lessons.map((l) => {
                const on = scope.lessonIds.includes(l.id);
                return (
                  <label
                    key={l.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setScope({
                          mode: "select",
                          lessonIds: on
                            ? scope.lessonIds.filter((x) => x !== l.id)
                            : [...scope.lessonIds, l.id],
                        })
                      }
                    />
                    <span className="truncate">{l.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-black/40">
                      {l.date}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {/* phase 토글 */}
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

        {/* 상태 바 */}
        <div
          className={`mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-xs ${
            staleEntries.length > 0
              ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]"
              : "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]"
          }`}
        >
          <span className="flex items-center gap-2">
            {staleEntries.length > 0 ? (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--md-sys-color-secondary)] text-[var(--md-sys-color-on-secondary)]">
                <Icon name="sync_problem" size={15} />
              </span>
            ) : (
              <Icon
                name="check_circle"
                size={16}
                className="text-[var(--md-sys-color-primary)]"
              />
            )}
            <span className={staleEntries.length > 0 ? "font-semibold" : ""}>
              {entries === null
                ? "리프 불러오는 중…"
                : staleEntries.length > 0
                  ? `새 응답이 들어왔어요 — 미분석 질문 ${staleEntries.length}개. 재분석할까요?`
                  : `차시 ${targetLessonIds.length}개 · 모두 최신`}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await generateAll();
                setPendingInsight(true);
              }}
              disabled={gen === "running"}
              className="rounded-full border border-[var(--md-sys-color-outline)] px-3 py-2 text-xs font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)] disabled:opacity-50"
              title="모든 질문을 강제로 다시 추출 (해시 무관) — 인사이트도 함께 생성"
            >
              전체 재분석
            </button>
            <GlassButton
              variant="accent"
              className="!px-4 !py-2 text-xs"
              onClick={async () => {
                await generateStale();
                setPendingInsight(true);
              }}
              disabled={gen === "running" || staleEntries.length === 0}
            >
              {gen === "running" ? (
                "분석 중… (최대 1분)"
              ) : (
                <>
                  <Icon name="network_intelligence" size={16} />
                  변경된 질문 분석 ({staleEntries.length})
                </>
              )}
            </GlassButton>
          </div>
          {gen === "error" && (
            <p className="w-full text-[var(--md-sys-color-error)]">{genMsg}</p>
          )}
        </div>

        <GlassCard className="mt-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-full bg-black/5 p-0.5 dark:bg-white/10">
              {(
                [
                  ["summary", "종합"],
                  ["graph", "지식 그래프"],
                  ["compare", "사전/사후 비교"],
                  ["groups", "모둠 비교"],
                  ["emotion", "감정"],
                  ["insight", "인사이트"],
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
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="m3-field !w-auto !py-1.5 !text-xs"
                value={studentUid}
                onChange={(e) => setStudentUid(e.target.value)}
                title="학생 필터 (LLM 호출 0)"
              >
                <option value="">전체 학생</option>
                {students.map(([uid, nm]) => (
                  <option key={uid} value={uid}>
                    {nm}
                  </option>
                ))}
              </select>
              {merged && merged.nodes.length > 0 && (
                <>
                  {normFresh ? (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2 py-0.5 text-xs font-medium text-[var(--md-sys-color-on-tertiary-container)]">
                      정리됨 <Icon name="check" size={12} />
                    </span>
                  ) : norm ? (
                    <span className="rounded-full bg-[var(--md-sys-color-secondary-container)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-sys-color-on-secondary-container)]">
                      변경됨
                    </span>
                  ) : null}
                  <GlassButton
                    variant="ghost"
                    className="!h-8 !px-3 text-xs"
                    onClick={normalize}
                    disabled={normGen === "running" || normFresh}
                    title="동의어·표기변형 통합 (라벨만 LLM, 저비용)"
                  >
                    {normGen === "running" ? "정리 중…" : "동의어 통합"}
                  </GlassButton>
                </>
              )}
            </div>
          </div>
          {normGen === "error" && (
            <p className="mt-2 text-xs text-[var(--md-sys-color-error)]">{normMsg}</p>
          )}

          {tab === "summary" ? (
            !base || base.nodes.length === 0 ? (
              <p className="py-10 text-center text-sm text-black/40">
                {entries === null
                  ? "불러오는 중…"
                  : "아직 분석된 데이터가 없습니다. 위 “변경된 질문 분석”을 실행하면 종합 요약이 만들어집니다."}
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-6">
                {/* 종합 인사이트 — 맨 위, 큰 글씨로 빠르게 결론 */}
                <div className="rounded-3xl bg-[var(--md-sys-color-primary-container)] p-6">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--md-sys-color-on-primary-container)]">
                      <Icon name="auto_stories" size={18} />
                      종합 인사이트
                    </p>
                    {insGen === "running" ? (
                      <span className="text-xs font-medium text-[var(--md-sys-color-on-primary-container)]/70">
                        분석과 함께 생성 중…
                      </span>
                    ) : (
                      !insFresh && (
                        <button
                          onClick={genInsights}
                          className="rounded-full bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--md-sys-color-on-primary)]"
                        >
                          {insights ? "새로고침" : "지금 생성"}
                        </button>
                      )
                    )}
                  </div>
                  {insGen === "error" && (
                    <p className="text-xs text-[var(--md-sys-color-error)]">
                      {insMsg}
                    </p>
                  )}
                  {insights ? (
                    <>
                      <p className="text-lg font-semibold leading-relaxed text-[var(--md-sys-color-on-primary-container)] sm:text-xl">
                        {insights.narrative}
                      </p>
                      {(insights.highlights?.length ?? 0) > 0 && (
                        <div className="mt-4">
                          <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-[var(--md-sys-color-on-primary-container)]/70">
                            <Icon name="person" size={13} />
                            개별 응답에서
                          </p>
                          <ul className="list-disc pl-5 text-sm text-[var(--md-sys-color-on-primary-container)]/90">
                            {insights.highlights!.map((h, i) => (
                              <li key={i}>{h}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        {[
                          ["다음 수업 질문 제안", insights.followUps],
                          ["관찰된 오개념·약점", insights.misconceptions],
                          ["보강이 필요한 개념", insights.gaps],
                        ].map(([title, arr]) =>
                          (arr as string[])?.length ? (
                            <div
                              key={title as string}
                              className="rounded-2xl bg-[color-mix(in_srgb,var(--md-sys-color-on-primary-container)_8%,transparent)] p-3"
                            >
                              <p className="mb-1 text-xs font-bold text-[var(--md-sys-color-on-primary-container)]">
                                {title as string}
                              </p>
                              <ul className="list-disc pl-4 text-xs text-[var(--md-sys-color-on-primary-container)]/90">
                                {(arr as string[]).map((x, i) => (
                                  <li key={i}>{x}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-[var(--md-sys-color-on-primary-container)]/80">
                      위 “변경된 질문 분석”을 실행하면 종합 결론이 여기에 함께
                      만들어집니다.
                    </p>
                  )}
                </div>

                {/* 한눈에 */}
                <div>
                  <p className="mb-2 text-sm font-semibold">한눈에</p>
                  <SentimentBar s={base.overallSentiment} />
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[...base.nodes]
                      .sort(
                        (a, b) =>
                          (b.sourceCount ?? b.sources?.length ?? 0) -
                          (a.sourceCount ?? a.sources?.length ?? 0)
                      )
                      .slice(0, 10)
                      .map((n) => (
                        <span
                          key={n.id}
                          className="inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-2.5 py-1 text-xs"
                        >
                          {n.label}
                          <span className="font-bold text-[var(--md-sys-color-primary)]">
                            {n.sourceCount ?? n.sources?.length ?? 0}
                          </span>
                        </span>
                      ))}
                  </div>
                </div>

                {/* 전 → 후 변화 표 */}
                {changes.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold">전 → 후 변화</p>
                    <PrePostTable changes={changes} />
                  </div>
                )}
              </div>
            )
          ) : tab === "compare" ? (
            <ComparePanel
              pre={mergedPre}
              post={mergedPost}
              names={names}
              loading={entries === null}
            />
          ) : tab === "groups" ? (
            <GroupComparePanel
              base={base}
              groups={groups}
              names={names}
              loading={entries === null}
            />
          ) : !display || display.nodes.length === 0 ? (
            <p className="py-10 text-center text-sm text-black/40">
              {entries === null
                ? "불러오는 중…"
                : "표시할 온톨로지가 없습니다. 범위를 바꾸거나 “변경된 질문 분석”을 실행하세요."}
            </p>
          ) : tab === "graph" ? (
            <div className="mt-4">
              {display.summary && (
                <p className="text-sm leading-relaxed text-black/70 dark:text-white/70">
                  {display.summary}
                </p>
              )}
              <div className="mt-4">
                <SentimentBar s={display.overallSentiment} />
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl bg-white/30 p-2 dark:bg-white/5">
                <ExpandableGraph
                  data={display}
                  studentNames={names}
                  height={600}
                  title={
                    scope.mode === "project"
                      ? `${
                          projects.find((p) => p.id === scope.projectId)?.name ??
                          "프로젝트"
                        } 지식맵`
                      : scope.mode === "select"
                        ? "선택 차시 지식맵"
                        : "전체 위계 지식맵"
                  }
                />
              </div>
            </div>
          ) : tab === "emotion" ? (
            <div className="mt-4">
              <EmotionPanel data={display} names={names} />
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-5">
              {/* 전 → 후 변화 (결정적, LLM 0) */}
              <div>
                <p className="mb-2 text-sm font-semibold">전 → 후 변화</p>
                {changes.length === 0 ? (
                  <p className="text-xs text-black/40">
                    수업 전·후 질문이 모두 분석되면 개념 변화가 표시됩니다.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {changes.slice(0, 40).map((c) => {
                      const m = {
                        emerged: [
                          "새로 등장",
                          "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]",
                        ],
                        shifted: [
                          "정서 변화",
                          "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]",
                        ],
                        persisted: [
                          "지속",
                          "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]",
                        ],
                        resolved: [
                          "사라짐",
                          "bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]",
                        ],
                      }[c.status];
                      return (
                        <span
                          key={c.id}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${m[1]}`}
                          title={`${m[0]} · 전 ${c.preCount} → 후 ${c.postCount}`}
                        >
                          {c.label}
                          <span className="opacity-60">· {m[0]}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* LLM 종합·형성평가 (라벨/JSON만 입력, 저비용) */}
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  종합·수업 설계 제안
                  {insFresh && (
                    <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2 py-0.5 text-xs font-medium text-[var(--md-sys-color-on-tertiary-container)]">
                      최신 <Icon name="check" size={12} />
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
                <p className="text-xs text-[var(--md-sys-color-error)]">{insMsg}</p>
              )}
              {insights ? (
                <div className="flex flex-col gap-4">
                  <p className="text-sm leading-relaxed text-black/75 dark:text-white/75">
                    {insights.narrative}
                  </p>
                  {[
                    ["다음 수업 질문 제안", insights.followUps, "📝"],
                    ["관찰된 오개념·약점", insights.misconceptions, "⚠️"],
                    ["보강이 필요한 개념", insights.gaps, "🔍"],
                  ].map(([title, arr]) =>
                    (arr as string[]).length ? (
                      <div key={title as string}>
                        <p className="mb-1 text-xs font-semibold text-black/55 dark:text-white/55">
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
                  {insights.concepts.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold text-black/55 dark:text-white/55">
                        개념 해설
                      </p>
                      <ul className="flex flex-col gap-1.5 text-sm">
                        {insights.concepts.map((c) => (
                          <li
                            key={c.id}
                            className="rounded-xl bg-white/50 px-3 py-2 dark:bg-white/5"
                          >
                            <span className="font-semibold">{c.id}</span> —{" "}
                            {c.insight}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-black/40">
                  “인사이트 생성”으로 종합 서사·오개념·후속 질문 제안을
                  받아보세요. (라벨/그래프만 전송 — 저비용)
                </p>
              )}
            </div>
          )}
        </GlassCard>
      </main>
    </>
  );
}

export default function ClassMapPage() {
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
      <ClassMap />
    </Suspense>
  );
}

/* ---------- 사전/사후 지식맵 겹쳐보기 ---------- */
const COMPARE_COLOR = PREPOST_COLOR;
function ComparePanel({
  pre,
  post,
  names,
  loading,
}: {
  pre: Ontology;
  post: Ontology;
  names: Record<string, string>;
  loading: boolean;
}) {
  const [mode, setMode] = useState<"all" | "pre" | "post" | "both" | "diff">(
    "all"
  );
  const [view, setView] = useState<"graph" | "table">("graph");
  const { overlay, statusByKey, counts } = useMemo(
    () => buildPrePostOverlay(pre, post),
    [pre, post]
  );
  const changes = useMemo(() => diffPrePost(pre, post), [pre, post]);

  // 강조 모드에 맞는 노드만 남긴 그래프
  const display = useMemo(
    () => filterOverlayByMode(overlay, statusByKey, mode),
    [overlay, statusByKey, mode]
  );

  if (loading)
    return (
      <p className="py-10 text-center text-sm text-black/40">불러오는 중…</p>
    );
  if (overlay.nodes.length === 0)
    return (
      <p className="py-10 text-center text-sm text-black/40">
        비교할 데이터가 없습니다. 수업 전·후 질문을 분석한 뒤 다시 확인하세요.
      </p>
    );

  const filters: [typeof mode, string, number][] = [
    ["all", "전체", counts.pre + counts.both + counts.post],
    ["pre", "사전만", counts.pre],
    ["both", "공통", counts.both],
    ["post", "사후 신규", counts.post],
    ["diff", "차이(사전·사후만)", counts.pre + counts.post],
  ];

  return (
    <div className="mt-4">
      {/* 그래프 / 표 보기 토글 */}
      <div className="mb-3 inline-flex rounded-full bg-black/5 p-0.5 dark:bg-white/10">
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
      {/* 강조 필터 */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {filters.map(([m, label, n]) => {
          const active = mode === m;
          const dot =
            m === "pre"
              ? COMPARE_COLOR.pre
              : m === "post"
                ? COMPARE_COLOR.post
                : m === "both"
                  ? COMPARE_COLOR.both
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
              <span className={active ? "opacity-80" : "text-black/40"}>
                {n}
              </span>
            </button>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-2xl bg-white/30 p-2 dark:bg-white/5">
        {display.nodes.length === 0 ? (
          <p className="py-16 text-center text-sm text-black/40">
            해당하는 개념이 없습니다.
          </p>
        ) : (
          <GraphView
            data={display}
            studentNames={names}
            height={600}
            title={`사전/사후 비교 · ${
              filters.find(([m]) => m === mode)?.[1] ?? "전체"
            }`}
            nodeColor={(node) => COMPARE_COLOR[statusByKey[node.id] ?? "both"]}
          />
        )}
      </div>
      <p className="mt-2 text-xs text-black/45">
        주황=수업 전만 있고 사후엔 사라진 개념, 자홍=수업 전·후 모두
        등장(지속), 초록=수업 후 새로 등장. 위 버튼으로 사전/사후/공통/차이만
        강조해 볼 수 있어요.
      </p>
        </>
      )}
    </div>
  );
}

/* ---------- 모둠 간 지식맵 비교 ---------- */
const GROUP_PALETTE = CATEGORY_PALETTE;
const GROUP_COMMON = GROUP_COMMON_COLOR;

function GroupComparePanel({
  base,
  groups,
  names,
  loading,
}: {
  base: Ontology | null;
  groups: Group[];
  names: Record<string, string>;
  loading: boolean;
}) {
  const { overlay, colorByKey, perGroup, commonCount } = useMemo(() => {
    const empty = {
      overlay: null as Ontology | null,
      colorByKey: {} as Record<string, string>,
      perGroup: [] as number[],
      commonCount: 0,
    };
    if (!base || groups.length === 0) return empty;
    const keyOf = (n: { id: string; label: string }) =>
      (n.label || n.id).trim().toLowerCase() || n.id;
    const byKey = new Map<
      string,
      { node: Ontology["nodes"][number]; inGroups: Set<number> }
    >();
    // base 의 id → key 매핑 (엣지 리맵용)
    const idToKey = new Map<string, string>();
    base.nodes.forEach((n) => idToKey.set(n.id, keyOf(n)));

    groups.forEach((g, idx) => {
      const fo = filterOntologyByGroup(base, g.memberUids);
      fo.nodes.forEach((n) => {
        const k = keyOf(n);
        const e = byKey.get(k);
        if (e) e.inGroups.add(idx);
        else byKey.set(k, { node: { ...n, id: k }, inGroups: new Set([idx]) });
      });
    });

    const edgeMap = new Map<string, Ontology["edges"][number]>();
    base.edges.forEach((ed) => {
      const s = idToKey.get(ed.source) ?? ed.source;
      const t = idToKey.get(ed.target) ?? ed.target;
      if (!byKey.has(s) || !byKey.has(t)) return;
      const id = `${s}__${t}`;
      if (!edgeMap.has(id)) edgeMap.set(id, { ...ed, source: s, target: t });
    });

    const colorByKey: Record<string, string> = {};
    const perGroup = groups.map(() => 0);
    let commonCount = 0;
    byKey.forEach((e, k) => {
      if (e.inGroups.size > 1) {
        colorByKey[k] = GROUP_COMMON;
        commonCount += 1;
      } else {
        const idx = [...e.inGroups][0];
        colorByKey[k] = groups[idx].color || GROUP_PALETTE[idx % GROUP_PALETTE.length];
        perGroup[idx] += 1;
      }
    });

    return {
      overlay: {
        nodes: [...byKey.values()].map((e) => e.node),
        edges: [...edgeMap.values()],
        overallSentiment: base.overallSentiment,
        summary: "",
      } as Ontology,
      colorByKey,
      perGroup,
      commonCount,
    };
  }, [base, groups]);

  if (loading)
    return (
      <p className="py-10 text-center text-sm text-black/40">불러오는 중…</p>
    );
  if (groups.length === 0)
    return (
      <p className="py-10 text-center text-sm text-black/40">
        모둠이 없습니다. 학급 화면에서 모둠을 먼저 만든 뒤 다시 확인하세요.
      </p>
    );
  if (!overlay || overlay.nodes.length === 0)
    return (
      <p className="py-10 text-center text-sm text-black/40">
        비교할 데이터가 없습니다. 활동을 분석하면 모둠별 개념이 표시됩니다.
      </p>
    );

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap gap-3">
        {groups.map((g, idx) => (
          <span key={g.id} className="inline-flex items-center gap-1.5 text-sm">
            <span
              className="h-3 w-3 rounded-full"
              style={{
                background:
                  g.color || GROUP_PALETTE[idx % GROUP_PALETTE.length],
              }}
            />
            <span className="font-medium">{g.name}</span>
            <span className="font-bold text-black/55">{perGroup[idx]}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-sm">
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: GROUP_COMMON }}
          />
          <span className="font-medium">공통</span>
          <span className="font-bold text-black/55">{commonCount}</span>
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white/30 p-2 dark:bg-white/5">
        <GraphView
          data={overlay}
          studentNames={names}
          height={600}
          title="모둠 비교"
          nodeColor={(node) => colorByKey[node.id]}
        />
      </div>
      <p className="mt-2 text-xs text-black/45">
        각 모둠 구성원이 언급한 개념을 모둠 색으로 표시하고, 여러 모둠이 공통으로
        다룬 개념은 회색(공통)으로 표시합니다.
      </p>
    </div>
  );
}
