// 뿌요뿌요 컴퓨터 친구 — 선생님 '테스트 플레이'에서 함께 겨루는 상대.
// 이번 뿌요를 놓을 수 있는 모든 자리(열 6 × 방향 4)를 엔진으로 미리 떨어뜨려 보고,
// 얻는 점수 + 같은 색끼리 붙은 정도 − 쌓인 높이로 점수를 매겨 고른다.
// skill 확률로 가장 좋은 수를, 나머지는 상위 몇 수 중 하나를 골라 사람처럼 실수한다.
// 순수 모듈(화면·파이어베이스 의존 없음) — tests/puyo-quiz.test.cjs 에서 함께 검사한다.
import { cloneState, COLS, fits, input, ROWS, tick, type PuyoState } from "@/lib/puyo-engine";

export type BotMove = { x: number; r: number };

function shape(board: PuyoState["board"]) {
  let joined = 0; let heights = 0; let spawn = 0;
  for (let x = 0; x < COLS; x++) {
    let h = 0;
    for (let y = 1; y < ROWS; y++) {
      const c = board[y * COLS + x]; if (!c) continue;
      if (!h) h = ROWS - y;
      if (c === 5) continue;
      if (x + 1 < COLS && board[y * COLS + x + 1] === c) joined++;
      if (y + 1 < ROWS && board[(y + 1) * COLS + x] === c) joined++;
    }
    heights += h * h;
    if (x === 2) spawn = h;
  }
  // 가운데 위(나오는 자리)가 막히면 판이 끝나므로 크게 피한다
  return joined * 12 - heights * 0.6 - (spawn >= 9 ? 400 : 0);
}

/** 조작 중인 뿌요가 지금 높이에서 목표 열까지 옆으로 갈 수 있는가(벽·쌓인 뿌요에 막히지 않는가). */
function reachable(s: PuyoState, move: BotMove) {
  const p = s.active!; const step = move.x > p.x ? 1 : -1;
  for (let x = p.x; x !== move.x; x += step) if (!fits(s, { ...p, x, r: move.r })) return false;
  return fits(s, { ...p, ...move });
}

export function planMove(s: PuyoState, skill = 0.75, random: () => number = Math.random): BotMove | null {
  if (!s.active || s.phase !== "fall") return null;
  const scored: { move: BotMove; value: number }[] = [];
  for (let r = 0; r < 4; r++) for (let x = 0; x < COLS; x++) {
    const move = { x, r };
    if (!reachable(s, move)) continue;
    const sim = cloneState(s);
    sim.active = { ...sim.active!, ...move };
    input(sim, "drop");
    for (let k = 0; k < 6 && sim.phase !== "fall" && sim.phase !== "over"; k++) tick(sim, 2000);
    const value = (sim.score - s.score) + shape(sim.board) - (sim.phase === "over" ? 100000 : 0);
    scored.push({ move, value });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.value - a.value);
  if (random() < skill) return scored[0].move;
  return scored[Math.floor(random() * Math.min(4, scored.length))].move;
}

/** 고른 자리로 옮겨 바로 떨어뜨린다. 그사이 판이 바뀌어 못 가면 지금 자리에 떨어뜨린다. */
export function playMove(s: PuyoState, move: BotMove) {
  if (!s.active) return;
  if (reachable(s, move)) s.active = { ...s.active, ...move };
  input(s, "drop");
}
