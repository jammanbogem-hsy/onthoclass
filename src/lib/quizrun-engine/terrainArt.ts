import type { StageTheme } from './types'
import type { SurfaceZone, WorldPhysicsLayout } from './worldPhysics'

/**
 * Deterministic, visual-only terrain art. Nothing here feeds physics: trails,
 * tufts, flowers and the outer landscape only decorate the existing layout,
 * so every placement stays stable across reloads and stage restarts.
 */

export type TerrainPoint = [number, number]

export interface TerrainTrail {
  id: string
  points: TerrainPoint[]
  width: number
  closed: boolean
}

export interface ScatterSpec {
  x: number
  z: number
  y: number
  scale: number
  rotationY: number
  /** 0..1 value renderers turn into a color or brightness variation. */
  tint: number
}

export interface TerrainArtPalette {
  ground: string
  groundDark: string
  groundLight: string
  edge: string
  trail: string
  trailEdge: string
  clearing: string
  shore: string
  wetShore: string
  riverbed: string
  speckles: readonly string[]
  tuftBase: string
  tuftTip: string
  hillLow: string
  hillHigh: string
  bush: readonly string[]
  canopy: readonly string[]
  trunk: string
  rock: readonly string[]
}

export const TERRAIN_ART_PALETTES: Record<StageTheme, TerrainArtPalette> = {
  'sunny-plaza': {
    ground: '#A9D484',
    groundDark: '#86BC66',
    groundLight: '#C6E39C',
    edge: '#A2CE7E',
    trail: '#E8D4A4',
    trailEdge: '#CDB47F',
    clearing: '#E4D7B0',
    shore: '#E6D6A8',
    wetShore: '#B9AE86',
    riverbed: '#5E9FB0',
    speckles: ['#FFFFFF', '#FFE27A', '#FFB8C8', '#D8C8FF', '#6FA650'],
    tuftBase: '#4F8F3C',
    tuftTip: '#B4DE78',
    hillLow: '#88BE67',
    hillHigh: '#B8DA8C',
    bush: ['#4F9444', '#5DA64C', '#6FB456', '#3F8440'],
    canopy: ['#3F8F4A', '#4FA052', '#62B35B', '#357E43', '#77BC5E'],
    trunk: '#7A5238',
    rock: ['#A7A49A', '#BAB6AA', '#8F8C84', '#C9C2B0'],
  },
  'forest-trail': {
    ground: '#223A2D',
    groundDark: '#172A20',
    groundLight: '#2E4C38',
    edge: '#20372A',
    trail: '#4B4535',
    trailEdge: '#3A3A2C',
    clearing: '#3A4A35',
    shore: '#4D5540',
    wetShore: '#34402F',
    riverbed: '#1F5363',
    speckles: ['#5B4630', '#6E5234', '#8A6A3A', '#3F5C3A', '#B08A4A'],
    tuftBase: '#163326',
    tuftTip: '#4E7E4C',
    hillLow: '#1B3326',
    hillHigh: '#2A4633',
    bush: ['#1E3E2C', '#27503A', '#1A3526', '#2F5A3E'],
    canopy: ['#173628', '#1E4431', '#244D36', '#12301F', '#2B563C'],
    trunk: '#3A2C24',
    rock: ['#56605A', '#626B64', '#48524C', '#6E756B'],
  },
  'starlight-river': {
    ground: '#8FA7B2',
    groundDark: '#768F9C',
    groundLight: '#D5E3EC',
    edge: '#9DB4C0',
    trail: '#C4D2DE',
    trailEdge: '#A3B6C4',
    clearing: '#BCCCD8',
    shore: '#C9D8E2',
    wetShore: '#8AA3B3',
    riverbed: '#5F89AE',
    speckles: ['#FFFFFF', '#EAF6FF', '#CFE6FF', '#7E978E', '#B7D3E8'],
    tuftBase: '#5D7F79',
    tuftTip: '#DDEBEF',
    hillLow: '#B6CAD6',
    hillHigh: '#EEF5FA',
    bush: ['#6D8C86', '#7F9D95', '#5E7C78', '#90AAA3'],
    canopy: ['#3F6461', '#4A706B', '#365955', '#557B74', '#2F504D'],
    trunk: '#4B4046',
    rock: ['#9AA6B0', '#AEB9C2', '#87939E', '#C3CDD5'],
  },
}

