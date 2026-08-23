import type { GameStage, StageTheme } from './types'

export type ObstacleResponse = 'stop' | 'bounce'

export interface WorldObstacle {
  id: string
  label: string
  x: number
  z: number
  radius: number
  response: ObstacleResponse
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

export type SurfaceKind = 'grass' | 'water'

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
  kind: 'block' | 'cone' | 'pin'
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

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

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
      label: theme === 'starlight-river' ? '별빛 나무' : '공원 나무',
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      radius: 0.48,
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
  return Array.from({ length: 18 }, (_, index) => {
    const angle = index * GOLDEN_ANGLE + 0.35
    const radius =
      mapSize * (0.1 + (index % 3) * 0.07) +
      Math.sin(index * 1.3) * 1.4
    return {
      id: `forest-tree-${index}`,
      label: '바람숲 나무',
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
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
        label: '별빛 스피드 다리',
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

function createRideableObstacles(mapSize: number): RideableObstacle[] {
  const mapScale = mapSize / 60

  return Array.from(
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
}

function createSurfaceZones(
  mapSize: number,
  theme: StageTheme,
): SurfaceZone[] {
  if (theme === 'forest-trail') {
    return [
      {
        id: 'forest-meadow',
        label: '폭신한 숲 잔디',
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
        label: '얕은 숲 물길',
        kind: 'water',
        color: '#67BFD0',
        x: mapSize * 0.2,
        z: -mapSize * 0.14,
        halfWidth: mapSize * 0.075,
        halfDepth: mapSize * 0.1,
        rotationY: -0.48,
        multiplier: 0.55,
      },
    ]
  }

  if (theme === 'starlight-river') {
    return [
      {
        id: 'river-grass-bank',
        label: '별빛 강둑 잔디',
        kind: 'grass',
        color: '#5F9A7B',
        x: -mapSize * 0.21,
        z: -mapSize * 0.15,
        halfWidth: mapSize * 0.11,
        halfDepth: mapSize * 0.075,
        rotationY: -0.24,
        multiplier: 0.7,
      },
      {
        id: 'river-shallows',
        label: '반짝이는 얕은 물',
        kind: 'water',
        color: '#4FA8C7',
        x: mapSize * 0.18,
        z: mapSize * 0.1,
        halfWidth: mapSize * 0.13,
        halfDepth: mapSize * 0.08,
        rotationY: 0.2,
        multiplier: 0.52,
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
  const halfDepth = mapSize * 0.034
  const halfWidth = mapSize * 0.027
  const halfHeight = 0.13
  const rotationX = 0.1
  const centerY =
    halfHeight + Math.sin(rotationX) * halfDepth + 0.035
  const directionX = Math.sin(rotationY)
  const directionZ = Math.cos(rotationY)

  return [
    {
      id: `${id}-up`,
      label,
      color,
      x: centerX - directionX * halfDepth,
      y: centerY,
      z: centerZ - directionZ * halfDepth,
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
      x: centerX + directionX * halfDepth,
      y: centerY,
      z: centerZ + directionZ * halfDepth,
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
    { id: 'block-b', kind: 'block', x: 6.1, y: 0.36, z: -4.2, color: '#4169D8' },
    { id: 'block-c', kind: 'block', x: 7, y: 0.36, z: -4.8, color: '#F2C94C' },
    { id: 'cone-a', kind: 'cone', x: -5.3, y: 0.38, z: -4.8, color: '#FF8A3D' },
    { id: 'cone-b', kind: 'cone', x: -6.2, y: 0.38, z: -4.3, color: '#45A7A0' },
    { id: 'cone-c', kind: 'cone', x: -7.1, y: 0.38, z: -4.9, color: '#A78BFA' },
    { id: 'pin-a', kind: 'pin', x: 3.9, y: 0.36, z: 5.8, color: '#38BDF8' },
    { id: 'pin-b', kind: 'pin', x: 4.7, y: 0.36, z: 6.2, color: '#FB7185' },
    { id: 'pin-c', kind: 'pin', x: 5.5, y: 0.36, z: 5.7, color: '#22C55E' },
  ] as const
  const labeledPracticeProps: PushableProp[] = practiceProps.map((prop, index) => ({
    ...prop,
    label:
      prop.kind === 'cone'
        ? '말랑 연습 콘'
        : prop.kind === 'pin'
          ? '컬러 트레이닝 핀'
          : '폼 연습 블록',
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
    {
      x: pushRewardSlots[0][0],
      z: pushRewardSlots[0][2],
      radius: 2.7,
    },
  ]
  const obstacles = [
    ...createTreeRing(stage.mapSize, stage.theme),
    ...createBenches(stage.mapSize),
    ...createGearRacks(stage.mapSize),
    ...createKiosks(stage.mapSize),
    ...(stage.theme === 'forest-trail'
      ? createForestTrees(stage.mapSize)
      : []),
  ].filter((obstacle) =>
    structureClearances.every(
      (clearance) =>
        Math.hypot(obstacle.x - clearance.x, obstacle.z - clearance.z) >
        obstacle.radius + clearance.radius,
    ),
  )

  return {
    obstacles,
    rideableObstacles: createRideableObstacles(stage.mapSize),
    speedZones: createSpeedZones(stage.mapSize, stage.theme),
    surfaceZones: createSurfaceZones(stage.mapSize, stage.theme),
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
): SurfaceZone | undefined {
  return layout.surfaceZones.find((zone) =>
    isInsideSurfaceZone(x, z, zone),
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
