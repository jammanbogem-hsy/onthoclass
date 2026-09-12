"use client";
import { useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import type { Question, Phase } from "@/lib/lessons";
import { useModalFocus } from "@/hooks/useModalFocus";
import { moveActivity } from "@/lib/activityOrder";
import { Icon } from "@/components/Icon";
const labels: Record<string, string> = { question: "질문", reflection: "성찰", quiz: "문항", survey: "설문", canvas: "캔버스", "game-result": "게임 결과" };
function OrderRow({ question, index, count, busy, move }: { question: Question; index: number; count: number; busy: boolean; move: (from: number, to: number) => void }) {
  const drag = useDraggable({ id: question.id, disabled: busy });
  const drop = useDroppable({ id: question.id, disabled: busy });
  return <li ref={node => { drag.setNodeRef(node); drop.setNodeRef(node); }} className={`flex items-center gap-2 rounded-xl border p-3 ${drop.isOver ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]" : "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)]"} ${drag.isDragging ? "opacity-30" : ""}`}>
    <button {...drag.listeners} {...drag.attributes} disabled={busy} aria-label={`${question.title || "활동"} 끌어서 이동`} className="touch-none cursor-grab rounded-lg p-2 active:cursor-grabbing"><Icon name="drag_indicator" size={22} /></button>
    <span className="w-7 shrink-0 text-center text-sm font-bold tabular-nums">{index + 1}</span>
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{question.title.trim() || `${labels[question.kind] ?? "활동"} ${index + 1}`}</p><p className="text-xs opacity-60">{labels[question.kind] ?? question.kind}</p></div>
    <button disabled={busy || index === 0} aria-label={`${question.title || "활동"} 위로 이동`} onClick={() => move(index, index - 1)} className="rounded-lg border p-2 disabled:opacity-25">↑</button>
    <button disabled={busy || index === count - 1} aria-label={`${question.title || "활동"} 아래로 이동`} onClick={() => move(index, index + 1)} className="rounded-lg border p-2 disabled:opacity-25">↓</button>
  </li>;
}
export function ActivityOrderModal({ questions, phase, onSave, onClose }: { questions: Question[]; phase: Phase; onSave: (ids: string[]) => Promise<void>; onClose: () => void }) {
  const [ids, setIds] = useState(() => questions.map(q => q.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const ref = useModalFocus(() => { if (!busy) onClose(); });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const changed = ids.some((id, i) => questions[i]?.id !== id);
  const move = (from: number, to: number) => setIds(previous => moveActivity(previous, from, to));
  const end = (event: DragEndEvent) => { if (event.over) move(ids.indexOf(String(event.active.id)), ids.indexOf(String(event.over.id))); setActive(null); };
  const save = async () => { if (busy || !changed) return; setBusy(true); setError(""); try { await onSave(ids); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "순서를 저장하지 못했습니다. 다시 시도해 주세요."); } finally { setBusy(false); } };
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!busy) onClose(); }}>
    <section ref={ref} role="dialog" aria-modal="true" aria-labelledby="activity-order-title" className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-[var(--md-sys-color-surface)] shadow-xl" onClick={e => e.stopPropagation()}>
      <header className="border-b border-[var(--md-sys-color-outline-variant)] p-5"><h2 id="activity-order-title" className="text-lg font-bold">활동 순서 변경</h2><p className="mt-1 text-sm opacity-70">{phase === "pre" ? "수업 전" : "수업 후"} · {ids.length}개 활동</p><p className="mt-2 text-xs opacity-70">왼쪽 손잡이를 드래그하거나 ↑ ↓ 버튼으로 이동하세요. 저장 전에는 실제 순서가 바뀌지 않습니다.</p></header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={event => setActive(String(event.active.id))} onDragCancel={() => setActive(null)} onDragEnd={end}>
        <ol className="min-h-0 space-y-2 overflow-y-auto p-4">{ids.map((id, index) => { const question = questions.find(q => q.id === id); return question ? <OrderRow key={id} question={question} index={index} count={ids.length} busy={busy} move={move} /> : null; })}</ol>
        <DragOverlay>{active ? <div className="rounded-xl border border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] p-4 text-sm font-bold shadow-xl">{questions.find(q => q.id === active)?.title || "활동"}</div> : null}</DragOverlay>
      </DndContext>
      <footer className="border-t border-[var(--md-sys-color-outline-variant)] p-4">{error && <p role="alert" className="mb-3 text-sm text-[var(--md-sys-color-error)]">{error}</p>}<div className="flex justify-end gap-2"><button disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2">취소</button><button disabled={!changed || busy || !!active} onClick={() => void save()} className="rounded-lg bg-[var(--md-sys-color-primary)] px-4 py-2 font-bold text-[var(--md-sys-color-on-primary)] disabled:opacity-40">{busy ? "저장 중…" : "순서 저장"}</button></div></footer>
    </section>
  </div>;
}
