import type {
  GameStage,
  LearningObject,
  LearningPack,
  StageTierGoal,
  StageTheme,
  StageUnlockRequirement,
} from '../types'
import {
  getSizeTier,
  isCollectionPositionClear,
} from '../mechanics'
import {
  createWorldPhysicsLayout,
  getElevatedPlatformSurfacePosition,
  getTerrainRampSurfacePosition,
} from '../worldPhysics'

const objectTemplates: LearningObject[] = [
  {
    id: 'runner-lace',
    label: '번개 운동화 끈',
    fact: '살랑살랑 흔들리는 첫 번째 러닝 보물!',
    subject: '생활',
    size: 0.22,
    points: 10,
    color: '#FF6B6B',
    shape: 'torus',
    position: [-1.8, 0, -1.2],
  },
  {
    id: 'crew-badge',
    label: '새싹 크루 배지',
    fact: '오늘부터 우리도 한 팀이에요.',
    subject: '한글',
    size: 0.24,
    points: 10,
    color: '#38BDF8',
    shape: 'cylinder',
    position: [2, 0, -1.5],
  },
  {
    id: 'treasure-shard',
    label: '햇살 보물조각',
    fact: '빛을 받으면 꿀빛으로 반짝여요.',
    subject: '과학',
    size: 0.26,
    points: 12,
    color: '#FBBF24',
    shape: 'cone',
    position: [0.4, 0, 2.2],
  },
  {
    id: 'tiny-gem',
    label: '민트빛 보석',
    fact: '주머니에 쏙 들어가는 작은 행운이에요.',
    subject: '과학',
    size: 0.28,
    points: 12,
    color: '#2DD4BF',
    shape: 'sphere',
    position: [5.5, 0, -2.5],
  },
  {
    id: 'wristband',
    label: '응원 손목밴드',
    fact: '손을 흔들면 크루 색이 빙글 돌아요.',
    subject: '생활',
    size: 0.31,
    points: 14,
    color: '#A78BFA',
    shape: 'torus',
    position: [-5.8, 0, 3],
  },
  {
    id: 'key-charm',
    label: '별 열쇠고리',
    fact: '어떤 문을 열지는 상상에 맡겨요.',
    subject: '한글',
    size: 0.34,
    points: 15,
    color: '#F59E0B',
    shape: 'torus',
    position: [7.2, 0, 4],
  },
  {
    id: 'mini-can',
    label: '톡톡 음료수 캔',
    fact: '흔들지 않고 시원하게 챙겼어요.',
    subject: '생활',
    size: 0.38,
    points: 17,
    color: '#FB7185',
    shape: 'cylinder',
    position: [-8.5, 0, -4],
  },
  {
    id: 'cap-pin',
    label: '무지개 모자 핀',
    fact: '모자에 꽂으면 오늘의 포인트 완성!',
    subject: '한글',
    size: 0.42,
    points: 19,
    color: '#F472B6',
    shape: 'cylinder',
    position: [2.5, 0, 9],
  },
  {
    id: 'water-bottle',
    label: '찰랑 물병',
    fact: '달리기 전후에는 물 한 모금이 최고예요.',
    subject: '과학',
    size: 0.48,
    points: 22,
    color: '#0EA5E9',
    shape: 'cylinder',
    position: [-11, 0, 2],
  },
  {
    id: 'stopwatch',
    label: '반짝 스톱워치',
    fact: '기록보다 즐겁게 달린 순간을 기억해요.',
    subject: '수학',
    size: 0.52,
    points: 24,
    color: '#F97316',
    shape: 'cylinder',
    position: [10.5, 0, -5.5],
  },
  {
    id: 'running-cap',
    label: '바람 러닝캡',
    fact: '챙을 살짝 내리면 탐험 준비 끝!',
    subject: '생활',
    size: 0.56,
    points: 26,
    color: '#22C55E',
    shape: 'sphere',
    position: [6, 0, 12],
  },
  {
    id: 'sunglasses',
    label: '구름 선글라스',
    fact: '세상이 조금 더 신나는 색으로 보여요.',
    subject: '과학',
    size: 0.6,
    points: 28,
    color: '#8B5CF6',
    shape: 'torus',
    position: [-12, 0, -8.5],
  },
  {
    id: 'wristwatch',
    label: '크루 손목시계',
    fact: '지금은 친구와 함께 뛸 시간!',
    subject: '수학',
    size: 0.65,
    points: 30,
    color: '#2563EB',
    shape: 'cylinder',
    position: [15, 0, 2],
  },
  {
    id: 'headphones',
    label: '둥실 헤드폰',
    fact: '발걸음마다 나만의 리듬이 들려요.',
    subject: '생활',
    size: 0.7,
    points: 32,
    color: '#EC4899',
    shape: 'torus',
    position: [-4, 0, 16],
  },
  {
    id: 'small-box',
    label: '비밀 스티커 상자',
    fact: '뚜껑 안에는 크루 스티커가 가득해요.',
    subject: '한글',
    size: 0.75,
    points: 34,
    color: '#F59E0B',
    shape: 'box',
    position: [13, 0, 11],
  },
  {
    id: 'running-shoe',
    label: '한 짝 운동화',
    fact: '짝꿍 신발을 찾아 공원을 달려 봐요.',
    subject: '생활',
    size: 0.8,
    points: 36,
    color: '#14B8A6',
    shape: 'box',
    position: [-16, 0, 7],
  },
  {
    id: 'crew-medal',
    label: '함께 달린 메달',
    fact: '빠른 사람보다 끝까지 웃은 사람이 주인공!',
    subject: '수학',
    size: 0.82,
    points: 40,
    color: '#FBBF24',
    shape: 'cylinder',
    position: [-18, 0, -7],
  },
  {
    id: 'play-ball',
    label: '별무늬 놀이공',
    fact: '통통 튀는 상상만으로도 기분이 좋아져요.',
    subject: '생활',
    size: 0.87,
    points: 42,
    color: '#60A5FA',
    shape: 'sphere',
    position: [8, 0, -18],
  },
  {
    id: 'skateboard',
    label: '노을 스케이트보드',
    fact: '바퀴가 데굴데굴 공원 바람을 만나요.',
    subject: '생활',
    size: 0.93,
    points: 45,
    color: '#FB7185',
    shape: 'box',
    position: [19, 0, 6],
  },
  {
    id: 'gem-cluster',
    label: '별빛 보석송이',
    fact: '세 빛깔 보석이 서로 기대어 반짝여요.',
    subject: '과학',
    size: 0.99,
    points: 48,
    color: '#A78BFA',
    shape: 'cone',
    position: [-10, 0, 19],
  },
  {
    id: 'treasure-box',
    label: '크루 보물상자',
    fact: '함께 모은 추억이 가장 반짝이는 보물이에요.',
    subject: '한글',
    size: 1.04,
    points: 52,
    color: '#D97706',
    shape: 'box',
    position: [17, 0, -14],
  },
  {
    id: 'hydration-pack',
    label: '찰랑 러닝 가방',
    fact: '물병을 챙겨 멀리 탐험할 준비 완료!',
    subject: '과학',
    size: 1.1,
    points: 56,
    color: '#10B981',
    shape: 'box',
    position: [-21, 0, 9],
  },
  {
    id: 'running-shoe-pair',
    label: '짝꿍 운동화',
    fact: '왼발 오른발이 만나면 어디든 갈 수 있어요.',
    subject: '생활',
    size: 1.15,
    points: 60,
    color: '#3B82F6',
    shape: 'box',
    position: [2, 0, 23],
  },
  {
    id: 'giant-sneaker',
    label: '슈퍼 크루 운동화',
    fact: '구름처럼 폭신해 보이는 커다란 운동화예요.',
    subject: '생활',
    size: 1.18,
    points: 66,
    color: '#F43F5E',
    shape: 'box',
    position: [-24, 0, -7],
  },
  {
    id: 'trophy-cup',
    label: '웃음 트로피',
    fact: '오늘 가장 많이 웃은 크루에게 주는 트로피!',
    subject: '수학',
    size: 1.25,
    points: 70,
    color: '#FBBF24',
    shape: 'cylinder',
    position: [24, 0, 7],
  },
  {
    id: 'finish-banner',
    label: '무지개 피니시 게이트',
    fact: '끝이 아니라 다음 한 바퀴의 시작이에요.',
    subject: '한글',
    size: 1.31,
    points: 74,
    color: '#8B5CF6',
    shape: 'box',
    position: [0, 0, -25],
  },
  {
    id: 'giant-headphones',
    label: '메가 리듬 헤드폰',
    fact: '공원 전체가 신나는 플레이리스트가 돼요.',
    subject: '생활',
    size: 1.37,
    points: 78,
    color: '#DB2777',
    shape: 'torus',
    position: [16, 0, 20],
  },
  {
    id: 'drink-crate',
    label: '컬러 음료 상자',
    fact: '친구들과 나눌 시원한 캔이 가지런히 있어요.',
    subject: '과학',
    size: 1.42,
    points: 82,
    color: '#0EA5E9',
    shape: 'box',
    position: [-18, 0, 19],
  },
  {
    id: 'treasure-chest',
    label: '별지도 보물함',
    fact: '뚜껑을 열면 다음 탐험길이 반짝 나타나요.',
    subject: '한글',
    size: 1.47,
    points: 86,
    color: '#B45309',
    shape: 'box',
    position: [-7, 0, 25],
  },
  {
    id: 'crew-kiosk',
    label: '러닝크루 쉼터',
    fact: '물도 마시고 인사도 나누는 공원의 만남 장소예요.',
    subject: '생활',
    size: 1.5,
    points: 90,
    color: '#16A34A',
    shape: 'box',
    position: [25, 0, -9],
  },
]

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const OBJECTS_PER_STAGE = 256
const HILL_SLOT_RATIOS = [
  [-0.58, -0.56],
  [0.32, -0.48],
  [-0.24, -0.1],
  [0.56, 0.04],
] as const
const PLATFORM_SLOT_RATIOS = [
  [-0.62, -0.62],
  [-0.08, -0.65],
  [0.52, -0.58],
  [-0.58, -0.04],
  [0, 0],
  [0.58, 0.04],
  [-0.42, 0.58],
  [0.42, 0.58],
] as const
const TIER_MIX_PATTERN = [0, 2, 1, 3] as const
export const SCORE_GOAL_SCALE = 0.5

