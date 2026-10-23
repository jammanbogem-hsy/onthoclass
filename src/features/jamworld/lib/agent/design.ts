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
/** Model output is untrusted; optional questions and image requests stay bounded. */
export function parseDesignExtras(value: Record<string, unknown>): Pick<AgentResult, "questions" | "assets" | "lessonReview"> | null {
  const out: Pick<AgentResult, "questions" | "assets" | "lessonReview"> = {};
  if (value.questions !== undefined) {
    if (!Array.isArray(value.questions) || value.questions.length > 3 || value.questions.some(q => typeof q !== "string" || !q.trim() || q.length > 240)) return null;
    if (value.questions.length) out.questions = value.questions as string[];
  }
  if (value.assets !== undefined) {
    if (!Array.isArray(value.assets) || value.assets.length > 4) return null;
    const assets: AgentAssetNeed[] = [];
    for (const raw of value.assets) {
      if (!raw || typeof raw !== "object") return null;
      const a = raw as AgentAssetNeed, d = a.draft;
      if (!Number.isInteger(a.x) || !Number.isInteger(a.y) || a.x < 0 || a.y < 0 || a.x >= 120 || a.y >= 120 ||
          !d || typeof d !== "object" || !ASSET_CATEGORIES.includes(d.category) ||
          typeof d.name !== "string" || !d.name.trim() || d.name.length > 30 ||
          typeof d.description !== "string" || !d.description.trim() || d.description.length > 300 ||
          !Array.isArray(d.tags) || !d.tags.length || d.tags.length > 8 || d.tags.some(t => typeof t !== "string" || !t.trim() || t.length > 12) ||
          !d.footprint || ![1,2,3].includes(d.footprint.w) || ![1,2,3].includes(d.footprint.d) ||
          typeof d.passable !== "boolean" || typeof d.height !== "number" || !Number.isFinite(d.height) || d.height < 0 || d.height > 3) return null;
      if ((a.w !== undefined && (!Number.isInteger(a.w) || a.w < 1 || a.w > 120)) ||
          (a.h !== undefined && (!Number.isInteger(a.h) || a.h < 1 || a.h > 120))) return null;
      if ((a.w !== undefined && a.w < d.footprint.w) || (a.h !== undefined && a.h < d.footprint.d)) return null;
      if (d.category !== "terrain" && Math.ceil((a.w || d.footprint.w) / d.footprint.w) * Math.ceil((a.h || d.footprint.d) / d.footprint.d) > 150) return null;
      assets.push({ x: a.x, y: a.y, ...(a.w ? { w: a.w } : {}), ...(a.h ? { h: a.h } : {}), draft: { name: d.name, description: d.description, category: d.category, tags: d.tags, footprint: { ...d.footprint }, passable: d.passable, height: d.height } });
    }
    if (assets.length) out.assets = assets;
  }
  if (value.lessonReview !== undefined) {
    const review = parseLessonReview(value.lessonReview); if (!review) return null; out.lessonReview = review;
  }
  if (out.questions?.length && (out.assets?.length || (Array.isArray(value.ops) && value.ops.length))) return null;
  return out;
}
