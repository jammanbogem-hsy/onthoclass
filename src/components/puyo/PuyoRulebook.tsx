"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PUYO_HOW_TO, puyoFlow, ruleSummary, type FlowStage, type PuyoRules } from "@/lib/puyo-rules";
import styles from "./PuyoRulebook.module.css";

type Tab = "flow" | "how" | "rules";
const TABS: [Tab, string][] = [["flow", "진행 순서"], ["how", "게임 방법"], ["rules", "이번 판 규칙"]];

/** 규칙 책 — 진행 흐름(대진 생성→결과)·게임 방법·교사가 정한 규칙. current 단계는 강조한다. */
export function PuyoRulebook({ rules, current, initialTab = "flow", compact = false }: { rules: PuyoRules; current?: FlowStage; initialTab?: Tab; compact?: boolean }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const flow = puyoFlow(rules);
  const at = current ? flow.findIndex(s => s.stage === current) : -1;
  return <div className={`${styles.book} ${compact ? styles.compact : ""}`}>
    <div className={styles.tabs} role="tablist" aria-label="뿌요뿌요 규칙">
      {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? styles.tabOn : ""} onClick={() => setTab(k)}>{label}</button>)}
    </div>
    {tab === "flow" && <ol className={styles.flow}>
      {flow.map((s, i) => <li key={s.stage} className={i === at ? styles.now : i < at ? styles.past : ""} aria-current={i === at ? "step" : undefined}>
        <span className={styles.num}>{i + 1}</span>
        <div><div className={styles.head}><strong>{s.title}</strong><span className={styles.who}>{s.who}</span>{i === at && <span className={styles.nowTag}>지금</span>}</div><p>{s.body}</p></div>
      </li>)}
    </ol>}
    {tab === "how" && <ul className={styles.how}>
      {PUYO_HOW_TO.map(h => <li key={h.title}><strong>{h.title}</strong><p>{h.body}</p></li>)}
    </ul>}
    {tab === "rules" && <dl className={styles.rules}>
      {ruleSummary(rules).map(r => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
    </dl>}
  </div>;
}

/** 어디서든 다시 열 수 있는 '규칙 보기' 버튼 + 대화상자(경기 중에도 조작을 막지 않도록 키 입력은 대화상자 안에서만 처리). */
export function PuyoRulesButton({ rules, current, className, label = "규칙 보기" }: { rules: PuyoRules; current?: FlowStage; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  return <>
    <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">{label}</button>
    {open && createPortal(<div className={styles.scrim} onClick={() => setOpen(false)}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="뿌요뿌요 규칙" onClick={e => e.stopPropagation()}>
        <header><h2>뿌요뿌요 규칙</h2><button type="button" onClick={() => setOpen(false)} aria-label="규칙 닫기">닫기</button></header>
        <PuyoRulebook rules={rules} current={current} />
      </div>
    </div>, document.body)}
  </>;
}
