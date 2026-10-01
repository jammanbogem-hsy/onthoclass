import { Euler, Quaternion } from 'three'
import type { ElevatedPlatform, ElevatedWalkway, TerrainRamp } from './worldPhysics'

type Triple = [number, number, number]

export interface TerracePart {
  id: string
  size: Triple
  position: Triple
  color: string
  rotation?: Triple
  bevel?: number
}

export interface TerraceCollider {
  id: string
  halfSize: Triple
  position: Triple
}

export interface TerraceAssembly {
  deck: TerracePart[]
  frame: TerracePart[]
  railing: TerracePart[]
  colliders: TerraceCollider[]
}

const STEEL = '#48676C'
const LIGHT_STEEL = '#9CB8AC'
const STONE = '#C8C6B7'
const WOOD = '#D7B884'
const CREAM = '#FAEACC'

function solid(assembly: TerraceAssembly, group: 'deck' | 'frame', part: TerracePart) {
  assembly[group].push(part)
  assembly.colliders.push({
    id: part.id,
    position: part.position,
    halfSize: part.size.map((value) => value / 2) as Triple,
  })
}

function guard(
  assembly: TerraceAssembly,
  id: string,
  start: [number, number],
  end: [number, number],
  floorY: number,
) {
  const alongX = start[0] !== end[0]
  const length = Math.hypot(end[0] - start[0], end[1] - start[1])
  const midX = (start[0] + end[0]) / 2
  const midZ = (start[1] + end[1]) / 2
  for (const [index, y] of [0.38, 0.98].entries()) {
    assembly.railing.push({
      id: `${id}-rail-${index}`,
      size: alongX ? [length + 0.1, 0.11, 0.11] : [0.11, 0.11, length + 0.1],
      position: [midX, floorY + y, midZ],
      color: index ? CREAM : LIGHT_STEEL,
    })
  }
  const segments = Math.max(1, Math.ceil(length / 1.15))
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments
    assembly.railing.push({
      id: `${id}-post-${index}`,
      size: [0.13, 1.06, 0.13],
      position: [
        start[0] + (end[0] - start[0]) * t,
        floorY + 0.53,
        start[1] + (end[1] - start[1]) * t,
      ],
      color: STEEL,
    })
  }
  // A single simple volume closes the gaps between a guard's visible rails.
  assembly.colliders.push({
    id: `${id}-guard`,
    position: [midX, floorY + 0.51, midZ],
    halfSize: alongX ? [length / 2 + 0.065, 0.51, 0.065] : [0.065, 0.51, length / 2 + 0.065],
  })
}

function groundSupport(
  assembly: TerraceAssembly,
  deck: Pick<ElevatedPlatform, 'y' | 'halfHeight'>,
  x: number,
  z: number,
  braceAxis: 'x' | 'z' = 'x',
) {
  const h = deck.halfHeight
  const supportHeight = Math.max(0.24, deck.y - h)
  const prefix = `support-${x}-${z}`
  solid(assembly, 'frame', {
    id: `${prefix}-foot`, size: [0.98, 0.24, 0.98],
    position: [x, -deck.y + 0.12, z], color: STONE, bevel: 0.045,
  })
  solid(assembly, 'frame', {
    id: `${prefix}-column`, size: [0.46, supportHeight - 0.22, 0.46],
    position: [x, -h - (supportHeight - 0.22) / 2, z], color: STEEL,
  })
  assembly.frame.push({
    id: `${prefix}-capital`, size: [0.76, 0.19, 0.76],
    position: [x, -h - 0.1, z], color: LIGHT_STEEL,
  })
  // Short braces stay beside the columns, leaving the ground-floor center open.
  const direction = Math.sign(braceAxis === 'x' ? x : z)
  assembly.frame.push({
    id: `${prefix}-brace`, size: [0.17, 1.03, 0.17],
    position: [
      x - (braceAxis === 'x' ? direction * 0.32 : 0),
      -h - 0.42,
      z - (braceAxis === 'z' ? direction * 0.32 : 0),
    ],
    rotation: braceAxis === 'x' ? [0, 0, -direction * 0.72] : [direction * 0.72, 0, 0],
    color: STEEL,
  })
}