export function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** mulberry32: tiny, fast and good enough for decoration. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function latticeValue(x: number, z: number, seed: number): number {
  let hash = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return smooth(t)
}

/** Smooth 2D value noise in 0..1. */
export function valueNoise2D(x: number, z: number, seed = 0): number {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const tx = smooth(x - x0)
  const tz = smooth(z - z0)
  const a = latticeValue(x0, z0, seed)
  const b = latticeValue(x0 + 1, z0, seed)
  const c = latticeValue(x0, z0 + 1, seed)
  const d = latticeValue(x0 + 1, z0 + 1, seed)
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz
}

export function fbm2D(x: number, z: number, seed = 0, octaves = 3): number {
  let amplitude = 0.5
  let frequency = 1
  let total = 0
  let weight = 0
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise2D(x * frequency, z * frequency, seed + octave * 101) * amplitude
    weight += amplitude
    amplitude *= 0.5
    frequency *= 2.03
  }
  return total / weight
}

/** Normalized elliptical distance from a zone center: 1 on its edge. */
export function getZoneDistance(x: number, z: number, zone: SurfaceZone): number {
  const offsetX = x - zone.x
  const offsetZ = z - zone.z
  const cosine = Math.cos(zone.rotationY)
  const sine = Math.sin(zone.rotationY)
  const localX = offsetX * cosine - offsetZ * sine
  const localZ = offsetX * sine + offsetZ * cosine
  return Math.hypot(localX / zone.halfWidth, localZ / zone.halfDepth)
}

/** World position of a zone-local point at a normalized radius and angle. */
export function getZonePoint(
  zone: SurfaceZone,
  angle: number,
  radius: number,
): TerrainPoint {
  const localX = Math.cos(angle) * zone.halfWidth * radius
  const localZ = Math.sin(angle) * zone.halfDepth * radius
  const cosine = Math.cos(zone.rotationY)
  const sine = Math.sin(zone.rotationY)
  return [
    zone.x + localX * cosine + localZ * sine,
    zone.z - localX * sine + localZ * cosine,
  ]
}

function createLoop(
  id: string,
  radiusX: number,
  radiusZ: number,
  width: number,
  seed: number,
  wobble = 0.07,
): TerrainTrail {
  const count = 72
  const points = Array.from({ length: count }, (_, index): TerrainPoint => {
    const angle = (index / count) * Math.PI * 2
    const radiusScale =
      1 +
      Math.sin(angle * 3 + seed) * wobble +
      Math.sin(angle * 5 + seed * 1.7) * wobble * 0.45
    return [
      Math.cos(angle) * radiusX * radiusScale,
      Math.sin(angle) * radiusZ * radiusScale,
    ]
  })
  return { id, points, width, closed: true }
}

function createMeander(
  id: string,
  from: TerrainPoint,
  to: TerrainPoint,
  width: number,
  amplitude: number,
  waves: number,
  phase: number,
): TerrainTrail {
  const count = 40
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const length = Math.hypot(dx, dz) || 1
  const normalX = -dz / length
  const normalZ = dx / length
  const points = Array.from({ length: count + 1 }, (_, index): TerrainPoint => {
    const t = index / count
    // Taper the sway at both ends so trails meet their targets cleanly.
    const sway =
      Math.sin(t * Math.PI * waves + phase) * amplitude * Math.sin(t * Math.PI)
    return [
      from[0] + dx * t + normalX * sway,
      from[1] + dz * t + normalZ * sway,
    ]
  })
  return { id, points, width, closed: false }
}

function polar(radius: number, angle: number): TerrainPoint {
  return [Math.cos(angle) * radius, Math.sin(angle) * radius]
}

