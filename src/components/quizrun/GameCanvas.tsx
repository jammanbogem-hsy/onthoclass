import { Clone, Html, useGLTF } from '@react-three/drei'
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
  useMemo,
  useRef,
  useState,
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
import type {
  AttachmentNormal,
  GameStage,
  LearningObject,
} from '@/lib/quizrun-engine/types'
import {
  getArchitectureCameraDistanceOffset,
  getArchitectureCameraFramingLift,
  getArchitectureCameraMinimumDistance,
  getArchitectureScaleClass,
  getTierFourCameraDistanceOffset,
  getWorldObjectVisualScale,
} from '@/lib/quizrun-engine/collectibleScale'
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
import { getItemDisplayLabel } from '@/lib/quizrun-engine/itemPresentation'
import { getLevelUpBadgeHeightMultiplier } from '@/lib/quizrun-engine/levelUpAssets'
import { STRUCTURED_COLLECTIBLE_ASSETS } from '@/lib/quizrun-engine/structuredCollectibleAssets'
import {
  getCappedRollingSpeedMultiplier,
  getRollingTopSpeed,
  stepRollingMotion,
} from '@/lib/quizrun-engine/rollingMotion'
import {
  createHazardKnockback,
  type HazardKind,
} from '@/lib/quizrun-engine/hazardImpact'
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
  CAMERA_DRAG_PITCH_SENSITIVITY,
  CAMERA_DRAG_YAW_SENSITIVITY,
  getPinchZoomTarget,
  getWheelZoomTarget,
} from '@/lib/quizrun-engine/cameraControl'
import {
  canMagnetAttract,
  getPowerUpSpeedMultiplier,
  getPowerUpVisualScale,
  isPowerUpTouchingBall,
  MAGNET_PULL_RADIUS,
  POWER_UP_RESPAWN_DELAY_MS,
  stepMagnetPosition,
  type ActivePowerUps,
  type PowerUpPickup,
} from '@/lib/quizrun-engine/powerUps'
import {
  getRecommendedRenderQuality,
  readDeviceRenderProfile,
  selectNearbyObjects,
  type RenderQuality,
} from '@/lib/quizrun-engine/renderQuality'
import {
  getStageLightingProfile,
  type StageLightingProfile,
} from '@/lib/quizrun-engine/stageLighting'
import type { DroppedLearningObject } from '@/lib/quizrun-engine/polarBearEncounter'
import { MaterialIcon } from './MaterialIcon'
import {
  AttachedObjectMesh,
  GardenSetDressing,
  LearningObjectMesh,
  NaturalObstacleModels,
} from './game/GameSceneAssets'
import { RollingCrewCharacter } from './game/RollingCrewCharacter'
import { RoamingRunnerObstacles } from './game/RoamingRunnerObstacles'
import {
  blueTrashCanUrl,
  coneRedV1Url,
  coneRedV2Url,
  coneRedV3Url,
  magnetBatteryUrl,
  rollingBallUrl,
  shippingBoxUrl,
  speedBootUrl,
  treasureRadarUrl,
} from '@/lib/quizrun-engine/data/modelUrls'

const POWER_UP_RAINBOW = [
  '#FF5B5B',
  '#FF9F43',
  '#FFE45E',
  '#45D483',
  '#4DA3FF',
  '#A66BFF',
] as const

interface GameCanvasProps {
  stage: GameStage
  stageObjects: LearningObject[]
  attachedObjects: LearningObject[]
  droppedObjects: DroppedLearningObject[]
  attachmentNormals: Record<string, AttachmentNormal>
  collectedIds: string[]
  ballRadius: number
  illuminationProgress: number
  paused: boolean
  reducedMotion: boolean
  controlVector: ControlVector
  activePowerUps: ActivePowerUps
  powerUpPickups: PowerUpPickup[]
  radarTreasures: LearningObject[]
  onPlayerPosition: (pose: PlayerMapPose) => void
  onCollect: (
    item: LearningObject,
    attachmentNormal: AttachmentNormal,
  ) => void
  onPowerUpCollect: (pickup: PowerUpPickup) => void
  onRecoverDropped: (item: LearningObject) => void
  onRunnerHit: (
    position: { x: number; z: number },
    runnerId: string,
  ) => boolean
  onPolarBearHit: (position: { x: number; z: number }) => boolean
  onTooLarge: (item: LearningObject) => void
  onPhysicsFeedback: (feedback: {
    type: 'collision' | 'boost' | 'slow' | 'slide' | 'elevator'
    label: string
    bounced?: boolean
    surfaceKind?: SurfaceKind
  }) => void
}

function getLocalAttachmentNormal(
  ballPosition: { x: number; y: number; z: number },
  item: Pick<LearningObject, 'position' | 'size'>,
  orbRotation: Quaternion | undefined,
  fallbackDirection: Pick<MotionState, 'x' | 'z'>,
): AttachmentNormal {
  const normal = new Vector3(
    item.position[0] - ballPosition.x,
    item.position[1] +
      getObjectVisualScale(item.size) * 0.58 -
      ballPosition.y,
    item.position[2] - ballPosition.z,
  )

  if (normal.lengthSq() < 0.000001) {
    normal.set(fallbackDirection.x, 0, fallbackDirection.z)
  }
  if (normal.lengthSq() < 0.000001) normal.set(0, 1, 0)
  normal.normalize()

  if (orbRotation) {
    normal.applyQuaternion(orbRotation.clone().invert()).normalize()
  }

  return [
    Number(normal.x.toFixed(6)),
    Number(normal.y.toFixed(6)),
    Number(normal.z.toFixed(6)),
  ]
}

export interface PlayerMapPose {
  x: number
  y: number
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
const PUSHABLE_CONE_URLS = [
  coneRedV1Url,
  coneRedV2Url,
  coneRedV3Url,
] as const

function getStableConeModelUrl(propId: string): string {
  let hash = 2166136261
  for (const character of propId) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return PUSHABLE_CONE_URLS[(hash >>> 0) % PUSHABLE_CONE_URLS.length]
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
  slip: number
}

interface CameraOrbitState {
  zoom: number
  targetZoom: number
  pitch: number
  pointerId: number | null
  pointerButton: number | null
  lastX: number
  lastY: number
  activeTouches: Map<number, { x: number; y: number }>
  pinchDistance: number | null
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
    | 'moving-obstacle'
    | 'player'
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
  recoverable = false,
}: {
  item: LearningObject
  reducedMotion: boolean
  available: boolean
  runtimePositions?: MutableRefObject<Map<string, Vector3>>
  recoverable?: boolean
}) {
  const root = useRef<Group>(null)
  const runtimePosition = useRef(new Vector3(...item.position))
  const visual = useRef<Group>(null)
  const badge = useRef<HTMLSpanElement>(null)
  const badgeVisible = useRef<boolean | null>(null)
  const tier = getSizeTier(item.size)
  const visualScale = getWorldObjectVisualScale(item)
  const architectureScaleClass = getArchitectureScaleClass(item)
  const badgeHeightMultiplier = architectureScaleClass
    ? architectureScaleClass === 'stadium'
      ? 0.86
      : 1.15
    : getLevelUpBadgeHeightMultiplier(item)
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
              color={
                recoverable
                  ? '#FF6B3D'
                  : available
                    ? tier.color
                    : SUBJECT_COLORS[item.subject]
              }
              transparent
              opacity={recoverable ? 0.76 : available ? 0.52 : 0.2}
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
        position={[0, visualScale * badgeHeightMultiplier, 0]}
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
          {getItemDisplayLabel(item)}
          <i>
            <MaterialIcon name={available ? 'check' : 'arrow_upward'} />
          </i>
        </span>
      </Html>
    </group>
  )
})

