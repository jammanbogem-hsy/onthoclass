"use client";

import { Icon } from "@/components/Icon";
import type { SurveyItem, SurveyItemType } from "@/lib/lessons";

function newId() {
  return "it_" + Math.random().toString(36).slice(2, 9);
}

const TYPE_META: { type: SurveyItemType; label: string; icon: string }[] = [
  { type: "scale", label: "척도", icon: "linear_scale" },
  { type: "choice", label: "객관식", icon: "radio_button_checked" },
  { type: "open", label: "주관식", icon: "notes" },
];

/** 교사용 설문 문항 빌더 — 척도/객관식/주관식 항목 편집.
 *  item.id(변수키)는 전/후 페어링 기준이므로 편집 중 유지된다. */
export function SurveyBuilder({
  items,
  onChange,
  onImport,
}: {
  items: SurveyItem[];
  onChange: (items: SurveyItem[]) => void;
  onImport?: () => void; // '문서에서 문항 가져오기'
}) {
  function add(type: SurveyItemType) {
    onChange([
      ...items,
      {
        id: newId(),
        type,
        prompt: "",
        ...(type === "scale" ? { scaleMax: 5 } : {}),
        ...(type === "choice" ? { options: ["", ""] } : {}),
      },
    ]);
  }
  function patch(i: number, p: Partial<SurveyItem>) {
    onChange(items.map((it, j) => (j === i ? { ...it, ...p } : it)));
  }
  function remove(i: number) {
    onChange(items.filter((_, j) => j !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && (
        <p className="rounded-2xl bg-[var(--md-sys-color-surface-container)] px-4 py-6 text-center text-xs text-black/45">
          검증 문항을 추가하세요. 사전·사후에 같은 문항을 쓰면(복제) 변수키로
          자동 짝지어 효과성(t검정)을 분석합니다.
        </p>
      )}

      {items.map((it, i) => (
        <div
          key={it.id}
          className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-3"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] px-1.5 text-[11px] font-bold text-[var(--md-sys-color-on-primary)]">
              Q{i + 1}
            </span>
            {/* 유형 토글 */}
            <div className="inline-flex overflow-hidden rounded-full border border-[var(--md-sys-color-outline)]">
              {TYPE_META.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() =>
                    patch(i, {
                      type: t.type,
                      ...(t.type === "scale" && !it.scaleMax
                        ? { scaleMax: 5 }
                        : {}),
                      ...(t.type === "choice" && !it.options?.length
                        ? { options: ["", ""] }
                        : {}),
                    })
                  }
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold transition ${
                    it.type === t.type
                      ? "bg-[var(--md-sys-color-primary)] text-white"
                      : "text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
                  }`}
                >
                  <Icon name={t.icon} size={13} />
                  {t.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="rounded p-1 text-black/35 hover:bg-black/5 disabled:opacity-30"
                title="위로"
              >
                <Icon name="arrow_upward" size={14} />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
                className="rounded p-1 text-black/35 hover:bg-black/5 disabled:opacity-30"
                title="아래로"
              >
                <Icon name="arrow_downward" size={14} />
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                className="rounded p-1 text-black/35 hover:bg-[var(--md-sys-color-error-container)] hover:text-[var(--md-sys-color-on-error-container)]"
                title="삭제"
              >
                <Icon name="delete" size={14} />
              </button>
            </div>
          </div>

          <input
            value={it.prompt}
            onChange={(e) => patch(i, { prompt: e.target.value })}
            placeholder="문항 내용 (예: 나는 영어로 자기소개를 할 수 있다)"
            className="m3-field !py-2 !text-sm"
          />

          {it.type === "scale" && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-black/55">
                척도
                <select
                  value={it.scaleMax ?? 5}
                  onChange={(e) =>
                    patch(i, { scaleMax: parseInt(e.target.value, 10) })
                  }
                  className="m3-field !w-auto !py-1 !text-xs"
                >
                  <option value={3}>3점</option>
                  <option value={4}>4점</option>
                  <option value={5}>5점</option>
                  <option value={7}>7점</option>
                </select>
              </label>
              <input
                value={it.scaleLabels?.low ?? ""}
                onChange={(e) =>
                  patch(i, {
                    scaleLabels: {
                      low: e.target.value,
                      high: it.scaleLabels?.high ?? "",
                    },
                  })
                }
                placeholder="낮음 라벨 (예: 전혀 아니다)"
                className="m3-field !w-40 !py-1 !text-xs"
              />
              <input
                value={it.scaleLabels?.high ?? ""}
                onChange={(e) =>
                  patch(i, {
                    scaleLabels: {
                      low: it.scaleLabels?.low ?? "",
                      high: e.target.value,
                    },
                  })
                }
                placeholder="높음 라벨 (예: 매우 그렇다)"
                className="m3-field !w-40 !py-1 !text-xs"
              />
            </div>
          )}

          {it.type === "choice" && (
            <div className="mt-2 flex flex-col gap-1.5">
              {(it.options ?? []).map((opt, oi) => (
                <div key={oi} className="flex items-center gap-1.5">
                  <span className="text-xs text-black/35">{oi + 1}.</span>
                  <input
                    value={opt}
                    onChange={(e) =>
                      patch(i, {
                        options: (it.options ?? []).map((o, k) =>
                          k === oi ? e.target.value : o
                        ),
                      })
                    }
                    placeholder={`선택지 ${oi + 1}`}
                    className="m3-field !py-1 !text-xs"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      patch(i, {
                        options: (it.options ?? []).filter((_, k) => k !== oi),
                      })
                    }
                    className="rounded p-1 text-black/30 hover:text-rose-500"
                  >
                    <Icon name="close" size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  patch(i, { options: [...(it.options ?? []), ""] })
                }
                className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full border border-dashed border-[var(--md-sys-color-outline)] px-2.5 py-1 text-[11px] text-[var(--md-sys-color-primary)]"
              >
                <Icon name="add" size={13} />
                선택지 추가
              </button>
            </div>
          )}

          {it.type === "open" && (
            <p className="mt-2 text-[11px] text-black/40">
              학생이 자유롭게 서술합니다. (정량 비교 대신 응답 모음으로 제공)
            </p>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        {TYPE_META.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => add(t.type)}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
          >
            <Icon name={t.icon} size={14} />
            {t.label} 추가
          </button>
        ))}
        {onImport && (
          <button
            type="button"
            onClick={onImport}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline)] px-3 py-1.5 text-xs font-medium text-[var(--md-sys-color-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
            title="PDF·이미지·문서에서 문항 자동 추출"
          >
            <Icon name="upload_file" size={14} />
            문서에서 문항 가져오기
          </button>
        )}
      </div>
    </div>
  );
}