function scaleScoreGoal(score: number): number {
  return Math.round(score * SCORE_GOAL_SCALE)
}

interface SpecialObjectSlot {
  position: [number, number, number]
  tierIndex?: number
}

interface StageBlueprint {
  id: string
  title: string
  subtitle: string
  description: string
  theme: StageTheme
  mapSize: number
  objectiveCount: number
  scoreGoal: number
  tierGoals: StageTierGoal[]
  unlockRequirement?: StageUnlockRequirement
  accentColor: string
  skyColor: string
  fogColor: string
  colors: string[]
}

function createTierGoals(
  requiredCounts: [number, number, number, number],
  requiredScores: [number, number, number, number],
): StageTierGoal[] {
  return [
    {
      level: 1,
      label: '작은 보물과 친해지기',
      requiredCount: requiredCounts[0],
      requiredScore: scaleScoreGoal(requiredScores[0]),
    },
    {
      level: 2,
      label: '보통 보물 이어 붙이기',
      requiredCount: requiredCounts[1],
      requiredScore: scaleScoreGoal(requiredScores[1]),
    },
    {
      level: 3,
      label: '큰 보물 찾아가기',
      requiredCount: requiredCounts[2],
      requiredScore: scaleScoreGoal(requiredScores[2]),
    },
    {
      level: 4,
      label: '아주 큰 보물로 마무리',
      requiredCount: requiredCounts[3],
      requiredScore: scaleScoreGoal(requiredScores[3]),
    },
  ]
}

