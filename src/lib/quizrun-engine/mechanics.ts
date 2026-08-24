import { calculateBallRadius } from './growth'
import type {
  GameStage,
  LearningObject,
  StageTierGoal,
} from './types'

export const COLLECTIBLE_RATIO = 0.95

export const SIZE_TIERS = [
  { level: 1, label: '작은 아이템', minSize: 0, maxSize: 0.45, color: '#2FA47C' },
  { level: 2, label: '보통 아이템', minSize: 0.48, maxSize: 0.8, color: '#4169D8' },
  { level: 3, label: '큰 아이템', minSize: 0.82, maxSize: 1.15, color: '#E6A800' },
  {
    level: 4,
    label: '아주 큰 아이템',
    minSize: 1.18,
    maxSize: Number.POSITIVE_INFINITY,
    color: '#E85D4A',
  },
] as const

const OBJECT_VISUAL_SCALES = [0.34, 0.68, 1.1, 1.65] as const

function getRawCollectibleLimit(ballRadius: number): number {
  return ballRadius * COLLECTIBLE_RATIO
}

export function getCollectibleLimit(ballRadius: number): number {
  return getReachableSizeTier(ballRadius).maxSize
}

export function canCollect(ballRadius: number, objectSize: number): boolean {
  return (
    getSizeTier(objectSize).level <= getReachableSizeTier(ballRadius).level
  )
}

export function getSizeTier(objectSize: number) {
  return (
    SIZE_TIERS.find((tier) => objectSize <= tier.maxSize) ??
    SIZE_TIERS[SIZE_TIERS.length - 1]
  )
}

export function getObjectVisualScale(objectSize: number): number {
  return OBJECT_VISUAL_SCALES[getSizeTier(objectSize).level - 1]
}

export function isObjectTouchingBall(
  ballPosition: { x: number; y: number; z: number },
  ballRadius: number,
  item: Pick<LearningObject, 'position' | 'size'>,
): boolean {
  const objectCenterY =
    item.position[1] + getObjectVisualScale(item.size) * 0.58
  const distance = Math.hypot(
    item.position[0] - ballPosition.x,
    objectCenterY - ballPosition.y,
    item.position[2] - ballPosition.z,
  )

  return distance < ballRadius + item.size * 0.64
}

type StageGoalConfig = Pick<
  GameStage,
  'objectiveCount' | 'scoreGoal' | 'tierGoals'
>

export interface StageTierProgress extends StageTierGoal {
  collectedCount: number
  score: number
  ready: boolean
  progress: number
}

export interface CircularWorldObstacle {
  x: number
  z: number
  radius: number
}

export function isCollectionPositionClear(
  item: Pick<LearningObject, 'position' | 'size'>,
  obstacles: CircularWorldObstacle[],
  extraClearance = 0.35,
): boolean {
  const itemRadius = Math.max(0.22, item.size * 0.64)

  return obstacles.every(
    (obstacle) =>
      Math.hypot(
        item.position[0] - obstacle.x,
        item.position[2] - obstacle.z,
      ) >=
      obstacle.radius + itemRadius + extraClearance,
  )
}

export function getStageScore(
  objects: Pick<LearningObject, 'id' | 'points'>[],
  collectedIds: string[],
): number {
  const collectedSet = new Set(collectedIds)
  return objects.reduce(
    (score, item) => score + (collectedSet.has(item.id) ? item.points : 0),
    0,
  )
}

/**
 * 맵 진행 상황.
 *
 * 레벨은 "그 레벨의 오브젝트를 requiredCount 개 모으면" 올라간다 — 아무거나
 * 누적해서 세는 게 아니다. 1레벨을 30개 모아도 2레벨을 채우지 않으면 3레벨
 * 물건에는 손이 닿지 않는다. 초등학생이 "몇 개 더 모으면 되는지"를 화면에서
 * 바로 읽을 수 있고, 점수 배점을 설계하지 않아도 등수가 나온다.
 *
 * 공 크기는 여전히 수집 가능 여부를 정하는 장치다(canCollect). 그래서 레벨별
 * 달성분을 requiredCount 로 잘라 누적한 effectiveCount 로 반지름을 구한다 —
 * 한 레벨에서 초과로 모은 개수가 다음 레벨을 열어버리지 않도록.
 */
