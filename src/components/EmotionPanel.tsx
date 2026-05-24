"use client";

import type { Ontology, OntologyNode } from "@/lib/lessons";

/** 학생 응답에서 추출된 감정어(type==='emotion')를 감정별로 모아보기 */
export function EmotionPanel({
  data,
  names,
}: {
  data: Ontology;
  names?: Record<string, string>;
}) {
  const emo = data.nodes.filter((n) => n.type === "emotion");
  if (emo.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-black/40">
        추출된 감정어가 없습니다. 질문을 다시 분석하면 학생 응답에서 감정
        표현이 수집됩니다.
      </p>
    );
  }
  const groups: {
    key: OntologyNode["sentiment"];
    label: string;
    cls: string;
  }[] = [
    {
      key: "positive",
      label: "긍정",
      cls: "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]",
    },
    {
      key: "neutral",
      label: "중립",
      cls: "bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]",
    },
    {
      key: "negative",
      label: "부정",
      cls: "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]",
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const items = emo
          .filter((n) => n.sentiment === g.key)
          .sort((a, b) => (b.sourceCount ?? 0) - (a.sourceCount ?? 0));
        if (items.length === 0) return null;
        return (
          <div key={g.key}>
            <p className="mb-2 text-xs font-semibold text-black/55 dark:text-white/55">
              {g.label} · {items.length}개
            </p>
            <div className="flex flex-wrap gap-2">
              {items.map((n) => (
                <span
                  key={n.id}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${g.cls}`}
                  title={(n.sources ?? [])
                    .map((s) => names?.[s] ?? s)
                    .join(", ")}
                >
                  {n.label}
                  {(n.sourceCount ?? 0) > 0 && (
                    <span className="rounded-full bg-white/70 px-1.5 text-xs font-bold">
                      {n.sourceCount}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
