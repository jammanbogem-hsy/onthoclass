import { useFrame, useThree } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  CircleGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { StageTheme } from '@/lib/quizrun-engine/types'
import type { SurfaceZone, WorldPhysicsLayout } from '@/lib/quizrun-engine/worldPhysics'
import {
  TERRAIN_ART_PALETTES,
  createSeededRandom,
  createTerrainDensityContext,
  fbm2D,
  getGrassDensity,
  getOuterTerrainHeight,
  getOutsideDistance,
  getZonePoint,
  hashString,
  scatterAroundZone,
  scatterClusters,
  scatterGrassTufts,
  scatterOuterBand,
  smoothstep,
  type ScatterSpec,
  type TerrainArtPalette,
  type TerrainDensityContext,
  type TerrainTrail,
} from '@/lib/quizrun-engine/terrainArt'
import { createNoiseLayer, hexToRgb } from './terrainTextures'

export interface NaturalTerrainProps {
  mapSize: number
  theme: StageTheme
  layout: WorldPhysicsLayout
  lowPower: boolean
  reducedMotion: boolean
  receiveShadow: boolean
}

type PlaceFn = (spec: ScatterSpec, dummy: Object3D, index: number) => void
type ColorFn = (spec: ScatterSpec, target: Color, index: number) => Color

const OUTER_REACH = 74

/* ------------------------------------------------------------------------ */
/* Painted ground                                                           */
/* ------------------------------------------------------------------------ */

function traceZoneBlob(
  context: CanvasRenderingContext2D,
  zone: SurfaceZone,
  scale: number,
  toPixel: (x: number, z: number) => [number, number],
) {
  const seed = hashString(zone.id) % 997
  context.beginPath()
  const steps = 72
  for (let step = 0; step <= steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2
    const wobble =
      1 + (fbm2D(Math.cos(angle) * 1.8 + seed, Math.sin(angle) * 1.8, 9, 2) - 0.5) * 0.18
    const [x, z] = getZonePoint(zone, angle, scale * wobble)
    const [px, py] = toPixel(x, z)
    if (step === 0) context.moveTo(px, py)
    else context.lineTo(px, py)
  }
  context.closePath()
}

function fillZoneLayers(
  context: CanvasRenderingContext2D,
  zone: SurfaceZone,
  color: string,
  layers: readonly [number, number][],
  toPixel: (x: number, z: number) => [number, number],
) {
  context.fillStyle = color
  for (const [scale, alpha] of layers) {
    context.globalAlpha = alpha
    traceZoneBlob(context, zone, scale, toPixel)
    context.fill()
  }
  context.globalAlpha = 1
}

function strokeTrail(
  context: CanvasRenderingContext2D,
  trail: TerrainTrail,
  toPixel: (x: number, z: number) => [number, number],
) {
  context.beginPath()
  trail.points.forEach(([x, z], index) => {
    const [px, py] = toPixel(x, z)
    if (index === 0) context.moveTo(px, py)
    else context.lineTo(px, py)
  })
  if (trail.closed) context.closePath()
}

