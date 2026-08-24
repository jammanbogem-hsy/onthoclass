import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  GameCanvas,
  type PlayerMapPose,
} from '@/components/quizrun/GameCanvas'
import { GameMiniMap } from '@/components/quizrun/GameMiniMap'
import { GameEventTray } from '@/components/quizrun/GameEventTray'
import {
  M3Button,
  M3IconButton,
  M3LinearProgress,
} from '@/components/quizrun/MaterialControls'
import {
  MaterialIcon,
  type MaterialIconName,
} from '@/components/quizrun/MaterialIcon'
import {
  TouchJoystick,
  type ControlVector,
} from '@/components/quizrun/TouchJoystick'
import { loadLearningPack } from '@/lib/quizrun-engine/data/contentRepository'
import { fallbackLearningPack } from '@/lib/quizrun-engine/data/learningPack'
import {
  advanceCombo,
  type ComboState,
} from '@/lib/quizrun-engine/combo'
import { getCollectedObjectsInOrder } from '@/lib/quizrun-engine/collectionOrder'
import {
  getCollectionAnnouncementBody,
  getCollectionAnnouncementTitle,
  getItemDisplayLabel,
} from '@/lib/quizrun-engine/itemPresentation'
import {
  advanceSessionStage,
  finishSession,
  recordCollection,
} from '@/lib/quizrun-engine/session'
import {
  activatePowerUp,
  createEmptyPowerUps,
  createPowerUpPickups,
  createRadarTreasures,
  decayPowerUps,
  hasActivePowerUp,
  POWER_UP_CONFIG,
  respawnPowerUpPickup,
  selectVisibleRadarTreasures,
  type ActivePowerUps,
  type PowerUpKind,
  type PowerUpPickup,
} from '@/lib/quizrun-engine/powerUps'
import {
  getReachableSizeTier,
  getSizeTier,
  getStageProgress,
} from '@/lib/quizrun-engine/mechanics'
import { selectActiveStageObjects } from '@/lib/quizrun-engine/objectDistribution'
import {
  createPolarBearDroppedObjects,
  createRunnerDroppedObjects,
  type DroppedLearningObject,
} from '@/lib/quizrun-engine/polarBearEncounter'
import type { SurfaceKind } from '@/lib/quizrun-engine/worldPhysics'
import type {
  AttachmentNormal,
  GameSession,
  LearningObject,
  LearningPack,
} from '@/lib/quizrun-engine/types'

import { calculateBallRadius } from '@/lib/quizrun-engine/growth'
import { charge, drain } from '@/lib/quizrun-engine/energy'
import { QuestionOverlay } from '@/components/quizrun/QuestionOverlay'
import { EnergyHud } from '@/components/quizrun/EnergyHud'
import { nextItem, patchRun, type QuizItem, type QuizRun, type QuizRunConfig } from '@/lib/quizrun'

// Vite 의 import.meta.env.DEV 대체 (러닝크루는 Next)
const IS_DEV = process.env.NODE_ENV !== "production"

let chimeContext: AudioContext | null = null

function getChimeContext(): AudioContext | null {
  if (chimeContext && chimeContext.state !== 'closed') {
    return chimeContext
  }

  const AudioContextClass =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext
      }
    ).webkitAudioContext
  if (!AudioContextClass) return null

  chimeContext = new AudioContextClass()
  return chimeContext
}

function playChime(enabled: boolean, success = true) {
  if (!enabled) return

  try {
    const context = getChimeContext()
    if (!context) return
    if (context.state === 'suspended') void context.resume()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(success ? 520 : 330, context.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(
      success ? 760 : 390,
      context.currentTime + 0.12,
    )
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.24)
    oscillator.addEventListener(
      'ended',
      () => {
        oscillator.disconnect()
        gain.disconnect()
      },
      { once: true },
    )
  } catch {
    // Sound is a progressive enhancement; gameplay remains fully usable.
  }
}

const coachSteps: {
  icon: MaterialIconName
  title: string
  body: string
}[] = [
  {
    icon: 'play_arrow',
    title: '바라보는 방향을 따라 굴려요',
    body: 'W·S(ㅈ·ㄴ)는 앞뒤, A·D(ㅁ·ㅇ)는 현재 방향의 좌우예요. 마우스를 누른 채 빠르게 드래그해 시점을 돌리고, 휠이나 태블릿의 두 손가락으로 화면을 확대·축소해요. 미니맵의 화살표 승강기를 밟으면 각 2층으로 올라갈 수 있어요.',
  },
]

function getCurrentTimestamp() {
  return Date.now()
}

function getInitialPowerUps(): ActivePowerUps {
  let active = createEmptyPowerUps()
  if (!IS_DEV) return active
  const previewEvent = new URLSearchParams(window.location.search).get('event')
  const previewKinds: PowerUpKind[] =
    previewEvent === 'all'
      ? ['magnet', 'radar', 'speed']
      : previewEvent === 'magnet' ||
          previewEvent === 'radar' ||
          previewEvent === 'speed'
        ? [previewEvent]
        : []
  previewKinds.forEach((kind) => {
    active = activatePowerUp(active, kind)
  })
  return active
}

/** Firestore 쓰기 간격(ms) — 매 프레임 쓰면 요금·쿼터가 터진다 */
const SYNC_MS = 3000

