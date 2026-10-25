import { parseLessonReview, type LessonReview } from "./lesson-evidence";
import { ASSET_CATEGORIES, type RequestDraft } from "../server/workshop/types";

export interface LessonBrief {
  participants: number;
  minutes: number;
  subject: string;
  flow: string;
  details: string;
  allowExpand: boolean;
}
export interface AgentAssetNeed { draft: RequestDraft; x: number; y: number; w?: number; h?: number }
export interface AgentResult {
  summary: string;
  ops: unknown[];
  questions?: string[];
  assets?: AgentAssetNeed[];
  lessonReview?: LessonReview;
}
export function parseBrief(value: unknown): LessonBrief | null {
  if (!value || typeof value !== "object") return null;
  const b = value as Record<string, unknown>;
  if (!Number.isInteger(b.participants) || Number(b.participants) < 1 || Number(b.participants) > 100 ||
      !Number.isInteger(b.minutes) || Number(b.minutes) < 5 || Number(b.minutes) > 240 ||
      typeof b.subject !== "string" || !b.subject.trim() || b.subject.length > 300 ||
      typeof b.flow !== "string" || !b.flow.trim() || b.flow.length > 800 ||
      typeof b.details !== "string" || b.details.length > 800 || typeof b.allowExpand !== "boolean") return null;
  return b as unknown as LessonBrief;
}
/** Model output is untrusted; optional questions and image requests stay bounded.
 *  한 항목이 규칙을 조금 넘었다고 결과 전체를 버리지 않는다 — 자를 수 있는 건 자르고, 고칠 수 없는 항목만 뺀다. */
export function parseDesignExtras(value: Record<string, unknown>): Pick<AgentResult, "questions" | "assets" | "lessonReview"> | null {
  const out: Pick<AgentResult, "questions" | "assets" | "lessonReview"> = {};
  if (Array.isArray(value.questions)) {
    const qs = value.questions.filter((q): q is string => typeof q === "string" && !!q.trim()).slice(0, 3).map(q => q.trim().slice(0, 240));
    if (qs.length) out.questions = qs;
  }
  if (Array.isArray(value.assets)) {
    const assets: AgentAssetNeed[] = [];
    const int = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
    for (const raw of value.assets.slice(0, 4)) {
      if (!raw || typeof raw !== "object") continue;
      const a = raw as AgentAssetNeed, d = a.draft;
      if (!d || typeof d !== "object" || !ASSET_CATEGORIES.includes(d.category) ||
          typeof d.name !== "string" || !d.name.trim() || typeof d.description !== "string" || !d.description.trim()) continue;
      const terrain = d.category === "terrain";
      const fp = terrain ? { w: 1, d: 1 } : { w: int(d.footprint?.w, 1, 6, 1), d: int(d.footprint?.d, 1, 6, 1) };
      const name = d.name.trim().slice(0, 30);
      const tags = (Array.isArray(d.tags) ? d.tags : []).filter((t): t is string => typeof t === "string" && !!t.trim()).map(t => t.trim().slice(0, 12)).slice(0, 8);
      let w = a.w === undefined ? undefined : int(a.w, fp.w, 120, fp.w);
      let h = a.h === undefined ? undefined : int(a.h, fp.d, 120, fp.d);
      if (!terrain && Math.ceil((w || fp.w) / fp.w) * Math.ceil((h || fp.d) / fp.d) > 150) { w = undefined; h = undefined; }
      const height = typeof d.height === "number" && Number.isFinite(d.height) ? Math.max(0, Math.min(5, d.height)) : terrain ? 0 : 1;
      assets.push({ x: int(a.x, 0, 119, 0), y: int(a.y, 0, 119, 0), ...(w ? { w } : {}), ...(h ? { h } : {}),
        draft: { name, description: d.description.trim().slice(0, 300), category: d.category, tags: tags.length ? tags : [name.slice(0, 12)], footprint: fp, passable: typeof d.passable === "boolean" ? d.passable : terrain, height } });
    }
    if (assets.length) out.assets = assets;
  }
  if (value.lessonReview !== undefined) {
    const review = parseLessonReview(value.lessonReview); if (!review) return null; out.lessonReview = review;
  }
  // 질문과 작업이 함께 오면 몰래 실행하지 않는다 — 질문만 남기고 그림 요청은 뺀다(맵 작업은 parseToolInput 이 비운다)
  if (out.questions?.length) delete out.assets;
  return out;
}
