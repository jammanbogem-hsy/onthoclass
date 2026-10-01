/** Deterministic, framework-free falling-pair engine. Row 0 is the hidden buffer. */
export const COLS = 6;
export const ROWS = 13;
export type Cell = 0 | 1 | 2 | 3 | 4 | 5;
export type Pair = { x: number; y: number; r: number; a: Cell; b: Cell };
export type Action = "left" | "right" | "down" | "cw" | "ccw" | "drop";
export type PuyoState = {
  board: Cell[]; active: Pair | null; next: Cell[]; rng: number;
  score: number; cleared: number; maxChain: number; chain: number;
  sent: number; pending: number; seen: number; remainder: number;
  phase: "fall" | "clear" | "settle" | "over";
  timer: number; fall: number; lock: number; resets: number;
  clearing: number[]; event: number; effect: "none" | "land" | "clear" | "attack" | "allclear" | "garbage" | "revive";
  /** 학급 대전에서 보드가 꽉 차 다시 시작한 횟수(연습·예전 상태에는 없음). */
  downs?: number;
};
const OFFSETS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const CHAIN = [0, 0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512];
function random(s: PuyoState) {
  let x = s.rng | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  s.rng = x >>> 0; return s.rng / 4294967296;
}
function color(s: PuyoState): Cell { return (1 + Math.floor(random(s) * 4)) as Cell; }
export function pairCells(p: Pair) {
  const [dx, dy] = OFFSETS[p.r];
  return [{ x: p.x, y: p.y, c: p.a }, { x: p.x + dx, y: p.y + dy, c: p.b }];
}
export function fits(s: PuyoState, p: Pair): boolean {
  return pairCells(p).every(({ x, y }) => x >= 0 && x < COLS && y >= 0 && y < ROWS && !s.board[y * COLS + x]);
}
function spawn(s: PuyoState) {
  s.active = { x: 2, y: 1, r: 0, a: s.next.shift()!, b: s.next.shift()! };
  s.next.push(color(s), color(s)); s.phase = "fall"; s.fall = 0; s.lock = 0; s.resets = 0; s.chain = 0;
  if (!fits(s, s.active)) { s.active = null; s.phase = "over"; }
}
export function createState(seed: number): PuyoState {
  const s: PuyoState = { board: Array(COLS * ROWS).fill(0), active: null, next: [], rng: seed || 1, score: 0, cleared: 0, maxChain: 0, chain: 0, sent: 0, pending: 0, seen: 0, remainder: 0, phase: "fall", timer: 0, fall: 0, lock: 0, resets: 0, clearing: [], event: 0, effect: "none" };
  for (let i = 0; i < 6; i++) s.next.push(color(s));
  spawn(s); return s;
}
export function ghost(s: PuyoState): Pair | null {
  if (!s.active) return null;
  const p = { ...s.active };
  while (fits(s, { ...p, y: p.y + 1 })) p.y++;
  return p;
}
function effect(s: PuyoState, kind: PuyoState["effect"]) { s.event++; s.effect = kind; }
function settle(s: PuyoState) {
  for (let x = 0; x < COLS; x++) {
    let dest = ROWS - 1;
    for (let y = ROWS - 1; y >= 0; y--) {
      const v = s.board[y * COLS + x];
      if (v) { s.board[y * COLS + x] = 0; s.board[dest-- * COLS + x] = v; }
    }
  }
}
export function groups(board: Cell[]): number[][] {
  const visited = new Set<number>(); const out: number[][] = [];
  for (let i = 0; i < board.length; i++) {
    if (!board[i] || board[i] === 5 || visited.has(i)) continue;
    const group = [i]; visited.add(i);
    for (let k = 0; k < group.length; k++) {
      for (const j of adjacent(group[k])) {
        if (board[j] === board[i] && !visited.has(j)) { visited.add(j); group.push(j); }
      }
    }
    if (group.length >= 4) out.push(group);
  }
  return out;
}
function adjacent(i: number) {
  const out: number[] = []; const x = i % COLS; const y = Math.floor(i / COLS);
  if (x > 0) out.push(i - 1); if (x < COLS - 1) out.push(i + 1);
  if (y > 0) out.push(i - COLS); if (y < ROWS - 1) out.push(i + COLS);
  return out;
}
function attack(s: PuyoState, points: number) {
  const budget = s.remainder + points;
  let count = Math.floor(budget / 70); s.remainder = budget % 70;
  const cancel = Math.min(count, s.pending); s.pending -= cancel; count -= cancel;
  s.sent += count;
}
function resolve(s: PuyoState) {
  const found = groups(s.board);
  if (found.length) {
    s.chain++; s.maxChain = Math.max(s.maxChain, s.chain);
    const colors = new Set(found.map(g => s.board[g[0]])).size;
    const count = found.reduce((n, g) => n + g.length, 0);
    const groupBonus = found.reduce((n, g) => n + (g.length === 4 ? 0 : g.length >= 11 ? 10 : g.length - 3), 0);
    const bonus = Math.max(1, Math.min(999, CHAIN[Math.min(s.chain, 19)] + [0, 0, 3, 6, 12][colors] + groupBonus));
    const points = count * 10 * bonus; s.score += points; s.cleared += count; attack(s, points);
    const clearing = new Set(found.flat());
    for (const i of [...clearing]) for (const j of adjacent(i)) if (s.board[j] === 5) clearing.add(j);
    s.clearing = [...clearing]; s.phase = "clear"; s.timer = 430;
    effect(s, s.chain > 1 ? "attack" : "clear"); return;
  }
  if (s.chain > 0 && s.board.every(v => v === 0)) { s.score += 2100; attack(s, 2100); effect(s, "allclear"); }
  if (s.pending > 0) {
    const amount = Math.min(30, s.pending); s.pending -= amount;
    // Independent garbage shuffle: receiving garbage must not change the common piece sequence.
    const columns = [0, 1, 2, 3, 4, 5];
    for (let i = 5; i > 0; i--) { const j = ((s.seen + s.score + i * 17) >>> 0) % (i + 1); [columns[i], columns[j]] = [columns[j], columns[i]]; }
    for (let n = 0; n < amount; n++) {
      const x = columns[n % COLS]; let y = ROWS - 1;
      while (y >= 0 && s.board[y * COLS + x]) y--;
      if (y < 0) { s.phase = "over"; s.active = null; return; }
      s.board[y * COLS + x] = 5;
    }
    effect(s, "garbage");
  }
  spawn(s);
}
function lockPair(s: PuyoState) {
  if (!s.active) return;
  for (const { x, y, c } of pairCells(s.active)) s.board[y * COLS + x] = c;
  s.active = null; settle(s); s.phase = "settle"; s.timer = 170; effect(s, "land");
}
export function input(s: PuyoState, action: Action) {
  if (s.phase !== "fall" || !s.active) return;
  const p = s.active;
  if (action === "drop") { const g = ghost(s)!; s.score += g.y - p.y; s.active = g; lockPair(s); return; }
  if (action === "cw" || action === "ccw") {
    const r = (p.r + (action === "cw" ? 1 : 3)) % 4;
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1]]) {
      const candidate = { ...p, r, x: p.x + dx, y: p.y + dy };
      if (fits(s, candidate)) { s.active = candidate; if (s.resets++ < 8) s.lock = 0; return; }
    }
    return;
  }
  const candidate = { ...p, x: p.x + (action === "left" ? -1 : action === "right" ? 1 : 0), y: p.y + (action === "down" ? 1 : 0) };
  if (fits(s, candidate)) {
    s.active = candidate;
    if (action === "down") { s.score++; s.fall = 0; } else if (s.resets++ < 8) s.lock = 0;
  }
}
export function receive(s: PuyoState, totalSent: number) {
  if (totalSent > s.seen) { s.pending += totalSent - s.seen; s.seen = totalSent; }
}
/** Advance using small steps so tests and animation have the same collision behavior. */
export function tick(s: PuyoState, elapsed: number) {
  for (let rest = Math.min(2000, Math.max(0, elapsed)); rest > 0;) {
    const dt = Math.min(20, rest); rest -= dt;
    if (s.phase === "over") return;
    if (s.phase !== "fall") {
      s.timer -= dt;
      if (s.timer <= 0) {
        if (s.phase === "clear") { for (const i of s.clearing) s.board[i] = 0; s.clearing = []; settle(s); s.phase = "settle"; s.timer = 220; }
        else resolve(s);
      }
      continue;
    }
    if (!s.active) return;
    const below = { ...s.active, y: s.active.y + 1 };
    if (!fits(s, below)) { s.lock += dt; if (s.lock >= 450) lockPair(s); }
    else { s.lock = 0; s.fall += dt; if (s.fall >= 780) { s.active = below; s.fall = 0; } }
  }
}
/**
 * 학급 대전용 재시작 — 보드가 꽉 차도 경기를 끝내지 않고 판을 비운 뒤 이어서 한다.
 * 점수·보낸 공격·뿌요 순서(next·rng)는 그대로 두고, 받을 방해 뿌요만 비운다.
 * 잠깐(900ms) 숨을 돌린 뒤 다음 뿌요가 나온다.
 */
