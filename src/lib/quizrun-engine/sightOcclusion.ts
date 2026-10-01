import { Box3, Material, Matrix4, Mesh, Object3D, Ray, Vector3 } from 'three'

const viewRay = new Ray()
const intersection = new Vector3()
const localBounds = new Box3()
const inverse = new Matrix4()
const localCamera = new Vector3()
const localTargets = [new Vector3(), new Vector3(), new Vector3()]

export interface SightBox {
  position: readonly [number, number, number]
  halfSize: readonly [number, number, number]
}

/** Resolve sparse architecture in its local space, so empty space between
 * railings, under pillars, or above a slope does not fade a visible floor. */
export function blocksStructureView(
  matrixWorld: Matrix4,
  boxes: readonly SightBox[],
  camera: Vector3,
  targets: readonly Vector3[],
): boolean {
  inverse.copy(matrixWorld).invert()
  localCamera.copy(camera).applyMatrix4(inverse)
  const points = targets.map((target, index) => {
    const point = localTargets[index] ?? (localTargets[index] = new Vector3())
    return point.copy(target).applyMatrix4(inverse)
  })
  return boxes.some(({ position: p, halfSize: h }) => {
    localBounds.min.set(p[0] - h[0], p[1] - h[1], p[2] - h[2])
    localBounds.max.set(p[0] + h[0], p[1] + h[1], p[2] + h[2])
    return blocksCharacterView(localBounds, localCamera, points)
  })
}

/** A cheap, conservative line-of-sight test; no per-triangle physics queries. */
export function blocksCharacterView(
  bounds: Box3,
  camera: Vector3,
  targets: readonly Vector3[],
): boolean {
  if (bounds.isEmpty()) return false
  return targets.some((target) => {
    const distance = camera.distanceTo(target)
    if (distance < 0.01) return false
    viewRay.origin.copy(camera)
    viewRay.direction.subVectors(target, camera).divideScalar(distance)
    const hit = viewRay.intersectBox(bounds, intersection)
    return bounds.containsPoint(camera) ||
      (hit !== null && camera.distanceTo(hit) < distance - 0.04)
  })
}

export interface OcclusionFade {
  amount: number
  setAmount: (amount: number) => void
  restore: () => void
}

/** Imported GLBs share materials. Only the obscuring instance gets copies. */
export function createOcclusionFade(root: Object3D, keepDepth = false): OcclusionFade {
  const originals = new Map<Mesh, Material | Material[]>()
  const copies = new Map<Material, Material>()
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    originals.set(object, object.material)
    const cloneMaterial = (source: Material) => {
      let copy = copies.get(source)
      if (!copy) {
        copy = source.clone()
        copy.transparent = true
        // Mostly-opaque fades keep depth so a glassy ball does not show its own back faces.
        copy.depthWrite = keepDepth
        copies.set(source, copy)
      }
      return copy
    }
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material)
  })
  return {
    amount: 1,
    setAmount(amount) {
      this.amount = amount
      copies.forEach((copy, source) => {
        copy.opacity = source.opacity * amount
      })
    },
    restore() {
      originals.forEach((material, mesh) => { mesh.material = material })
      copies.forEach((material) => material.dispose())
      copies.clear()
      originals.clear()
    },
  }
}
