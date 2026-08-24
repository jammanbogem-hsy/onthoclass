import type { GameStage, LearningObject } from './types'
import { createWorldPhysicsLayout, type WorldPhysicsLayout } from './worldPhysics'

export const POLAR_BEAR_DROP_COUNT = 5
export const POLAR_BEAR_HIT_COOLDOWN_MS = 10_000
export const RUNNER_DROP_COUNT = 5
export const RUNNER_HIT_COOLDOWN_MS = 4_000

export interface DroppedObjectMotion {
  origin: [number, number, number]
  linearVelocity: [number, number, number]
  angularVelocity: [number, number, number]
}

export interface DroppedLearningObject extends LearningObject {
  dropMotion: DroppedObjectMotion
}

export interface DropCenter {
  x: number
  y?: number
  z: number
  ballRadius?: number
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
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

function isDropPositionSafe(
  stage: Pick<GameStage, 'mapSize'>,
  layout: WorldPhysicsLayout,
  position: [number, number, number],
  occupied: readonly LearningObject[],
): boolean {
  const [x, , z] = position
  const edge = stage.mapSize / 2 - 4
  if (Math.abs(x) > edge || Math.abs(z) > edge) return false

  if (
    occupied.some(
      (item) =>
        Math.hypot(x - item.position[0], z - item.position[2]) < 2.2,
    )
  ) {
    return false
  }

  if (
    layout.obstacles.some(
      (obstacle) =>
        Math.hypot(x - obstacle.x, z - obstacle.z) <
        obstacle.radius + 1.1,
    ) ||
    layout.pushableProps.some(
      (prop) => Math.hypot(x - prop.x, z - prop.z) < 1.8,
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
          1.2,
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
          1.4,
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
          1.4,
        ),
    ) ||
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
          0.8,
        ),
    )
  ) {
    return false
  }

  return true
}

function findDropPosition(
  stage: Pick<GameStage, 'mapSize'>,
  layout: WorldPhysicsLayout,
  center: DropCenter,
  seed: number,
  occupied: readonly LearningObject[],
  preferredAngle?: number,
): [number, number, number] {
  let fallback: [number, number, number] = [center.x, 0, center.z]

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const angle =
      (preferredAngle ?? ((seed % 360) / 180) * Math.PI) +
      attempt * 2.399963229728653
    const distance = 2.8 + ((seed + attempt * 5) % 9) * 0.24
    const candidate: [number, number, number] = [
      Number((center.x + Math.cos(angle) * distance).toFixed(2)),
      0,
      Number((center.z + Math.sin(angle) * distance).toFixed(2)),
    ]
    fallback = candidate
    if (isDropPositionSafe(stage, layout, candidate, occupied)) {
      return candidate
    }
  }

  const edge = stage.mapSize / 2 - 4
  return [
    Math.max(-edge, Math.min(edge, fallback[0])),
    0,
    Math.max(-edge, Math.min(edge, fallback[2])),
  ]
}

export function createDroppedObjectMotion(
  item: LearningObject,
  center: DropCenter,
  seed: number,
): DroppedObjectMotion {
  const flightSeconds = 0.68 + (seed % 5) * 0.035
  const objectRadius = Math.max(0.18, Math.min(0.72, item.size * 0.52))
  const targetCenterY = item.position[1] + objectRadius
  const playerCenterY = center.y ?? Math.max(0.42, center.ballRadius ?? 0.42)
  const targetOffsetX = item.position[0] - center.x
  const targetOffsetZ = item.position[2] - center.z
  const targetDistance = Math.hypot(targetOffsetX, targetOffsetZ) || 1
  const launchClearance = (center.ballRadius ?? 0.42) + objectRadius + 0.1
  const originX = center.x + (targetOffsetX / targetDistance) * launchClearance
  const originZ = center.z + (targetOffsetZ / targetDistance) * launchClearance
  const originY = Math.max(
    targetCenterY + 0.75,
    playerCenterY + (center.ballRadius ?? 0.42) * 0.72,
  )
  const verticalVelocity =
    (targetCenterY - originY + 8 * flightSeconds * flightSeconds) /
    flightSeconds
  const spinDirection = seed % 2 === 0 ? 1 : -1

  return {
    origin: [originX, originY, originZ],
    linearVelocity: [
      (item.position[0] - originX) / flightSeconds,
      verticalVelocity,
      (item.position[2] - originZ) / flightSeconds,
    ],
    angularVelocity: [
      spinDirection * (4.2 + (seed % 7) * 0.46),
      ((seed >>> 3) % 2 === 0 ? 1 : -1) * (3.6 + (seed % 5) * 0.42),
      -spinDirection * (4.8 + (seed % 6) * 0.38),
    ],
  }
}

function createEncounterDroppedObjects(
  stage: Pick<GameStage, 'id' | 'mapSize' | 'theme'>,
  attachedObjects: readonly LearningObject[],
  existingDroppedObjects: readonly LearningObject[],
  center: DropCenter,
  hitCount: number,
  encounterKey: string,
  count: number,
  impactSource?: DropCenter,
): DroppedLearningObject[] {
  const seed = `${stage.id}:${encounterKey}:${Math.max(0, hitCount)}`
  const selected = [...attachedObjects]
    .filter((item) => item.modelId !== 'radar-treasure')
    .sort(
      (left, right) =>
        stableHash(`${seed}:${left.id}`) - stableHash(`${seed}:${right.id}`),
    )
    .slice(0, Math.max(0, count))
  const layout = createWorldPhysicsLayout(stage)
  const dropped: DroppedLearningObject[] = []

  const impactAngle = impactSource
    ? Math.atan2(center.z - impactSource.z, center.x - impactSource.x)
    : undefined

  selected.forEach((item, index) => {
    const sideAngle =
      impactAngle === undefined
        ? undefined
        : impactAngle +
          (index % 2 === 0 ? Math.PI / 2 : -Math.PI / 2) +
          (Math.floor(index / 2) - 1) * 0.14
    const position = findDropPosition(
      stage,
      layout,
      center,
      stableHash(`${seed}:${item.id}:position`),
      [...existingDroppedObjects, ...dropped],
      sideAngle,
    )
    const droppedItem = { ...item, position }
    dropped.push({
      ...droppedItem,
      dropMotion: createDroppedObjectMotion(
        droppedItem,
        center,
        stableHash(`${seed}:${item.id}:motion`),
      ),
    })
  })

  return dropped
}

export function createPolarBearDroppedObjects(
  stage: Pick<GameStage, 'id' | 'mapSize' | 'theme'>,
  attachedObjects: readonly LearningObject[],
  existingDroppedObjects: readonly LearningObject[],
  center: DropCenter,
  hitCount: number,
  count = POLAR_BEAR_DROP_COUNT,
  impactSource?: DropCenter,
): DroppedLearningObject[] {
  return createEncounterDroppedObjects(
    stage,
    attachedObjects,
    existingDroppedObjects,
    center,
    hitCount,
    'polar-bear',
    count,
    impactSource,
  )
}

export function createRunnerDroppedObjects(
  stage: Pick<GameStage, 'id' | 'mapSize' | 'theme'>,
  attachedObjects: readonly LearningObject[],
  existingDroppedObjects: readonly LearningObject[],
  center: DropCenter,
  hitCount: number,
  runnerId: string,
  impactSource?: DropCenter,
): DroppedLearningObject[] {
  return createEncounterDroppedObjects(
    stage,
    attachedObjects,
    existingDroppedObjects,
    center,
    hitCount,
    `runner:${runnerId}`,
    RUNNER_DROP_COUNT,
    impactSource,
  )
}