function paintGround(
  resolution: number,
  mapSize: number,
  palette: TerrainArtPalette,
  density: TerrainDensityContext,
  zones: readonly SurfaceZone[],
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = resolution
  canvas.height = resolution
  const context = canvas.getContext('2d')!
  const half = mapSize / 2
  const pixelsPerUnit = resolution / mapSize
  const toPixel = (x: number, z: number): [number, number] => [
    (x + half) * pixelsPerUnit,
    (z + half) * pixelsPerUnit,
  ]
  const random = createSeededRandom(hashString(`${density.theme}-ground`))
  const snowy = density.theme === 'starlight-river'

  context.fillStyle = palette.ground
  context.fillRect(0, 0, resolution, resolution)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  // Multi-scale mottling: tiny noise canvases stretched with bilinear
  // filtering give soft, natural patches without per-pixel work at 2K.
  const unitsPerNoisePixel = (noiseResolution: number) => mapSize / noiseResolution
  const layers: [number, number, number, string, number, number, number][] = [
    [96, 26, 11, palette.groundDark, 0.48, 0.74, 0.85],
    [96, 17, 23, palette.groundLight, snowy ? 0.42 : 0.55, snowy ? 0.64 : 0.8, snowy ? 0.95 : 0.7],
    [256, 5, 37, palette.groundDark, 0.52, 0.8, 0.45],
    [512, 1.3, 51, palette.groundDark, 0.45, 0.9, 0.22],
    [512, 1.1, 67, palette.groundLight, 0.55, 0.95, 0.16],
  ]
  for (const [noiseResolution, featureSize, seed, color, low, high, alpha] of layers) {
    const layer = createNoiseLayer(
      noiseResolution,
      unitsPerNoisePixel(noiseResolution) / featureSize,
      seed,
      color,
      low,
      high,
    )
    context.globalAlpha = alpha
    context.drawImage(layer, 0, 0, resolution, resolution)
  }
  context.globalAlpha = 1

  // Soft central clearing where every run starts.
  const [centerX, centerY] = toPixel(0, 0)
  const clearingRadius = mapSize * 0.06 * pixelsPerUnit
  const clearing = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, clearingRadius)
  const clearingRgb = hexToRgb(palette.clearing).join(',')
  clearing.addColorStop(0, `rgba(${clearingRgb},0.85)`)
  clearing.addColorStop(0.6, `rgba(${clearingRgb},0.55)`)
  clearing.addColorStop(1, `rgba(${clearingRgb},0)`)
  context.fillStyle = clearing
  context.beginPath()
  context.arc(centerX, centerY, clearingRadius, 0, Math.PI * 2)
  context.fill()

  // Surface zones become part of the ground instead of flat stickers.
  for (const zone of zones) {
    if (zone.kind === 'grass') {
      fillZoneLayers(context, zone, zone.color, [[1.16, 0.14], [1.08, 0.28], [1.02, 0.45], [0.94, 0.55]], toPixel)
      fillZoneLayers(context, zone, palette.groundDark, [[0.6, 0.12], [0.35, 0.1]], toPixel)
    } else if (zone.kind === 'water') {
      fillZoneLayers(context, zone, palette.shore, [[1.3, 0.2], [1.2, 0.4], [1.12, 0.7]], toPixel)
      fillZoneLayers(context, zone, palette.wetShore, [[1.06, 0.6], [1.0, 0.85]], toPixel)
      fillZoneLayers(context, zone, palette.riverbed, [[0.92, 0.9], [0.6, 0.5]], toPixel)
    } else if (zone.kind === 'slick') {
      fillZoneLayers(context, zone, palette.groundLight, [[1.14, 0.3], [1.06, 0.6]], toPixel)
      fillZoneLayers(context, zone, palette.riverbed, [[0.98, 0.7], [0.7, 0.35]], toPixel)
    } else if (zone.kind === 'mud') {
      fillZoneLayers(context, zone, palette.trailEdge, [[1.5, 0.2], [1.25, 0.3]], toPixel)
    }
  }

  // Natural trails: layered round strokes give a worn, feathered edge.
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (const trail of density.trails) {
    const widthPixels = trail.width * pixelsPerUnit
    const strokes: [number, string, number][] = [
      [1.9, palette.trailEdge, 0.12],
      [1.45, palette.trailEdge, 0.28],
      [1.12, palette.trail, 0.55],
      [0.82, palette.trail, 0.7],
      [0.3, palette.clearing, 0.18],
    ]
    for (const [scale, color, alpha] of strokes) {
      context.strokeStyle = color
      context.globalAlpha = alpha
      context.lineWidth = widthPixels * scale
      strokeTrail(context, trail, toPixel)
      context.stroke()
    }
    // Scattered gravel along the trail.
    context.fillStyle = palette.trailEdge
    const segments = trail.closed ? trail.points.length : trail.points.length - 1
    for (let index = 0; index < segments; index += 1) {
      const [ax, az] = trail.points[index]
      const [bx, bz] = trail.points[(index + 1) % trail.points.length]
      const pebbles = Math.round(Math.hypot(bx - ax, bz - az) * 3)
      for (let pebble = 0; pebble < pebbles; pebble += 1) {
        const t = random()
        const offset = (random() - 0.5) * trail.width * 1.1
        const length = Math.hypot(bx - ax, bz - az) || 1
        const x = ax + (bx - ax) * t + (-(bz - az) / length) * offset
        const z = az + (bz - az) * t + ((bx - ax) / length) * offset
        const [px, py] = toPixel(x, z)
        context.globalAlpha = 0.25 + random() * 0.35
        context.fillRect(px, py, 1 + random() * 2, 1 + random() * 2)
      }
    }
  }
  context.globalAlpha = 1

  // Fine speckles: wildflowers, leaf litter or frost glitter.
  const speckleCount = Math.round((resolution * resolution) / 520)
  for (let index = 0; index < speckleCount; index += 1) {
    const px = random() * resolution
    const py = random() * resolution
    const x = px / pixelsPerUnit - half
    const z = py / pixelsPerUnit - half
    if (getGrassDensity(x, z, density) <= 0) continue
    context.fillStyle = palette.speckles[Math.floor(random() * palette.speckles.length)]
    context.globalAlpha = 0.35 + random() * 0.45
    const size = (0.8 + random() * 0.9) * (resolution / 2048 + 0.5)
    context.beginPath()
    context.arc(px, py, size, 0, Math.PI * 2)
    context.fill()
  }
  context.globalAlpha = 1

  // Blend the border into the landscape skirt so the seam disappears.
  const edgeWidth = 7 * pixelsPerUnit
  const edgeRgb = hexToRgb(palette.edge).join(',')
  const edges: [number, number, number, number, number, number, number, number][] = [
    [0, 0, 0, edgeWidth, 0, 0, resolution, edgeWidth],
    [0, resolution, 0, resolution - edgeWidth, 0, resolution - edgeWidth, resolution, edgeWidth],
    [0, 0, edgeWidth, 0, 0, 0, edgeWidth, resolution],
    [resolution, 0, resolution - edgeWidth, 0, resolution - edgeWidth, 0, edgeWidth, resolution],
  ]
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of edges) {
    const gradient = context.createLinearGradient(x0, y0, x1, y1)
    gradient.addColorStop(0, `rgba(${edgeRgb},1)`)
    gradient.addColorStop(1, `rgba(${edgeRgb},0)`)
    context.fillStyle = gradient
    context.fillRect(rx, ry, rw, rh)
  }

  return canvas
}

function PaintedGround({
  mapSize,
  palette,
  density,
  zones,
  lowPower,
  receiveShadow,
}: {
  mapSize: number
  palette: TerrainArtPalette
  density: TerrainDensityContext
  zones: readonly SurfaceZone[]
  lowPower: boolean
  receiveShadow: boolean
}) {
  const gl = useThree((state) => state.gl)
  const texture = useMemo(() => {
    const canvas = paintGround(lowPower ? 1024 : 2048, mapSize, palette, density, zones)
    const next = new CanvasTexture(canvas)
    next.colorSpace = SRGBColorSpace
    next.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    return next
  }, [density, gl, lowPower, mapSize, palette, zones])
  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh name="painted-ground" rotation={[-Math.PI / 2, 0, 0]} receiveShadow={receiveShadow}>
      <planeGeometry args={[mapSize, mapSize]} />
      <meshStandardMaterial map={texture} roughness={0.97} metalness={0} />
    </mesh>
  )
}