export function createTerraceParts(platform: ElevatedPlatform): TerraceAssembly {
  const assembly: TerraceAssembly = { deck: [], frame: [], railing: [], colliders: [] }
  const { halfWidth: w, halfDepth: d, halfHeight: h } = platform
  solid(assembly, 'deck', {
    id: 'deck-slab', size: [w * 2, h * 2, d * 2], position: [0, 0, 0],
    color: platform.color, bevel: Math.min(0.1, h * 0.4),
  })

  // Flush inset paving: a continuous collider under the decorative joints avoids snags.
  const tileCountX = Math.floor((w * 2 - 0.7) / 1.15)
  const tileCountZ = Math.floor((d * 2 - 0.7) / 1.15)
  const tileWidth = (w * 2 - 0.7) / tileCountX
  const tileDepth = (d * 2 - 0.7) / tileCountZ
  for (let x = 0; x < tileCountX; x += 1) {
    for (let z = 0; z < tileCountZ; z += 1) {
      assembly.deck.push({
        id: `paving-${x}-${z}`,
        size: [tileWidth - 0.024, 0.014, tileDepth - 0.024],
        position: [-w + 0.35 + (x + 0.5) * tileWidth, h + 0.003, -d + 0.35 + (z + 0.5) * tileDepth],
        color: (x + z) % 3 === 0 ? '#DDD8BF' : '#EAE4CF',
      })
    }
  }

  for (const x of [-w + 0.67, w - 0.67]) {
    for (const z of [-d + 0.67, d - 0.67]) {
      groundSupport(assembly, platform, x, z)
    }
  }
  for (const z of [-d + 0.67, d - 0.67]) {
    assembly.frame.push({
      id: `crossbeam-${z}`, size: [w * 2 - 0.7, 0.28, 0.23],
      position: [0, -h - 0.16, z], color: STEEL,
    })
  }
  for (const x of [-w + 0.12, w - 0.12]) {
    assembly.frame.push({
      id: `fascia-${x}`, size: [0.1, 0.19, d * 2 - 0.12],
      position: [x, 0, 0], color: WOOD,
    })
  }

  const edgeX = w - 0.16
  const edgeZ = d - 0.16
  const approachOpening = 3.84
  for (const z of [-edgeZ, edgeZ]) {
    guard(assembly, `end-left-${z}`, [-edgeX, z], [-approachOpening, z], h)
    guard(assembly, `end-right-${z}`, [approachOpening, z], [edgeX, z], h)
  }
  for (const side of ['west', 'east'] as const) {
    const x = side === 'west' ? -edgeX : edgeX
    const opening = platform.bridgeSide === side
      ? 3.84
      : (platform.elevatorSide ?? 'east') === side ? 2.4 : 0
    if (opening > 0) {
      guard(assembly, `${side}-north`, [x, -edgeZ], [x, -opening], h)
      guard(assembly, `${side}-south`, [x, opening], [x, edgeZ], h)
    } else {
      guard(assembly, side, [x, -edgeZ], [x, edgeZ], h)
    }
  }

  // Two broad, flush threshold stripes make both ramp entrances readable.
  for (const z of [-d + 0.2, d - 0.2]) {
    assembly.deck.push({
      id: `threshold-${z}`, size: [7.35, 0.016, 0.24],
      position: [0, h + 0.008, z], color: '#E7B95E',
    })
  }
  return assembly
}

