"use client";

import type { ReactNode } from "react";
import { minutesLabel, PUYO_MINUTE_OPTIONS, PUYO_XP_OPTIONS, type PuyoRules } from "@/lib/puyo-rules";
import { PuyoRulebook } from "./PuyoRulebook";

/** 게임 열기(학급 게임 모달) — 교사가 정하는 뿌요뿌요 규칙. 아래에 이 규칙대로의 진행 흐름을 바로 보여 준다. */
export function PuyoRulesForm({ value, onChange }: { value: PuyoRules; onChange: (next: PuyoRules) => void }) {
  const set = <K extends keyof PuyoRules>(k: K, v: PuyoRules[K]) => onChange({ ...value, [k]: v });
  const minutes = Math.round(value.durationSec / 60);
  return <div className="grid grid-cols-1 gap-5 @3xl:grid-cols-[minmax(300px,1fr)_minmax(340px,1.15fr)] @3xl:items-start">
    <div className="flex min-w-0 flex-col gap-4">
    <div className="flex justify-center gap-2 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-3">
      {["gengar", "snorlax", "charmander", "squirtle"].map(name => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={name} src={`/puyo/assets/${name}.svg`} alt="" width={60} height={60} />
      ))}
    </div>

    <Field title="경기 시간" hint={`한 판 ${minutesLabel(value.durationSec)}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {PUYO_MINUTE_OPTIONS.map(m => <Chip key={m} on={minutes === m && value.durationSec % 60 === 0} onClick={() => set("durationSec", m * 60)}>{m}분</Chip>)}
        <label className="flex items-center gap-1 text-sm">
          <input aria-label="경기 시간(분) 직접 입력" type="number" min={1} max={15} value={minutes} onChange={e => set("durationSec", Math.max(1, Math.min(15, Number(e.target.value) || 1)) * 60)} className="m3-field w-20" />분
        </label>
      </div>
    </Field>

    <Field title="1:1 짝 정하기">
      <Segment value={value.pairing} onChange={v => set("pairing", v)} options={[["random", "무작위", "짝은 무작위로, 다시 섞기만"], ["manual", "선생님이 직접", "무작위로 만든 뒤 자리 바꾸기"]]} />
    </Field>

    <Field title="참가 학생이 홀수일 때">
      <Segment value={value.odd} onChange={v => set("odd", v)} options={[["teacher", "선생님이 함께 대결", "선생님 승리는 보상 없음"], ["rest", "한 명은 쉬기", "쉰 친구는 다음 판 먼저"]]} />
    </Field>

    <Field title="이긴 학생 보상">
      <div className="flex flex-wrap gap-1.5 @md:flex-nowrap">
        {PUYO_XP_OPTIONS.map(x => <Chip key={x} on={value.winXp === x} onClick={() => set("winXp", x)}>{x === 0 ? "없음" : `+${x} XP`}</Chip>)}
      </div>
    </Field>

    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">프로젝트·차시 연결은 선택 사항이에요. 연결하면 게임 이력에서 함께 찾을 수 있어요.</p>
    </div>
    <div className="min-w-0 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-4 @3xl:sticky @3xl:top-0">
      <p className="mb-2 text-sm font-bold text-[var(--md-sys-color-on-surface)]">이 규칙으로 이렇게 진행돼요</p>
      <PuyoRulebook rules={value} current="open" compact />
    </div>
  </div>;
}

function Field({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <section className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">{title}</h3>
      {hint && <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{hint}</span>}
    </div>
    {children}
  </section>;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={on}
    className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-bold transition ${on ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]" : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]"}`}>
    {children}
  </button>;
}

function Segment<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string, string][] }) {
  return <div className="grid grid-cols-2 gap-1.5" role="radiogroup">
    {options.map(([k, label, sub]) => <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
      className={`flex flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left transition ${value === k ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]" : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]"}`}>
      <span className="whitespace-nowrap text-sm font-bold">{label}</span>
      <span className={`text-xs ${value === k ? "opacity-90" : "text-[var(--md-sys-color-on-surface-variant)]"}`}>{sub}</span>
    </button>)}
  </div>;
}
