// 아이소 플레이 이동: 화면 기준 입력 → 화면 속도가 일정한 격자 속도, 실제 이동량 기준 8방향·걷기 위상.
// 탑뷰는 기존 격자 속도를 유지하며 실제 이동 거리만 보행 박자에 반영한다.
import { isometric, topDown } from "../render/projection";
import type { PlayerState, PlayWorld } from "./play";
import { characterGaitFrame } from "../server/workshop/character-sprite";

/** 입체 화면 이동 속도(px/s, 줌 1). 짧은 보폭에 맞춘 탐험 속도. */
export const ISO_SCREEN_SPEED = 3.2 * 64;
/** 좌우 한 걸음씩의 전체 주기. 이전보다 발 디딤이 약 두 배 여유롭다. */
export const WALK_CYCLE_PX = 128;
export const WALK_STRIDE_PX = WALK_CYCLE_PX / 4;
export const WALK_PREVIEW_HZ = ISO_SCREEN_SPEED / WALK_CYCLE_PX;
const ISO_ACCELERATION = 1400;

/** 8방향(화면 기준): 0 남, 1 남서, 2 서, 3 북서, 4 북, 5 북동, 6 동, 7 남동 */
export const DIR8 = ["s", "sw", "w", "nw", "n", "ne", "e", "se"] as const;

export function screenDir8(dx: number, dy: number): number {
  // atan2: 동=0°, 남=90°(화면 아래), 서=180°, 북=−90°
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const byAngle = [6, 7, 0, 1, 2, 3, 4, 5]; // 동부터 45°씩: 동, 남동, 남, 남서, 서, 북서, 북, 북동
  return byAngle[((Math.round(deg / 45) % 8) + 8) % 8];
}
export function stableScreenDir8(
  dx: number,
  dy: number,
  previous?: number,
): number {
  if (previous === undefined) return screenDir8(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const center = [90, 135, 180, 225, 270, 315, 0, 45][previous];
  const delta = ((angle - center + 540) % 360) - 180;
  return Math.abs(delta) <= 28.5 ? previous : screenDir8(dx, dy);
}

/** 8방향 → 격자 4방향(탑뷰/기존 dir 필드 호환): 0 남, 1 서, 2 북, 3 동 */
export function dir8ToGridDir(d8: number): number {
  // 화면 남(아래)=격자 (+,+) → 화면 기준 가까운 격자 축으로 근사
  return [0, 0, 1, 1, 2, 2, 3, 3][d8] ?? 0;
}

export function moveIso(
  world: PlayWorld,
  p: PlayerState,
  ix: number,
  iy: number,
  dt: number,
): PlayerState {
  const len = Math.hypot(ix, iy);
  if (len < 0.12 || dt <= 0)
    return { ...p, moving: false, walk: 0, screenVelocity: { x: 0, y: 0 } };
  const speed = ISO_SCREEN_SPEED * Math.min(1, len);
  const target = { x: (ix / len) * speed, y: (iy / len) * speed };
  const old = p.screenVelocity ?? { x: 0, y: 0 };
  const change = Math.hypot(target.x - old.x, target.y - old.y);
  const rate =
    old.x * target.x + old.y * target.y < 0
      ? ISO_ACCELERATION * 1.8
      : ISO_ACCELERATION;
  const blend = change ? Math.min(1, (rate * dt) / change) : 1;
  const velocity = {
    x: old.x + (target.x - old.x) * blend,
    y: old.y + (target.y - old.y) * blend,
  };
  // 프레임 중 목표 속도에 도달하는 시점까지 적분해 30/60fps에서 같은 거리를 간다.
  const ramp = Math.min(dt, change / rate);
  const travel = {
    x: ((old.x + velocity.x) * 0.5 * ramp + velocity.x * (dt - ramp)) / dt,
    y: ((old.y + velocity.y) * 0.5 * ramp + velocity.y * (dt - ramp)) / dt,
  };
  // 화면 속도 벡터 → 격자 속도(toGround 는 선형)
  const g = isometric.toGround(travel.x, travel.y);
  const moved = world.stepVelocity(p, g.x, g.y, dt);
  const a = isometric.toScreen(p.x, p.y);
  const b = isometric.toScreen(moved.x, moved.y);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const intended = screenDir8(ix, iy);
  if (dist < 1e-4) {
    // 벽에 막혀 거의 못 움직이면 대기 자세로 입력 방향을 바라본다
    return {
      ...moved,
      face8: intended,
      dir: dir8ToGridDir(intended),
      moving: false,
      walk: 0,
      screenVelocity: { x: 0, y: 0 },
    };
  }
  // 벽을 따라 미끄러질 때는 실제로 움직인 방향을 바라본다
  const face8 = stableScreenDir8(dx, dy, p.moving ? p.face8 : undefined);
  return {
    ...moved,
    face8,
    dir: dir8ToGridDir(face8),
    moving: true,
    screenVelocity: velocity,
    walk: (p.moving ? (p.walk ?? 0) : 0) + dist,
  };
}

export function walkPhase(p: PlayerState): number {
  return p.moving ? ((p.walk ?? 0) / WALK_CYCLE_PX) % 1 : 0;
}
/** 위에서 보기도 이동 거리로 보행 박자를 맞추되 격자 속도는 유지한다. */
export function moveTopDown(
  world: PlayWorld,
  p: PlayerState,
  ix: number,
  iy: number,
  dt: number,
): PlayerState {
  const moved = world.step(p, ix, iy, dt),
    a = topDown.toScreen(p.x, p.y),
    b = topDown.toScreen(moved.x, moved.y);
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const dx = moved.x - p.x, dy = moved.y - p.y;
  const dir = distance > 1e-4 ? (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 3) : dy < 0 ? 2 : 0) : moved.dir;
  return {
    ...moved,
    dir,
    face8: undefined,
    moving: distance > 1e-4,
    screenVelocity: undefined,
    walk: distance > 1e-4 ? (p.moving ? (p.walk ?? 0) : 0) + distance : 0,
  };
}
/** 새 시트는 좌·우 통과 동작을 각기 쓰고, 예전 시트는 호환 재생한다. */
export function walkFrame(p: PlayerState, columns: 4 | 5 = 5): number {
  return characterGaitFrame(walkPhase(p), p.moving, columns);
}
