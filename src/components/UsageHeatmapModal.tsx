"use client";

import { useEffect, useMemo, useState } from "react";
import { getClassUsage, USAGE_LABELS, usageDay, type UsageFeature, type UsageRow } from "@/lib/usage";
import { useModalFocus } from "@/hooks/useModalFocus";
import type { Member } from "@/lib/classes";
import { useNameMask } from "@/components/NameMask";

const DAY = 86400_000;
const duration = (seconds: number) => seconds ? `${Math.round(seconds / 60 * 10) / 10}분` : "기록 없음";
export function UsageHeatmapModal({ cid, members, onClose }: { cid: string; members: Member[]; onClose: () => void }) {
  const { mask } = useNameMask();
  const modalRef = useModalFocus(onClose);
  const [today] = useState(() => usageDay(Date.now()));
  const [days, setDays] = useState(14);
  const [end, setEnd] = useState(() => usageDay(Date.now()));
  const [mode, setMode] = useState<"date" | "feature">("date");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<{ uid: string; column: string } | null>(null);
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => new Date(Date.parse(end) - (days - 1 - i) * DAY).toISOString().slice(0, 10)), [days, end]);
  const from = dates[0];
  useEffect(() => {
    let alive = true;
    getClassUsage(cid, from, end).then(result => { if (alive) { setRows(result.rows); setTruncated(result.truncated); setError(""); } }).catch(() => { if (alive) setError("사용량을 불러오지 못했습니다. 담당 교사 권한과 서버 배포 상태를 확인한 뒤 다시 시도해 주세요."); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [cid, from, end, refresh]);

  const students = members.filter(m => m.role === "student" && m.displayName.includes(query)).sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"));
  const columns = mode === "date" ? dates : Object.keys(USAGE_LABELS);
  const value = (uid: string, column: string) => rows.filter(row => row.uid === uid && (mode !== "date" || row.day === column)).reduce((sum, row) => sum + (mode === "date" ? row.activeSeconds : row.counts[column as UsageFeature] ?? 0), 0);
  const total = rows.reduce((sum, row) => sum + row.activeSeconds, 0);
  const participants = new Set(rows.filter(row => row.activeSeconds > 0).map(row => row.uid)).size;
  const selectedRows = selected ? rows.filter(row => row.uid === selected.uid && (mode !== "date" || row.day === selected.column)) : [];
  function change(action: () => void) { setLoading(true); setRows([]); setSelected(null); action(); }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
    <section ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="usage-title" className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-[var(--md-sys-color-surface)] shadow-xl" onClick={e => e.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] p-5"><div><h2 id="usage-title" className="text-lg font-bold">학급 사용 히트맵</h2><p className="text-xs opacity-70">활동 기록은 도입 이후부터 표시됩니다.</p></div><button onClick={onClose} aria-label="닫기" className="rounded-lg border px-3 py-2">닫기</button></header>
      <div className="overflow-y-auto p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <select aria-label="조회 기간" value={days} onChange={e => change(() => setDays(Number(e.target.value)))} className="rounded-lg border bg-[var(--md-sys-color-surface)] p-2 text-sm">{[7, 14, 28].map(n => <option key={n} value={n}>최근 {n}일</option>)}</select>
          <input aria-label="조회 마지막 날짜" type="date" value={end} max={today} onChange={e => { if (e.target.value && Number.isFinite(Date.parse(e.target.value))) change(() => setEnd(e.target.value)); }} className="rounded-lg border bg-transparent p-2 text-sm" />
          <button disabled={loading} onClick={() => change(() => setRefresh(n => n + 1))} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">새로고침</button>
          <input aria-label="학생 검색" placeholder="학생 이름 검색" value={query} onChange={e => setQuery(e.target.value)} className="ml-auto w-40 rounded-lg border bg-transparent px-3 py-2 text-sm" />
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[var(--md-sys-color-surface-container)] p-4 text-sm">활동 기록 학생 <b className="ml-2 text-lg">{participants}명</b></div><div className="rounded-xl bg-[var(--md-sys-color-surface-container)] p-4 text-sm">기록된 활동시간 <b className="ml-2 text-lg">{duration(total)}</b></div></div>
        <div className="mb-3 flex flex-wrap items-center gap-2">{[["date", "학생 × 날짜"], ["feature", "학생 × 기능"]].map(([key, title]) => <button key={key} aria-pressed={mode === key} onClick={() => { setMode(key as "date" | "feature"); setSelected(null); }} className="rounded-lg border px-3 py-2 text-sm font-bold" style={{ background: mode === key ? "var(--md-sys-color-primary-container)" : undefined }}>{title}</button>)}<span className="text-xs opacity-70">농도: 기록 없음 / 5분 미만 / 15분 미만 / 30분 미만 / 30분 이상</span></div>
        {loading ? <p role="status" className="p-8 text-center">사용량을 불러오는 중…</p> : error ? <p role="alert" className="p-4 text-[var(--md-sys-color-error)]">{error}</p> : <>
          {truncated && <p role="status" className="mb-2 text-sm">조회 상한에 도달했습니다. 기간을 줄여 전체 기록을 확인하세요.</p>}
          {!rows.length && <p className="mb-3 rounded-xl bg-[var(--md-sys-color-surface-container)] p-4 text-sm">이 기간에 수집된 기록이 없습니다. 미사용을 뜻하지는 않으며, 기록 전 활동은 소급 집계되지 않습니다.</p>}
          <div tabIndex={0} role="region" aria-label="학급 사용량 표, 가로 스크롤 가능" className="max-h-[45vh] overflow-auto rounded-xl border border-[var(--md-sys-color-outline-variant)]">
            <table className="w-full border-separate border-spacing-1 text-xs"><caption className="sr-only">{from}부터 {end}까지 학생 활동시간, 단위 분</caption><thead><tr><th className="sticky left-0 z-10 min-w-24 bg-[var(--md-sys-color-surface)] p-2 text-left">학생</th>{columns.map(column => <th key={column} className="min-w-14 whitespace-nowrap p-2">{mode === "date" ? column.slice(5) : USAGE_LABELS[column as UsageFeature]}</th>)}</tr></thead><tbody>
              {students.map(student => <tr key={student.uid}><th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-[var(--md-sys-color-surface)] p-2 text-left">{mask(student.displayName)}</th>{columns.map(column => { const seconds = value(student.uid, column); const alpha = seconds === 0 ? 0 : seconds < 300 ? 15 : seconds < 900 ? 30 : seconds < 1800 ? 50 : 75; return <td key={column}><button onClick={() => setSelected({ uid: student.uid, column })} aria-label={`${mask(student.displayName)}, ${mode === "date" ? column : USAGE_LABELS[column as UsageFeature]}, ${duration(seconds)}`} className="min-h-10 w-full min-w-12 rounded-md border border-[var(--md-sys-color-outline-variant)] px-1 tabular-nums" style={{ background: `color-mix(in srgb, var(--md-sys-color-primary) ${alpha}%, var(--md-sys-color-surface))`, color: alpha >= 50 ? "var(--md-sys-color-on-primary)" : undefined }}>{seconds ? Math.round(seconds / 60 * 10) / 10 : "—"}</button></td>; })}</tr>)}
            </tbody></table>
          </div>
          {selected && <div className="mt-3 rounded-xl bg-[var(--md-sys-color-surface-container)] p-4 text-sm"><b>{mask(members.find(m => m.uid === selected.uid)?.displayName)} · {mode === "date" ? selected.column : USAGE_LABELS[selected.column as UsageFeature]}</b><div className="mt-2 flex flex-wrap gap-3">{mode === "date" ? Object.entries(USAGE_LABELS).map(([feature, label]) => <span key={feature}>{label}: {duration(selectedRows.reduce((sum, row) => sum + (row.counts[feature as UsageFeature] ?? 0), 0))}</span>) : selectedRows.map(row => <span key={row.day}>{row.day}: {duration(row.counts[selected.column as UsageFeature] ?? 0)}</span>)}</div></div>}
        </>}
        <p className="mt-4 text-xs leading-relaxed opacity-70">활동시간은 화면이 보이고 포커스가 있으며 최근 60초 이내 입력이 있었던 시간의 추정치입니다. 5분 단위 저장으로 지연될 수 있습니다. 읽기만 한 시간·기록 실패·도입 전 활동은 누락될 수 있으므로 학습 이해도나 출석의 판정 기준으로 사용하지 않습니다. 기능별 기록만 수집하며 입력 내용과 마우스 좌표는 저장하지 않습니다.</p>
      </div>
    </section>
  </div>;
}
