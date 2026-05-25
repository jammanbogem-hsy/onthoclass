"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  listQuestionSubmissions,
  type SurveyItem,
  type Submission,
} from "@/lib/lessons";
import { cohenLabel, pairedTTest, type PairedResult } from "@/lib/stats";
import { downloadDocx, wPara, wRow, wTable } from "@/lib/docx";

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
          <SurveyReport items={items} preMap={preMap} postMap={postMap} />

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">
              <Icon
                name="chevron_right"
                size={16}
                className="transition group-open:rotate-90"
              />
              문항별 상세
            </summary>
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
            </div>
          </details>

          <p className="text-xs text-black/40">
            대응표본 t검정: 사전·사후 모두 응답한 학생만 짝지어 분석합니다. p&lt;.05
            면 통계적으로 유의한 변화, d는 효과크기(Cohen&apos;s d)입니다.
          </p>
        </div>
      )}
    </div>
  );
}

/** 이 설문 문항(현재 행)의 학생 응답을 한 명씩 넘겨 보는 뷰 — 질문 활동의 제출 결과와 동일한 형태. */
export function SurveyResponses({
  items,
  submissions,
}: {
  items: SurveyItem[];
  submissions: Submission[];
}) {
  const [idx, setIdx] = useState(0);
  const answered = useMemo(
    () => submissions.filter((s) => s.surveyAnswers),
    [submissions]
  );

  if (answered.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-black/40">
        아직 제출이 없습니다.
      </p>
    );
  }

  const i = Math.min(idx, answered.length - 1);
  const s = answered[i];

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setIdx(Math.max(0, i - 1))}
          disabled={i === 0}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5 disabled:opacity-30 dark:bg-white/10"
          title="이전 학생"
        >
          <Icon name="chevron_left" size={18} />
        </button>
        <span className="text-xs font-semibold text-black/55 dark:text-white/55">
          {s.studentName}{" "}
          <span className="font-normal text-black/35">
            ({i + 1}/{answered.length})
          </span>
        </span>
        <button
          onClick={() => setIdx(Math.min(answered.length - 1, i + 1))}
          disabled={i >= answered.length - 1}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5 disabled:opacity-30 dark:bg-white/10"
          title="다음 학생"
        >
          <Icon name="chevron_right" size={18} />
        </button>
      </div>
      <div className="flex flex-col gap-2.5 rounded-2xl bg-white/60 px-4 py-3 dark:bg-white/10">
        {items.map((it, qi) => (
          <AnswerLine
            key={it.id}
            index={qi}
            item={it}
            answer={s.surveyAnswers?.[it.id]}
          />
        ))}
      </div>
    </div>
  );
}

