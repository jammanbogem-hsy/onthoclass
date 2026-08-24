// 게임 진행 계산 — 어솔 session.ts 에서 저장소 의존만 걷어낸 판.
//
// 원본은 sessionStorage 에 읽고 쓰는 함수(readSession/saveSession/clearSession)를
// 함께 갖고 있었지만, 퀴즈런의 진행 상태는 Firestore(quizrun.ts runs)가 소유한다
// — 교사가 실시간으로 봐야 하기 때문. 그래서 여기에는 "다음 상태를 계산하는"
// 순수 함수만 남기고, 저장은 호출부가 맡는다.
// 공 성장 곡선(calculateBallRadius)은 mechanics 가 먼저 필요로 해 growth.ts 로 분리했다.

import type { AttachmentNormal, GameSession } from './types'

const emptySession = (): GameSession => {
  const now = Date.now()

  return {
    id: globalThis.crypto?.randomUUID?.() ?? `session-${now}`,
    startedAt: now,
    updatedAt: now,
    score: 0,
    bestCombo: 0,
    currentStageIndex: 0,
    stageScores: {},
    collectedPowerUpIds: [],
    collectedIds: [],
    collectedLabels: [],
    attachmentNormals: {},
    durationSeconds: 0,
    status: 'playing',
  }
}

/** 원본의 saveSession 을 대신한다 — 저장은 호출부(Firestore)가 맡고,
 *  여기서는 updatedAt 갱신만 한다(원본과 동일한 동작). */
const touch = (session: GameSession): GameSession => ({
  ...session,
  updatedAt: Date.now(),
})

export function startSession(): GameSession {
  return touch(emptySession())
}

export function recordCollection(
  session: GameSession,
  item: { id: string; stageId?: string; label: string; points: number },
  options: {
    multiplier?: number
    combo?: number
    attachmentNormal?: AttachmentNormal
  } = {},
): GameSession {
  if (session.collectedIds.includes(item.id)) return session

  const multiplier = Math.max(1, Math.min(5, options.multiplier ?? 1))
  const combo = Math.max(1, options.combo ?? 1)
  const awardedPoints = Math.round(item.points * multiplier)
  const stageScores = session.stageScores ?? {}

  return touch({
    ...session,
    score: session.score + awardedPoints,
    bestCombo: Math.max(session.bestCombo ?? 0, combo),
    stageScores: item.stageId
      ? {
          ...stageScores,
          [item.stageId]: (stageScores[item.stageId] ?? 0) + awardedPoints,
        }
      : stageScores,
    collectedIds: [...session.collectedIds, item.id],
    collectedLabels: [...session.collectedLabels, item.label],
    attachmentNormals: options.attachmentNormal
      ? {
          ...(session.attachmentNormals ?? {}),
          [item.id]: options.attachmentNormal,
        }
      : session.attachmentNormals ?? {},
  })
}

export function recordPowerUpCollection(
  session: GameSession,
  pickupId: string,
): GameSession {
  if (session.collectedPowerUpIds.includes(pickupId)) return session

  return touch({
    ...session,
    collectedPowerUpIds: [...session.collectedPowerUpIds, pickupId],
  })
}

export function advanceSessionStage(
  session: GameSession,
  nextStageIndex: number,
): GameSession {
  return touch({
    ...session,
    currentStageIndex: Math.max(
      session.currentStageIndex,
      Math.floor(nextStageIndex),
    ),
  })
}

export function finishSession(session: GameSession): GameSession {
  const completedAt = Date.now()
  return touch({
    ...session,
    status: 'completed',
    completedAt,
    durationSeconds: Math.max(
      1,
      Math.round((completedAt - session.startedAt) / 1000),
    ),
  })
}

export function getStarRating(session: GameSession): number {
  return Math.max(1, Math.min(3, Math.ceil(session.collectedIds.length / 10)))
}
