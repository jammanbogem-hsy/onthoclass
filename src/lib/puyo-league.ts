// 뿌요뿌요 리그전 — 정한 판 수만큼 모둠(또는 1:1 짝)을 바꿔 가며 겨루고, 판마다 등수 점수를 더해 순위를 매긴다.
//   리그 정보는 판마다 게임 문서에 같이 저장된다: games/{gid}.puyo.league = PuyoLeague
//   (따로 컬렉션을 두지 않는다 — 같은 league.id 의 게임들을 모으면 리그 전체가 된다)
// 점수는 서버 결과(matches[].result.scores)에서 화면이 그대로 계산한다(보상과 무관해 서버 검증이 필요 없다).
// 순수 모듈(파이어베이스 의존 없음) — tests/puyo-league.test.cjs 에서 직접 불러 검사한다.
import type { QuizItem } from "@/lib/quizrun";

export type PuyoLeague = { id: string; name: string; round: number; total: number };

export const LEAGUE_MIN_ROUNDS = 2;
export const LEAGUE_MAX_ROUNDS = 10;
export const LEAGUE_ROUND_OPTIONS = [3, 4, 5, 6] as const;

/** 1:1 리그: 이기면 5, 지면 3, 비기면 둘 다 4. */
export const DUEL_POINTS = [5, 3];
/** 4인 모둠 리그: 모둠 크기별 등수 점수 — 3명 모둠 1등이 4명 모둠 1등보다 유리하지 않게. */
export const GROUP_POINTS: Record<number, number[]> = { 4: [10, 7, 4, 2], 3: [9, 5, 2], 2: [8, 3] };

export function pointTable(size: 2 | 4, groupSize: number): number[] {
  if (size === 2) return DUEL_POINTS;
  return GROUP_POINTS[groupSize] ?? GROUP_POINTS[4].slice(0, groupSize);
}

/**
 * 한 판(한 모둠)의 등수 점수. 점수가 같으면 그 등수들의 점수를 똑같이 나눠 가진다
 * (예: 4명 모둠 1·2등 동점 → 둘 다 8.5). 1:1 무승부는 (5+3)/2 = 4.
 */
export function placePoints(scores: Record<string, number>, ids: string[], size: 2 | 4): Record<string, number> {
  const table = pointTable(size, ids.length);
  const sorted = [...ids].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
  const out: Record<string, number> = {};
  for (let i = 0; i < sorted.length;) {
    let j = i; while (j + 1 < sorted.length && (scores[sorted[j + 1]] ?? 0) === (scores[sorted[i]] ?? 0)) j++;
    const share = table.slice(i, j + 1).reduce((a, b) => a + b, 0) / (j - i + 1);
    for (let k = i; k <= j; k++) out[sorted[k]] = Math.round(share * 10) / 10;
    i = j + 1;
  }
  return out;
}

/** 리그 계산에 필요한 만큼의 게임 모양(파이어베이스 Game 에서 뽑아 넘긴다). */
export type LeagueGame = {
  id: string; round: number; size: 2 | 4;
  matches: { ids: string[]; result: { scores: Record<string, number> } | null }[];
};

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** 지금까지 같은 판(모둠·짝)에서 만난 횟수 — 다음 판 모둠을 짤 때 겹침을 피하는 데 쓴다. */
export function meetCounts(games: LeagueGame[]): Record<string, number> {
  const met: Record<string, number> = {};
  for (const g of games) for (const m of g.matches) for (let i = 0; i < m.ids.length; i++) for (let j = i + 1; j < m.ids.length; j++) {
    const k = pairKey(m.ids[i], m.ids[j]); met[k] = (met[k] ?? 0) + 1;
  }
  return met;
}

/** 이 대진에서 이미 만났던 짝이 몇 쌍인지(겹침 수) — 대기실에 "겹침 0쌍"으로 보여 준다. */
export function repeatPairs(groups: string[][], met: Record<string, number>): number {
  let n = 0;
  for (const g of groups) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if ((met[pairKey(g[i], g[j])] ?? 0) > 0) n++;
  return n;
}

/**
 * 겹침이 가장 적은 대진 고르기 — 무작위 대진을 여러 번 만들어(make) 맞바꾸기로 다듬은 뒤 이미 만난 횟수의 제곱 합이
 * 가장 작은 것을 고른다(제곱이라 같은 친구를 세 번 만나느니 여러 친구를 한 번씩 만나게 된다).
 * 인원이 적으면 겹침을 완전히 없앨 수 없어서 '최대한 덜 겹치게'가 목표다.
 */
