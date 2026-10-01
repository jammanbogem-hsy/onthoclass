import type { GameStage, StageTheme } from './types'

export type ObstacleResponse = 'stop' | 'bounce'

export type NaturalBlockAssetVariant =
  | 'tree-root'
  | 'fallen-log-a'
  | 'fallen-log-b'
export type MudAssetVariant = 'mud-a' | 'mud-b'

export interface WorldObstacle {
  id: string
  label: string
  x: number
  z: number
  radius: number
  response: ObstacleResponse
  assetVariant?: NaturalBlockAssetVariant
  rotationY?: number
  colliderHalfWidth?: number
  colliderHalfHeight?: number
  colliderHalfDepth?: number
  modelScale?: [number, number, number]
}

export interface SpeedZone {
  id: string
  label: string
  x: number
  z: number
  halfWidth: number
  halfDepth: number
  rotationY: number
  multiplier: number
}

export interface RideableObstacle {
  id: string
  label: string
  x: number
  y: number
  z: number
  halfWidth: number
  halfHeight: number
  halfDepth: number
  rotationY: number
}

export interface WorldTunnel {
  id: string
  label: string
  x: number
  z: number
  halfWidth: number
  halfDepth: number
  clearanceHeight: number
  wallThickness: number
  roofThickness: number
  rotationY: number
  color: string
  accentColor: string
}

export type SurfaceKind = 'grass' | 'water' | 'mud' | 'slick'

export interface SurfaceZone {
  id: string
  label: string
  kind: SurfaceKind
  color: string
  x: number
  z: number
  halfWidth: number
  halfDepth: number
  rotationY: number
  multiplier: number
  traction?: number
  assetVariant?: MudAssetVariant
  modelScale?: [number, number, number]
}

export interface TerrainRamp {
  id: string
  label: string
  color: string
  x: number
  y: number
  z: number
  halfWidth: number
  halfHeight: number
  halfDepth: number
  rotationX: number
  rotationY: number
}

export interface ElevatedPlatform {
  id: string
  label: string
  color: string
  x: number
  y: number
  z: number
  halfWidth: number
  halfHeight: number
  halfDepth: number
  rotationY: number
  bridgeSide?: 'west' | 'east'
  elevatorSide?: 'west' | 'east'
}

export type TerraceSide = 'north' | 'south' | 'east' | 'west'
export interface ElevatedWalkway extends Omit<ElevatedPlatform, 'bridgeSide' | 'elevatorSide'> {
  railSides: TerraceSide[]
}

export interface WorldElevator {
  id: string
  label: string
  color: string
  x: number
  z: number
  bottomY: number
  topY: number
  halfWidth: number
  halfHeight: number
  halfDepth: number
  buttonRadius: number
  travelDuration: number
}

export interface PushableProp {
  id: string
  label: string
  kind: 'block' | 'cone' | 'trash-can'
  color: string
  x: number
  y: number
  z: number
  rotationY: number
}

export const CONE_COLLECTION_ASSIST = 0.24
const CONE_COLLECTION_ASSIST_DISTANCE = 2.1

export function getPushableCollectionAssist(
  item: Pick<GameStage['objects'][number], 'position'>,
  props: readonly PushableProp[],
): number {
  const nextToCone = props.some(
    (prop) =>
      prop.kind === 'cone' &&
      Math.hypot(
        item.position[0] - prop.x,
        item.position[2] - prop.z,
      ) <= CONE_COLLECTION_ASSIST_DISTANCE,
  )

  return nextToCone ? CONE_COLLECTION_ASSIST : 0
}

export function getElevatorDeckY(
  elevator: WorldElevator,
  progress: number,
): number {
  const clampedProgress = Math.max(0, Math.min(1, progress))
  const easedProgress =
    clampedProgress * clampedProgress * (3 - 2 * clampedProgress)

  return (
    elevator.bottomY +
    (elevator.topY - elevator.bottomY) * easedProgress
  )
}

export function getTerrainRampSurfacePosition(
  ramp: TerrainRamp,
  localXRatio: number,
  localZRatio: number,
): [number, number, number] {
  const localX = ramp.halfWidth * localXRatio
  const localZ = ramp.halfDepth * localZRatio
  const cosineX = Math.cos(ramp.rotationX)
  const sineX = Math.sin(ramp.rotationX)
  const cosineY = Math.cos(ramp.rotationY)
  const sineY = Math.sin(ramp.rotationY)
  const pitchedY = ramp.halfHeight * cosineX - localZ * sineX
  const pitchedZ = ramp.halfHeight * sineX + localZ * cosineX

  return [
    ramp.x + localX * cosineY + pitchedZ * sineY,
    ramp.y + pitchedY + 0.025,
    ramp.z - localX * sineY + pitchedZ * cosineY,
  ]
}

export function getElevatedPlatformSurfacePosition(
  platform: ElevatedPlatform,
  localXRatio: number,
  localZRatio: number,
): [number, number, number] {
  const localX = platform.halfWidth * localXRatio
  const localZ = platform.halfDepth * localZRatio
  const cosine = Math.cos(platform.rotationY)
  const sine = Math.sin(platform.rotationY)

  return [
    platform.x + localX * cosine + localZ * sine,
    platform.y + platform.halfHeight + 0.025,
    platform.z - localX * sine + localZ * cosine,
  ]
}

export type ForestLandmarkKind =
  | 'treehouse'
  | 'glow-mushroom'
  | 'mushroom-cluster'
  | 'stone-arch'
  | 'moon-altar'
  | 'explorer-camp'
  | 'lantern'

/** Visual-only moonshade forest structures; their colliders live in obstacles. */
export interface ForestLandmark {
  id: string
  label: string
  kind: ForestLandmarkKind
  x: number
  z: number
  rotationY: number
  /** Target model height in world units. */
  height: number
}

export interface WorldPhysicsLayout {
  landmarks: ForestLandmark[]
  obstacles: WorldObstacle[]
  rideableObstacles: RideableObstacle[]
  tunnels: WorldTunnel[]
  speedZones: SpeedZone[]
  surfaceZones: SurfaceZone[]
  terrainRamps: TerrainRamp[]
  elevatedPlatforms: ElevatedPlatform[]
  elevatedWalkways: ElevatedWalkway[]
  elevators: WorldElevator[]
  pushableProps: PushableProp[]
  pushRewardSlots: [number, number, number][]
}

export interface WorldPhysicsStep {
  x: number
  z: number
  velocityX: number
  velocityZ: number
  speedMultiplier: number
  speedZone?: SpeedZone
  surfaceZone?: SurfaceZone
  impact?: {
    obstacle: WorldObstacle
    response: ObstacleResponse
  }
}

interface WorldPhysicsInput {
  startX: number
  startZ: number
  nextX: number
  nextZ: number
  velocityX: number
  velocityZ: number
  ballRadius: number
}

function createTreeRing(
  mapSize: number,
  theme: StageTheme,
): WorldObstacle[] {
  const mapScale = mapSize / 60
  const treeCount = Math.round(22 * mapScale)
  const edgeRadius = mapSize * 0.468

  return Array.from({ length: treeCount }, (_, index) => {
    const angle = (index / treeCount) * Math.PI * 2
    const radius = edgeRadius - (index % 3) * 0.65
    return {
      id: `edge-tree-${index}`,
      label: theme === 'starlight-river' ? '서리 나무' : '공원 나무',
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      radius: 0.48,
      response: 'stop' as const,
    }
  })
}

function createInteriorTrees(
  mapSize: number,
  theme: StageTheme,
): WorldObstacle[] {
  const clusterCenters = [
    [-0.09, 0.08],
    [0.1, -0.12],
    [0.16, 0.08],
    [-0.1, 0.22],
    [-0.22, -0.02],
  ] as const
  const memberOffsets = [
    [-2.2, -1.1],
    [1.8, -0.6],
    [-0.2, 2.2],
  ] as const
  const clusterCount = theme === 'forest-trail' ? 4 : 5
  const treeCount = clusterCount * memberOffsets.length
  const themeRotation =
    theme === 'forest-trail'
      ? 0.08
      : theme === 'starlight-river'
        ? -0.12
        : 0
  const cosine = Math.cos(themeRotation)
  const sine = Math.sin(themeRotation)
  const offsetScale = mapSize / 144

  return Array.from({ length: treeCount }, (_, index) => {
    const clusterIndex = Math.floor(index / memberOffsets.length)
    const memberIndex = index % memberOffsets.length
    const center = clusterCenters[clusterIndex]
    const offset = memberOffsets[memberIndex]
    const rawX = center[0] * mapSize + offset[0] * offsetScale
    const rawZ = center[1] * mapSize + offset[1] * offsetScale

    return {
      id: `interior-tree-${index}`,
      label:
        theme === 'forest-trail'
          ? '달그늘 안쪽 나무'
          : theme === 'starlight-river'
            ? '아이스 파크 안쪽 나무'
            : '광장 안쪽 나무',
      x: rawX * cosine + rawZ * sine,
      z: -rawX * sine + rawZ * cosine,
      radius: 0.52,
      response: 'stop' as const,
    }
  })
}

