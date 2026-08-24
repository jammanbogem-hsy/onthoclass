import type { GameStage, LearningObject } from './types'
import { canCollect, getSizeTier } from './mechanics'
import {
  createWorldPhysicsLayout,
  type WorldObstacle,
  type WorldPhysicsLayout,
} from './worldPhysics'

export type PowerUpKind = 'magnet' | 'radar' | 'speed'

export interface PowerUpPickup {
  id: string
  kind: PowerUpKind
  position: [number, number, number]
  slot: number
  generation: number
  collectibleAt: number
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
    durationMs: 30_000,
    maximumMs: 45_000,
  },
  speed: {
    label: '신속의 장화',
    durationMs: 10_000,
    maximumMs: 15_000,
  },
} as const

export const SPEED_POWER_UP_MULTIPLIER = 1.5
export const MAGNET_PULL_RADIUS = 8
export const POWER_UP_MODEL_SCALE_MULTIPLIER = 1.3
export const POWER_UPS_PER_KIND = 3
export const POWER_UP_RESPAWN_DELAY_MS = 700

export function getPowerUpVisualScale(kind: PowerUpKind): number {
  const baseScale = kind === 'radar' ? 1 : 0.78
  return baseScale * POWER_UP_MODEL_SCALE_MULTIPLIER
}

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

type PowerUpSpawnStage = Pick<
  GameStage,
  'id' | 'mapSize' | 'theme' | 'objects'
>

interface PowerUpPlayerPosition {
  x: number
  z: number
}

const POWER_UP_SPAWN_ATTEMPTS = 160
const POWER_UP_ALL_ITEM_CLEARANCE = 6
const POWER_UP_SAME_KIND_CLEARANCE = 12
const POWER_UP_EDGE_CLEARANCE = 6

