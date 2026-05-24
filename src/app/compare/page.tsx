"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import { GraphView } from "@/components/GraphView";
import { listSourceClasses, type SourceClass } from "@/lib/teams";
import {
  getOntology,
  listLessons,
  listQuestions,
  type Ontology,
  type Phase,
} from "@/lib/lessons";
import { mergeOntologies } from "@/lib/ontology";
import { CATEGORY_PALETTE, GROUP_COMMON_COLOR } from "@/lib/palette";
import { ClassDiffTable } from "@/components/CompareTable";

const PALETTE = CATEGORY_PALETTE;
const COMMON = GROUP_COMMON_COLOR;

// 한 학급의 한 차시(같은 수업)
type Member = {
  cid: string;
  className: string;
  teacher: string;
  lid: string;
  lessonTitle: string;
};
// 같은 수업(복제 계보) 묶음
type LessonGroup = {
  key: string; // originLessonId(또는 루트 lid)
  title: string;
  members: Member[];
};

async function loadLessonOntology(
  cid: string,
  lid: string,
  phase: Phase
): Promise<Ontology> {
  const qs = await listQuestions(cid, lid).catch(() => []);
  const leaves: Ontology[] = [];
  for (const q of qs) {
    if (q.phase !== phase) continue;
    if (q.kind !== "question" && q.kind !== "canvas") continue;
    const leaf = await getOntology(cid, lid, `q:${q.id}`).catch(() => null);
    if (leaf) leaves.push(leaf);
  }
  return mergeOntologies(leaves);
}

