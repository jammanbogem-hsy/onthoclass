import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  Box3,
  Color,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Group,
  type Object3D,
} from 'three'
import type {
  ForestLandmark,
  ForestLandmarkKind,
  RideableObstacle,
  WorldTunnel,
} from '@/lib/quizrun-engine/worldPhysics'
import {
  explorerCampUrl,
  glowMushroomUrl,
  hollowLogUrl,
  moonAltarUrl,
  mushroomClusterUrl,
  stoneArchUrl,
  treehouseUrl,
} from '@/lib/quizrun-engine/forestModelUrls'

const LANDMARK_URLS: Record<Exclude<ForestLandmarkKind, 'lantern'>, string> = {
  treehouse: treehouseUrl,
  'glow-mushroom': glowMushroomUrl,
  'mushroom-cluster': mushroomClusterUrl,
  'stone-arch': stoneArchUrl,
  'moon-altar': moonAltarUrl,
  'explorer-camp': explorerCampUrl,
}

/** Parts of these models that should read as light sources at night. */
const GLOW: Partial<Record<ForestLandmarkKind, { color: string; intensity: number }>> = {
  'glow-mushroom': { color: '#5FE3FF', intensity: 0.55 },
  'mushroom-cluster': { color: '#7CF0D8', intensity: 0.6 },
  'moon-altar': { color: '#BFE4FF', intensity: 0.28 },
  treehouse: { color: '#FFC877', intensity: 0.08 },
}

const scratchBox = new Box3()
const scratchSize = new Vector3()
const scratchCenter = new Vector3()

/**
 * tripo exports are centered in a unit cube. Fit a clone to a target height
 * with its lowest point resting on the ground.
 */
export function FittedModel({
  url,
  height,
  glow,
  castShadow = true,
  sightOccluder = true,
}: {
  url: string
  height: number
  glow?: { color: string; intensity: number }
  castShadow?: boolean
  sightOccluder?: boolean
}) {
  const { scene } = useGLTF(url)
  const model = useMemo(() => {
    const copy = scene.clone(true)
    scratchBox.setFromObject(copy)
    scratchBox.getSize(scratchSize)
    scratchBox.getCenter(scratchCenter)
    const scale = height / Math.max(0.0001, scratchSize.y)
    copy.position.set(-scratchCenter.x * scale, -scratchBox.min.y * scale, -scratchCenter.z * scale)
    copy.scale.setScalar(scale)
    return copy
  }, [height, scene])

  useLayoutEffect(() => {
    const glowColor = glow ? new Color(glow.color) : null
    model.traverse((child: Object3D) => {
      if (!(child instanceof Mesh)) return
      child.castShadow = castShadow
      child.receiveShadow = true
      if (glowColor && child.material instanceof MeshStandardMaterial) {
        // Emissive map reuses the painted texture so only bright spots glow.
        const material = child.material.clone()
        material.emissive = glowColor
        material.emissiveMap = material.map
        material.emissiveIntensity = glow!.intensity
        child.material = material
      }
    })
  }, [castShadow, glow, model])

  return (
    <primitive object={model} userData={sightOccluder ? { sightOccluder: true } : undefined} />
  )
}

function Lantern({ landmark, reducedMotion }: { landmark: ForestLandmark; reducedMotion: boolean }) {
  const glow = useRef<Mesh>(null)
  const phase = landmark.rotationY * 3.1
  useFrame(({ clock }) => {
    if (!glow.current || reducedMotion) return
    const material = glow.current.material as MeshStandardMaterial
    material.emissiveIntensity = 2.1 + Math.sin(clock.elapsedTime * 2.3 + phase) * 0.35
  })
  const h = landmark.height
  return (
    <group position={[landmark.x, 0, landmark.z]} rotation={[0, landmark.rotationY, 0]}>
      <mesh position={[0, h * 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.09, h, 6]} />
        <meshStandardMaterial color="#3A2A1E" roughness={0.9} />
      </mesh>
      <mesh position={[0.28, h - 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, 0.6, 5]} />
        <meshStandardMaterial color="#3A2A1E" roughness={0.9} />
      </mesh>
      <group position={[0.52, h - 0.42, 0]}>
        <mesh position={[0, 0.3, 0]}>
          <coneGeometry args={[0.22, 0.2, 6]} />
          <meshStandardMaterial color="#2B2622" roughness={0.6} metalness={0.3} />
        </mesh>
        <mesh ref={glow}>
          <cylinderGeometry args={[0.15, 0.13, 0.4, 6]} />
          <meshStandardMaterial color="#FFE3A0" emissive="#FFB547" emissiveIntensity={2.1} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function Landmark({ landmark }: { landmark: ForestLandmark }) {
  if (landmark.kind === 'lantern') return null
  return (
    <group position={[landmark.x, 0, landmark.z]} rotation={[0, landmark.rotationY, 0]}>
      <FittedModel
        url={LANDMARK_URLS[landmark.kind]}
        height={landmark.height}
        glow={GLOW[landmark.kind]}
        castShadow={landmark.kind !== 'mushroom-cluster'}
      />
      {landmark.kind === 'moon-altar' && (
        <pointLight position={[0, landmark.height * 1.05, 0]} color="#A9D8FF" intensity={26} distance={22} decay={1.6} />
      )}
      {landmark.kind === 'explorer-camp' && (
        <pointLight position={[-1.2, 1.2, 2.4]} color="#FF9A3C" intensity={22} distance={16} decay={1.6} />
      )}
      {landmark.id === 'glow-mushroom-0' && (
        <pointLight position={[0, landmark.height * 0.55, 0]} color="#5FE3FF" intensity={30} distance={26} decay={1.5} />
      )}
    </group>
  )
}

export function ForestLandmarks({
  landmarks,
  reducedMotion,
}: {
  landmarks: readonly ForestLandmark[]
  reducedMotion: boolean
}) {
  if (landmarks.length === 0) return null
  return (
    <group name="forest-landmarks">
      {landmarks.map((landmark) =>
        landmark.kind === 'lantern' ? (
          <Lantern key={landmark.id} landmark={landmark} reducedMotion={reducedMotion} />
        ) : (
          <Landmark key={landmark.id} landmark={landmark} />
        ),
      )}
    </group>
  )
}

/** The forest tunnel keeps its box colliders but looks like a hollow log. */
export function HollowLogTunnelVisual({ tunnel }: { tunnel: WorldTunnel }) {
  const length = tunnel.halfDepth * 2 + 1.2
  // The log model lies along X at roughly 0.45 : 1 height : length.
  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <FittedModel url={hollowLogUrl} height={length * 0.448} />
    </group>
  )
}

const stoneColors = ['#5E6B63', '#66736A', '#56615A']

export function MoonSteppingStones({ stones }: { stones: readonly RideableObstacle[] }) {
  const group = useRef<Group>(null)
  const forestStones = stones.filter((stone) => stone.id.startsWith('moon-stepping-stone'))
  if (forestStones.length === 0) return null
  return (
    <group ref={group} name="moon-stepping-stones">
      {forestStones.map((stone, index) => (
        <mesh
          key={stone.id}
          position={[stone.x, stone.y + 0.02, stone.z]}
          rotation={[0, stone.rotationY, 0]}
          scale={[stone.halfWidth * 1.08, stone.halfHeight * 2.4, stone.halfDepth * 1.08]}
          castShadow
          receiveShadow
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={stoneColors[index % stoneColors.length]} roughness={0.92} flatShading />
        </mesh>
      ))}
    </group>
  )
}

Object.values(LANDMARK_URLS).forEach((url) => useGLTF.preload(url))
useGLTF.preload(hollowLogUrl)
