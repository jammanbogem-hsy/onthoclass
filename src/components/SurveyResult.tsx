"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  listQuestionSubmissions,
  type SurveyItem,
  type Submission,
} from "@/lib/lessons";
import { cohenLabel, pairedTTest, type PairedResult } from "@/lib/stats";

/** 사전/사후 설문 효과성 분석 (대응표본 t검정 등) — 교사용. */
export function SurveyResult({
  cid,
  lid,
  preQid,
  postQid,
  items,
}: {
  cid: string;
  lid: string;
  preQid: string;
  postQid: string;
  items: SurveyItem[];
}) {
  const [pre, setPre] = useState<Submission[] | null>(null);
  const [post, setPost] = useState<Submission[] | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    listQuestionSubmissions(cid, lid, preQid).then(setPre).catch(() => setPre([]));
    listQuestionSubmissions(cid, lid, postQid)
      .then(setPost)
      .catch(() => setPost([]));
  }, [cid, lid, preQid, postQid]);

  const preMap = useMemo(() => {
    const m = new Map<string, Submission>();
    (pre ?? []).forEach((s) => m.set(s.uid, s));
    return m;
  }, [pre]);
  const postMap = useMemo(() => {
    const m = new Map<string, Submission>();
    (post ?? []).forEach((s) => m.set(s.uid, s));
    return m;
  }, [post]);

  if (pre === null || post === null) {
    return (
      <p className="py-4 text-center text-xs text-black/40">불러오는 중…</p>
    );
  }

  const preN = pre.filter((s) => s.surveyAnswers).length;
  const postN = post.filter((s) => s.surveyAnswers).length;

  return (
    <div className="mt-4 border-t border-black/5 pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-sm font-semibold"
      >
        <span className="flex items-center gap-1.5">
          <Icon
            name="analytics"
            size={16}
            className="text-[var(--md-sys-color-primary)]"
          />
          효과성 분석 (대응표본 t검정)
          <span className="text-xs font-normal text-black/40">
            사전 {preN}명 · 사후 {postN}명
          </span>
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} size={18} />
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-5">
          {items.map((it, i) => (
            <ItemResult
              key={it.id}
              index={i}
              item={it}
              preMap={preMap}
              postMap={postMap}
            />
          ))}
          <p className="text-xs text-black/40">
            대응표본 t검정: 사전·사후 모두 응답한 학생만 짝지어 분석합니다. p&lt;.05
            면 통계적으로 유의한 변화, d는 효과크기(Cohen&apos;s d)입니다.
          </p>
        </div>
      )}
    </div>
  );
}

