import type { GameStage, LearningObject } from './types'
import { canCollect, getSizeTier } from './mechanics'
import type { WorldObstacle } from './worldPhysics'

export type PowerUpKind = 'magnet' | 'radar' | 'speed'

export interface PowerUpPickup {
  id: string
  kind: PowerUpKind
  position: [number, number, number]
}

export type ActivePowerUps = Record<PowerUpKind, number>

export const POWER_UP_ORDER: readonly PowerUpKind[] = [
  'radar',
  'magnet',
  'speed',
]

export const POWER_UP_CONFIG = {
  magnet: {
    label: '자석 배터리',
    durationMs: 10_000,
    maximumMs: 15_000,
  },
  radar: {
    label: '보물 레이더',
    durationMs: 12_000,
    maximumMs: 17_000,
  },
  speed: {
    label: '신속의 장화',
    durationMs: 10_000,
    maximumMs: 15_000,
  },
} as const

export const SPEED_POWER_UP_MULTIPLIER = 1.5
export const MAGNET_PULL_RADIUS = 8

export function createEmptyPowerUps(): ActivePowerUps {
  return {
    magnet: 0,
    radar: 0,
    speed: 0,
  }
}

export function activatePowerUp(
  active: ActivePowerUps,
  kind: PowerUpKind,
): ActivePowerUps {
  const config = POWER_UP_CONFIG[kind]

  return {
    ...active,
    [kind]: Math.min(
      config.maximumMs,
      Math.max(0, active[kind]) + config.durationMs,
    ),
  }
}

export function decayPowerUps(
  active: ActivePowerUps,
  elapsedMs: number,
): ActivePowerUps {
  const elapsed = Math.max(0, elapsedMs)

  return {
    magnet: Math.max(0, active.magnet - elapsed),
    radar: Math.max(0, active.radar - elapsed),
    speed: Math.max(0, active.speed - elapsed),
  }
}

export function hasActivePowerUp(active: ActivePowerUps): boolean {
  return POWER_UP_ORDER.some((kind) => active[kind] > 0)
}

export function getPowerUpSpeedMultiplier(
  active: ActivePowerUps,
): number {
  return active.speed > 0 ? SPEED_POWER_UP_MULTIPLIER : 1
}

const PICKUP_SLOTS: readonly [
  PowerUpKind,
  number,
  number,
][] = [
  ['magnet', -0.1, 0.12],
  ['radar', 0.15, 0.2],
  ['speed', -0.2, 0.21],
  ['magnet', 0.22, -0.15],
  ['radar', -0.25, -0.09],
  ['speed', 0.06, -0.25],
]

export function createPowerUpPickups(
  stage: Pick<GameStage, 'id' | 'mapSize'>,
): PowerUpPickup[] {
  return PICKUP_SLOTS.map(([kind, xRatio, zRatio], index) => ({
    id: `${stage.id}-power-up-${kind}-${index + 1}`,
    kind,
    position: [
      Number((stage.mapSize * xRatio).toFixed(2)),
      0,
      Number((stage.mapSize * zRatio).toFixed(2)),
    ],
  }))
}

const TREASURE_SIZES = [0.34, 0.66, 1.02, 1.36] as const
const TREASURE_POINTS = [60, 120, 210, 300] as const
const TREASURE_COLORS = ['#4DD0E1', '#7C73E6', '#F6C945', '#FF6F91'] as const
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export function createRadarTreasures(
  stage: Pick<GameStage, 'id' | 'mapSize'>,
): LearningObject[] {
  return Array.from({ length: 20 }, (_, index) => {
    const tierIndex = Math.floor(index / 5)
    const slotIndex = index % 5
    const angle = index * GOLDEN_ANGLE + tierIndex * 0.41
    const radius =
      stage.mapSize * (0.16 + slotIndex * 0.045 + tierIndex * 0.008)

    return {
      id: `${stage.id}-radar-treasure-${tierIndex + 1}-${slotIndex + 1}`,
      modelId: 'radar-treasure',
      stageId: stage.id,
      label: `${tierIndex + 1}단계 무지개 보물`,
      fact: '보물 레이더가 찾아낸 한정 보물이에요.',
      subject: '생활',
      size: TREASURE_SIZES[tierIndex],
      points: TREASURE_POINTS[tierIndex],
      color: TREASURE_COLORS[tierIndex],
      shape: 'sphere',
      position: [
        Number((Math.cos(angle) * radius).toFixed(2)),
        0,
        Number((Math.sin(angle) * radius).toFixed(2)),
      ],
      symbol: `${TREASURE_POINTS[tierIndex]}`,
    }
  })
}