function createBenches(mapSize: number): WorldObstacle[] {
  return Array.from({ length: 8 }, (_, index) => {
    const angle = (index / 8) * Math.PI * 2 + Math.PI / 8
    return {
      id: `bench-${index}`,
      label: '공원 의자',
      x: Math.cos(angle) * mapSize * 0.25,
      z: Math.sin(angle) * mapSize * 0.25,
      radius: 1.08,
      response: 'bounce' as const,
    }
  })
}

function createGearRacks(mapSize: number): WorldObstacle[] {
  const mapScale = mapSize / 60
  return [
    [-mapSize * 0.36, -4.5 * mapScale],
    [mapSize * 0.36, 4.5 * mapScale],
    [-5 * mapScale, mapSize * 0.36],
    [5 * mapScale, -mapSize * 0.36],
  ].map(([x, z], index) => ({
    id: `gear-rack-${index}`,
    label: '러닝 장비대',
    x,
    z,
    radius: 1.15,
    response: 'bounce' as const,
  }))
}

function createKiosks(mapSize: number): WorldObstacle[] {
  return [
    [-mapSize * 0.35, mapSize * 0.24],
    [mapSize * 0.35, -mapSize * 0.24],
  ].map(([x, z], index) => ({
    id: `crew-kiosk-${index}`,
    label: '러닝크루 쉼터',
    x,
    z,
    radius: 1.2,
    response: 'stop' as const,
  }))
}

function createForestTrees(mapSize: number): WorldObstacle[] {
  const clusterCenters = [
    [-0.18, 0.18],
    [0.24, -0.08],
    [0.08, 0.26],
  ] as const
  const memberOffsets = [
    [-2.8, -1.4],
    [2.2, -0.8],
    [-0.6, 2.6],
    [3.1, 2.1],
  ] as const
  const offsetScale = mapSize / 168

  return Array.from({ length: 12 }, (_, index) => {
    const center = clusterCenters[Math.floor(index / memberOffsets.length)]
    const offset = memberOffsets[index % memberOffsets.length]
    return {
      id: `forest-tree-${index}`,
      label: '달그늘 나무',
      x: center[0] * mapSize + offset[0] * offsetScale,
      z: center[1] * mapSize + offset[1] * offsetScale,
      radius: 0.44,
      response: 'stop' as const,
    }
  })
}

function createSpeedZones(
  mapSize: number,
  theme: StageTheme,
): SpeedZone[] {
  if (theme === 'forest-trail') {
    return [
      {
        id: 'forest-sprint-east',
        label: '바람 오솔길',
        x: mapSize * 0.02,
        z: mapSize * 0.035,
        halfWidth: mapSize * 0.3,
        halfDepth: 1.05,
        rotationY: 0.18,
        multiplier: 1.28,
      },
      {
        id: 'forest-sprint-north',
        label: '솔잎 지름길',
        x: -mapSize * 0.12,
        z: mapSize * 0.05,
        halfWidth: 0.92,
        halfDepth: mapSize * 0.2,
        rotationY: 0.08,
        multiplier: 1.24,
      },
    ]
  }

  if (theme === 'starlight-river') {
    return [
      {
        id: 'river-bridge-boost',
        label: '빙하 스피드 다리',
        x: 0,
        z: mapSize * 0.27,
        halfWidth: 1.85,
        halfDepth: 4.6,
        rotationY: 0,
        multiplier: 1.35,
      },
    ]
  }

  return [
    {
      id: 'plaza-sprint-east',
      label: '햇살 스프린트 길',
      x: 0,
      z: 0,
      halfWidth: mapSize * 0.31,
      halfDepth: 0.72,
      rotationY: 0,
      multiplier: 1.3,
    },
    {
      id: 'plaza-sprint-north',
      label: '햇살 스프린트 길',
      x: 0,
      z: 0,
      halfWidth: 0.72,
      halfDepth: mapSize * 0.31,
      rotationY: 0,
      multiplier: 1.3,
    },
  ]
}

function createForestRidges(mapSize: number): RideableObstacle[] {
  const ridgeSpecs = [
    [-0.08, -0.27, 0.42, 2.7],
    [0.14, 0.28, -0.36, 2.3],
    [0.29, 0.04, 0.94, 2.5],
    [-0.3, 0.04, -0.82, 2.2],
    [0.04, 0.36, 0.16, 2.65],
    [-0.34, -0.18, 0.68, 2.35],
    [0.31, -0.28, -0.18, 2.55],
    [-0.19, 0.3, 1.12, 2.25],
    [0.38, 0.2, -0.5, 3],
    [-0.38, 0.12, 0.35, 2.8],
    [0.08, -0.38, 1.25, 2.45],
    [-0.02, 0.22, -1.1, 2.9],
    [0.25, 0.34, 0.62, 2.65],
    [-0.27, -0.34, -0.35, 2.6],
  ] as const

  return ridgeSpecs.map(([xRatio, zRatio, rotationY, halfWidth], index) => ({
    id: `forest-ridge-${index}`,
    label: '낮은 숲 둔턱',
    x: mapSize * xRatio,
    y: 0.105,
    z: mapSize * zRatio,
    halfWidth,
    halfHeight: 0.105,
    halfDepth: 0.24,
    rotationY,
  }))
}

function createTunnels(
  mapSize: number,
  theme: StageTheme,
): WorldTunnel[] {
  if (theme !== 'forest-trail') return []

  return [
    {
      id: 'moon-water-tunnel',
      label: '속 빈 통나무 터널',
      x: -mapSize * 0.34,
      z: -mapSize * 0.02,
      halfWidth: 3.9,
      halfDepth: 9.2,
      clearanceHeight: 5.6,
      wallThickness: 0.6,
      roofThickness: 0.5,
      rotationY: 0.12,
      color: '#4A3526',
      accentColor: '#9BE3C4',
    },
  ]
}

export const MOON_LAKE = { xRatio: 0, zRatio: -0.13, halfWidth: 14, halfDepth: 10 } as const
const MOON_ALTAR_RADIUS = 3.1

function createMoonLakeSteppingStones(mapSize: number): RideableObstacle[] {
  const lakeZ = mapSize * MOON_LAKE.zRatio
  const start = lakeZ - MOON_LAKE.halfDepth - 0.6
  const end = lakeZ - MOON_ALTAR_RADIUS - 0.9
  const count = 6
  // Two stepping-stone paths reach the altar islet from both shores.
  return [-1, 1].flatMap((shore) =>
    Array.from({ length: count }, (_, index) => ({
      id: `moon-stepping-stone-${shore < 0 ? 'south' : 'north'}-${index}`,
      label: '달빛 징검다리',
      x: Math.sin(index * 1.3 + shore) * 0.7,
      y: 0.09,
      z: lakeZ + shore * (lakeZ - start - ((end - start) * index) / (count - 1)),
      halfWidth: 0.78,
      halfHeight: 0.09,
      halfDepth: 0.62,
      rotationY: index * 0.47 + shore,
    })),
  )
}

/** Normalized GLB proportions (tripo exports fit a unit cube). */
const STONE_ARCH_HEIGHT_RATIO = 0.8535
const STONE_ARCH_PILLAR_OFFSET = 0.385
const STONE_ARCH_PILLAR_RADIUS = 0.12

interface ForestLandmarkSet {
  landmarks: ForestLandmark[]
  obstacles: WorldObstacle[]
  clearances: { x: number; z: number; radius: number }[]
}