function ItemResult({
  index,
  item,
  preMap,
  postMap,
}: {
  index: number;
  item: SurveyItem;
  preMap: Map<string, Submission>;
  postMap: Map<string, Submission>;
}) {
  const header = (
    <p className="mb-1.5 text-sm font-medium">
      <span className="mr-1 text-[var(--md-sys-color-primary)]">
        Q{index + 1}.
      </span>
      {item.prompt || "(문항)"}
      <span className="ml-2 rounded-full bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 text-xs text-black/55">
        {item.type === "scale"
          ? "척도"
          : item.type === "choice"
            ? "객관식"
            : "주관식"}
      </span>
    </p>
  );

  if (item.type === "scale") {
    // 사전·사후 모두 응답한 학생을 uid로 짝지어 대응표본 t검정
    const pairs: { pre: number; post: number }[] = [];
    for (const [uid, ps] of preMap) {
      const a = ps.surveyAnswers?.[item.id];
      const b = postMap.get(uid)?.surveyAnswers?.[item.id];
      if (typeof a === "number" && typeof b === "number")
        pairs.push({ pre: a, post: b });
    }
    const r: PairedResult | null = pairedTTest(pairs);
    return (
      <div>
        {header}
        {!r ? (
          <p className="text-xs text-black/40">
            짝지을 응답이 부족합니다(사전·사후 모두 응답 2명 이상 필요).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <tbody>
                <Row label="짝 학생 수 (n)" value={`${r.n}명`} />
                <Row
                  label="사전 평균 → 사후 평균"
                  value={`${r.meanPre.toFixed(2)} → ${r.meanPost.toFixed(2)}`}
                />
                <Row
                  label="평균 변화 (Δ)"
                  value={(r.meanDiff > 0 ? "+" : "") + r.meanDiff.toFixed(2)}
                  strong
                  positive={r.meanDiff > 0}
                  negative={r.meanDiff < 0}
                />
                <Row
                  label="t (df)"
                  value={`${isFinite(r.t) ? r.t.toFixed(2) : "∞"} (${r.df})`}
                />
                <Row
                  label="p"
                  value={r.p < 0.001 ? "< .001" : r.p.toFixed(3)}
                  badge={r.p < 0.05 ? "유의 (p<.05)" : "유의하지 않음"}
                  badgeOk={r.p < 0.05}
                />
                <Row
                  label="효과크기 (Cohen's d)"
                  value={`${isFinite(r.d) ? r.d.toFixed(2) : "∞"} · ${cohenLabel(r.d)}`}
                />
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (item.type === "choice") {
    const dist = (m: Map<string, Submission>) => {
      const c: Record<string, number> = {};
      let total = 0;
      for (const s of m.values()) {
        const v = s.surveyAnswers?.[item.id];
        if (typeof v === "string" && v) {
          c[v] = (c[v] ?? 0) + 1;
          total++;
        }
      }
      return { c, total };
    };
    const pd = dist(preMap);
    const od = dist(postMap);
    const opts = item.options ?? [];
    return (
      <div>
        {header}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-black/55">
              <th className="py-1 pr-2 font-semibold">선택지</th>
              <th className="px-2 py-1 text-center font-semibold">사전</th>
              <th className="px-2 py-1 text-center font-semibold">사후</th>
            </tr>
          </thead>
          <tbody>
            {opts.map((o, oi) => {
              const pc = pd.c[o] ?? 0;
              const oc = od.c[o] ?? 0;
              const pp = pd.total ? Math.round((pc / pd.total) * 100) : 0;
              const op = od.total ? Math.round((oc / od.total) * 100) : 0;
              return (
                <tr
                  key={oi}
                  className="border-b border-[var(--md-sys-color-outline-variant)]/60"
                >
                  <td className="py-1 pr-2">{o || `선택지 ${oi + 1}`}</td>
                  <td className="px-2 py-1 text-center tabular-nums text-black/55">
                    {pc} ({pp}%)
                  </td>
                  <td className="px-2 py-1 text-center tabular-nums font-semibold">
                    {oc} ({op}%)
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // open
  const texts = (m: Map<string, Submission>) =>
    [...m.values()]
      .map((s) => ({
        name: s.studentName,
        text: String(s.surveyAnswers?.[item.id] ?? ""),
      }))
      .filter((x) => x.text.trim());
  const ot = texts(postMap);
  return (
    <div>
      {header}
      {ot.length === 0 ? (
        <p className="text-xs text-black/40">아직 응답이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {ot.slice(0, 30).map((x, i) => (
            <li
              key={i}
              className="rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-sm"
            >
              <span className="mr-1.5 text-xs font-semibold text-black/45">
                {x.name}
              </span>
              {x.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  positive,
  negative,
  badge,
  badgeOk,
}: {
  label: string;
  value: string;
  strong?: boolean;
  positive?: boolean;
  negative?: boolean;
  badge?: string;
  badgeOk?: boolean;
}) {
  return (
    <tr className="border-b border-[var(--md-sys-color-outline-variant)]/60">
      <td className="py-1.5 pr-3 text-xs text-black/55">{label}</td>
      <td
        className={`py-1.5 text-sm tabular-nums ${
          strong ? "font-bold" : "font-medium"
        } ${
          positive
            ? "text-[var(--md-sys-color-tertiary)]"
            : negative
              ? "text-[var(--md-sys-color-error)]"
              : ""
        }`}
      >
        {value}
        {badge && (
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
              badgeOk
                ? "bg-[var(--md-sys-color-primary)] text-white"
                : "bg-[var(--md-sys-color-surface-container-high)] text-black/55"
            }`}
          >
            {badge}
          </span>
        )}
      </td>
    </tr>
  );
}
