import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react'
import {
  type AnimationAction,
  Box3,
  Group,
  MathUtils,
  Mesh,
  Vector3,
} from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  runModelUrl,
  standModelUrl,
} from '@/lib/quizrun-engine/data/modelUrls'
import { makeInPlaceRunClip } from '@/lib/quizrun-engine/crewAnimation'

interface CrewMotion {
  x: number
  z: number
  speed: number
}

interface RollingCrewCharacterProps {
  ballRadius: number
  motion: MutableRefObject<CrewMotion>
  paused: boolean
  reducedMotion: boolean
}

const RUN_START_SPEED = 0.055
const RUN_STOP_SPEED = 0.035
const CHARACTER_SCALE_RATIO = 0.7
const PUSH_DISTANCE = 0.44
const PUSH_LEAN = 0.08
const PUSH_SIDE_OFFSET = 0.18
// The running clip dips the shoes below the standing-pose bounds, while some
// decorative ground surfaces sit slightly above the physics floor.
const CHARACTER_FOOT_LIFT = 0.08

export function RollingCrewCharacter({
  ballRadius,
  motion,
  paused,
  reducedMotion,
}: RollingCrewCharacterProps) {
  const standGltf = useGLTF(standModelUrl)
  const runGltf = useGLTF(runModelUrl)
  const model = useMemo(() => clone(standGltf.scene), [standGltf.scene])
  const clips = useMemo(() => {
    const standClip = standGltf.animations[0]?.clone()
    const sourceRunClip = runGltf.animations[0]
    const runClip = sourceRunClip
      ? makeInPlaceRunClip(sourceRunClip, standClip)
      : undefined
    if (standClip) standClip.name = 'stand'
    if (runClip) runClip.name = 'run'
    return [standClip, runClip].filter((clip) => clip !== undefined)
  }, [runGltf.animations, standGltf.animations])
  const { actions } = useAnimations(clips, model)
  const root = useRef<Group>(null)
  const modelRoot = useRef<Group>(null)
  const standAction = useRef<AnimationAction | null>(null)
  const runAction = useRef<AnimationAction | null>(null)
  const activeMotion = useRef<'stand' | 'run'>('stand')
  const modelFit = useMemo(() => {
    model.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(model)
    const center = bounds.getCenter(new Vector3())
    const height = Math.max(0.001, bounds.max.y - bounds.min.y)

    return {
      height,
      offset: new Vector3(-center.x, -bounds.min.y, -center.z),
    }
  }, [model])
  const characterHeight =
    Math.min(1.9, 1.45 + ballRadius * 0.22) * CHARACTER_SCALE_RATIO

  useLayoutEffect(() => {
    model.traverse((child) => {
      if (!(child instanceof Mesh)) return
      child.castShadow = true
      child.receiveShadow = true
    })
  }, [model])

  useEffect(() => {
    standAction.current = actions.stand ?? null
    runAction.current = actions.run ?? null
    if (!standAction.current) return
    standAction.current.reset().fadeIn(0.01).play()
    activeMotion.current = 'stand'

    return () => {
      standAction.current?.stop()
      runAction.current?.stop()
      standAction.current = null
      runAction.current = null
    }
  }, [actions])

  useFrame((_, delta) => {
    const character = root.current
    if (!character) return

    const { x, z, speed } = motion.current
    const distance = ballRadius + PUSH_DISTANCE
    const targetX = -x * distance + z * PUSH_SIDE_OFFSET
    const targetZ = -z * distance - x * PUSH_SIDE_OFFSET
    character.position.x = MathUtils.damp(
      character.position.x,
      targetX,
      12,
      delta,
    )
    character.position.z = MathUtils.damp(
      character.position.z,
      targetZ,
      12,
      delta,
    )
    character.position.y = -ballRadius
    const scale = MathUtils.damp(
      character.scale.x,
      characterHeight,
      16,
      delta,
    )
    character.scale.setScalar(scale)
    character.rotation.y = Math.atan2(
      -character.position.x,
      -character.position.z,
    )

    const threshold =
      activeMotion.current === 'run' ? RUN_STOP_SPEED : RUN_START_SPEED
    const nextMotion = !paused && speed > threshold ? 'run' : 'stand'
    if (modelRoot.current) {
      modelRoot.current.rotation.x = MathUtils.damp(
        modelRoot.current.rotation.x,
        nextMotion === 'run' ? PUSH_LEAN : 0,
        10,
        delta,
      )
    }
    if (nextMotion !== activeMotion.current) {
      const currentAction =
        activeMotion.current === 'run' ? runAction.current : standAction.current
      const nextAction =
        nextMotion === 'run' ? runAction.current : standAction.current
      currentAction?.fadeOut(0.18)
      nextAction?.reset().fadeIn(0.18).play()
      activeMotion.current = nextMotion
    }

    runAction.current?.setEffectiveTimeScale(
      reducedMotion
        ? 0.35
        : MathUtils.lerp(0.82, 1.42, Math.min(1, speed)),
    )
    standAction.current?.setEffectiveTimeScale(reducedMotion ? 0.35 : 1)
  })

  return (
    <group
      ref={root}
      name="rolling-crew-character"
      position={[
        0,
        -ballRadius,
        ballRadius + 0.48,
      ]}
      scale={characterHeight}
    >
      <mesh
        position={[0, 0.012, 0.02]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[0.48, 0.3, 1]}
      >
        <circleGeometry args={[0.52, 20]} />
        <meshBasicMaterial
          color="#273548"
          transparent
          opacity={0.14}
          depthWrite={false}
        />
      </mesh>
      <group
        ref={modelRoot}
        position={[0, CHARACTER_FOOT_LIFT, 0]}
        scale={1 / modelFit.height}
      >
        <primitive object={model} position={modelFit.offset} />
      </group>
    </group>
  )
}

useGLTF.preload(standModelUrl)
useGLTF.preload(runModelUrl)
