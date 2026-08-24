import type { StageTheme } from './types'

export interface RoamingObstacle {
  x: number
  z: number
  radius: number
}

export interface RoamingRunnerState {
  x: number
  z: number
  heading: number
}

export interface RoamingRunnerSpec extends RoamingRunnerState {
  id: `male-running-crew-${number}` | `female-running-crew-${number}`
  variant: 'male' | 'female'
  speed: number
  turnSign: -1 | 1
}

export interface RoamingPolarBearSpec extends RoamingRunnerState {
  id: 'scary-polar-bear' | `scary-polar-bear-${number}`
  speed: number
  turnSign: -1 | 1
}

export const ROAMING_RUNNER_RADIUS = 0.42
export const ROAMING_POLAR_BEAR_RADIUS = 0.78
export const ROAMING_RUNNER_SPEEDS = [
  0.78,
  0.75,
  0.72,
  0.69,
  0.66,
  0.63,
  0.6,
  0.57,
  0.55,
  0.53,
  0.51,
  0.5,
] as const
export const ROAMING_POLAR_BEAR_SPEED = 0.44
const MAP_EDGE_CLEARANCE = 1.65
const OBSTACLE_CLEARANCE = 0.52
const LOOK_AHEAD_DISTANCE = 1.15
const TURN_OFFSETS = [Math.PI / 3, Math.PI / 2, (Math.PI * 2) / 3, Math.PI]

export function getRoamingHazardCounts(theme: StageTheme): {
  runnerCount: number
  polarBearCount: number
} {
  return theme === 'forest-trail'
    ? { runnerCount: 12, polarBearCount: 2 }
    : { runnerCount: 8, polarBearCount: 1 }
}

export function shouldRoamingRunnerTurnOnCollision(
  physicsKind?: string,
): boolean {
  return physicsKind !== 'floor' && physicsKind !== 'player'
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function isPositionClear(
  x: number,
  z: number,
  mapSize: number,
  obstacles: readonly RoamingObstacle[],
  moverRadius = ROAMING_RUNNER_RADIUS,
): boolean {
  const limit = mapSize / 2 - MAP_EDGE_CLEARANCE - moverRadius
  if (Math.abs(x) > limit || Math.abs(z) > limit) return false

  return obstacles.every(
    (obstacle) =>
      Math.hypot(x - obstacle.x, z - obstacle.z) >=
      moverRadius + obstacle.radius + OBSTACLE_CLEARANCE,
  )
}

function hasClearPath(
  state: RoamingRunnerState,
  heading: number,
  distance: number,
  mapSize: number,
  obstacles: readonly RoamingObstacle[],
  moverRadius = ROAMING_RUNNER_RADIUS,
): boolean {
  return isPositionClear(
    state.x + Math.sin(heading) * distance,
    state.z + Math.cos(heading) * distance,
    mapSize,
    obstacles,
    moverRadius,
  )
}

export function stepRoamingRunner(
  state: RoamingRunnerState,
  speed: number,
  turnSign: -1 | 1,
  delta: number,
  mapSize: number,
  obstacles: readonly RoamingObstacle[],
  moverRadius = ROAMING_RUNNER_RADIUS,
): RoamingRunnerState {
  const travelDistance = Math.max(0, speed) * Math.min(Math.max(delta, 0), 0.1)
  const probeDistance = Math.max(LOOK_AHEAD_DISTANCE, travelDistance * 2)
  let heading = state.heading

  if (
    !hasClearPath(
      state,
      heading,
      probeDistance,
      mapSize,
      obstacles,
      moverRadius,
    )
  ) {
    const signedCandidates = TURN_OFFSETS.flatMap((offset) => [
      heading + offset * turnSign,
      heading - offset * turnSign,
    ])
    heading =
      signedCandidates.find((candidate) =>
        hasClearPath(
          state,
          candidate,
          probeDistance,
          mapSize,
          obstacles,
          moverRadius,
        ),
      ) ?? heading + Math.PI
  }

  heading = normalizeAngle(heading)
  if (
    !hasClearPath(
      state,
      heading,
      travelDistance,
      mapSize,
      obstacles,
      moverRadius,
    )
  ) {
    return { ...state, heading }
  }

  return {
    x: state.x + Math.sin(heading) * travelDistance,
    z: state.z + Math.cos(heading) * travelDistance,
    heading,
  }
}

function findClearSpawn(
  mapSize: number,
  obstacles: readonly RoamingObstacle[],
  seedAngle: number,
  moverRadius = ROAMING_RUNNER_RADIUS,
): { x: number; z: number } {
  const baseRadius = Math.min(18, mapSize * 0.17)
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const angle = seedAngle + attempt * 0.71
    const radius = baseRadius + (attempt % 5) * 2.2
    const x = Math.sin(angle) * radius
    const z = Math.cos(angle) * radius
    if (isPositionClear(x, z, mapSize, obstacles, moverRadius)) {
      return { x, z }
    }
  }
  return { x: 0, z: seedAngle > Math.PI ? -4 : 4 }
}

