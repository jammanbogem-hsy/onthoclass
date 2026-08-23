export type LearningSubject = '한글' | '수학' | '과학' | '생활'
export type StageTheme = 'sunny-plaza' | 'forest-trail' | 'starlight-river'
export type SizeTierLevel = 1 | 2 | 3 | 4

export type ObjectShape =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'book'
  | 'pencil'
  | 'letter'

export interface LearningObject {
  id: string
  modelId?: string
  stageId?: string
  label: string
  fact: string
  subject: LearningSubject
  size: number
  points: number
  color: string
  shape: ObjectShape
  position: [number, number, number]
  symbol?: string
}

export interface StageTierGoal {
  level: SizeTierLevel
  label: string
  requiredCount: number
  requiredScore: number
}

export interface StageUnlockRequirement {
  previousStageId: string
  requiredScore: number
  requiredTierLevel: SizeTierLevel
}

export interface GameStage {
  id: string
  title: string
  subtitle: string
  description: string
  theme: StageTheme
  mapSize: number
  /** Legacy count target retained for older sessions and remote packs. */
  objectiveCount: number
  scoreGoal: number
  tierGoals: StageTierGoal[]
  unlockRequirement?: StageUnlockRequirement
  accentColor: string
  skyColor: string
  fogColor: string
  objects: LearningObject[]
}

export interface LearningPack {
  version?: number
  title: string
  stages: GameStage[]
  objects: LearningObject[]
}

export interface GameSession {
  id: string
  startedAt: number
  updatedAt: number
  completedAt?: number
  score: number
  bestCombo: number
  currentStageIndex: number
  stageScores: Record<string, number>
  collectedPowerUpIds: string[]
  collectedIds: string[]
  collectedLabels: string[]
  durationSeconds: number
  status: 'playing' | 'completed'
}