/* ------------------------------------------------------------------------ */
/* Shared instancing helper                                                 */
/* ------------------------------------------------------------------------ */

const placeDefault: PlaceFn = () => {}

function InstancedField({
  name,
  specs,
  geometry,
  children,
  place = placeDefault,
  color,
  castShadow = false,
  receiveShadow = false,
}: {
  name: string
  specs: readonly ScatterSpec[]
  geometry: BufferGeometry
  children: ReactNode
  place?: PlaceFn
  color?: ColorFn
  castShadow?: boolean
  receiveShadow?: boolean
}) {
  const mesh = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const target = mesh.current
    if (!target) return
    const dummy = new Object3D()
    const tint = new Color()
    specs.forEach((spec, index) => {
      dummy.position.set(spec.x, spec.y, spec.z)
      dummy.rotation.set(0, spec.rotationY, 0)
      dummy.scale.setScalar(spec.scale)
      place(spec, dummy, index)
      dummy.updateMatrix()
      target.setMatrixAt(index, dummy.matrix)
      if (color) target.setColorAt(index, color(spec, tint, index))
    })
    target.instanceMatrix.needsUpdate = true
    if (target.instanceColor) target.instanceColor.needsUpdate = true
    target.computeBoundingSphere()
  }, [color, place, specs])

  if (specs.length === 0) return null
  return (
    <instancedMesh
      key={specs.length}
      name={name}
      ref={mesh}
      args={[geometry, undefined, specs.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={false}
    >
      {children}
    </instancedMesh>
  )
}

function useDisposable<T extends { dispose: () => void }>(value: T): T {
  useEffect(() => () => value.dispose(), [value])
  return value
}

function paletteColor(colors: readonly string[]): ColorFn {
  return (spec, target) => target.set(colors[Math.floor(spec.tint * colors.length) % colors.length])
}

/* ------------------------------------------------------------------------ */
/* Wind-swept grass                                                         */
/* ------------------------------------------------------------------------ */

function withColor(geometry: BufferGeometry, color: string, tipColor?: string): BufferGeometry {
  const base = new Color(color)
  const tip = new Color(tipColor ?? color)
  const positions = geometry.getAttribute('position')
  geometry.computeBoundingBox()
  const minY = geometry.boundingBox!.min.y
  const range = Math.max(0.0001, geometry.boundingBox!.max.y - minY)
  const colors = new Float32Array(positions.count * 3)
  const mixed = new Color()
  for (let index = 0; index < positions.count; index += 1) {
    mixed.copy(base).lerp(tip, (positions.getY(index) - minY) / range)
    colors.set([mixed.r, mixed.g, mixed.b], index * 3)
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

function createTuftGeometry(baseColor: string, tipColor: string, blades = 11): BufferGeometry {
  const random = createSeededRandom(911)
  const positions: number[] = []
  const colors: number[] = []
  const normals: number[] = []
  const base = new Color(baseColor)
  const tip = new Color(tipColor)
  const root = base.clone().multiplyScalar(0.55)
  const bladeBase = new Color()
  const bladeTip = new Color()
  const color = new Color()
  const segments = 3
  for (let blade = 0; blade < blades; blade += 1) {
    const angle = (blade / blades) * Math.PI * 2 + random() * 0.9
    const lean = 0.1 + random() * 0.32
    const height = 0.55 + random() * 0.6
    const width = 0.028 + random() * 0.022
    const spread = 0.03 + random() * 0.08
    const rootX = Math.cos(angle) * spread
    const rootZ = Math.sin(angle) * spread
    const sideX = Math.cos(angle + Math.PI / 2)
    const sideZ = Math.sin(angle + Math.PI / 2)
    // Per-blade hue drift: some blades are yellower, some cooler and darker.
    const drift = random()
    bladeBase.copy(base).offsetHSL((drift - 0.5) * 0.04, 0, (random() - 0.5) * 0.06)
    bladeTip.copy(tip).offsetHSL((drift - 0.5) * 0.06, 0, (random() - 0.5) * 0.1)
    const ring: [number, number, number, number][] = []
    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments
      // Quadratic bend: blades arc outwards more towards the tip.
      const bend = lean * t * t
      const taper = width * (1 - t * 0.92)
      ring.push([
        rootX + Math.cos(angle) * bend,
        height * t * (1 - lean * t * 0.25),
        rootZ + Math.sin(angle) * bend,
        taper,
      ])
    }
    const vertex = (index: number, side: number) => {
      const [x, y, z, taper] = ring[index]
      const t = index / segments
      positions.push(x + sideX * taper * side, y, z + sideZ * taper * side)
      color.copy(t < 0.25 ? root : bladeBase).lerp(bladeTip, Math.max(0, t - 0.1) / 0.9)
      if (t < 0.25) color.lerp(bladeBase, t / 0.25)
      colors.push(color.r, color.g, color.b)
      // Mostly-up normals with a lean read like a soft, lit meadow.
      const nx = Math.cos(angle) * 0.35 * t
      const nz = Math.sin(angle) * 0.35 * t
      const length = Math.hypot(nx, 1, nz)
      normals.push(nx / length, 1 / length, nz / length)
    }
    for (let segment = 0; segment < segments; segment += 1) {
      vertex(segment, -1); vertex(segment, 1); vertex(segment + 1, 1)
      vertex(segment, -1); vertex(segment + 1, 1); vertex(segment + 1, -1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  return geometry
}

function createWindMaterial(strength: number) {
  const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide })
  const time = { value: 0 }
  material.userData.windTime = time
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 windOrigin = instanceMatrix[3].xz;
        #else
          vec2 windOrigin = vec2(0.0);
        #endif
        // A slow travelling gust plus a faster flutter reads as rolling waves.
        float gust = sin(uTime * 1.1 + windOrigin.x * 0.09 + windOrigin.y * 0.05);
        float swell = sin(uTime * 0.43 + windOrigin.x * 0.031 - windOrigin.y * 0.022);
        float flutter = sin(uTime * 3.1 + windOrigin.x * 0.7 + windOrigin.y * 0.45 + transformed.x * 9.0);
        float sway = gust * 0.55 + swell * 0.3 + flutter * 0.18;
        float bend = transformed.y * transformed.y;
        transformed.x += sway * bend * ${strength.toFixed(3)};
        transformed.z += (gust * 0.5 + 0.2) * bend * ${(strength * 0.55).toFixed(3)};`,
      )
  }
  material.customProgramCacheKey = () => `terrain-wind-${strength}`
  return material
}

function GrassField({
  context,
  palette,
  count,
  reducedMotion,
}: {
  context: TerrainDensityContext
  palette: TerrainArtPalette
  count: number
  reducedMotion: boolean
}) {
  const materialRef = useRef<MeshLambertMaterial>(null)
  const geometry = useDisposable(useMemo(() => createTuftGeometry(palette.tuftBase, palette.tuftTip), [palette]))
  const material = useDisposable(useMemo(() => createWindMaterial(0.34), []))
  const specs = useMemo(
    () => scatterGrassTufts(context, count, hashString(`${context.theme}-tufts`)),
    [context, count],
  )
  const place = useMemo<PlaceFn>(
    () => (spec, dummy) => {
      const height = context.theme === 'starlight-river' ? 0.32 : 0.42
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(
        spec.scale * (0.8 + spec.tint * 0.5),
        spec.scale * height * (0.75 + spec.tint * 0.5),
        spec.scale * (1.2 - spec.tint * 0.4),
      )
    },
    [context.theme],
  )
  const color = useMemo<ColorFn>(
    () => (spec, target) => target.setScalar(0.82 + spec.tint * 0.3),
    [],
  )

  useFrame(({ clock }) => {
    if (materialRef.current) materialRef.current.userData.windTime.value = reducedMotion ? 0 : clock.elapsedTime
  })

  return (
    <InstancedField name="grass-tufts" specs={specs} geometry={geometry} place={place} color={color} receiveShadow>
      <primitive ref={materialRef} object={material} attach="material" />
    </InstancedField>
  )
}

/* ------------------------------------------------------------------------ */
/* Theme flora: flowers, glowing mushrooms, frost crystals                  */
/* ------------------------------------------------------------------------ */

const FLOWER_COLORS = ['#FFFFFF', '#FFE066', '#FF9EB5', '#C9B6FF', '#FFB36B']
const MUSHROOM_CAPS = ['#D9503F', '#E3B96F', '#B8664A', '#EFE2C8']

function Wildflowers({ context, lowPower }: { context: TerrainDensityContext; lowPower: boolean }) {
  const stem = useDisposable(useMemo(() => {
    const geometry = new CylinderGeometry(0.01, 0.014, 0.26, 4)
    geometry.translate(0, 0.13, 0)
    return geometry
  }, []))
  const blossom = useDisposable(useMemo(() => {
    const geometry = new IcosahedronGeometry(0.07, 0)
    geometry.scale(1, 0.55, 1)
    geometry.translate(0, 0.27, 0)
    return geometry
  }, []))
  const specs = useMemo(
    () => scatterClusters(context, lowPower ? 60 : 130, 9, 1.7, hashString('wildflowers')),
    [context, lowPower],
  )
  const color = useMemo(() => paletteColor(FLOWER_COLORS), [])

  return (
    <>
      <InstancedField name="wildflower-stems" specs={specs} geometry={stem}>
        <meshLambertMaterial color="#4E8C3A" />
      </InstancedField>
      <InstancedField name="wildflower-blossoms" specs={specs} geometry={blossom} color={color}>
        <meshLambertMaterial emissive="#3A3020" emissiveIntensity={0.25} />
      </InstancedField>
    </>
  )
}

function GlowMushrooms({ context, lowPower }: { context: TerrainDensityContext; lowPower: boolean }) {
  const stem = useDisposable(useMemo(() => {
    const geometry = new CylinderGeometry(0.04, 0.055, 0.18, 6)
    geometry.translate(0, 0.09, 0)
    return geometry
  }, []))
  const cap = useDisposable(useMemo(() => {
    const geometry = new SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)
    geometry.scale(1, 0.7, 1)
    geometry.translate(0, 0.16, 0)
    return geometry
  }, []))
  const specs = useMemo(
    () => scatterClusters(context, lowPower ? 40 : 80, 5, 0.9, hashString('mushrooms')),
    [context, lowPower],
  )
  const glowing = useMemo(() => specs.filter((spec) => spec.tint > 0.62), [specs])
  const plain = useMemo(() => specs.filter((spec) => spec.tint <= 0.62), [specs])
  const color = useMemo(() => paletteColor(MUSHROOM_CAPS), [])

  return (
    <>
      <InstancedField name="mushroom-stems" specs={specs} geometry={stem}>
        <meshLambertMaterial color="#E9DFC9" />
      </InstancedField>
      <InstancedField name="mushroom-caps" specs={plain} geometry={cap} color={color}>
        <meshLambertMaterial />
      </InstancedField>
      <InstancedField name="mushroom-glow-caps" specs={glowing} geometry={cap}>
        <meshStandardMaterial color="#7EE6FF" emissive="#3FC6F0" emissiveIntensity={1.6} roughness={0.5} />
      </InstancedField>
    </>
  )
}

function FrostCrystals({ context, lowPower }: { context: TerrainDensityContext; lowPower: boolean }) {
  const geometry = useDisposable(useMemo(() => {
    const crystal = new OctahedronGeometry(0.16, 0)
    crystal.scale(1, 2.6, 1)
    crystal.translate(0, 0.3, 0)
    return crystal
  }, []))
  const specs = useMemo(
    () => scatterClusters(context, lowPower ? 30 : 60, 4, 0.8, hashString('crystals')),
    [context, lowPower],
  )
  const place = useMemo<PlaceFn>(
    () => (spec, dummy) => {
      dummy.rotation.set((spec.tint - 0.5) * 0.7, spec.rotationY, (spec.tint - 0.3) * 0.6)
    },
    [],
  )

  return (
    <InstancedField name="frost-crystals" specs={specs} geometry={geometry} place={place} castShadow>
      <meshStandardMaterial color="#D8F3FF" emissive="#6CB6E6" emissiveIntensity={0.55} roughness={0.12} metalness={0.05} flatShading />
    </InstancedField>
  )
}

/* ------------------------------------------------------------------------ */
/* Shorelines: pebbles, reeds, lily pads and snow drifts                     */
/* ------------------------------------------------------------------------ */

function Shorelines({
  zones,
  palette,
  theme,
}: {
  zones: readonly SurfaceZone[]
  palette: TerrainArtPalette
  theme: StageTheme
}) {
  const pebble = useDisposable(useMemo(() => {
    const geometry = new DodecahedronGeometry(0.22, 0)
    geometry.scale(1.2, 0.45, 1)
    return geometry
  }, []))
  const reed = useDisposable(useMemo(() => {
    const stalk = withColor(new ConeGeometry(0.035, 1.25, 4), '#4F7F3A', '#8DB95A')
    stalk.translate(0, 0.62, 0)
    const head = withColor(new CylinderGeometry(0.055, 0.05, 0.22, 5), '#7A4E2E')
    head.translate(0, 1.0, 0)
    return mergeGeometries([flat(stalk), flat(head)])!
  }, []))
  const pad = useDisposable(useMemo(() => {
    const geometry = new CircleGeometry(0.34, 12, 0.35, Math.PI * 2 - 0.7)
    geometry.rotateX(-Math.PI / 2)
    return geometry
  }, []))
  const drift = useDisposable(useMemo(() => {
    const geometry = new IcosahedronGeometry(0.7, 1)
    geometry.scale(1.4, 0.32, 1)
    return geometry
  }, []))

  const { pebbles, reeds, pads, drifts } = useMemo(() => {
    const water = zones.filter((zone) => zone.kind === 'water')
    const slick = zones.filter((zone) => zone.kind === 'slick')
    const lush = theme !== 'starlight-river'
    const pebbleSpecs = water.flatMap((zone) =>
      scatterAroundZone(zone, 0.8, [0.98, 1.16], 3).map((spec) => ({
        ...spec,
        y: zone.id === 'central-park-pond' ? 0.06 : 0.02,
      })),
    )
    const reedSpecs = lush
      ? water.flatMap((zone) => {
          const phase = (hashString(zone.id) % 100) / 16
          return scatterAroundZone(zone, 0.42, [0.9, 1.04], 5, (angle) => Math.sin(angle * 2 + phase) > 0.3)
            .flatMap((spec, index) =>
              [0, 1, 2].map((stalk) => ({
                ...spec,
                x: spec.x + Math.cos(index + stalk * 2.1) * 0.22,
                z: spec.z + Math.sin(index + stalk * 2.1) * 0.22,
                scale: spec.scale * (0.7 + stalk * 0.18),
                rotationY: spec.rotationY + stalk,
              })),
            )
        })
      : []
    const padSpecs = lush
      ? water.flatMap((zone) => {
          const random = createSeededRandom(hashString(`${zone.id}-pads`))
          const count = Math.round((zone.halfWidth * zone.halfDepth) / 5)
          return Array.from({ length: count }, (): ScatterSpec => {
            const [x, z] = getZonePoint(zone, random() * Math.PI * 2, 0.35 + random() * 0.45)
            return {
              x,
              z,
              y: zone.id === 'central-park-pond' ? 0.1 : 0.07,
              scale: 0.7 + random() * 0.9,
              rotationY: random() * Math.PI * 2,
              tint: random(),
            }
          })
        })
      : []
    const driftSpecs = [
      // Drifts pile up in irregular runs rather than an even bead necklace.
      ...slick.flatMap((zone) =>
        scatterAroundZone(zone, 1.9, [0.95, 1.12], 7).filter(
          (spec) => fbm2D(spec.x * 0.12, spec.z * 0.12, 13, 2) > 0.44,
        ),
      ),
      ...(lush ? [] : water.flatMap((zone) => scatterAroundZone(zone, 1.6, [1.0, 1.12], 9))),
    ]
    return { pebbles: pebbleSpecs, reeds: reedSpecs, pads: padSpecs, drifts: driftSpecs }
  }, [theme, zones])

  const rockColor = useMemo(() => paletteColor(palette.rock), [palette])
  const padColor = useMemo(() => paletteColor(['#4C9A5A', '#5DAA62', '#3F8A50']), [])
  const reedPlace = useMemo<PlaceFn>(
    () => (spec, dummy) => {
      dummy.rotation.set((spec.tint - 0.5) * 0.25, spec.rotationY, (spec.tint - 0.5) * 0.2)
    },
    [],
  )

  return (
    <>
      <InstancedField name="shore-pebbles" specs={pebbles} geometry={pebble} color={rockColor} receiveShadow>
        <meshStandardMaterial roughness={0.9} flatShading />
      </InstancedField>
      <InstancedField name="shore-reeds" specs={reeds} geometry={reed} place={reedPlace}>
        <meshLambertMaterial vertexColors />
      </InstancedField>
      <InstancedField name="lily-pads" specs={pads} geometry={pad} color={padColor}>
        <meshLambertMaterial side={DoubleSide} />
      </InstancedField>
      <InstancedField name="snow-drifts" specs={drifts} geometry={drift} receiveShadow>
        <meshStandardMaterial color="#F4FAFF" emissive="#9CC4E4" emissiveIntensity={0.12} roughness={0.85} flatShading />
      </InstancedField>
    </>
  )
}

/* ------------------------------------------------------------------------ */
/* Natural replacements for the old colored blocks and gear racks            */
/* ------------------------------------------------------------------------ */

function StonesAndBoulders({
  layout,
  palette,
  castShadow,
}: {
  layout: WorldPhysicsLayout
  palette: TerrainArtPalette
  castShadow: boolean
}) {
  const geometry = useDisposable(useMemo(() => new DodecahedronGeometry(0.5, 0), []))
  const { stones, boulders } = useMemo(() => {
    const stoneSpecs = layout.rideableObstacles
      .filter((obstacle) => obstacle.id.startsWith('stepping-block-'))
      .map((obstacle, index): ScatterSpec => ({
        x: obstacle.x,
        z: obstacle.z,
        y: obstacle.y - 0.02,
        scale: 1,
        rotationY: obstacle.rotationY,
        tint: (index * 0.37) % 1,
      }))
    const boulderSpecs = layout.obstacles
      .filter((obstacle) => obstacle.id.startsWith('gear-rack-'))
      .flatMap((obstacle) => {
        const random = createSeededRandom(hashString(obstacle.id))
        return [
          [0, 0, 1.55],
          [0.72, 0.35, 1.05],
          [-0.6, 0.45, 0.9],
          [0.15, -0.75, 0.8],
          [-0.8, -0.5, 0.55],
        ].map(([offsetX, offsetZ, size]): ScatterSpec => ({
          x: obstacle.x + offsetX,
          z: obstacle.z + offsetZ,
          y: size * 0.28,
          scale: size,
          rotationY: random() * Math.PI * 2,
          tint: random(),
        }))
      })
    return { stones: stoneSpecs, boulders: boulderSpecs }
  }, [layout])
  const stonePlace = useMemo<PlaceFn>(() => (_spec, dummy) => dummy.scale.set(0.7, 0.28, 0.66), [])
  const boulderPlace = useMemo<PlaceFn>(
    () => (spec, dummy) => dummy.scale.set(spec.scale * 1.15, spec.scale * 0.85, spec.scale),
    [],
  )
  const color = useMemo(() => paletteColor(palette.rock), [palette])

  return (
    <>
      <InstancedField name="stepping-stones" specs={stones} geometry={geometry} place={stonePlace} color={color} receiveShadow castShadow={castShadow}>
        <meshStandardMaterial roughness={0.88} flatShading />
      </InstancedField>
      <InstancedField name="boulder-clusters" specs={boulders} geometry={geometry} place={boulderPlace} color={color} receiveShadow castShadow={castShadow}>
        <meshStandardMaterial roughness={0.92} flatShading />
      </InstancedField>
    </>
  )
}

/* ------------------------------------------------------------------------ */
/* Outer landscape: rolling hills and a forest wall beyond the boundary      */
/* ------------------------------------------------------------------------ */

function createOuterLandscapeGeometry(mapSize: number, palette: TerrainArtPalette) {
  const size = mapSize + OUTER_REACH * 2
  const segments = Math.round(size / 2.6)
  const geometry = new PlaneGeometry(size, size, segments, segments)
  geometry.rotateX(-Math.PI / 2)
  const positions = geometry.getAttribute('position')
  const colors = new Float32Array(positions.count * 3)
  const edge = new Color(palette.edge)
  const low = new Color(palette.hillLow)
  const high = new Color(palette.hillHigh)
  const mixed = new Color()
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const z = positions.getZ(index)
    const height = getOuterTerrainHeight(x, z, mapSize)
    positions.setY(index, height)
    const distance = getOutsideDistance(x, z, mapSize)
    const variation = fbm2D(x * 0.08, z * 0.08, 71, 2)
    mixed
      .copy(low)
      .lerp(high, Math.min(1, Math.max(0, height / 14) * 0.75 + variation * 0.35))
    mixed.lerp(edge, 1 - smoothstep(0, 7, distance))
    colors.set([mixed.r, mixed.g, mixed.b], index * 3)
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** Polyhedra are already non-indexed; only convert the indexed primitives. */
function flat(geometry: BufferGeometry): BufferGeometry {
  return geometry.index ? geometry.toNonIndexed() : geometry
}

function createCanopyGeometry(theme: StageTheme): { trunk: BufferGeometry; canopy: BufferGeometry; cap?: BufferGeometry } {
  const trunk = new CylinderGeometry(0.16, 0.24, 1.4, 5)
  trunk.translate(0, 0.7, 0)
  if (theme === 'sunny-plaza') {
    const main = new IcosahedronGeometry(1.25, 0)
    main.translate(0, 2.2, 0)
    const side = new IcosahedronGeometry(0.85, 0)
    side.translate(0.55, 1.75, 0.3)
    const top = new IcosahedronGeometry(0.7, 0)
    top.translate(-0.35, 2.95, -0.2)
    return {
      trunk,
      canopy: mergeGeometries([flat(main), flat(side), flat(top)])!,
    }
  }
  const tiers = [
    [1.35, 1.7, 1.55],
    [1.05, 1.45, 2.45],
    [0.72, 1.2, 3.3],
  ] as const
  const canopy = mergeGeometries(
    tiers.map(([radius, height, y]) => {
      const cone = new ConeGeometry(radius, height, 7)
      cone.translate(0, y, 0)
      return flat(cone)
    }),
  )!
  if (theme !== 'starlight-river') return { trunk, canopy }
  const cap = mergeGeometries(
    tiers.map(([radius, height, y]) => {
      const snow = new ConeGeometry(radius * 0.62, height * 0.42, 7)
      snow.translate(0, y + height * 0.3, 0)
      return flat(snow)
    }),
  )!
  return { trunk, canopy, cap }
}

function OuterLandscape({
  mapSize,
  theme,
  palette,
  lowPower,
}: {
  mapSize: number
  theme: StageTheme
  palette: TerrainArtPalette
  lowPower: boolean
}) {
  const ground = useDisposable(useMemo(() => createOuterLandscapeGeometry(mapSize, palette), [mapSize, palette]))
  const tree = useMemo(() => createCanopyGeometry(theme), [theme])
  useEffect(
    () => () => {
      tree.trunk.dispose()
      tree.canopy.dispose()
      tree.cap?.dispose()
    },
    [tree],
  )
  const bush = useDisposable(useMemo(() => {
    const geometry = new IcosahedronGeometry(0.8, 1)
    geometry.scale(1.25, 0.8, 1.1)
    geometry.translate(0, 0.35, 0)
    return geometry
  }, []))
  const trees = useMemo(
    () =>
      scatterOuterBand(
        mapSize,
        9,
        OUTER_REACH - 6,
        lowPower ? 4.8 : 3.5,
        // A ragged, noise-driven tree line instead of a ruler-straight wall.
        (distance, x, z) =>
          distance < 9 + fbm2D(x * 0.045, z * 0.045, 29, 2) * 16
            ? 0
            : distance < 30
              ? 0.88
              : 0.55,
        hashString(`${theme}-outer-trees`),
      ),
    [lowPower, mapSize, theme],
  )
  const bushes = useMemo(
    () =>
      scatterOuterBand(
        mapSize,
        1.4,
        11,
        lowPower ? 2.8 : 2.1,
        (distance) => 0.45 + smoothstep(2, 9, distance) * 0.4,
        hashString(`${theme}-outer-bushes`),
      ),
    [lowPower, mapSize, theme],
  )
  const treePlace = useMemo<PlaceFn>(
    () => (spec, dummy) => {
      const size = spec.scale * (theme === 'sunny-plaza' ? 1.75 : 2)
      dummy.position.y -= 0.2
      dummy.scale.set(size, size * (0.9 + spec.tint * 0.35), size)
    },
    [theme],
  )
  const canopyColor = useMemo(() => paletteColor(palette.canopy), [palette])
  const bushColor = useMemo(() => paletteColor(palette.bush), [palette])

  return (
    <group name="outer-landscape">
      <mesh name="outer-hills" geometry={ground}>
        <meshStandardMaterial vertexColors roughness={1} flatShading />
      </mesh>
      <InstancedField name="outer-trunks" specs={trees} geometry={tree.trunk} place={treePlace}>
        <meshLambertMaterial color={palette.trunk} />
      </InstancedField>
      <InstancedField name="outer-canopies" specs={trees} geometry={tree.canopy} place={treePlace} color={canopyColor}>
        <meshStandardMaterial roughness={0.95} flatShading />
      </InstancedField>
      {tree.cap && (
        <InstancedField name="outer-snow-caps" specs={trees} geometry={tree.cap} place={treePlace}>
          <meshStandardMaterial color="#F3F8FC" roughness={0.9} flatShading />
        </InstancedField>
      )}
      <InstancedField name="outer-bushes" specs={bushes} geometry={bush} color={bushColor}>
        <meshStandardMaterial roughness={0.95} flatShading />
      </InstancedField>
    </group>
  )
}

/* ------------------------------------------------------------------------ */
/* Ambient particles                                                        */
/* ------------------------------------------------------------------------ */

const FIREFLY_VERTEX = `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aPhase;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.45 + aPhase * 12.0) * 0.7;
    p.y += sin(uTime * 0.8 + aPhase * 6.28) * 0.35;
    p.z += cos(uTime * 0.4 + aPhase * 9.0) * 0.7;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vAlpha = 0.25 + 0.75 * pow(sin(uTime * 1.6 + aPhase * 20.0) * 0.5 + 0.5, 3.0);
    gl_PointSize = 34.0 * uPixelRatio / max(1.0, -mv.z);
  }
`
const FIREFLY_FRAGMENT = `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float glow = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(0.86, 1.0, 0.55) * glow, glow * vAlpha);
  }
