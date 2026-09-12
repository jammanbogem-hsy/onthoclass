import { httpsCallable } from "firebase/functions";
import { getFunctionsClient } from "./firebase";
export const USAGE_LABELS = { class: "학급", lesson: "수업", canvas: "캔버스", trade: "트레이딩", game: "게임", quizrun: "퀴즈런", english: "영어 활동", other: "기타" } as const;
export type UsageFeature = keyof typeof USAGE_LABELS;
export type UsageCounts = Partial<Record<UsageFeature, number>>;
export type UsageEntry = { start: number; counts: UsageCounts };
export type UsageRow = { uid: string; day: string; counts: UsageCounts; activeSeconds: number; updatedAt: number | null };
export const usageDay = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
export function usageFeature(path: string): UsageFeature {
  if (path.startsWith("/trade")) return "trade";
  if (path.startsWith("/canvas")) return "canvas";
  if (path.startsWith("/lesson")) return "lesson";
  if (path.startsWith("/eng/") || path.startsWith("/53/") || path.startsWith("/book7")) return "english";
  if (path.startsWith("/class")) return "class";
  return "other";
}
export async function recordUsage(cid: string, entries: UsageEntry[]) {
  await httpsCallable(getFunctionsClient(), "recordClassUsage")({ cid, entries });
}
export async function getClassUsage(cid: string, from: string, to: string) {
  const result = await httpsCallable<{ cid: string; from: string; to: string }, { rows: UsageRow[]; truncated: boolean }>(getFunctionsClient(), "getClassUsage")({ cid, from, to });
  return result.data;
}