export function createTerraceWalkwayParts(walkway: ElevatedWalkway): TerraceAssembly {
  const assembly: TerraceAssembly = { deck: [], frame: [], railing: [], colliders: [] }
  const { halfWidth: w, halfDepth: d, halfHeight: h } = walkway
  solid(assembly, 'deck', {
    id: 'walkway-slab', size: [w * 2, h * 2, d * 2],
    position: [0, 0, 0], color: walkway.color,
  })

  const alongZ = d >= w
  const length = (alongZ ? d : w) * 2
  const across = (alongZ ? w : d) * 2
  const slatCount = Math.max(1, Math.ceil(length / 0.9))
  const spacing = length / slatCount
  for (let index = 0; index < slatCount; index += 1) {
    const along = -length / 2 + (index + 0.5) * spacing
    assembly.deck.push({
      id: `walkway-slat-${index}`,
      size: alongZ ? [across - 0.5, 0.014, spacing - 0.035] : [spacing - 0.035, 0.014, across - 0.5],
      position: alongZ ? [0, h + 0.003, along] : [along, h + 0.003, 0],
      color: index % 3 === 0 ? '#DDD8BF' : '#EAE4CF',
    })
  }

  const supportedLength = Math.max(0, length - 1.34)
  const supportBays = Math.max(1, Math.ceil(supportedLength / 10))
  const sideOffset = across / 2 - 0.67
  for (let index = 0; index <= supportBays; index += 1) {
    const along = -supportedLength / 2 + supportedLength * index / supportBays
    for (const side of [-sideOffset, sideOffset]) {
      groundSupport(assembly, walkway, alongZ ? side : along, alongZ ? along : side, alongZ ? 'x' : 'z')
    }
    assembly.frame.push({
      id: `walkway-crossbeam-${index}`,
      size: alongZ ? [across - 0.7, 0.28, 0.23] : [0.23, 0.28, across - 0.7],
      position: alongZ ? [0, -h - 0.16, along] : [along, -h - 0.16, 0], color: STEEL,
    })
  }
  for (const side of [-1, 1]) {
    assembly.frame.push({
      id: `walkway-fascia-${side}`,
      size: alongZ ? [0.1, 0.19, length] : [length, 0.19, 0.1],
      position: alongZ ? [side * (w - 0.12), 0, 0] : [0, 0, side * (d - 0.12)], color: WOOD,
    })
  }

  const edgeX = w - 0.16
  const edgeZ = d - 0.16
  for (const side of walkway.railSides) {
    if (side === 'north' || side === 'south') {
      const z = side === 'north' ? -edgeZ : edgeZ
      guard(assembly, `walkway-${side}`, [-edgeX, z], [edgeX, z], h)
    } else {
      const x = side === 'west' ? -edgeX : edgeX
      guard(assembly, `walkway-${side}`, [x, -edgeZ], [x, edgeZ], h)
    }
  }
  return assembly
}

export function createTerraceRampParts(ramp: TerrainRamp): TerraceAssembly {
  const assembly: TerraceAssembly = { deck: [], frame: [], railing: [], colliders: [] }
  const { halfWidth: w, halfDepth: d, halfHeight: h } = ramp
  solid(assembly, 'deck', {
    id: 'approach-slab', size: [w * 2, h * 2, d * 2], position: [0, 0, 0],
    color: ramp.color,
  })
  for (let index = 0; index < Math.floor(d * 2 / 0.8); index += 1) {
    assembly.deck.push({
      id: `grip-${index}`, size: [w * 2 - 0.5, 0.012, 0.035],
      position: [0, h + 0.001, -d + 0.4 + index * 0.8], color: '#C3C2AC',
    })
  }
  for (const x of [-w + 0.11, w - 0.11]) {
    assembly.frame.push({
      id: `stringer-${x}`, size: [0.15, h * 1.5, d * 2],
      position: [x, -h * 0.2, 0], color: STEEL,
    })
    guard(assembly, `approach-edge-${x}`, [x, -d + 0.16], [x, d - 0.16], h)
  }
  return assembly
}

export function getTerraceRampQuaternion(ramp: Pick<TerrainRamp, 'rotationX' | 'rotationY'>) {
  return new Quaternion().setFromEuler(new Euler(ramp.rotationX, ramp.rotationY, 0, 'YXZ'))
}