export function getStageProgress(
  objects: Pick<LearningObject, 'id' | 'points' | 'size'>[],
  collectedIds: string[],
  goalConfig: number | StageGoalConfig,
  awardedStageScore?: number,
) {
  const collectedSet = new Set(collectedIds)
  const collectedCount = objects.reduce(
    (count, item) => count + (collectedSet.has(item.id) ? 1 : 0),
    0,
  )
  const stageScore = Number.isFinite(awardedStageScore)
    ? Math.max(0, awardedStageScore ?? 0)
    : getStageScore(objects, collectedIds)
  const isLegacyGoal = typeof goalConfig === 'number'
  const scoreGoal = isLegacyGoal ? 0 : Math.max(1, goalConfig.scoreGoal)
  const tierGoals = isLegacyGoal
    ? []
    : [...goalConfig.tierGoals].sort((a, b) => a.level - b.level)

  // 레벨별로 몇 개 모았는지
  const collectedByLevel = new Map<number, number>()
  for (const item of objects) {
    if (!collectedSet.has(item.id)) continue
    const level = getSizeTier(item.size).level
    collectedByLevel.set(level, (collectedByLevel.get(level) ?? 0) + 1)
  }

  const tierProgress: StageTierProgress[] = tierGoals.map((tierGoal) => {
    const got = collectedByLevel.get(tierGoal.level) ?? 0

    return {
      ...tierGoal,
      collectedCount: got,
      score: stageScore,
      ready: got >= tierGoal.requiredCount,
      progress: Math.min(1, got / Math.max(1, tierGoal.requiredCount)),
    }
  })

  // 레벨은 순서대로 열린다 — 앞 레벨을 채우지 못하면 거기서 멈춘다.
  let clearedTiers = 0
  for (const tier of tierProgress) {
    if (!tier.ready) break
    clearedTiers += 1
  }
  const nextTierGoal = tierProgress[clearedTiers] ?? null
  const completionCount = tierGoals.reduce(
    (sum, tier) => sum + tier.requiredCount,
    0,
  )
  const goal = Math.max(1, completionCount || (isLegacyGoal ? goalConfig : 1))
  const effectiveCount = tierProgress.reduce(
    (sum, tier) => sum + Math.min(tier.collectedCount, tier.requiredCount),
    0,
  )
  // 성장 곡선은 누적 기준이므로 레벨별 목표를 누적값으로 바꿔 넘긴다.
  const cumulativeTierCounts = tierGoals.reduce<number[]>(
    (acc, tier) => [...acc, (acc[acc.length - 1] ?? 0) + tier.requiredCount],
    [],
  )
  const ballRadius = calculateBallRadius(effectiveCount, cumulativeTierCounts)
  const reachedTierLevel = isLegacyGoal
    ? 0
    : Math.min(tierGoals.length, clearedTiers + 1)
  const ready = tierGoals.length > 0 && clearedTiers >= tierGoals.length

  return {
    collectedCount,
    /** 레벨 목표에 실제로 반영된 개수(초과분 제외) — 공 크기의 근거 */
    effectiveCount,
    ballRadius,
    goal,
    objectiveCount: goal,
    stageScore,
    scoreGoal,
    scoreRemaining: Math.max(0, scoreGoal - stageScore),
    tierProgress,
    completedTierLevel: clearedTiers,
    reachedTierLevel,
    nextTierGoal,
    // 레벨 목표에 안 잡힌 초과 수집분 — 한 레벨에서 목표보다 많이 모은 몫이다
    bonusCount: Math.max(0, collectedCount - effectiveCount),
    ready,
    progress: Math.min(1, effectiveCount / goal),
  }
}

export function isStageUnlocked(
  stage: Pick<GameStage, 'unlockRequirement'>,
  stages: GameStage[],
  collectedIds: string[],
  stageScores: Record<string, number> = {},
): boolean {
  const requirement = stage.unlockRequirement
  if (!requirement) return true

  const previousStage = stages.find(
    (candidate) => candidate.id === requirement.previousStageId,
  )
  if (!previousStage) return false

  const progress = getStageProgress(
    previousStage.objects,
    collectedIds,
    previousStage,
    stageScores[previousStage.id],
  )

  return (
    progress.ready &&
    progress.reachedTierLevel >= requirement.requiredTierLevel
  )
}

export function getReachableSizeTier(ballRadius: number) {
  const limit = getRawCollectibleLimit(ballRadius)
  return (
    [...SIZE_TIERS].reverse().find((tier) => tier.minSize <= limit) ??
    SIZE_TIERS[0]
  )
}

/**
 * 맵을 끝까지 깰 수 있는지 검사한다.
 *
 * 레벨별 목표 방식에서는 "모든 물건을 다 주울 수 있는가"가 아니라 "레벨마다
 * 목표 개수만큼 물건이 깔려 있는가"가 조건이다 — 3레벨 물건이 8개뿐이면
 * 10개를 모을 수 없으니 학생이 그 맵에 갇힌다.
 */
export function canCompletePack(
  objects: Pick<LearningObject, 'size'>[],
  tierGoals: Pick<StageTierGoal, 'level' | 'requiredCount'>[],
): boolean {
  const availableByLevel = new Map<number, number>()
  for (const item of objects) {
    const level = getSizeTier(item.size).level
    availableByLevel.set(level, (availableByLevel.get(level) ?? 0) + 1)
  }

  return tierGoals.every(
    (goal) => (availableByLevel.get(goal.level) ?? 0) >= goal.requiredCount,
  )
}