function createForestLandmarks(mapSize: number): ForestLandmarkSet {
  const landmarks: ForestLandmark[] = []
  const obstacles: WorldObstacle[] = []
  const add = (
    landmark: ForestLandmark,
    colliderRadius?: number,
    response: ObstacleResponse = 'stop',
  ) => {
    landmarks.push(landmark)
    if (colliderRadius) {
      obstacles.push({
        id: `landmark-${landmark.id}`,
        label: landmark.label,
        x: landmark.x,
        z: landmark.z,
        radius: colliderRadius,
        response,
      })
    }
  }

  // North: two giant hollow trees, each wrapped by a walkable deck.
  for (const side of [-1, 1]) {
    add({
      id: `moon-lodge-${side < 0 ? 'west' : 'east'}`,
      label: '거대 고목 나무집',
      kind: 'treehouse',
      x: side * mapSize * 0.19,
      z: -mapSize * 0.265,
      rotationY: side < 0 ? 0.4 : -2.6,
      height: 14,
    }, 1.7)
  }

  // Center: the moon altar stands on an islet in the middle of the lake.
  add({
    id: 'moon-altar',
    label: '초승달 돌 제단',
    kind: 'moon-altar',
    x: mapSize * MOON_LAKE.xRatio,
    z: mapSize * MOON_LAKE.zRatio,
    rotationY: Math.PI,
    height: 4.8,
  }, MOON_ALTAR_RADIUS)

  // East: a bouncy grove of giant glowing mushrooms.
  const groveX = mapSize * 0.3
  const groveZ = -mapSize * 0.03
  const giantMushrooms = [
    [0, 0, 8.5, 0.2],
    [7.5, -5.5, 6.4, 1.4],
    [-6.5, 6, 7.2, 2.6],
    [6.5, 8, 5.4, 3.3],
    [-5.5, -7, 6, 4.4],
  ] as const
  giantMushrooms.forEach(([dx, dz, height, rotationY], index) => {
    add({
      id: `glow-mushroom-${index}`,
      label: '거대 발광 버섯',
      kind: 'glow-mushroom',
      x: groveX + dx,
      z: groveZ + dz,
      rotationY,
      height,
    }, height * 0.13, 'bounce')
  })
  const clusterSpots = [
    [groveX + 12, groveZ - 1],
    [groveX - 1, groveZ + 13],
    [groveX - 11, groveZ - 2],
    [groveX + 2, groveZ - 13],
    [-mapSize * 0.07, -mapSize * 0.2],
    [mapSize * 0.1, -mapSize * 0.06],
    [-mapSize * 0.26, mapSize * 0.06],
    [mapSize * 0.2, mapSize * 0.33],
  ] as const
  clusterSpots.forEach(([x, z], index) => {
    add({
      id: `mushroom-cluster-${index}`,
      label: '반딧불 버섯 무리',
      kind: 'mushroom-cluster',
      x,
      z,
      rotationY: index * 1.7,
      height: 2.3,
    }, 0.85, 'bounce')
  })

  // West: mossy stone arches that the ball can roll straight through.
  const arches = [
    [-mapSize * 0.24, mapSize * 0.13, -0.5, 9.4],
    [-mapSize * 0.3, -mapSize * 0.2, 0.4, 9.4],
    [-mapSize * 0.1, mapSize * 0.34, -1.2, 8.6],
  ] as const
  arches.forEach(([x, z, rotationY, height], index) => {
    const id = `stone-arch-${index}`
    landmarks.push({ id, label: '이끼 낀 돌 아치 유적', kind: 'stone-arch', x, z, rotationY, height })
    const scale = height / STONE_ARCH_HEIGHT_RATIO
    for (const side of [-1, 1]) {
      const offset = side * STONE_ARCH_PILLAR_OFFSET * scale
      obstacles.push({
        id: `landmark-${id}-pillar-${side < 0 ? 'a' : 'b'}`,
        label: '이끼 낀 돌 아치 기둥',
        x: x + offset * Math.sin(rotationY),
        z: z + offset * Math.cos(rotationY),
        radius: STONE_ARCH_PILLAR_RADIUS * scale,
        response: 'stop',
      })
    }
  })

  // South, beside the start: the explorer camp.
  add({
    id: 'explorer-camp',
    label: '탐험가 캠프',
    kind: 'explorer-camp',
    x: -mapSize * 0.06,
    z: mapSize * 0.1,
    rotationY: Math.PI - 0.6,
    height: 5.5,
  }, 3.9)

  // Lanterns light the trails between the zones (visual only).
  const lanterns = [
    [-6, -8], [6, -9], [-4, 8.5], [5, 9], [-15, 16], [15, 16],
    [-24, 30], [24, 30], [30, -3], [-30, -8], [-44, -3], [-18, -34],
    [12, -30], [40, 18], [-8, 38], [8, 38],
  ] as const
  lanterns.forEach(([x, z], index) => {
    landmarks.push({
      id: `lantern-${index}`,
      label: '반딧불 랜턴',
      kind: 'lantern',
      x: x * (mapSize / 168),
      z: -z * (mapSize / 168),
      rotationY: index * 0.9,
      height: 2.7,
    })
  })

  const clearances = [
    ...obstacles.map((obstacle) => ({
      x: obstacle.x,
      z: obstacle.z,
      radius: obstacle.radius + 1.6,
    })),
    ...landmarks
      .filter((landmark) => landmark.kind === 'stone-arch')
      .map((landmark) => ({ x: landmark.x, z: landmark.z, radius: 3.2 })),
    {
      x: mapSize * MOON_LAKE.xRatio,
      z: mapSize * MOON_LAKE.zRatio,
      radius: Math.max(MOON_LAKE.halfWidth, MOON_LAKE.halfDepth) + 1.5,
    },
  ]
  return { landmarks, obstacles, clearances }
}

function createRideableObstacles(
  mapSize: number,
  theme: StageTheme,
): RideableObstacle[] {
  const mapScale = mapSize / 60

  const steppingBlocks = Array.from(
    { length: Math.round(18 * mapScale) },
    (_, index) => ({
      id: `stepping-block-${index}`,
      label: '컬러 발판',
      x: -8.5 * mapScale + index,
      y: 0.13 + (index % 3) * 0.04,
      z: -12.3 * mapScale + Math.sin(index * 0.8) * 0.8,
      halfWidth: 0.29,
      halfHeight: 0.12,
      halfDepth: 0.29,
      rotationY: index * 0.22,
    }),
  )

  return theme === 'forest-trail'
    ? [...createMoonLakeSteppingStones(mapSize), ...createForestRidges(mapSize)]
    : steppingBlocks
}

