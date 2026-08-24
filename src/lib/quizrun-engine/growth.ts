// 공 성장 곡선 — 어솔 session.ts 에서 순수 함수만 분리해 왔다.
// (원본 session.ts 는 sessionStorage 기반이라 이식하지 않았다. 퀴즈런의 진행
//  상태는 Firestore 에 두므로 quizrun.ts 가 그 역할을 대신한다.)
const BALL_GROWTH_MILESTONES = [
  { collectedCount: 0, radius: 0.42 },
  { collectedCount: 6, radius: 0.52 },
  { collectedCount: 18, radius: 0.88 },
  { collectedCount: 36, radius: 1.26 },
  { collectedCount: 48, radius: 1.62 },
  { collectedCount: 64, radius: 1.9 },
  { collectedCount: 80, radius: 2.05 },
] as const

function createStageGrowthMilestones(tierCounts: readonly number[]) {
  if (tierCounts.length < 4) return BALL_GROWTH_MILESTONES

  const [tierOne, tierTwo, tierThree, tierFour] = tierCounts.map((count) =>
    Math.max(1, Math.floor(count)),
  )
  const finalGrowthSpan = Math.max(2, tierFour - tierThree)

  return [
    { collectedCount: 0, radius: 0.42 },
    { collectedCount: tierOne - 1, radius: 0.504 },
    { collectedCount: tierOne, radius: 0.52 },
    { collectedCount: tierTwo - 1, radius: 0.862 },
    { collectedCount: tierTwo, radius: 0.88 },
    { collectedCount: tierThree - 1, radius: 1.24 },
    { collectedCount: tierThree, radius: 1.26 },
    {
      collectedCount: Math.round(tierThree + finalGrowthSpan * 0.43),
      radius: 1.62,
    },
    {
      collectedCount: Math.round(tierThree + finalGrowthSpan * 0.72),
      radius: 1.9,
    },
    { collectedCount: tierFour, radius: 2.05 },
  ]
}


export function calculateBallRadius(
  collectedCount: number,
  tierCounts: readonly number[] = [],
): number {
  const count = Math.max(0, collectedCount)
  const growthMilestones =
    tierCounts.length >= 4
      ? createStageGrowthMilestones(tierCounts)
      : BALL_GROWTH_MILESTONES

  for (let index = 1; index < growthMilestones.length; index += 1) {
    const start = growthMilestones[index - 1]
    const end = growthMilestones[index]
    if (count > end.collectedCount) continue

    const progress =
      (count - start.collectedCount) /
      (end.collectedCount - start.collectedCount)
    return start.radius + (end.radius - start.radius) * progress
  }

  return growthMilestones[growthMilestones.length - 1].radius
}
