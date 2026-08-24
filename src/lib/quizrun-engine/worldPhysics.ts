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

export interface WorldPhysicsLayout {
  obstacles: WorldObstacle[]
  rideableObstacles: RideableObstacle[]
  tunnels: WorldTunnel[]
  speedZones: SpeedZone[]
  surfaceZones: SurfaceZone[]
  terrainRamps: TerrainRamp[]
  elevatedPlatforms: ElevatedPlatform[]
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
        x: 0,
        z: 0,
        halfWidth: mapSize * 0.34,
        halfDepth: 1.05,
        rotationY: 0.18,
        multiplier: 1.28,
      },
      {
        id: 'forest-sprint-north',
        label: '솔잎 지름길',
        x: 0,
        z: 0,
        halfWidth: 0.92,
        halfDepth: mapSize * 0.34,
        rotationY: -0.34,
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
      label: '달빛 수로 터널',
      x: mapSize * 0.35,
      z: -mapSize * 0.04,
      halfWidth: 4.4,
      halfDepth: 9,
      clearanceHeight: 5.4,
      wallThickness: 0.5,
      roofThickness: 0.42,
      rotationY: 0.18,
      color: '#263A35',
      accentColor: '#6ED7C8',
    },
  ]
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
    ? [...steppingBlocks, ...createForestRidges(mapSize)]
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
        x: -mapSize * 0.19,
        z: mapSize * 0.17,
        halfWidth: mapSize * 0.14,
        halfDepth: mapSize * 0.09,
        rotationY: 0.32,
        multiplier: 0.68,
      },
      {
        id: 'forest-creek',
        label: '달빛 얕은 물길',
        kind: 'water',
        color: '#67BFD0',
        x: mapSize * 0.2,
        z: -mapSize * 0.14,
        halfWidth: mapSize * 0.075,
        halfDepth: mapSize * 0.1,
        rotationY: -0.48,
        multiplier: 0.55,
      },
      {
        id: 'forest-clearing',
        label: '반딧불 잔디터',
        kind: 'grass',
        color: '#86C77A',
        x: mapSize * 0.24,
        z: mapSize * 0.22,
        halfWidth: mapSize * 0.07,
        halfDepth: mapSize * 0.045,
        rotationY: -0.21,
        multiplier: 0.74,
      },
      {
        id: 'forest-rain-puddle',
        label: '어두운 빗물 웅덩이',
        kind: 'water',
        color: '#72C9D7',
        x: -mapSize * 0.26,
        z: -mapSize * 0.22,
        halfWidth: mapSize * 0.055,
        halfDepth: mapSize * 0.038,
        rotationY: 0.38,
        multiplier: 0.6,
      },
      {
        id: 'forest-moon-pool',
        label: '달빛 굽이 물길',
        kind: 'water',
        color: '#3A8299',
        x: -mapSize * 0.35,
        z: mapSize * 0.28,
        halfWidth: mapSize * 0.052,
        halfDepth: mapSize * 0.075,
        rotationY: -0.62,
        multiplier: 0.5,
      },
      {
        id: 'forest-tunnel-runoff',
        label: '터널 속 얕은 수로',
        kind: 'water',
        color: '#2D8296',
        x: mapSize * 0.35,
        z: -mapSize * 0.04,
        halfWidth: 3.5,
        halfDepth: 11.2,
        rotationY: 0.18,
        multiplier: 0.58,
      },
      {
        id: 'forest-north-shallows',
        label: '북쪽 반딧불 여울',
        kind: 'water',
        color: '#4AA9B5',
        x: mapSize * 0.06,
        z: mapSize * 0.4,
        halfWidth: mapSize * 0.055,
        halfDepth: mapSize * 0.034,
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

  return [
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
    ...(theme === 'forest-trail'
      ? createHill(
          'moon-hill',
          '달그늘 북쪽 언덕',
          '#435A4B',
          -mapSize * 0.1,
          mapSize * 0.31,
          1.04,
          mapSize,
        )
      : []),
    createUpperDeckRamp(mapSize, theme),
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
      ramp: '#7E9D62',
      platform: '#89AA6D',
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
  const towerPlatform: ElevatedPlatform = {
    id: 'ramp-upper-deck',
    label: '경사로 2층 전망대',
    color: colors.platform,
    x: mapSize * 0.1,
    y: UPPER_DECK_SURFACE_Y - halfHeight,
    z: -mapSize * 0.19,
    halfWidth: 5.5,
    halfHeight,
    halfDepth: 5.5,
    rotationY: 0,
  }
  const elevatorPlatform: ElevatedPlatform = {
    id: 'elevator-upper-deck',
    label: '엘리베이터 2층 보물마당',
    color: colors.elevator,
    x: -mapSize * 0.14,
    y: UPPER_DECK_SURFACE_Y - halfHeight,
    z: mapSize * 0.2,
    halfWidth: 5.2,
    halfHeight,
    halfDepth: 5.2,
    rotationY: 0,
  }

  return [towerPlatform, elevatorPlatform]
}

function createUpperDeckRamp(
  mapSize: number,
  theme: StageTheme,
): TerrainRamp {
  const platform = createElevatedPlatforms(mapSize, theme)[0]
  const halfDepth = Math.min(14, mapSize * 0.085)
  const halfWidth = 3.15
  const halfHeight = 0.18
  const baseSurfaceY = 0.04
  const rotationMagnitude = Math.asin(
    (UPPER_DECK_SURFACE_Y - baseSurfaceY) / (halfDepth * 2),
  )
  const rotationX = -rotationMagnitude
  const centerSurfaceY = (UPPER_DECK_SURFACE_Y + baseSurfaceY) / 2

  return {
    id: 'upper-deck-ramp',
    label: '2층 연결 경사로',
    color: getUpperDeckColors(theme).ramp,
    x: platform.x,
    y: centerSurfaceY - halfHeight * Math.cos(rotationX),
    z: platform.z + platform.halfDepth + halfDepth,
    halfWidth,
    halfHeight,
    halfDepth,
    rotationX,
    rotationY: Math.PI,
  }
}

function createElevators(
  mapSize: number,
  theme: StageTheme,
): WorldElevator[] {
  const halfHeight = 0.18
  const platforms = createElevatedPlatforms(mapSize, theme)

  return platforms.map((landing, index) => ({
    id: index === 0 ? 'ramp-deck-elevator' : 'treasure-elevator',
    label:
      index === 0
        ? '전망대 연결 승강 발판'
        : '보물마당 연결 승강 발판',
    color: getUpperDeckColors(theme).elevator,
    x: landing.x + landing.halfWidth + 2.05,
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
  const labeledPracticeProps: PushableProp[] = practiceProps.map((prop, index) => ({
    ...prop,
    label:
      prop.kind === 'block'
        ? '배송 상자'
        : prop.kind === 'trash-can'
          ? '파란 쓰레기통'
          : '빨간 장애물 콘',
    rotationY: index * 0.41,
  }))
  const centerX = mapSize * 0.18
  const centerZ = mapSize * 0.08
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
      label: '보물 지킴 콘',
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

function createPushRewardSlots(
  mapSize: number,
): [number, number, number][] {
  const centerX = mapSize * 0.18
  const centerZ = mapSize * 0.08

  return [
    [centerX, 0, centerZ],
    [centerX - 0.42, 0, centerZ + 0.28],
    [centerX + 0.42, 0, centerZ + 0.28],
  ]
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
  zone: SpeedZone,
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
  const elevators = createElevators(stage.mapSize, stage.theme)
  const pushableProps = createPushableProps(stage.mapSize, stage.theme)
  const pushRewardSlots = createPushRewardSlots(stage.mapSize)
  const speedZones = createSpeedZones(stage.mapSize, stage.theme)
  const rideableObstacles = createRideableObstacles(
    stage.mapSize,
    stage.theme,
  )
  const tunnels = createTunnels(stage.mapSize, stage.theme)
  const structureClearances = [
    ...terrainRamps.map((ramp) => ({
      x: ramp.x,
      z: ramp.z,
      radius: Math.hypot(ramp.halfWidth, ramp.halfDepth) + 0.7,
    })),
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
  const fixedSceneryObstacles = [
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
    ...treeObstacles,
    ...fixedSceneryObstacles,
  ].filter((obstacle) =>
    structureClearances.every(
      (clearance) =>
        Math.hypot(obstacle.x - clearance.x, obstacle.z - clearance.z) >
        obstacle.radius + clearance.radius,
      ),
  )
  const baseSurfaceZones = createSurfaceZones(stage.mapSize, stage.theme)
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
    obstacles,
    rideableObstacles,
    tunnels,
    speedZones,
    surfaceZones: [...baseSurfaceZones, ...mudZones],
    terrainRamps,
    elevatedPlatforms,
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