function createSurfaceZones(
  mapSize: number,
  theme: StageTheme,
): SurfaceZone[] {
  if (theme === 'forest-trail') {
    return [
      {
        id: 'forest-meadow',
        label: '달그늘 이끼 잔디',
        kind: 'grass',
        color: '#78B86D',
        x: -mapSize * 0.2,
        z: mapSize * 0.26,
        halfWidth: mapSize * 0.1,
        halfDepth: mapSize * 0.07,
        rotationY: 0.32,
        multiplier: 0.68,
      },
      {
        id: 'forest-creek',
        label: '달빛 얕은 물길',
        kind: 'water',
        color: '#4FA6BE',
        x: mapSize * 0.22,
        z: mapSize * 0.22,
        halfWidth: mapSize * 0.06,
        halfDepth: mapSize * 0.085,
        rotationY: -0.48,
        multiplier: 0.55,
      },
      {
        id: 'forest-clearing',
        label: '반딧불 버섯 이끼터',
        kind: 'grass',
        color: '#86C77A',
        x: mapSize * 0.3,
        z: -mapSize * 0.03,
        halfWidth: mapSize * 0.075,
        halfDepth: mapSize * 0.06,
        rotationY: -0.21,
        multiplier: 0.74,
      },
      {
        id: 'forest-fern-glade',
        label: '고사리 달빛 풀밭',
        kind: 'grass',
        color: '#6FAE68',
        x: -mapSize * 0.33,
        z: -mapSize * 0.36,
        halfWidth: mapSize * 0.07,
        halfDepth: mapSize * 0.05,
        rotationY: 0.5,
        multiplier: 0.72,
      },
      {
        id: 'forest-rain-puddle',
        label: '어두운 빗물 웅덩이',
        kind: 'water',
        color: '#5FB8CB',
        x: mapSize * 0.06,
        z: mapSize * 0.36,
        halfWidth: mapSize * 0.045,
        halfDepth: mapSize * 0.032,
        rotationY: 0.38,
        multiplier: 0.6,
      },
      {
        id: 'forest-north-shallows',
        label: '북쪽 반딧불 여울',
        kind: 'water',
        color: '#3E9AAE',
        x: mapSize * 0.02,
        z: -mapSize * 0.41,
        halfWidth: mapSize * 0.055,
        halfDepth: mapSize * 0.03,
        rotationY: 0.72,
        multiplier: 0.64,
      },
    ]
  }

  if (theme === 'starlight-river') {
    return [
      {
        id: 'ice-river-center',
        label: '아이스 리버 중심 빙판',
        kind: 'slick',
        color: '#C9EEFF',
        x: 0,
        z: 0,
        halfWidth: mapSize * 0.22,
        halfDepth: mapSize * 0.185,
        rotationY: 0,
        multiplier: 1,
        traction: 0.035,
      },
      {
        id: 'ice-river-north',
        label: '북쪽 서리 활주로',
        kind: 'slick',
        color: '#D7F4FF',
        x: 0,
        z: mapSize * 0.335,
        halfWidth: mapSize * 0.315,
        halfDepth: mapSize * 0.145,
        rotationY: 0.03,
        multiplier: 1,
        traction: 0.045,
      },
      {
        id: 'ice-river-south',
        label: '남쪽 서리 활주로',
        kind: 'slick',
        color: '#CDEBFF',
        x: 0,
        z: -mapSize * 0.335,
        halfWidth: mapSize * 0.315,
        halfDepth: mapSize * 0.145,
        rotationY: -0.03,
        multiplier: 1,
        traction: 0.04,
      },
      {
        id: 'ice-river-west',
        label: '서쪽 얼음 만',
        kind: 'slick',
        color: '#D9D8FF',
        x: -mapSize * 0.35,
        z: 0,
        halfWidth: mapSize * 0.13,
        halfDepth: mapSize * 0.225,
        rotationY: 0.1,
        multiplier: 1,
        traction: 0.055,
      },
      {
        id: 'ice-river-east',
        label: '동쪽 얼음 만',
        kind: 'slick',
        color: '#C5E7FF',
        x: mapSize * 0.35,
        z: 0,
        halfWidth: mapSize * 0.13,
        halfDepth: mapSize * 0.225,
        rotationY: -0.1,
        multiplier: 1,
        traction: 0.05,
      },
      {
        id: 'ice-river-thaw-pool',
        label: '녹은 얼음 얕은 물',
        kind: 'water',
        color: '#4FA8C7',
        x: mapSize * 0.38,
        z: mapSize * 0.38,
        halfWidth: mapSize * 0.055,
        halfDepth: mapSize * 0.04,
        rotationY: 0.2,
        multiplier: 0.55,
      },
      {
        id: 'ice-river-safe-bank',
        label: '서리 없는 안전 둔덕',
        kind: 'grass',
        color: '#6EA888',
        x: -mapSize * 0.39,
        z: -mapSize * 0.38,
        halfWidth: mapSize * 0.05,
        halfDepth: mapSize * 0.038,
        rotationY: -0.18,
        multiplier: 0.78,
      },
      {
        id: 'ice-river-rest-island',
        label: '동쪽 휴식 잔디섬',
        kind: 'grass',
        color: '#78A99A',
        x: mapSize * 0.4,
        z: -mapSize * 0.38,
        halfWidth: mapSize * 0.045,
        halfDepth: mapSize * 0.034,
        rotationY: 0.15,
        multiplier: 0.8,
      },
      {
        id: 'ice-river-cold-spring',
        label: '북서쪽 찬물 샘',
        kind: 'water',
        color: '#62B9D2',
        x: -mapSize * 0.4,
        z: mapSize * 0.39,
        halfWidth: mapSize * 0.042,
        halfDepth: mapSize * 0.032,
        rotationY: -0.22,
        multiplier: 0.58,
      },
    ]
  }

  return [
    {
      id: 'plaza-grass',
      label: '폭신한 광장 잔디',
      kind: 'grass',
      color: '#83C878',
      x: -mapSize * 0.23,
      z: mapSize * 0.14,
      halfWidth: mapSize * 0.11,
      halfDepth: mapSize * 0.075,
      rotationY: 0.22,
      multiplier: 0.72,
    },
    {
      id: 'plaza-water',
      label: '찰랑이는 얕은 물',
      kind: 'water',
      color: '#6ECBE2',
      x: mapSize * 0.23,
      z: -mapSize * 0.17,
      halfWidth: mapSize * 0.085,
      halfDepth: mapSize * 0.06,
      rotationY: -0.35,
      multiplier: 0.58,
    },
    {
      id: 'plaza-east-grass',
      label: '동쪽 작은 잔디',
      kind: 'grass',
      color: '#91D286',
      x: mapSize * 0.24,
      z: mapSize * 0.18,
      halfWidth: mapSize * 0.065,
      halfDepth: mapSize * 0.04,
      rotationY: -0.28,
      multiplier: 0.76,
    },
    {
      id: 'plaza-rain-puddle',
      label: '광장 빗물 웅덩이',
      kind: 'water',
      color: '#77D1E5',
      x: -mapSize * 0.24,
      z: -mapSize * 0.2,
      halfWidth: mapSize * 0.052,
      halfDepth: mapSize * 0.036,
      rotationY: 0.42,
      multiplier: 0.62,
    },
  ]
}

function createHill(
  id: string,
  label: string,
  color: string,
  centerX: number,
  centerZ: number,
  rotationY: number,
  mapSize: number,
): TerrainRamp[] {
  const halfDepth = Math.min(mapSize * 0.034, 5.6)
  const halfWidth = Math.min(mapSize * 0.027, 4.8)
  const halfHeight = 0.13
  const rotationX = 0.065
  const centerY =
    Math.sin(rotationX) * halfDepth -
    halfHeight * Math.cos(rotationX) +
    0.02
  const centerOffset =
    halfDepth * Math.cos(rotationX) +
    halfHeight * Math.sin(rotationX)
  const directionX = Math.sin(rotationY)
  const directionZ = Math.cos(rotationY)

  return [
    {
      id: `${id}-up`,
      label,
      color,
      x: centerX - directionX * centerOffset,
      y: centerY,
      z: centerZ - directionZ * centerOffset,
      halfWidth,
      halfHeight,
      halfDepth,
      rotationX: -rotationX,
      rotationY,
    },
    {
      id: `${id}-down`,
      label,
      color,
      x: centerX + directionX * centerOffset,
      y: centerY,
      z: centerZ + directionZ * centerOffset,
      halfWidth,
      halfHeight,
      halfDepth,
      rotationX,
      rotationY,
    },
  ]
}

function createTerrainRamps(
  mapSize: number,
  theme: StageTheme,
): TerrainRamp[] {
  const colors =
    theme === 'starlight-river'
      ? ['#718BA0', '#667C91']
      : theme === 'forest-trail'
        ? ['#779D61', '#8BAC68']
        : ['#9BCB78', '#D6B77C']

  if (theme === 'forest-trail') {
    return [
      ...createHill('west-hill', '이끼 덮인 서쪽 언덕', '#2F4D37', -mapSize * 0.34, mapSize * 0.2, 0.58, mapSize),
      ...createHill('moon-hill', '달그늘 동쪽 언덕', '#36573E', mapSize * 0.33, -mapSize * 0.2, -1.04, mapSize),
      ...createUpperDeckRamps(mapSize, theme),
    ]
  }

  return [
    ...createHill(
      'central-park-hill', '공원 산책 언덕', colors[0],
      mapSize * 0.21, mapSize * 0.055, Math.PI / 2, mapSize,
    ),
    ...createHill(
      'east-hill',
      '완만한 동쪽 언덕',
      colors[0],
      mapSize * 0.19,
      mapSize * 0.17,
      0.38,
      mapSize,
    ),
    ...createHill(
      'west-hill',
      '구불구불 서쪽 언덕',
      colors[1],
      -mapSize * 0.22,
      -mapSize * 0.16,
      -0.58,
      mapSize,
    ),
    ...createUpperDeckRamps(mapSize, theme),
  ]
}

const UPPER_DECK_SURFACE_Y = 3.65

function getUpperDeckColors(theme: StageTheme) {
  if (theme === 'starlight-river') {
    return {
      ramp: '#657C9C',
      platform: '#7189A8',
      elevator: '#8C7BD3',
    }
  }
  if (theme === 'forest-trail') {
    return {
      ramp: '#6E4A31',
      platform: '#7A5234',
      elevator: '#4F8B69',
    }
  }
  return {
    ramp: '#D4A96A',
    platform: '#E0BE82',
    elevator: '#4D91C8',
  }
}

function createElevatedPlatforms(
  mapSize: number,
  theme: StageTheme,
): ElevatedPlatform[] {
  const colors = getUpperDeckColors(theme)
  const halfHeight = 0.28
  if (theme === 'forest-trail') {
    // Two treehouse decks wrap the giant hollow trees north of the moon lake.
    return (['west', 'east'] as const).map((side, index) => ({
      id: index === 0 ? 'ramp-upper-deck' : 'elevator-upper-deck',
      label: index === 0 ? '서쪽 고목 나무집 데크' : '동쪽 고목 나무집 데크',
      color: colors.platform,
      x: (side === 'west' ? -1 : 1) * mapSize * 0.19,
      y: UPPER_DECK_SURFACE_Y - halfHeight,
      z: -mapSize * 0.265,
      halfWidth: 7.4,
      halfHeight,
      halfDepth: 6.6,
      rotationY: 0,
      bridgeSide: side === 'west' ? 'east' : 'west',
      elevatorSide: side === 'west' ? 'east' : 'west',
    }))
  }
  const towerPlatform: ElevatedPlatform = {
    id: 'ramp-upper-deck',
    label: '경사로 2층 전망대',
    color: colors.platform,
    x: mapSize * 0.1,
    y: UPPER_DECK_SURFACE_Y - halfHeight,
    z: -mapSize * 0.19,
    halfWidth: 7.4,
    halfHeight,
    halfDepth: 6.6,
    rotationY: 0,
    bridgeSide: 'west',
    elevatorSide: 'east',
  }
  const elevatorPlatform: ElevatedPlatform = {
    id: 'elevator-upper-deck',
    label: '엘리베이터 2층 보물마당',
    color: colors.elevator,
    x: -mapSize * 0.14,
    y: UPPER_DECK_SURFACE_Y - halfHeight,
    z: mapSize * 0.2,
    halfWidth: 7.4,
    halfHeight,
    halfDepth: 6.6,
    rotationY: 0,
    bridgeSide: 'east',
    elevatorSide: 'west',
  }

  return [towerPlatform, elevatorPlatform]
}

