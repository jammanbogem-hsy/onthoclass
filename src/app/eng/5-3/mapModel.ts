// 길찾기 지도의 좌표/시뮬레이션 엔진 (순수 로직, 렌더링 의존 없음).
//
// 좌표계
//  · N×N 블록. 각 블록 안에 4개 슬롯(2×2: TL,TR,BL,BR).
//  · 도로선(road line) 0..N (가로/세로 각각 N+1개). 블록 c 는 도로선 c 와 c+1 사이.
//  · 교차점(intersection) (x,y), x,y ∈ 0..N. 사람은 교차점 사이 도로를 걷는다.
//  · 시작점은 내부 도로선(1..N-1) 끝의 가장자리 화살표.
//
// 레이아웃 트랙: [RP, BLOCK, RW, BLOCK, RW, …, BLOCK, RP]  (도로/블록 교대, 2N+1개)
//  - 짝수 트랙 = 도로선(0..N), 홀수 트랙 = 블록(0..N-1)
//  - 양끝 도로(RP)는 화살표 거터를 겸한다.
import type { GridSize, Start, StartSide } from "./types";

// 슬롯: 0=TL,1=TR,2=BL,3=BR
export const SLOTS = [0, 1, 2, 3] as const;
export type Slot = 0 | 1 | 2 | 3;
/** 슬롯의 블록 내 (서브행, 서브열) */
export function slotSub(slot: Slot): { sr: 0 | 1; sc: 0 | 1 } {
  return { sr: (slot < 2 ? 0 : 1) as 0 | 1, sc: (slot % 2) as 0 | 1 };
}

export function boardLen(n: GridSize): number {
  return n * n * 4;
}
/** (블록열 c, 블록행 r, 슬롯) → board 인덱스 */
export function slotIndex(c: number, r: number, slot: Slot, n: GridSize): number {
  return (r * n + c) * 4 + slot;
}
/** board 인덱스 → 블록열/행/슬롯 */
export function fromIndex(idx: number, n: GridSize): { c: number; r: number; slot: Slot } {
  const slot = (idx % 4) as Slot;
  const b = Math.floor(idx / 4);
  return { c: b % n, r: Math.floor(b / n), slot };
}

export type Node = { x: number; y: number };
// 방향: 0=위(N),1=오른(E),2=아래(S),3=왼(W)
export type Dir = 0 | 1 | 2 | 3;
const VEC: Record<Dir, Node> = {
  0: { x: 0, y: -1 },
  1: { x: 1, y: 0 },
  2: { x: 0, y: 1 },
  3: { x: -1, y: 0 },
};
export function turn(dir: Dir, t: "left" | "right"): Dir {
  return (t === "left" ? (dir + 3) % 4 : (dir + 1) % 4) as Dir;
}

/** 시작 화살표 → 출발 교차점 + 방향 */
export function startNode(start: Start, n: GridSize): { node: Node; dir: Dir } {
  const L = start.line;
  switch (start.side) {
    case "top":
      return { node: { x: L, y: 0 }, dir: 2 };
    case "bottom":
      return { node: { x: L, y: n }, dir: 0 };
    case "left":
      return { node: { x: 0, y: L }, dir: 1 };
    case "right":
      return { node: { x: n, y: L }, dir: 3 };
  }
}

/** 가능한 모든 가장자리 진입 화살표(내부 도로선 1..N-1 × 4변) */
export function allStarts(n: GridSize): Start[] {
  const sides: StartSide[] = ["top", "right", "bottom", "left"];
  const out: Start[] = [];
  for (const side of sides) for (let line = 1; line < n; line++) out.push({ side, line });
  return out;
}

export type SimStep = { blocks: number; turn: "left" | "right" };
export type SimResult = { path: Node[]; final: Node; dir: Dir };

/** 안내 단계대로 워커를 이동시켜 경로를 만든다.
 *  각 단계: 현재 방향으로 blocks 칸 직진(경계 밖이면 멈춤) → 좌/우 회전. */
export function simulate(start: Start, steps: SimStep[], n: GridSize): SimResult {
  const s = startNode(start, n);
  let node = s.node;
  let dir = s.dir;
  const path: Node[] = [{ ...node }];
  for (const step of steps) {
    const v = VEC[dir];
    for (let k = 0; k < step.blocks; k++) {
      const nx = node.x + v.x;
      const ny = node.y + v.y;
      if (nx < 0 || nx > n || ny < 0 || ny > n) break; // 경계 밖 → 멈춤
      node = { x: nx, y: ny };
      path.push({ ...node });
    }
    dir = turn(dir, step.turn);
  }
  return { path, final: node, dir };
}

/** 목적지 건물(슬롯 인덱스)의 블록 네 모서리 교차점 */
export function blockCorners(targetIdx: number, n: GridSize): Node[] {
  const { c, r } = fromIndex(targetIdx, n);
  return [
    { x: c, y: r },
    { x: c + 1, y: r },
    { x: c, y: r + 1 },
    { x: c + 1, y: r + 1 },
  ];
}

/** 워커 최종 위치가 목적지 블록에 닿았는가(도착 판정) */
export function arrived(final: Node, targetIdx: number, n: GridSize): boolean {
  return blockCorners(targetIdx, n).some((p) => p.x === final.x && p.y === final.y);
}

// ─────────────────────────── 픽셀 레이아웃 ───────────────────────────

export type Layout = {
  n: GridSize;
  size: number; // 정사각 한 변(px)
  template: string; // CSS grid-template (행=열 동일)
  roadCenter: (line: number) => number; // 도로선 → 중심 px
  RP: number;
  RW: number;
  BLOCK: number;
};

export function layout(n: GridSize): Layout {
  const BLOCK = n === 3 ? 128 : 100; // 블록(건물칸) 크게 — 교실 화면/태블릿 가독성
  const RW = 18; // 내부 도로 폭
  const RP = 32; // 가장자리 도로(화살표 거터) 폭
  const widths: number[] = [];
  for (let t = 0; t <= 2 * n; t++) {
    if (t % 2 === 0) widths.push(t === 0 || t === 2 * n ? RP : RW);
    else widths.push(BLOCK);
  }
  const centers: number[] = [];
  let cum = 0;
  for (const w of widths) {
    centers.push(cum + w / 2);
    cum += w;
  }
  return {
    n,
    size: cum,
    template: widths.map((w) => `${w}px`).join(" "),
    roadCenter: (line: number) => centers[2 * line],
    RP,
    RW,
    BLOCK,
  };
}