`

function Fireflies({
  context,
  count,
  reducedMotion,
}: {
  context: TerrainDensityContext
  count: number
  reducedMotion: boolean
}) {
  const material = useRef<ShaderMaterial>(null)
  const geometry = useDisposable(useMemo(() => {
    const random = createSeededRandom(hashString('fireflies'))
    const specs = scatterClusters(context, Math.ceil(count / 4), 4, 3, hashString('firefly-swarms'))
    const positions = new Float32Array(specs.length * 3)
    const phases = new Float32Array(specs.length)
    specs.forEach((spec, index) => {
      positions.set([spec.x, 0.5 + random() * 2.2, spec.z], index * 3)
      phases[index] = random()
    })
    const next = new BufferGeometry()
    next.setAttribute('position', new Float32BufferAttribute(positions, 3))
    next.setAttribute('aPhase', new Float32BufferAttribute(phases, 1))
    return next
  }, [context, count]))
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: 1 } }), [])

  useFrame(({ clock, viewport }) => {
    if (!material.current) return
    material.current.uniforms.uTime.value = reducedMotion ? 2 : clock.elapsedTime
    material.current.uniforms.uPixelRatio.value = viewport.dpr
  })

  return (
    <points name="fireflies" geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={FIREFLY_VERTEX}
        fragmentShader={FIREFLY_FRAGMENT}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  )
}

const SNOW_VERTEX = `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec3 uBox;
  attribute float aPhase;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y -= uTime * (0.7 + aPhase * 0.7);
    p.x += sin(uTime * 0.5 + aPhase * 9.0) * 0.9;
    p.z += cos(uTime * 0.35 + aPhase * 7.0) * 0.6;
    vec3 center = vec3(cameraPosition.x, cameraPosition.y * 0.5, cameraPosition.z);
    vec3 world = center + mod(p - center + uBox * 0.5, uBox) - uBox * 0.5;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mv;
    vAlpha = smoothstep(uBox.x * 0.5, uBox.x * 0.2, length(world.xz - center.xz));
    gl_PointSize = (3.0 + aPhase * 4.0) * uPixelRatio * 6.0 / max(1.0, -mv.z);
  }
