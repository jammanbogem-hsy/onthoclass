export type Run = { score?: number; lost?: boolean; at?: { toMillis(): number } };
/** a·b 는 예전 1:1 호환용(=ids[0]·ids[1]). 4인 모둠은 ids 에 2~4명이 들어간다. */
export type Match = { id: string; a: string; b: string; ids?: string[]; seed: number; result: Result | null };
export const matchIds = (m: Pick<Match, "a" | "b" | "ids">) => (m.ids && m.ids.length >= 2 ? m.ids : [m.a, m.b]);
export type Result = { winner: string | null; reason: "topout" | "time" | "disconnect" | "teacher"; scores: Record<string, number>; at: number; reward?: { uid: string; xp: number } };
export function pairPlayers(students: string[], teacher: string, random: () => number): string[][] {
  const all = [...new Set(students)];
  if (all.length === 0 || all.length > 40 || all.includes(teacher)) throw new Error("학생을 1~40명 선택해 주세요.");
  if (all.length % 2) all.push(teacher);
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return Array.from({ length: all.length / 2 }, (_, i) => all.slice(i * 2, i * 2 + 2));
}
// 교사가 정한 규칙 — src/lib/puyo-rules.ts 의 normalizeRules 와 같은 범위로 서버가 다시 맞춘다.
export type Rules = { durationSec: number; size: 2 | 4; pairing: "random" | "manual"; odd: "teacher" | "rest"; winXp: number };
export function normalizeRules(raw?: Partial<Rules> | null): Rules {
  const sec = Math.round(Number(raw?.durationSec));
  const xp = Math.round(Number(raw?.winXp));
  return {
    durationSec: Number.isFinite(sec) ? Math.max(60, Math.min(900, sec)) : 180,
    size: Number(raw?.size) === 4 ? 4 : 2,
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
  const sizeOk = (n: number) => rules.size === 4 ? n >= 2 && n <= 4 : n === 2;
  if (pairs.some(p => !Array.isArray(p) || !sizeOk(p.length) || p.some(id => typeof id !== "string" || !ID.test(id)))) throw new Error("대진표를 다시 만들어 주세요.");
  if (rest.some(id => typeof id !== "string" || !ID.test(id))) throw new Error("대진표를 다시 만들어 주세요.");
  const flat = (pairs as string[][]).flat(); const all = [...flat, ...(rest as string[])];
  if (new Set(all).size !== all.length) throw new Error("한 사람이 두 번 들어갈 수 없어요.");
  const students = all.filter(id => id !== teacher);
  if (students.length === 0 || students.length > 40) throw new Error("학생을 1~40명 선택해 주세요.");
  if ((rest as string[]).includes(teacher)) throw new Error("대진표를 다시 만들어 주세요.");
  const teacherPlays = flat.includes(teacher);
  if (rules.size === 4) {
    // 4인 모둠: 쉬는 사람 없음, 선생님은 학생이 혼자일 때만 함께한다.
    if (rest.length > 0) throw new Error("4인 모둠에서는 쉬는 친구가 없어요.");
    if (teacherPlays && students.length !== 1) throw new Error("이번 규칙에서는 선생님이 대결에 들어가지 않아요.");
    return { pairs: pairs as string[][], resting: [] };
  }
  // 홀수 처리 규칙: 선생님 참가는 학생이 홀수일 때만, 쉬기는 한 명만.
  if (teacherPlays && (rules.odd !== "teacher" || students.length % 2 === 0)) throw new Error("이번 규칙에서는 선생님이 대결에 들어가지 않아요.");
  if (rest.length > 0 && (rules.odd !== "rest" || rest.length !== 1 || students.length % 2 === 0)) throw new Error("이번 규칙에서는 쉬는 친구를 둘 수 없어요.");
  return { pairs: pairs as string[][], resting: rest as string[] };
}
export function decide(match: Match, a: Run, b: Run, now: number, startsAt: number, endsAt: number, manual: boolean): Result | null {
  return decideGroup(match, { [match.a]: a, [match.b]: b }, now, startsAt, endsAt, manual);
}
/**
 * 한 판(1:1 또는 모둠)의 결과. 예전 화면이 보낸 lost 는 탈락으로 보고, 한 명만 남으면 그 친구가 이긴다.
 * 그 밖에는 시간 종료·선생님 종료 때 점수로 — 1등이 한 명이면 승리, 1등 동점이면 무승부.
 */
export function decideGroup(match: Match, runs: Record<string, Run>, now: number, startsAt: number, endsAt: number, manual: boolean): Result | null {
  if (match.result || now < startsAt) return match.result;
  const ids = matchIds(match); const run = (id: string) => runs[id] ?? {};
  const scores = Object.fromEntries(ids.map(id => [id, Math.max(0, run(id).score ?? 0)]));
  const top = (pool: string[]) => { const best = Math.max(...pool.map(id => scores[id])); const firsts = pool.filter(id => scores[id] === best); return firsts.length === 1 ? firsts[0] : null; };
  let reason: Result["reason"]; let winner: string | null;
  const alive = ids.filter(id => !run(id).lost);
  if (alive.length < ids.length && alive.length <= 1) {
    reason = "topout";
    winner = alive.length === 1 ? alive[0] : null;
  } else if (manual || now >= endsAt + 1800) {
    reason = manual ? "teacher" : "time";
    winner = top(alive.length ? alive : ids);
  } else {
    // 접속이 끊겨도 경기를 일찍 끝내지 않는다(화면 꺼짐·탭 전환으로 상대 경기까지 끝나던 문제).
    // 끊긴 학생의 점수는 마지막 저장값으로 남고, 승부는 시간 종료·선생님 종료 때 점수로 정한다.
    return null;
  }
  return { winner, reason, scores, at: now };
}
