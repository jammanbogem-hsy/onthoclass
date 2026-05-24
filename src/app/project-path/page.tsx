"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import { RichEditor } from "@/components/RichEditor";
import { getMyRole, listMembers, type Member } from "@/lib/classes";
import { listProjects } from "@/lib/projects";
import {
  listLessons,
  listQuestions,
  listQuestionSubmissions,
  type Question,
  type Submission,
} from "@/lib/lessons";

const KIND_LABEL: Record<string, string> = {
  question: "질문",
  quiz: "문항",
  reflection: "성찰",
};
// 응답을 모으는 활동만 (링크/보드 제외)
const RESPONSE_KINDS = ["question", "quiz", "reflection"];

type Activity = {
  q: Question;
  subs: Record<string, Submission>;
};
type LessonBlock = {
  id: string;
  title: string;
  date: string;
  activities: Activity[];
};

function ProjectPathInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const cid = params.get("class");
  const pid = params.get("project");

  const [role, setRole] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [students, setStudents] = useState<Member[]>([]);
  const [blocks, setBlocks] = useState<LessonBlock[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !cid || !pid) return;
    getMyRole(cid, user.uid).then(setRole);
    listProjects(cid)
      .then((ps) => setProjectName(ps.find((p) => p.id === pid)?.name ?? "프로젝트"))
      .catch(() => {});
    listMembers(cid)
      .then((ms) => setStudents(ms.filter((m) => m.role === "student")))
      .catch(() => {});

    (async () => {
      const lessons = (await listLessons(cid).catch(() => []))
        .filter((l) => l.projectId === pid)
        .sort((a, b) => a.order - b.order || (a.date > b.date ? 1 : -1));
      const result: LessonBlock[] = [];
      for (const l of lessons) {
        const qs = (await listQuestions(cid, l.id).catch(() => []))
          .filter((q) => RESPONSE_KINDS.includes(q.kind))
          .sort(
            (a, b) =>
              (a.phase === b.phase ? 0 : a.phase === "pre" ? -1 : 1) ||
              a.order - b.order
          );
        const activities: Activity[] = [];
        for (const q of qs) {
          const subsArr = await listQuestionSubmissions(cid, l.id, q.id).catch(
            () => []
          );
          const subs: Record<string, Submission> = {};
          subsArr.forEach((s) => (subs[s.uid] = s));
          activities.push({ q, subs });
        }
        result.push({
          id: l.id,
          title: l.title,
          date: l.date,
          activities,
        });
      }
      setBlocks(result);
    })();
  }, [user, cid, pid]);

  // 학생별 응답 수
  const respCount = useMemo(() => {
    const m: Record<string, number> = {};
    (blocks ?? []).forEach((b) =>
      b.activities.forEach((a) => {
        Object.keys(a.subs).forEach((uid) => {
          const s = a.subs[uid];
          const has =
            (s.content ?? "").trim() ||
            (s.understanding ?? 0) > 0 ||
            (s.application ?? "").trim();
          if (has) m[uid] = (m[uid] ?? 0) + 1;
        });
      })
    );
    return m;
  }, [blocks]);

  useEffect(() => {
    if (!sel && students.length > 0) setSel(students[0].uid);
  }, [students, sel]);

  if (loading || !user || !cid || !pid) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
      </main>
    );
  }
  if (role && role !== "teacher") {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <GlassCard className="p-10 text-center">
          <p className="font-semibold">교사만 접근할 수 있습니다.</p>
        </GlassCard>
      </main>
    );
  }

  const totalActs = (blocks ?? []).reduce(
    (n, b) => n + b.activities.length,
    0
  );

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <button
          onClick={() => router.push(`/class/?id=${cid}`)}
          className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--md-sys-color-on-surface-variant)] transition hover:text-[var(--md-sys-color-on-surface)]"
        >
          <Icon name="arrow_back" size={18} />
          학급
        </button>

        <div className="mb-5">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Icon name="timeline" size={24} className="text-[var(--md-sys-color-primary)]" />
            {projectName} · PATH
          </h1>
          <p className="mt-1 text-sm text-black/55">
            과정중심평가 · 학생별 응답 누적 스트림 ({(blocks ?? []).length}개 차시
            · 활동 {totalActs}개)
          </p>
        </div>

        {blocks === null ? (
          <p className="py-16 text-center text-sm text-black/40">
            응답을 모으는 중…
          </p>
        ) : blocks.length === 0 ? (
          <GlassCard className="p-10 text-center text-sm text-black/45">
            이 프로젝트에 속한 차시가 없습니다.
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
            {/* 학생 목록 */}
            <GlassCard className="h-fit p-2">
              <div className="flex flex-col gap-1">
                {students.map((s) => {
                  const on = sel === s.uid;
                  return (
                    <button
                      key={s.uid}
                      onClick={() => setSel(s.uid)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                        on
                          ? "bg-[var(--md-sys-color-primary)] text-white"
                          : "hover:bg-black/5"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {s.displayName}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-1.5 text-xs font-bold ${
                          on
                            ? "bg-white/25"
                            : "bg-[var(--md-sys-color-surface-container-high)] text-black/55"
                        }`}
                      >
                        {respCount[s.uid] ?? 0}/{totalActs}
                      </span>
                    </button>
                  );
                })}
              </div>
            </GlassCard>

            {/* 선택 학생의 스트림 */}
            <div className="flex flex-col gap-4">
              {sel &&
                blocks.map((b, bi) => (
                  <div key={b.id} className="relative">
                    {/* 차시 헤더 */}
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-xs font-extrabold text-white">
                        {bi + 1}
                      </span>
                      <h2 className="text-base font-bold">{b.title}</h2>
                      <span className="text-xs text-black/40">{b.date}</span>
                    </div>
                    <div className="ml-3 flex flex-col gap-2 border-l-2 border-[var(--md-sys-color-outline-variant)] pl-5">
                      {b.activities.length === 0 ? (
                        <p className="py-1 text-xs text-black/35">
                          응답 활동 없음
                        </p>
                      ) : (
                        b.activities.map((a) => (
                          <StreamEntry
                            key={a.q.id}
                            activity={a}
                            uid={sel}
                          />
                        ))
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function StreamEntry({ activity, uid }: { activity: Activity; uid: string }) {
  const { q, subs } = activity;
  const s = subs[uid];
  const phase = q.phase === "pre" ? "수업 전" : "수업 후";
  const aTitle = q.title.trim() || KIND_LABEL[q.kind] || "활동";
  const answered =
    !!s &&
    ((s.content ?? "").trim() ||
      (s.understanding ?? 0) > 0 ||
      (s.application ?? "").trim());

  return (
    <div className="relative rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-3">
      <span className="absolute -left-[27px] top-4 h-2.5 w-2.5 rounded-full bg-[var(--md-sys-color-primary)]" />
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold">{aTitle}</span>
        <span className="rounded-full bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 text-xs font-medium text-black/55">
          {KIND_LABEL[q.kind]}
        </span>
        <span className="rounded-full bg-[var(--md-sys-color-secondary-container)] px-2 py-0.5 text-xs font-medium text-[var(--md-sys-color-on-secondary-container)]">
          {phase}
        </span>
      </div>

      {!answered ? (
        <p className="text-sm text-black/35">미응답</p>
      ) : q.kind === "reflection" ? (
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <Icon name="star" size={15} fill style={{ color: "#f5a623" }} />
              {s.understanding}
            </span>
            <span className="inline-flex items-center gap-1">
              <Icon name="favorite" size={15} fill style={{ color: "#ef4444" }} />
              {s.interest}
            </span>
          </div>
          {s.content && (
            <p className="whitespace-pre-wrap">{s.content}</p>
          )}
          {s.application && (
            <p className="whitespace-pre-wrap rounded-lg bg-[var(--md-sys-color-surface-container)] p-2 text-[13px]">
              <span className="text-xs font-semibold text-black/45">
                활용:{" "}
              </span>
              {s.application}
            </p>
          )}
        </div>
      ) : q.kind === "question" ? (
        <div className="text-sm">
          <RichEditor value={s.content} readOnly />
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm">{s.content}</p>
      )}
    </div>
  );
}

export default function ProjectPathPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
        </main>
      }
    >
      <ProjectPathInner />
    </Suspense>
  );
}