export function selectVisibleRadarTreasures(
  treasures: LearningObject[],
  collectedIds: readonly string[],
  ballRadius: number,
  limit = 5,
): LearningObject[] {
  const collected = new Set(collectedIds)

  return treasures
    .filter(
      (treasure) =>
        !collected.has(treasure.id) &&
        canCollect(ballRadius, treasure.size),
    )
    .sort(
      (left, right) =>
        getSizeTier(right.size).level - getSizeTier(left.size).level ||
        left.id.localeCompare(right.id),
    )
    .slice(0, Math.max(0, limit))
}

export function isPowerUpTouchingBall(
  ballPosition: { x: number; y: number; z: number },
  ballRadius: number,
  pickup: Pick<PowerUpPickup, 'position'>,
): boolean {
  return (
    Math.hypot(
      pickup.position[0] - ballPosition.x,
      pickup.position[1] + 0.55 - ballPosition.y,
      pickup.position[2] - ballPosition.z,
    ) <
    ballRadius + 0.72
  )
}

function distanceToSegment(
  pointX: number,
  pointZ: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
): number {
  const segmentX = endX - startX
  const segmentZ = endZ - startZ
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ
  if (lengthSquared <= 0.0001) {
    return Math.hypot(pointX - startX, pointZ - startZ)
  }
  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((pointX - startX) * segmentX + (pointZ - startZ) * segmentZ) /
        lengthSquared,
    ),
  )

  return Math.hypot(
    pointX - (startX + segmentX * ratio),
    pointZ - (startZ + segmentZ * ratio),
  )
}

export function canMagnetAttract(
  ballPosition: { x: number; y: number; z: number },
  ballRadius: number,
  itemPosition: { x: number; y: number; z: number },
  itemSize: number,
  obstacles: readonly WorldObstacle[],
): boolean {
  if (!canCollect(ballRadius, itemSize)) return false
  const horizontalDistance = Math.hypot(
    itemPosition.x - ballPosition.x,
    itemPosition.z - ballPosition.z,
  )
  if (horizontalDistance > MAGNET_PULL_RADIUS + ballRadius) return false
  if (Math.abs(itemPosition.y - ballPosition.y) > ballRadius + 2.2) {
    return false
  }

  return obstacles.every(
    (obstacle) =>
      distanceToSegment(
        obstacle.x,
        obstacle.z,
        ballPosition.x,
        ballPosition.z,
        itemPosition.x,
        itemPosition.z,
      ) >
      obstacle.radius + 0.22,
  )
}

export function stepMagnetPosition(
  position: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  delta: number,
): { x: number; y: number; z: number } {
  const frameDelta = Math.min(Math.max(0, delta), 1 / 30)
  const distance = Math.hypot(
    target.x - position.x,
    target.y - position.y,
    target.z - position.z,
  )
  if (distance <= 0.001) return { ...target }
  const speed = Math.min(14, 4.5 + distance * 1.25)
  const ratio = Math.min(1, (speed * frameDelta) / distance)

  return {
    x: position.x + (target.x - position.x) * ratio,
    y: position.y + (target.y - position.y) * ratio,
    z: position.z + (target.z - position.z) * ratio,
  }
}