function groupCost(g: string[], met: Record<string, number>) {
  let cost = 0;
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) { const c = met[pairKey(g[i], g[j])] ?? 0; cost += c * c; }
  return cost;
}
/** 두 모둠 사이에서 한 명씩 맞바꿔 겹침이 줄면 바꾸기를, 더 줄지 않을 때까지 되풀이한다(언덕 오르기). */
function improve(groups: string[][], met: Record<string, number>): string[][] {
  const gs = groups.map(g => [...g]);
  for (let pass = 0; pass < 30; pass++) {
    let better = false;
    for (let a = 0; a < gs.length; a++) for (let b = a + 1; b < gs.length; b++) for (let i = 0; i < gs[a].length; i++) for (let j = 0; j < gs[b].length; j++) {
      const before = groupCost(gs[a], met) + groupCost(gs[b], met);
      [gs[a][i], gs[b][j]] = [gs[b][j], gs[a][i]];
      if (groupCost(gs[a], met) + groupCost(gs[b], met) < before) better = true;
      else [gs[a][i], gs[b][j]] = [gs[b][j], gs[a][i]];
    }
    if (!better) break;
  }
  return gs;
}
export function leastRepeated<P extends { pairs: string[][] }>(make: () => P, met: Record<string, number>, tries = 60): P {
  let best: P | null = null; let bestCost = Infinity;
  for (let t = 0; t < tries; t++) {
    const raw = make(); const plan = { ...raw, pairs: improve(raw.pairs, met) };
    const cost = plan.pairs.reduce((n, g) => n + groupCost(g, met), 0);
    if (cost < bestCost) { best = plan; bestCost = cost; if (cost === 0) break; }
  }
  return best!;
}

export type LeagueRow = {
  uid: string; points: number; firsts: number; rounds: number; score: number;
  /** 판별 기록(리그 판 번호 → 그 판 점수·등수) */
  byRound: Record<number, { points: number; place: number; groupSize: number }>;
};

/**
 * 리그 순위표 — 리그 점수 합계 → 1등 횟수 → 경기 점수 합계 순. 결과가 난 판만 센다.
 * exclude: 선생님(함께 대결했어도 순위에는 넣지 않는다. 등수 계산에는 들어간다).
 */
export function leagueStandings(games: LeagueGame[], exclude: string[] = []): (LeagueRow & { rank: number })[] {
  const rows = new Map<string, LeagueRow>();
  const row = (uid: string) => { let r = rows.get(uid); if (!r) { r = { uid, points: 0, firsts: 0, rounds: 0, score: 0, byRound: {} }; rows.set(uid, r); } return r; };
  for (const g of games) for (const m of g.matches) {
    if (!m.result) continue;
    const pts = placePoints(m.result.scores, m.ids, g.size);
    for (const uid of m.ids) {
      if (exclude.includes(uid)) continue;
      const sc = m.result.scores[uid] ?? 0;
      const place = 1 + m.ids.filter(o => (m.result!.scores[o] ?? 0) > sc).length;
      const r = row(uid);
      r.points += pts[uid]; r.rounds++; r.score += sc; if (place === 1) r.firsts++;
      r.byRound[g.round] = { points: pts[uid], place, groupSize: m.ids.length };
    }
  }
  const list = [...rows.values()].map(r => ({ ...r, points: Math.round(r.points * 10) / 10 }))
    .sort((a, b) => b.points - a.points || b.firsts - a.firsts || b.score - a.score);
  return list.map(r => ({ ...r, rank: 1 + list.filter(o => o.points > r.points || (o.points === r.points && (o.firsts > r.firsts || (o.firsts === r.firsts && o.score > r.score)))).length }));
}

/* ───────────────── 문제 분석(블루킷 리포트처럼) ───────────────── */

/** 한 학생이 한 판에서 고른 답 — PuyoState.answers 를 펼친 것(문항 위치, 고른 보기). */
export type AnswerLog = { uid: string; items: QuizItem[]; answers: number[] };

export type ItemReport = {
  item: QuizItem; asked: number; correct: number;
  /** 보기별로 고른 횟수(정답 포함) */
  picks: number[];
  /** 틀린 학생들 */
  wrongBy: string[];
};
export type StudentReport = { uid: string; asked: number; correct: number; wrong: { item: QuizItem; picked: number }[] };

/**
 * 문항별 정답률(어려운 문제부터)·자주 고른 오답, 학생별 정답률과 틀린 문제.
 * 같은 문항은 내용(문제+보기)으로 묶는다 — 판마다 문항 id 가 달라도 같은 문제면 합친다.
 */
export function quizReport(logs: AnswerLog[]): { items: ItemReport[]; students: StudentReport[] } {
  const items = new Map<string, ItemReport>(); const students = new Map<string, StudentReport>();
  const keyOf = (it: QuizItem) => `${it.prompt}\u0000${it.options.join("\u0001")}\u0000${it.answerIndex}`;
  for (const log of logs) {
    const st = students.get(log.uid) ?? { uid: log.uid, asked: 0, correct: 0, wrong: [] };
    students.set(log.uid, st);
    for (let k = 0; k + 1 < log.answers.length; k += 2) {
      const item = log.items[log.answers[k]]; const picked = log.answers[k + 1];
      if (!item) continue;
      const key = keyOf(item);
      const rep = items.get(key) ?? { item, asked: 0, correct: 0, picks: item.options.map(() => 0), wrongBy: [] };
      items.set(key, rep);
      const ok = picked === item.answerIndex;
      rep.asked++; if (ok) rep.correct++; else if (!rep.wrongBy.includes(log.uid)) rep.wrongBy.push(log.uid);
      if (picked >= 0 && picked < rep.picks.length) rep.picks[picked]++;
      st.asked++; if (ok) st.correct++; else st.wrong.push({ item, picked });
    }
  }
  const rate = (r: { asked: number; correct: number }) => (r.asked ? r.correct / r.asked : 1);
  return {
    items: [...items.values()].sort((a, b) => rate(a) - rate(b) || b.asked - a.asked),
    students: [...students.values()].sort((a, b) => rate(a) - rate(b)),
  };
}
