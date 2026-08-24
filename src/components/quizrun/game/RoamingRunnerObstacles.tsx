import { Html, useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import {
  CylinderCollider,
  RigidBody,
  type CollisionEnterPayload,
  type RapierRigidBody,
} from '@react-three/rapier'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  type AnimationAction,
  Box3,
  Mesh,
  Quaternion,
  Vector3,
} from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  makeInPlaceRunClip,
  makeRootTranslationInPlaceClip,
} from '@/lib/quizrun-engine/crewAnimation'
import {
  POLAR_BEAR_HIT_COOLDOWN_MS,
  RUNNER_HIT_COOLDOWN_MS,
} from '@/lib/quizrun-engine/polarBearEncounter'
import {
  femaleRunnerUrl,
  maleRunnerUrl,
  polarBearUrl,
} from '@/lib/quizrun-engine/data/modelUrls'
import {
  createRoamingPolarBearSpecs,
  createRoamingRunnerSpecs,
  getRoamingHazardCounts,
  ROAMING_POLAR_BEAR_RADIUS,
  ROAMING_RUNNER_RADIUS,
  shouldRoamingRunnerTurnOnCollision,
  stepRoamingRunner,
  type RoamingObstacle,
  type RoamingPolarBearSpec,
  type RoamingRunnerSpec,
  type RoamingRunnerState,
} from '@/lib/quizrun-engine/roamingRunners'
import type { StageTheme } from '@/lib/quizrun-engine/types'

// Vite 의 import.meta.env.DEV 대체 (러닝크루는 Next)
const IS_DEV = process.env.NODE_ENV !== "production"

interface RoamingRunnerObstaclesProps {
  mapSize: number
  theme: StageTheme
  obstacles: readonly RoamingObstacle[]
  paused: boolean
  reducedMotion: boolean
  onRunnerHit: (
    position: { x: number; z: number },
    runnerId: string,
  ) => void
  onPolarBearHit: (position: { x: number; z: number }) => void
}

interface CollisionPhysicsData {
  kind?: string
}

const RUNNER_HEIGHT = 1.65
const COLLIDER_HALF_HEIGHT = 0.68
const MODEL_FORWARD_OFFSET = 0
const POLAR_BEAR_HEIGHT = 1.42
const POLAR_BEAR_COLLIDER_HALF_HEIGHT = 0.62
const UP = new Vector3(0, 1, 0)

function DangerMarker({
  radius,
  labelHeight,
  reducedMotion,
}: {
  radius: number
  labelHeight: number
  reducedMotion: boolean
}) {
  return (
    <group>
      <mesh position={[0, 0.026, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.72, 28]} />
        <meshBasicMaterial
          color="#E53935"
          transparent
          opacity={0.18}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.76, radius, 32]} />
        <meshBasicMaterial
          color="#E53935"
          transparent
          opacity={0.82}
          depthWrite={false}
        />
      </mesh>
      <Html
        aria-hidden="true"
        center
        distanceFactor={8}
        position={[0, labelHeight, 0]}
        wrapperClass="world-hazard-marker-wrap"
      >
        <span
          className={`world-hazard-marker${reducedMotion ? ' is-static' : ''}`}
          aria-hidden="true"
        >
          !
        </span>
      </Html>
    </group>
  )
}

