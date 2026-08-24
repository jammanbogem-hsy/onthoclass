import type { LearningObject } from './types'

export interface DeviceRenderProfile {
  userAgent?: string
  hardwareConcurrency?: number
  deviceMemory?: number
}

export interface RenderQuality {
  lowPower: boolean
  dpr: [number, number]
  shadows: boolean
  antialias: boolean
  solverIterations: number
  maxCcdSubsteps: number
  objectRenderDistance: number
  attachedObjectLimit: number
}

export function getRecommendedRenderQuality(
  profile: DeviceRenderProfile,
): RenderQuality {
  const chromeOs = /CrOS/i.test(profile.userAgent ?? '')
  const limitedMemory =
    profile.deviceMemory !== undefined && profile.deviceMemory <= 4
  const limitedCpu =
    profile.hardwareConcurrency !== undefined &&
    profile.hardwareConcurrency <= 4
  const lowPower = chromeOs || limitedMemory || limitedCpu

  return lowPower
    ? {
        lowPower: true,
        dpr: [0.75, 1],
        shadows: false,
        antialias: false,
        solverIterations: 4,
        maxCcdSubsteps: 2,
        objectRenderDistance: 54,
        attachedObjectLimit: 48,
      }
    : {
        lowPower: false,
        dpr: [1, 1.5],
        shadows: true,
        antialias: true,
        solverIterations: 8,
        maxCcdSubsteps: 4,
        objectRenderDistance: Number.POSITIVE_INFINITY,
        attachedObjectLimit: Number.POSITIVE_INFINITY,
      }
}

export function readDeviceRenderProfile(): DeviceRenderProfile {
  if (typeof navigator === 'undefined') return {}

  const deviceNavigator = navigator as Navigator & {
    deviceMemory?: number
  }

  return {
    userAgent: deviceNavigator.userAgent,
    hardwareConcurrency: deviceNavigator.hardwareConcurrency,
    deviceMemory: deviceNavigator.deviceMemory,
  }
}

export function selectNearbyObjects<T extends Pick<LearningObject, 'position'>>(
  objects: T[],
  center: readonly [number, number],
  maximumDistance: number,
): T[] {
  if (!Number.isFinite(maximumDistance)) return objects

  const maximumDistanceSquared = maximumDistance * maximumDistance
  return objects.filter((item) => {
    const deltaX = item.position[0] - center[0]
    const deltaZ = item.position[2] - center[1]
    return deltaX * deltaX + deltaZ * deltaZ <= maximumDistanceSquared
  })
}
