import { Html } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  BallCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
  type CollisionEnterPayload,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier'
import {
  memo,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MutableRefObject,
} from 'react'
import {
  BufferAttribute,
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three'
import type { ControlVector } from './TouchJoystick'
import type { GameStage, LearningObject } from '@/lib/quizrun-engine/types'
import {
  canCollect,
  getObjectVisualScale,
  getSizeTier,
  isObjectTouchingBall,
} from '@/lib/quizrun-engine/mechanics'
import {
  getDriveControl,
  stepRelativeDrive,
  type DriveControl,
} from '@/lib/quizrun-engine/input'
import {
  getRollingTopSpeed,
  stepRollingMotion,
} from '@/lib/quizrun-engine/rollingMotion'
import {
  getPlayerColliderRadius,
  getPlayerSpawnTranslation,
  INITIAL_PLAYER_RADIUS,
  preservePlayerFootHeightWhileGrowing,
} from '@/lib/quizrun-engine/playerPhysics'
import {
  createWorldPhysicsLayout,
  getActiveSpeedZone,
  getActiveSurfaceZone,
  getElevatorDeckY,
  getPushableCollectionAssist,
  type SurfaceKind,
  type SurfaceZone,
  type ObstacleResponse,
  type PushableProp,
  type WorldElevator,
  type WorldPhysicsLayout,
} from '@/lib/quizrun-engine/worldPhysics'
import {
  canMagnetAttract,
  getPowerUpSpeedMultiplier,
  isPowerUpTouchingBall,
  stepMagnetPosition,
  type ActivePowerUps,
  type PowerUpPickup,
} from '@/lib/quizrun-engine/powerUps'
import { MaterialIcon } from './MaterialIcon'
import {
  AttachedObjectMesh,
  GardenSetDressing,
  LearningObjectMesh,
} from './game/GameSceneAssets'

interface GameCanvasProps {
  stage: GameStage
  attachedObjects: LearningObject[]
  collectedIds: string[]
  ballRadius: number
  paused: boolean
  reducedMotion: boolean
  controlVector: ControlVector
  activePowerUps: ActivePowerUps
  powerUpPickups: PowerUpPickup[]
  radarTreasures: LearningObject[]
  onPlayerPosition: (pose: PlayerMapPose) => void
  onCollect: (item: LearningObject) => void
  onPowerUpCollect: (pickup: PowerUpPickup) => void
  onTooLarge: (item: LearningObject) => void
  onPhysicsFeedback: (feedback: {
    type: 'collision' | 'boost' | 'slow' | 'elevator'
    label: string
    bounced?: boolean
    surfaceKind?: SurfaceKind
  }) => void
}

export interface PlayerMapPose {
  x: number
  z: number
  headingX: number
  headingZ: number
}

// Vite 의 import.meta.env.DEV 대체 — 디버그 플래그(물속 스폰·순간이동·자동주행)용.
// 운영 빌드에서는 false 로 접혀 관련 코드가 트리셰이킹된다.
const IS_DEV = process.env.NODE_ENV !== "production";

const SUBJECT_COLORS = {
  한글: '#FF7B66',
  수학: '#4169D8',
  과학: '#19815F',
  생활: '#E6A800',
}

interface MotionState {
  x: number
  z: number
  speed: number
  velocityX: number
  velocityZ: number
  boost: number
  impact: number
  surface: SurfaceKind | null
}

interface CameraOrbitState {
  zoom: number
  pitch: number
  pointerId: number | null
  pointerButton: number | null
  lastX: number
  lastY: number
  manualUntil: number
}

interface PhysicsBodyData {
  kind:
    | 'floor'
    | 'boundary'
    | 'obstacle'
    | 'rideable'
    | 'elevator'
    | 'dynamic-prop'
    | 'large-item'
  label: string
  response: ObstacleResponse
  quiet?: boolean
}

function getRuntimeItemPosition(
  positions: Map<string, Vector3>,
  item: Pick<LearningObject, 'id' | 'position'>,
): Vector3 {
  const existing = positions.get(item.id)
  if (existing) return existing
  const position = new Vector3(...item.position)
  positions.set(item.id, position)
  return position
}

function useKeyboard(disabled: boolean) {
  const keys = useRef<Record<DriveControl, boolean>>({
    forward: false,
    backward: false,
    left: false,
    right: false,
  })

  useEffect(() => {
    const clear = () => {
      keys.current.forward = false
      keys.current.backward = false
      keys.current.left = false
      keys.current.right = false
    }
    const isInteractiveTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.matches('button, input, textarea, select, [contenteditable="true"]') ||
        Boolean(target.closest('[role="dialog"]')))
    const down = (event: KeyboardEvent) => {
      if (isInteractiveTarget(event.target)) return
      const control = getDriveControl(event)
      if (!control) return
      keys.current[control] = true
      event.preventDefault()
    }
    const up = (event: KeyboardEvent) => {
      const control = getDriveControl(event)
      if (!control) return
      keys.current[control] = false
      event.preventDefault()
    }
    const visibility = () => {
      if (document.hidden) clear()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', visibility)

    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  useEffect(() => {
    if (!disabled) return
    keys.current.forward = false
    keys.current.backward = false
    keys.current.left = false
    keys.current.right = false
  }, [disabled])

  return keys
}

const LearningItem = memo(function LearningItem({
  item,
  reducedMotion,
  available,
  runtimePositions,
}: {
  item: LearningObject
  reducedMotion: boolean
  available: boolean
  runtimePositions?: MutableRefObject<Map<string, Vector3>>
}) {
  const root = useRef<Group>(null)
  const runtimePosition = useRef(new Vector3(...item.position))
  const visual = useRef<Group>(null)
  const badge = useRef<HTMLSpanElement>(null)
  const badgeVisible = useRef<boolean | null>(null)
  const tier = getSizeTier(item.size)
  const visualScale = getObjectVisualScale(item.size)
  const phase = useMemo(
    () => item.id.split('').reduce((total, char) => total + char.charCodeAt(0), 0),
    [item.id],
  )

  useEffect(() => {
    if (!runtimePositions) return
    const positions = runtimePositions.current
    positions.set(item.id, runtimePosition.current)
    return () => {
      positions.delete(item.id)
    }
  }, [item.id, runtimePositions])

  useFrame(({ camera, clock }) => {
    if (root.current) {
      root.current.position.copy(runtimePosition.current)
    }
    if (visual.current && !reducedMotion) {
      visual.current.position.y =
        visualScale * 0.58 + Math.sin(clock.elapsedTime * 1.4 + phase) * 0.045
      visual.current.rotation.y += 0.003
    }
    if (badge.current) {
      const distance = Math.hypot(
        item.position[0] - camera.position.x,
        item.position[2] - camera.position.z,
      )
      const nearby = distance < 17
      if (badgeVisible.current !== nearby) {
        badge.current.style.opacity = nearby ? '1' : '0'
        badge.current.style.visibility = nearby ? 'visible' : 'hidden'
        badgeVisible.current = nearby
      }
    }
  })

  return (
    <group ref={root} position={item.position}>
      <group scale={visualScale}>
        {Array.from({ length: tier.level }, (_, index) => (
          <mesh
            key={`tier-ring-${index}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.09 + index * 0.002, 0]}
            receiveShadow
          >
            <ringGeometry
              args={[0.68 + index * 0.16, 0.75 + index * 0.16, 28]}
            />
            <meshBasicMaterial
              color={available ? tier.color : SUBJECT_COLORS[item.subject]}
              transparent
              opacity={available ? 0.52 : 0.2}
            />
          </mesh>
        ))}
      </group>
      <group
        ref={visual}
        position={[0, visualScale * 0.58, 0]}
        scale={visualScale}
      >
        <LearningObjectMesh item={item} />
        {item.symbol && (
          <Html
            center
            position={[0, 0, 0.44]}
            distanceFactor={7}
            zIndexRange={[1, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <span className="world-symbol" aria-hidden="true">
              {item.symbol}
            </span>
          </Html>
        )}
      </group>
      <Html
        center
        position={[0, visualScale * 1.6, 0]}
        distanceFactor={8}
        zIndexRange={[1, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <span
          ref={badge}
          aria-hidden="true"
          className={`world-size-badge ${available ? 'is-available' : ''}`}
          style={{ '--tier-color': tier.color } as CSSProperties}
        >
          <b>{tier.level}</b>
          {tier.label}
          <i>
            <MaterialIcon name={available ? 'check' : 'arrow_upward'} />
          </i>
        </span>
      </Html>
    </group>
  )
})

function PowerUpPickupMesh({
  pickup,
  reducedMotion,
}: {
  pickup: PowerUpPickup
  reducedMotion: boolean
}) {
  const visual = useRef<Group>(null)
  const halo = useRef<Mesh>(null)

  useFrame(({ clock }, delta) => {
    if (visual.current) {
      visual.current.rotation.y += reducedMotion ? 0 : delta * 1.15
      visual.current.position.y = reducedMotion
        ? 0.7
        : 0.7 + Math.sin(clock.elapsedTime * 2.2) * 0.08
    }
    if (halo.current && !reducedMotion) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 3.4) * 0.12
      halo.current.scale.setScalar(pulse)
    }
  })

  const color =
    pickup.kind === 'magnet'
      ? '#2F6FB5'
      : pickup.kind === 'radar'
        ? '#7752B8'
        : '#C65A2E'
  const label =
    pickup.kind === 'magnet'
      ? '자석 배터리'
      : pickup.kind === 'radar'
        ? '보물 레이더'
        : '신속의 장화'

  return (
    <group position={pickup.position}>
      <mesh
        ref={halo}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.04, 0]}
      >
        <ringGeometry args={[0.68, 0.82, 36]} />
        <meshBasicMaterial color={color} transparent opacity={0.72} />
      </mesh>
      <group ref={visual} position={[0, 0.7, 0]} scale={0.78}>
        {pickup.kind === 'magnet' && (
          <>
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.34, 0.34, 0.84, 20]} />
              <meshStandardMaterial color="#F7FBFF" roughness={0.42} />
            </mesh>
            {[-0.44, 0.44].map((x) => (
              <mesh key={x} castShadow position={[x, 0, 0]}>
                <cylinderGeometry args={[0.37, 0.37, 0.12, 20]} />
                <meshStandardMaterial color={color} metalness={0.22} />
              </mesh>
            ))}
            <mesh position={[0, 0.01, 0.35]} scale={[0.18, 0.28, 0.05]}>
              <boxGeometry />
              <meshStandardMaterial color="#F6C945" emissive="#8B6A00" />
            </mesh>
          </>
        )}
        {pickup.kind === 'radar' && (
          <>
            <mesh castShadow position={[0, -0.16, 0]}>
              <cylinderGeometry args={[0.33, 0.42, 0.34, 20]} />
              <meshStandardMaterial color="#F7FBFF" roughness={0.48} />
            </mesh>
            <mesh rotation={[Math.PI / 2.6, 0, 0]} position={[0, 0.2, 0.06]}>
              <torusGeometry args={[0.36, 0.08, 10, 28]} />
              <meshStandardMaterial color={color} metalness={0.18} />
            </mesh>
            <mesh position={[0, 0.22, 0.08]}>
              <sphereGeometry args={[0.11, 16, 12]} />
              <meshStandardMaterial color="#F6C945" emissive="#8B6A00" />
            </mesh>
          </>
        )}
        {pickup.kind === 'speed' && (
          <group rotation={[0, -0.22, 0]}>
            <mesh castShadow position={[-0.13, 0.08, 0.04]} scale={[0.58, 0.58, 0.88]}>
              <capsuleGeometry args={[0.34, 0.44, 8, 16]} />
              <meshStandardMaterial color={color} roughness={0.62} />
            </mesh>
            <mesh castShadow position={[0.2, -0.1, 0.18]} scale={[0.7, 0.2, 1.1]}>
              <boxGeometry />
              <meshStandardMaterial color="#FFF8EC" roughness={0.72} />
            </mesh>
            <mesh position={[0.08, 0.12, 0.56]} rotation={[0.2, 0, 0]}>
              <boxGeometry args={[0.4, 0.08, 0.08]} />
              <meshStandardMaterial color="#F6C945" />
            </mesh>
          </group>
        )}
      </group>
      <Html
        center
        position={[0, 1.65, 0]}
        distanceFactor={9}
        zIndexRange={[2, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <span
          className={`world-power-up-badge is-${pickup.kind}`}
          aria-hidden="true"
        >
          {label}
        </span>
      </Html>
    </group>
  )
}

function RadarTreasureItem({
  item,
  runtimePositions,
  reducedMotion,
}: {
  item: LearningObject
  runtimePositions: MutableRefObject<Map<string, Vector3>>
  reducedMotion: boolean
}) {
  const root = useRef<Group>(null)
  const gem = useRef<Mesh>(null)
  const runtimePosition = useRef(new Vector3(...item.position))
  const rings = useRef<(Mesh | null)[]>([])
  const visualScale = getObjectVisualScale(item.size)
  const colors = ['#FF5D73', '#F6C945', '#42C79B', '#4D8DFF', '#9A6BFF']

  useEffect(() => {
    const positions = runtimePositions.current
    positions.set(item.id, runtimePosition.current)
    return () => {
      positions.delete(item.id)
    }
  }, [item.id, runtimePositions])

  useFrame(({ clock }, delta) => {
    if (root.current) root.current.position.copy(runtimePosition.current)
    if (gem.current && !reducedMotion) {
      gem.current.rotation.y += delta * 1.15
      gem.current.position.y =
        visualScale * 0.72 + Math.sin(clock.elapsedTime * 2.4) * 0.07
    }
    rings.current.forEach((ring, index) => {
      if (!ring || reducedMotion) return
      ring.rotation.z += delta * (0.32 + index * 0.08)
    })
  })

  return (
    <group ref={root} position={item.position}>
      <mesh
        position={[0, visualScale * 1.25, 0]}
        scale={[visualScale * 0.24, visualScale * 2.6, visualScale * 0.24]}
      >
        <cylinderGeometry args={[1, 1, 1, 16, 1, true]} />
        <meshBasicMaterial
          color="#FFF5C2"
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={gem} castShadow position={[0, visualScale * 0.72, 0]} scale={visualScale * 0.72}>
        <octahedronGeometry args={[1, 1]} />
        <meshStandardMaterial
          color={item.color}
          emissive={item.color}
          emissiveIntensity={0.28}
          metalness={0.18}
          roughness={0.28}
        />
      </mesh>
      {colors.map((color, index) => (
        <mesh
          key={color}
          ref={(mesh) => {
            rings.current[index] = mesh
          }}
          rotation={[
            -Math.PI / 2 + index * 0.18,
            index * 0.42,
            index * 0.2,
          ]}
          position={[0, 0.08 + index * 0.004, 0]}
          scale={visualScale}
        >
          <torusGeometry args={[0.76 + index * 0.06, 0.035, 8, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.88} />
        </mesh>
      ))}
      <Html
        center
        position={[0, visualScale * 1.75, 0]}
        distanceFactor={8}
        zIndexRange={[3, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <span className="world-treasure-badge" aria-hidden="true">
          보물 +{item.points}
        </span>
      </Html>
    </group>
  )
}

function MagnetFieldEffect({
  ballRadius,
  active,
  reducedMotion,
}: {
  ballRadius: number
  active: boolean
  reducedMotion: boolean
}) {
  const rings = useRef<(Mesh | null)[]>([])

  useFrame(({ clock }) => {
    rings.current.forEach((ring, index) => {
      if (!ring) return
      const phase = reducedMotion
        ? 0.4 + index * 0.25
        : (clock.elapsedTime * 0.72 + index * 0.5) % 1
      const scale = ballRadius * (1.22 + phase * 1.15)
      ring.scale.setScalar(scale)
      const material = ring.material as MeshBasicMaterial
      material.opacity = active
        ? reducedMotion
          ? 0.28
          : (1 - phase) * 0.42
        : 0
    })
  })

  return (
    <group visible={active}>
      {[0, 1].map((index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            rings.current[index] = mesh
          }}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.96, 1, 48]} />
          <meshBasicMaterial
            color="#54B8FF"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

function RollingBallCore({
  ballRadius,
  reducedMotion,
}: {
  ballRadius: number
  reducedMotion: boolean
}) {
  const core = useRef<Group>(null)

  useFrame((_, delta) => {
    if (!core.current) return
    const radius = reducedMotion
      ? ballRadius
      : MathUtils.damp(core.current.scale.x, ballRadius, 16, delta)
    core.current.scale.setScalar(radius)
  })

  return (
    <group ref={core} scale={INITIAL_PLAYER_RADIUS}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[1, 32, 24]} />
        <meshStandardMaterial
          color="#FFF1D3"
          roughness={0.62}
          metalness={0.02}
        />
      </mesh>
      {[0, Math.PI / 3, -Math.PI / 3].map((rotation, index) => (
        <mesh
          key={`rolling-band-${index}`}
          rotation={[rotation, 0, index * 0.9]}
        >
          <torusGeometry args={[0.945, 0.063, 10, 56]} />
          <meshStandardMaterial
            color={['#45A7A0', '#F2C94C', '#FF7B66'][index]}
            roughness={0.58}
          />
        </mesh>
      ))}
      {[
        [0, 0, 0.98],
        [0.74, 0.48, 0.44],
        [-0.72, 0.55, 0.4],
        [0.68, -0.58, -0.4],
        [-0.65, -0.62, -0.42],
      ].map((direction, index) => (
        <mesh
          key={`rolling-dot-${index}`}
          position={[direction[0], direction[1], direction[2]]}
          scale={index === 0 ? 0.13 : 0.1}
        >
          <sphereGeometry args={[1, 12, 9]} />
          <meshStandardMaterial
            color={['#4169D8', '#45A7A0', '#FF7B66'][index % 3]}
            roughness={0.55}
          />
        </mesh>
      ))}
    </group>
  )
}

function ChildPusher({
  ballRadius,
  motion,
  reducedMotion,
}: {
  ballRadius: number
  motion: MutableRefObject<MotionState>
  reducedMotion: boolean
}) {
  const root = useRef<Group>(null)
  const body = useRef<Group>(null)
  const torso = useRef<Group>(null)
  const leftThigh = useRef<Group>(null)
  const rightThigh = useRef<Group>(null)
  const leftShin = useRef<Group>(null)
  const rightShin = useRef<Group>(null)
  const leftUpperArm = useRef<Group>(null)
  const rightUpperArm = useRef<Group>(null)
  const leftForearm = useRef<Group>(null)
  const rightForearm = useRef<Group>(null)
  const helperScale = Math.min(0.96, 0.66 + ballRadius * 0.14)

  useLayoutEffect(() => {
    if (root.current) root.current.position.y = -ballRadius
  }, [ballRadius])

  useFrame(({ clock }, delta) => {
    if (!root.current) return

    const { x, z, speed } = motion.current
    const speedLevel = Math.min(1, speed)
    const distance = ballRadius + 0.5
    const sideOffset = 0.25
    const targetX = -x * distance + z * sideOffset
    const targetZ = -z * distance - x * sideOffset
    root.current.position.x = MathUtils.damp(
      root.current.position.x,
      targetX,
      12,
      delta,
    )
    root.current.position.z = MathUtils.damp(
      root.current.position.z,
      targetZ,
      12,
      delta,
    )
    root.current.position.y = -ballRadius
    const scale = MathUtils.damp(
      root.current.scale.x,
      helperScale,
      16,
      delta,
    )
    root.current.scale.setScalar(scale)
    root.current.rotation.y =
      Math.atan2(-x, -z) - Math.atan2(sideOffset, distance)

    const stride = reducedMotion
      ? 0
      : Math.sin(clock.elapsedTime * 9.2) * speedLevel
    const bob = reducedMotion ? 0 : Math.abs(stride) * 0.035
    if (body.current) body.current.position.y = bob
    if (torso.current) {
      torso.current.rotation.x = MathUtils.damp(
        torso.current.rotation.x,
        -(0.035 + speedLevel * 0.1),
        8,
        delta,
      )
    }
    if (leftThigh.current) leftThigh.current.rotation.x = stride * 0.5
    if (rightThigh.current) rightThigh.current.rotation.x = -stride * 0.5
    if (leftShin.current) {
      leftShin.current.rotation.x = Math.max(0, -stride) * 0.62
    }
    if (rightShin.current) {
      rightShin.current.rotation.x = Math.max(0, stride) * 0.62
    }
    if (leftUpperArm.current) {
      leftUpperArm.current.rotation.x = 1.05 + stride * 0.06
      leftUpperArm.current.rotation.z = -0.08 + stride * 0.04
    }
    if (rightUpperArm.current) {
      rightUpperArm.current.rotation.x = 1.05 - stride * 0.06
      rightUpperArm.current.rotation.z = 0.08 - stride * 0.04
    }
    if (leftForearm.current) {
      leftForearm.current.rotation.x = 0.28 + Math.abs(stride) * 0.06
    }
    if (rightForearm.current) {
      rightForearm.current.rotation.x = 0.28 + Math.abs(stride) * 0.06
    }
  })

  return (
    <group
      ref={root}
      position={[
        0,
        -INITIAL_PLAYER_RADIUS,
        INITIAL_PLAYER_RADIUS + 0.48,
      ]}
      scale={Math.min(
        0.96,
        0.66 + INITIAL_PLAYER_RADIUS * 0.14,
      )}
    >
      <group ref={body}>
        <mesh
          position={[0, 0.012, 0.02]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[0.5, 0.32, 1]}
        >
          <circleGeometry args={[0.52, 20]} />
          <meshBasicMaterial
            color="#273548"
            transparent
            opacity={0.14}
            depthWrite={false}
          />
        </mesh>

        <group ref={torso} position={[0, 0.7, 0]}>
          <mesh castShadow position={[0, 0.34, 0]} scale={[1, 1, 0.78]}>
            <capsuleGeometry args={[0.27, 0.36, 6, 14]} />
            <meshStandardMaterial color="#45A7A0" roughness={0.76} />
          </mesh>
          <mesh castShadow position={[0, 0.22, 0.24]} scale={[0.82, 1, 0.72]}>
            <capsuleGeometry args={[0.22, 0.24, 5, 12]} />
            <meshStandardMaterial color="#F2C94C" roughness={0.82} />
          </mesh>
          <mesh castShadow position={[0, 0.65, 0]}>
            <cylinderGeometry args={[0.09, 0.1, 0.14, 12]} />
            <meshStandardMaterial color="#F2B38A" roughness={0.72} />
          </mesh>
          <mesh castShadow position={[0, 0.89, 0]}>
            <sphereGeometry args={[0.28, 20, 16]} />
            <meshStandardMaterial color="#F2B38A" roughness={0.7} />
          </mesh>
          <mesh
            castShadow
            position={[0, 1.02, 0.035]}
            scale={[1.04, 0.58, 1.02]}
          >
            <sphereGeometry args={[0.285, 18, 12]} />
            <meshStandardMaterial color="#3C2E39" roughness={0.9} />
          </mesh>
          {[-0.09, 0.09].map((eyeX) => (
            <mesh
              key={`pusher-eye-${eyeX}`}
              position={[eyeX, 0.92, -0.255]}
            >
              <sphereGeometry args={[0.025, 8, 6]} />
              <meshStandardMaterial color="#273548" roughness={0.65} />
            </mesh>
          ))}
          <mesh position={[0, 0.84, -0.278]} scale={[0.07, 0.022, 0.018]}>
            <boxGeometry />
            <meshStandardMaterial color="#C96868" roughness={0.78} />
          </mesh>
          <mesh castShadow position={[0, 0.35, 0.28]} scale={[0.62, 1, 0.72]}>
            <capsuleGeometry args={[0.2, 0.26, 5, 12]} />
            <meshStandardMaterial color="#F2C94C" roughness={0.82} />
          </mesh>
          <mesh position={[0, 0.35, 0.43]}>
            <boxGeometry args={[0.18, 0.28, 0.04]} />
            <meshStandardMaterial color="#FFFDF7" roughness={0.84} />
          </mesh>

          <group
            ref={leftUpperArm}
            position={[-0.31, 0.48, -0.03]}
            rotation={[1.05, 0, -0.08]}
          >
            <mesh castShadow position={[0, -0.16, 0]}>
              <capsuleGeometry args={[0.07, 0.2, 5, 10]} />
              <meshStandardMaterial color="#45A7A0" roughness={0.76} />
            </mesh>
            <group ref={leftForearm} position={[0, -0.34, 0]} rotation={[0.28, 0, 0]}>
              <mesh castShadow position={[0, -0.16, 0]}>
                <capsuleGeometry args={[0.064, 0.2, 5, 10]} />
                <meshStandardMaterial color="#F2B38A" roughness={0.72} />
              </mesh>
              <mesh castShadow position={[0, -0.34, -0.01]}>
                <sphereGeometry args={[0.085, 10, 8]} />
                <meshStandardMaterial color="#F2B38A" roughness={0.7} />
              </mesh>
            </group>
          </group>
          <group
            ref={rightUpperArm}
            position={[0.31, 0.48, -0.03]}
            rotation={[1.05, 0, 0.08]}
          >
            <mesh castShadow position={[0, -0.16, 0]}>
              <capsuleGeometry args={[0.07, 0.2, 5, 10]} />
              <meshStandardMaterial color="#45A7A0" roughness={0.76} />
            </mesh>
            <group ref={rightForearm} position={[0, -0.34, 0]} rotation={[0.28, 0, 0]}>
              <mesh castShadow position={[0, -0.16, 0]}>
                <capsuleGeometry args={[0.064, 0.2, 5, 10]} />
                <meshStandardMaterial color="#F2B38A" roughness={0.72} />
              </mesh>
              <mesh castShadow position={[0, -0.34, -0.01]}>
                <sphereGeometry args={[0.085, 10, 8]} />
                <meshStandardMaterial color="#F2B38A" roughness={0.7} />
              </mesh>
            </group>
          </group>
        </group>

        <mesh castShadow position={[0, 0.67, 0]} scale={[0.5, 0.18, 0.34]}>
          <sphereGeometry args={[0.5, 14, 9]} />
          <meshStandardMaterial color="#273548" roughness={0.84} />
        </mesh>
        <group ref={leftThigh} position={[-0.14, 0.62, 0]}>
          <mesh castShadow position={[0, -0.16, 0]}>
            <capsuleGeometry args={[0.085, 0.18, 5, 10]} />
            <meshStandardMaterial color="#273548" roughness={0.84} />
          </mesh>
          <group ref={leftShin} position={[0, -0.34, 0]}>
            <mesh castShadow position={[0, -0.17, 0]}>
              <capsuleGeometry args={[0.075, 0.2, 5, 10]} />
              <meshStandardMaterial color="#3F5268" roughness={0.84} />
            </mesh>
            <mesh castShadow position={[0, -0.37, -0.08]} scale={[1, 0.58, 1.45]}>
              <capsuleGeometry args={[0.09, 0.16, 5, 10]} />
              <meshStandardMaterial color="#FFFDF7" roughness={0.86} />
            </mesh>
            <mesh position={[0, -0.395, -0.12]} scale={[0.12, 0.035, 0.24]}>
              <boxGeometry />
              <meshStandardMaterial color="#FF7B66" roughness={0.72} />
            </mesh>
          </group>
        </group>
        <group ref={rightThigh} position={[0.14, 0.62, 0]}>
          <mesh castShadow position={[0, -0.16, 0]}>
            <capsuleGeometry args={[0.085, 0.18, 5, 10]} />
            <meshStandardMaterial color="#374151" roughness={0.86} />
          </mesh>
          <group ref={rightShin} position={[0, -0.34, 0]}>
            <mesh castShadow position={[0, -0.17, 0]}>
              <capsuleGeometry args={[0.075, 0.2, 5, 10]} />
              <meshStandardMaterial color="#3F5268" roughness={0.84} />
            </mesh>
            <mesh castShadow position={[0, -0.37, -0.08]} scale={[1, 0.58, 1.45]}>
              <capsuleGeometry args={[0.09, 0.16, 5, 10]} />
              <meshStandardMaterial color="#FFFDF7" roughness={0.86} />
            </mesh>
            <mesh position={[0, -0.395, -0.12]} scale={[0.12, 0.035, 0.24]}>
              <boxGeometry />
              <meshStandardMaterial color="#4169D8" roughness={0.72} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

function MotionEffects({
  ballRadius,
  motion,
  reducedMotion,
  speedPowerUpActive,
}: {
  ballRadius: number
  motion: MutableRefObject<MotionState>
  reducedMotion: boolean
  speedPowerUpActive: boolean
}) {
  const puffs = useRef<(Mesh | null)[]>([])

  useFrame(({ clock }) => {
    const { x, z, speed, boost, impact } = motion.current
    puffs.current.forEach((puff, index) => {
      if (!puff) return
      const sideX = -z
      const sideZ = x
      const phase = (clock.elapsedTime * 3.4 + index * 0.7) % 1
      const spread = (index % 2 ? 1 : -1) * (0.2 + index * 0.06)
      const behind = ballRadius * 0.55 + phase * 0.85
      puff.position.set(
        -x * behind + sideX * spread,
        -ballRadius + 0.055,
        -z * behind + sideZ * spread,
      )
      const material = puff.material as MeshBasicMaterial
      material.color.set(
        speedPowerUpActive
          ? '#FFB36B'
          : boost > 1
            ? '#B6F3FF'
            : impact > 0
              ? '#FFD29B'
              : '#FFF3D4',
      )
      material.opacity = reducedMotion
        ? 0
        : Math.min(0.58, speed * boost * (1 - phase) * 0.36 + impact * 0.12)
      const scale =
        0.7 + phase * (speedPowerUpActive ? 2.55 : boost > 1 ? 2.15 : 1.6)
      puff.scale.set(scale, 0.18, scale * 0.72)
    })
  })

  return (
    <group>
      {Array.from({ length: 7 }, (_, index) => (
        <mesh
          key={`roll-puff-${index}`}
          ref={(mesh) => {
            puffs.current[index] = mesh
          }}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.16, 12]} />
          <meshBasicMaterial
            color="#FFF3D4"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

const WATER_VERTEX_SHADER = `
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 wavePosition = position;
    float edgeFade =
      1.0 - smoothstep(0.18, 0.5, distance(uv, vec2(0.5)));
    float crossingWave =
      sin(position.x * 5.5 + uTime * 1.8) * 0.022 +
      cos(position.y * 7.2 - uTime * 1.35) * 0.016;
    wavePosition.z += crossingWave * edgeFade;
    gl_Position =
      projectionMatrix * modelViewMatrix * vec4(wavePosition, 1.0);
  }
`

const WATER_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec3 uTint;
  varying vec2 vUv;

  void main() {
    vec2 centered = vUv - vec2(0.5);
    float distanceFromCenter = length(centered);
    float edge = 1.0 - smoothstep(0.44, 0.5, distanceFromCenter);
    float travelingRipple =
      sin(distanceFromCenter * 55.0 - uTime * 4.6) * 0.5 + 0.5;
    float crossingRipple =
      sin(centered.x * 36.0 + centered.y * 24.0 + uTime * 2.8) * 0.5 + 0.5;
    float shimmer = pow(
      max(0.0, sin((centered.x - centered.y) * 48.0 + uTime * 3.2)),
      12.0
    );
    vec3 shallowColor = mix(uTint, vec3(0.78, 0.96, 1.0), 0.48);
    vec3 waterColor = mix(
      uTint * 0.82,
      shallowColor,
      travelingRipple * 0.26 + crossingRipple * 0.18
    );
    waterColor += shimmer * 0.22;
    gl_FragColor = vec4(waterColor, edge * 0.76);
  }
`

function AnimatedWaterSurface({
  zone,
  reducedMotion,
}: {
  zone: SurfaceZone
  reducedMotion: boolean
}) {
  const material = useRef<ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTint: { value: new Color(zone.color) },
    }),
    [zone.color],
  )

  useFrame(({ clock }) => {
    if (!material.current) return
    material.current.uniforms.uTime.value = reducedMotion
      ? 0.75
      : clock.elapsedTime
  })

  return (
    <group
      position={[zone.x, 0.032, zone.z]}
      rotation={[0, zone.rotationY, 0]}
    >
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[zone.halfWidth, zone.halfDepth, 1]}
        receiveShadow
      >
        <circleGeometry args={[1, 96]} />
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={WATER_VERTEX_SHADER}
          fragmentShader={WATER_FRAGMENT_SHADER}
          transparent
          depthWrite={false}
        />
      </mesh>
      {[0.48, 0.86].map((radius, index) => (
        <mesh
          key={`${zone.id}-water-ring-${radius}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.01 + index * 0.003, 0]}
          scale={[zone.halfWidth, zone.halfDepth, 1]}
        >
          <ringGeometry args={[radius - 0.012, radius, 72]} />
          <meshBasicMaterial
            color="#D9FAFF"
            transparent
            opacity={0.22 - index * 0.035}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

function WaterContactEffects({
  playerPosition,
  ballRadius,
  motion,
  reducedMotion,
}: {
  playerPosition: MutableRefObject<Vector3>
  ballRadius: number
  motion: MutableRefObject<MotionState>
  reducedMotion: boolean
}) {
  const group = useRef<Group>(null)
  const ripples = useRef<(Mesh | null)[]>([])
  const droplets = useRef<Points>(null)
  const strength = useRef(0)
  const wasInWater = useRef(false)
  const entryBurst = useRef(0)
  const dropletPositions = useMemo(() => new Float32Array(8 * 3), [])

  useFrame(({ clock }, delta) => {
    const root = group.current
    if (!root) return

    const isInWater = motion.current.surface === 'water'
    if (isInWater && !wasInWater.current) entryBurst.current = 1
    wasInWater.current = isInWater
    entryBurst.current = Math.max(0, entryBurst.current - delta * 1.7)

    const targetStrength =
      isInWater
        ? Math.min(1, 0.52 + motion.current.speed * 0.72)
        : 0
    strength.current = MathUtils.damp(
      strength.current,
      targetStrength,
      targetStrength > 0 ? 7.5 : 4.5,
      delta,
    )
    root.visible = strength.current > 0.012
    if (!root.visible) return

    root.position.set(
      playerPosition.current.x,
      0.055,
      playerPosition.current.z,
    )
    const elapsed = reducedMotion ? 0.35 : clock.elapsedTime

    ripples.current.forEach((ripple, index) => {
      if (!ripple) return
      const phase = (elapsed * (0.7 + index * 0.08) + index * 0.34) % 1
      const scale =
        ballRadius *
        (1.15 + phase * 1.55 + entryBurst.current * (0.45 + index * 0.2))
      ripple.scale.set(scale, scale, scale)
      const material = ripple.material as MeshBasicMaterial
      material.opacity =
        strength.current *
        (1 - phase) *
        (reducedMotion ? 0.28 : 0.68 + entryBurst.current * 0.2)
    })

    const dropletCloud = droplets.current
    if (dropletCloud) {
      const positionAttribute = dropletCloud.geometry.getAttribute(
        'position',
      ) as BufferAttribute
      for (let index = 0; index < 8; index += 1) {
        const phase = (elapsed * 1.45 + index * 0.17) % 1
        const angle = index * 2.399 + elapsed * 0.42
        const spread =
          ballRadius *
          (0.72 + phase * 1.1 + entryBurst.current * 0.36)
        positionAttribute.setXYZ(
          index,
          Math.cos(angle) * spread,
          reducedMotion
            ? 0.04
            : Math.sin(phase * Math.PI) *
                ballRadius *
                (0.35 +
                  motion.current.speed * 0.38 +
                  entryBurst.current * 0.32),
          Math.sin(angle) * spread,
        )
      }
      positionAttribute.needsUpdate = true
      const material = dropletCloud.material as PointsMaterial
      material.size =
        ballRadius * (0.2 + entryBurst.current * 0.06) * strength.current
      material.opacity =
        reducedMotion
          ? 0
          : strength.current * (0.6 + entryBurst.current * 0.25)
    }
  })

  return (
    <group ref={group} visible={false}>
      {[0, 1].map((index) => (
        <mesh
          key={`water-contact-ripple-${index}`}
          ref={(mesh) => {
            ripples.current[index] = mesh
          }}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.78, 1, 48]} />
          <meshBasicMaterial
            color="#E6FCFF"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
      <points ref={droplets}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[dropletPositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#BCEEF8"
          size={0.08}
          sizeAttenuation
          transparent
          opacity={0}
          depthWrite={false}
        />
      </points>
    </group>
  )
}

function RapierWorldColliders({
  mapSize,
  layout,
  reducedMotion,
}: {
  mapSize: number
  layout: WorldPhysicsLayout
  reducedMotion: boolean
}) {
  const halfMap = mapSize / 2
  const boundaryData: PhysicsBodyData = {
    kind: 'boundary',
    label: '공원 경계',
    response: 'stop',
    quiet: true,
  }

  return (
    <>
      <RigidBody
        type="fixed"
        colliders={false}
        userData={{
          physics: {
            kind: 'floor',
            label: '공원 바닥',
            response: 'stop',
            quiet: true,
          } satisfies PhysicsBodyData,
        }}
      >
        <CuboidCollider
          args={[halfMap, 0.1, halfMap]}
          position={[0, -0.1, 0]}
          friction={1}
          restitution={0}
        />
      </RigidBody>

      {[
        {
          id: 'north',
          position: [0, 2.5, -halfMap - 0.3] as [number, number, number],
          args: [halfMap + 0.6, 2.5, 0.3] as [number, number, number],
        },
        {
          id: 'south',
          position: [0, 2.5, halfMap + 0.3] as [number, number, number],
          args: [halfMap + 0.6, 2.5, 0.3] as [number, number, number],
        },
        {
          id: 'west',
          position: [-halfMap - 0.3, 2.5, 0] as [number, number, number],
          args: [0.3, 2.5, halfMap + 0.6] as [number, number, number],
        },
        {
          id: 'east',
          position: [halfMap + 0.3, 2.5, 0] as [number, number, number],
          args: [0.3, 2.5, halfMap + 0.6] as [number, number, number],
        },
      ].map((wall) => (
        <RigidBody
          key={`boundary-${wall.id}`}
          type="fixed"
          colliders={false}
          position={wall.position}
          userData={{ physics: boundaryData }}
        >
          <CuboidCollider
            args={wall.args}
            friction={0.9}
            restitution={0.04}
          />
        </RigidBody>
      ))}

      {layout.obstacles.map((obstacle) => {
        const physics: PhysicsBodyData = {
          kind: 'obstacle',
          label: obstacle.label,
          response: obstacle.response,
        }

        return (
          <RigidBody
            key={obstacle.id}
            type="fixed"
            colliders={false}
            position={[obstacle.x, 0, obstacle.z]}
            userData={{ physics }}
          >
            <CylinderCollider
              args={[2.5, obstacle.radius]}
              position={[0, 2.5, 0]}
              friction={0.92}
              restitution={obstacle.response === 'bounce' ? 0.42 : 0.02}
            />
          </RigidBody>
        )
      })}

      {layout.rideableObstacles.map((obstacle) => {
        const physics: PhysicsBodyData = {
          kind: 'rideable',
          label: obstacle.label,
          response: 'bounce',
          quiet: true,
        }

        return (
          <RigidBody
            key={obstacle.id}
            type="fixed"
            colliders={false}
            position={[obstacle.x, obstacle.y, obstacle.z]}
            rotation={[0, obstacle.rotationY, 0]}
            userData={{ physics }}
          >
            <CuboidCollider
              args={[
                obstacle.halfWidth,
                obstacle.halfHeight,
                obstacle.halfDepth,
              ]}
              friction={0.96}
              restitution={0}
            />
          </RigidBody>
        )
      })}

      {layout.terrainRamps.map((ramp) => {
        const physics: PhysicsBodyData = {
          kind: 'rideable',
          label: ramp.label,
          response: 'bounce',
          quiet: true,
        }

        return (
          <RigidBody
            key={ramp.id}
            type="fixed"
            colliders={false}
            position={[ramp.x, ramp.y, ramp.z]}
            rotation={[ramp.rotationX, ramp.rotationY, 0]}
            userData={{ physics }}
          >
            <CuboidCollider
              args={[ramp.halfWidth, ramp.halfHeight, ramp.halfDepth]}
              friction={0.98}
              restitution={0}
            />
            <mesh castShadow receiveShadow>
              <boxGeometry
                args={[
                  ramp.halfWidth * 2,
                  ramp.halfHeight * 2,
                  ramp.halfDepth * 2,
                ]}
              />
              <meshStandardMaterial color={ramp.color} roughness={0.94} />
            </mesh>
          </RigidBody>
        )
      })}

      {layout.elevatedPlatforms.map((platform) => {
        const physics: PhysicsBodyData = {
          kind: 'rideable',
          label: platform.label,
          response: 'bounce',
          quiet: true,
        }
        const supportHeight = Math.max(0.2, platform.y - platform.halfHeight)

        return (
          <RigidBody
            key={platform.id}
            type="fixed"
            colliders={false}
            position={[platform.x, platform.y, platform.z]}
            rotation={[0, platform.rotationY, 0]}
            userData={{ physics }}
          >
            <CuboidCollider
              args={[
                platform.halfWidth,
                platform.halfHeight,
                platform.halfDepth,
              ]}
              friction={0.98}
              restitution={0}
            />
            <mesh castShadow receiveShadow>
              <boxGeometry
                args={[
                  platform.halfWidth * 2,
                  platform.halfHeight * 2,
                  platform.halfDepth * 2,
                ]}
              />
              <meshStandardMaterial color={platform.color} roughness={0.88} />
            </mesh>
            {[
              [-0.78, -0.78],
              [0.78, -0.78],
              [-0.78, 0.78],
              [0.78, 0.78],
            ].map(([xRatio, zRatio], index) => (
              <mesh
                key={`${platform.id}-support-${index}`}
                castShadow
                position={[
                  platform.halfWidth * xRatio,
                  -platform.y / 2,
                  platform.halfDepth * zRatio,
                ]}
              >
                <boxGeometry args={[0.34, supportHeight, 0.34]} />
                <meshStandardMaterial
                  color="#425066"
                  roughness={0.9}
                />
              </mesh>
            ))}
            <Html
              center
              position={[0, platform.halfHeight + 0.72, 0]}
              distanceFactor={11}
              zIndexRange={[1, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <span className="world-interaction-label">
                <MaterialIcon name="arrow_upward" />
                {platform.label}
              </span>
            </Html>
          </RigidBody>
        )
      })}

      {layout.surfaceZones.map((zone) =>
        zone.kind === 'water' ? (
          <AnimatedWaterSurface
            key={zone.id}
            zone={zone}
            reducedMotion={reducedMotion}
          />
        ) : (
          <group
            key={zone.id}
            position={[zone.x, 0.026, zone.z]}
            rotation={[0, zone.rotationY, 0]}
          >
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              scale={[zone.halfWidth, zone.halfDepth, 1]}
              receiveShadow
            >
              <circleGeometry args={[1, 64]} />
              <meshStandardMaterial
                color={zone.color}
                roughness={0.96}
                transparent
                opacity={0.9}
              />
            </mesh>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.006, 0]}
              scale={[zone.halfWidth, zone.halfDepth, 1]}
            >
              <ringGeometry args={[0.88, 1, 64]} />
              <meshBasicMaterial
                color="#DDF4C8"
                transparent
                opacity={0.58}
              />
            </mesh>
          </group>
        ),
      )}
    </>
  )
}

function DynamicPracticeProps({
  stageId,
  props,
}: {
  stageId: string
  props: PushableProp[]
}) {
  return (
    <>
      {props.map((prop, index) => {
        const physics: PhysicsBodyData = {
          kind: 'dynamic-prop',
          label: prop.label,
          response: 'bounce',
        }

        return (
          <RigidBody
            key={`${stageId}-${prop.id}`}
            colliders={false}
            position={[prop.x, prop.y, prop.z]}
            rotation={[
              0,
              prop.rotationY,
              index % 2 ? 0.08 : -0.06,
            ]}
            mass={prop.kind === 'block' ? 0.62 : 0.4}
            linearDamping={0.38}
            angularDamping={0.54}
            ccd
            userData={{ physics }}
          >
            {prop.kind === 'block' ? (
              <>
                <CuboidCollider
                  args={[0.34, 0.34, 0.34]}
                  friction={0.78}
                  restitution={0.34}
                />
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[0.68, 0.68, 0.68]} />
                  <meshStandardMaterial color={prop.color} roughness={0.76} />
                </mesh>
              </>
            ) : (
              <>
                <CylinderCollider
                  args={[0.36, prop.kind === 'cone' ? 0.28 : 0.2]}
                  friction={0.72}
                  restitution={0.42}
                />
                {prop.kind === 'cone' ? (
                  <mesh castShadow receiveShadow>
                    <coneGeometry args={[0.3, 0.72, 16]} />
                    <meshStandardMaterial color={prop.color} roughness={0.72} />
                  </mesh>
                ) : (
                  <group>
                    <mesh castShadow receiveShadow>
                      <cylinderGeometry args={[0.17, 0.21, 0.72, 16]} />
                      <meshStandardMaterial color={prop.color} roughness={0.66} />
                    </mesh>
                    <mesh position={[0, 0.12, 0]} scale={[1.03, 0.13, 1.03]}>
                      <cylinderGeometry args={[0.18, 0.18, 0.72, 16]} />
                      <meshStandardMaterial color="#FFFDF7" roughness={0.7} />
                    </mesh>
                  </group>
                )}
              </>
            )}
          </RigidBody>
        )
      })}
    </>
  )
}

function KinematicElevator({
  elevator,
  playerPosition,
  ballRadius,
  paused,
  onActivate,
}: {
  elevator: WorldElevator
  playerPosition: MutableRefObject<Vector3>
  ballRadius: number
  paused: boolean
  onActivate: (label: string) => void
}) {
  const body = useRef<RapierRigidBody>(null)
  const button = useRef<Mesh>(null)
  const label = useRef<HTMLSpanElement>(null)
  const holdDuration = useRef(0)
  const progress = useRef(0)
  const activated = useRef(false)

  useFrame((_, delta) => {
    const rigidBody = body.current
    if (!rigidBody) return

    const currentY = getElevatorDeckY(elevator, progress.current)
    const deckTop = currentY + elevator.halfHeight
    const playerFootY = playerPosition.current.y - ballRadius
    const onButton =
      Math.hypot(
        playerPosition.current.x - elevator.x,
        playerPosition.current.z - elevator.z,
      ) <=
        elevator.buttonRadius + ballRadius * 0.38 &&
      Math.abs(playerFootY - deckTop) < 0.58

    if (!paused && !activated.current) {
      holdDuration.current = onButton
        ? Math.min(0.45, holdDuration.current + delta)
        : Math.max(0, holdDuration.current - delta * 2.6)
      if (holdDuration.current >= 0.32) {
        activated.current = true
        onActivate(elevator.label)
      }
    }

    if (!paused && activated.current && progress.current < 1) {
      progress.current = Math.min(
        1,
        progress.current + delta / elevator.travelDuration,
      )
    }

    const nextY = getElevatorDeckY(elevator, progress.current)
    rigidBody.setNextKinematicTranslation({
      x: elevator.x,
      y: nextY,
      z: elevator.z,
    })

    if (button.current) {
      button.current.position.y =
        elevator.halfHeight + (onButton ? 0.045 : 0.085)
      button.current.scale.y = onButton ? 0.62 : 1
    }
    if (label.current) {
      label.current.textContent =
        progress.current >= 1
          ? '2층 도착'
          : activated.current
            ? '2층으로 올라가는 중'
            : onButton
              ? '발판 누르는 중'
              : '발판 위에 올라가세요'
    }
  })

  const physics: PhysicsBodyData = {
    kind: 'elevator',
    label: elevator.label,
    response: 'bounce',
    quiet: true,
  }
  const guideHeight = elevator.topY + elevator.halfHeight

  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh
          key={`${elevator.id}-guide-${side}`}
          castShadow
          position={[
            elevator.x + side * (elevator.halfWidth + 0.22),
            guideHeight / 2,
            elevator.z + elevator.halfDepth * 0.72,
          ]}
        >
          <boxGeometry args={[0.22, guideHeight, 0.22]} />
          <meshStandardMaterial color="#425066" roughness={0.72} />
        </mesh>
      ))}
      <mesh
        position={[elevator.x, 0.018, elevator.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry
          args={[elevator.buttonRadius * 1.15, elevator.buttonRadius * 1.42, 40]}
        />
        <meshBasicMaterial color="#D9ECFF" transparent opacity={0.72} />
      </mesh>
      <RigidBody
        ref={body}
        type="kinematicPosition"
        colliders={false}
        position={[elevator.x, elevator.bottomY, elevator.z]}
        userData={{ physics }}
      >
        <CuboidCollider
          args={[
            elevator.halfWidth,
            elevator.halfHeight,
            elevator.halfDepth,
          ]}
          friction={1}
          restitution={0}
        />
        <mesh castShadow receiveShadow>
          <boxGeometry
            args={[
              elevator.halfWidth * 2,
              elevator.halfHeight * 2,
              elevator.halfDepth * 2,
            ]}
          />
          <meshStandardMaterial color={elevator.color} roughness={0.7} />
        </mesh>
        <mesh
          ref={button}
          castShadow
          position={[0, elevator.halfHeight + 0.085, 0]}
        >
          <cylinderGeometry
            args={[
              elevator.buttonRadius * 0.58,
              elevator.buttonRadius * 0.65,
              0.12,
              32,
            ]}
          />
          <meshStandardMaterial
            color="#F8C84A"
            emissive="#F8C84A"
            emissiveIntensity={0.18}
            roughness={0.54}
          />
        </mesh>
        <Html
          center
          position={[0, elevator.halfHeight + 0.92, 0]}
          distanceFactor={9}
          zIndexRange={[2, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <span className="world-interaction-label is-elevator">
            <MaterialIcon name="arrow_upward" />
            <span ref={label}>발판 위에 올라가세요</span>
          </span>
        </Html>
      </RigidBody>
    </group>
  )
}

function TooLargeItemColliders({
  items,
  ballRadius,
}: {
  items: LearningObject[]
  ballRadius: number
}) {
  return (
    <>
      {items
        .filter((item) => !canCollect(ballRadius, item.size))
        .map((item) => {
          const radius = Math.max(0.22, item.size * 0.64)
          const physics: PhysicsBodyData = {
            kind: 'large-item',
            label: item.label,
            response: 'bounce',
            quiet: true,
          }

          return (
            <RigidBody
              key={`large-item-${item.id}`}
              type="fixed"
              colliders={false}
              position={[
                item.position[0],
                item.position[1] + radius,
                item.position[2],
              ]}
              userData={{ physics }}
            >
              <BallCollider
                args={[radius]}
                friction={0.76}
                restitution={0.28}
              />
            </RigidBody>
          )
        })}
    </>
  )
}

function GameWorld({
  stage,
  attachedObjects,
  collectedIds,
  ballRadius,
  paused,
  reducedMotion,
  controlVector,
  activePowerUps,
  powerUpPickups,
  radarTreasures,
  onPlayerPosition,
  onCollect,
  onPowerUpCollect,
  onTooLarge,
  onPhysicsFeedback,
}: GameCanvasProps) {
  const objects = stage.objects
  const magnetActive = activePowerUps.magnet > 0
  const speedPowerUpActive = activePowerUps.speed > 0
  const physicsLayout = useMemo(
    () => createWorldPhysicsLayout(stage),
    [stage],
  )
  const debugSurface = useMemo(() => {
    if (
      !IS_DEV ||
      new URLSearchParams(window.location.search).get('spawn') !== 'water'
    ) {
      return null
    }
    return (
      physicsLayout.surfaceZones.find((zone) => zone.kind === 'water') ?? null
    )
  }, [physicsLayout])
  const debugCollectionTarget = useMemo(() => {
    const teleportMode = new URLSearchParams(window.location.search).get(
      'teleport',
    )
    if (
      !IS_DEV ||
      (teleportMode !== 'collect' &&
        teleportMode !== 'elevated' &&
        teleportMode !== 'cone')
    ) {
      return null
    }
    if (teleportMode === 'cone') {
      return (
        stage.objects.find(
          (item) =>
            item.position[1] < 0.2 &&
            canCollect(0.42, item.size) &&
            getPushableCollectionAssist(
              item,
              physicsLayout.pushableProps,
            ) > 0,
        ) ?? null
      )
    }
    const needsElevatedItem = teleportMode === 'elevated'
    return (
      stage.objects.find(
        (item) =>
          (needsElevatedItem
            ? item.position[1] > 3
            : item.position[1] < 0.2) &&
          Math.hypot(item.position[0], item.position[2]) > 20 &&
          canCollect(0.42, item.size),
      ) ?? null
    )
  }, [physicsLayout.pushableProps, stage.objects])
  const debugTeleportMode =
    IS_DEV
      ? new URLSearchParams(window.location.search).get('teleport')
      : null
  const debugPowerUpTarget =
    IS_DEV && debugTeleportMode === 'powerup'
      ? powerUpPickups[0] ?? null
      : null
  const debugTreasureTarget =
    IS_DEV && debugTeleportMode === 'treasure'
      ? radarTreasures[0] ?? null
      : null
  const spawnX = debugSurface?.x ?? 0
  const spawnZ = debugSurface?.z ?? 0
  const spawnTranslation = useMemo(
    () => getPlayerSpawnTranslation(spawnX, spawnZ),
    [spawnX, spawnZ],
  )
  const debugAutoDrive =
    IS_DEV &&
    new URLSearchParams(window.location.search).get('autodrive') === 'true'
  const playerBody = useRef<RapierRigidBody>(null)
  const playerCollider = useRef<RapierCollider>(null)
  const previousBallRadius = useRef(INITIAL_PLAYER_RADIUS)
  const playerPosition = useRef(
    new Vector3(...spawnTranslation),
  )
  const orb = useRef<Group>(null)
  const keys = useKeyboard(paused)
  const { camera, gl } = useThree()
  const collectedSet = useRef(new Set(collectedIds))
  const collectedPowerUpSet = useRef(new Set<string>())
  const runtimeItemPositions = useRef(
    new Map(
      objects.map(
        (item) => [item.id, new Vector3(...item.position)] as const,
      ),
    ),
  )
  const runtimeTreasurePositions = useRef(new Map<string, Vector3>())
  const tooLargeCooldown = useRef(0)
  const physicsFeedbackCooldown = useRef(0)
  const collisionFeedbackCooldown = useRef(0)
  const collisionRecoveryUntil = useRef(0)
  const activeSpeedZoneId = useRef<string | null>(null)
  const activeSurfaceZoneId = useRef<string | null>(null)
  const cameraPosition = useRef(new Vector3(0, 7, 8))
  const cameraDirection = useRef(new Vector3(0, 0, -1))
  const cameraTargetDirection = useRef(new Vector3(0, 0, -1))
  const cameraOrbit = useRef<CameraOrbitState>({
    zoom: 1,
    pitch: 0,
    pointerId: null,
    pointerButton: null,
    lastX: 0,
    lastY: 0,
    manualUntil: 0,
  })
  const heading = useRef(new Vector3(0, 0, -1))
  const lookTarget = useRef(
    new Vector3(0, INITIAL_PLAYER_RADIUS * 0.72, 0),
  )
  const desiredLookTarget = useRef(new Vector3())
  const rollAxis = useRef(new Vector3())
  const rollQuaternion = useRef(new Quaternion())
  const previousPosition = useRef(
    new Vector3(...spawnTranslation),
  )
  const lastMapUpdate = useRef(0)
  const motion = useRef<MotionState>({
    x: 0,
    z: -1,
    speed: 0,
    velocityX: 0,
    velocityZ: 0,
    boost: 1,
    impact: 0,
    surface: null,
  })

  useEffect(() => {
    collectedSet.current = new Set(collectedIds)
  }, [collectedIds])

  useEffect(() => {
    if (!paused || !playerBody.current) return
    playerBody.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
    playerBody.current.resetForces(true)
  }, [paused])

  useEffect(() => {
    const body = playerBody.current
    if (!body || !debugCollectionTarget) return
    let targetX = debugCollectionTarget.position[0]
    let targetZ = debugCollectionTarget.position[2]
    if (debugTeleportMode === 'cone') {
      const nearestCone = physicsLayout.pushableProps
        .filter((prop) => prop.kind === 'cone')
        .sort(
          (left, right) =>
            Math.hypot(
              targetX - left.x,
              targetZ - left.z,
            ) -
            Math.hypot(
              targetX - right.x,
              targetZ - right.z,
            ),
        )[0]
      if (nearestCone) {
        const awayX = targetX - nearestCone.x
        const awayZ = targetZ - nearestCone.z
        const distance = Math.max(0.001, Math.hypot(awayX, awayZ))
        targetX += (awayX / distance) * 0.72
        targetZ += (awayZ / distance) * 0.72
      }
    }
    const translation = getPlayerSpawnTranslation(
      targetX,
      targetZ,
    )
    translation[1] += debugCollectionTarget.position[1]
    body.setTranslation(
      { x: translation[0], y: translation[1], z: translation[2] },
      true,
    )
    playerPosition.current.set(...translation)
    previousPosition.current.set(...translation)
  }, [
    debugCollectionTarget,
    debugTeleportMode,
    physicsLayout.pushableProps,
  ])

  useEffect(() => {
    const body = playerBody.current
    if (!body || !debugPowerUpTarget) return
    const translation = getPlayerSpawnTranslation(
      debugPowerUpTarget.position[0],
      debugPowerUpTarget.position[2],
    )
    body.setTranslation(
      { x: translation[0], y: translation[1], z: translation[2] },
      true,
    )
    playerPosition.current.set(...translation)
    previousPosition.current.set(...translation)
  }, [debugPowerUpTarget])

  useEffect(() => {
    const body = playerBody.current
    if (!body || !debugTreasureTarget) return
    const translation = getPlayerSpawnTranslation(
      debugTreasureTarget.position[0],
      debugTreasureTarget.position[2],
    )
    body.setTranslation(
      { x: translation[0], y: translation[1], z: translation[2] },
      true,
    )
    playerPosition.current.set(...translation)
    previousPosition.current.set(...translation)
  }, [debugTreasureTarget])

  useEffect(() => {
    const canvas = gl.domElement
    const orbit = cameraOrbit.current

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return
      event.preventDefault()
      orbit.pointerId = event.pointerId
      orbit.pointerButton = event.button
      orbit.lastX = event.clientX
      orbit.lastY = event.clientY
      orbit.manualUntil = Number.POSITIVE_INFINITY
      canvas.setPointerCapture(event.pointerId)
      canvas.classList.add('is-camera-dragging')
    }
    const stopOrbit = () => {
      orbit.pointerId = null
      orbit.pointerButton = null
      orbit.manualUntil = performance.now() + 5200
      canvas.classList.remove('is-camera-dragging')
    }
    const handlePointerMove = (event: PointerEvent) => {
      if (orbit.pointerId !== event.pointerId) return
      const expectedButtonMask = orbit.pointerButton === 2 ? 2 : 1
      if (event.pointerType === 'mouse' && !(event.buttons & expectedButtonMask)) {
        stopOrbit()
        return
      }
      event.preventDefault()
      const deltaX = event.clientX - orbit.lastX
      const deltaY = event.clientY - orbit.lastY
      orbit.lastX = event.clientX
      orbit.lastY = event.clientY

      const currentAngle = Math.atan2(
        cameraTargetDirection.current.x,
        cameraTargetDirection.current.z,
      )
      const nextAngle = currentAngle - deltaX * 0.006
      cameraTargetDirection.current.set(
        Math.sin(nextAngle),
        0,
        Math.cos(nextAngle),
      )
      orbit.pitch = MathUtils.clamp(
        orbit.pitch - deltaY * 0.012,
        -1.1,
        3.2,
      )
    }
    const finishPointer = (event: PointerEvent) => {
      if (orbit.pointerId !== event.pointerId) return
      stopOrbit()
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }
    }
    const handleLostPointerCapture = (event: PointerEvent) => {
      if (orbit.pointerId === event.pointerId) stopOrbit()
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      orbit.zoom = MathUtils.clamp(
        orbit.zoom + event.deltaY * 0.0012,
        0.62,
        1.75,
      )
      orbit.manualUntil = performance.now() + 5200
    }
    const preventContextMenu = (event: MouseEvent) => event.preventDefault()

    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('lostpointercapture', handleLostPointerCapture)
    window.addEventListener('pointermove', handlePointerMove, {
      capture: true,
      passive: false,
    })
    window.addEventListener('pointerup', finishPointer, true)
    window.addEventListener('pointercancel', finishPointer, true)
    window.addEventListener('blur', stopOrbit)
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('contextmenu', preventContextMenu)

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener(
        'lostpointercapture',
        handleLostPointerCapture,
      )
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('pointerup', finishPointer, true)
      window.removeEventListener('pointercancel', finishPointer, true)
      window.removeEventListener('blur', stopOrbit)
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('contextmenu', preventContextMenu)
      canvas.classList.remove('is-camera-dragging')
    }
  }, [gl])

  const handleCollisionEnter = ({ other }: CollisionEnterPayload) => {
    const physics = (
      other.rigidBodyObject?.userData.physics ??
      other.colliderObject?.userData.physics
    ) as PhysicsBodyData | undefined
    const body = playerBody.current
    if (!body || !physics || physics.kind === 'floor') return

    const velocity = body.linvel()
    const isRideable =
      physics.kind === 'rideable' || physics.kind === 'elevator'
    if (
      physics.response === 'stop' &&
      !isRideable
    ) {
      body.setLinvel({ x: 0, y: velocity.y, z: 0 }, true)
    }

    motion.current.impact = physics.quiet ? 0.42 : 1
    const now = performance.now()
    if (!isRideable) {
      const recoveryDuration =
        physics.kind === 'dynamic-prop'
          ? 90
          : physics.response === 'bounce'
            ? 260
            : 190
      collisionRecoveryUntil.current = Math.max(
        collisionRecoveryUntil.current,
        now + recoveryDuration,
      )
    }
    if (physics.quiet || now < collisionFeedbackCooldown.current) return
    collisionFeedbackCooldown.current = now + 900
    onPhysicsFeedback({
      type: 'collision',
      label: physics.label,
      bounced: physics.response === 'bounce',
    })
  }

  useFrame((state, delta) => {
    const body = playerBody.current
    if (!body) return

    if (
      Math.abs(previousBallRadius.current - ballRadius) > 0.0001
    ) {
      const collider = playerCollider.current
      if (body.isValid() && collider?.isValid()) {
        const growthPosition = body.translation()
        const velocity = body.linvel()
        const nextPosition = preservePlayerFootHeightWhileGrowing(
          growthPosition,
          previousBallRadius.current,
          ballRadius,
        )
        collider.setRadius(getPlayerColliderRadius(ballRadius))
        body.recomputeMassPropertiesFromColliders()
        if (nextPosition.y !== growthPosition.y) {
          body.setTranslation(nextPosition, false)
          body.setLinvel(velocity, true)
        }
        playerPosition.current.set(
          nextPosition.x,
          nextPosition.y,
          nextPosition.z,
        )
        previousPosition.current.set(
          nextPosition.x,
          nextPosition.y,
          nextPosition.z,
        )
        previousBallRadius.current = ballRadius
      }
    }

    const position = body.translation()
    playerPosition.current.set(position.x, position.y, position.z)
    const velocity = body.linvel()
    if (!paused) {
      const lateralInput =
        (keys.current.right ? 1 : 0) -
        (keys.current.left ? 1 : 0) +
        controlVector.x
      const forwardInput =
        (keys.current.forward ? 1 : 0) -
        (keys.current.backward ? 1 : 0) -
        controlVector.z +
        (debugAutoDrive ? 0.15 : 0)
      const driveStep = stepRelativeDrive(
        {
          x: cameraDirection.current.x,
          z: cameraDirection.current.z,
        },
        lateralInput,
        forwardInput,
      )
      const rollingStep = stepRollingMotion(
        {
          velocityX: motion.current.velocityX,
          velocityZ: motion.current.velocityZ,
        },
        driveStep.moveX,
        driveStep.moveZ,
        ballRadius,
        delta,
      )
      const inputStrength = Math.hypot(driveStep.moveX, driveStep.moveZ)
      if (
        forwardInput >= 0 &&
        inputStrength > 0.05 &&
        rollingStep.speedRatio > 0.04
      ) {
        heading.current.x = MathUtils.damp(
          heading.current.x,
          rollingStep.directionX,
          4.6,
          delta,
        )
        heading.current.z = MathUtils.damp(
          heading.current.z,
          rollingStep.directionZ,
          4.6,
          delta,
        )
        heading.current.normalize()
      }
      const speedZone = getActiveSpeedZone(
        physicsLayout,
        position.x,
        position.z,
      )
      const surfaceZone = getActiveSurfaceZone(
        physicsLayout,
        position.x,
        position.z,
      )
      const speedMultiplier =
        (speedZone?.multiplier ?? 1) *
        (surfaceZone?.multiplier ?? 1) *
        getPowerUpSpeedMultiplier(activePowerUps)
      motion.current.surface = surfaceZone?.kind ?? null
      const recovering =
        performance.now() < collisionRecoveryUntil.current

      if (recovering) {
        const physicalSpeed = Math.hypot(velocity.x, velocity.z)
        motion.current.velocityX = velocity.x / speedMultiplier
        motion.current.velocityZ = velocity.z / speedMultiplier
        motion.current.speed = Math.min(
          1.35,
          physicalSpeed / getRollingTopSpeed(ballRadius),
        )
      } else {
        body.setLinvel(
          {
            x: rollingStep.velocityX * speedMultiplier,
            y: velocity.y,
            z: rollingStep.velocityZ * speedMultiplier,
          },
          true,
        )
        motion.current.velocityX = rollingStep.velocityX
        motion.current.velocityZ = rollingStep.velocityZ
        motion.current.speed = Math.min(
          1.35,
          rollingStep.speedRatio * speedMultiplier,
        )
      }

      const speedRatio = motion.current.speed
      motion.current.x = heading.current.x
      motion.current.z = heading.current.z
      motion.current.speed = speedRatio
      motion.current.boost = speedMultiplier
      motion.current.impact = Math.max(
        0,
        motion.current.impact - delta * 4.5,
      )

      const nextSpeedZoneId = speedZone?.id ?? null
      if (
        nextSpeedZoneId &&
        nextSpeedZoneId !== activeSpeedZoneId.current &&
        speedRatio > 0.16 &&
        state.clock.elapsedTime >= physicsFeedbackCooldown.current
      ) {
        physicsFeedbackCooldown.current = state.clock.elapsedTime + 1.1
        onPhysicsFeedback({
          type: 'boost',
          label: speedZone?.label ?? '스피드 길',
        })
      }
      activeSpeedZoneId.current =
        nextSpeedZoneId && speedRatio > 0.16
          ? nextSpeedZoneId
          : null

      const nextSurfaceZoneId = surfaceZone?.id ?? null
      if (
        nextSurfaceZoneId &&
        nextSurfaceZoneId !== activeSurfaceZoneId.current &&
        rollingStep.speedRatio > 0.12 &&
        state.clock.elapsedTime >= physicsFeedbackCooldown.current
      ) {
        physicsFeedbackCooldown.current = state.clock.elapsedTime + 1.1
        onPhysicsFeedback({
          type: 'slow',
          label: surfaceZone?.label ?? '천천히 구간',
          surfaceKind: surfaceZone?.kind,
        })
      }
      activeSurfaceZoneId.current = nextSurfaceZoneId

      const traveled = Math.hypot(
        position.x - previousPosition.current.x,
        position.z - previousPosition.current.z,
      )
      if (orb.current && traveled > 0.0001 && traveled < 2) {
        rollAxis.current
          .set(
            (position.z - previousPosition.current.z) / traveled,
            0,
            -(position.x - previousPosition.current.x) / traveled,
          )
          .normalize()
        rollQuaternion.current.setFromAxisAngle(
          rollAxis.current,
          traveled / Math.max(0.3, ballRadius),
        )
        orb.current.quaternion.premultiply(rollQuaternion.current)
      }

      for (const item of objects) {
        if (collectedSet.current.has(item.id)) continue

        const runtimePosition = getRuntimeItemPosition(
          runtimeItemPositions.current,
          item,
        )
        if (
          magnetActive &&
          canMagnetAttract(
            position,
            ballRadius,
            runtimePosition,
            item.size,
            physicsLayout.obstacles,
          )
        ) {
          const targetPosition = stepMagnetPosition(
            runtimePosition,
            {
              x: position.x,
              y:
                position.y -
                getObjectVisualScale(item.size) * 0.58,
              z: position.z,
            },
            delta,
          )
          runtimePosition.set(
            targetPosition.x,
            targetPosition.y,
            targetPosition.z,
          )
        }
        const runtimeItem = {
          ...item,
          position: [
            runtimePosition.x,
            runtimePosition.y,
            runtimePosition.z,
          ] as [number, number, number],
        }
        const collectionAssist = getPushableCollectionAssist(
          runtimeItem,
          physicsLayout.pushableProps,
        )
        const touchesItem = isObjectTouchingBall(
          position,
          ballRadius + collectionAssist,
          runtimeItem,
        )

        if (touchesItem && canCollect(ballRadius, item.size)) {
          collectedSet.current.add(item.id)
          onCollect(item)
        } else if (touchesItem) {
          if (state.clock.elapsedTime > tooLargeCooldown.current) {
            tooLargeCooldown.current = state.clock.elapsedTime + 1.7
            onTooLarge(item)
          }
        }
      }

      for (const treasure of radarTreasures) {
        if (collectedSet.current.has(treasure.id)) continue
        const runtimePosition = getRuntimeItemPosition(
          runtimeTreasurePositions.current,
          treasure,
        )
        if (
          magnetActive &&
          canMagnetAttract(
            position,
            ballRadius,
            runtimePosition,
            treasure.size,
            physicsLayout.obstacles,
          )
        ) {
          const targetPosition = stepMagnetPosition(
            runtimePosition,
            {
              x: position.x,
              y:
                position.y -
                getObjectVisualScale(treasure.size) * 0.58,
              z: position.z,
            },
            delta,
          )
          runtimePosition.set(
            targetPosition.x,
            targetPosition.y,
            targetPosition.z,
          )
        }
        const runtimeTreasure = {
          ...treasure,
          position: [
            runtimePosition.x,
            runtimePosition.y,
            runtimePosition.z,
          ] as [number, number, number],
        }
        if (isObjectTouchingBall(position, ballRadius, runtimeTreasure)) {
          collectedSet.current.add(treasure.id)
          onCollect(treasure)
        }
      }

      for (const pickup of powerUpPickups) {
        if (collectedPowerUpSet.current.has(pickup.id)) continue
        if (!isPowerUpTouchingBall(position, ballRadius, pickup)) continue
        collectedPowerUpSet.current.add(pickup.id)
        onPowerUpCollect(pickup)
      }
    }

    previousPosition.current.set(position.x, position.y, position.z)

    if (
      cameraOrbit.current.pointerId === null &&
      performance.now() >= cameraOrbit.current.manualUntil
    ) {
      cameraTargetDirection.current.x = MathUtils.damp(
        cameraTargetDirection.current.x,
        heading.current.x,
        2.6,
        delta,
      )
      cameraTargetDirection.current.z = MathUtils.damp(
        cameraTargetDirection.current.z,
        heading.current.z,
        2.6,
        delta,
      )
      cameraTargetDirection.current.normalize()
    }
    cameraDirection.current.x = MathUtils.damp(
      cameraDirection.current.x,
      cameraTargetDirection.current.x,
      8.2,
      delta,
    )
    cameraDirection.current.z = MathUtils.damp(
      cameraDirection.current.z,
      cameraTargetDirection.current.z,
      8.2,
      delta,
    )
    cameraDirection.current.normalize()

    const cameraDistance =
      (4.8 + ballRadius * 1.6) * cameraOrbit.current.zoom
    const elevation = Math.max(0, position.y - ballRadius)
    cameraPosition.current.set(
      position.x - cameraDirection.current.x * cameraDistance,
      3.2 +
        ballRadius * 1.35 +
        elevation +
        cameraOrbit.current.pitch +
        (cameraOrbit.current.zoom - 1) * 1.35,
      position.z - cameraDirection.current.z * cameraDistance,
    )
    if (!reducedMotion && motion.current.impact > 0) {
      const shake =
        Math.sin(state.clock.elapsedTime * 58) * motion.current.impact * 0.075
      cameraPosition.current.x += shake
      cameraPosition.current.y += Math.abs(shake) * 0.5
    }
    camera.position.lerp(cameraPosition.current, reducedMotion ? 0.18 : 0.1)
    desiredLookTarget.current.set(
      position.x + cameraDirection.current.x * ballRadius * 0.7,
      ballRadius * 0.72 + elevation,
      position.z + cameraDirection.current.z * ballRadius * 0.7,
    )
    lookTarget.current.x = MathUtils.damp(
      lookTarget.current.x,
      desiredLookTarget.current.x,
      18,
      delta,
    )
    lookTarget.current.y = MathUtils.damp(
      lookTarget.current.y,
      desiredLookTarget.current.y,
      18,
      delta,
    )
    lookTarget.current.z = MathUtils.damp(
      lookTarget.current.z,
      desiredLookTarget.current.z,
      18,
      delta,
    )
    camera.lookAt(lookTarget.current)

    if (state.clock.elapsedTime - lastMapUpdate.current >= 0.12) {
      lastMapUpdate.current = state.clock.elapsedTime
      onPlayerPosition({
        x: position.x,
        z: position.z,
        headingX: heading.current.x,
        headingZ: heading.current.z,
      })
    }

  })

  const visibleObjects = objects.filter(
    (item) => !collectedIds.includes(item.id),
  )
  const collectedObjects = attachedObjects

  return (
    <>
      <color attach="background" args={[stage.skyColor]} />
      <fog
        attach="fog"
        args={[stage.fogColor, stage.mapSize * 0.48, stage.mapSize * 1.08]}
      />
      <ambientLight intensity={stage.theme === 'starlight-river' ? 1.1 : 1.45} />
      <directionalLight
        castShadow
        position={[6, 12, 8]}
        intensity={stage.theme === 'starlight-river' ? 1.45 : 2.1}
        color={new Color(
          stage.theme === 'starlight-river' ? '#BFD4FF' : '#FFF3D0',
        )}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight
        args={[
          stage.theme === 'starlight-river' ? '#9BB8FF' : '#E6F6FF',
          stage.theme === 'starlight-river' ? '#263B45' : '#77A869',
          1.1,
        ]}
      />

      <GardenSetDressing floorSize={stage.mapSize} theme={stage.theme} />
      <RapierWorldColliders
        mapSize={stage.mapSize}
        layout={physicsLayout}
        reducedMotion={reducedMotion}
      />
      <DynamicPracticeProps
        stageId={stage.id}
        props={physicsLayout.pushableProps}
      />
      {physicsLayout.elevators.map((elevator) => (
        <KinematicElevator
          key={`${stage.id}-${elevator.id}`}
          elevator={elevator}
          playerPosition={playerPosition}
          ballRadius={ballRadius}
          paused={paused}
          onActivate={(label) =>
            onPhysicsFeedback({
              type: 'elevator',
              label,
            })
          }
        />
      ))}

      {visibleObjects.map((item) => (
        <LearningItem
          key={item.id}
          item={item}
          reducedMotion={reducedMotion}
          available={canCollect(ballRadius, item.size)}
          runtimePositions={runtimeItemPositions}
        />
      ))}
      <TooLargeItemColliders
        items={visibleObjects}
        ballRadius={ballRadius}
      />
      {powerUpPickups.map((pickup) => (
        <PowerUpPickupMesh
          key={pickup.id}
          pickup={pickup}
          reducedMotion={reducedMotion}
        />
      ))}
      {radarTreasures.map((treasure) => (
        <RadarTreasureItem
          key={treasure.id}
          item={treasure}
          runtimePositions={runtimeTreasurePositions}
          reducedMotion={reducedMotion}
        />
      ))}

      <RigidBody
        key={stage.id}
        ref={playerBody}
        name="rolling-player"
        colliders={false}
        position={spawnTranslation}
        gravityScale={1}
        enabledTranslations={[true, true, true]}
        enabledRotations={[false, false, false]}
        linearDamping={0.12}
        angularDamping={1}
        canSleep={false}
        ccd
        onCollisionEnter={handleCollisionEnter}
      >
        <BallCollider
          ref={playerCollider}
          args={[INITIAL_PLAYER_RADIUS]}
          friction={0.88}
          restitution={0.04}
        />
        <group ref={orb} name="rolling-orb">
          <RollingBallCore
            ballRadius={ballRadius}
            reducedMotion={reducedMotion}
          />
          {collectedObjects.map((item, index) => (
            <AttachedObjectMesh
              key={item.id}
              item={item}
              index={index}
              orbRadius={ballRadius}
              slotCount={64}
            />
          ))}
        </group>
        <MotionEffects
          ballRadius={ballRadius}
          motion={motion}
          reducedMotion={reducedMotion}
          speedPowerUpActive={speedPowerUpActive}
        />
        <MagnetFieldEffect
          ballRadius={ballRadius}
          active={magnetActive}
          reducedMotion={reducedMotion}
        />
        <ChildPusher
          ballRadius={ballRadius}
          motion={motion}
          reducedMotion={reducedMotion}
        />
      </RigidBody>
      <WaterContactEffects
        playerPosition={playerPosition}
        ballRadius={ballRadius}
        motion={motion}
        reducedMotion={reducedMotion}
      />
    </>
  )
}

export function GameCanvas(props: GameCanvasProps) {
  return (
    <Canvas
      className="game-canvas"
      shadows
      dpr={[1, 1.7]}
      camera={{ position: [0, 7, 8], fov: 48, near: 0.1, far: 240 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
    >
      <Suspense fallback={null}>
        <Physics
          gravity={[0, -16, 0]}
          paused={props.paused}
          timeStep={1 / 60}
          numSolverIterations={8}
          maxCcdSubsteps={4}
        >
          <GameWorld {...props} />
        </Physics>
      </Suspense>
    </Canvas>
  )
}