function CompareInner() {
  const { user, loading, profile, profileLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const wantGroup = params.get("group") || "";

  const [groups, setGroups] = useState<LessonGroup[] | null>(null);
  const [selKey, setSelKey] = useState("");
  const [phase, setPhase] = useState<Phase>("pre");
  const [view, setView] = useState<"graph" | "table">("graph");
  const [ontos, setOntos] = useState<Record<string, Ontology>>({});

  const isTeacher = profile?.role === "teacher";

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  // 내 학급·팀원 학급의 차시를 모아 '같은 수업(복제 계보)' 묶음 구성
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const sources = await listSourceClasses(user.uid).catch(
        () => [] as SourceClass[]
      );
      const map = new Map<string, LessonGroup>();
      await Promise.all(
        sources.map(async (c) => {
          const lessons = await listLessons(c.cid).catch(() => []);
          for (const l of lessons) {
            const gk = l.originLessonId || l.id; // 계보 루트
            const isRoot = !l.originLessonId; // 루트면 제목 우선 사용
            const g = map.get(gk) ?? { key: gk, title: l.title, members: [] };
            if (isRoot || !g.title) g.title = l.title || g.title;
            g.members.push({
              cid: c.cid,
              className: c.name,
              teacher: c.teacher,
              lid: l.id,
              lessonTitle: l.title || "(제목 없음)",
            });
            map.set(gk, g);
          }
        })
      );
      // 2개 이상 학급에 걸친 묶음만 비교 대상
      const comparable = [...map.values()].filter(
        (g) => new Set(g.members.map((m) => m.cid)).size >= 2
      );
      if (!alive) return;
      setGroups(comparable);
      setSelKey((cur) => {
        // URL ?group= 으로 들어온 수업을 우선 선택(학급 안에서 진입한 경우)
        if (wantGroup && comparable.some((g) => g.key === wantGroup))
          return wantGroup;
        if (cur && comparable.some((g) => g.key === cur)) return cur;
        return comparable[0]?.key ?? "";
      });
    })();
    return () => {
      alive = false;
    };
  }, [user, wantGroup]);

  const selGroup = useMemo(
    () => groups?.find((g) => g.key === selKey) ?? null,
    [groups, selKey]
  );

  // 선택 묶음의 각 학급 차시 ontology 로드 (학급당 1개; 같은 학급 중복 차시는 첫 번째)
  const items = useMemo<Member[]>(() => {
    if (!selGroup) return [];
    const seen = new Set<string>();
    return selGroup.members.filter((m) =>
      seen.has(m.cid) ? false : (seen.add(m.cid), true)
    );
  }, [selGroup]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const next: Record<string, Ontology> = {};
      for (const m of items) {
        next[`${m.cid}__${m.lid}`] = await loadLessonOntology(
          m.cid,
          m.lid,
          phase
        );
      }
      if (alive) setOntos(next);
    })();
    return () => {
      alive = false;
    };
  }, [items, phase]);

  // 오버레이 + 학급별 색
  const { overlay, colorByKey, perItemCount, commonCount } = useMemo(() => {
    const keyOf = (n: { id: string; label: string }) =>
      (n.label || n.id).trim().toLowerCase() || n.id;
    const byKey = new Map<
      string,
      { node: Ontology["nodes"][number]; inItems: Set<number> }
    >();
    const edgeMap = new Map<string, Ontology["edges"][number]>();
    items.forEach((m, idx) => {
      const ont = ontos[`${m.cid}__${m.lid}`];
      if (!ont) return;
      const idToKey = new Map<string, string>();
      ont.nodes.forEach((n) => {
        const k = keyOf(n);
        idToKey.set(n.id, k);
        const e = byKey.get(k);
        if (e) e.inItems.add(idx);
        else byKey.set(k, { node: { ...n, id: k }, inItems: new Set([idx]) });
      });
      ont.edges.forEach((ed) => {
        const s = idToKey.get(ed.source) ?? ed.source;
        const t = idToKey.get(ed.target) ?? ed.target;
        const id = `${s}__${t}`;
        if (!edgeMap.has(id)) edgeMap.set(id, { ...ed, source: s, target: t });
      });
    });
    const colorByKey: Record<string, string> = {};
    const perItemCount = items.map(() => 0);
    let commonCount = 0;
    byKey.forEach((e, k) => {
      if (e.inItems.size > 1) {
        colorByKey[k] = COMMON;
        commonCount += 1;
      } else {
        const idx = [...e.inItems][0];
        colorByKey[k] = PALETTE[idx % PALETTE.length];
        perItemCount[idx] += 1;
      }
    });
    return {
      overlay: {
        nodes: [...byKey.values()].map((e) => e.node),
        edges: [...edgeMap.values()],
        overallSentiment: { positive: 0, neutral: 1, negative: 0 },
        summary: "",
      } as Ontology,
      colorByKey,
      perItemCount,
      commonCount,
    };
  }, [items, ontos]);

  // 학급별 차이 표 행: 개념(라벨키) × 학급별 언급수(sourceCount)
  const classRows = useMemo(() => {
    const keyOf = (n: { id: string; label: string }) =>
      (n.label || n.id).trim().toLowerCase() || n.id;
    const map = new Map<string, { label: string; counts: number[] }>();
    items.forEach((m, idx) => {
      const ont = ontos[`${m.cid}__${m.lid}`];
      if (!ont) return;
      ont.nodes.forEach((n) => {
        const k = keyOf(n);
        const e =
          map.get(k) ??
          { label: n.label || k, counts: items.map(() => 0) };
        e.counts[idx] = n.sourceCount ?? n.sources?.length ?? 1;
        map.set(k, e);
      });
    });
    return [...map.values()].map((e) => ({
      label: e.label,
      counts: e.counts,
      common: e.counts.filter((c) => c > 0).length >= 2,
    }));
  }, [items, ontos]);

  if (loading || profileLoading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
      </main>
    );
  }
  if (!isTeacher) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <GlassCard className="p-10 text-center">
          <p className="font-semibold">교사만 사용할 수 있습니다.</p>
        </GlassCard>
      </main>
    );
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--md-sys-color-on-surface-variant)] transition hover:text-[var(--md-sys-color-on-surface)]"
        >
          <Icon name="arrow_back" size={18} />
          대시보드
        </button>

        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Icon name="compare" size={26} className="text-[var(--md-sys-color-primary)]" />
          학급 간 지식맵 비교
        </h1>
        <p className="mt-1 text-sm text-black/55">
          같은 수업(차시를 다른 학급으로 복제한 묶음)을 학급별 색으로 겹쳐
          비교합니다. 비교하려면 차시 화면의 “다른 학급으로 복제”로 같은 수업을
          여러 학급에 만들어 두세요.
        </p>

        {/* 컨트롤 */}
        <GlassCard className="mt-5 flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-black/55">
              같은 수업 (복제 묶음)
            </span>
            <select
              value={selKey}
              onChange={(e) => setSelKey(e.target.value)}
              className="m3-field !w-auto !py-2 !text-sm"
              disabled={!groups || groups.length === 0}
            >
              {groups === null ? (
                <option value="">불러오는 중…</option>
              ) : groups.length === 0 ? (
                <option value="">비교 가능한 수업 없음</option>
              ) : (
                groups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.title || "(제목 없음)"} ·{" "}
                    {new Set(g.members.map((m) => m.cid)).size}개 학급
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="ml-auto flex rounded-full bg-black/5 p-0.5 dark:bg-white/10">
            {(["pre", "post"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  phase === p
                    ? "bg-white/80 text-black/80 shadow-sm dark:bg-white/20"
                    : "text-black/45"
                }`}
              >
                {p === "pre" ? "수업 전" : "수업 후"}
              </button>
            ))}
          </div>
        </GlassCard>

        {/* 범례(학급별) */}
        {items.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {items.map((m, idx) => (
              <span
                key={m.cid}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-3 py-1.5 text-xs"
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: PALETTE[idx % PALETTE.length] }}
                />
                <span className="font-semibold">{m.className}</span>
                <span className="text-black/45">· {m.teacher}</span>
                <span className="font-bold text-black/55">
                  {perItemCount[idx] ?? 0}
                </span>
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-3 py-1.5 text-xs">
              <span className="h-3 w-3 rounded-full" style={{ background: COMMON }} />
              <span className="font-semibold">공통</span>
              <span className="font-bold text-black/55">{commonCount}</span>
            </span>
          </div>
        )}

        {/* 그래프 / 표 토글 */}
        {items.length >= 2 && overlay.nodes.length > 0 && (
          <div className="mt-4 inline-flex rounded-full bg-black/5 p-0.5 dark:bg-white/10">
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
        )}

        {/* 그래프 / 표 */}
        <GlassCard className="mt-2 p-2">
          {groups && groups.length === 0 ? (
            <p className="py-16 text-center text-sm text-black/40">
              비교 가능한 수업이 없습니다. 차시 화면의 “다른 학급으로 복제”로
              같은 수업을 다른 학급에 만들면 여기서 학급별로 겹쳐 볼 수 있어요.
            </p>
          ) : items.length < 2 ? (
            <p className="py-16 text-center text-sm text-black/40">
              이 수업을 가진 학급이 2개 이상이어야 비교됩니다.
            </p>
          ) : overlay.nodes.length === 0 ? (
            <p className="py-16 text-center text-sm text-black/40">
              표시할 지식맵이 없습니다. 각 학급에서 이 차시를 먼저 “분석”했는지
              확인하세요.
            </p>
          ) : view === "table" ? (
            <div className="p-2">
              <ClassDiffTable
                classes={items.map((m, idx) => ({
                  name: m.className,
                  color: PALETTE[idx % PALETTE.length],
                }))}
                rows={classRows}
              />
            </div>
          ) : (
            <GraphView
              data={overlay}
              height={600}
              title="학급 비교"
              nodeColor={(n) => colorByKey[n.id]}
            />
          )}
        </GlassCard>
      </main>
    </>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <div className="animate-pulse text-sm text-black/40">불러오는 중…</div>
        </main>
      }
    >
      <CompareInner />
    </Suspense>
  );
}
