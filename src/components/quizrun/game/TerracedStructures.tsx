import { useEffect, useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { BoxGeometry, Color, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { StageTheme } from '@/lib/quizrun-engine/types'
import type { ElevatedPlatform, ElevatedWalkway, TerrainRamp } from '@/lib/quizrun-engine/worldPhysics'
import {
  createTerraceParts,
  createTerraceRampParts,
  createTerraceWalkwayParts,
  getTerraceRampQuaternion,
  type TerraceAssembly,
  type TerracePart,
} from '@/lib/quizrun-engine/terraceParts'

/** Treehouse decks: steel and paving become bark, planks and rope. */
const FOREST_PALETTE: Record<string, string> = {
  '#48676C': '#4A3526',
  '#9CB8AC': '#6B4A33',
  '#C8C6B7': '#56615A',
  '#D7B884': '#8A5E3B',
  '#FAEACC': '#C9A66B',
  '#DDD8BF': '#8A5E3B',
  '#EAE4CF': '#9C6B44',
  '#E7B95E': '#C79A4A',
  '#C3C2AC': '#6E4B30',
}

function mergeParts(parts: TerracePart[], palette?: Record<string, string>) {
  if (parts.length === 0) return null
  const sources = parts.map((part) => {
    const source = part.bevel
      ? new RoundedBoxGeometry(...part.size, 1, part.bevel)
      : new BoxGeometry(...part.size).toNonIndexed()
    const rotation = new Quaternion().setFromEuler(new Euler(...(part.rotation ?? [0, 0, 0])))
    source.applyMatrix4(new Matrix4().compose(
      new Vector3(...part.position), rotation, new Vector3(1, 1, 1),
    ))
    const color = new Color(palette?.[part.color.toUpperCase()] ?? part.color)
    const colors = new Float32Array(source.getAttribute('position').count * 3)
    for (let index = 0; index < colors.length; index += 3) {
      colors[index] = color.r
      colors[index + 1] = color.g
      colors[index + 2] = color.b
    }
    source.setAttribute('color', new Float32BufferAttribute(colors, 3))
    return source
  })
  const geometry = mergeGeometries(sources)
  sources.forEach((source) => source.dispose())
  geometry?.computeBoundingSphere()
  return geometry
}

function AssemblyMeshes({ assembly, castShadow, palette }: {
  assembly: TerraceAssembly
  castShadow: boolean
  palette?: Record<string, string>
}) {
  const geometries = useMemo(
    () => [mergeParts(assembly.deck, palette), mergeParts(assembly.frame, palette), mergeParts(assembly.railing, palette)],
    [assembly, palette],
  )
  useEffect(() => () => geometries.forEach((geometry) => geometry?.dispose()), [geometries])
  return (
    <>
      {geometries.map((geometry, index) => geometry && (
        <mesh key={index} name={`terrace-batch-${index}`} geometry={geometry} castShadow={castShadow} receiveShadow>
          <meshStandardMaterial vertexColors roughness={0.96} metalness={0} />
        </mesh>
      ))}
      {assembly.colliders.map((collider) => (
        <CuboidCollider key={collider.id} name={collider.id} args={collider.halfSize} position={collider.position} friction={0.96} restitution={0} />
      ))}
    </>
  )
}

function Terrace({ platform, castShadow, palette }: { platform: ElevatedPlatform; castShadow: boolean; palette?: Record<string, string> }) {
  const assembly = useMemo(() => createTerraceParts(platform), [platform])
  return (
    <RigidBody
      name={`terrace-${platform.id}`} type="fixed" colliders={false}
      position={[platform.x, platform.y, platform.z]} rotation={[0, platform.rotationY, 0]}
      userData={{ sightOccluder: true, sightBoxes: assembly.colliders, physics: { kind: 'rideable', label: platform.label, response: 'bounce', quiet: true } }}
    >
      <AssemblyMeshes assembly={assembly} castShadow={castShadow} palette={palette} />
    </RigidBody>
  )
}

function Approach({ ramp, castShadow, palette }: { ramp: TerrainRamp; castShadow: boolean; palette?: Record<string, string> }) {
  const assembly = useMemo(() => createTerraceRampParts(ramp), [ramp])
  const quaternion = useMemo(() => getTerraceRampQuaternion(ramp), [ramp])
  return (
    <RigidBody
      name={`approach-${ramp.id}`} type="fixed" colliders={false}
      position={[ramp.x, ramp.y, ramp.z]} quaternion={quaternion}
      userData={{ sightOccluder: true, sightBoxes: assembly.colliders, physics: { kind: 'rideable', label: ramp.label, response: 'bounce', quiet: true } }}
    >
      <AssemblyMeshes assembly={assembly} castShadow={castShadow} palette={palette} />
    </RigidBody>
  )
}

function Walkway({ walkway, castShadow, palette }: { walkway: ElevatedWalkway; castShadow: boolean; palette?: Record<string, string> }) {
  const assembly = useMemo(() => createTerraceWalkwayParts(walkway), [walkway])
  return (
    <RigidBody
      name={`walkway-${walkway.id}`} type="fixed" colliders={false}
      position={[walkway.x, walkway.y, walkway.z]} rotation={[0, walkway.rotationY, 0]}
      userData={{ sightOccluder: true, sightBoxes: assembly.colliders, physics: { kind: 'rideable', label: walkway.label, response: 'bounce', quiet: true } }}
    >
      <AssemblyMeshes assembly={assembly} castShadow={castShadow} palette={palette} />
    </RigidBody>
  )
}

export function TerracedStructures({ platforms, ramps, walkways = [], castShadow, theme }: {
  platforms: readonly ElevatedPlatform[]
  ramps: readonly TerrainRamp[]
  walkways?: readonly ElevatedWalkway[]
  castShadow: boolean
  theme?: StageTheme
}) {
  const palette = theme === 'forest-trail' ? FOREST_PALETTE : undefined
  return (
    <group name="terraced-structures">
      {platforms.map((platform) => <Terrace key={platform.id} platform={platform} castShadow={castShadow} palette={palette} />)}
      {ramps.map((ramp) => <Approach key={ramp.id} ramp={ramp} castShadow={castShadow} palette={palette} />)}
      {walkways.map((walkway) => <Walkway key={walkway.id} walkway={walkway} castShadow={castShadow} palette={palette} />)}
    </group>
  )
}