export function createTerrainTrails(
  mapSize: number,
  theme: StageTheme,
): TerrainTrail[] {
  const m = mapSize
  if (theme === 'forest-trail') {
    // Paths link the camp (south), log tunnel and arches (west), mushroom
    // grove (east) and the treehouse ramps around the moon lake (north).
    const lake = createLoop('forest-trail-lake-ring', 20, 16, 2.2, 2.3, 0.06)
    const flip = (trail: TerrainTrail): TerrainTrail => ({
      ...trail,
      points: trail.points.map(([x, z]): TerrainPoint => [x, -z]),
    })
    return [
      { ...lake, points: lake.points.map(([x, z]): TerrainPoint => [x, z + m * 0.13]) },
      createMeander('forest-trail-camp', [-m * 0.02, -m * 0.4], [0, m * 0.13 - 16], 2.4, m * 0.03, 2, 0.8),
      createMeander('forest-trail-west', [-m * 0.1, m * 0.05], [-m * 0.46, -m * 0.02], 2.6, m * 0.04, 2.5, 0.4),
      createMeander('forest-trail-arches', [-m * 0.3, m * 0.26], [-m * 0.1, -m * 0.42], 2.2, m * 0.05, 2, 1.6),
      createMeander('forest-trail-east', [m * 0.1, m * 0.08], [m * 0.46, m * 0.0], 2.6, m * 0.03, 2, 2.1),
      createMeander('forest-trail-north', [0, m * 0.13 + 16], [m * 0.02, m * 0.46], 2, m * 0.02, 1.5, 0.3),
    ].map(flip)
  }
  if (theme === 'starlight-river') {
    return [
      createLoop('river-trail-bank', m * 0.43, m * 0.43, 2.6, 4.1, 0.05),
      createMeander('river-trail-west', polar(m * 0.06, Math.PI * 0.8), polar(m * 0.43, Math.PI * 0.8), 2.1, m * 0.03, 2, 0.8),
      createMeander('river-trail-east', polar(m * 0.06, -0.2), polar(m * 0.43, -0.2), 2.1, m * 0.03, 2, 2.1),
    ]
  }
  return [
    createLoop('plaza-jogging-loop', m * 0.37, m * 0.3, 3.4, 1.2),
    createMeander('plaza-spur-west', polar(m * 0.05, Math.PI + 0.3), polar(m * 0.37, Math.PI + 0.3), 2.2, m * 0.03, 2, 0.5),
    createMeander('plaza-spur-south', polar(m * 0.05, Math.PI / 2 + 0.9), polar(m * 0.31, Math.PI / 2 + 0.9), 2.2, m * 0.028, 2, 1.9),
    createMeander('plaza-spur-east', polar(m * 0.05, -0.55), polar(m * 0.36, -0.55), 2.2, m * 0.03, 2.5, 2.7),
    createMeander('plaza-garden-path', polar(m * 0.37, Math.PI * 0.72), polar(m * 0.47, Math.PI * 0.62), 1.6, m * 0.02, 2, 0.2),
  ]
}

function distanceToSegment(
  x: number,
  z: number,
  a: TerrainPoint,
  b: TerrainPoint,
): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const lengthSquared = dx * dx + dz * dz
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSquared))
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t))
}

export function distanceToTrail(x: number, z: number, trail: TerrainTrail): number {
  let best = Number.POSITIVE_INFINITY
  const segmentCount = trail.closed ? trail.points.length : trail.points.length - 1
  for (let index = 0; index < segmentCount; index += 1) {
    const a = trail.points[index]
    const b = trail.points[(index + 1) % trail.points.length]
    best = Math.min(best, distanceToSegment(x, z, a, b))
  }
  return best
}

const trailBounds = new WeakMap<TerrainTrail, [number, number, number, number]>()

function getTrailBounds(trail: TerrainTrail): [number, number, number, number] {
  let bounds = trailBounds.get(trail)
  if (!bounds) {
    const xs = trail.points.map(([x]) => x)
    const zs = trail.points.map(([, z]) => z)
    bounds = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]
    trailBounds.set(trail, bounds)
  }
  return bounds
}

/** How far outside the square play area a point sits (0 inside). */
export function getOutsideDistance(x: number, z: number, mapSize: number): number {
  const half = mapSize / 2
  return Math.hypot(Math.max(0, Math.abs(x) - half), Math.max(0, Math.abs(z) - half))
}

/**
 * Height of the decorative landscape beyond the invisible boundary walls. It
 * stays flat right next to the edge so the chase camera never dips into it.
 */