function stableHash(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function getSpawnCandidate(
  stage: PowerUpSpawnStage,
  kind: PowerUpKind,
  slot: number,
  generation: number,
  attempt: number,
): [number, number, number] {
  const seed = stableHash(
    `${stage.id}:${kind}:${slot}:${generation}`,
  )
  const seedAngle = ((seed % 10_000) / 10_000) * Math.PI * 2
  const angle = seedAngle + attempt * GOLDEN_ANGLE
  const radiusStep = ((seed >>> 9) + attempt * 7) % 11
  const radius = stage.mapSize * (0.17 + radiusStep * 0.019)

  return [
    Number((Math.cos(angle) * radius).toFixed(2)),
    0,
    Number((Math.sin(angle) * radius).toFixed(2)),
  ]
}

function isOutsideRotatedFootprint(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  halfWidth: number,
  halfDepth: number,
  rotationY: number,
  clearance: number,
): boolean {
  const offsetX = x - centerX
  const offsetZ = z - centerZ
  const cosine = Math.cos(rotationY)
  const sine = Math.sin(rotationY)
  const localX = offsetX * cosine - offsetZ * sine
  const localZ = offsetX * sine + offsetZ * cosine

  return (
    Math.abs(localX) > halfWidth + clearance ||
    Math.abs(localZ) > halfDepth + clearance
  )
}

function isSafePowerUpPosition(
  stage: PowerUpSpawnStage,
  layout: WorldPhysicsLayout,
  position: [number, number, number],
  kind: PowerUpKind,
  activePickups: readonly PowerUpPickup[],
  playerPosition: PowerUpPlayerPosition,
  checkLearningObjects: boolean,
): boolean {
  const [x, , z] = position
  const mapEdge = stage.mapSize / 2 - POWER_UP_EDGE_CLEARANCE
  if (Math.abs(x) > mapEdge || Math.abs(z) > mapEdge) return false

  const playerClearance = Math.max(14, stage.mapSize * 0.1)
  if (
    Math.hypot(x - playerPosition.x, z - playerPosition.z) <
    playerClearance
  ) {
    return false
  }

  if (
    activePickups.some((pickup) => {
      const clearance =
        pickup.kind === kind
          ? POWER_UP_SAME_KIND_CLEARANCE
          : POWER_UP_ALL_ITEM_CLEARANCE
      return (
        Math.hypot(
          x - pickup.position[0],
          z - pickup.position[2],
        ) < clearance
      )
    })
  ) {
    return false
  }

  if (
    layout.obstacles.some(
      (obstacle) =>
        Math.hypot(x - obstacle.x, z - obstacle.z) <
        obstacle.radius + 1.5,
    )
  ) {
    return false
  }

  if (
    layout.pushableProps.some(
      (prop) => Math.hypot(x - prop.x, z - prop.z) < 2.5,
    )
  ) {
    return false
  }

  if (
    layout.terrainRamps.some(
      (ramp) =>
        !isOutsideRotatedFootprint(
          x,
          z,
          ramp.x,
          ramp.z,
          ramp.halfWidth,
          ramp.halfDepth,
          ramp.rotationY,
          1.8,
        ),
    ) ||
    layout.elevatedPlatforms.some(
      (platform) =>
        !isOutsideRotatedFootprint(
          x,
          z,
          platform.x,
          platform.z,
          platform.halfWidth,
          platform.halfDepth,
          platform.rotationY,
          2,
        ),
    ) ||
    layout.elevators.some(
      (elevator) =>
        !isOutsideRotatedFootprint(
          x,
          z,
          elevator.x,
          elevator.z,
          elevator.halfWidth,
          elevator.halfDepth,
          0,
          2,
        ),
    )
  ) {
    return false
  }

  if (
    layout.surfaceZones.some(
      (zone) =>
        (zone.kind === 'water' || zone.kind === 'mud') &&
        !isOutsideRotatedFootprint(
          x,
          z,
          zone.x,
          zone.z,
          zone.halfWidth,
          zone.halfDepth,
          zone.rotationY,
          1,
        ),
    )
  ) {
    return false
  }

  return (
    !checkLearningObjects ||
    stage.objects.every(
      (item) =>
        item.position[1] > 0.5 ||
        Math.hypot(x - item.position[0], z - item.position[2]) >
          Math.max(1.5, item.size + 0.7),
    )
  )
}

function createPowerUpPickup(
  stage: PowerUpSpawnStage,
  kind: PowerUpKind,
  slot: number,
  generation: number,
  activePickups: readonly PowerUpPickup[],
  playerPosition: PowerUpPlayerPosition,
  collectibleAt: number,
  layout: WorldPhysicsLayout,
): PowerUpPickup {
  let fallbackPosition = getSpawnCandidate(
    stage,
    kind,
    slot,
    generation,
    0,
  )

  for (let pass = 0; pass < 2; pass += 1) {
    for (let attempt = 0; attempt < POWER_UP_SPAWN_ATTEMPTS; attempt += 1) {
      const candidate = getSpawnCandidate(
        stage,
        kind,
        slot,
        generation,
        attempt + pass * POWER_UP_SPAWN_ATTEMPTS,
      )
      fallbackPosition = candidate
      if (
        isSafePowerUpPosition(
          stage,
          layout,
          candidate,
          kind,
          activePickups,
          playerPosition,
          pass === 0,
        )
      ) {
        return {
          id: `${stage.id}-power-up-${kind}-s${slot + 1}-g${generation}`,
          kind,
          position: candidate,
          slot,
          generation,
          collectibleAt,
        }
      }
    }
  }

  return {
    id: `${stage.id}-power-up-${kind}-s${slot + 1}-g${generation}`,
    kind,
    position: fallbackPosition,
    slot,
    generation,
    collectibleAt,
  }
}

export function createPowerUpPickups(
  stage: PowerUpSpawnStage,
): PowerUpPickup[] {
  const layout = createWorldPhysicsLayout(stage)
  const pickups: PowerUpPickup[] = []

  for (const kind of POWER_UP_ORDER) {
    for (let slot = 0; slot < POWER_UPS_PER_KIND; slot += 1) {
      pickups.push(
        createPowerUpPickup(
          stage,
          kind,
          slot,
          0,
          pickups,
          { x: 0, z: 0 },
          0,
          layout,
        ),
      )
    }
  }

  return pickups
}

export function respawnPowerUpPickup(
  stage: PowerUpSpawnStage,
  activePickups: readonly PowerUpPickup[],
  collectedPickupId: string,
  playerPosition: PowerUpPlayerPosition,
  now = Date.now(),
): PowerUpPickup[] {
  const collectedIndex = activePickups.findIndex(
    (pickup) => pickup.id === collectedPickupId,
  )
  if (collectedIndex < 0) return [...activePickups]

  const collected = activePickups[collectedIndex]
  const remaining = activePickups.filter(
    (pickup) => pickup.id !== collectedPickupId,
  )
  const replacement = createPowerUpPickup(
    stage,
    collected.kind,
    collected.slot,
    collected.generation + 1,
    remaining,
    playerPosition,
    now + POWER_UP_RESPAWN_DELAY_MS,
    createWorldPhysicsLayout(stage),
  )

  return activePickups.map((pickup) =>
    pickup.id === collectedPickupId ? replacement : pickup,
  )
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
