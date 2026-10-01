import { useEffect, useMemo } from 'react'
import { ConvexHullCollider, RigidBody } from '@react-three/rapier'
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute } from 'three'
import type { StageTheme } from '@/lib/quizrun-engine/types'
import { getTerrainRampSurfacePosition, type TerrainRamp } from '@/lib/quizrun-engine/worldPhysics'

function ParkHill({ ramps, faceColors }: { ramps: readonly TerrainRamp[]; faceColors: readonly [string, string, string] }) {
  const geometry = useMemo(() => {
    const [up, down] = ramps
    const points = [
      getTerrainRampSurfacePosition(up, -1, -1), getTerrainRampSurfacePosition(up, 1, -1),
      getTerrainRampSurfacePosition(up, -1, 1), getTerrainRampSurfacePosition(up, 1, 1),
      getTerrainRampSurfacePosition(down, -1, 1), getTerrainRampSurfacePosition(down, 1, 1),
    ].map(([x, y, z]) => [x, y - 0.025, z])
    const faces = [[0, 2, 4], [1, 5, 3], [0, 1, 3], [0, 3, 2], [2, 3, 5], [2, 5, 4], [4, 5, 1], [4, 1, 0]]
    const positions: number[] = []
    const colors: number[] = []
    faces.forEach((face, index) => {
      const color = new Color(index < 2 ? faceColors[0] : index < 4 ? faceColors[1] : faceColors[2])
      face.forEach((point) => {
        positions.push(...points[point])
        colors.push(color.r, color.g, color.b)
      })
    })
    const mesh = new BufferGeometry()
    mesh.setAttribute('position', new Float32BufferAttribute(positions, 3))
    mesh.setAttribute('color', new Float32BufferAttribute(colors, 3))
    mesh.computeVertexNormals()
    return { mesh, hull: new Float32Array(points.flat()) }
  }, [faceColors, ramps])
  useEffect(() => () => geometry.mesh.dispose(), [geometry])
  return (
    <RigidBody type="fixed" colliders={false} name="central-park-hill"
      userData={{ physics: { kind: 'rideable', label: '공원 산책 언덕', response: 'bounce', quiet: true } }}>
      {/* Six vertices form one simple convex prism, not a terrain triangle mesh. */}
      <ConvexHullCollider args={[geometry.hull]} friction={0.94} restitution={0} />
      <mesh geometry={geometry.mesh} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} side={DoubleSide} />
      </mesh>
    </RigidBody>
  )
}

/**
 * The lawn, pond bed and shoreline are painted into the natural terrain and
 * the pond surface is animated with the other water zones; only the walkable
 * hill needs its own geometry here.
 */
const HILL_COLORS: Record<StageTheme, readonly [string, string, string]> = {
  'sunny-plaza': ['#7A9C5B', '#96C675', '#84B86A'],
  'forest-trail': ['#26402F', '#36573E', '#2F4D37'],
  'starlight-river': ['#9EB4C2', '#E4EEF5', '#C6D6E1'],
}

export function CentralPark({ ramps, theme }: { ramps: readonly TerrainRamp[]; theme: StageTheme }) {
  const hills = useMemo(() => ramps.filter((ramp) => ramp.id.startsWith('central-park-hill')), [ramps])
  return (
    <group name="central-park">
      <ParkHill ramps={hills} faceColors={HILL_COLORS[theme]} />
    </group>
  )
}