export function getOuterTerrainHeight(
  x: number,
  z: number,
  mapSize: number,
  seed = 17,
): number {
  const distance = getOutsideDistance(x, z, mapSize)
  if (distance <= 0) return -0.08
  const rise = smoothstep(4, 48, distance)
  const rolling = fbm2D(x * 0.028, z * 0.028, seed, 3)
  return -0.02 + rise * rise * (3 + rolling * 15) + smoothstep(1.5, 8, distance) * rolling * 0.9
}

interface TerrainClearing {
  x: number
  z: number
  radius: number
}

export interface TerrainDensityContext {
  mapSize: number
  theme: StageTheme
  trails: readonly TerrainTrail[]
  zones: readonly SurfaceZone[]
  clearings: readonly TerrainClearing[]
}

export function createTerrainDensityContext(
  mapSize: number,
  theme: StageTheme,
  layout: Pick<WorldPhysicsLayout, 'surfaceZones' | 'terrainRamps' | 'elevators' | 'tunnels'>,
): TerrainDensityContext {
  return {
    mapSize,
    theme,
    trails: createTerrainTrails(mapSize, theme),
    zones: layout.surfaceZones,
    clearings: [
      { x: 0, z: 0, radius: mapSize * 0.045 },
      ...layout.terrainRamps.map((ramp) => ({
        x: ramp.x,
        z: ramp.z,
        radius: Math.max(ramp.halfWidth, ramp.halfDepth) * 0.6,
      })),
      ...layout.elevators.map((elevator) => ({
        x: elevator.x,
        z: elevator.z,
        radius: Math.hypot(elevator.halfWidth, elevator.halfDepth) + 0.6,
      })),
      ...layout.tunnels.map((tunnel) => ({
        x: tunnel.x,
        z: tunnel.z,
        radius: Math.hypot(tunnel.halfWidth, tunnel.halfDepth) + 1,
      })),
    ],
  }
}

const BASE_TUFT_DENSITY: Record<StageTheme, number> = {
  'sunny-plaza': 0.34,
  'forest-trail': 0.46,
  'starlight-river': 0.2,
}

/** 0..1 likelihood of a grass tuft at a point. Water, ice and trails are 0. */
export function getGrassDensity(
  x: number,
  z: number,
  context: TerrainDensityContext,
): number {
  let density = BASE_TUFT_DENSITY[context.theme]
  const patch = fbm2D(x * 0.07 + 11, z * 0.07 - 7, 3, 3)
  density *= 0.25 + smoothstep(0.36, 0.72, patch) * 1.5

  for (const zone of context.zones) {
    const distance = getZoneDistance(x, z, zone)
    if (zone.kind === 'water' || zone.kind === 'slick' || zone.kind === 'mud') {
      if (distance < 1.08) return 0
      // Lush band right around water, sparse frost around ice.
      if (zone.kind === 'water' && distance < 1.5) density += 0.35 * (1.5 - distance) / 0.42
    } else if (distance < 1.12) {
      density = Math.max(density, 0.72 + (1 - Math.min(1, distance)) * 0.28)
    }
  }

  for (const trail of context.trails) {
    const [minX, minZ, maxX, maxZ] = getTrailBounds(trail)
    const reach = trail.width * 1.25
    if (x < minX - reach || x > maxX + reach || z < minZ - reach || z > maxZ + reach) continue
    const distance = distanceToTrail(x, z, trail)
    if (distance < trail.width * 0.62) return 0
    if (distance < trail.width * 1.25) density *= 0.35
  }

  for (const clearing of context.clearings) {
    const distance = Math.hypot(x - clearing.x, z - clearing.z)
    if (distance < clearing.radius) density *= 0.15
  }

  const half = context.mapSize / 2
  const edgeDistance = half - Math.max(Math.abs(x), Math.abs(z))
  if (edgeDistance < 10) density += (1 - edgeDistance / 10) * 0.22

  return Math.max(0, Math.min(1, density))
}

export function scatterGrassTufts(
  context: TerrainDensityContext,
  count: number,
  seed: number,
): ScatterSpec[] {
  const random = createSeededRandom(seed)
  const half = context.mapSize / 2 - 0.6
  const tufts: ScatterSpec[] = []
  const maxAttempts = count * 10
  for (let attempt = 0; attempt < maxAttempts && tufts.length < count; attempt += 1) {
    const x = (random() * 2 - 1) * half
    const z = (random() * 2 - 1) * half
    const density = getGrassDensity(x, z, context)
    if (random() >= density) continue
    tufts.push({
      x,
      z,
      y: 0,
      scale: 0.55 + density * 0.55 + random() * 0.35,
      rotationY: random() * Math.PI * 2,
      tint: random(),
    })
  }
  return tufts
}