`
const SNOW_FRAGMENT = `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float flake = smoothstep(0.5, 0.15, d);
    gl_FragColor = vec4(vec3(0.95, 0.98, 1.0), flake * vAlpha * 0.85);
  }
`

function Snowfall({ count, reducedMotion }: { count: number; reducedMotion: boolean }) {
  const material = useRef<ShaderMaterial>(null)
  const box = useMemo(() => [64, 26, 64] as const, [])
  const geometry = useDisposable(useMemo(() => {
    const random = createSeededRandom(hashString('snowfall'))
    const positions = new Float32Array(count * 3)
    const phases = new Float32Array(count)
    for (let index = 0; index < count; index += 1) {
      positions.set([random() * box[0], random() * box[1], random() * box[2]], index * 3)
      phases[index] = random()
    }
    const next = new BufferGeometry()
    next.setAttribute('position', new Float32BufferAttribute(positions, 3))
    next.setAttribute('aPhase', new Float32BufferAttribute(phases, 1))
    return next
  }, [box, count]))
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uBox: { value: [...box] },
    }),
    [box],
  )

  useFrame(({ clock, viewport }) => {
    if (!material.current) return
    material.current.uniforms.uTime.value = reducedMotion ? 0 : clock.elapsedTime
    material.current.uniforms.uPixelRatio.value = viewport.dpr
  })

  return (
    <points name="snowfall" geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={SNOW_VERTEX}
        fragmentShader={SNOW_FRAGMENT}
        transparent
        depthWrite={false}
      />
    </points>
  )
}

/* ------------------------------------------------------------------------ */
/* Root                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Visual-only natural terrain for every stage: a painted ground that folds
 * surface zones and meandering trails into one continuous meadow, wind-swept
 * grass, theme flora, shorelines and a rolling landscape past the walls.
 */
export const NaturalTerrain = memo(function NaturalTerrain({
  mapSize,
  theme,
  layout,
  lowPower,
  reducedMotion,
  receiveShadow,
}: NaturalTerrainProps) {
  const palette = TERRAIN_ART_PALETTES[theme]
  const context = useMemo(
    () => createTerrainDensityContext(mapSize, theme, layout),
    [layout, mapSize, theme],
  )
  const tuftCount = Math.round(
    (theme === 'starlight-river' ? 3200 : theme === 'forest-trail' ? 7000 : 8000) *
      (lowPower ? 0.45 : 1),
  )

  return (
    <group name="natural-terrain">
      <PaintedGround
        mapSize={mapSize}
        palette={palette}
        density={context}
        zones={layout.surfaceZones}
        lowPower={lowPower}
        receiveShadow={receiveShadow}
      />
      <OuterLandscape mapSize={mapSize} theme={theme} palette={palette} lowPower={lowPower} />
      <GrassField context={context} palette={palette} count={tuftCount} reducedMotion={reducedMotion} />
      <Shorelines zones={layout.surfaceZones} palette={palette} theme={theme} />
      <StonesAndBoulders layout={layout} palette={palette} castShadow={receiveShadow} />
      {theme === 'sunny-plaza' && <Wildflowers context={context} lowPower={lowPower} />}
      {theme === 'forest-trail' && (
        <>
          <GlowMushrooms context={context} lowPower={lowPower} />
          <Fireflies context={context} count={lowPower ? 90 : 200} reducedMotion={reducedMotion} />
        </>
      )}
      {theme === 'starlight-river' && (
        <>
          <FrostCrystals context={context} lowPower={lowPower} />
          <Snowfall count={lowPower ? 500 : 1100} reducedMotion={reducedMotion} />
        </>
      )}
    </group>
  )
})

