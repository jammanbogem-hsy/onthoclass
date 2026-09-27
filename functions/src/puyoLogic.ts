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