const stageBlueprints: StageBlueprint[] = [
  {
    id: 'sunny-start',
    title: '햇살 스타트 광장',
    subtitle: '잔디와 2층 전망대를 누비는 첫 번째 맵',
    description: '넓은 광장, 경사로와 보물 엘리베이터를 오가며 러닝 보물을 모아요.',
    theme: 'sunny-plaza',
    mapSize: 144,
    objectiveCount: 80,
    scoreGoal: scaleScoreGoal(6000),
    tierGoals: createTierGoals(
      [10, 28, 52, 80],
      [250, 1200, 3300, 6000],
    ),
    accentColor: '#16866A',
    skyColor: '#D9F2FF',
    fogColor: '#D9F2FF',
    colors: ['#FF6B6B', '#38BDF8', '#FBBF24', '#2DD4BF', '#A78BFA'],
  },
  {
    id: 'wind-forest',
    title: '바람숲 트레일',
    subtitle: '숲길과 높은 보물마당을 고르는 두 번째 맵',
    description: '나무, 개울, 2층 숲 전망대 사이의 여러 동선에서 러닝 장비를 찾아요.',
    theme: 'forest-trail',
    mapSize: 168,
    objectiveCount: 92,
    scoreGoal: scaleScoreGoal(7500),
    tierGoals: createTierGoals(
      [12, 32, 60, 92],
      [350, 1600, 4200, 7500],
    ),
    unlockRequirement: {
      previousStageId: 'sunny-start',
      requiredScore: scaleScoreGoal(6000),
      requiredTierLevel: 4,
    },
    accentColor: '#477A38',
    skyColor: '#CDE7D4',
    fogColor: '#CDE7D4',
    colors: ['#0EA5E9', '#F97316', '#22C55E', '#8B5CF6', '#EC4899'],
  },
  {
    id: 'starlight-river',
    title: '별빛 리버파크',
    subtitle: '강둑과 수직 동선을 누비는 마지막 맵',
    description: '별빛 강변, 높은 전망대와 승강 발판을 오가며 큰 보물을 모아요.',
    theme: 'starlight-river',
    mapSize: 192,
    objectiveCount: 104,
    scoreGoal: scaleScoreGoal(9000),
    tierGoals: createTierGoals(
      [14, 36, 68, 104],
      [450, 2000, 5000, 9000],
    ),
    unlockRequirement: {
      previousStageId: 'wind-forest',
      requiredScore: scaleScoreGoal(7500),
      requiredTierLevel: 4,
    },
    accentColor: '#6557C8',
    skyColor: '#263657',
    fogColor: '#34486B',
    colors: ['#60A5FA', '#FB7185', '#A78BFA', '#FBBF24', '#2DD4BF'],
  },
]