export function revive(s: PuyoState) {
  if (s.phase !== "over") return;
  s.board.fill(0); s.pending = 0; s.clearing = []; s.chain = 0; s.active = null;
  s.downs = (s.downs ?? 0) + 1;
  s.phase = "settle"; s.timer = 900; effect(s, "revive");
}
export function cloneState(s: PuyoState): PuyoState { return JSON.parse(JSON.stringify(s)) as PuyoState; }

/** Ignore malformed peer snapshots instead of allowing one client to crash another board. */
export function parseState(json: unknown): PuyoState | null {
  if (typeof json !== "string" || json.length > 16000) return null;
  try {
    const s = JSON.parse(json) as PuyoState;
    const integer = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
    if (!s || !Array.isArray(s.board) || s.board.length !== COLS * ROWS || !s.board.every(v => integer(v, 0, 5))) return null;
    if (!Array.isArray(s.next) || s.next.length !== 6 || !s.next.every(v => integer(v, 1, 4))) return null;
    if ((s.downs !== undefined && !integer(s.downs, 0, 9999)) || !Array.isArray(s.clearing) || s.clearing.length > COLS * ROWS || !s.clearing.every(v => integer(v, 0, COLS * ROWS - 1))) return null;
    if (!["fall", "clear", "settle", "over"].includes(s.phase) || !["none", "land", "clear", "attack", "allclear", "garbage", "revive"].includes(s.effect)) return null;
    for (const key of ["rng", "score", "cleared", "maxChain", "chain", "sent", "pending", "seen", "remainder", "resets", "event"] as const) if (!integer(s[key], 0, 4294967295)) return null;
    for (const key of ["timer", "fall", "lock"] as const) if (!Number.isFinite(s[key]) || Math.abs(s[key]) > 100000) return null;
    if (s.active !== null) {
      const p = s.active;
      if (!p || !integer(p.x, 0, COLS - 1) || !integer(p.y, 0, ROWS - 1) || !integer(p.r, 0, 3) || !integer(p.a, 1, 4) || !integer(p.b, 1, 4)) return null;
    }
    if (s.phase === "fall" && !s.active) return null;
    return s;
  } catch { return null; }
}
