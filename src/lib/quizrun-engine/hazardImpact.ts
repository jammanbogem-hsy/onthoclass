export type HazardKind = 'runner' | 'polar-bear'

export interface HazardPoint {
  x: number
  z: number
}

export interface HazardImpactObstacle extends HazardPoint {
  radius: number
}

export interface HazardKnockback {
  directionX: number
  directionZ: number
  targetX: number
  targetZ: number
  horizontalSpeed: number
  verticalSpeed: number
  controlLockMs: number
}

const CANDIDATE_ANGLE_OFFSETS = [
  0,
  Math.PI / 9,
  -Math.PI / 9,
  (Math.PI * 2) / 9,
  (-Math.PI * 2) / 9,
  (Math.PI * 7) / 18,
  (-Math.PI * 7) / 18,
  (Math.PI * 11) / 18,
  (-Math.PI * 11) / 18,
  Math.PI,
] as const

function isPathClear(
  player: HazardPoint,
  target: HazardPoint,
  ballRadius: number,
  obstacles: readonly HazardImpactObstacle[],
): boolean {
  for (let step = 1; step <= 5; step += 1) {
    const progress = step / 5
    const x = player.x + (target.x - player.x) * progress
    const z = player.z + (target.z - player.z) * progress
    if (
      obstacles.some(
        (obstacle) =>
          Math.hypot(x - obstacle.x, z - obstacle.z) <
          obstacle.radius + ballRadius + 0.9,
      )
    ) {
      return false
    }
  }
  return true
}

export function createHazardKnockback(
  player: HazardPoint,
  hazard: HazardPoint,
  fallbackDirection: HazardPoint,
  mapSize: number,
  ballRadius: number,
  obstacles: readonly HazardImpactObstacle[],
  kind: HazardKind,
): HazardKnockback {
  const rawAwayX = player.x - hazard.x
  const rawAwayZ = player.z - hazard.z
  const awayLength = Math.hypot(rawAwayX, rawAwayZ)
  const fallbackLength = Math.max(
    0.001,
    Math.hypot(fallbackDirection.x, fallbackDirection.z),
  )
  const awayX =
    awayLength > 0.05
      ? rawAwayX / awayLength
      : fallbackDirection.x / fallbackLength
  const awayZ =
    awayLength > 0.05
      ? rawAwayZ / awayLength
      : fallbackDirection.z / fallbackLength
  const baseAngle = Math.atan2(awayZ, awayX)
  const targetDistance = kind === 'polar-bear' ? 5.2 : 3.8
  const edge = Math.max(2, mapSize / 2 - ballRadius - 4)

  let targetX = Math.max(-edge, Math.min(edge, player.x + awayX * 2.4))
  let targetZ = Math.max(-edge, Math.min(edge, player.z + awayZ * 2.4))

  for (const angleOffset of CANDIDATE_ANGLE_OFFSETS) {
    const angle = baseAngle + angleOffset
    const candidate = {
      x: player.x + Math.cos(angle) * targetDistance,
      z: player.z + Math.sin(angle) * targetDistance,
    }
    if (Math.abs(candidate.x) > edge || Math.abs(candidate.z) > edge) continue
    if (!isPathClear(player, candidate, ballRadius, obstacles)) continue
    targetX = candidate.x
    targetZ = candidate.z
    break
  }

  const directionLength = Math.max(
    0.001,
    Math.hypot(targetX - player.x, targetZ - player.z),
  )

  return {
    directionX: (targetX - player.x) / directionLength,
    directionZ: (targetZ - player.z) / directionLength,
    targetX,
    targetZ,
    horizontalSpeed: kind === 'polar-bear' ? 7.2 : 6.2,
    verticalSpeed: kind === 'polar-bear' ? 3.6 : 3,
    controlLockMs: kind === 'polar-bear' ? 620 : 520,
  }
}
