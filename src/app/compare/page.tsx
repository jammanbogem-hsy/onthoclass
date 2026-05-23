"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import { GraphView } from "@/components/GraphView";
import { listSourceClasses, type SourceClass } from "@/lib/teams";
import { listGroups, type Group } from "@/lib/groups";
import {
  getOntology,
  listLessons,
  listQuestions,
  type Lesson,
  type Ontology,
  type Phase,
} from "@/lib/lessons";
import { filterOntologyByGroup, mergeOntologies } from "@/lib/ontology";

const PALETTE = [
  "#4f7cff",
  "#23b27a",
  "#f5a623",
  "#a66bff",
  "#ff6f91",
  "#0ea5e9",
  "#14b8a6",
];
const COMMON = "#475569";

type Item = {
  key: string; // cid__lid__(group|all)
  cid: string;
  lid: string;
  className: string;
  lessonTitle: string;
  teacher: string;
  groupName?: string; // 모둠 한정이면 모둠 이름
  memberUids?: string[]; // 모둠 한정이면 구성원 uid
};

async function loadLessonOntology(
  cid: string,
  lid: string,
  phase: Phase,
  memberUids?: string[]
): Promise<Ontology> {
  const qs = await listQuestions(cid, lid).catch(() => []);
  const leaves: Ontology[] = [];
  for (const q of qs) {
    if (q.phase !== phase) continue;
    if (q.kind !== "question" && q.kind !== "canvas") continue;
    const leaf = await getOntology(cid, lid, `q:${q.id}`).catch(() => null);
    if (leaf) leaves.push(leaf);
  }
  const merged = mergeOntologies(leaves);
  // 모둠 한정이면 해당 구성원이 기여한 부분만 추출
  return memberUids && memberUids.length
    ? filterOntologyByGroup(merged, memberUids)
    : merged;
}

function CompareInner() {
  const { user, loading, profile, profileLoading } = useAuth();
  const router = useRouter();

  const [sources, setSources] = useState<SourceClass[] | null>(null);
  const [phase, setPhase] = useState<Phase>("pre");
  const [items, setItems] = useState<Item[]>([]);
  const [ontos, setOntos] = useState<Record<string, Ontology>>({});

  // 추가 피커
  const [pickCid, setPickCid] = useState("");
  const [pickLessons, setPickLessons] = useState<Lesson[] | null>(null);
  const [pickGroups, setPickGroups] = useState<Group[]>([]);
  const [pickGroup, setPickGroup] = useState(""); // "" = 전체

  const isTeacher = profile?.role === "teacher";

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    listSourceClasses(user.uid).then(setSources).catch(() => setSources([]));
  }, [user]);

  // 선택 학급의 차시·모둠 로드
  useEffect(() => {
    setPickGroup("");
    if (!pickCid) {
      setPickLessons(null);
      setPickGroups([]);
      return;
    }
    listLessons(pickCid)
      .then((ls) => setPickLessons(ls.sort((a, b) => a.order - b.order)))
      .catch(() => setPickLessons([]));
    listGroups(pickCid).then(setPickGroups).catch(() => setPickGroups([]));
  }, [pickCid]);

  // 비교 항목 / phase 변경 → ontology 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      const next: Record<string, Ontology> = {};
      for (const it of items) {
        next[it.key] = await loadLessonOntology(
          it.cid,
          it.lid,
          phase,
          it.memberUids
        );
      }
      if (alive) setOntos(next);
    })();
    return () => {
      alive = false;
    };
  }, [items, phase]);

  function addItem(l: Lesson) {
    const c = sources?.find((s) => s.cid === pickCid);
    if (!c) return;
    const g = pickGroup ? pickGroups.find((x) => x.id === pickGroup) : null;
    const key = `${c.cid}__${l.id}__${g?.id ?? "all"}`;
    if (items.some((it) => it.key === key)) return;
    setItems((prev) => [
      ...prev,
      {
        key,
        cid: c.cid,
        lid: l.id,
        className: c.name,
        lessonTitle: l.title || "(제목 없음)",
        teacher: c.teacher,
        groupName: g?.name,
        memberUids: g?.memberUids,
      },
    ]);
  }

  // 오버레이 + 색
  const { overlay, colorByKey, perItemCount, commonCount } = useMemo(() => {
    const keyOf = (n: { id: string; label: string }) =>
      (n.label || n.id).trim().toLowerCase() || n.id;
    const byKey = new Map<
      string,
      { node: Ontology["nodes"][number]; inItems: Set<number> }
    >();
    const edgeMap = new Map<string, Ontology["edges"][number]>();
    items.forEach((it, idx) => {
      const ont = ontos[it.key];
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
          내 학급·팀원 학급의 같은 수업 지식맵을 학급별 색으로 겹쳐 비교합니다.
        </p>

        {/* 컨트롤 */}
        <GlassCard className="mt-5 flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-black/55">학급</span>
            <select
              value={pickCid}
              onChange={(e) => setPickCid(e.target.value)}
              className="m3-field !w-auto !py-2 !text-sm"
            >
              <option value="">학급 선택…</option>
              {(sources ?? []).map((c) => (
                <option key={c.cid} value={c.cid}>
                  {c.name} · {c.teacher}
                </option>
              ))}
            </select>
          </div>
          {pickCid && pickGroups.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-black/55">모둠</span>
              <select
                value={pickGroup}
                onChange={(e) => setPickGroup(e.target.value)}
                className="m3-field !w-auto !py-2 !text-sm"
              >
                <option value="">전체 (모둠 무관)</option>
                {pickGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {pickCid && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-black/55">차시</span>
              <select
                value=""
                onChange={(e) => {
                  const l = pickLessons?.find((x) => x.id === e.target.value);
                  if (l) addItem(l);
                }}
                className="m3-field !w-auto !py-2 !text-sm"
              >
                <option value="">차시 추가…</option>
                {(pickLessons ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title || "(제목 없음)"}
                  </option>
                ))}
              </select>
            </div>
          )}
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

        {/* 비교 항목(범례) */}
        {items.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {items.map((it, idx) => (
              <span
                key={it.key}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-3 py-1.5 text-xs"
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: PALETTE[idx % PALETTE.length] }}
                />
                <span className="font-semibold">{it.className}</span>
                {it.groupName && (
                  <span className="rounded-full bg-black/10 px-1.5 text-[10px] font-semibold">
                    {it.groupName}
                  </span>
                )}
                <span className="text-black/45">· {it.lessonTitle}</span>
                <span className="font-bold text-black/55">
                  {perItemCount[idx] ?? 0}
                </span>
                <button
                  onClick={() =>
                    setItems((prev) => prev.filter((x) => x.key !== it.key))
                  }
                  className="ml-0.5 text-black/35 hover:text-rose-500"
                >
                  <Icon name="close" size={13} />
                </button>
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-3 py-1.5 text-xs">
              <span className="h-3 w-3 rounded-full" style={{ background: COMMON }} />
              <span className="font-semibold">공통</span>
              <span className="font-bold text-black/55">{commonCount}</span>
            </span>
          </div>
        )}

        {/* 그래프 */}
        <GlassCard className="mt-4 p-2">
          {items.length < 2 ? (
            <p className="py-16 text-center text-sm text-black/40">
              비교할 학급의 차시를 2개 이상 추가하세요.
            </p>
          ) : overlay.nodes.length === 0 ? (
            <p className="py-16 text-center text-sm text-black/40">
              표시할 지식맵이 없습니다. 각 차시를 먼저 분석했는지 확인하세요.
            </p>
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
