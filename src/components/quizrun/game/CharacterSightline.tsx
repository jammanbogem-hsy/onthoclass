import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Box3, MathUtils, Object3D, Vector3 } from 'three'
import {
  blocksCharacterView,
  blocksStructureView,
  createOcclusionFade,
  type OcclusionFade,
} from '@/lib/quizrun-engine/sightOcclusion'

/** Scenery fades almost fully; the player's own ball only turns slightly glassy. */
function getMinimumOpacity(root: Object3D): number {
  const value = root.userData.sightMinOpacity
  return typeof value === 'number' ? value : 0.14
}

export function CharacterSightline({ lowPower }: { lowPower: boolean }) {
  const { scene, camera } = useThree()
  const roots = useRef<Object3D[]>([])
  const character = useRef<Object3D | undefined>(undefined)
  const fades = useRef(new Map<Object3D, OcclusionFade>())
  const blocked = useRef(new Set<Object3D>())
  const bounds = useRef(new Box3())
  const targets = useRef([new Vector3(), new Vector3(), new Vector3()])
  const refreshAt = useRef(0)
  const checkAt = useRef(0)

  useEffect(() => {
    const active = fades.current
    return () => {
      active.forEach((fade) => fade.restore())
      active.clear()
    }
  }, [])

  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime
    if (time >= refreshAt.current) {
      refreshAt.current = time + 0.4
      roots.current = []
      scene.traverse((object) => {
        if (object.userData.sightOccluder) roots.current.push(object)
      })
      character.current = scene.getObjectByName('rolling-crew-character')
    }
    const crew = character.current
    if (!crew) return

    if (time >= checkAt.current) {
      checkAt.current = time + (lowPower ? 0.16 : 0.1)
      crew.updateWorldMatrix(true, false)
      targets.current.forEach((point, index) => {
        point.set(0, [0.25, 0.64, 0.94][index], 0)
        crew.localToWorld(point)
      })
      blocked.current.clear()
      for (const root of roots.current) {
        if (!root.visible || !root.parent) continue
        // Bounds reuse cached GLB geometry bounds; unlike triangle raycasts,
        // this remains inexpensive for animated and high-poly collectibles.
        bounds.current.setFromObject(root)
        if (
          blocksCharacterView(bounds.current, camera.position, targets.current) &&
          (!root.userData.sightBoxes || blocksStructureView(
            root.matrixWorld, root.userData.sightBoxes, camera.position, targets.current,
          ))
        ) {
          blocked.current.add(root)
          if (!fades.current.has(root)) {
            fades.current.set(
              root,
              createOcclusionFade(root, getMinimumOpacity(root) >= 0.5),
            )
          }
        }
      }
    }
    fades.current.forEach((fade, root) => {
      const obscured = blocked.current.has(root) && root.parent !== null
      const amount = MathUtils.damp(
        fade.amount, obscured ? getMinimumOpacity(root) : 1, obscured ? 18 : 8, Math.min(delta, 0.1),
      )
      fade.setAmount(amount)
      if (!obscured && amount > 0.995) {
        fade.restore()
        fades.current.delete(root)
      }
    })
  })
  return null
}
