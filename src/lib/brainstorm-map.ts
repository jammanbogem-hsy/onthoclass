// 브레인스토밍 땅따먹기 판 — 스플래툰처럼 아이디어를 쓸수록 내 색 잉크가 섬 위로 번진다.
// 섬은 육각 칸(odd-r 배치)으로 나누고, 학생마다 '집' 칸을 하나 정해 아이디어 수만큼 칸을 칠한다.
// 화면 없이 계산만 하는 순수 모듈 — tests/brainstorm-map.test.cjs 에서 직접 검사한다.

export const MAP_COLS = 36;
export const MAP_ROWS = 21;
const SIZE = 10; // 육각 반지름(뷰박스 단위)
const W = Math.sqrt(3) * SIZE;
const H = 2 * SIZE;
export const VIEW_W = (MAP_COLS + 0.5) * W;
export const VIEW_H = (MAP_ROWS - 1) * 0.75 * H + H;
export const CELL_R = SIZE;

/** 스플래툰 잉크처럼 쨍한 색들 — 이웃한 학생끼리 겹치지 않게 순서대로 돌려 쓴다. */
export const INK_COLORS = ["#ff2d8a", "#ffd000", "#22d36b", "#3d6bff", "#ff7a00", "#9b3cff", "#00c4dd", "#ff4040", "#a8e600", "#ff5ac8", "#00b894", "#6c5ce7"];

/** 아이디어 수 → 칠할 칸 수 */
export const cellsFor = (ideas: number) => (ideas > 0 ? 3 + ideas * 6 : 0);

export type Cell = { i: number; c: number; r: number; x: number; y: number };

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** 칸마다 정해진 작은 흔들림(섬 가장자리를 울퉁불퉁하게) */
const wobble = (c: number, r: number, seed: number) => {
  const v = Math.sin(c * 12.9898 + r * 78.233 + seed * 0.001) * 43758.5453;
  return v - Math.floor(v);
};

export function cellCenter(c: number, r: number) {
  return { x: (c + (r % 2 ? 1 : 0.5)) * W, y: SIZE + r * 0.75 * H };
}