function createElevatedWalkways(mapSize: number, theme: StageTheme): ElevatedWalkway[] {
  const [north, south] = createElevatedPlatforms(mapSize, theme)
  if (theme === 'forest-trail') {
    const halfWidth = (south.x - south.halfWidth - (north.x + north.halfWidth)) / 2
    return [{
      id: 'forest-rope-bridge',
      label: '고목 사이 밧줄 흔들다리',
      color: '#7A5234',
      x: (north.x + south.x) / 2,
      y: UPPER_DECK_SURFACE_Y - 0.22,
      z: north.z,
      halfWidth,
      halfHeight: 0.22,
      halfDepth: 3.3,
      rotationY: 0,
      railSides: ['north', 'south'],
    }]
  }
  const width = 3.7
  const spineX = -mapSize * 0.035
  const color = getUpperDeckColors(theme).platform
  const part = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, railSides: TerraceSide[]): ElevatedWalkway => ({
    id, label: '공원 연결 다리', color,
    x: (minX + maxX) / 2, z: (minZ + maxZ) / 2,
    y: UPPER_DECK_SURFACE_Y - 0.22, halfHeight: 0.22,
    halfWidth: (maxX - minX) / 2, halfDepth: (maxZ - minZ) / 2,
    rotationY: 0, railSides,
  })
  // Five flush sections form a continuous route without covering either
  // ground ramp. The west-side lift leaves the second bridge landing free.
  return [
    part('bridge-north-arm', spineX + width, north.x - north.halfWidth, north.z - width, north.z + width, ['north', 'south']),
    part('bridge-north-corner', spineX - width, spineX + width, north.z - width, north.z + width, ['north', 'west']),
    part('bridge-park-spine', spineX - width, spineX + width, north.z + width, south.z - width, ['east', 'west']),
    part('bridge-south-corner', spineX - width, spineX + width, south.z - width, south.z + width, ['south', 'east']),
    part('bridge-south-arm', south.x + south.halfWidth, spineX - width, south.z - width, south.z + width, ['north', 'south']),
  ]
}

export function getWalkwayClearances(walkways: readonly ElevatedWalkway[]) {
  return walkways.flatMap((walkway) => {
    const alongX = walkway.halfWidth > walkway.halfDepth
    const longHalf = Math.max(walkway.halfWidth, walkway.halfDepth)
    const segments = Math.ceil(longHalf * 2 / 4)
    return Array.from({ length: segments + 1 }, (_, index) => {
      const offset = (index / segments * 2 - 1) * longHalf
      return {
        x: walkway.x + (alongX ? offset : 0),
        z: walkway.z + (alongX ? 0 : offset),
        radius: Math.min(walkway.halfWidth, walkway.halfDepth) + 0.8,
      }
    })
  })
}

export function getCentralParkZones(mapSize: number, theme: StageTheme): SurfaceZone[] {
  if (theme === 'forest-trail') {
    // Keeps the shared pond id so shoreline, lily pads and item rings follow it.
    return [
      { id: 'central-park-pond', label: '달빛 연못', kind: 'water',
        x: mapSize * MOON_LAKE.xRatio, z: mapSize * MOON_LAKE.zRatio,
        halfWidth: MOON_LAKE.halfWidth, halfDepth: MOON_LAKE.halfDepth,
        rotationY: 0, multiplier: 0.55, color: '#2F7FA0' },
    ]
  }
  return [
    { id: 'central-park-lawn', label: '중앙 공원 잔디', kind: 'grass',
      x: mapSize * (theme === 'starlight-river' ? 0.09 : 0.06), z: mapSize * (theme === 'starlight-river' ? 0.08 : 0.055),
      halfWidth: mapSize * (theme === 'starlight-river' ? 0.085 : 0.12), halfDepth: mapSize * (theme === 'starlight-river' ? 0.08 : 0.115),
      rotationY: -0.22, multiplier: 0.94, color: theme === 'starlight-river' ? '#A4C4B0' : '#8BBE74' },
    { id: 'central-park-pond', label: '중앙 공원 연못', kind: 'water',
      x: mapSize * 0.075, z: mapSize * 0.11, halfWidth: mapSize * 0.042, halfDepth: mapSize * 0.029,
      rotationY: -0.28, multiplier: 0.58, color: '#69BED0' },
  ]
}

function createUpperDeckRamps(
  mapSize: number,
  theme: StageTheme,
): TerrainRamp[] {
  const halfDepth = Math.min(14, mapSize * 0.085)
  const halfWidth = 3.7
  const halfHeight = 0.18
  const baseSurfaceY = 0.02
  const rotationMagnitude = Math.asin(
    (UPPER_DECK_SURFACE_Y - baseSurfaceY) / (halfDepth * 2),
  )
  const rotationX = -rotationMagnitude
  const centerSurfaceY = (UPPER_DECK_SURFACE_Y + baseSurfaceY) / 2

  // Match the pitched top surface, not the unrotated box extent. This keeps
  // the ramp flush with the landing without a step or a gap at either end.
  const topOffsetZ =
    halfDepth * Math.cos(rotationX) + halfHeight * Math.sin(rotationX)
  const sides = theme === 'forest-trail' ? [1] : [1, -1]
  return createElevatedPlatforms(mapSize, theme).flatMap((platform, index) =>
    sides.map((side) => ({
      id: index === 0 && side === 1
        ? 'upper-deck-ramp'
        : `upper-deck-${index}-${side === 1 ? 'south' : 'north'}-ramp`,
      label: `${index === 0 ? '전망대' : '보물마당'} ${side === 1 ? '남쪽' : '북쪽'} 경사로`,
      color: getUpperDeckColors(theme).ramp,
      x: platform.x,
      y: centerSurfaceY - halfHeight * Math.cos(rotationX),
      z: platform.z + side * (platform.halfDepth + topOffsetZ),
      halfWidth,
      halfHeight,
      halfDepth,
      rotationX,
      rotationY: side === 1 ? Math.PI : 0,
    })),
  )
}

function createElevators(
  mapSize: number,
  theme: StageTheme,
): WorldElevator[] {
  const halfHeight = 0.18
  if (theme === 'forest-trail') return []
  const platforms = createElevatedPlatforms(mapSize, theme)

  return platforms.map((landing, index) => ({
    id: index === 0 ? 'ramp-deck-elevator' : 'treasure-elevator',
    label:
      index === 0
        ? '전망대 연결 승강 발판'
        : '보물마당 연결 승강 발판',
    color: getUpperDeckColors(theme).elevator,
    x: landing.x + (landing.elevatorSide === 'west' ? -1 : 1) * (landing.halfWidth + 2.05),
    z: landing.z,
    bottomY: halfHeight,
    topY: UPPER_DECK_SURFACE_Y - halfHeight,
    halfWidth: 2.05,
    halfHeight,
    halfDepth: 2.15,
    buttonRadius: 0.92,
    travelDuration: 2.8,
  }))
}

