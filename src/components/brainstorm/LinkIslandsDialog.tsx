"use client";

// 브레인스토밍 섬 연결 — 같은 주제를 내 다른 반에도 열고, 반마다 섬 하나씩 한 바다에 이어 붙인다.
// 반마다 활동·아이디어는 따로 저장되고(그 반 차시에 활동이 새로 생긴다), 판에서만 함께 보인다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/Glass";
import { Icon } from "@/components/Icon";
import { getClass } from "@/lib/classes";
import { getLesson, listLessons, type Lesson, type Question } from "@/lib/lessons";
import { listSourceClasses, type SourceClass } from "@/lib/teams";
import { linkIsland, unlinkIsland, watchWorld, WORLD_MAX, type BrainWorld } from "@/lib/brainstorm";

export function LinkIslandsDialog({ cid, lid, question, onClose }: { cid: string; lid: string; question: Question; onClose: () => void }) {
  const { user } = useAuth();
  const [watched, setWatched] = useState<BrainWorld | null>(null);
  const world = question.world && watched?.id === question.world ? watched : null;
  const [classes, setClasses] = useState<SourceClass[] | null>(null);
  const [lessons, setLessons] = useState<Record<string, Lesson[]>>({});
  const [pick, setPick] = useState<Record<string, string>>({});
  const [origin, setOrigin] = useState(lid);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!question.world) return;
    return watchWorld(question.world, setWatched, () => setWatched(null));
  }, [question.world]);
  useEffect(() => {
    if (!user) return;
    // 활동을 만들 수 있는 '내 학급'만(팀원 학급엔 쓰기 불가)
    listSourceClasses(user.uid).then(cs => setClasses(cs.filter(c => c.mine))).catch(() => setClasses([]));
    getLesson(cid, lid).then(l => setOrigin(l?.originLessonId || lid)).catch(() => {});
  }, [user, cid, lid]);

  const linked = useMemo(() => new Set((world?.islands ?? []).map(i => i.cid)), [world]);
  const others = (classes ?? []).filter(c => c.cid !== cid && !linked.has(c.cid));
  const full = (world?.islands.length ?? 1) >= WORLD_MAX;

  // 각 반에서 활동을 넣을 차시 — 이 차시를 복제한 차시(같은 수업)가 있으면 그것, 없으면 가장 최근 차시
  const asked = useRef(new Set<string>());
  useEffect(() => {
    for (const c of others) {
      if (asked.current.has(c.cid)) continue;
      asked.current.add(c.cid);
      listLessons(c.cid).then(ls => {
        setLessons(m => ({ ...m, [c.cid]: ls }));
        const same = ls.find(l => l.originLessonId === origin || l.id === origin);
        const latest = [...ls].sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.order - a.order)[0];
        const def = same ?? latest;
        if (def) setPick(p => ({ ...p, [c.cid]: p[c.cid] ?? def.id }));
      }).catch(() => setLessons(m => ({ ...m, [c.cid]: [] })));
    }
  }, [others, origin]);

  async function add(c: SourceClass) {
    const target = pick[c.cid];
    if (!user || busy || !target) return;
    setBusy(c.cid); setErr("");
    try {
      const me = (classes ?? []).find(x => x.cid === cid)?.name || (await getClass(cid))?.name || "우리 반";
      await linkIsland(user, { cid, lid, question, className: me }, { cid: c.cid, lid: target, name: c.name });
    } catch (e) { setErr(e instanceof Error ? e.message : "섬을 잇지 못했어요."); }
    finally { setBusy(""); }
  }
  async function remove(i: { cid: string; lid: string; qid: string; name: string }) {
    if (!world || busy) return;
    setBusy(i.cid); setErr("");
    try { await unlinkIsland(world.id, i); }
    catch (e) { setErr(e instanceof Error ? e.message : "연결을 끊지 못했어요."); }
    finally { setBusy(""); }
  }

  const owner = !world || world.ownerId === user?.uid;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm" onClick={onClose}>
      <GlassCard strong className="flex max-h-[85vh] w-full max-w-md flex-col p-6" onClick={e => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">여러 반 섬 잇기</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5">
            <Icon name="close" size={18} />
          </button>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
          고른 반의 차시에 같은 주제의 브레인스토밍이 생기고, 판에는 반마다 섬 하나씩 한 바다에 함께 보여요.
          아이디어는 반마다 따로 저장되고, 학생은 자기 반 섬에만 쓸 수 있어요. 나중에 반을 더 이을 수도 있어요.
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {world && <>
            <h3 className="mb-1.5 text-xs font-bold text-[var(--md-sys-color-primary)]">이어진 섬 {world.islands.length}개</h3>
            <ul className="mb-4 flex flex-col gap-1.5">
              {world.islands.map(i => <li key={i.cid + i.qid} className="flex items-center gap-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] px-3 py-2 text-sm">
                <Icon name="landscape" size={16} className="text-[var(--md-sys-color-primary)]" />
                <span className="min-w-0 flex-1 truncate font-medium">{i.name}{i.cid === cid ? " (지금 반)" : ""}</span>
                {owner && world.islands.length > 1 && <button type="button" disabled={!!busy} onClick={() => remove(i)}
                  className="min-h-9 rounded-full px-3 text-xs font-semibold text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)] disabled:opacity-50">
                  {busy === i.cid ? "끊는 중…" : "연결 끊기"}
                </button>}
              </li>)}
            </ul>
          </>}
          {!owner ? <p className="py-4 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">섬을 처음 이은 선생님만 반을 더하거나 뺄 수 있어요.</p>
            : <>
            <h3 className="mb-1.5 text-xs font-bold text-[var(--md-sys-color-primary)]">이을 수 있는 반</h3>
            {classes === null ? <p className="py-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">불러오는 중…</p>
              : others.length === 0 ? <p className="py-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">이을 수 있는 다른 반이 없어요.</p>
              : <ul className="flex flex-col gap-1.5">
                {others.map(c => {
                  const ls = lessons[c.cid];
                  return <li key={c.cid} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] px-3 py-2 text-sm">
                    <Icon name="school" size={16} className="text-[var(--md-sys-color-primary)]" />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    {ls === undefined ? <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">차시 불러오는 중…</span>
                      : ls.length === 0 ? <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">차시가 없어요</span>
                      : <>
                        <select value={pick[c.cid] ?? ""} onChange={e => setPick(p => ({ ...p, [c.cid]: e.target.value }))} aria-label={`${c.name} 차시`}
                          className="min-h-9 max-w-[150px] rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] px-2 text-xs">
                          {ls.map(l => <option key={l.id} value={l.id}>{l.title || "제목 없는 차시"}</option>)}
                        </select>
                        <button type="button" disabled={!!busy || full || !pick[c.cid]} onClick={() => add(c)}
                          className="btn-accent min-h-9 rounded-full px-3 text-xs font-semibold disabled:opacity-50">
                          {busy === c.cid ? "잇는 중…" : "섬 잇기"}
                        </button>
                      </>}
                  </li>;
                })}
              </ul>}
            {full && <p className="mt-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">섬은 {WORLD_MAX}개까지 이을 수 있어요.</p>}
          </>}
          {err && <p role="alert" className="mt-2 text-xs text-[var(--md-sys-color-error)]">{err}</p>}
        </div>
      </GlassCard>
    </div>
  );
}