export function neighbors(c: number, r: number): [number, number][] {
  const odd = r % 2 === 1;
  const d = odd ? [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]] : [[1, 0], [-1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  return d.map(([dc, dr]) => [c + dc, r + dr] as [number, number]).filter(([x, y]) => x >= 0 && y >= 0 && x < MAP_COLS && y < MAP_ROWS);
}

const idx = (c: number, r: number) => r * MAP_COLS + c;

/** 섬 모양(활동마다 조금씩 다르게) — 타원 + 가장자리 흔들림. */
export function islandCells(seedKey: string): Cell[] {
  const seed = hash(seedKey) % 100000;
  const cells: Cell[] = [];
  for (let r = 0; r < MAP_ROWS; r++) for (let c = 0; c < MAP_COLS; c++) {
    const { x, y } = cellCenter(c, r);
    const dx = (x - VIEW_W / 2) / (VIEW_W / 2 - W * 0.6); const dy = (y - VIEW_H / 2) / (VIEW_H / 2 - SIZE * 0.6);
    if (dx * dx + dy * dy < 0.9 + (wobble(c, r, seed) - 0.5) * 0.35) cells.push({ i: idx(c, r), c, r, x, y });
  }
  // 동떨어진 한두 칸(바다 위 점)은 지운다
  const has = new Set(cells.map(c => c.i));
  return cells.filter(cell => neighbors(cell.c, cell.r).filter(([c, r]) => has.has(idx(c, r))).length >= 2);
}

/**
 * 집 칸 자리들 — 서로 최대한 멀리 떨어진 칸을 차례로 고른다(가장 먼 점 고르기).
 * 앞쪽 자리일수록 고르게 퍼져 있어서, 참여 순서대로 앉히면 몇 명이든 섬 전체에 흩어진다.
 */
export function homeSlots(cells: Cell[], count: number, seedKey: string): number[] {
  if (!cells.length) return [];
  // 가장자리 바로 위는 잉크가 바다로 막히니 피한다
  const inner = cells.filter(cell => neighbors(cell.c, cell.r).filter(([c, r]) => cells.some(o => o.c === c && o.r === r)).length === 6);
  const pool = inner.length >= count ? inner : cells;
  const first = pool[hash(seedKey) % pool.length];
  const slots = [first]; const dist = pool.map(p => Math.hypot(p.x - first.x, p.y - first.y));
  while (slots.length < Math.min(count, pool.length)) {
    let best = 0; for (let k = 1; k < pool.length; k++) if (dist[k] > dist[best]) best = k;
    const pick = pool[best]; slots.push(pick);
    for (let k = 0; k < pool.length; k++) dist[k] = Math.min(dist[k], Math.hypot(pool[k].x - pick.x, pool[k].y - pick.y));
  }
  return slots.map(s => s.i);
}

export type Painter = { uid: string; ideas: number };
export type Territory = {
  cells: Cell[];
  /** 칸 번호 → 칠한 학생 순번(painters 순서), 안 칠했으면 없음 */
  owner: Map<number, number>;
  /** 학생 순번 → 집 칸 */
  homes: Cell[];
  /** 학생 순번 → 칠한 칸 수 */
  area: number[];
};

/**
 * 땅따먹기 계산. painters 는 처음 아이디어를 낸 순서 — 순서가 그대로면 이미 있는 학생의 집은 바뀌지 않는다.
 * 섬이 남아 있으면 아이디어 1개당 6칸씩, 꽉 차면 아이디어 비율만큼 칠한다.
 */
export function paintTerritory(seedKey: string, painters: Painter[]): Territory {
  const cells = islandCells(seedKey);
  const byIdx = new Map(cells.map(c => [c.i, c]));
  const slots = homeSlots(cells, Math.max(painters.length, 1), seedKey);
  const owner = new Map<number, number>();
  const homes: Cell[] = []; const area = painters.map(() => 0);
  // 섬이 다 찰 만큼 아이디어가 모이면 그때부터는 '아이디어 비율'만큼 나눠 칠한다(스플래툰 영역 %처럼).
  // 그래야 판이 꽉 찬 뒤에도 새 아이디어를 쓰면 내 땅이 넓어진다.
  let budget = painters.map(p => cellsFor(p.ideas));
  const want = budget.reduce((a, b) => a + b, 0);
  if (want > cells.length) {
    const total = painters.reduce((a, p) => a + p.ideas, 0);
    budget = painters.map(p => (p.ideas > 0 ? Math.max(1, Math.floor((cells.length * p.ideas) / total)) : 0));
  }
  const mine: Cell[][] = painters.map(() => []);
  painters.forEach((_, k) => {
    // 자리보다 학생이 많으면(아주 큰 반) 남은 칸 중 아무 데나
    let home = byIdx.get(slots[k] ?? -1);
    if (!home || owner.has(home.i)) home = cells.find(c => !owner.has(c.i)) ?? cells[0];
    homes.push(home);
    if (budget[k] > 0 && !owner.has(home.i)) { owner.set(home.i, k); area[k] = 1; mine[k] = [home]; }
  });
  // 한 칸씩: 목표 대비 가장 덜 칠한 학생이 집에서 가장 가까운 빈 이웃 칸을 칠한다.
  // 모두가 같은 비율로 함께 번져서, 아이디어가 많은 학생은 그만큼 넓게 자리를 잡는다.
  const stuck = new Set<number>();
  for (;;) {
    let k = -1;
    for (let j = 0; j < painters.length; j++) {
      if (stuck.has(j) || area[j] >= budget[j] || !mine[j].length) continue;
      if (k < 0 || area[j] / budget[j] < area[k] / budget[k] || (area[j] / budget[j] === area[k] / budget[k] && painters[j].ideas > painters[k].ideas)) k = j;
    }
    if (k < 0) break;
    const home = homes[k]; let best: Cell | null = null; let bestD = Infinity;
    for (const cell of mine[k]) for (const [c, r] of neighbors(cell.c, cell.r)) {
      const n = byIdx.get(idx(c, r));
      if (!n || owner.has(n.i)) continue;
      const d = Math.hypot(n.x - home.x, n.y - home.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (!best) { stuck.add(k); continue; }
    owner.set(best.i, k); area[k]++; mine[k].push(best);
  }
  return { cells, owner, homes, area };
}

/** 학생 순번 → 잉크 색 */
export const inkColor = (k: number) => INK_COLORS[k % INK_COLORS.length];
