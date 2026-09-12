export const USAGE_FEATURES = ["class", "lesson", "canvas", "trade", "game", "quizrun", "english", "other"] as const;
export const BUCKET_MS = 300_000;
export type UsageCounts = Partial<Record<typeof USAGE_FEATURES[number], number>>;
export type UsageEntry = { start: number; counts: UsageCounts };
export const usageDay = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
export function validateUsage(entries: unknown, now: number): UsageEntry[] {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 12) throw Error("사용량 묶음은 1~12개여야 합니다.");
  return entries.map(entry => {
    if (!entry || !Number.isSafeInteger(entry.start) || entry.start % BUCKET_MS !== 0 || entry.start > now || entry.start < now - 7 * 86400_000 || !entry.counts || typeof entry.counts !== "object" || Array.isArray(entry.counts)) throw Error("사용량 기록 형식 또는 시간이 올바르지 않습니다.");
    let total = 0;
    for (const [key, value] of Object.entries(entry.counts)) {
      if (!(USAGE_FEATURES as readonly string[]).includes(key) || typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 300) throw Error("사용량 값이 올바르지 않습니다.");
      total += value;
    }
    if (total > 300 || total > Math.floor((now - entry.start) / 1000) + 1) throw Error("기록 시간이 구간 길이를 초과했습니다.");
    return { start: entry.start, counts: entry.counts };
  });
}
/** 재전송·다중 탭은 기능별 최댓값으로 병합하되 구간 전체는 300초로 제한한다. */
export function mergeUsage(old: UsageCounts, incoming: UsageCounts): UsageCounts {
  const out: UsageCounts = { ...old };
  let remaining = Math.max(0, 300 - Object.values(old).reduce((sum, n) => sum + n, 0));
  for (const feature of USAGE_FEATURES) {
    const add = Math.min(remaining, Math.max(0, (incoming[feature] ?? 0) - (old[feature] ?? 0)));
    if (add) out[feature] = (old[feature] ?? 0) + add;
    remaining -= add;
  }
  return out;
}