function createPushableProps(
  mapSize: number,
  theme: StageTheme,
): PushableProp[] {
  const practiceProps = [
    { id: 'block-a', kind: 'block', x: 5.2, y: 0.36, z: -4.6, color: '#FF7B66' },
    { id: 'block-b', kind: 'block', x: mapSize * 0.22, y: 0.36, z: mapSize * -0.14, color: '#4169D8' },
    { id: 'block-c', kind: 'block', x: mapSize * -0.24, y: 0.36, z: mapSize * 0.17, color: '#F2C94C' },
    { id: 'cone-a', kind: 'cone', x: -5.3, y: 0.38, z: -4.8, color: '#FF8A3D' },
    { id: 'cone-b', kind: 'cone', x: mapSize * -0.18, y: 0.38, z: mapSize * -0.22, color: '#45A7A0' },
    { id: 'cone-c', kind: 'cone', x: mapSize * 0.14, y: 0.38, z: mapSize * 0.24, color: '#A78BFA' },
    { id: 'pin-a', kind: 'cone', x: 3.9, y: 0.38, z: 5.8, color: '#38BDF8' },
    { id: 'pin-b', kind: 'cone', x: mapSize * 0.28, y: 0.38, z: mapSize * 0.08, color: '#FB7185' },
    { id: 'pin-c', kind: 'cone', x: mapSize * -0.08, y: 0.38, z: mapSize * 0.3, color: '#22C55E' },
    { id: 'trash-a', kind: 'trash-can', x: mapSize * -0.29, y: 0.43, z: mapSize * -0.06, color: '#2F6FB5' },
    { id: 'trash-b', kind: 'trash-can', x: mapSize * 0.06, y: 0.43, z: mapSize * -0.3, color: '#2F6FB5' },
    { id: 'trash-c', kind: 'trash-can', x: mapSize * 0.31, y: 0.43, z: mapSize * -0.18, color: '#2F6FB5' },
    { id: 'trash-d', kind: 'trash-can', x: mapSize * -0.3, y: 0.43, z: mapSize * 0.24, color: '#2F6FB5' },
    { id: 'trash-e', kind: 'trash-can', x: mapSize * 0.23, y: 0.43, z: mapSize * 0.29, color: '#2F6FB5' },
    { id: 'trash-f', kind: 'trash-can', x: mapSize * -0.14, y: 0.43, z: mapSize * 0.32, color: '#2F6FB5' },
    { id: 'trash-g', kind: 'trash-can', x: mapSize * 0.33, y: 0.43, z: mapSize * 0.19, color: '#2F6FB5' },
  ] as const
  const labeledPracticeProps: PushableProp[] = practiceProps.map((prop, index) => theme === 'forest-trail' ? {
    ...prop,
    kind: 'block',
    y: 0.36,
    color: '#A8744A',
    label: '탐험 보급 상자',
    rotationY: index * 0.41,
  } : ({
    ...prop,
    label:
      prop.kind === 'block'
        ? '배송 상자'
        : prop.kind === 'trash-can'
          ? '파란 쓰레기통'
          : '빨간 장애물 콘',
    rotationY: index * 0.41,
  }))
  const [centerX, centerZ] = getPushPuzzleCenter(mapSize, theme)
  const puzzleColors =
    theme === 'starlight-river'
      ? ['#60A5FA', '#A78BFA', '#FBBF24']
      : theme === 'forest-trail'
        ? ['#F97316', '#A3E635', '#38BDF8']
        : ['#FF8A3D', '#45A7A0', '#4169D8']
  const treasureCones = Array.from({ length: 9 }, (_, index) => {
    const angle = (index / 9) * Math.PI * 2
    return {
      id: `treasure-cone-${index}`,
      label: theme === 'forest-trail' ? '보물 지킴 버섯' : '보물 지킴 콘',
      kind: 'cone' as const,
      color: puzzleColors[index % puzzleColors.length],
      x: centerX + Math.cos(angle) * 1.32,
      y: 0.38,
      z: centerZ + Math.sin(angle) * 1.32,
      rotationY: angle,
    }
  })

  return [...labeledPracticeProps, ...treasureCones]
}

function getPushPuzzleCenter(mapSize: number, theme?: StageTheme): [number, number] {
  return theme === 'forest-trail'
    ? [mapSize * 0.12, mapSize * 0.18]
    : [mapSize * 0.18, mapSize * 0.08]
}

function createPushRewardSlots(
  mapSize: number,
  theme?: StageTheme,
): [number, number, number][] {
  const [centerX, centerZ] = getPushPuzzleCenter(mapSize, theme)

  return [
    [centerX, 0, centerZ],
    [centerX - 0.42, 0, centerZ + 0.28],
    [centerX + 0.42, 0, centerZ + 0.28],
  ]
}

// Keep the walking routes open while spreading a modest number of sleeping
// rigid bodies through every quadrant. No per-frame placement or mesh colliders.
function distributePushableProps(
  props: PushableProp[],
  mapSize: number,
  obstacles: readonly WorldObstacle[],
  structures: readonly Pick<SpeedZone, 'x' | 'z' | 'halfWidth' | 'halfDepth' | 'rotationY'>[],
  theme?: StageTheme,
): PushableProp[] {
  const forest = theme === 'forest-trail'
  const additions: PushableProp[] = Array.from({ length: 20 }, (_, index) => {
    const cone = index < 12
    return {
      id: `scattered-${cone ? 'cone' : 'trash'}-${index}`,
      kind: cone ? 'cone' : forest ? 'block' : 'trash-can',
      label: cone
        ? forest ? '반딧불 버섯' : '빨간 장애물 콘'
        : forest ? '탐험 보급 상자' : '파란 쓰레기통',
      color: cone ? '#FF8A3D' : forest ? '#A8744A' : '#2F6FB5',
      x: 0, z: 0, y: cone ? 0.38 : forest ? 0.36 : 0.43, rotationY: index * 0.83,
    }
  })
  const placed = props.filter((prop) => prop.id.startsWith('treasure-cone'))
  const isClear = (x: number, z: number) =>
    structures.every((structure) => isCircleClearOfSpeedZone(
      { x, z, radius: 0.65 }, structure, 1.5,
    )) &&
    obstacles.every((obstacle) => Math.hypot(x - obstacle.x, z - obstacle.z) > obstacle.radius + 1.1) &&
    placed.every((other) => Math.hypot(x - other.x, z - other.z) > 2.4)
  const scattered = [...props.filter((prop) => !prop.id.startsWith('treasure-cone')), ...additions]
  scattered.forEach((prop, index) => {
    if (Math.hypot(prop.x, prop.z) > 5 && isClear(prop.x, prop.z)) {
      placed.push(prop)
      return
    }
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const step = index * 31 + attempt
      const angle = step * Math.PI * (3 - Math.sqrt(5)) + 0.35
      const radius = mapSize * (0.1 + ((step * 7) % 23) / 22 * 0.29)
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      if (!isClear(x, z)) continue
      placed.push({ ...prop, x, z })
      break
    }
  })
  return placed
}

interface NaturalAssetConfig {
  variant: NaturalBlockAssetVariant | MudAssetVariant
  label: string
  behavior: 'block' | 'mud'
  radius: number
  halfWidth: number
  halfHeight: number
  halfDepth: number
  modelScale: [number, number, number]
  multiplier?: number
}

interface NaturalAssetPlacement extends NaturalAssetConfig {
  id: string
  x: number
  z: number
  rotationY: number
}

const NATURAL_ASSET_CONFIGS: Record<
  NaturalAssetConfig['variant'],
  NaturalAssetConfig
> = {
  'tree-root': {
    variant: 'tree-root',
    label: '나무 뿌리',
    behavior: 'block',
    radius: 1.2,
    halfWidth: 0.88,
    halfHeight: 0.7,
    halfDepth: 0.88,
    modelScale: [2.15, 2.15, 2.15],
  },
  'fallen-log-a': {
    variant: 'fallen-log-a',
    label: '쓰러진 통나무',
    behavior: 'block',
    radius: 2.15,
    halfWidth: 2.05,
    halfHeight: 0.64,
    halfDepth: 0.62,
    modelScale: [4.15, 4.15, 4.15],
  },
  'fallen-log-b': {
    variant: 'fallen-log-b',
    label: '갈라진 통나무',
    behavior: 'block',
    radius: 1.8,
    halfWidth: 0.66,
    halfHeight: 0.78,
    halfDepth: 1.65,
    modelScale: [3.25, 3.25, 3.25],
  },
  'mud-a': {
    variant: 'mud-a',
    label: '질퍽한 진흙밭',
    behavior: 'mud',
    radius: 3.4,
    halfWidth: 2.44,
    halfHeight: 0,
    halfDepth: 2.35,
    modelScale: [5.2, 0.32, 4.7],
    multiplier: 0.48,
  },
  'mud-b': {
    variant: 'mud-b',
    label: '미끄러운 진흙밭',
    behavior: 'mud',
    radius: 3.5,
    halfWidth: 2.2,
    halfHeight: 0,
    halfDepth: 2.7,
    modelScale: [4.7, 0.35, 5.4],
    multiplier: 0.6,
  },
}

const NATURAL_ASSET_ORDER = [
  'tree-root',
  'mud-a',
  'fallen-log-a',
  'mud-b',
  'fallen-log-b',
] as const
const NATURAL_GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

function getNaturalAssetCounts(
  theme: StageTheme,
): Record<NaturalAssetConfig['variant'], number> {
  if (theme === 'forest-trail') {
    return {
      'tree-root': 6,
      'fallen-log-a': 4,
      'fallen-log-b': 4,
      'mud-a': 5,
      'mud-b': 5,
    }
  }
  if (theme === 'starlight-river') {
    return {
      'tree-root': 3,
      'fallen-log-a': 2,
      'fallen-log-b': 3,
      'mud-a': 2,
      'mud-b': 3,
    }
  }
  return {
    'tree-root': 3,
    'fallen-log-a': 2,
    'fallen-log-b': 2,
    'mud-a': 2,
    'mud-b': 2,
  }
}

function createNaturalAssetQueue(
  theme: StageTheme,
): NaturalAssetConfig['variant'][] {
  const remaining = getNaturalAssetCounts(theme)
  const queue: NaturalAssetConfig['variant'][] = []
  while (Object.values(remaining).some((count) => count > 0)) {
    for (const variant of NATURAL_ASSET_ORDER) {
      if (remaining[variant] <= 0) continue
      queue.push(variant)
      remaining[variant] -= 1
    }
  }
  return queue
}

