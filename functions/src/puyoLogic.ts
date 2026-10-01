export type Run = { score?: number; lost?: boolean; at?: { toMillis(): number } };
export type Match = { id: string; a: string; b: string; seed: number; result: Result | null };
export type Result = { winner: string | null; reason: "topout" | "time" | "disconnect" | "teacher"; scores: Record<string, number>; at: number; reward?: { uid: string; xp: number } };
export function pairPlayers(students: string[], teacher: string, random: () => number): string[][] {
  const all = [...new Set(students)];
  if (all.length === 0 || all.length > 40 || all.includes(teacher)) throw new Error("학생을 1~40명 선택해 주세요.");
  if (all.length % 2) all.push(teacher);
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return Array.from({ length: all.length / 2 }, (_, i) => all.slice(i * 2, i * 2 + 2));
}
// 교사가 정한 규칙 — src/lib/puyo-rules.ts 의 normalizeRules 와 같은 범위로 서버가 다시 맞춘다.
export type Rules = { durationSec: number; pairing: "random" | "manual"; odd: "teacher" | "rest"; winXp: number };
export function normalizeRules(raw?: Partial<Rules> | null): Rules {
  const sec = Math.round(Number(raw?.durationSec));
  const xp = Math.round(Number(raw?.winXp));
  return {
    durationSec: Number.isFinite(sec) ? Math.max(60, Math.min(900, sec)) : 180,
    pairing: raw?.pairing === "manual" ? "manual" : "random",
    odd: raw?.odd === "rest" ? "rest" : "teacher",
    winXp: Number.isFinite(xp) ? Math.max(0, Math.min(20, xp)) : 10,
  };
}
const ID = /^[\w-]{1,128}$/;
/** 교사가 대기실에서 확정한 대진표 검증. 통과하면 [짝 목록, 쉬는 학생]을 돌려준다. */
export function validatePlan(pairs: unknown, resting: unknown, teacher: string, rules: Rules): { pairs: string[][]; resting: string[] } {
  const rest = resting === undefined ? [] : resting;
  if (!Array.isArray(pairs) || pairs.length === 0 || !Array.isArray(rest)) throw new Error("대진표를 다시 만들어 주세요.");
  if (pairs.some(p => !Array.isArray(p) || p.length !== 2 || p.some(id => typeof id !== "string" || !ID.test(id)))) throw new Error("대진표를 다시 만들어 주세요.");
  if (rest.some(id => typeof id !== "string" || !ID.test(id))) throw new Error("대진표를 다시 만들어 주세요.");
  const flat = (pairs as string[][]).flat(); const all = [...flat, ...(rest as string[])];
  if (new Set(all).size !== all.length) throw new Error("한 사람이 두 번 들어갈 수 없어요.");
  const students = all.filter(id => id !== teacher);
  if (students.length === 0 || students.length > 40) throw new Error("학생을 1~40명 선택해 주세요.");
  if ((rest as string[]).includes(teacher)) throw new Error("대진표를 다시 만들어 주세요.");
  const teacherPlays = flat.includes(teacher);
  // 홀수 처리 규칙: 선생님 참가는 학생이 홀수일 때만, 쉬기는 한 명만.
  if (teacherPlays && (rules.odd !== "teacher" || students.length % 2 === 0)) throw new Error("이번 규칙에서는 선생님이 대결에 들어가지 않아요.");
  if (rest.length > 0 && (rules.odd !== "rest" || rest.length !== 1 || students.length % 2 === 0)) throw new Error("이번 규칙에서는 쉬는 친구를 둘 수 없어요.");
  return { pairs: pairs as string[][], resting: rest as string[] };
}
export function decide(match: Match, a: Run, b: Run, now: number, startsAt: number, endsAt: number, manual: boolean): Result | null {
  if (match.result || now < startsAt) return match.result;
  const scores = { [match.a]: Math.max(0, a.score ?? 0), [match.b]: Math.max(0, b.score ?? 0) };
  let reason: Result["reason"]; let winner: string | null;
  if (a.lost || b.lost) {
    reason = "topout";
    winner = a.lost && b.lost ? null : a.lost ? match.b : match.a;
  } else if (manual || now >= endsAt + 1800) {
    reason = manual ? "teacher" : "time";
    winner = scores[match.a] === scores[match.b] ? null : scores[match.a] > scores[match.b] ? match.a : match.b;
  } else {
    const aAway = now - Math.max(startsAt, a.at?.toMillis() ?? startsAt) > 25000;
    const bAway = now - Math.max(startsAt, b.at?.toMillis() ?? startsAt) > 25000;
    if (!aAway && !bAway) return null;
    reason = "disconnect"; winner = aAway && bAway ? null : aAway ? match.b : match.a;
  }
  return { winner, reason, scores, at: now };
}
