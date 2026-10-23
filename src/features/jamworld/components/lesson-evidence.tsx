"use client";
import { useRef, useState } from "react";
import { GlassButton } from "./glass-surface";
import { evidenceStats, parseLessonEvidence, type LessonEvidence, type LessonFinding, type LessonReview } from "../lib/agent/lesson-evidence";

export function LessonEvidencePicker({ evidence, disabled, onChange }: { evidence?: LessonEvidence; disabled: boolean; onChange:(evidence?:LessonEvidence)=>void }) {
  const input = useRef<HTMLInputElement>(null), [error,setError] = useState("");
  const stats = evidence ? evidenceStats(evidence) : null;
  return <section className="lesson-evidence-picker">
    <input hidden ref={input} type="file" accept=".json,application/json" aria-label="러닝크루 수업 기록 파일" onChange={async event => {
      const file=event.target.files?.[0];event.target.value="";if(!file)return;
      setError("");
      try { if(file.size > 250000)throw Error("수업 기록 파일은 250KB 이하여야 해요."); const parsed=parseLessonEvidence(JSON.parse(await file.text()));if(!parsed)throw Error("러닝크루 CLI에서 만든 수업 기록 JSON 파일을 선택해 주세요.");onChange(parsed); }
      catch(e){setError(e instanceof Error?e.message:"기록을 읽지 못했어요.");}
    }} />
    <GlassButton className="btn sm" disabled={disabled} onClick={()=>input.current?.click()}>수업 기록 불러오기</GlassButton>
    {evidence && stats ? <div className="lesson-evidence-summary">
      <b>{evidence.lesson.title || "수업 기록"}</b>
      <p>{evidence.lesson.date} · 명단 {stats.roster}명 · 포함된 응답자 {stats.respondents}명 · 응답 {stats.records}/{stats.totalRecords}개</p>
      {stats.sampled && <p>활동별로 나눈 표본을 분석해요. 전체 학생의 응답으로 일반화하지 않아요.</p>}
      {stats.quizzes.filter(q=>q.graded>0).map(q=><p key={q.activityId}>{q.title}: 포함된 채점 응답 {q.graded}개 중 정답 {q.correct}개</p>)}
      <details><summary>분석할 응답 확인</summary>{evidence.records.map(r=><blockquote key={r.id}><b>{r.id} · {r.student}</b><p>{r.text}</p></blockquote>)}{!evidence.records.length&&<p>제출된 글이 없어요. 수업 목표를 중심으로 설계해요.</p>}</details>
      <p className="ws-note">로컬 파일의 수집 시점 기록을 사용해요. 이 맵의 대화와 함께 브라우저에 저장되며, 분석 버튼을 누르면 AI 도우미에 전달돼요.</p>
      <GlassButton className="btn sm" disabled={disabled} onClick={()=>onChange()}>기록 연결 해제</GlassButton>
    </div> : <p className="ws-note">CLI의 lesson prepare로 만든 파일을 열면 학생 응답을 바탕으로 다음 수업과 맵을 설계해요.</p>}
    {error&&<p role="alert" className="issue err">{error}</p>}
  </section>;
}
export function LessonReviewView({ review, evidence }: { review:LessonReview; evidence?:LessonEvidence }) {
  const finding=(row:LessonFinding,index:number)=><li key={index}>{row.text}<details><summary>근거 보기 ({row.evidenceIds.join(", ")})</summary>{row.evidenceIds.map(id=>{
    const source=evidence?.records.find(r=>r.id===id);
    return <blockquote key={id}>{id==="meta"?"위 수업 기록의 집계와 활동 정보":source?<><b>{source.id} · {source.student}</b><p>{source.text}</p></>:"원본 기록을 다시 불러오면 근거를 볼 수 있어요."}</blockquote>;
  })}</details></li>;
  return <section className="lesson-review" aria-label="수업 분석과 다음 수업 제안">
    <h3>수업 분석과 다음 수업</h3><p className="ws-note">AI가 만든 초안이에요. 관찰 사실과 해석을 구분하고 근거를 확인해 주세요.</p>
    <h4>기록에서 확인한 사실</h4>{review.facts.length?<ul>{review.facts.map(finding)}</ul>:<p>확인할 수 있는 사실이 부족해요.</p>}
    <h4>더 확인할 해석</h4>{review.hypotheses.length?<ul>{review.hypotheses.map(finding)}</ul>:<p>기록만으로 추가 해석을 단정하지 않았어요.</p>}
    <h4>다음 수업 목표</h4><ul>{review.goals.map(g=><li key={g}>{g}</li>)}</ul>
    <ol className="lesson-sequence">{review.sequence.map((step,index)=><li key={index}><b>{step.title} · {step.minutes}분</b><p>{step.purpose}</p><span className="chip">{step.zone}</span><p>확인: {step.check}</p></li>)}</ol>
    {!!review.uncertainties.length&&<details open><summary>교사가 확인할 점</summary><ul>{review.uncertainties.map(u=><li key={u}>{u}</li>)}</ul></details>}
  </section>;
}