function RoamingRunner({
  spec,
  url,
  mapSize,
  obstacles,
  paused,
  reducedMotion,
  onPlayerHit,
}: {
  spec: RoamingRunnerSpec
  url: string
  mapSize: number
  obstacles: readonly RoamingObstacle[]
  paused: boolean
  reducedMotion: boolean
  onPlayerHit: (
    position: { x: number; z: number },
    runnerId: string,
  ) => void
}) {
  const body = useRef<RapierRigidBody>(null)
  const runAction = useRef<AnimationAction | null>(null)
  const turnRequested = useRef(false)
  const nextHitAt = useRef(0)
  const state = useRef<RoamingRunnerState>({
    x: spec.x,
    z: spec.z,
    heading: spec.heading,
  })
  const { scene, animations } = useGLTF(url)
  const model = useMemo(() => clone(scene), [scene])
  const inPlaceAnimations = useMemo(
    () => animations.map((clip) => makeInPlaceRunClip(clip)),
    [animations],
  )
  const { actions, names } = useAnimations(inPlaceAnimations, model)
  const modelFit = useMemo(() => {
    model.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(model)
    const center = bounds.getCenter(new Vector3())
    const height = Math.max(0.001, bounds.max.y - bounds.min.y)
    return {
      scale: RUNNER_HEIGHT / height,
      offset: new Vector3(-center.x, -bounds.min.y, -center.z),
    }
  }, [model])

  useLayoutEffect(() => {
    model.traverse((child) => {
      if (!(child instanceof Mesh)) return
      child.castShadow = true
      child.receiveShadow = true
    })
  }, [model])

  useEffect(() => {
    const action = names[0] ? actions[names[0]] : undefined
    runAction.current = action ?? null
    action?.reset().fadeIn(0.12).play()
    return () => {
      action?.fadeOut(0.08)
      runAction.current = null
    }
  }, [actions, names])

  useEffect(() => {
    const action = runAction.current
    if (!action) return
    action.paused = paused
    action.setEffectiveTimeScale(reducedMotion ? 0.55 : 0.9)
  }, [actions, names, paused, reducedMotion])

  const requestTurn = ({ other }: CollisionEnterPayload) => {
    if (other.rigidBodyObject?.name === 'rolling-player') {
      const now = performance.now()
      if (!paused && now >= nextHitAt.current) {
        nextHitAt.current = now + RUNNER_HIT_COOLDOWN_MS
        onPlayerHit(
          { x: state.current.x, z: state.current.z },
          spec.id,
        )
      }
      return
    }
    const physics = (
      other.rigidBodyObject?.userData.physics ??
      other.colliderObject?.userData.physics
    ) as CollisionPhysicsData | undefined
    if (shouldRoamingRunnerTurnOnCollision(physics?.kind)) {
      turnRequested.current = true
    }
  }

  useFrame((_, delta) => {
    const runnerBody = body.current
    if (!runnerBody || paused) return

    if (turnRequested.current) {
      state.current.heading += (Math.PI / 2) * spec.turnSign
      turnRequested.current = false
    }
    state.current = stepRoamingRunner(
      state.current,
      spec.speed,
      spec.turnSign,
      delta,
      mapSize,
      obstacles,
    )

    runnerBody.setNextKinematicTranslation({
      x: state.current.x,
      y: 0,
      z: state.current.z,
    })
    const rotation = new Quaternion().setFromAxisAngle(
      UP,
      state.current.heading + MODEL_FORWARD_OFFSET,
    )
    runnerBody.setNextKinematicRotation(rotation)
  })

  return (
    <RigidBody
      ref={body}
      name={spec.id}
      type="kinematicPosition"
      colliders={false}
      position={[spec.x, 0, spec.z]}
      rotation={[0, spec.heading + MODEL_FORWARD_OFFSET, 0]}
      userData={{
        physics: {
          kind: 'moving-obstacle',
          label: spec.variant === 'male' ? '남성 러닝크루' : '여성 러닝크루',
          response: 'stop',
        },
      }}
      ccd
      onCollisionEnter={requestTurn}
    >
      <CylinderCollider
        args={[COLLIDER_HALF_HEIGHT, ROAMING_RUNNER_RADIUS]}
        position={[0, COLLIDER_HALF_HEIGHT, 0]}
        friction={0.88}
        restitution={0.08}
      />
      <group scale={modelFit.scale}>
        <primitive object={model} position={modelFit.offset} />
      </group>
      <mesh
        position={[0, 0.018, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[0.62, 0.4, 1]}
      >
        <circleGeometry args={[0.52, 20]} />
        <meshBasicMaterial
          color="#273548"
          transparent
          opacity={0.14}
          depthWrite={false}
        />
      </mesh>
      <DangerMarker
        radius={0.72}
        labelHeight={2.05}
        reducedMotion={reducedMotion}
      />
    </RigidBody>
  )
}

function RoamingPolarBear({
  spec,
  mapSize,
  obstacles,
  paused,
  reducedMotion,
  onPlayerHit,
}: {
  spec: RoamingPolarBearSpec
  mapSize: number
  obstacles: readonly RoamingObstacle[]
  paused: boolean
  reducedMotion: boolean
  onPlayerHit: (position: { x: number; z: number }) => void
}) {
  const body = useRef<RapierRigidBody>(null)
  const actionRef = useRef<AnimationAction | null>(null)
  const turnRequested = useRef(false)
  const nextHitAt = useRef(0)
  const state = useRef<RoamingRunnerState>({
    x: spec.x,
    z: spec.z,
    heading: spec.heading,
  })
  const { scene, animations } = useGLTF(polarBearUrl)
  const model = useMemo(() => clone(scene), [scene])
  const inPlaceAnimations = useMemo(
    () => animations.map((clip) => makeRootTranslationInPlaceClip(clip)),
    [animations],
  )
  const { actions, names } = useAnimations(inPlaceAnimations, model)
  const modelFit = useMemo(() => {
    model.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(model)
    const center = bounds.getCenter(new Vector3())
    const height = Math.max(0.001, bounds.max.y - bounds.min.y)
    return {
      scale: POLAR_BEAR_HEIGHT / height,
      offset: new Vector3(-center.x, -bounds.min.y, -center.z),
    }
  }, [model])

  useLayoutEffect(() => {
    model.traverse((child) => {
      if (!(child instanceof Mesh)) return
      child.castShadow = true
      child.receiveShadow = true
    })
  }, [model])

  useEffect(() => {
    const action = names[0] ? actions[names[0]] : undefined
    actionRef.current = action ?? null
    action?.reset().fadeIn(0.12).play()
    return () => {
      action?.fadeOut(0.08)
      actionRef.current = null
    }
  }, [actions, names])

  useEffect(() => {
    const action = actionRef.current
    if (!action) return
    action.paused = paused
    action.setEffectiveTimeScale(reducedMotion ? 0.45 : 0.72)
  }, [paused, reducedMotion])

  const handleCollision = ({ other }: CollisionEnterPayload) => {
    if (other.rigidBodyObject?.name === 'rolling-player') {
      const now = performance.now()
      if (!paused && now >= nextHitAt.current) {
        nextHitAt.current = now + POLAR_BEAR_HIT_COOLDOWN_MS
        onPlayerHit({ x: state.current.x, z: state.current.z })
      }
      return
    }

    const physics = (
      other.rigidBodyObject?.userData.physics ??
      other.colliderObject?.userData.physics
    ) as CollisionPhysicsData | undefined
    if (shouldRoamingRunnerTurnOnCollision(physics?.kind)) {
      turnRequested.current = true
    }
  }

  useFrame((_, delta) => {
    const bearBody = body.current
    if (!bearBody || paused) return

    if (turnRequested.current) {
      state.current.heading += (Math.PI / 2) * spec.turnSign
      turnRequested.current = false
    }
    state.current = stepRoamingRunner(
      state.current,
      spec.speed,
      spec.turnSign,
      delta,
      mapSize,
      obstacles,
      ROAMING_POLAR_BEAR_RADIUS,
    )
    bearBody.setNextKinematicTranslation({
      x: state.current.x,
      y: 0,
      z: state.current.z,
    })
    bearBody.setNextKinematicRotation(
      new Quaternion().setFromAxisAngle(
        UP,
        state.current.heading + MODEL_FORWARD_OFFSET,
      ),
    )
  })

  return (
    <RigidBody
      ref={body}
      name={spec.id}
      type="kinematicPosition"
      colliders={false}
      position={[spec.x, 0, spec.z]}
      rotation={[0, spec.heading + MODEL_FORWARD_OFFSET, 0]}
      userData={{
        physics: {
          kind: 'moving-obstacle',
          label: '무서운 북극곰',
          response: 'stop',
          quiet: true,
        },
      }}
      ccd
      onCollisionEnter={handleCollision}
    >
      <CylinderCollider
        args={[POLAR_BEAR_COLLIDER_HALF_HEIGHT, ROAMING_POLAR_BEAR_RADIUS]}
        position={[0, POLAR_BEAR_COLLIDER_HALF_HEIGHT, 0]}
        friction={0.9}
        restitution={0.1}
      />
      <group scale={modelFit.scale}>
        <primitive object={model} position={modelFit.offset} />
      </group>
      <mesh
        position={[0, 0.018, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1.05, 0.68, 1]}
      >
        <circleGeometry args={[0.7, 24]} />
        <meshBasicMaterial
          color="#5E2530"
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </mesh>
      <DangerMarker
        radius={1.1}
        labelHeight={1.82}
        reducedMotion={reducedMotion}
      />
    </RigidBody>
  )
}

useGLTF.preload(polarBearUrl)

export function RoamingRunnerObstacles({
  mapSize,
  theme,
  obstacles,
  paused,
  reducedMotion,
  onRunnerHit,
  onPolarBearHit,
}: RoamingRunnerObstaclesProps) {
  const hazardCounts = getRoamingHazardCounts(theme)
  const previewNearby =
    IS_DEV &&
    new URLSearchParams(window.location.search).get('runnerPreview') === 'true'
  const specs = useMemo(
    () => {
      const roamingSpecs = createRoamingRunnerSpecs(
        mapSize,
        obstacles,
        hazardCounts.runnerCount,
      )
      if (!previewNearby) return roamingSpecs
      return roamingSpecs.map((spec, index) => ({
        ...spec,
        x: ((index % 4) - 1.5) * 2.4,
        z: -4.5 - Math.floor(index / 4) * 3,
        heading: 0,
        speed: 0.18,
      }))
    },
    [hazardCounts.runnerCount, mapSize, obstacles, previewNearby],
  )
  const polarBearSpecs = useMemo(() => {
    const runnerAvoidance = specs.map((spec) => ({
      x: spec.x,
      z: spec.z,
      radius: ROAMING_RUNNER_RADIUS * 1.8,
    }))
    const roamingSpecs = createRoamingPolarBearSpecs(
      mapSize,
      [...obstacles, ...runnerAvoidance],
      hazardCounts.polarBearCount,
    )
    const previewNearby =
      IS_DEV &&
      new URLSearchParams(window.location.search).get('bearPreview') === 'true'
    return previewNearby
      ? roamingSpecs.map((spec, index) => ({
          ...spec,
          x: (index - (roamingSpecs.length - 1) / 2) * 2.4,
          z: -0.9,
          heading: 0,
          speed: 0.05,
        }))
      : roamingSpecs
  }, [hazardCounts.polarBearCount, mapSize, obstacles, specs])

  return (
    <>
      {specs.map((spec) => (
        <RoamingRunner
          key={spec.id}
          spec={spec}
          url={spec.variant === 'male' ? maleRunnerUrl : femaleRunnerUrl}
          mapSize={mapSize}
          obstacles={obstacles}
          paused={paused}
          reducedMotion={reducedMotion}
          onPlayerHit={onRunnerHit}
        />
      ))}
      {polarBearSpecs.map((spec) => (
        <RoamingPolarBear
          key={spec.id}
          spec={spec}
          mapSize={mapSize}
          obstacles={obstacles}
          paused={paused}
          reducedMotion={reducedMotion}
          onPlayerHit={onPolarBearHit}
        />
      ))}
    </>
  )
}