/** Clustered small props (flowers, mushrooms, crystals) in open ground. */
export function scatterClusters(
  context: TerrainDensityContext,
  clusterCount: number,
  perCluster: number,
  spread: number,
  seed: number,
  accept: (x: number, z: number) => boolean = (x, z) =>
    getGrassDensity(x, z, context) > 0.05,
): ScatterSpec[] {
  const random = createSeededRandom(seed)
  const half = context.mapSize / 2 - 1
  const specs: ScatterSpec[] = []
  for (let cluster = 0, attempts = 0; cluster < clusterCount && attempts < clusterCount * 12; attempts += 1) {
    const centerX = (random() * 2 - 1) * half
    const centerZ = (random() * 2 - 1) * half
    if (!accept(centerX, centerZ)) continue
    cluster += 1
    const tint = random()
    const members = Math.max(1, Math.round(perCluster * (0.5 + random())))
    for (let member = 0; member < members; member += 1) {
      const angle = random() * Math.PI * 2
      const radius = Math.sqrt(random()) * spread
      const x = centerX + Math.cos(angle) * radius
      const z = centerZ + Math.sin(angle) * radius
      if (Math.abs(x) > half || Math.abs(z) > half || !accept(x, z)) continue
      specs.push({
        x,
        z,
        y: 0,
        scale: 0.7 + random() * 0.6,
        rotationY: random() * Math.PI * 2,
        tint: (tint + random() * 0.18) % 1,
      })
    }
  }
  return specs
}

/** Props placed around a zone's rim (pebbles, reeds, snow drifts). */
export function scatterAroundZone(
  zone: SurfaceZone,
  spacing: number,
  radiusRange: [number, number],
  seed: number,
  arcFilter: (angle: number) => boolean = () => true,
): ScatterSpec[] {
  const random = createSeededRandom(seed ^ hashString(zone.id))
  const perimeter =
    Math.PI * (3 * (zone.halfWidth + zone.halfDepth) -
      Math.sqrt((3 * zone.halfWidth + zone.halfDepth) * (zone.halfWidth + 3 * zone.halfDepth)))
  const count = Math.max(6, Math.round(perimeter / spacing))
  const specs: ScatterSpec[] = []
  for (let index = 0; index < count; index += 1) {
    const angle = ((index + random() * 0.8) / count) * Math.PI * 2
    if (!arcFilter(angle)) continue
    const radius = radiusRange[0] + random() * (radiusRange[1] - radiusRange[0])
    const [x, z] = getZonePoint(zone, angle, radius)
    specs.push({
      x,
      z,
      y: 0,
      scale: 0.6 + random() * 0.8,
      rotationY: random() * Math.PI * 2,
      tint: random(),
    })
  }
  return specs
}

/** Jittered placements in the landscape band beyond the boundary walls. */
export function scatterOuterBand(
  mapSize: number,
  minDistance: number,
  maxDistance: number,
  spacing: number,
  probability: (distance: number, x: number, z: number) => number,
  seed: number,
): ScatterSpec[] {
  const random = createSeededRandom(seed)
  const extent = mapSize / 2 + maxDistance
  const specs: ScatterSpec[] = []
  for (let gridX = -extent; gridX <= extent; gridX += spacing) {
    for (let gridZ = -extent; gridZ <= extent; gridZ += spacing) {
      const x = gridX + (random() - 0.5) * spacing * 0.9
      const z = gridZ + (random() - 0.5) * spacing * 0.9
      const distance = getOutsideDistance(x, z, mapSize)
      const roll = random()
      if (distance < minDistance || distance > maxDistance) continue
      if (roll >= probability(distance, x, z)) continue
      specs.push({
        x,
        z,
        y: getOuterTerrainHeight(x, z, mapSize),
        scale: 0.75 + random() * 0.6,
        rotationY: random() * Math.PI * 2,
        tint: random(),
      })
    }
  }
  return specs
}