function isCircleClearOfSurfaceZone(
  x: number,
  z: number,
  radius: number,
  zone: SurfaceZone,
): boolean {
  const offsetX = x - zone.x
  const offsetZ = z - zone.z
  const cosine = Math.cos(zone.rotationY)
  const sine = Math.sin(zone.rotationY)
  const localX = offsetX * cosine - offsetZ * sine
  const localZ = offsetX * sine + offsetZ * cosine
  const clearance = radius + 1
  const expandedHalfWidth = zone.halfWidth + clearance
  const expandedHalfDepth = zone.halfDepth + clearance

  return (
    (localX * localX) / (expandedHalfWidth * expandedHalfWidth) +
      (localZ * localZ) / (expandedHalfDepth * expandedHalfDepth) >
    1
  )
}

function createNaturalAssetPlacements(
  mapSize: number,
  theme: StageTheme,
  obstacles: readonly WorldObstacle[],
  structureClearances: readonly { x: number; z: number; radius: number }[],
  speedZones: readonly SpeedZone[],
  surfaceZones: readonly SurfaceZone[],
): NaturalAssetPlacement[] {
  const queue = createNaturalAssetQueue(theme)
  const placements: NaturalAssetPlacement[] = []
  const themeOffset =
    theme === 'forest-trail'
      ? 0.73
      : theme === 'starlight-river'
        ? 1.41
        : 0.18

  queue.forEach((variant, index) => {
    const config = NATURAL_ASSET_CONFIGS[variant]
    for (let attempt = 0; attempt < 720; attempt += 1) {
      const step = index * 47 + attempt
      const angle = themeOffset + step * NATURAL_GOLDEN_ANGLE
      const radiusBand = ((step * 7) % 19) / 18
      const distance = mapSize * (0.13 + radiusBand * 0.25)
      const x = Number((Math.cos(angle) * distance).toFixed(2))
      const z = Number((Math.sin(angle) * distance).toFixed(2))
      const spawnClearance = config.behavior === 'block' ? 14 : 10
      const edgeClearance = mapSize / 2 - 8 - config.radius
      if (
        Math.hypot(x, z) < spawnClearance ||
        Math.abs(x) > edgeClearance ||
        Math.abs(z) > edgeClearance
      ) {
        continue
      }
      if (
        obstacles.some(
          (obstacle) =>
            Math.hypot(x - obstacle.x, z - obstacle.z) <
            config.radius + obstacle.radius + 1.1,
        ) ||
        structureClearances.some(
          (clearance) =>
            Math.hypot(x - clearance.x, z - clearance.z) <
            config.radius + clearance.radius + 2.8,
        ) ||
        surfaceZones.some(
          (zone) =>
            (theme !== 'starlight-river' || zone.kind !== 'slick') &&
            !isCircleClearOfSurfaceZone(x, z, config.radius, zone),
        ) ||
        speedZones.some(
          (zone) =>
            !isCircleClearOfSpeedZone(
              { x, z, radius: config.radius },
              zone,
              config.behavior === 'block' ? 3.6 : 0.9,
            ),
        ) ||
        placements.some((placement) => {
          const spacing =
            placement.behavior === 'mud' && config.behavior === 'mud'
              ? 3.5
              : placement.behavior === 'block' && config.behavior === 'block'
                ? 3
                : 2.5
          return (
            Math.hypot(x - placement.x, z - placement.z) <
            config.radius + placement.radius + spacing
          )
        })
      ) {
        continue
      }

      placements.push({
        ...config,
        id: `natural-${variant}-${index}`,
        x,
        z,
        rotationY: Number(
          (themeOffset + index * 0.83 + attempt * 0.19).toFixed(4),
        ),
      })
      break
    }
  })

  return placements
}

function isCircleClearOfSpeedZone(
  tree: Pick<WorldObstacle, 'x' | 'z' | 'radius'>,
  zone: Pick<SpeedZone, 'x' | 'z' | 'halfWidth' | 'halfDepth' | 'rotationY'>,
  extraClearance = 1.15,
): boolean {
  const offsetX = tree.x - zone.x
  const offsetZ = tree.z - zone.z
  const cosine = Math.cos(zone.rotationY)
  const sine = Math.sin(zone.rotationY)
  const localX = offsetX * cosine - offsetZ * sine
  const localZ = offsetX * sine + offsetZ * cosine
  const clearance = tree.radius + extraClearance

  return (
    Math.abs(localX) > zone.halfWidth + clearance ||
    Math.abs(localZ) > zone.halfDepth + clearance
  )
}

