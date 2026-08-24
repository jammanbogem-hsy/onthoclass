export const INITIAL_PLAYER_RADIUS = 0.42
export const PLAYER_FLOOR_CLEARANCE = 0.02

export interface PlayerTranslation {
  x: number
  y: number
  z: number
}

export function getPlayerSpawnTranslation(
  x = 0,
  z = 0,
): [number, number, number] {
  return [
    x,
    INITIAL_PLAYER_RADIUS + PLAYER_FLOOR_CLEARANCE,
    z,
  ]
}

export function getPlayerColliderRadius(ballRadius: number): number {
  return Math.max(INITIAL_PLAYER_RADIUS, ballRadius)
}

export function preservePlayerFootHeightWhileGrowing(
  current: PlayerTranslation,
  previousRadius: number,
  nextRadius: number,
): PlayerTranslation {
  const growth = Math.max(0, nextRadius - previousRadius)
  return {
    x: current.x,
    y: current.y + growth,
    z: current.z,
  }
}
