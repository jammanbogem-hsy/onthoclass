import type { LearningObject, SizeTierLevel } from './types'
import { getSizeTier } from './mechanics'

export const STAGE_OBJECT_TIER_TOTALS = [150, 105, 70, 35] as const
export const ICE_RIVER_OBJECT_TIER_TOTALS = [200, 140, 65, 35] as const

export const ACTIVE_OBJECT_TIER_COUNTS: Record<
  SizeTierLevel,
  readonly [number, number, number, number]
> = {
  1: [120, 30, 8, 1],
  2: [135, 70, 24, 5],
  3: [145, 90, 52, 14],
  4: STAGE_OBJECT_TIER_TOTALS,
}

export const ICE_RIVER_ACTIVE_OBJECT_TIER_COUNTS: Record<
  SizeTierLevel,
  readonly [number, number, number, number]
> = {
  1: [190, 80, 14, 2],
  2: [200, 120, 32, 7],
  3: [200, 140, 60, 16],
  4: ICE_RIVER_OBJECT_TIER_TOTALS,
}

const activeSelectionCache = new WeakMap<
  readonly LearningObject[],
  Map<SizeTierLevel, LearningObject[]>
>()

function stableHash(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function createInterleavedTierSequence(
  counts: readonly number[],
): number[] {
  const normalizedCounts = counts.map((count) =>
    Math.max(0, Math.floor(count)),
  )
  const total = normalizedCounts.reduce((sum, count) => sum + count, 0)
  const emitted = normalizedCounts.map(() => 0)

  return Array.from({ length: total }, (_, index) => {
    let selectedTier = 0
    let largestDeficit = Number.NEGATIVE_INFINITY

    normalizedCounts.forEach((targetCount, tierIndex) => {
      if (emitted[tierIndex] >= targetCount) return
      const expectedByNow = (targetCount * (index + 1)) / total
      const deficit = expectedByNow - emitted[tierIndex]
      if (deficit > largestDeficit) {
        largestDeficit = deficit
        selectedTier = tierIndex
      }
    })

    emitted[selectedTier] += 1
    return selectedTier
  })
}

export function selectActiveStageObjects(
  objects: readonly LearningObject[],
  reachableTier: SizeTierLevel,
): LearningObject[] {
  const cached = activeSelectionCache.get(objects)?.get(reachableTier)
  if (cached) return cached

  const limits = objects[0]?.stageId === 'starlight-river'
    ? ICE_RIVER_ACTIVE_OBJECT_TIER_COUNTS[reachableTier]
    : ACTIVE_OBJECT_TIER_COUNTS[reachableTier]
  const selectedIds = new Set<string>()

  for (const tier of [1, 2, 3, 4] as const) {
    objects
      .filter((item) => getSizeTier(item.size).level === tier)
      .sort(
        (left, right) =>
          stableHash(`${left.stageId ?? ''}:${left.id}`) -
          stableHash(`${right.stageId ?? ''}:${right.id}`),
      )
      .slice(0, limits[tier - 1])
      .forEach((item) => selectedIds.add(item.id))
  }

  const selected = objects.filter((item) => selectedIds.has(item.id))
  const selectionByTier =
    activeSelectionCache.get(objects) ??
    new Map<SizeTierLevel, LearningObject[]>()
  selectionByTier.set(reachableTier, selected)
  activeSelectionCache.set(objects, selectionByTier)
  return selected
}
