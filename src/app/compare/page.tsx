"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import { GraphView } from "@/components/GraphView";
import { WordCloud } from "@/components/WordCloud";
import { listSourceClasses, type SourceClass } from "@/lib/teams";
import { getClass, getClassGroup, listMembers } from "@/lib/classes";
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
  const folderId = params.get("folder") || ""; // 폴더(ClassGroup) 모드
  const isFolderMode = !!folderId;

  const [groups, setGroups] = useState<LessonGroup[] | null>(null);
  const [selKey, setSelKey] = useState("");
  const [phase, setPhase] = useState<Phase>("pre");
  const [view, setView] = useState<"graph" | "wordcloud" | "table">("graph");
  const [ontos, setOntos] = useState<Record<string, Ontology>>({});
  // 노드 상세의 '언급한 학생'을 uid → 이름으로 표시하기 위한 맵
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  // 폴더 모드: 폴더 메타(이름·학급수) — 빈/유효 안내 분기용
  const [folderName, setFolderName] = useState<string | null>(null);
  const [folderClassCount, setFolderClassCount] = useState<number | null>(null);

  const isTeacher = profile?.role === "teacher";

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  // 출처 학급의 차시를 모아 '같은 수업(주제)' 묶음 구성.
  //  - 기본: 내 학급 + 팀원 학급, 복제 계보(originLessonId)로 묶음
  //  - 폴더 모드(?folder=): 폴더의 학급들만, 계보 + 제목(정규화) 폴백으로 묶음
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      // 비교 대상 학급 목록 구성
      let sources: SourceClass[];
      if (isFolderMode) {
        const grp = await getClassGroup(folderId).catch(() => null);
        const ids = grp?.classIds ?? [];
        if (!alive) return;
        setFolderName(grp?.name ?? null);
        setFolderClassCount(grp ? ids.length : null);
        const loaded = await Promise.all(
          ids.map((id) => getClass(id).catch(() => null))
        );
        sources = loaded
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map((c) => ({ cid: c.id, name: c.name, teacher: "", mine: true }));
      } else {
        sources = await listSourceClasses(user.uid).catch(
          () => [] as SourceClass[]
        );
      }

      // 제목 정규화(공백 정리 + 소문자) — 폴더 모드에서 같은 제목을 같은 주제로 묶는 폴백 키
      const normTitle = (t: string) =>
        t.trim().toLowerCase().replace(/\s+/g, " ");
      // 폴더 모드: 계보 없이도 같은 제목이면 합치도록 제목→키 사전을 만든다.
      const titleKey = new Map<string, string>(); // normTitle → 묶음 key

      const map = new Map<string, LessonGroup>();
      await Promise.all(
        sources.map(async (c) => {
          const lessons = await listLessons(c.cid).catch(() => []);
          for (const l of lessons) {
            // 묶음 키: 계보 루트 우선, 폴더 모드에선 제목 폴백으로 통합
            let gk = l.originLessonId || l.id;
            if (isFolderMode) {
              const nt = normTitle(l.title);
              if (nt) {
                const existing = titleKey.get(nt);
                if (existing) gk = existing;
                else titleKey.set(nt, gk);
              }
            }
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
  }, [user, wantGroup, isFolderMode, folderId]);

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

  // 비교 대상 학급들의 멤버 이름(uid → 이름) 수집 — 노드 상세 '언급한 학생' 표시용.
  // 팀원 학급 등 멤버 읽기 권한이 없으면 조용히 건너뛴다(해당 uid 는 코드로 표시).
  useEffect(() => {
    let alive = true;
    (async () => {
      const cids = [...new Set(items.map((m) => m.cid))];
      const next: Record<string, string> = {};
      await Promise.all(
        cids.map(async (cid) => {
          const members = await listMembers(cid).catch(() => []);
          for (const mem of members) {
            if (mem.displayName) next[mem.uid] = mem.displayName;
          }
        })
      );
      if (alive) setStudentNames(next);
    })();
    return () => {
      alive = false;
    };
  }, [items]);

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

  // 워드클라우드(그룹): 그래프·범례와 동일한 분류로 나눈다.
  //  - 공통: 2개 이상 학급이 언급한 개념(총 언급수로 크기)
  //  - 학급별: 그 학급에만 등장한 개념(해당 학급 언급수로 크기)
  //  (개념은 공통/특정학급 중 하나로만 분류 — perItemCount/commonCount 범례와 일치)
  const cloudGroups = useMemo(() => {
    const common: { word: string; count: number }[] = [];
    const perClass: { word: string; count: number }[][] = items.map(() => []);
    classRows.forEach((r) => {
      const present = r.counts
        .map((c, i) => (c > 0 ? i : -1))
        .filter((i) => i >= 0);
      if (present.length >= 2) {
        common.push({
          word: r.label,
          count: r.counts.reduce((s, c) => s + c, 0),
        });
      } else if (present.length === 1) {
        const idx = present[0];
        perClass[idx].push({ word: r.label, count: r.counts[idx] });
      }
    });
    return { common, perClass };
  }, [classRows, items]);

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
          {isFolderMode
            ? `${folderName ?? "폴더"} · 학급 비교`
            : "학급 간 지식맵 비교"}
        </h1>
        <p className="mt-1 text-sm text-black/55">
          {isFolderMode
            ? "이 폴더의 학급들이 같은 주제(차시)를 다뤘다면, 그 지식맵과 워드클라우드를 학급별 색으로 겹쳐 비교합니다. 같은 제목이거나 ‘다른 학급으로 복제’한 차시끼리 묶입니다."
            : "같은 수업(차시를 다른 학급으로 복제한 묶음)을 학급별 색으로 겹쳐 비교합니다. 비교하려면 차시 화면의 “다른 학급으로 복제”로 같은 수업을 여러 학급에 만들어 두세요."}
        </p>

        {/* 컨트롤 */}
        <GlassCard className="mt-5 flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-black/55">
              {isFolderMode ? "공유 주제 (차시)" : "같은 수업 (복제 묶음)"}
            </span>
            <select
              value={selKey}
              onChange={(e) => setSelKey(e.target.value)}
              className="m3-field !w-auto"
              disabled={!groups || groups.length === 0}
            >
              {groups === null ? (
                <option value="">불러오는 중…</option>
              ) : groups.length === 0 ? (
                <option value="">비교 가능한 주제 없음</option>
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
                {m.teacher && (
                  <span className="text-black/45">· {m.teacher}</span>
                )}
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

        {/* 그래프 / 워드클라우드 / 표 토글 */}
        {items.length >= 2 && overlay.nodes.length > 0 && (
          <div className="mt-4 inline-flex rounded-full bg-black/5 p-0.5 dark:bg-white/10">
            {(
              [
                ["graph", "그래프"],
                ["wordcloud", "워드클라우드"],
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

        {/* 그래프 / 워드클라우드 / 표 */}
        <GlassCard className="mt-2 p-2">
          {isFolderMode &&
          folderClassCount !== null &&
          folderClassCount < 2 ? (
            <p className="py-16 text-center text-sm text-black/40">
              이 폴더에는 학급이 2개 이상 있어야 비교할 수 있어요. 폴더에 학급을
              더 넣어 주세요.
            </p>
          ) : isFolderMode && folderClassCount === null && groups !== null ? (
            <p className="py-16 text-center text-sm text-black/40">
              폴더를 찾을 수 없습니다.
            </p>
          ) : groups && groups.length === 0 ? (
            <p className="py-16 text-center text-sm text-black/40">
              {isFolderMode
                ? "공유하는 수업 주제가 없습니다. 폴더의 학급들이 같은 제목의 차시를 가지거나, 한 차시를 ‘다른 학급으로 복제’해 두면 여기서 겹쳐 볼 수 있어요."
                : "비교 가능한 수업이 없습니다. 차시 화면의 “다른 학급으로 복제”로 같은 수업을 다른 학급에 만들면 여기서 학급별로 겹쳐 볼 수 있어요."}
            </p>
          ) : items.length < 2 ? (
            <p className="py-16 text-center text-sm text-black/40">
              {isFolderMode
                ? "이 주제를 가진 학급이 2개 이상이어야 비교됩니다."
                : "이 수업을 가진 학급이 2개 이상이어야 비교됩니다."}
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
          ) : view === "wordcloud" ? (
            <div className="space-y-3 p-2">
              {/* 공통 + 학급별로 구분 (범례·그래프와 동일한 색·분류) */}
              {cloudGroups.common.length > 0 && (
                <section>
                  <div className="mb-1 flex items-center gap-1.5 px-1 text-sm font-semibold">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: COMMON }}
                    />
                    공통
                    <span className="font-bold text-black/45">
                      {cloudGroups.common.length}
                    </span>
                  </div>
                  <WordCloud items={cloudGroups.common} color={COMMON} />
                </section>
              )}
              {items.map((m, idx) =>
                cloudGroups.perClass[idx].length > 0 ? (
                  <section key={`${m.cid}__${m.lid}`}>
                    <div className="mb-1 flex items-center gap-1.5 px-1 text-sm font-semibold">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: PALETTE[idx % PALETTE.length] }}
                      />
                      {m.className}
                      <span className="font-bold text-black/45">
                        {cloudGroups.perClass[idx].length}
                      </span>
                    </div>
                    <WordCloud
                      items={cloudGroups.perClass[idx]}
                      color={PALETTE[idx % PALETTE.length]}
                    />
                  </section>
                ) : null
              )}
              {cloudGroups.common.length === 0 &&
                cloudGroups.perClass.every((g) => g.length === 0) && (
                  <p className="py-8 text-center text-sm text-black/40">
                    표시할 개념어가 없어요.
                  </p>
                )}
            </div>
          ) : (
            <GraphView
              data={overlay}
              height={600}
              title="학급 비교"
              nodeColor={(n) => colorByKey[n.id]}
              studentNames={studentNames}
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
