"use client";

import { GlassButton } from "./glass-surface";
import { useEffect, useRef, useState } from "react";
import { planDemo } from "../lib/agent/demo";
import { parseBrief, parseDesignExtras, type AgentAssetNeed, type LessonBrief } from "../lib/agent/design";
import { applyOps, type MapOp } from "../lib/world/ops";
import { probeMapScript } from "../lib/render/script-probe";
import type { MapDoc } from "../lib/world/types";
import { api } from "./workshop-api";
import { useClassroom } from "./classroom-context";
import { LessonEvidencePicker, LessonReviewView } from "./lesson-evidence";
import { briefForEvidence, parseLessonEvidence, type LessonEvidence, type LessonReview } from "../lib/agent/lesson-evidence";
import AgentAssets, { type AgentAssetTask } from "./agent-assets";

export type ProviderId = "openai" | "anthropic" | "demo";
interface ProviderStatus { configured: boolean; model: string; reason?: string }
export interface AgentProposal {
  ops: MapOp[]; summary: string; provider: ProviderId; model: string; latencyMs: number;
  repaired?: boolean; baseSignature?: string;
}
interface Entry {
  role: "user" | "agent"; text: string; meta?: string[]; error?: boolean;
  questions?: string[]; assets?: AgentAssetTask[]; brief?: LessonBrief; evidence?: LessonEvidence; lessonReview?: LessonReview;
}
const EMPTY_BRIEF: LessonBrief = { participants: 28, minutes: 40, subject: "", flow: "", details: "", allowExpand: true };

export function readAgentLogs(key: string): Record<string, Entry[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).slice(-30).map(([id, entries]) => [id,
      Array.isArray(entries) ? entries.slice(-60).filter(e => e && ["user", "agent"].includes(e.role) && typeof e.text === "string").map(e => {
        const extras = parseDesignExtras(e);
        const assets = extras?.assets?.map((a, i) => ({ ...a, key: String(e.assets[i].key || ""),
          ...(typeof e.assets[i].requestId === "string" ? { requestId: e.assets[i].requestId } : {}),
          ...(typeof e.assets[i].classId === "string" ? { classId: e.assets[i].classId } : {}),
          ...(typeof e.assets[i].assetId === "string" ? { assetId: e.assets[i].assetId } : {}),
        })).filter(a => /^[A-Za-z0-9_-]{8,80}$/.test(a.key));
        return { role: e.role, text: e.text.slice(0, 3000), questions: extras?.questions, assets, lessonReview:extras?.lessonReview, ...(parseLessonEvidence(e.evidence) ? {evidence:parseLessonEvidence(e.evidence)!} : {}), ...(parseBrief(e.brief) ? { brief: parseBrief(e.brief)! } : {}) };
      }) : [],
    ]));
  } catch { return {}; }
}

