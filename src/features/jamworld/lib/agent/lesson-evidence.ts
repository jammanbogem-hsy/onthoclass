export interface EvidenceActivity { id: string; title: string; kind: string; prompt: string; options: string[]; answerIndex: number }
export interface EvidenceRecord { id: string; activityId: string; student: string; text: string; selectedIndex?: number; correct?: boolean }
export interface LessonEvidence {
  format: "moa.lesson-evidence.v1"; classId: string; lessonId: string; origin: string; createdAt: string;
  lesson: { title: string; date: string };
  options: { minutes: number; groupSize: number; participants: number; goal: string };
  rosterCount: number; totalRecords: number; activities: EvidenceActivity[]; records: EvidenceRecord[];
}
export interface LessonFinding { text: string; evidenceIds: string[] }
export interface LessonReview {
  facts: LessonFinding[]; hypotheses: LessonFinding[]; goals: string[];
  sequence: { title: string; minutes: number; purpose: string; zone: string; check: string }[];
  uncertainties: string[];
}
const object = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const integer = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && Number(v) >= min && Number(v) <= max;
const id = (v: unknown, max: number): v is string => text(v, max) && /^[A-Za-z0-9_-]+$/.test(v);
export function parseLessonEvidence(value: unknown): LessonEvidence | null {
  const v = object(value); if (!v || v.format !== "moa.lesson-evidence.v1" || !id(v.classId,64) || !id(v.lessonId,100) || !text(v.origin,200) || !text(v.createdAt,40) || !Number.isFinite(Date.parse(v.createdAt))) return null;
  try { const u = new URL(v.origin); if (u.origin !== v.origin || u.username || u.password || (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost","127.0.0.1","[::1]"].includes(u.hostname)))) return null; } catch { return null; }
  const lesson = object(v.lesson), opts = object(v.options);
  if (!lesson || !text(lesson.title,120) || !text(lesson.date,40) || !opts || !integer(opts.minutes,5,240) || !integer(opts.groupSize,1,10) || !integer(opts.participants,1,100) || !text(opts.goal,300) || !integer(v.rosterCount,0,10000) || !integer(v.totalRecords,0,10000)) return null;
  if (!Array.isArray(v.activities) || v.activities.length > 50 || !Array.isArray(v.records) || v.records.length > 120 || v.totalRecords < v.records.length) return null;
  const activities: EvidenceActivity[] = [], records: EvidenceRecord[] = [];
  for (const raw of v.activities) {
    const a = object(raw);
    if (!a || !id(a.id,100) || !text(a.title,120) || !text(a.kind,30) || !text(a.prompt,800) || !Array.isArray(a.options) || a.options.length > 10 || a.options.some(o => !text(o,200)) || !integer(a.answerIndex,-1,a.options.length-1) || activities.some(old => old.id === a.id)) return null;
    activities.push({ id:a.id, title:a.title, kind:a.kind, prompt:a.prompt, options:a.options as string[], answerIndex:a.answerIndex });
  }
  for (const raw of v.records) {
    const r = object(raw), activity = activities.find(a => a.id === r?.activityId);
    if (!r || !text(r.id,20) || !/^e[1-9]\d{0,3}$/.test(r.id) || !activity || !text(r.student,5) || !/^S\d{2,4}$/.test(r.student) || !text(r.text,800) || !r.text.trim() || records.some(old => old.id === r.id)) return null;
    if (r.selectedIndex !== undefined && (!integer(r.selectedIndex,0,activity.options.length-1) || activity.kind !== "quiz")) return null;
    records.push({id:r.id,activityId:activity.id,student:r.student,text:r.text,...(typeof r.selectedIndex === "number" ? { selectedIndex:r.selectedIndex, ...(activity.answerIndex >= 0 ? {correct:r.selectedIndex === activity.answerIndex} : {}) } : {})});
  }
  return {format:"moa.lesson-evidence.v1",classId:v.classId,lessonId:v.lessonId,origin:v.origin,createdAt:v.createdAt,
    lesson:{title:lesson.title,date:lesson.date},options:{minutes:opts.minutes,groupSize:opts.groupSize,participants:opts.participants,goal:opts.goal},
    rosterCount:v.rosterCount,totalRecords:v.totalRecords,activities,records};
}
export function briefForEvidence(packet: LessonEvidence) {
  return {participants:packet.options.participants,minutes:packet.options.minutes,subject:packet.options.goal || `${packet.lesson.title || "이전 수업"}을 바탕으로 한 다음 수업`,flow:`${packet.options.groupSize}명씩 도입 → 복습·탐구 → 공유 → 확인`,details:"이전 응답을 근거로 목표와 확인 활동을 제안해 주세요.",allowExpand:true};
}
export function evidenceStats(evidence: LessonEvidence) {
  return {roster:evidence.rosterCount,respondents:new Set(evidence.records.map(r => r.student)).size,records:evidence.records.length,totalRecords:evidence.totalRecords,sampled:evidence.totalRecords > evidence.records.length,
    quizzes:evidence.activities.filter(a => a.kind === "quiz").map(a => {
      const rows = evidence.records.filter(r => r.activityId === a.id && r.selectedIndex !== undefined);
      return {activityId:a.id,title:a.title,answers:rows.length,graded:rows.filter(r => r.correct !== undefined).length,correct:rows.filter(r => r.correct === true).length,choices:a.options.map((option,i) => ({option,count:rows.filter(r => r.selectedIndex === i).length}))};
    })};
}
export function parseLessonReview(value: unknown, evidence?: LessonEvidence, minutes?: number): LessonReview | null {
  const v = object(value); if (!v) return null;
  const allowed = evidence ? new Set(["meta",...evidence.records.map(r => r.id)]) : null;
  const findings = (raw: unknown): LessonFinding[] | null => {
    if (!Array.isArray(raw) || raw.length > 6) return null;
    const out: LessonFinding[] = [];
    for (const row of raw) {
      const r = object(row);
      if (!r || !text(r.text,500) || !r.text.trim() || !Array.isArray(r.evidenceIds) || !r.evidenceIds.length || r.evidenceIds.length > 4 || r.evidenceIds.some(e => !text(e,20) || !/^(meta|e[1-9]\d{0,3})$/.test(e) || allowed && !allowed.has(e))) return null;
      out.push({text:r.text,evidenceIds:[...new Set(r.evidenceIds as string[])]});
    }
    return out;
  };
  const facts = findings(v.facts), hypotheses = findings(v.hypotheses);
  if (!facts || !hypotheses || !Array.isArray(v.goals) || v.goals.length < 1 || v.goals.length > 5 || v.goals.some(g => !text(g,200) || !g.trim()) || !Array.isArray(v.sequence) || v.sequence.length < 2 || v.sequence.length > 8 || !Array.isArray(v.uncertainties) || v.uncertainties.length > 5 || v.uncertainties.some(u => !text(u,300))) return null;
  const sequence: LessonReview["sequence"] = [];
  for (const raw of v.sequence) {
    const step = object(raw);
    if (!step || !text(step.title,80) || !step.title.trim() || !integer(step.minutes,1,240) || !text(step.purpose,300) || !text(step.zone,40) || !text(step.check,300)) return null;
    sequence.push({title:step.title,minutes:step.minutes,purpose:step.purpose,zone:step.zone,check:step.check});
  }
  if (minutes !== undefined && sequence.reduce((n,s) => n+s.minutes,0) !== minutes) return null;
  return {facts,hypotheses,goals:v.goals as string[],sequence,uncertainties:v.uncertainties as string[]};
}
export const LESSON_REVIEW_SCHEMA = {type:"object",properties:{
  facts:{type:"array",items:{type:"object",properties:{text:{type:"string"},evidenceIds:{type:"array",items:{type:"string"}}},required:["text","evidenceIds"]}},
  hypotheses:{type:"array",items:{type:"object",properties:{text:{type:"string"},evidenceIds:{type:"array",items:{type:"string"}}},required:["text","evidenceIds"]}},
  goals:{type:"array",items:{type:"string"}},
  sequence:{type:"array",items:{type:"object",properties:{title:{type:"string"},minutes:{type:"integer"},purpose:{type:"string"},zone:{type:"string"},check:{type:"string"}},required:["title","minutes","purpose","zone","check"]}},
  uncertainties:{type:"array",items:{type:"string"}},
},required:["facts","hypotheses","goals","sequence","uncertainties"]} as const;
