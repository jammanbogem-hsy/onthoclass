"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import type { ConceptChange } from "@/lib/ontology";
import { PREPOST_COLOR } from "@/lib/palette";

/* ---------- 사전/사후 표 비교 (LLM 0, diffPrePost 기반) ---------- */
const STATUS_META: Record<
  ConceptChange["status"],
  { label: string; color: string }
> = {
  emerged: { label: "수업 후 신규", color: PREPOST_COLOR.post },
  resolved: { label: "수업 전만", color: PREPOST_COLOR.pre },
  persisted: { label: "지속", color: PREPOST_COLOR.both },
  shifted: { label: "정서 변화", color: "#f59e0b" },
};

export function PrePostTable({ changes }: { changes: ConceptChange[] }) {
  const [sort, setSort] = useState<"status" | "delta">("status");
  const rows = useMemo(() => {
    const rank = { emerged: 0, shifted: 1, persisted: 2, resolved: 3 };
    const copy = [...changes];
    if (sort === "delta") {
      copy.sort(
        (a, b) =>
          b.postCount - b.preCount - (a.postCount - a.preCount) ||
          b.postCount + b.preCount - (a.postCount + a.preCount)
      );
    } else {
      copy.sort(
        (a, b) =>
          rank[a.status] - rank[b.status] ||
          b.postCount + b.preCount - (a.postCount + a.preCount)
      );
    }
    return copy;
  }, [changes, sort]);

  if (changes.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-black/40">
        비교할 개념이 없습니다. 수업 전·후를 모두 분석하면 표가 채워집니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--md-sys-color-outline-variant)] text-left text-xs text-black/55">
            <th className="py-2 pr-2 font-semibold">개념</th>
            <th className="px-2 py-2 text-center font-semibold">수업 전</th>
            <th className="px-2 py-2 text-center font-semibold">수업 후</th>
            <th
              className="cursor-pointer px-2 py-2 text-center font-semibold hover:text-black/80"
              onClick={() => setSort("delta")}
              title="변화량으로 정렬"
            >
              변화 Δ
            </th>
            <th
              className="cursor-pointer px-2 py-2 text-center font-semibold hover:text-black/80"
              onClick={() => setSort("status")}
              title="상태로 정렬"
            >
              상태
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const d = c.postCount - c.preCount;
            const m = STATUS_META[c.status];
            return (
              <tr
                key={c.id}
                className="border-b border-[var(--md-sys-color-outline-variant)]/60"
              >
                <td className="py-1.5 pr-2 font-medium">{c.label}</td>
                <td className="px-2 py-1.5 text-center tabular-nums text-black/60">
                  {c.preCount}
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums text-black/60">
                  {c.postCount}
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums font-semibold">
                  <span
                    className={
                      d > 0
                        ? "text-emerald-600"
                        : d < 0
                          ? "text-rose-500"
                          : "text-black/40"
                    }
                  >
                    {d > 0 ? `+${d}` : d}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-center">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                    style={{ background: m.color }}
                  >
                    {m.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 학급별 차이 표 (LLM 0) ---------- */
export type ClassDiffRow = { label: string; counts: number[]; common: boolean };

export function ClassDiffTable({
  classes,
  rows,
}: {
  classes: { name: string; color: string }[];
  rows: ClassDiffRow[];
}) {
  const [onlyDiff, setOnlyDiff] = useState(false);
  const view = useMemo(() => {
    const r = onlyDiff ? rows.filter((x) => !x.common) : rows;
    // 언급 합이 큰 순
    return [...r].sort(
      (a, b) =>
        b.counts.reduce((s, n) => s + n, 0) -
        a.counts.reduce((s, n) => s + n, 0)
    );
  }, [rows, onlyDiff]);

  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-black/40">
        비교할 개념이 없습니다. 각 학급에서 이 차시를 분석했는지 확인하세요.
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOnlyDiff((v) => !v)}
        className={`mb-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
          onlyDiff
            ? "bg-[var(--md-sys-color-primary)] text-white"
            : "border border-[var(--md-sys-color-outline)] text-black/60"
        }`}
      >
        <Icon name="filter_alt" size={13} />
        차이만 보기
      </button>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--md-sys-color-outline-variant)] text-left text-xs text-black/55">
              <th className="py-2 pr-2 font-semibold">개념</th>
              {classes.map((c, i) => (
                <th key={i} className="px-2 py-2 text-center font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: c.color }}
                    />
                    {c.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr
                key={r.label}
                className="border-b border-[var(--md-sys-color-outline-variant)]/60"
              >
                <td className="py-1.5 pr-2 font-medium">
                  {r.label}
                  {!r.common && (
                    <span className="ml-1.5 rounded-full bg-[var(--md-sys-color-secondary-container)] px-1.5 text-xs font-semibold text-[var(--md-sys-color-on-secondary-container)]">
                      고유
                    </span>
                  )}
                </td>
                {r.counts.map((n, i) => (
                  <td
                    key={i}
                    className={`px-2 py-1.5 text-center tabular-nums ${
                      n === 0 ? "text-black/25" : "font-semibold text-black/70"
                    }`}
                  >
                    {n || "·"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