/** 한 학생의 한 문항 응답 표시 — 척도는 막대, 객관식/주관식은 텍스트 */
function AnswerLine({
  index,
  item,
  answer,
}: {
  index: number;
  item: SurveyItem;
  answer: number | string | undefined;
}) {
  const blank = answer === undefined || answer === "" || answer === null;
  return (
    <div className="border-b border-[var(--md-sys-color-outline-variant)]/50 pb-2 last:border-0 last:pb-0">
      <p className="text-xs font-medium text-black/55">
        <span className="mr-1 font-bold text-[var(--md-sys-color-primary)]">
          Q{index + 1}.
        </span>
        {item.prompt || "(문항)"}
      </p>
      {blank ? (
        <p className="mt-1 text-sm text-black/35">(무응답)</p>
      ) : item.type === "scale" ? (
        (() => {
          const max = item.scaleMax ?? 5;
          const v = Number(answer);
          return (
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container-high)]">
                <div
                  className="h-full rounded-full bg-[var(--md-sys-color-primary)]"
                  style={{ width: `${(v / max) * 100}%` }}
                />
              </div>
              <span className="text-sm font-bold tabular-nums">
                {v}
                <span className="text-xs font-normal text-black/40"> / {max}</span>
              </span>
            </div>
          );
        })()
      ) : (
        <p className="mt-1 text-sm">{String(answer)}</p>
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

// ───────────────────────── 논문·연구대회용 결과 리포트 ─────────────────────────

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const sd = (a: number[], m: number) =>
  a.length < 2
    ? 0
    : Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
const f2 = (x: number) => (isFinite(x) ? x.toFixed(2) : "∞");
// APA: 선행 0 제거한 p값 표기
const apaP = (p: number) =>
  p < 0.001 ? "< .001" : p.toFixed(3).replace(/^0/, "");
const dStr = (d: number) => (isFinite(d) ? (d > 0 ? "+" : "") + d.toFixed(2) : "∞");

type ScaleRow = {
  qNo: number;
  prompt: string;
  n: number;
  mPre: number;
  sdPre: number;
  mPost: number;
  sdPost: number;
  result: PairedResult | null;
};

/** 척도 문항별 대응표본 기술통계 + t검정 결과 */
function buildScaleRows(
  items: SurveyItem[],
  preMap: Map<string, Submission>,
  postMap: Map<string, Submission>
): ScaleRow[] {
  const rows: ScaleRow[] = [];
  let qNo = 0;
  items.forEach((it) => {
    qNo++;
    if (it.type !== "scale") return;
    const preVals: number[] = [];
    const postVals: number[] = [];
    const pairs: { pre: number; post: number }[] = [];
    for (const [uid, ps] of preMap) {
      const a = ps.surveyAnswers?.[it.id];
      const b = postMap.get(uid)?.surveyAnswers?.[it.id];
      if (typeof a === "number" && typeof b === "number") {
        pairs.push({ pre: a, post: b });
        preVals.push(a);
        postVals.push(b);
      }
    }
    const mPre = mean(preVals);
    const mPost = mean(postVals);
    rows.push({
      qNo,
      prompt: it.prompt || `문항 ${qNo}`,
      n: pairs.length,
      mPre,
      sdPre: sd(preVals, mPre),
      mPost,
      sdPost: sd(postVals, mPost),
      result: pairedTTest(pairs),
    });
  });
  return rows;
}

/** 전체 척도 종합 — 학생별 척도 문항 평균을 사전·사후로 짝지어 검정 */
function buildOverall(
  items: SurveyItem[],
  preMap: Map<string, Submission>,
  postMap: Map<string, Submission>
): ScaleRow | null {
  const scaleItems = items.filter((it) => it.type === "scale");
  if (scaleItems.length === 0) return null;
  const preVals: number[] = [];
  const postVals: number[] = [];
  const pairs: { pre: number; post: number }[] = [];
  for (const [uid, ps] of preMap) {
    const post = postMap.get(uid);
    if (!post) continue;
    const pv = scaleItems
      .map((it) => ps.surveyAnswers?.[it.id])
      .filter((v): v is number => typeof v === "number");
    const ov = scaleItems
      .map((it) => post.surveyAnswers?.[it.id])
      .filter((v): v is number => typeof v === "number");
    if (pv.length && ov.length) {
      const a = mean(pv);
      const b = mean(ov);
      pairs.push({ pre: a, post: b });
      preVals.push(a);
      postVals.push(b);
    }
  }
  const mPre = mean(preVals);
  const mPost = mean(postVals);
  return {
    qNo: 0,
    prompt: "전체 척도 평균",
    n: pairs.length,
    mPre,
    sdPre: sd(preVals, mPre),
    mPost,
    sdPost: sd(postVals, mPost),
    result: pairedTTest(pairs),
  };
}

function SurveyReport({
  items,
  preMap,
  postMap,
}: {
  items: SurveyItem[];
  preMap: Map<string, Submission>;
  postMap: Map<string, Submission>;
}) {
  const [copied, setCopied] = useState<null | "table" | "text">(null);

  const rows = useMemo(
    () => buildScaleRows(items, preMap, postMap),
    [items, preMap, postMap]
  );
  const overall = useMemo(
    () => buildOverall(items, preMap, postMap),
    [items, preMap, postMap]
  );
  const choiceItems = useMemo(
    () => items.filter((it) => it.type === "choice"),
    [items]
  );

  // 자동 해석 내러티브
  const narrative = useMemo(() => {
    const valid = rows.filter((r) => r.result);
    if (valid.length === 0 || !overall?.result) return "";
    const n = overall.result.n;
    const sig = valid.filter((r) => (r.result?.p ?? 1) < 0.05);
    const top = [...valid].sort(
      (a, b) => Math.abs(b.result!.d) - Math.abs(a.result!.d)
    )[0];
    const o = overall.result;
    const lines: string[] = [];
    lines.push(
      `본 설문은 척도 문항 ${valid.length}개로 구성되었으며, 사전·사후에 모두 응답한 학생 ${n}명을 대상으로 대응표본 t검정을 실시하였다.`
    );
    lines.push(
      `분석 결과, ${valid.length}개 문항 중 ${sig.length}개 문항에서 통계적으로 유의한 변화가 나타났다(p < .05).`
    );
    lines.push(
      `전체 척도 평균은 사전 ${f2(overall.mPre)}(SD = ${f2(
        overall.sdPre
      )})에서 사후 ${f2(overall.mPost)}(SD = ${f2(
        overall.sdPost
      )})로 ${dStr(o.meanDiff)}점 변화하였으며, 이는 통계적으로 ${
        o.p < 0.05 ? "유의하였다" : "유의하지 않았다"
      }, t(${o.df}) = ${f2(o.t)}, ${
        o.p < 0.001 ? "p < .001" : "p = " + o.p.toFixed(3).replace(/^0/, "")
      }, Cohen's d = ${f2(o.d)}(${cohenLabel(o.d)} 효과크기).`
    );
    if (top?.result) {
      lines.push(
        `문항별로는 ‘${top.prompt}’에서 가장 큰 효과크기(d = ${f2(
          top.result.d
        )})가 확인되었다.`
      );
    }
    return lines.join(" ");
  }, [rows, overall]);

  if (rows.length === 0 && choiceItems.length === 0) return null;

  // ── 복사용 빌더 (HWP/Word 붙여넣기) ──
  function tableHtmlAndText(): { html: string; text: string } {
    const head = [
      "문항",
      "사전 M(SD)",
      "사후 M(SD)",
      "Δ",
      "t",
      "df",
      "p",
      "Cohen's d",
    ];
    const body: string[][] = [];
    rows.forEach((r) => {
      const res = r.result;
      body.push([
        `Q${r.qNo}. ${r.prompt}`,
        `${f2(r.mPre)} (${f2(r.sdPre)})`,
        `${f2(r.mPost)} (${f2(r.sdPost)})`,
        res ? dStr(res.meanDiff) : "-",
        res ? f2(res.t) : "-",
        res ? String(res.df) : "-",
        res ? apaP(res.p) : "-",
        res ? `${f2(res.d)}` : "-",
      ]);
    });
    if (overall?.result) {
      const o = overall.result;
      body.push([
        "전체 척도 평균",
        `${f2(overall.mPre)} (${f2(overall.sdPre)})`,
        `${f2(overall.mPost)} (${f2(overall.sdPost)})`,
        dStr(o.meanDiff),
        f2(o.t),
        String(o.df),
        apaP(o.p),
        f2(o.d),
      ]);
    }
    const th = head.map((h) => `<th>${h}</th>`).join("");
    const trs = body
      .map(
        (r) =>
          `<tr>${r
            .map(
              (c, i) =>
                `<td${i === 0 ? "" : ' align="center"'}>${c}</td>`
            )
            .join("")}</tr>`
      )
      .join("");
    const html =
      `<table border="1" cellspacing="0" cellpadding="4" ` +
      `style="border-collapse:collapse;font-family:'맑은 고딕',sans-serif;font-size:10pt">` +
      `<caption style="text-align:left;font-weight:bold;margin-bottom:6px">` +
      `표. 사전·사후 대응표본 t검정 결과 (N = ${overall?.result?.n ?? rows[0]?.n ?? 0})</caption>` +
      `<thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
    const text = [head.join("\t"), ...body.map((r) => r.join("\t"))].join("\n");
    return { html, text };
  }

  async function copy(kind: "table" | "text") {
    try {
      if (kind === "table") {
        const { html, text } = tableHtmlAndText();
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/html": new Blob([html], { type: "text/html" }),
              "text/plain": new Blob([text], { type: "text/plain" }),
            }),
          ]);
        } catch {
          await navigator.clipboard.writeText(text);
        }
      } else {
        await navigator.clipboard.writeText(narrative);
      }
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* noop */
    }
  }

  // 객관식 분포(다운로드 문서용)
  function choiceDist(it: SurveyItem) {
    const dist = (m: Map<string, Submission>) => {
      const c: Record<string, number> = {};
      let total = 0;
      for (const s of m.values()) {
        const v = s.surveyAnswers?.[it.id];
        if (typeof v === "string" && v) {
          c[v] = (c[v] ?? 0) + 1;
          total++;
        }
      }
      return { c, total };
    };
    return { pd: dist(preMap), od: dist(postMap) };
  }

  // .docx body XML 생성 — Pages·Word·한글(HWP)에서 표·서식 그대로 열림(편집 가능)
  function buildDocxBody(): string {
    const n = overall?.result?.n ?? rows[0]?.n ?? 0;
    const today = new Date().toLocaleDateString("ko-KR");
    // 8열 너비(dxa, 합 ≈ 9360)
    const W = [3360, 960, 960, 620, 640, 460, 740, 620];
    const head = ["문항", "사전 M(SD)", "사후 M(SD)", "Δ", "t", "df", "p", "d"];

    const tRows: string[] = [
      wRow(head.map((h) => ({ text: h, bold: true })), W),
    ];
    rows.forEach((r) => {
      const res = r.result;
      const star = res
        ? res.p < 0.001
          ? "***"
          : res.p < 0.01
            ? "**"
            : res.p < 0.05
              ? "*"
              : ""
        : "";
      tRows.push(
        wRow(
          [
            { text: `Q${r.qNo}. ${r.prompt}` },
            { text: `${f2(r.mPre)} (${f2(r.sdPre)})` },
            { text: `${f2(r.mPost)} (${f2(r.sdPost)})` },
            { text: res ? dStr(res.meanDiff) : "-" },
            { text: res ? f2(res.t) : "-" },
            { text: res ? String(res.df) : "-" },
            { text: res ? apaP(res.p) + star : "-" },
            { text: res ? f2(res.d) : "-" },
          ],
          W
        )
      );
    });
    if (overall?.result) {
      const o = overall.result;
      tRows.push(
        wRow(
          [
            { text: "전체 척도 평균", bold: true },
            { text: `${f2(overall.mPre)} (${f2(overall.sdPre)})`, bold: true },
            { text: `${f2(overall.mPost)} (${f2(overall.sdPost)})`, bold: true },
            { text: dStr(o.meanDiff), bold: true },
            { text: f2(o.t), bold: true },
            { text: String(o.df), bold: true },
            { text: apaP(o.p), bold: true },
            { text: f2(o.d), bold: true },
          ],
          W
        )
      );
    }

    // 객관식 분포표(있으면)
    const CW = [4600, 2380, 2380];
    const choiceBlocks = choiceItems
      .map((it) => {
        const { pd, od } = choiceDist(it);
        const cr: string[] = [
          wRow(
            [
              { text: "선택지", bold: true },
              { text: "사전 n(%)", bold: true },
              { text: "사후 n(%)", bold: true },
            ],
            CW
          ),
        ];
        (it.options ?? []).forEach((o, oi) => {
          const pc = pd.c[o] ?? 0;
          const oc = od.c[o] ?? 0;
          const pp = pd.total ? Math.round((pc / pd.total) * 100) : 0;
          const op = od.total ? Math.round((oc / od.total) * 100) : 0;
          cr.push(
            wRow(
              [
                { text: o || `선택지 ${oi + 1}` },
                { text: `${pc} (${pp}%)` },
                { text: `${oc} (${op}%)` },
              ],
              CW
            )
          );
        });
        return (
          wPara(`[객관식] ${it.prompt || "(문항)"}`, {
            bold: true,
            spaceBefore: 160,
          }) +
          wTable(cr, CW) +
          wPara("")
        );
      })
      .join("");

    const narr = narrative
      ? wPara("해석", { bold: true, size: 24, spaceBefore: 200 }) +
        wPara(narrative, { size: 22 }) +
        wPara("")
      : "";

    return (
      wPara("연구 결과 요약 — 사전·사후 검증", { bold: true, size: 30 }) +
      wPara(`대응표본 t검정 · 생성일 ${today} · N = ${n}`, {
        size: 16,
        color: "595959",
      }) +
      wTable(tRows, W) +
      wPara("* p<.05, ** p<.01, *** p<.001.  Δ=사후−사전, d=Cohen's d.", {
        size: 16,
        color: "595959",
        spaceBefore: 80,
      }) +
      wPara("") +
      narr +
      choiceBlocks
    );
  }

  function download() {
    downloadDocx("사전사후_검증결과.docx", buildDocxBody());
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-bold">
          <Icon
            name="description"
            size={16}
            className="text-[var(--md-sys-color-primary)]"
          />
          연구 결과 요약 (논문·대회용)
        </h4>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => copy("table")}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105"
          >
            <Icon name={copied === "table" ? "check" : "table_view"} size={14} />
            {copied === "table" ? "복사됨" : "표 복사"}
          </button>
          <button
            type="button"
            onClick={() => copy("text")}
            disabled={!narrative}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-semibold text-[var(--md-sys-color-on-surface)] transition hover:bg-black/5 disabled:opacity-40"
          >
            <Icon name={copied === "text" ? "check" : "content_copy"} size={14} />
            {copied === "text" ? "복사됨" : "해석 복사"}
          </button>
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-semibold text-[var(--md-sys-color-on-surface)] transition hover:bg-black/5"
            title="표·해석·분포를 서식 그대로 담은 문서(.docx)로 내려받기 — 한글(HWP)·워드·Pages에서 바로 열림"
          >
            <Icon name="download" size={14} />
            다운로드 (.docx)
          </button>
        </div>
      </div>

      {/* APA식 종합 요약표 */}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <p className="mb-1.5 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            표. 사전·사후 대응표본 t검정 결과 (N = {overall?.result?.n ?? rows[0]?.n ?? 0})
          </p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-y-2 border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)]">
                <th className="py-1.5 pr-2 text-left font-semibold">문항</th>
                <th className="px-2 py-1.5 text-center font-semibold">사전 M(SD)</th>
                <th className="px-2 py-1.5 text-center font-semibold">사후 M(SD)</th>
                <th className="px-2 py-1.5 text-center font-semibold">Δ</th>
                <th className="px-2 py-1.5 text-center font-semibold">t</th>
                <th className="px-2 py-1.5 text-center font-semibold">df</th>
                <th className="px-2 py-1.5 text-center font-semibold">p</th>
                <th className="px-2 py-1.5 text-center font-semibold">d</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.qNo}
                  className="border-b border-[var(--md-sys-color-outline-variant)]/60"
                >
                  <td className="py-1.5 pr-2">
                    <span className="font-semibold text-[var(--md-sys-color-primary)]">
                      Q{r.qNo}.
                    </span>{" "}
                    {r.prompt}
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">
                    {f2(r.mPre)} ({f2(r.sdPre)})
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums font-semibold">
                    {f2(r.mPost)} ({f2(r.sdPost)})
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center tabular-nums font-semibold ${
                      r.result && r.result.meanDiff > 0
                        ? "text-[var(--md-sys-color-tertiary)]"
                        : r.result && r.result.meanDiff < 0
                          ? "text-[var(--md-sys-color-error)]"
                          : ""
                    }`}
                  >
                    {r.result ? dStr(r.result.meanDiff) : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">
                    {r.result ? f2(r.result.t) : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">
                    {r.result ? r.result.df : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">
                    {r.result ? (
                      <span
                        className={
                          r.result.p < 0.05
                            ? "font-semibold text-[var(--md-sys-color-primary)]"
                            : ""
                        }
                      >
                        {apaP(r.result.p)}
                        {r.result.p < 0.001 ? "***" : r.result.p < 0.01 ? "**" : r.result.p < 0.05 ? "*" : ""}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">
                    {r.result ? f2(r.result.d) : "-"}
                  </td>
                </tr>
              ))}
              {overall?.result && (
                <tr className="border-y-2 border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-high)] font-semibold">
                  <td className="py-1.5 pr-2">전체 척도 평균</td>
                  <td className="px-2 py-1.5 text-center tabular-nums">
                    {f2(overall.mPre)} ({f2(overall.sdPre)})
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">
                    {f2(overall.mPost)} ({f2(overall.sdPost)})
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums text-[var(--md-sys-color-tertiary)]">
                    {dStr(overall.result.meanDiff)}
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">
                    {f2(overall.result.t)}
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">
                    {overall.result.df}
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums text-[var(--md-sys-color-primary)]">
                    {apaP(overall.result.p)}
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">
                    {f2(overall.result.d)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-1 text-[var(--md-sys-color-on-surface-variant)] text-xs">
            * p&lt;.05, ** p&lt;.01, *** p&lt;.001. Δ=사후−사전, d=Cohen&apos;s d.
          </p>
        </div>
      )}

      {/* 자동 해석 내러티브 */}
      {narrative && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            해석
          </p>
          <p className="rounded-xl bg-[var(--md-sys-color-surface)] px-3 py-2.5 text-sm leading-relaxed">
            {narrative}
          </p>
        </div>
      )}

      {/* 객관식 사전/사후 분포표 */}
      {choiceItems.length > 0 && (
        <div className="flex flex-col gap-3">
          {choiceItems.map((it) => (
            <ChoiceDistTable
              key={it.id}
              item={it}
              preMap={preMap}
              postMap={postMap}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** 객관식 문항의 사전·사후 선택 분포 교차표 */
function ChoiceDistTable({
  item,
  preMap,
  postMap,
}: {
  item: SurveyItem;
  preMap: Map<string, Submission>;
  postMap: Map<string, Submission>;
}) {
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
      <p className="mb-1 text-xs font-medium">
        <span className="font-semibold text-[var(--md-sys-color-primary)]">
          [객관식]
        </span>{" "}
        {item.prompt || "(문항)"}
      </p>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--md-sys-color-outline)] text-left text-[var(--md-sys-color-on-surface-variant)]">
            <th className="py-1 pr-2 font-semibold">선택지</th>
            <th className="px-2 py-1 text-center font-semibold">사전 n(%)</th>
            <th className="px-2 py-1 text-center font-semibold">사후 n(%)</th>
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
                className="border-b border-[var(--md-sys-color-outline-variant)]/50"
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