export function createRoamingRunnerSpecs(
  mapSize: number,
  obstacles: readonly RoamingObstacle[],
  count = 8,
): RoamingRunnerSpec[] {
  const definitions = [
    {
      id: 'male-running-crew-1',
      variant: 'male',
      speed: ROAMING_RUNNER_SPEEDS[0],
      turnSign: 1,
      seedAngle: Math.PI * 0.28,
      heading: Math.PI * 0.72,
    },
    {
      id: 'male-running-crew-2',
      variant: 'male',
      speed: ROAMING_RUNNER_SPEEDS[1],
      turnSign: -1,
      seedAngle: Math.PI * 0.78,
      heading: Math.PI * 1.18,
    },
    {
      id: 'male-running-crew-3',
      variant: 'male',
      speed: ROAMING_RUNNER_SPEEDS[2],
      turnSign: 1,
      seedAngle: Math.PI * 1.12,
      heading: Math.PI * 0.08,
    },
    {
      id: 'male-running-crew-4',
      variant: 'male',
      speed: ROAMING_RUNNER_SPEEDS[3],
      turnSign: -1,
      seedAngle: Math.PI * 1.58,
      heading: Math.PI * 1.66,
    },
    {
      id: 'female-running-crew-1',
      variant: 'female',
      speed: ROAMING_RUNNER_SPEEDS[4],
      turnSign: -1,
      seedAngle: Math.PI * 1.24,
      heading: -Math.PI * 0.18,
    },
    {
      id: 'female-running-crew-2',
      variant: 'female',
      speed: ROAMING_RUNNER_SPEEDS[5],
      turnSign: 1,
      seedAngle: Math.PI * 1.74,
      heading: Math.PI * 0.32,
    },
    {
      id: 'female-running-crew-3',
      variant: 'female',
      speed: ROAMING_RUNNER_SPEEDS[6],
      turnSign: -1,
      seedAngle: Math.PI * 0.48,
      heading: Math.PI * 1.42,
    },
    {
      id: 'female-running-crew-4',
      variant: 'female',
      speed: ROAMING_RUNNER_SPEEDS[7],
      turnSign: 1,
      seedAngle: Math.PI * 1.92,
      heading: -Math.PI * 0.42,
    },
    {
      id: 'male-running-crew-5',
      variant: 'male',
      speed: ROAMING_RUNNER_SPEEDS[8],
      turnSign: 1,
      seedAngle: Math.PI * 0.08,
      heading: Math.PI * 1.28,
    },
    {
      id: 'female-running-crew-5',
      variant: 'female',
      speed: ROAMING_RUNNER_SPEEDS[9],
      turnSign: -1,
      seedAngle: Math.PI * 0.62,
      heading: -Math.PI * 0.72,
    },
    {
      id: 'male-running-crew-6',
      variant: 'male',
      speed: ROAMING_RUNNER_SPEEDS[10],
      turnSign: -1,
      seedAngle: Math.PI * 1.36,
      heading: Math.PI * 0.52,
    },
    {
      id: 'female-running-crew-6',
      variant: 'female',
      speed: ROAMING_RUNNER_SPEEDS[11],
      turnSign: 1,
      seedAngle: Math.PI * 1.82,
      heading: Math.PI * 1.74,
    },
  ] as const

  const runners: RoamingRunnerSpec[] = []
  definitions
    .slice(0, Math.max(0, Math.min(definitions.length, Math.floor(count))))
    .forEach(({ seedAngle, ...definition }) => {
      const occupied = [
        ...obstacles,
        ...runners.map((runner) => ({
          x: runner.x,
          z: runner.z,
          radius: ROAMING_RUNNER_RADIUS * 2,
        })),
      ]
      runners.push({
        ...definition,
        ...findClearSpawn(mapSize, occupied, seedAngle),
      })
    })

  return runners
}

export function createRoamingPolarBearSpec(
  mapSize: number,
  obstacles: readonly RoamingObstacle[],
): RoamingPolarBearSpec {
  return createRoamingPolarBearSpecs(mapSize, obstacles, 1)[0]
}

export function createRoamingPolarBearSpecs(
  mapSize: number,
  obstacles: readonly RoamingObstacle[],
  count = 1,
): RoamingPolarBearSpec[] {
  const bears: RoamingPolarBearSpec[] = []
  const safeCount = Math.max(0, Math.min(3, Math.floor(count)))

  for (let index = 0; index < safeCount; index += 1) {
    const occupied = [
      ...obstacles,
      ...bears.map((bear) => ({
        x: bear.x,
        z: bear.z,
        radius: ROAMING_POLAR_BEAR_RADIUS * 2,
      })),
    ]
    const id: RoamingPolarBearSpec['id'] =
      index === 0 ? 'scary-polar-bear' : `scary-polar-bear-${index + 1}`
    bears.push({
      id,
      speed: Math.max(0.36, ROAMING_POLAR_BEAR_SPEED - index * 0.04),
      turnSign: index % 2 === 0 ? -1 : 1,
      heading: Math.PI * (1.12 + index * 0.46),
      ...findClearSpawn(
        mapSize,
        occupied,
        Math.PI * (1.43 + index * 0.58),
        ROAMING_POLAR_BEAR_RADIUS,
      ),
    })
  }

  return bears
}