export default function AgentPanel({ doc, disabled, onProposal, log, setLog }: {
  doc: MapDoc; disabled: boolean; onProposal: (p: AgentProposal) => string | null;
  log: Entry[]; setLog: (fn: (l: Entry[]) => Entry[]) => void;
}) {
  const classroom = useClassroom();
  const evidence = [...log].reverse().find(e=>e.evidence)?.evidence;
  const [provider, setProvider] = useState<ProviderId | null>(null);
  const [statusError, setStatusError] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [designOpen, setDesignOpen] = useState(!!evidence && !log.some(e=>e.role === "agent"));
  const latestBrief = [...log].reverse().find(e => e.brief)?.brief;
  const [brief, setBrief] = useState<LessonBrief>(latestBrief || EMPTY_BRIEF);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const latest = log.at(-1);
  const questions = latest?.role === "agent" ? latest.questions : undefined;
  useEffect(() => {
    let live = true;
    api<{ providers: Record<string, ProviderStatus> }>("/api/jamworld/agent/status")
      .then(s => { if (live) setProvider(s.providers.openai?.configured ? "openai" : s.providers.anthropic?.configured ? "anthropic" : "demo"); })
      .catch(() => { if (live) { setStatusError("도우미 연결 상태를 확인하지 못했어요. 탭을 다시 열어 주세요."); setProvider("demo"); } });
    return () => { live = false; abortRef.current?.abort(); };
  }, [doc.id]);
  useEffect(() => {
    const container=logRef.current;if(!container)return;
    const reviews=container.querySelectorAll<HTMLElement>(".lesson-review"), review=reviews[reviews.length-1];
    const top=log.at(-1)?.lessonReview && review ? review.getBoundingClientRect().top-container.getBoundingClientRect().top+container.scrollTop : container.scrollHeight;
    container.scrollTo({top,behavior:"smooth"});
  }, [log, busy]);

  async function send(request = text.trim(), design = latestBrief) {
    if (!request || sendingRef.current || disabled || !provider) return;
    if (request.startsWith("/grill-me")) {
      setBrief(b => ({ ...b, subject: request.replace(/^\/grill-me\s*/, "") || b.subject }));
      setDesignOpen(true); setText(""); return;
    }
    if (provider === "demo" && design) {
      setLog(l => [...l, { role: "agent", text: "수업 설계는 AI 도우미 연결이 필요해요. 공방에 로그인한 뒤 다시 열어 주세요. 지금은 간단한 배치 예시만 사용할 수 있어요.", error: true }]);
      return;
    }
    const history = log.slice(-12).map(e => ({ role: e.role === "agent" ? "assistant" : "user", text: [e.text, ...(e.questions || [])].join("\n").slice(0, 3000) }));
    setText(""); setAnswers({});
    setLog(l => [...l, { role: "user", text: request, ...(design ? { brief: design } : {}) }]);
    if (provider === "demo") {
      const plan = planDemo(doc, request);
      const err = plan.ops.length ? onProposal({ ...plan, provider: "demo", model: "rule-based", latencyMs: 0 }) : null;
      setLog(l => [...l, { role: "agent", text: err ? `${plan.summary}\n적용할 수 없어요: ${err}` : plan.summary, error: !!err, meta: plan.ops.length && !err ? ["미리보기 중"] : undefined }]);
      return;
    }
    const ctrl = new AbortController(); abortRef.current = ctrl;
    sendingRef.current = true; setBusy(true);
    try {
      let proposal = await api<AgentProposal & { questions?: string[]; assets?: AgentAssetNeed[]; lessonReview?: LessonReview }>("/api/jamworld/agent", {
        method: "POST", json: { provider, prompt: request, doc, history, ...(design ? { brief: design } : {}), ...(evidence ? {lessonEvidence:evidence} : {}) }, signal: ctrl.signal,
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        if (ctrl.signal.aborted) return;
        if (!proposal.ops.some(op => op.op === "setScript")) break;
        const check = applyOps(doc, proposal.ops, { strict: true, maxOps: 300 });
        if (!check.ok) break; // Editor reports map validation errors below.
        const diagnostic = await probeMapScript(check.doc, ctrl.signal);
        if (!diagnostic || ctrl.signal.aborted) break;
        if (attempt) throw Error(`코드를 실행해 보니 문제가 남아 있어 적용하지 않았어요: ${diagnostic}`);
        proposal = await api<AgentProposal & { questions?: string[]; assets?: AgentAssetNeed[] }>("/api/jamworld/agent", {
          method: "POST", signal: ctrl.signal,
          json: { provider, doc, ...(design ? { brief: design } : {}), ...(evidence ? {lessonEvidence:evidence} : {}), history,
            prompt: `${request}\n방금 만든 코드가 격리된 실행 검사에서 실패했습니다: ${diagnostic}\n기존 맵을 기준으로 모든 요청을 유지하면서 코드를 고쳐 다시 제출하세요.`,
            failedProposal: proposal,
          },
        });
      }
      if (ctrl.signal.aborted) return;
      const err = proposal.ops.length ? onProposal({ ...proposal, baseSignature: JSON.stringify(doc) }) : null;
      setLog(l => [...l, {
        role: "agent", text: err ? `${proposal.summary}\n적용할 수 없어요: ${err}` : proposal.summary || "변경안을 준비했어요.", error: !!err,
        questions: proposal.questions, lessonReview:proposal.lessonReview,
        // Invalid map proposals do not create misleading image tasks.
        assets: !err ? proposal.assets?.map(a => ({ ...a, key: crypto.randomUUID() })) : undefined,
        meta: proposal.ops.length && !err ? [`작업 ${proposal.ops.length}개`, "미리보기 중"] : undefined,
      }]);
    } catch (e) {
      if (!ctrl.signal.aborted) setLog(l => [...l, { role: "agent", text: e instanceof Error ? e.message : "도우미에 연결하지 못했어요.", error: true }]);
    } finally {
      sendingRef.current = false; setBusy(false); abortRef.current = null;
    }
  }
  const field = (key: "subject" | "flow" | "details", label: string, placeholder: string, limit: number, required = true) => <label className="field">
    <span>{label}</span><textarea aria-label={label} className="textarea" value={brief[key]} placeholder={placeholder} required={required} maxLength={limit} onChange={e => setBrief(b => ({ ...b, [key]: e.target.value }))} />
  </label>;
  return <>
    <div className="agent-design-toolbar"><GlassButton className="btn sm" disabled={disabled || busy} onClick={() => setDesignOpen(v => !v)}>{designOpen ? "설계 질문 접기" : latestBrief ? "수업 조건 바꾸기" : "수업에 맞춰 만들기"}</GlassButton></div>
    <div className="tab-body" ref={logRef}>
      {statusError && <p role="status">{statusError}</p>}
      {classroom?.me?.role === "teacher" && <LessonEvidencePicker evidence={evidence} disabled={disabled || busy} onChange={packet=>{
        const importedBrief = packet ? briefForEvidence(packet) : undefined;
        setLog(l=>[...l.map(e=>({...e,evidence:undefined,lessonReview:undefined})),{role:"user",text:packet?`수업 기록 불러옴: ${packet.lesson.title || "이전 수업"}`:"수업 기록 연결을 해제했어요.",...(packet?{evidence:packet,brief:importedBrief}:{})}]);
        if(importedBrief){setBrief(importedBrief);setDesignOpen(true);}
      }} />}
      {designOpen && <form className="agent-brief" onSubmit={e => { e.preventDefault(); setDesignOpen(false); void send(`${evidence?"불러온 수업 기록을 분석하고 관찰 사실·확인이 필요한 해석·다음 수업 목표와 활동 순서를 lessonReview에 정리한 뒤, 이에 맞는 맵을 만들어 주세요.":"이 수업에 맞는 맵을 만들어 주세요."} ${brief.participants}명, ${brief.minutes}분. ${brief.subject}\n흐름: ${brief.flow}\n추가: ${brief.details || "없음"}\n필요한 내용이 더 있으면 먼저 질문해 주세요.`, brief); }}>
        <h3>어떤 수업을 만들까요?</h3>
        <div className="ws-grid2">
          <label className="field"><span>학생 수</span><input className="input" type="number" min="1" max="100" required value={brief.participants} onChange={e => setBrief(b => ({ ...b, participants: Number(e.target.value) }))} /></label>
          <label className="field"><span>수업 시간 (분)</span><input className="input" type="number" min="5" max="240" step="5" required value={brief.minutes} onChange={e => setBrief(b => ({ ...b, minutes: Number(e.target.value) }))} /></label>
        </div>
        {field("subject", "학년·과목·수업 목표", "예) 초등 4학년 과학, 물의 순환 이해하기", 300)}
        {field("flow", "활동 순서와 모둠", "예) 도입 → 4명씩 탐구 → 모둠 발표 → 퀴즈", 800)}
        {field("details", "더 필요한 것 (선택)", "예) 비 오는 구역, 안내 캐릭터, 특정 장소에서 시야 좁아지기", 800, false)}
        <label className="row"><input type="checkbox" checked={brief.allowExpand} onChange={e => setBrief(b => ({ ...b, allowExpand: e.target.checked }))} />공간이 부족하면 맵 넓히기</label>
        <GlassButton className="btn primary" type="submit" disabled={busy || disabled || !provider}>{evidence?"분석하고 다음 수업 설계":"수업 설계 시작"}</GlassButton>
      </form>}
      <div className="agent-log">
        {!log.length && !designOpen && <div className="msg agent">수업 전체를 만들려면 ‘수업에 맞춰 만들기’를 눌러 주세요. 인원과 활동 순서를 듣고 필요한 내용을 더 물어볼게요.<br /><br />“맵을 60×50으로 넓혀 줘”, “연못 옆에 쉼터를 만들어 줘”처럼 바로 수정할 수도 있어요.</div>}
        {log.map((entry, i) => <div key={i} className={`msg ${entry.role} ${entry.error ? "agent-error" : ""}`}>
          {entry.text}
          {entry.questions && <ol>{entry.questions.map(q => <li key={q}>{q}</li>)}</ol>}
          {entry.lessonReview && <LessonReviewView review={entry.lessonReview} evidence={evidence} />}
          {entry.meta && <div className="meta">{entry.meta.map(m => <span key={m} className="chip teal">{m}</span>)}</div>}
          {entry.assets?.length ? <AgentAssets tasks={entry.assets} disabled={disabled || busy} onProposal={onProposal} onChange={(key, patch) => setLog(l => l.map((e, at) => at === i ? { ...e, assets: e.assets?.map(a => a.key === key ? { ...a, ...patch } : a) } : e))} /> : null}
        </div>)}
        {questions?.length && <form className="agent-questions" onSubmit={e => { e.preventDefault(); void send(questions.map((q, i) => `${q}\n답: ${answers[i]}`).join("\n\n")); }}>
          {questions.map((q, i) => <label className="field" key={q}><span>{q}</span><textarea aria-label={q} className="textarea" required maxLength={300} value={answers[i] || ""} onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))} /></label>)}
          <GlassButton className="btn primary sm" type="submit" disabled={busy || disabled}>답변 보내기</GlassButton>
          <GlassButton className="btn sm" type="button" disabled={busy || disabled} onClick={() => void send("답하지 않은 부분은 수업 목표에 맞게 추천해서 제작해 주세요.")}>나머지는 추천해 주세요</GlassButton>
        </form>}
        {busy && <div className="msg agent" role="status">맵과 동작을 만들고 확인하고 있어요…</div>}
      </div>
    </div>
    <div className="agent-composer">
      <textarea className="textarea" aria-label="맵 도우미 요청" placeholder="추가할 내용이나 바꾸고 싶은 것을 말해 주세요" value={text} maxLength={1000} disabled={disabled || busy} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(); }} />
      {busy ? <GlassButton className="btn" onClick={() => { abortRef.current?.abort(); setLog(l => [...l, { role: "agent", text: "요청을 취소했어요." }]); }}>취소</GlassButton>
        : <GlassButton className="btn primary" disabled={disabled || !text.trim() || !provider} onClick={() => void send()}>도우미에게 부탁하기</GlassButton>}
      {disabled && <p className="ws-note">미리보기를 적용하거나 취소한 뒤 다음 요청을 보내세요.</p>}
      {provider === "demo" && <p className="ws-note">지금은 간단한 배치 예시만 사용할 수 있어요.</p>}
    </div>
  </>;
}
export type { Entry as AgentLogEntry };