const DroppedObjectPhysics = memo(function DroppedObjectPhysics({
  item,
  runtimePositions,
  playerPosition,
  ballRadius,
  magnetActive,
  obstacles,
  reducedMotion,
}: {
  item: DroppedLearningObject
  runtimePositions: MutableRefObject<Map<string, Vector3>>
  playerPosition: MutableRefObject<Vector3>
  ballRadius: number
  magnetActive: boolean
  obstacles: WorldPhysicsLayout['obstacles']
  reducedMotion: boolean
}) {
  const body = useRef<RapierRigidBody>(null)
  const recoveryMarker = useRef<Group>(null)
  const landingEffect = useRef<Group>(null)
  const landingMaterial = useRef<MeshBasicMaterial>(null)
  const landingPulse = useRef(0)
  const hasLanded = useRef(false)
  const age = useRef(0)
  const visualScale = getWorldObjectVisualScale(item)
  const collisionRadius = Math.max(0.16, Math.min(0.72, item.size * 0.52))
  const collectionCenterOffset = getObjectVisualScale(item.size) * 0.58
  const runtimePosition = useRef(
    new Vector3(
      item.dropMotion.origin[0],
      item.dropMotion.origin[1] - collectionCenterOffset,
      item.dropMotion.origin[2],
    ),
  )

  useEffect(() => {
    const positions = runtimePositions.current
    positions.set(item.id, runtimePosition.current)
    const rigidBody = body.current
    if (rigidBody) {
      rigidBody.setLinvel(
        {
          x: item.dropMotion.linearVelocity[0],
          y: item.dropMotion.linearVelocity[1],
          z: item.dropMotion.linearVelocity[2],
        },
        true,
      )
      rigidBody.setAngvel(
        {
          x: item.dropMotion.angularVelocity[0],
          y: item.dropMotion.angularVelocity[1],
          z: item.dropMotion.angularVelocity[2],
        },
        true,
      )
    }
    return () => {
      positions.delete(item.id)
    }
  }, [item, runtimePositions])

  useFrame((_, delta) => {
    const rigidBody = body.current
    if (!rigidBody || !rigidBody.isValid()) return
    age.current += delta

    let translation = rigidBody.translation()
    runtimePosition.current.set(
      translation.x,
      translation.y - collectionCenterOffset,
      translation.z,
    )
    recoveryMarker.current?.position.set(
      translation.x,
      translation.y,
      translation.z,
    )

    if (
      magnetActive &&
      age.current > 0.42 &&
      canMagnetAttract(
        playerPosition.current,
        ballRadius,
        runtimePosition.current,
        item.size,
        obstacles,
      )
    ) {
      const attracted = stepMagnetPosition(
        runtimePosition.current,
        {
          x: playerPosition.current.x,
          y: playerPosition.current.y - collectionCenterOffset,
          z: playerPosition.current.z,
        },
        delta,
      )
      rigidBody.setTranslation(
        {
          x: attracted.x,
          y: attracted.y + collectionCenterOffset,
          z: attracted.z,
        },
        true,
      )
      rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
      translation = rigidBody.translation()
      runtimePosition.current.set(
        translation.x,
        translation.y - collectionCenterOffset,
        translation.z,
      )
    }

    if (landingPulse.current > 0) {
      landingPulse.current = Math.max(0, landingPulse.current - delta * 2.8)
      const progress = 1 - landingPulse.current
      landingEffect.current?.scale.setScalar(0.45 + progress * 1.55)
      if (landingMaterial.current) {
        landingMaterial.current.opacity = landingPulse.current * 0.42
      }
    }
  })

  const handleLanding = ({ other }: CollisionEnterPayload) => {
    if (age.current < 0.1 || hasLanded.current) return
    const physics = (
      other.rigidBodyObject?.userData.physics ??
      other.colliderObject?.userData.physics
    ) as PhysicsBodyData | undefined
    if (physics?.kind !== 'floor') return
    const translation = body.current?.translation()
    if (!translation) return
    hasLanded.current = true
    if (reducedMotion) return
    landingEffect.current?.position.set(translation.x, 0.025, translation.z)
    landingPulse.current = 1
  }

  const physics: PhysicsBodyData = {
    kind: 'dynamic-prop',
    label: item.label,
    response: 'bounce',
    quiet: true,
  }

  return (
    <>
      <RigidBody
        ref={body}
        colliders={false}
        position={item.dropMotion.origin}
        linearDamping={0.46}
        angularDamping={0.62}
        canSleep
        ccd
        userData={{ physics }}
        onCollisionEnter={handleLanding}
      >
        <BallCollider
          args={[collisionRadius]}
          friction={0.84}
          restitution={0.38}
        />
        <group scale={visualScale}>
          <LearningObjectMesh item={item} detail="world" />
        </group>
      </RigidBody>
      <group ref={recoveryMarker} position={item.dropMotion.origin}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -collisionRadius + 0.025, 0]}>
          <ringGeometry
            args={[
              collisionRadius * 1.12,
              collisionRadius * 1.42,
              28,
            ]}
          />
          <meshBasicMaterial
            color="#FF6B3D"
            transparent
            opacity={0.72}
            depthWrite={false}
          />
        </mesh>
        <Html
          center
          position={[0, collisionRadius + 0.58, 0]}
          distanceFactor={8}
          zIndexRange={[1, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <span
            aria-hidden="true"
            className="world-size-badge is-available"
            style={{ '--tier-color': '#FF6B3D' } as CSSProperties}
          >
            <b>{getSizeTier(item.size).level}</b>
            다시 줍기 · {getItemDisplayLabel(item)}
            <i><MaterialIcon name="replay" /></i>
          </span>
        </Html>
      </group>
      {!reducedMotion && (
        <group ref={landingEffect} visible position={[0, -10, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.18, 0.48, 28]} />
            <meshBasicMaterial
              ref={landingMaterial}
              color="#D7C7A4"
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
    </>
  )
})

function TreasureRadarModel() {
  const { scene } = useGLTF(treasureRadarUrl)

  return (
    <Clone
      object={scene}
      position={[0, -0.32, 0]}
      castShadow
      receiveShadow
    />
  )
}

useGLTF.preload(treasureRadarUrl)

function SpeedBootModel() {
  const { scene } = useGLTF(speedBootUrl)

  return (
    <Clone
      object={scene}
      rotation={[0, -0.22, 0]}
      castShadow
      receiveShadow
    />
  )
}

useGLTF.preload(speedBootUrl)

function MagnetBatteryModel() {
  const { scene } = useGLTF(magnetBatteryUrl)

  return <Clone object={scene} castShadow receiveShadow />
}

useGLTF.preload(magnetBatteryUrl)

function PowerUpPickupMesh({
  pickup,
  reducedMotion,
}: {
  pickup: PowerUpPickup
  reducedMotion: boolean
}) {
  const visual = useRef<Group>(null)
  const halo = useRef<Group>(null)
  const baseVisualScale = getPowerUpVisualScale(pickup.kind)

  useFrame(({ clock }, delta) => {
    const materializeProgress =
      pickup.collectibleAt <= 0
        ? 1
        : MathUtils.clamp(
            1 -
              (pickup.collectibleAt - Date.now()) /
                POWER_UP_RESPAWN_DELAY_MS,
            0,
            1,
          )
    const easedProgress =
      reducedMotion
        ? 1
        : 1 - Math.pow(1 - materializeProgress, 3)

    if (visual.current) {
      visual.current.rotation.y += reducedMotion ? 0 : delta * 1.15
      visual.current.position.y = reducedMotion
        ? 0.7
        : 0.7 + Math.sin(clock.elapsedTime * 2.2) * 0.08
      visual.current.scale.setScalar(
        baseVisualScale * (0.25 + easedProgress * 0.75),
      )
    }
    if (halo.current) {
      const pulse = reducedMotion
        ? 1
        : 1 + Math.sin(clock.elapsedTime * 3.4) * 0.12
      halo.current.scale.setScalar(
        pulse * (0.45 + easedProgress * 0.55),
      )
      if (!reducedMotion) halo.current.rotation.y += delta * 0.72
    }
  })

  const label =
    pickup.kind === 'magnet'
      ? '자석 배터리'
      : pickup.kind === 'radar'
        ? '보물 레이더'
        : '신속의 장화'

  return (
    <group position={pickup.position}>
      <group
        ref={halo}
        position={[0, 0.04, 0]}
      >
        {POWER_UP_RAINBOW.map((rainbowColor, index) => (
          <mesh key={rainbowColor} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry
              args={[
                0.72,
                0.9,
                12,
                1,
                (index / POWER_UP_RAINBOW.length) * Math.PI * 2,
                Math.PI / 3 + 0.045,
              ]}
            />
            <meshBasicMaterial
              color={rainbowColor}
              transparent
              opacity={0.92}
              toneMapped={false}
            />
          </mesh>
        ))}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]}>
          <ringGeometry args={[0.9, 0.96, 48]} />
          <meshBasicMaterial
            color="#FFFFFF"
            transparent
            opacity={0.34}
            toneMapped={false}
          />
        </mesh>
      </group>
      <group
        ref={visual}
        position={[0, 0.7, 0]}
        scale={baseVisualScale}
      >
        {pickup.kind === 'magnet' && <MagnetBatteryModel />}
        {pickup.kind === 'radar' && <TreasureRadarModel />}
        {pickup.kind === 'speed' && <SpeedBootModel />}
      </group>
      <Html
        center
        position={[0, 1.88, 0]}
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
  const { scene } = useGLTF(rollingBallUrl)

  useFrame((_, delta) => {
    if (!core.current) return
    const radius = reducedMotion
      ? ballRadius
      : MathUtils.damp(core.current.scale.x, ballRadius, 9, delta)
    core.current.scale.setScalar(radius)
  })

  return (
    <group ref={core} scale={INITIAL_PLAYER_RADIUS}>
      <group scale={2.003914}>
        <Clone
          object={scene}
          position={[0, -0.49707, 0]}
          castShadow
          receiveShadow
        />
      </group>
    </group>
  )
}

useGLTF.preload(rollingBallUrl)

function BallLanternLight({
  active,
  ballRadius,
  lighting,
  reducedMotion,
}: {
  active: boolean
  ballRadius: number
  lighting: StageLightingProfile
  reducedMotion: boolean
}) {
  const glow = useRef<Mesh>(null)

  useFrame(({ clock }) => {
    if (!glow.current) return
    const pulse = reducedMotion
      ? 1
      : 1 + Math.sin(clock.elapsedTime * 1.8) * 0.025
    glow.current.scale.setScalar(ballRadius * 1.045 * pulse)
  })

  if (!active) return null

  return (
    <group>
      <pointLight
        color="#FFD88A"
        intensity={lighting.ballLightIntensity}
        distance={lighting.ballLightDistance}
        decay={1.45}
        position={[0, ballRadius * 0.35, 0]}
      />
      <mesh ref={glow} scale={ballRadius * 1.045}>
        <sphereGeometry args={[1, 32, 20]} />
        <meshBasicMaterial
          color="#FFE6A6"
          transparent
          opacity={lighting.ballGlowOpacity}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
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
    const {
      x,
      z,
      speed,
      boost,
      impact,
      surface,
      velocityX,
      velocityZ,
      slip,
    } = motion.current
    const isSlick = surface === 'slick'
    const physicalSpeed = Math.hypot(velocityX, velocityZ)
    const effectX = isSlick && physicalSpeed > 0.02
      ? velocityX / physicalSpeed
      : x
    const effectZ = isSlick && physicalSpeed > 0.02
      ? velocityZ / physicalSpeed
      : z
    puffs.current.forEach((puff, index) => {
      if (!puff) return
      const sideX = -effectZ
      const sideZ = effectX
      const phase = (clock.elapsedTime * 3.4 + index * 0.7) % 1
      const spread =
        (index % 2 ? 1 : -1) *
        (0.2 + index * 0.06) *
        (1 + slip * 0.9)
      const behind = ballRadius * 0.55 + phase * 0.85
      puff.position.set(
        -effectX * behind + sideX * spread,
        -ballRadius + 0.055,
        -effectZ * behind + sideZ * spread,
      )
      const material = puff.material as MeshBasicMaterial
      material.color.set(
        isSlick
          ? '#A9E9FF'
          : speedPowerUpActive
          ? '#FFB36B'
          : boost > 1
            ? '#B6F3FF'
            : impact > 0
              ? '#FFD29B'
              : '#FFF3D4',
      )
      material.opacity = reducedMotion
        ? 0
        : Math.min(
            isSlick ? 0.72 : 0.58,
            speed * boost * (1 - phase) * (isSlick ? 0.48 : 0.36) +
              slip * (1 - phase) * 0.28 +
              impact * 0.12,
          )
      const scale =
        0.7 + phase * (speedPowerUpActive ? 2.55 : boost > 1 ? 2.15 : 1.6)
      puff.scale.set(
        isSlick ? scale * 0.42 : scale,
        0.18,
        isSlick ? scale * 2.35 : scale * 0.72,
      )
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

function SlickSurface({ zone }: { zone: SurfaceZone }) {
  const streaks = [-0.68, -0.34, 0, 0.34, 0.68]
  const crackSegments = [
    [-0.46, -0.18, 0.18, 0.22],
    [-0.33, -0.1, -0.74, 0.16],
    [-0.3, -0.02, 0.9, 0.13],
    [-0.08, 0.25, -0.22, 0.2],
    [0.05, 0.17, 0.72, 0.14],
    [0.12, 0.08, -0.95, 0.12],
    [0.36, -0.2, 0.28, 0.19],
    [0.46, -0.11, -0.8, 0.14],
    [0.28, 0.22, 1.08, 0.17],
  ] as const
  const frostShards = Array.from({ length: 14 }, (_, index) => {
    const angle = (index / 14) * Math.PI * 2
    return {
      x: Math.cos(angle) * zone.halfWidth * 0.965,
      z: Math.sin(angle) * zone.halfDepth * 0.965,
      scale: 0.16 + (index % 4) * 0.035,
    }
  })

  return (
    <group
      position={[zone.x, 0.034, zone.z]}
      rotation={[0, zone.rotationY, 0]}
    >
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[zone.halfWidth, zone.halfDepth, 1]}
        receiveShadow
      >
        <circleGeometry args={[1, 96]} />
        <meshPhysicalMaterial
          color={zone.color}
          emissive="#7CA9D8"
          emissiveIntensity={0.24}
          metalness={0.06}
          roughness={0.025}
          clearcoat={1}
          clearcoatRoughness={0.018}
          transmission={0.16}
          thickness={0.18}
          ior={1.31}
          transparent
          opacity={0.93}
        />
      </mesh>
      {streaks.map((xRatio, index) => (
        <mesh
          key={`${zone.id}-glide-streak-${xRatio}`}
          position={[zone.halfWidth * xRatio, 0.012 + index * 0.001, 0]}
        >
          <boxGeometry
            args={[
              0.055 + (index % 2) * 0.035,
              0.012,
              zone.halfDepth * (1.28 + (index % 3) * 0.12),
            ]}
          />
          <meshBasicMaterial
            color={index % 2 === 0 ? '#EAF8FF' : '#BBD9FF'}
            transparent
            opacity={0.46}
            depthWrite={false}
          />
        </mesh>
      ))}
      {crackSegments.map(([xRatio, zRatio, rotationY, lengthRatio], index) => (
        <mesh
          key={`${zone.id}-ice-crack-${index}`}
          position={[
            zone.halfWidth * xRatio,
            0.028 + (index % 2) * 0.002,
            zone.halfDepth * zRatio,
          ]}
          rotation={[0, rotationY, 0]}
        >
          <boxGeometry
            args={[zone.halfWidth * lengthRatio, 0.014, 0.045]}
          />
          <meshBasicMaterial
            color="#F7FCFF"
            transparent
            opacity={0.88}
            depthWrite={false}
          />
        </mesh>
      ))}
      {[0.42, 0.72, 0.965].map((radius, index) => (
        <mesh
          key={`${zone.id}-slick-ring-${radius}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.014 + index * 0.002, 0]}
          scale={[zone.halfWidth, zone.halfDepth, 1]}
        >
          <ringGeometry
            args={[
              radius - (index === 2 ? 0.038 : 0.012),
              radius,
              96,
            ]}
          />
          <meshBasicMaterial
            color={index === 2 ? '#FFFFFF' : '#D9F1FF'}
            transparent
            opacity={index === 2 ? 0.68 : 0.36 - index * 0.06}
            depthWrite={false}
          />
        </mesh>
      ))}
      {frostShards.map((shard, index) => (
        <mesh
          key={`${zone.id}-frost-shard-${index}`}
          position={[shard.x, 0.08, shard.z]}
          rotation={[0, index * 0.83, 0]}
          scale={[shard.scale * 1.35, shard.scale * 0.42, shard.scale]}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshPhysicalMaterial
            color="#EAF9FF"
            emissive="#A8D9F5"
            emissiveIntensity={0.22}
            roughness={0.18}
            transmission={0.12}
            transparent
            opacity={0.82}
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

function SlickContactEffects({
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
  const trails = useRef<(Mesh | null)[]>([])
  const iceChips = useRef<Points>(null)
  const strength = useRef(0)
  const chipPositions = useMemo(() => new Float32Array(12 * 3), [])

  useFrame(({ clock }, delta) => {
    const root = group.current
    if (!root) return

    const isOnIce = motion.current.surface === 'slick'
    const targetStrength = isOnIce
      ? Math.min(
          1,
          0.38 + motion.current.speed * 0.58 + motion.current.slip * 0.5,
        )
      : 0
    strength.current = MathUtils.damp(
      strength.current,
      targetStrength,
      targetStrength > 0 ? 9 : 5,
      delta,
    )
    root.visible = strength.current > 0.012
    if (!root.visible) return

    const velocityLength = Math.hypot(
      motion.current.velocityX,
      motion.current.velocityZ,
    )
    const directionX = velocityLength > 0.02
      ? motion.current.velocityX / velocityLength
      : motion.current.x
    const directionZ = velocityLength > 0.02
      ? motion.current.velocityZ / velocityLength
      : motion.current.z
    root.position.set(
      playerPosition.current.x,
      0.064,
      playerPosition.current.z,
    )
    root.rotation.y = Math.atan2(directionX, directionZ)

    trails.current.forEach((trail, index) => {
      if (!trail) return
      const side =
        (index === 0 ? -1 : 1) *
        ballRadius *
        (0.34 + motion.current.slip * 0.18)
      const length = ballRadius * (
        1.55 + motion.current.speed * 1.25 + motion.current.slip * 1.1
      )
      trail.position.set(side, 0, -length * 0.4)
      trail.scale.set(
        Math.max(0.07, ballRadius * 0.13),
        1,
        length,
      )
      const material = trail.material as MeshBasicMaterial
      material.opacity =
        strength.current * (reducedMotion ? 0.28 : 0.76)
    })

    const chipCloud = iceChips.current
    if (!chipCloud) return
    const elapsed = reducedMotion ? 0.4 : clock.elapsedTime
    const positionAttribute = chipCloud.geometry.getAttribute(
      'position',
    ) as BufferAttribute
    for (let index = 0; index < 12; index += 1) {
      const phase = (elapsed * 2.1 + index * 0.13) % 1
      const side = index % 2 === 0 ? -1 : 1
      positionAttribute.setXYZ(
        index,
        side * ballRadius * (
          0.28 + (index % 4) * 0.12 + motion.current.slip * 0.22
        ),
        reducedMotion
          ? 0.02
          : Math.sin(phase * Math.PI) * ballRadius * 0.38,
        -ballRadius * (0.35 + phase * 1.75),
      )
    }
    positionAttribute.needsUpdate = true
    const material = chipCloud.material as PointsMaterial
    material.size = ballRadius * 0.13
    material.opacity = reducedMotion ? 0 : strength.current * 0.82
  })

  return (
    <group ref={group} visible={false}>
      {[0, 1].map((index) => (
        <mesh
          key={`ice-slide-trail-${index}`}
          ref={(mesh) => {
            trails.current[index] = mesh
          }}
        >
          <boxGeometry args={[1, 0.014, 1]} />
          <meshBasicMaterial
            color="#F4FCFF"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
      <points ref={iceChips}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[chipPositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#DDF6FF"
          size={0.06}
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

        if (obstacle.assetVariant) {
          const halfHeight = obstacle.colliderHalfHeight ?? 0.7
          return (
            <RigidBody
              key={obstacle.id}
              type="fixed"
              colliders={false}
              position={[obstacle.x, halfHeight, obstacle.z]}
              rotation={[0, obstacle.rotationY ?? 0, 0]}
              userData={{ physics }}
            >
              <CuboidCollider
                args={[
                  obstacle.colliderHalfWidth ?? obstacle.radius,
                  halfHeight,
                  obstacle.colliderHalfDepth ?? obstacle.radius,
                ]}
                friction={0.9}
                restitution={0.03}
              />
            </RigidBody>
          )
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
            {obstacle.id.startsWith('forest-ridge-') && (
              <mesh castShadow receiveShadow>
                <boxGeometry
                  args={[
                    obstacle.halfWidth * 2,
                    obstacle.halfHeight * 2,
                    obstacle.halfDepth * 2,
                  ]}
                />
                <meshStandardMaterial
                  color="#53685B"
                  roughness={0.94}
                />
              </mesh>
            )}
          </RigidBody>
        )
      })}

      {layout.tunnels.map((tunnel) => {
        const wallCenterX =
          tunnel.halfWidth + tunnel.wallThickness / 2
        const roofHalfWidth = tunnel.halfWidth + tunnel.wallThickness
        const frameDepthRatios = [-0.82, -0.4, 0, 0.4, 0.82]
        const physics: PhysicsBodyData = {
          kind: 'obstacle',
          label: tunnel.label,
          response: 'stop',
        }

        return (
          <RigidBody
            key={tunnel.id}
            type="fixed"
            colliders={false}
            position={[tunnel.x, 0, tunnel.z]}
            rotation={[0, tunnel.rotationY, 0]}
            userData={{ physics }}
          >
            {[-1, 1].map((side) => (
              <CuboidCollider
                key={`${tunnel.id}-wall-${side}`}
                args={[
                  tunnel.wallThickness / 2,
                  tunnel.clearanceHeight / 2,
                  tunnel.halfDepth,
                ]}
                position={[
                  wallCenterX * side,
                  tunnel.clearanceHeight / 2,
                  0,
                ]}
                friction={0.94}
                restitution={0.02}
              />
            ))}
            <CuboidCollider
              args={[
                roofHalfWidth,
                tunnel.roofThickness / 2,
                tunnel.halfDepth,
              ]}
              position={[
                0,
                tunnel.clearanceHeight + tunnel.roofThickness / 2,
                0,
              ]}
              friction={0.94}
              restitution={0.02}
            />
            {[-1, 1].map((side) => (
              <mesh
                key={`${tunnel.id}-wall-mesh-${side}`}
                castShadow
                receiveShadow
                position={[
                  wallCenterX * side,
                  tunnel.clearanceHeight / 2,
                  0,
                ]}
              >
                <boxGeometry
                  args={[
                    tunnel.wallThickness,
                    tunnel.clearanceHeight,
                    tunnel.halfDepth * 2,
                  ]}
                />
                <meshStandardMaterial color={tunnel.color} roughness={0.96} />
              </mesh>
            ))}
            <mesh
              receiveShadow
              position={[
                0,
                tunnel.clearanceHeight + tunnel.roofThickness / 2,
                0,
              ]}
            >
              <boxGeometry
                args={[
                  roofHalfWidth * 2,
                  tunnel.roofThickness,
                  tunnel.halfDepth * 2,
                ]}
              />
              <meshStandardMaterial
                color={tunnel.color}
                transparent
                opacity={0.76}
                depthWrite={false}
                roughness={0.92}
              />
            </mesh>
            {frameDepthRatios.map((depthRatio) => (
              <group
                key={`${tunnel.id}-frame-${depthRatio}`}
                position={[0, 0, tunnel.halfDepth * depthRatio]}
              >
                {[-1, 1].map((side) => (
                  <mesh
                    key={`${tunnel.id}-frame-${depthRatio}-${side}`}
                    position={[
                      wallCenterX * side,
                      tunnel.clearanceHeight / 2,
                      0,
                    ]}
                  >
                    <boxGeometry
                      args={[0.13, tunnel.clearanceHeight, 0.18]}
                    />
                    <meshBasicMaterial color={tunnel.accentColor} />
                  </mesh>
                ))}
                <mesh position={[0, tunnel.clearanceHeight, 0]}>
                  <boxGeometry
                    args={[roofHalfWidth * 2, 0.13, 0.18]}
                  />
                  <meshBasicMaterial color={tunnel.accentColor} />
                </mesh>
              </group>
            ))}
            <Html
              center
              position={[0, tunnel.clearanceHeight + 0.82, -tunnel.halfDepth]}
              distanceFactor={12}
              zIndexRange={[1, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <span className="world-interaction-label">
                <MaterialIcon name="dark_mode" />
                {tunnel.label}
              </span>
            </Html>
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
              friction={0.93}
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
        zone.kind === 'mud' ? null : zone.kind === 'water' ? (
          <AnimatedWaterSurface
            key={zone.id}
            zone={zone}
            reducedMotion={reducedMotion}
          />
        ) : zone.kind === 'slick' ? (
          <SlickSurface key={zone.id} zone={zone} />
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

function PushablePropVisual({ prop }: { prop: PushableProp }) {
  const isBox = prop.kind === 'block'
  const isTrashCan = prop.kind === 'trash-can'
  const { scene } = useGLTF(
    isBox
      ? shippingBoxUrl
      : isTrashCan
        ? blueTrashCanUrl
        : getStableConeModelUrl(prop.id),
  )

  return (
    <group
      position={[0, -prop.y, 0]}
      scale={isBox ? 0.72 : isTrashCan ? 0.86 : 0.76}
    >
      <Clone object={scene} castShadow receiveShadow />
    </group>
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
            mass={
              prop.kind === 'block'
                ? 0.62
                : prop.kind === 'trash-can'
                  ? 0.52
                  : 0.4
            }
            linearDamping={0.38}
            angularDamping={0.54}
            ccd
            userData={{ physics }}
          >
            {prop.kind === 'block' ? (
              <CuboidCollider
                args={[0.36, 0.34, 0.36]}
                friction={0.78}
                restitution={0.34}
              />
            ) : prop.kind === 'trash-can' ? (
              <CylinderCollider
                args={[0.43, 0.34]}
                friction={0.76}
                restitution={0.3}
              />
            ) : (
              <CylinderCollider
                args={[0.38, 0.3]}
                friction={0.72}
                restitution={0.42}
              />
            )}
            <PushablePropVisual prop={prop} />
          </RigidBody>
        )
      })}
    </>
  )
}

useGLTF.preload(coneRedV1Url)
useGLTF.preload(coneRedV2Url)
useGLTF.preload(coneRedV3Url)
useGLTF.preload(shippingBoxUrl)
useGLTF.preload(blueTrashCanUrl)

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

interface GameWorldProps extends GameCanvasProps {
  renderQuality: RenderQuality
}

function GameWorld({
  stage,
  stageObjects,
  attachedObjects,
  droppedObjects,
  attachmentNormals = {},
  collectedIds,
  ballRadius,
  illuminationProgress,
  paused,
  reducedMotion,
  controlVector,
  activePowerUps,
  powerUpPickups,
  radarTreasures,
  onPlayerPosition,
  onCollect,
  onPowerUpCollect,
  onRecoverDropped,
  onRunnerHit,
  onPolarBearHit,
  onTooLarge,
  onPhysicsFeedback,
  renderQuality,
}: GameWorldProps) {
  const objects = stageObjects
  const collectedObjects = useMemo(
    () =>
      Number.isFinite(renderQuality.attachedObjectLimit)
        ? attachedObjects.slice(-renderQuality.attachedObjectLimit)
        : attachedObjects,
    [attachedObjects, renderQuality.attachedObjectLimit],
  )
  const architectureCameraDistanceOffset = useMemo(
    () =>
      getArchitectureCameraDistanceOffset(collectedObjects, ballRadius),
    [ballRadius, collectedObjects],
  )
  const architectureCameraMinimumDistance = useMemo(
    () =>
      getArchitectureCameraMinimumDistance(collectedObjects, ballRadius),
    [ballRadius, collectedObjects],
  )
  const architectureCameraFramingLift = useMemo(
    () => getArchitectureCameraFramingLift(collectedObjects, ballRadius),
    [ballRadius, collectedObjects],
  )
  const tierFourCameraDistanceOffset = getTierFourCameraDistanceOffset(
    ballRadius,
  )
  const magnetActive = activePowerUps.magnet > 0
  const speedPowerUpActive = activePowerUps.speed > 0
  const lighting = getStageLightingProfile(
    stage.theme,
    illuminationProgress,
  )
  const physicsLayout = useMemo(
    () => createWorldPhysicsLayout(stage),
    [stage],
  )
  const roamingRunnerObstacles = useMemo(
    () => [
      ...physicsLayout.obstacles,
      ...physicsLayout.rideableObstacles.map((obstacle) => ({
        x: obstacle.x,
        z: obstacle.z,
        radius: Math.hypot(obstacle.halfWidth, obstacle.halfDepth) + 0.3,
      })),
      ...physicsLayout.tunnels.map((tunnel) => ({
        x: tunnel.x,
        z: tunnel.z,
        radius: Math.hypot(
          tunnel.halfWidth + tunnel.wallThickness,
          tunnel.halfDepth,
        ) + 0.3,
      })),
      ...physicsLayout.terrainRamps.map((ramp) => ({
        x: ramp.x,
        z: ramp.z,
        radius: Math.hypot(ramp.halfWidth, ramp.halfDepth) + 0.3,
      })),
      ...physicsLayout.elevatedPlatforms.map((platform) => ({
        x: platform.x,
        z: platform.z,
        radius: Math.hypot(platform.halfWidth, platform.halfDepth) + 0.3,
      })),
      ...physicsLayout.elevators.map((elevator) => ({
        x: elevator.x,
        z: elevator.z,
        radius: Math.hypot(elevator.halfWidth, elevator.halfDepth) + 0.4,
      })),
      ...physicsLayout.pushableProps.map((prop) => ({
        x: prop.x,
        z: prop.z,
        radius: prop.kind === 'block' ? 0.58 : 0.46,
      })),
    ],
    [physicsLayout],
  )
  const debugSurface = useMemo(() => {
    if (!IS_DEV) return null
    const spawnMode = new URLSearchParams(window.location.search).get('spawn')
    if (
      spawnMode !== 'water' &&
      spawnMode !== 'mud' &&
      spawnMode !== 'slick'
    ) return null
    return (
      physicsLayout.surfaceZones.find((zone) => zone.kind === spawnMode) ?? null
    )
  }, [physicsLayout])
  const debugNaturalObstacle = useMemo(() => {
    if (!IS_DEV) return null
    const spawnMode = new URLSearchParams(window.location.search).get('spawn')
    if (spawnMode !== 'natural' && spawnMode !== 'log') return null
    return (
      physicsLayout.obstacles.find((obstacle) =>
        spawnMode === 'log'
          ? obstacle.assetVariant === 'fallen-log-a'
          : obstacle.assetVariant === 'tree-root',
      ) ?? null
    )
  }, [physicsLayout])
  const debugTunnel = useMemo(() => {
    if (!IS_DEV) return null
    const spawnMode = new URLSearchParams(window.location.search).get('spawn')
    return spawnMode === 'tunnel' ? physicsLayout.tunnels[0] ?? null : null
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
        objects.find(
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
      objects.find(
        (item) =>
          (needsElevatedItem
            ? item.position[1] > 3
            : item.position[1] < 0.2) &&
          Math.hypot(item.position[0], item.position[2]) > 20 &&
          canCollect(0.42, item.size),
      ) ?? null
    )
  }, [objects, physicsLayout.pushableProps])
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
  const debugPushableTarget =
    IS_DEV && debugTeleportMode === 'trash'
      ? physicsLayout.pushableProps.find(
          (prop) => prop.kind === 'trash-can',
        ) ?? null
      : null
  const spawnX =
    (debugNaturalObstacle
      ? debugNaturalObstacle.x + debugNaturalObstacle.radius + 2.2
      : null) ??
    debugSurface?.x ??
    debugTunnel?.x ??
    (debugPushableTarget ? debugPushableTarget.x + 2.2 : 0)
  const spawnZ =
    debugNaturalObstacle?.z ??
    debugSurface?.z ??
    debugTunnel?.z ??
    debugPushableTarget?.z ??
    0
  const spawnTranslation = useMemo(
    () => getPlayerSpawnTranslation(spawnX, spawnZ),
    [spawnX, spawnZ],
  )
  const [renderCenter, setRenderCenter] = useState<[number, number]>(() => [
    spawnTranslation[0],
    spawnTranslation[2],
  ])
  const renderCenterRef = useRef({
    x: spawnTranslation[0],
    z: spawnTranslation[2],
  })
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
  const recoveringDroppedSet = useRef(new Set<string>())
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
  const cameraElevation = useRef(0)
  const cameraDirection = useRef(new Vector3(0, 0, -1))
  const cameraTargetDirection = useRef(new Vector3(0, 0, -1))
  const cameraOrbit = useRef<CameraOrbitState>({
    zoom: 1,
    targetZoom: 1,
    pitch: 0,
    pointerId: null,
    pointerButton: null,
    lastX: 0,
    lastY: 0,
    activeTouches: new Map(),
    pinchDistance: null,
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
    slip: 0,
  })

  useEffect(() => {
    collectedSet.current = new Set(collectedIds)
  }, [collectedIds])

  useEffect(() => {
    const activeDroppedIds = new Set(droppedObjects.map((item) => item.id))
    for (const itemId of recoveringDroppedSet.current) {
      if (!activeDroppedIds.has(itemId)) {
        recoveringDroppedSet.current.delete(itemId)
      }
    }
  }, [droppedObjects])

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

    const stopOrbit = () => {
      orbit.pointerId = null
      orbit.pointerButton = null
      orbit.activeTouches.clear()
      orbit.pinchDistance = null
      orbit.manualUntil = performance.now() + 5200
      canvas.classList.remove('is-camera-dragging')
    }
    const getTouchDistance = () => {
      const [first, second] = [...orbit.activeTouches.values()]
      return first && second
        ? Math.hypot(second.x - first.x, second.y - first.y)
        : null
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        event.preventDefault()
        orbit.activeTouches.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        })
        orbit.manualUntil = Number.POSITIVE_INFINITY
        canvas.setPointerCapture(event.pointerId)
        canvas.classList.add('is-camera-dragging')

        if (orbit.activeTouches.size === 1) {
          orbit.pointerId = event.pointerId
          orbit.pointerButton = 0
          orbit.lastX = event.clientX
          orbit.lastY = event.clientY
          orbit.pinchDistance = null
        } else {
          orbit.pointerId = null
          orbit.pointerButton = null
          orbit.pinchDistance = getTouchDistance()
        }
        return
      }

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
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        if (!orbit.activeTouches.has(event.pointerId)) return
        event.preventDefault()
        orbit.activeTouches.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        })

        if (orbit.activeTouches.size >= 2) {
          const nextDistance = getTouchDistance()
          if (nextDistance !== null && orbit.pinchDistance !== null) {
            orbit.targetZoom = getPinchZoomTarget(
              orbit.targetZoom,
              orbit.pinchDistance,
              nextDistance,
            )
          }
          orbit.pinchDistance = nextDistance
          return
        }
      }

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
      const nextAngle =
        currentAngle - deltaX * CAMERA_DRAG_YAW_SENSITIVITY
      cameraTargetDirection.current.set(
        Math.sin(nextAngle),
        0,
        Math.cos(nextAngle),
      )
      orbit.pitch = MathUtils.clamp(
        orbit.pitch - deltaY * CAMERA_DRAG_PITCH_SENSITIVITY,
        -1.1,
        3.2,
      )
    }
    const finishPointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        if (!orbit.activeTouches.has(event.pointerId)) return
        orbit.activeTouches.delete(event.pointerId)
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId)
        }

        const [remainingTouch] = [...orbit.activeTouches.entries()]
        if (remainingTouch) {
          orbit.pointerId = remainingTouch[0]
          orbit.pointerButton = 0
          orbit.lastX = remainingTouch[1].x
          orbit.lastY = remainingTouch[1].y
          orbit.pinchDistance = null
          orbit.manualUntil = Number.POSITIVE_INFINITY
        } else {
          stopOrbit()
        }
        return
      }

      if (orbit.pointerId !== event.pointerId) return
      stopOrbit()
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }
    }
    const handleLostPointerCapture = (event: PointerEvent) => {
      if (
        orbit.pointerId === event.pointerId ||
        orbit.activeTouches.has(event.pointerId)
      ) {
        finishPointer(event)
      }
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      orbit.targetZoom = getWheelZoomTarget(
        orbit.targetZoom,
        event.deltaY,
        event.deltaMode,
        canvas.clientHeight,
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
      orbit.pointerId = null
      orbit.pointerButton = null
      orbit.activeTouches.clear()
      orbit.pinchDistance = null
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

    if (!physics.quiet) motion.current.impact = 1
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

  const applyHazardImpact = (
    hazardPosition: { x: number; z: number },
    kind: HazardKind,
  ) => {
    const body = playerBody.current
    if (!body || paused) return
    const position = body.translation()
    const impact = createHazardKnockback(
      { x: position.x, z: position.z },
      hazardPosition,
      { x: heading.current.x, z: heading.current.z },
      stage.mapSize,
      ballRadius,
      roamingRunnerObstacles,
      kind,
    )
    const now = performance.now()

    body.setLinvel(
      {
        x: impact.directionX * impact.horizontalSpeed,
        y: impact.verticalSpeed,
        z: impact.directionZ * impact.horizontalSpeed,
      },
      true,
    )
    collisionRecoveryUntil.current = Math.max(
      collisionRecoveryUntil.current,
      now + impact.controlLockMs,
    )
    motion.current.velocityX = impact.directionX * impact.horizontalSpeed
    motion.current.velocityZ = impact.directionZ * impact.horizontalSpeed
    motion.current.impact = Math.max(
      motion.current.impact,
      kind === 'polar-bear' ? 1.9 : 1.35,
    )
  }

  const handleRunnerHazardHit = (
    position: { x: number; z: number },
    runnerId: string,
  ) => {
    if (!onRunnerHit(position, runnerId)) return
    applyHazardImpact(position, 'runner')
  }

  const handlePolarBearHazardHit = (position: {
    x: number
    z: number
  }) => {
    if (!onPolarBearHit(position)) return
    applyHazardImpact(position, 'polar-bear')
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
    if (
      renderQuality.lowPower &&
      Math.hypot(
        position.x - renderCenterRef.current.x,
        position.z - renderCenterRef.current.z,
      ) >= 6
    ) {
      renderCenterRef.current.x = position.x
      renderCenterRef.current.z = position.z
      setRenderCenter([position.x, position.z])
    }
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
      const speedZone = getActiveSpeedZone(
        physicsLayout,
        position.x,
        position.z,
      )
      const surfaceZone = getActiveSurfaceZone(
        physicsLayout,
        position.x,
        position.z,
        position.y - getPlayerColliderRadius(ballRadius),
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
        surfaceZone?.traction ?? 1,
      )
      const inputStrength = Math.hypot(driveStep.moveX, driveStep.moveZ)
      if (
        forwardInput >= 0 &&
        inputStrength > 0.05 &&
        rollingStep.speedRatio > 0.04
      ) {
        const isOnIce = surfaceZone?.kind === 'slick'
        const inputDirectionX = driveStep.moveX / inputStrength
        const inputDirectionZ = driveStep.moveZ / inputStrength
        const headingTargetX = isOnIce
          ? inputDirectionX
          : rollingStep.directionX
        const headingTargetZ = isOnIce
          ? inputDirectionZ
          : rollingStep.directionZ
        const headingSmoothing = isOnIce ? 2.2 : 4.6
        heading.current.x = MathUtils.damp(
          heading.current.x,
          headingTargetX,
          headingSmoothing,
          delta,
        )
        heading.current.z = MathUtils.damp(
          heading.current.z,
          headingTargetZ,
          headingSmoothing,
          delta,
        )
        heading.current.normalize()
      }
      const requestedSpeedMultiplier =
        (speedZone?.multiplier ?? 1) *
        (surfaceZone?.multiplier ?? 1) *
        getPowerUpSpeedMultiplier(activePowerUps)
      const speedMultiplier = getCappedRollingSpeedMultiplier(
        ballRadius,
        requestedSpeedMultiplier,
      )
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
      const rollingDirectionLength = Math.hypot(
        rollingStep.velocityX,
        rollingStep.velocityZ,
      )
      const rollingDirectionX = rollingDirectionLength > 0.02
        ? rollingStep.velocityX / rollingDirectionLength
        : heading.current.x
      const rollingDirectionZ = rollingDirectionLength > 0.02
        ? rollingStep.velocityZ / rollingDirectionLength
        : heading.current.z
      const slipTarget = surfaceZone?.kind === 'slick'
        ? Math.min(
            1,
            Math.abs(
              heading.current.x * rollingDirectionZ -
                heading.current.z * rollingDirectionX,
            ) * rollingStep.speedRatio * 1.35,
          )
        : 0
      motion.current.slip = MathUtils.damp(
        motion.current.slip,
        slipTarget,
        surfaceZone?.kind === 'slick' ? 5 : 9,
        delta,
      )
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
          type: surfaceZone?.kind === 'slick' ? 'slide' : 'slow',
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
        const interactionDistance = magnetActive
          ? MAGNET_PULL_RADIUS + ballRadius + 1.5
          : ballRadius + 2.5
        if (
          Math.abs(runtimePosition.x - position.x) > interactionDistance ||
          Math.abs(runtimePosition.z - position.z) > interactionDistance
        ) {
          continue
        }
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
          onCollect(
            item,
            getLocalAttachmentNormal(
              position,
              runtimeItem,
              orb.current?.quaternion,
              motion.current,
            ),
          )
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
          onCollect(
            treasure,
            getLocalAttachmentNormal(
              position,
              runtimeTreasure,
              orb.current?.quaternion,
              motion.current,
            ),
          )
        }
      }

      for (const item of droppedObjects) {
        if (recoveringDroppedSet.current.has(item.id)) continue
        const runtimePosition = getRuntimeItemPosition(
          runtimeItemPositions.current,
          item,
        )
        const runtimeDroppedItem = {
          ...item,
          position: [
            runtimePosition.x,
            runtimePosition.y,
            runtimePosition.z,
          ] as [number, number, number],
        }
        if (
          isObjectTouchingBall(
            position,
            ballRadius,
            runtimeDroppedItem,
          )
        ) {
          recoveringDroppedSet.current.add(item.id)
          onRecoverDropped(item)
        }
      }

      for (const pickup of powerUpPickups) {
        if (collectedPowerUpSet.current.has(pickup.id)) continue
        if (pickup.collectibleAt > Date.now()) continue
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
      13,
      delta,
    )
    cameraDirection.current.z = MathUtils.damp(
      cameraDirection.current.z,
      cameraTargetDirection.current.z,
      13,
      delta,
    )
    cameraDirection.current.normalize()

    cameraOrbit.current.zoom = MathUtils.damp(
      cameraOrbit.current.zoom,
      cameraOrbit.current.targetZoom,
      14,
      delta,
    )

    const manualCameraDistance =
      (4.8 + ballRadius * 1.6) * cameraOrbit.current.zoom
    const cameraDistance = Math.max(
      manualCameraDistance +
        tierFourCameraDistanceOffset +
        architectureCameraDistanceOffset,
      architectureCameraMinimumDistance,
    )
    const rawElevation = Math.max(0, position.y - ballRadius)
    const targetElevation = rawElevation < 0.03 ? 0 : rawElevation
    cameraElevation.current = MathUtils.damp(
      cameraElevation.current,
      targetElevation,
      12,
      delta,
    )
    const elevation = cameraElevation.current
    cameraPosition.current.set(
      position.x - cameraDirection.current.x * cameraDistance,
      3.2 +
        ballRadius * 1.35 +
        tierFourCameraDistanceOffset * 0.3 +
        architectureCameraFramingLift +
        elevation +
        cameraOrbit.current.pitch +
        (cameraOrbit.current.zoom - 1) * 1.35,
      position.z - cameraDirection.current.z * cameraDistance,
    )
    if (!reducedMotion && motion.current.impact > 0) {
      const shakeStrength = Math.min(1.9, motion.current.impact) * 0.072
      cameraPosition.current.x +=
        Math.sin(state.clock.elapsedTime * 61) * shakeStrength
      cameraPosition.current.y +=
        Math.sin(state.clock.elapsedTime * 73 + 0.8) * shakeStrength * 0.48
      cameraPosition.current.z +=
        Math.sin(state.clock.elapsedTime * 53 + 1.7) * shakeStrength * 0.72
    }
    const cameraDamping = reducedMotion ? 14 : 10
    camera.position.lerp(
      cameraPosition.current,
      1 - Math.exp(-cameraDamping * Math.min(delta, 0.1)),
    )
    desiredLookTarget.current.set(
      position.x + cameraDirection.current.x * ballRadius * 0.7,
      ballRadius * 0.72 +
        elevation +
        architectureCameraFramingLift * 0.5,
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
        y: position.y,
        z: position.z,
        headingX: heading.current.x,
        headingZ: heading.current.z,
      })
    }

  })

  const visibleObjects = useMemo(
    () => {
      const collected = new Set(collectedIds)
      return objects.filter((item) => !collected.has(item.id))
    },
    [collectedIds, objects],
  )
  const renderedObjects = useMemo(
    () =>
      selectNearbyObjects(
        visibleObjects,
        renderCenter,
        renderQuality.objectRenderDistance,
      ),
    [renderCenter, renderQuality.objectRenderDistance, visibleObjects],
  )
  return (
    <>
      <fog
        attach="fog"
        args={[
          stage.fogColor,
          stage.mapSize * lighting.fogNearRatio,
          stage.mapSize * lighting.fogFarRatio,
        ]}
      />
      <ambientLight intensity={lighting.ambientIntensity} />
      <directionalLight
        castShadow={renderQuality.shadows}
        position={[6, 12, 8]}
        intensity={lighting.directionalIntensity}
        color={new Color(lighting.directionalColor)}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight
        args={[
          lighting.hemisphereSkyColor,
          lighting.hemisphereGroundColor,
          lighting.hemisphereIntensity,
        ]}
      />

      <GardenSetDressing
        floorSize={stage.mapSize}
        receiveShadow={renderQuality.shadows}
        theme={stage.theme}
        treeObstacles={physicsLayout.obstacles}
      />
      <NaturalObstacleModels
        obstacles={physicsLayout.obstacles}
        surfaceZones={physicsLayout.surfaceZones}
        castShadow={renderQuality.shadows}
      />
      <RapierWorldColliders
        mapSize={stage.mapSize}
        layout={physicsLayout}
        reducedMotion={reducedMotion}
      />
      <RoamingRunnerObstacles
        mapSize={stage.mapSize}
        theme={stage.theme}
        obstacles={roamingRunnerObstacles}
        paused={paused}
        reducedMotion={reducedMotion}
        onRunnerHit={handleRunnerHazardHit}
        onPolarBearHit={handlePolarBearHazardHit}
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

      {renderedObjects.map((item) => (
        <LearningItem
          key={item.id}
          item={item}
          reducedMotion={reducedMotion}
          available={canCollect(ballRadius, item.size)}
          runtimePositions={runtimeItemPositions}
        />
      ))}
      {droppedObjects.map((item) => (
        <DroppedObjectPhysics
          key={item.id}
          item={item}
          runtimePositions={runtimeItemPositions}
          playerPosition={playerPosition}
          ballRadius={ballRadius}
          magnetActive={magnetActive}
          obstacles={physicsLayout.obstacles}
          reducedMotion={reducedMotion}
        />
      ))}
      <TooLargeItemColliders
        items={renderedObjects}
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
        userData={{
          physics: {
            kind: 'player',
            label: '주인공',
            response: 'stop',
            quiet: true,
          } satisfies PhysicsBodyData,
        }}
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
          <BallLanternLight
            active={stage.theme === 'forest-trail'}
            ballRadius={ballRadius}
            lighting={lighting}
            reducedMotion={reducedMotion}
          />
          {collectedObjects.map((item, index) => (
            <AttachedObjectMesh
              key={item.id}
              item={item}
              index={index}
              orbRadius={ballRadius}
              slotCount={64}
              attachmentNormal={attachmentNormals[item.id]}
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
        <RollingCrewCharacter
          ballRadius={ballRadius}
          motion={motion}
          reducedMotion={reducedMotion}
          paused={paused}
        />
      </RigidBody>
      <WaterContactEffects
        playerPosition={playerPosition}
        ballRadius={ballRadius}
        motion={motion}
        reducedMotion={reducedMotion}
      />
      <SlickContactEffects
        playerPosition={playerPosition}
        ballRadius={ballRadius}
        motion={motion}
        reducedMotion={reducedMotion}
      />
    </>
  )
}

export function GameCanvas(props: GameCanvasProps) {
  const renderQuality = useMemo(
    () => getRecommendedRenderQuality(readDeviceRenderProfile()),
    [],
  )

  // 레벨별 수집품(레벨N_*.glb)은 그 레벨이 열려야 화면에 나오므로, 그때 가서
  // 받으면 장면이 잠깐 비어 검은 화면이 스친다. 첫 장면이 뜨고 조금 뒤
  // 32개를 미리 받아 둔다 — 합쳐 6.5MB 라 초기 로딩과 겹치지만 않으면 된다.
  useEffect(() => {
    const t = window.setTimeout(() => {
      for (const asset of STRUCTURED_COLLECTIBLE_ASSETS) {
        useGLTF.preload(asset.url)
      }
    }, 4000)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <Canvas
      className="game-canvas"
      shadows={renderQuality.shadows}
      dpr={renderQuality.dpr}
      camera={{ position: [0, 7, 8], fov: 48, near: 0.1, far: 240 }}
      gl={{
        antialias: renderQuality.antialias,
        alpha: false,
        powerPreference: 'high-performance',
        // 게임이 끝나면 공 사진을 찍어 학급 전시에 쓴다. 이 옵션이 없으면
        // 화면에 그린 직후 버퍼가 비워져 toDataURL 이 빈 이미지를 준다.
        preserveDrawingBuffer: true,
      }}
    >
      {/* 하늘색은 Suspense 바깥에 둔다. 레벨이 오르면 그 레벨의 모델을 새로
          받는 동안 안쪽이 통째로 비는데(fallback={null}), 배경까지 안에 있으면
          그 순간 화면이 검게 보인다. */}
      <color attach="background" args={[props.stage.skyColor]} />
      <Suspense fallback={null}>
        <Physics
          gravity={[0, -16, 0]}
          paused={props.paused}
          timeStep={1 / 60}
          numSolverIterations={renderQuality.solverIterations}
          maxCcdSubsteps={renderQuality.maxCcdSubsteps}
        >
          <GameWorld
            key={props.stage.id}
            {...props}
            renderQuality={renderQuality}
          />
        </Physics>
      </Suspense>
    </Canvas>
  )
}
