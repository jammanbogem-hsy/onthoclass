import type { LearningObject } from './types'
import { getObjectVisualScale } from './mechanics'

type ScalableCollectible = Pick<LearningObject, 'label' | 'modelId' | 'size'>

export type ArchitectureScaleClass =
  | 'tall-landmark'
  | 'wide-building'
  | 'school'
  | 'stadium'

export const ARCHITECTURE_ATTACHED_SCALE_MULTIPLIERS = {
  'tall-landmark': 3.15,
  'wide-building': 2.05,
  school: 1.78,
  stadium: 1.82,
} as const

export const ARCHITECTURE_WORLD_SCALE_MULTIPLIERS = {
  'tall-landmark': 2.2,
  'wide-building': 1.45,
  school: 1.35,
  stadium: 1.45,
} as const

export const MAX_ARCHITECTURE_ATTACHED_SCALE = 6.2
export const MAX_TIER_FOUR_CAMERA_DISTANCE_OFFSET = 4.4
const ATTACHED_SCALE_PER_ORB_RADIUS = 2.8
const ATTACHED_SCALE_ORB_PADDING = 0.6
const TIER_FOUR_CAMERA_START_RADIUS = 1.24
const TIER_FOUR_CAMERA_END_RADIUS = 2.08

export function getArchitectureScaleClass(
  item: Pick<ScalableCollectible, 'label' | 'modelId'>,
): ArchitectureScaleClass | null {
  const identity = `${item.modelId ?? ''} ${item.label}`
  if (
    item.modelId === 'level4-lotte-tower' ||
    /(?:63빌딩|서울N타워|롯데타워|에펠탑|자유의 여신상)/u.test(
      identity,
    )
  ) {
    return 'tall-landmark'
  }
  if (/(?:아파트|덕수궁)/u.test(identity)) return 'wide-building'
  if (/학교/u.test(identity)) return 'school'
  if (/야구장/u.test(identity)) return 'stadium'
  return null
}

export function isArchitectureCollectible(
  item: Pick<ScalableCollectible, 'label' | 'modelId'>,
): boolean {
  return getArchitectureScaleClass(item) !== null
}

export function getWorldObjectVisualScale(
  item: ScalableCollectible,
): number {
  const baseScale = getObjectVisualScale(item.size)
  const scaleClass = getArchitectureScaleClass(item)
  if (!scaleClass) return baseScale

  return baseScale * ARCHITECTURE_WORLD_SCALE_MULTIPLIERS[scaleClass]
}

export function getAttachedObjectVisualScale(
  item: ScalableCollectible,
  orbRadius: number,
): number {
  const baseScale = getObjectVisualScale(item.size)
  const scaleClass = getArchitectureScaleClass(item)
  if (!scaleClass) return baseScale

  const desiredScale =
    baseScale * ARCHITECTURE_ATTACHED_SCALE_MULTIPLIERS[scaleClass]
  const orbScaleLimit =
    Math.max(0, orbRadius) * ATTACHED_SCALE_PER_ORB_RADIUS +
    ATTACHED_SCALE_ORB_PADDING

  return Math.min(
    desiredScale,
    orbScaleLimit,
    MAX_ARCHITECTURE_ATTACHED_SCALE,
  )
}

function getMaximumArchitectureAttachedScale(
  items: readonly ScalableCollectible[],
  orbRadius: number,
): number {
  return items.reduce((maximum, item) => {
    if (!isArchitectureCollectible(item)) return maximum
    return Math.max(maximum, getAttachedObjectVisualScale(item, orbRadius))
  }, 0)
}

export function getArchitectureCameraDistanceOffset(
  items: readonly ScalableCollectible[],
  orbRadius: number,
): number {
  const maximumScale = getMaximumArchitectureAttachedScale(items, orbRadius)

  return Math.min(
    2.2,
    Math.max(0, maximumScale - Math.max(0, orbRadius)) * 0.46,
  )
}

export function getArchitectureCameraMinimumDistance(
  items: readonly ScalableCollectible[],
  orbRadius: number,
): number {
  const maximumScale = getMaximumArchitectureAttachedScale(items, orbRadius)
  if (maximumScale <= 0) return 0

  return 2.3 + Math.max(0, orbRadius) + maximumScale * 0.82
}

export function getArchitectureCameraFramingLift(
  items: readonly ScalableCollectible[],
  orbRadius: number,
): number {
  const maximumScale = getMaximumArchitectureAttachedScale(items, orbRadius)
  return Math.min(
    0.7,
    Math.max(0, maximumScale - Math.max(0, orbRadius)) * 0.2,
  )
}

export function getTierFourCameraDistanceOffset(orbRadius: number): number {
  const progress = Math.min(
    1,
    Math.max(
      0,
      (orbRadius - TIER_FOUR_CAMERA_START_RADIUS) /
        (TIER_FOUR_CAMERA_END_RADIUS - TIER_FOUR_CAMERA_START_RADIUS),
    ),
  )
  const easedProgress = progress * progress * (3 - 2 * progress)

  return easedProgress * MAX_TIER_FOUR_CAMERA_DISTANCE_OFFSET
}