function createStageObjects(
  blueprint: StageBlueprint,
  stageIndex: number,
): LearningObject[] {
  const templates = objectTemplates
  const templatesByTier = [1, 2, 3, 4].map((level) =>
    templates.filter((template) => getSizeTier(template.size).level === level),
  )
  const maxRadius = blueprint.mapSize / 2 - 5
  const physicsLayout = createWorldPhysicsLayout(blueprint)
  const pushRewardSlots: SpecialObjectSlot[] =
    physicsLayout.pushRewardSlots.map((position, index) => ({
      position,
      tierIndex: index < 2 ? 0 : 1,
    }))
  const rampSlots: SpecialObjectSlot[] =
    physicsLayout.terrainRamps.flatMap((ramp) =>
      HILL_SLOT_RATIOS.map(([localXRatio, localZRatio]) => ({
        position: getTerrainRampSurfacePosition(
          ramp,
          localXRatio,
          localZRatio,
        ).map(
          (coordinate) => Number(coordinate.toFixed(2)),
        ) as [number, number, number],
      })),
    )
  const platformSlots: SpecialObjectSlot[] =
    physicsLayout.elevatedPlatforms.flatMap((platform) =>
      PLATFORM_SLOT_RATIOS.map(([localXRatio, localZRatio]) => ({
        position: getElevatedPlatformSurfacePosition(
          platform,
          localXRatio,
          localZRatio,
        ).map(
          (coordinate) => Number(coordinate.toFixed(2)),
        ) as [number, number, number],
      })),
    )
  const specialSlots = [
    ...pushRewardSlots,
    ...rampSlots,
    ...platformSlots,
  ]
  const placementObstacles = [
    ...physicsLayout.obstacles,
    ...physicsLayout.terrainRamps.map((ramp) => ({
      x: ramp.x,
      z: ramp.z,
      radius: Math.hypot(ramp.halfWidth, ramp.halfDepth),
    })),
    ...physicsLayout.elevatedPlatforms.map((platform) => ({
      x: platform.x,
      z: platform.z,
      radius: Math.hypot(platform.halfWidth, platform.halfDepth),
    })),
    ...physicsLayout.elevators.map((elevator) => ({
      x: elevator.x,
      z: elevator.z,
      radius: Math.hypot(elevator.halfWidth, elevator.halfDepth),
    })),
    ...physicsLayout.pushableProps.map((prop) => ({
      x: prop.x,
      z: prop.z,
      radius: prop.kind === 'block' ? 0.42 : 0.34,
    })),
  ]

  return Array.from({ length: OBJECTS_PER_STAGE }, (_, index) => {
    const starter = index < 8
    const mixedIndex = Math.max(0, index - 8)
    const specialSlot = starter ? undefined : specialSlots[mixedIndex]
    const tierPatternIndex = TIER_MIX_PATTERN[mixedIndex % TIER_MIX_PATTERN.length]
    const tierRotation = stageIndex + Math.floor(mixedIndex / 32)
    const mixedTierIndex =
      specialSlot?.tierIndex ??
      (tierPatternIndex + tierRotation) % templatesByTier.length
    const mixedTierTemplates = templatesByTier[mixedTierIndex]
    const templateCycle = Math.floor(mixedIndex / templatesByTier.length)
    const template = starter
      ? templates[index]
      : mixedTierTemplates[
          (templateCycle * 5 +
            Math.floor(templateCycle / mixedTierTemplates.length) +
            stageIndex * 3) %
            mixedTierTemplates.length
        ]
    const groundIndex = Math.max(0, mixedIndex - specialSlots.length)
    const groundCount = OBJECTS_PER_STAGE - 8 - specialSlots.length
    const progress = groundIndex / Math.max(1, groundCount - 1)
    const radius = starter
      ? 2.4 + index * 0.58
      : 7 + Math.sqrt(progress) * (maxRadius - 7)
    const baseAngle =
      index * GOLDEN_ANGLE +
      stageIndex * 0.83 +
      Math.sin(index * 1.7 + stageIndex) * 0.11
    const sizeVariation = ((index % 3) - 1) * 0.012
    const size = Math.max(0.2, template.size + sizeVariation)
    const position =
      specialSlot?.position ??
      Array.from({ length: 48 }, (_, attempt) => {
        const angle = baseAngle + attempt * 0.37
        return [
          Number((Math.cos(angle) * radius).toFixed(2)),
          0,
          Number((Math.sin(angle) * radius).toFixed(2)),
        ] as [number, number, number]
      }).find((candidate) =>
        isCollectionPositionClear(
          { position: candidate, size },
          placementObstacles,
        ),
      ) ?? [
        Number((Math.cos(baseAngle) * radius).toFixed(2)),
        0,
        Number((Math.sin(baseAngle) * radius).toFixed(2)),
      ]

    return {
      ...template,
      id: `${blueprint.id}-${template.id}-${index + 1}`,
      modelId: template.id,
      stageId: blueprint.id,
      size,
      points: template.points + stageIndex * 8 + (index % 4) * 2,
      color: blueprint.colors[(index + stageIndex) % blueprint.colors.length],
      position,
    }
  })
}

const stages: GameStage[] = stageBlueprints.map((blueprint, index) => ({
  id: blueprint.id,
  title: blueprint.title,
  subtitle: blueprint.subtitle,
  description: blueprint.description,
  theme: blueprint.theme,
  mapSize: blueprint.mapSize,
  objectiveCount: blueprint.objectiveCount,
  scoreGoal: blueprint.scoreGoal,
  tierGoals: blueprint.tierGoals,
  unlockRequirement: blueprint.unlockRequirement,
  accentColor: blueprint.accentColor,
  skyColor: blueprint.skyColor,
  fogColor: blueprint.fogColor,
  objects: createStageObjects(blueprint, index),
}))

export const fallbackLearningPack: LearningPack = {
  version: 9,
  title: '러닝크루 월드 투어',
  stages,
  objects: stages.flatMap((stage) => stage.objects),
}