export function createWorldPhysicsLayout(
  stage: Pick<GameStage, 'mapSize' | 'theme'>,
): WorldPhysicsLayout {
  const terrainRamps = createTerrainRamps(stage.mapSize, stage.theme)
  const elevatedPlatforms = createElevatedPlatforms(
    stage.mapSize,
    stage.theme,
  )
  const elevatedWalkways = createElevatedWalkways(stage.mapSize, stage.theme)
  const elevators = createElevators(stage.mapSize, stage.theme)
  let pushableProps = createPushableProps(stage.mapSize, stage.theme)
  const pushRewardSlots = createPushRewardSlots(stage.mapSize, stage.theme)
  const speedZones = createSpeedZones(stage.mapSize, stage.theme)
  const rideableObstacles = createRideableObstacles(
    stage.mapSize,
    stage.theme,
  ).filter((obstacle) =>
    // Low ridges never cut through forest landmarks or the log tunnel.
    !obstacle.id.startsWith('forest-ridge-') ||
    (createForestLandmarks(stage.mapSize).clearances.every(
      (clearance) =>
        Math.hypot(obstacle.x - clearance.x, obstacle.z - clearance.z) >
        clearance.radius + obstacle.halfWidth,
    ) &&
      createTunnels(stage.mapSize, stage.theme).every(
        (tunnel) =>
          Math.hypot(obstacle.x - tunnel.x, obstacle.z - tunnel.z) >
          tunnel.halfDepth + obstacle.halfWidth + 1,
      )),
  )
  const tunnels = createTunnels(stage.mapSize, stage.theme)
  const isForest = stage.theme === 'forest-trail'
  const forest = isForest
    ? createForestLandmarks(stage.mapSize)
    : { landmarks: [], obstacles: [], clearances: [] }
  const structureClearances = [
    ...forest.clearances,
    ...getWalkwayClearances(elevatedWalkways),
    ...terrainRamps.flatMap((ramp) => {
      // A chain of small bounds reserves the actual approach, not a huge
      // circular clearing around long, narrow ramps.
      const segments = Math.ceil(ramp.halfDepth * 2 / 4)
      return Array.from({ length: segments + 1 }, (_, index) => {
        const [x, , z] = getTerrainRampSurfacePosition(ramp, 0, index / segments * 2 - 1)
        return { x, z, radius: ramp.halfWidth + 1 }
      })
    }),
    ...elevatedPlatforms.map((platform) => ({
      x: platform.x,
      z: platform.z,
      radius: Math.hypot(platform.halfWidth, platform.halfDepth) + 0.7,
    })),
    ...elevators.map((elevator) => ({
      x: elevator.x,
      z: elevator.z,
      radius: Math.hypot(elevator.halfWidth, elevator.halfDepth) + 0.8,
    })),
    ...rideableObstacles
      .filter((obstacle) => obstacle.id.startsWith('forest-ridge-'))
      .map((obstacle) => ({
        x: obstacle.x,
        z: obstacle.z,
        radius: Math.hypot(obstacle.halfWidth, obstacle.halfDepth) + 0.5,
      })),
    ...tunnels.map((tunnel) => ({
      x: tunnel.x,
      z: tunnel.z,
      radius: Math.hypot(
        tunnel.halfWidth + tunnel.wallThickness,
        tunnel.halfDepth,
      ) + 0.8,
    })),
    {
      x: pushRewardSlots[0][0],
      z: pushRewardSlots[0][2],
      radius: 2.7,
    },
  ]
  const fixedSceneryObstacles = isForest
    ? forest.obstacles
    : [
        ...createBenches(stage.mapSize),
        ...createGearRacks(stage.mapSize),
        ...createKiosks(stage.mapSize),
      ]
  const treeObstacles = [
    ...createTreeRing(stage.mapSize, stage.theme),
    ...createInteriorTrees(stage.mapSize, stage.theme),
    ...(stage.theme === 'forest-trail'
      ? createForestTrees(stage.mapSize)
      : []),
  ].filter(
    (tree) =>
      fixedSceneryObstacles.every(
        (obstacle) =>
          Math.hypot(tree.x - obstacle.x, tree.z - obstacle.z) >
          tree.radius + obstacle.radius + 0.7,
      ) &&
      speedZones.every((zone) => isCircleClearOfSpeedZone(tree, zone)),
  )
  const baseObstacles = [
    ...treeObstacles.filter((tree) =>
      forest.clearances.every(
        (clearance) =>
          Math.hypot(tree.x - clearance.x, tree.z - clearance.z) >
          tree.radius + clearance.radius,
      ),
    ),
    ...fixedSceneryObstacles.filter((obstacle) => !obstacle.id.startsWith('landmark-')),
  ].filter((obstacle) =>
    structureClearances.every(
      (clearance) =>
        Math.hypot(obstacle.x - clearance.x, obstacle.z - clearance.z) >
        obstacle.radius + clearance.radius,
      ),
  )
  baseObstacles.push(...forest.obstacles)
  const baseSurfaceZones = [...createSurfaceZones(stage.mapSize, stage.theme), ...getCentralParkZones(stage.mapSize, stage.theme)]
  // More asset-backed trees in the interior and around the park, with the
  // central spawn, bridge columns, pond and ramp entrances kept clear.
  for (let attempt = 0, added = 0; attempt < 800 && added < 26; attempt += 1) {
    const parkTree = added < 10 && attempt < 240
    const angle = attempt * NATURAL_GOLDEN_ANGLE + 0.61
    const distance = stage.mapSize * (parkTree ? 0.07 + (attempt % 4) * 0.017 : added < 10 ? 0.17 + (attempt % 9) * 0.01 : 0.19 + (attempt % 9) * 0.023)
    const x = (parkTree ? stage.mapSize * 0.06 : 0) + Math.cos(angle) * distance
    const z = (parkTree ? stage.mapSize * 0.055 : 0) + Math.sin(angle) * distance
    const tree: WorldObstacle = { id: `park-tree-${added}`, label: isForest ? '달그늘 나무' : '공원 산책 나무', x, z, radius: 0.48, response: 'stop' }
    if (Math.hypot(x, z) < 8 ||
      baseObstacles.some((other) => Math.hypot(x - other.x, z - other.z) < other.radius + 3.3) ||
      structureClearances.some((other) => Math.hypot(x - other.x, z - other.z) < other.radius + 1.4) ||
      speedZones.some((zone) => !isCircleClearOfSpeedZone(tree, zone, 1.4)) ||
      baseSurfaceZones.some((zone) => zone.kind === 'water' && !isCircleClearOfSurfaceZone(x, z, 0.6, zone))) continue
    baseObstacles.push(tree)
    added += 1
  }
  pushableProps = distributePushableProps(pushableProps, stage.mapSize, baseObstacles, [
    ...terrainRamps, ...elevatedPlatforms, ...elevatedWalkways, ...rideableObstacles, ...tunnels,
    ...elevators.map((elevator) => ({ ...elevator, rotationY: 0 })),
  ], stage.theme)
  const naturalPlacementObstacles = [
    ...baseObstacles,
    ...pushableProps.map((prop) => ({
      id: `natural-clearance-${prop.id}`,
      label: prop.label,
      x: prop.x,
      z: prop.z,
      radius: prop.kind === 'trash-can' ? 0.65 : 0.5,
      response: 'stop' as const,
    })),
  ]
  const naturalPlacements = createNaturalAssetPlacements(
    stage.mapSize,
    stage.theme,
    naturalPlacementObstacles,
    structureClearances,
    speedZones,
    baseSurfaceZones,
  )
  const naturalBlockers: WorldObstacle[] = naturalPlacements
    .filter((placement) => placement.behavior === 'block')
    .map((placement) => ({
      id: placement.id,
      label: placement.label,
      x: placement.x,
      z: placement.z,
      radius: placement.radius,
      response: 'stop',
      assetVariant: placement.variant as NaturalBlockAssetVariant,
      rotationY: placement.rotationY,
      colliderHalfWidth: placement.halfWidth,
      colliderHalfHeight: placement.halfHeight,
      colliderHalfDepth: placement.halfDepth,
      modelScale: placement.modelScale,
    }))
  const mudZones: SurfaceZone[] = naturalPlacements
    .filter((placement) => placement.behavior === 'mud')
    .map((placement) => ({
      id: placement.id,
      label: placement.label,
      kind: 'mud',
      color: '#68442F',
      x: placement.x,
      z: placement.z,
      halfWidth: placement.halfWidth,
      halfDepth: placement.halfDepth,
      rotationY: placement.rotationY,
      multiplier: placement.multiplier ?? 0.55,
      assetVariant: placement.variant as MudAssetVariant,
      modelScale: placement.modelScale,
    }))
  const obstacles = [...baseObstacles, ...naturalBlockers]

  return {
    landmarks: forest.landmarks,
    obstacles,
    rideableObstacles,
    tunnels,
    speedZones,
    surfaceZones: [...baseSurfaceZones, ...mudZones],
    terrainRamps,
    elevatedPlatforms,
    elevatedWalkways,
    elevators,
    pushableProps,
    pushRewardSlots,
  }
}

function isInsideSpeedZone(x: number, z: number, zone: SpeedZone): boolean {
  const offsetX = x - zone.x
  const offsetZ = z - zone.z
  const cosine = Math.cos(zone.rotationY)
  const sine = Math.sin(zone.rotationY)
  const localX = offsetX * cosine - offsetZ * sine
  const localZ = offsetX * sine + offsetZ * cosine

  return (
    Math.abs(localX) <= zone.halfWidth &&
    Math.abs(localZ) <= zone.halfDepth
  )
}

export function getActiveSpeedZone(
  layout: WorldPhysicsLayout,
  x: number,
  z: number,
): SpeedZone | undefined {
  return layout.speedZones.find((zone) => isInsideSpeedZone(x, z, zone))
}

function isInsideSurfaceZone(
  x: number,
  z: number,
  zone: SurfaceZone,
): boolean {
  const offsetX = x - zone.x
  const offsetZ = z - zone.z
  const cosine = Math.cos(zone.rotationY)
  const sine = Math.sin(zone.rotationY)
  const localX = offsetX * cosine - offsetZ * sine
  const localZ = offsetX * sine + offsetZ * cosine

  return (
    (localX * localX) / (zone.halfWidth * zone.halfWidth) +
      (localZ * localZ) / (zone.halfDepth * zone.halfDepth) <=
    1
  )
}

export function getActiveSurfaceZone(
  layout: WorldPhysicsLayout,
  x: number,
  z: number,
  surfaceHeight = 0,
): SurfaceZone | undefined {
  if (surfaceHeight > 0.55) return undefined
  const matchingZones = layout.surfaceZones.filter((zone) =>
    isInsideSurfaceZone(x, z, zone),
  )
  return (
    matchingZones.find((zone) => zone.id === 'central-park-pond') ??
    matchingZones.find((zone) => zone.kind !== 'slick') ??
    matchingZones[0]
  )
}

export function resolveWorldPhysics(
  input: WorldPhysicsInput,
  layout: WorldPhysicsLayout,
): WorldPhysicsStep {
  let x = input.nextX
  let z = input.nextZ
  let velocityX = input.velocityX
  let velocityZ = input.velocityZ
  let impact: WorldPhysicsStep['impact']

  for (const obstacle of layout.obstacles) {
    const minimumDistance = input.ballRadius + obstacle.radius
    let offsetX = x - obstacle.x
    let offsetZ = z - obstacle.z
    let distance = Math.hypot(offsetX, offsetZ)
    if (distance >= minimumDistance) continue

    if (distance < 0.0001) {
      offsetX = input.startX - obstacle.x
      offsetZ = input.startZ - obstacle.z
      distance = Math.hypot(offsetX, offsetZ)
      if (distance < 0.0001) {
        const speed = Math.hypot(input.velocityX, input.velocityZ)
        offsetX = speed > 0 ? -input.velocityX / speed : 1
        offsetZ = speed > 0 ? -input.velocityZ / speed : 0
        distance = 1
      }
    }

    const normalX = offsetX / distance
    const normalZ = offsetZ / distance
    x = obstacle.x + normalX * minimumDistance
    z = obstacle.z + normalZ * minimumDistance

    const inwardSpeed = velocityX * normalX + velocityZ * normalZ
    if (obstacle.response === 'bounce' && inwardSpeed < 0) {
      const restitution = 0.32
      velocityX -= (1 + restitution) * inwardSpeed * normalX
      velocityZ -= (1 + restitution) * inwardSpeed * normalZ
    } else {
      velocityX = 0
      velocityZ = 0
    }

    impact ??= {
      obstacle,
      response: obstacle.response,
    }
  }

  const speedZone =
    getActiveSpeedZone(layout, x, z) ??
    getActiveSpeedZone(layout, input.startX, input.startZ)
  const surfaceZone =
    getActiveSurfaceZone(layout, x, z) ??
    getActiveSurfaceZone(layout, input.startX, input.startZ)

  return {
    x,
    z,
    velocityX,
    velocityZ,
    speedMultiplier:
      (speedZone?.multiplier ?? 1) *
      (surfaceZone?.multiplier ?? 1),
    speedZone,
    surfaceZone,
    impact,
  }
}