/**
 * 어솔 GamePage 를 퀴즈런으로 옮긴 판.
 *
 * 게임 자체(3D·물리·수집·성장·연출·CSS)는 원본 그대로다. 바꾼 곳은 셋뿐:
 *   1) 진행 상태 저장: sessionStorage → Firestore(runs). 교사가 실시간으로 봐야 한다
 *   2) 에너지: 움직이면 닳고, 0 이면 못 움직인다(기존 paused 경로 재사용)
 *   3) 문제 오버레이: 에너지를 충전하는 유일한 수단
 * 라우터(Redirect/navigate)는 러닝크루에선 모달 안에서 도므로 콜백으로 대체했다.
 */
export function GamePage({
  cid,
  gid,
  uid,
  cfg,
  run,
  onExit,
}: {
  cid: string
  gid: string
  uid: string
  cfg: QuizRunConfig
  run: QuizRun
  onExit: () => void
}) {
  // 진행 상태는 원본과 같은 GameSession 모양으로 메모리에 두고(게임 로직이 이걸
  // 쓴다), 주기적으로 Firestore 에 올린다.
  const [session, setSession] = useState<GameSession | null>(() => ({
    id: gid,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    score: run.score ?? 0,
    bestCombo: 0,
    currentStageIndex: run.stageIndex ?? 0,
    stageScores: {},
    collectedPowerUpIds: [],
    collectedIds: [],
    collectedLabels: [],
    attachmentNormals: {},
    durationSeconds: 0,
    status: 'playing',
  }))
  const [energy, setEnergy] = useState(run.energy ?? cfg.energyStart)
  const [correctCount, setCorrectCount] = useState(run.correct ?? 0)
  const [wrongCount, setWrongCount] = useState(run.wrong ?? 0)
  const [quizOpen, setQuizOpen] = useState(false)
  const [order, setOrder] = useState<string[]>(run.order ?? [])
  const [cursor, setCursor] = useState(run.cursor ?? 0)
  const sessionRef = useRef(session)
  const [pack, setPack] = useState<LearningPack>(fallbackLearningPack)
  const [contentReady, setContentReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [controlVector, setControlVector] = useState<ControlVector>({
    x: 0,
    z: 0,
  })
  const [playerPose, setPlayerPose] = useState<PlayerMapPose>({
    x: 0,
    y: 0.42,
    z: 0,
    headingX: 0,
    headingZ: -1,
  })
  const [toast, setToast] = useState<{
    title: string
    body: string
    tone: 'learned' | 'wait'
  } | null>(null)
  const [comboMultiplier, setComboMultiplier] = useState(1)
  const [stagePromptOpen, setStagePromptOpen] = useState(
    IS_DEV &&
      new URLSearchParams(window.location.search).get('complete') === 'true',
  )
  const [scoreFeedback, setScoreFeedback] = useState<{
    id: number
    points: number
    treasure: boolean
  } | null>(null)
  const [activePowerUps, setActivePowerUps] =
    useState<ActivePowerUps>(getInitialPowerUps)
  const toastTimer = useRef<number | undefined>(undefined)
  const comboTimer = useRef<number | undefined>(undefined)
  const scoreFeedbackTimer = useRef<number | undefined>(undefined)
  const comboStateRef = useRef<ComboState>({
    count: 0,
    lastCollectedAt: 0,
  })
  const scoreFeedbackId = useRef(0)
  const promptedStageIds = useRef(new Set<string>())
  const polarBearHitCount = useRef(0)
  const runnerHitCount = useRef(0)
  const hazardImmunityTimer = useRef<number | undefined>(undefined)
  const coachSeen = sessionStorage.getItem('earsoul-coach-v4-seen') === 'true'
  const [coachStep, setCoachStep] = useState(coachSeen ? -1 : 0)
  const reducedMotion =
    sessionStorage.getItem('earsoul-reduced-motion') === 'true'
  const effectTimerPaused = paused || coachStep >= 0 || stagePromptOpen
  const activeEffectsRunning = hasActivePowerUp(activePowerUps)

  useEffect(() => {
    let mounted = true
    loadLearningPack().then((learningPack) => {
      if (mounted) {
        setPack(learningPack)
        setContentReady(true)
      }
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (
      !session ||
      session.status !== 'playing' ||
      stagePromptOpen ||
      paused ||
      coachStep >= 0
    ) {
      return
    }

    const activeStage =
      pack.stages[
        Math.min(
          session.currentStageIndex,
          Math.max(0, pack.stages.length - 1),
        )
      ]
    if (!activeStage || promptedStageIds.current.has(activeStage.id)) return

    const activeProgress = getStageProgress(
      activeStage.objects,
      session.collectedIds,
      activeStage,
      session.stageScores?.[activeStage.id],
    )
    if (!activeProgress.ready) return

    const promptTimer = window.setTimeout(() => {
      promptedStageIds.current.add(activeStage.id)
      setControlVector({ x: 0, z: 0 })
      setStagePromptOpen(true)
    }, 0)
    return () => window.clearTimeout(promptTimer)
  }, [
    coachStep,
    pack,
    paused,
    session,
    stagePromptOpen,
  ])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && coachStep < 0) {
        setControlVector({ x: 0, z: 0 })
        setPaused((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [coachStep])

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
      if (comboTimer.current) window.clearTimeout(comboTimer.current)
      if (scoreFeedbackTimer.current) {
        window.clearTimeout(scoreFeedbackTimer.current)
      }
      if (hazardImmunityTimer.current !== undefined) {
        window.clearTimeout(hazardImmunityTimer.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (effectTimerPaused || !activeEffectsRunning) return
    let previousTick = performance.now()
    const timer = window.setInterval(() => {
      const currentTick = performance.now()
      const elapsed = currentTick - previousTick
      previousTick = currentTick
      setActivePowerUps((current) => decayPowerUps(current, elapsed))
    }, 100)

    return () => window.clearInterval(timer)
  }, [activeEffectsRunning, effectTimerPaused])

  const showToast = useCallback(
    (
      nextToast: {
        title: string
        body: string
        tone: 'learned' | 'wait'
      },
      duration = 2600,
    ) => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
      setToast(nextToast)
      toastTimer.current = window.setTimeout(() => setToast(null), duration)
    },
    [],
  )
  // 에너지는 "움직일 때만" 닳는다 — 멈춰서 다음 목표를 찾는 시간엔 유지된다.
  // 위치 변화로 이동을 감지한다(onPlayerPosition 이 매 프레임 온다).
  const lastPos = useRef<{ x: number; z: number } | null>(null)
  const lastAt = useRef(0)
  const handlePlayerPosition = useCallback(
    (pose: PlayerMapPose) => {
      setPlayerPose(pose)
      const now = Date.now()
      const prevAt = lastAt.current
      lastAt.current = now
      const prev = lastPos.current
      lastPos.current = { x: pose.x, z: pose.z }
      if (!prev || prevAt === 0) return
      const delta = (now - prevAt) / 1000
      if (delta <= 0 || delta > 1) return // 탭 복귀 등 큰 간격은 무시
      if (Math.hypot(pose.x - prev.x, pose.z - prev.z) <= 0.01) return
      setEnergy((e) => drain(e, true, delta, cfg))
    },
    [cfg],
  )

  const startHazardImmunity = useCallback(() => {
    if (hazardImmunityTimer.current !== undefined) return false
    hazardImmunityTimer.current = window.setTimeout(() => {
      hazardImmunityTimer.current = undefined
    }, 2_500)
    return true
  }, [])

  // ── 문제 ──
  const quizItem: QuizItem | null = useMemo(
    () => nextItem(cfg.items, { order, cursor, uid }).item,
    [cfg.items, order, cursor, uid],
  )

  const handleAnswer = useCallback(
    (isCorrect: boolean) => {
      if (isCorrect) {
        setEnergy((e) => charge(e, cfg))
        setCorrectCount((c) => c + 1)
      } else {
        setWrongCount((w) => w + 1)
      }
      // 정답·오답 모두 다음 문제로(재도전 없음). 한 바퀴 돌면 다시 섞인다.
      const after = nextItem(cfg.items, { order, cursor: cursor + 1, uid })
      if (after.order !== order) setOrder(after.order)
      setCursor(after.cursor)
    },
    [cfg, order, cursor, uid],
  )

  const previewStageIndex = IS_DEV
    ? Number(new URLSearchParams(window.location.search).get('stage')) - 1
    : Number.NaN
  const stageIndex = Math.min(
    Number.isInteger(previewStageIndex) && previewStageIndex >= 0
      ? previewStageIndex
      : (session?.currentStageIndex ?? 0),
    Math.max(0, pack.stages.length - 1),
  )
  const stage = pack.stages[stageIndex] ?? fallbackLearningPack.stages[0]
  const initialPowerUpPickups = useMemo(
    () => createPowerUpPickups(stage),
    [stage],
  )
  const [respawnedPowerUpsByStage, setRespawnedPowerUpsByStage] = useState<
    Record<string, PowerUpPickup[]>
  >({})
  const [droppedObjectsByStage, setDroppedObjectsByStage] = useState<
    Record<string, DroppedLearningObject[]>
  >({})
  const powerUpPickups =
    respawnedPowerUpsByStage[stage.id] ?? initialPowerUpPickups
  const droppedObjects = droppedObjectsByStage[stage.id] ?? []

  const radarTreasurePool = useMemo(
    () => createRadarTreasures(stage),
    [stage],
  )

  // 시작 시각을 서버에도 한 번 남긴다. joinRun 은 null 로 두므로 이걸 안 하면
  // finishedAt 만 있고 startedAt 이 없어 완주 시간(동점자 정렬)이 항상 null 이 된다.
  const startStamped = useRef(false)
  useEffect(() => {
    if (startStamped.current) return
    startStamped.current = true
    void patchRun(cid, gid, uid, { startedAt: Date.now() }).catch(() => {})
  }, [cid, gid, uid])

  // 진행 상태를 주기적으로 서버에 올린다(매 프레임 쓰면 요금·쿼터가 터진다).
  useEffect(() => {
    const t = setInterval(() => {
      const cur = sessionRef.current
      if (!cur) return
      // 공 크기는 렌더 값을 ref 로 빼돌리는 대신 여기서 session 으로부터
      // 다시 계산한다(같은 순수 함수).
      const curStage = pack.stages[cur.currentStageIndex] ?? pack.stages[0]
      const here = curStage
        ? getStageProgress(
            curStage.objects,
            cur.collectedIds,
            curStage,
            cur.stageScores?.[curStage.id],
          )
        : null
      void patchRun(cid, gid, uid, {
        status: 'playing',
        energy,
        score: cur.score,
        // 등수의 기준 — 맵을 넘나들며 모은 오브젝트 총 개수
        collected: cur.collectedIds.length,
        correct: correctCount,
        wrong: wrongCount,
        stageIndex: cur.currentStageIndex,
        ballRadius: here?.ballRadius ?? 0,
        order,
        cursor,
      }).catch(() => {})
    }, SYNC_MS)
    return () => clearInterval(t)
  }, [cid, gid, uid, energy, correctCount, wrongCount, order, cursor, pack])

  if (!session) return null

  const stageProgress = getStageProgress(
    stage.objects,
    session.collectedIds,
    stage,
    session.stageScores?.[stage.id],
  )
  const previewTierFour =
    IS_DEV &&
    new URLSearchParams(window.location.search).get('preview') === 'tier4'
  // HUD 의 "n/목표개" 는 레벨 목표에 반영된 개수를 쓴다. 그냥 주운 총 개수를
  // 쓰면 한 레벨에서 초과로 모았을 때 95/40 처럼 목표를 넘고도 안 끝나는
  // 화면이 나온다 — 초과분은 아래 bonusCount 로 따로 알려 준다.
  const stageCollectedCount = previewTierFour
    ? stage.objectiveCount
    : stageProgress.effectiveCount
  const droppedObjectIds = new Set(droppedObjects.map((item) => item.id))
  const collectedAttachedObjects = getCollectedObjectsInOrder(
    stage.objects,
    session.collectedIds,
  ).filter((item) => !droppedObjectIds.has(item.id))
  const attachedObjects = previewTierFour
    ? stage.objects
        .filter((item) => getSizeTier(item.size).level === 4)
        .slice(0, 28)
    : collectedAttachedObjects
  const stageReady = stageProgress.ready
  const bonusCount = stageProgress.bonusCount
  // 공 크기는 레벨별 달성분으로 정해진다(getStageProgress 가 계산). dev 의
  // tier4 미리보기만 목표를 다 채운 상태의 반지름을 따로 구한다.
  const ballRadius = previewTierFour
    ? calculateBallRadius(
        stage.objectiveCount,
        stage.tierGoals.reduce<number[]>(
          (acc, goal) => [...acc, (acc[acc.length - 1] ?? 0) + goal.requiredCount],
          [],
        ),
      )
    : stageProgress.ballRadius
  const progress = stageProgress.progress
  const illuminationProgress = Math.min(
    1,
    stageCollectedCount / Math.max(1, stage.objectiveCount),
  )
  const illuminationPercent = Math.round(illuminationProgress * 100)
  const reachableTier = getReachableSizeTier(ballRadius)
  const activeStageObjects = selectActiveStageObjects(
    stage.objects,
    reachableTier.level,
  )
  // 레벨별 진행분(collectedCount)을 써야 하므로 폴백도 tierProgress 에서 집는다
  const nextTierGoal =
    stageProgress.nextTierGoal ??
    stageProgress.tierProgress[stageProgress.tierProgress.length - 1]
  const availablePowerUpPickups = powerUpPickups
  const visibleRadarTreasures =
    activePowerUps.radar > 0
      ? selectVisibleRadarTreasures(
          radarTreasurePool,
          session.collectedIds,
          ballRadius,
        )
      : []

  const handleCollect = (
    item: LearningObject,
    attachmentNormal: AttachmentNormal,
  ) => {
    const current = sessionRef.current
    if (!current || current.collectedIds.includes(item.id)) return

    const collectedAt = getCurrentTimestamp()
    const comboStep = advanceCombo(comboStateRef.current, collectedAt)
    const { multiplier } = comboStep
    const awardedPoints = item.points * multiplier
    const isRadarTreasure = item.modelId === 'radar-treasure'
    const displayLabel = getItemDisplayLabel(item)
    const presentedItem =
      displayLabel === item.label ? item : { ...item, label: displayLabel }
    const next = recordCollection(current, presentedItem, {
      multiplier,
      combo: multiplier,
      attachmentNormal,
    })

    comboStateRef.current = {
      count: comboStep.count,
      lastCollectedAt: comboStep.lastCollectedAt,
    }
    setComboMultiplier(multiplier)
    if (comboTimer.current) window.clearTimeout(comboTimer.current)
    comboTimer.current = window.setTimeout(() => {
      comboStateRef.current = {
        count: 0,
        lastCollectedAt: 0,
      }
      setComboMultiplier(1)
    }, Math.max(0, comboStep.expiresAt - collectedAt))

    scoreFeedbackId.current += 1
    setScoreFeedback({
      id: scoreFeedbackId.current,
      points: awardedPoints,
      treasure: isRadarTreasure,
    })
    if (scoreFeedbackTimer.current) {
      window.clearTimeout(scoreFeedbackTimer.current)
    }
    scoreFeedbackTimer.current = window.setTimeout(
      () => setScoreFeedback(null),
      1100,
    )

    sessionRef.current = next
    setSession(next)
    playChime(soundEnabled)
    showToast({
      title:
        isRadarTreasure
          ? `무지개 보물 +${awardedPoints}`
          : getCollectionAnnouncementTitle(
              presentedItem,
              awardedPoints,
              multiplier,
            ),
      body: getCollectionAnnouncementBody(presentedItem),
      tone: 'learned',
    })
  }

  const handlePowerUpCollect = (pickup: PowerUpPickup) => {
    const current = sessionRef.current
    if (
      !current ||
      !powerUpPickups.some(
        (activePickup) => activePickup.id === pickup.id,
      )
    ) {
      return
    }
    const config = POWER_UP_CONFIG[pickup.kind]
    const nextPickups = respawnPowerUpPickup(
      stage,
      powerUpPickups,
      pickup.id,
      playerPose,
    )

    setActivePowerUps((active) => activatePowerUp(active, pickup.kind))
    setRespawnedPowerUpsByStage((currentPickups) => ({
      ...currentPickups,
      [stage.id]: nextPickups,
    }))
    playChime(soundEnabled)
    showToast(
      {
        title: `${config.label} 발동`,
        body:
          pickup.kind === 'magnet'
            ? '10초 동안 현재 크기로 모을 수 있는 가까운 물건을 끌어당겨요.'
            : pickup.kind === 'radar'
              ? '30초 동안 무지개 고득점 보물이 나타나고 미니맵에 표시돼요.'
              : '10초 동안 구르는 최고 속도가 최대 50% 빨라져요.',
        tone: 'learned',
      },
      3000,
    )
  }

  const handlePolarBearHit = (position: {
    x: number
    z: number
  }): boolean => {
    if (!startHazardImmunity()) return false

    polarBearHitCount.current += 1
    const newlyDropped = createPolarBearDroppedObjects(
      stage,
      attachedObjects,
      droppedObjects,
      {
        x: playerPose.x,
        y: playerPose.y,
        z: playerPose.z,
        ballRadius,
      },
      polarBearHitCount.current,
      undefined,
      position,
    )
    if (newlyDropped.length === 0) {
      showToast(
        {
          title: '무서운 북극곰과 충돌!',
          body: '아직 공에 붙은 물건이 없어 떨어진 것은 없어요.',
          tone: 'wait',
        },
        2600,
      )
      return true
    }

    setDroppedObjectsByStage((current) => ({
      ...current,
      [stage.id]: [...(current[stage.id] ?? []), ...newlyDropped],
    }))
    showToast(
      {
        title: '무서운 북극곰과 충돌!',
        body: `수집물 ${newlyDropped.length}개를 떨어뜨렸어요. 주변의 주황색 물건을 다시 모아보세요.`,
        tone: 'wait',
      },
      3000,
    )
    return true
  }

  const handleRunnerHit = (
    position: { x: number; z: number },
    runnerId: string,
  ): boolean => {
    if (!startHazardImmunity()) return false

    runnerHitCount.current += 1
    const newlyDropped = createRunnerDroppedObjects(
      stage,
      attachedObjects,
      droppedObjects,
      {
        x: playerPose.x,
        y: playerPose.y,
        z: playerPose.z,
        ballRadius,
      },
      runnerHitCount.current,
      runnerId,
      position,
    )
    if (newlyDropped.length === 0) {
      showToast(
        {
          title: '러닝크루와 충돌!',
          body: '아직 공에 붙은 물건이 없어 떨어진 것은 없어요.',
          tone: 'wait',
        },
        2400,
      )
      return true
    }

    setDroppedObjectsByStage((current) => ({
      ...current,
      [stage.id]: [...(current[stage.id] ?? []), ...newlyDropped],
    }))
    showToast(
      {
        title: '러닝크루와 충돌!',
        body: `수집물 ${newlyDropped.length}개를 떨어뜨렸어요. 주변의 주황색 물건을 다시 모아보세요.`,
        tone: 'wait',
      },
      2800,
    )
    return true
  }

  const handleRecoverDropped = (item: LearningObject) => {
    setDroppedObjectsByStage((current) => ({
      ...current,
      [stage.id]: (current[stage.id] ?? []).filter(
        (dropped) => dropped.id !== item.id,
      ),
    }))
    showToast(
      {
        title: `${getItemDisplayLabel(item)} 되찾기`,
        body: `떨어진 물건을 다시 러닝볼에 붙였어요.`,
        tone: 'learned',
      },
      1800,
    )
  }

  const handleTooLarge = (item: LearningObject) => {
    const itemTier = getSizeTier(item.size)
    const displayLabel = getItemDisplayLabel(item)
    showToast(
      {
        title: `아직은 인사만 · ${displayLabel}`,
        body: `${itemTier.level}단계 ${itemTier.label}이에요. 러닝볼을 조금 더 키우면 붙일 수 있어요.`,
        tone: 'wait',
      },
      1800,
    )
  }

  const handlePhysicsFeedback = (feedback: {
    type: 'collision' | 'boost' | 'slow' | 'slide' | 'elevator'
    label: string
    bounced?: boolean
    surfaceKind?: SurfaceKind
  }) => {
    if (feedback.type === 'boost') {
      showToast(
        {
          title: `${feedback.label} · 속도 상승`,
          body: '빛나는 길을 따라 달리면 더 빠르게 굴러가요.',
          tone: 'learned',
        },
        1500,
      )
      return
    }

    if (feedback.type === 'slide') {
      showToast(
        {
          title: `${feedback.label} · 빙판 구간`,
          body: '공은 가던 방향으로 계속 미끄러져요. 회전과 제동이 늦으니 커브 전에 미리 방향을 잡아요.',
          tone: 'wait',
        },
        2300,
      )
      return
    }

    if (feedback.type === 'slow') {
      showToast(
        {
          title: `${feedback.label} · 천천히 구간`,
          body: feedback.surfaceKind === 'water'
            ? '물결이 발밑에서 퍼지고 물방울이 튀어요. 얕은 물에서는 천천히 방향을 잡아요.'
            : feedback.surfaceKind === 'mud'
              ? '진흙에 바퀴가 푹 빠져 속도가 크게 줄어요. 힘을 주어 천천히 빠져나와요.'
              : '잔디에서는 속도가 줄어요. 방향을 잡고 천천히 통과해요.',
          tone: 'wait',
        },
        1600,
      )
      return
    }

    if (feedback.type === 'elevator') {
      showToast(
        {
          title: `${feedback.label} 작동`,
          body: '발판이 2층 보물마당까지 올라가요. 위에 도착하면 천천히 굴러 내려요.',
          tone: 'learned',
        },
        2400,
      )
      return
    }

    playChime(soundEnabled, false)
    showToast(
      {
        title: `${feedback.label}에 부딪혔어요`,
        body: feedback.bounced
          ? '러닝볼이 살짝 뒤로 튕겼어요. 방향을 바꿔 다시 출발해요.'
          : '러닝볼이 멈췄어요. 좌우로 돌아서 다른 길을 찾아봐요.',
        tone: 'wait',
      },
      1500,
    )
  }

  const finish = () => {
    const current = sessionRef.current
    if (!current) return
    const completed = finishSession(current)
    sessionRef.current = completed
    setSession(completed)
    // 라우팅 대신 Firestore 에 마감 기록 후 상위(모달)에 알린다
    void patchRun(cid, gid, uid, {
      status: 'done',
      score: completed.score,
      collected: completed.collectedIds.length,
      correct: correctCount,
      wrong: wrongCount,
      stageIndex: completed.currentStageIndex,
      finishedAt: Date.now(),
    }).catch(() => {})
    onExit()
  }

  const moveToNextStage = () => {
    const current = sessionRef.current
    if (!current) return
    if (stageIndex >= pack.stages.length - 1) {
      finish()
      return
    }

    const nextStageIndex = stageIndex + 1
    const next = advanceSessionStage(current, nextStageIndex)
    const nextStage = pack.stages[nextStageIndex]
    comboStateRef.current = { count: 0, lastCollectedAt: 0 }
    setActivePowerUps(createEmptyPowerUps())
    setComboMultiplier(1)
    setControlVector({ x: 0, z: 0 })
    setPlayerPose({ x: 0, y: 0.42, z: 0, headingX: 0, headingZ: -1 })
    setStagePromptOpen(false)
    sessionRef.current = next
    setSession(next)
    showToast(
      {
        title: `${nextStageIndex + 1}단계 · ${nextStage.title}`,
        body: nextStage.description,
        tone: 'learned',
      },
      3200,
    )
  }

  // 러닝크루에선 기록이 서버에 있어 나가도 사라지지 않는다 — 확인창도 뺐다.
  const leaveForHome = () => {
    onExit()
  }

  const outOfEnergy = energy <= 0
  // 에너지가 없으면 문제창을 연다(파생값 — effect 로 하면 한 프레임 깜빡인다)
  const showQuiz = quizOpen || outOfEnergy
  // 기존 일시정지 경로를 그대로 쓴다 — 물리·렌더 코드를 건드리지 않고 이동만 멈춘다
  const isGamePaused =
    paused || coachStep >= 0 || stagePromptOpen || showQuiz || outOfEnergy

  return (
    <main id="main-content" className="quizrun-root game-page">
      <div
        className="game-stage"
        aria-label={`${stage.title} 3D 놀이 화면`}
      >
        <GameCanvas
          key={stage.id}
          stage={stage}
          stageObjects={activeStageObjects}
          attachedObjects={attachedObjects}
          droppedObjects={droppedObjects}
          attachmentNormals={session.attachmentNormals}
          collectedIds={session.collectedIds}
          ballRadius={ballRadius}
          illuminationProgress={illuminationProgress}
          paused={isGamePaused}
          reducedMotion={reducedMotion}
          controlVector={controlVector}
          activePowerUps={activePowerUps}
          powerUpPickups={availablePowerUpPickups}
          radarTreasures={visibleRadarTreasures}
          onPlayerPosition={handlePlayerPosition}
          onCollect={handleCollect}
          onPowerUpCollect={handlePowerUpCollect}
          onRecoverDropped={handleRecoverDropped}
          onRunnerHit={handleRunnerHit}
          onPolarBearHit={handlePolarBearHit}
          onTooLarge={handleTooLarge}
          onPhysicsFeedback={handlePhysicsFeedback}
        />
      </div>

      <header className="game-hud" aria-label="놀이 상태와 설정">
        <EnergyHud
          energy={energy}
          energyMax={cfg.energyMax}
          drainPerSec={cfg.drainPerSec}
          onOpenQuiz={() => setQuizOpen(true)}
        />
        <section
          className="game-size-status"
          data-tier={reachableTier.level}
          style={{ '--tier-color': reachableTier.color } as CSSProperties}
          aria-label={`${pack.stages.length}개 중 ${stageIndex + 1}번째 맵 ${stage.title}, ${reachableTier.level}단계 크기, ${stageCollectedCount}개 수집, 목표 ${stage.objectiveCount}개${stage.theme === 'forest-trail' ? `, 공의 빛 ${illuminationPercent}%` : ''}`}
        >
          <span
            className="game-size-status__level"
            aria-hidden="true"
          >
            <small>크기</small>
            <strong>{reachableTier.level}</strong>
          </span>
          <div className="game-size-status__copy">
            <span>
              맵 {stageIndex + 1}/{pack.stages.length} ·{' '}
              {stage.theme === 'forest-trail' &&
                `공의 빛 ${illuminationPercent}% · `}
              {stageReady
                ? '수집 목표 완료'
                : `다음 크기까지 ${Math.max(
                    0,
                    nextTierGoal.requiredCount - nextTierGoal.collectedCount,
                  )}개`}
            </span>
            <strong>{stage.title}</strong>
            <M3LinearProgress
              className="game-size-progress"
              aria-label="현재 맵 오브젝트 수집 목표"
              aria-valuetext={`${stage.objectiveCount}개 중 ${stageCollectedCount}개를 모았어요`}
              value={progress}
            />
          </div>
          <span className="game-size-status__count" aria-hidden="true">
            <strong>{stageCollectedCount}</strong>
            <small>/{stage.objectiveCount}개</small>
          </span>
          <ol className="game-tier-legend" aria-label="현재 맵의 네 크기 단계">
            {stage.tierGoals.map((tierGoal) => {
              const tierStatus = stageProgress.tierProgress.find(
                (tier) => tier.level === tierGoal.level,
              )
              const isCurrent =
                !stageReady && nextTierGoal.level === tierGoal.level

              return (
                <li
                  key={tierGoal.level}
                  className={[
                    tierStatus?.ready ? 'is-reached' : '',
                    isCurrent ? 'is-current' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`${tierGoal.level}단계, ${tierGoal.requiredCount}개 중 ${
                    tierStatus?.collectedCount ?? 0
                  }개 수집${tierStatus?.ready ? ' 달성' : ''}`}
                >
                  <i aria-hidden="true" />
                  {/* 목표만 보여 주면 "지금 이 단계에서 몇 개 모았는지"를 알 수 없다.
                      모은 개수를 앞에 붙여 남은 개수를 바로 셀 수 있게 한다. */}
                  <span>
                    {tierGoal.level} ·{' '}
                    {Math.min(
                      tierStatus?.collectedCount ?? 0,
                      tierGoal.requiredCount,
                    )}
                    /{tierGoal.requiredCount}개
                  </span>
                </li>
              )
            })}
          </ol>
        </section>

        <div className="game-hud__actions">
          <div
            className="game-score-stack"
            role="group"
            aria-label={`수집하며 누적한 점수 ${session.score.toLocaleString()}점`}
          >
            <div
              className={`game-score ${
                scoreFeedback ? 'is-increasing' : ''
              }`}
              aria-label={`누적 점수 ${session.score.toLocaleString()}점`}
            >
              <MaterialIcon name="star" />
              <span>점수</span>
              <strong>{session.score.toLocaleString()}</strong>
              {scoreFeedback && (
                <span
                  key={scoreFeedback.id}
                  className={`game-score__gain ${
                    scoreFeedback.treasure ? 'is-treasure' : ''
                  }`}
                  aria-hidden="true"
                >
                  +{scoreFeedback.points}
                </span>
              )}
            </div>
            <div
              className={`game-combo ${
                comboMultiplier > 1 ? 'is-active' : ''
              }`}
              role="status"
              aria-live="polite"
              aria-label={`현재 ${comboMultiplier}배 콤보, 최고 ${session.bestCombo ?? 0}배 콤보`}
            >
              <MaterialIcon name="progress_activity" />
              <strong>x{comboMultiplier}</strong>
              <span>콤보</span>
              <small>최고 x{session.bestCombo ?? 0}</small>
              {comboMultiplier > 1 && (
                <i
                  key={scoreFeedback?.id ?? comboMultiplier}
                  className="game-combo__timer"
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
          <M3IconButton
            className="hud-button"
            onClick={() => setSoundEnabled((current) => !current)}
            aria-label={soundEnabled ? '효과음 끄기' : '효과음 켜기'}
            icon={soundEnabled ? 'volume_up' : 'volume_off'}
            selected={soundEnabled}
            toggle
          />
          <M3IconButton
            className="hud-button"
            onClick={() => {
              setControlVector({ x: 0, z: 0 })
              setPaused(true)
            }}
            aria-label="일시정지"
            icon="pause"
          />
        </div>
      </header>

      <GameEventTray
        activePowerUps={activePowerUps}
        radarTreasureCount={visibleRadarTreasures.length}
      />

      {stageReady && !stagePromptOpen && !paused && coachStep < 0 && (
        <M3Button
          className="stage-ready-button"
          icon={stageIndex < pack.stages.length - 1 ? 'arrow_forward' : 'star'}
          onClick={() => {
            setControlVector({ x: 0, z: 0 })
            setStagePromptOpen(true)
          }}
        >
          {stageIndex < pack.stages.length - 1
            ? '수집 목표 달성 · 다음 맵'
            : '기록 완성하기'}
        </M3Button>
      )}

      <div className="desktop-controls" aria-hidden="true">
        <span>
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd>
        </span>
        <p>한글 ㅈㅁㄴㅇ·방향키도 가능해요</p>
        <span className="desktop-controls__mouse">
          <MaterialIcon name="mouse" />
          <small>드래그 회전(우클릭 권장)</small>
          <MaterialIcon name="zoom_in" />
          <small>휠·핀치 줌</small>
        </span>
      </div>

      <div className="mobile-controls">
        {!isGamePaused && <TouchJoystick onChange={setControlVector} />}
      </div>

      <GameMiniMap
        stage={stage}
        objects={activeStageObjects}
        collectedIds={session.collectedIds}
        player={playerPose}
        radarTreasures={visibleRadarTreasures}
      />

      <div
        className={`game-collection-status ${
          toast ? `is-${toast.tone}` : 'is-idle'
        }`}
        role="status"
        aria-live="polite"
      >
        <span>
          <MaterialIcon
            name={
              toast
                ? toast.tone === 'learned'
                  ? 'wand_stars'
                  : 'trending_up'
                : 'adjust'
            }
          />
        </span>
        <div>
          <strong>
            {toast
              ? toast.title
              : stageReady
                ? `${stage.title} 수집 목표를 달성했어요`
                : stage.theme === 'forest-trail'
                  ? `${stageCollectedCount}/${stage.objectiveCount}개 수집 · 공의 빛 ${illuminationPercent}%`
                : `${stageCollectedCount}/${stage.objectiveCount}개 수집 · ${reachableTier.level}단계 크기`}
          </strong>
          <p>
            {toast
              ? toast.body
              : stageReady
                ? bonusCount > 0
                  ? `보너스 ${bonusCount}개 · 더 모으거나 다음 맵으로 갈 수 있어요.`
                  : '다음 맵으로 갈 수 있어요. 더 모으는 것은 선택이에요.'
                : stage.theme === 'forest-trail'
                  ? `수집할수록 러닝볼의 빛과 시야가 넓어져요. 다음 크기까지 ${Math.max(
                      0,
                      nextTierGoal.requiredCount - nextTierGoal.collectedCount,
                    )}개 남았어요.`
                  : `${nextTierGoal.label}까지 ${Math.max(
                      0,
                      nextTierGoal.requiredCount - nextTierGoal.collectedCount,
                    )}개만 더 모아요. 점수는 자연스럽게 누적돼요.`}
          </p>
        </div>
      </div>

      {!contentReady && (
        <div className="content-status" role="status">
          러닝 파크를 준비하고 있어요…
        </div>
      )}

      {coachStep >= 0 && (
        <div className="modal-backdrop">
          <section
            className="coach-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="coach-title"
          >
            <div className="coach-card__icon">
              <MaterialIcon name={coachSteps[coachStep].icon} />
            </div>
            <h2 id="coach-title">{coachSteps[coachStep].title}</h2>
            <p>{coachSteps[coachStep].body}</p>
            <M3Button
              className="primary-button primary-button--wide"
              icon="play_arrow"
              onClick={() => {
                sessionStorage.setItem('earsoul-coach-v4-seen', 'true')
                setCoachStep(-1)
              }}
            >
              바로 굴리기
            </M3Button>
          </section>
        </div>
      )}

      {stagePromptOpen && (
        <div className="modal-backdrop">
          <section
            className="stage-complete-card"
            style={{ '--stage-accent': stage.accentColor } as CSSProperties}
            role="dialog"
            aria-modal="true"
            aria-labelledby="stage-complete-title"
          >
            <span className="stage-complete-card__icon">
              <MaterialIcon
                name={
                  stage.theme === 'sunny-plaza'
                    ? 'directions_run'
                    : stage.theme === 'forest-trail'
                      ? 'dark_mode'
                      : 'diamond'
                }
              />
            </span>
            <p className="section-kicker">
              맵 {stageIndex + 1}/{pack.stages.length} 수집 목표 달성
            </p>
            <h2 id="stage-complete-title">{stage.title} 완주!</h2>
            <p>
              목표 오브젝트 {stage.objectiveCount}개를 모두 수집했어요.
              {bonusCount > 0 && ` 보너스 아이템도 ${bonusCount}개 더 찾았어요.`}
            </p>
            <div className="stage-complete-card__stats">
              <span>
                <MaterialIcon name="adjust" />
                {stageCollectedCount}개 수집
              </span>
              <span>
                <MaterialIcon name="star" />
                {stageProgress.stageScore.toLocaleString()}점 · 최고 x{session.bestCombo}
              </span>
            </div>
            <M3Button
              className="primary-button primary-button--wide"
              icon={
                stageIndex < pack.stages.length - 1
                  ? 'arrow_forward'
                  : 'star'
              }
              onClick={moveToNextStage}
              autoFocus
            >
              {stageIndex < pack.stages.length - 1
                ? `${pack.stages[stageIndex + 1].title}로`
                : '이번 기록 완성하기'}
            </M3Button>
            <M3Button
              className="secondary-button secondary-button--wide"
              variant="tonal"
              icon="directions_run"
              onClick={() => setStagePromptOpen(false)}
            >
              이 맵에서 보너스 더 모으기
            </M3Button>
          </section>
        </div>
      )}

      {paused && (
        <div className="modal-backdrop">
          <section
            className="pause-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-title"
          >
            <span className="pause-card__icon">
              <MaterialIcon name="pause_circle" />
            </span>
            <p className="section-kicker">잠깐 쉬어가요</p>
            <h2 id="pause-title">러닝볼도 숨을 고르는 중!</h2>
            <p>준비되면 같은 자리에서 다시 시작할 수 있어요.</p>
            <M3Button
              className="primary-button primary-button--wide"
              icon="play_arrow"
              onClick={() => setPaused(false)}
              autoFocus
            >
              계속 굴리기
            </M3Button>
            <M3Button
              className="secondary-button secondary-button--wide"
              variant="tonal"
              onClick={finish}
            >
              이번 기록 보기
            </M3Button>
            <M3Button
              className="text-button"
              variant="text"
              icon="home"
              onClick={leaveForHome}
            >
              이번 기록을 지우고 처음으로
            </M3Button>
          </section>
        </div>
      )}
      {showQuiz && quizItem && (
        <QuestionOverlay
          key={quizItem.id}
          item={quizItem}
          energy={energy}
          energyMax={cfg.energyMax}
          chargePerCorrect={cfg.chargePerCorrect}
          wrongLockSec={cfg.wrongLockSec}
          onAnswer={handleAnswer}
          canClose={!outOfEnergy}
          onClose={() => setQuizOpen(false)}
        />
      )}
    </main>
  )
}
