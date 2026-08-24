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
import { getLevelOneAssetLabel } from '../levelOneAssets'
import {
  ASSET_BACKED_LEVEL_UP_MODEL_IDS,
  isAssetBackedLevelUpModelId,
} from '../levelUpAssets'
import {
  createStructuredCollectibleTemplates,
  isStructuredCollectibleModelId,
} from '../structuredCollectibleAssets'
import {
  createWorldPhysicsLayout,
  getElevatedPlatformSurfacePosition,
  getTerrainRampSurfacePosition,
} from '../worldPhysics'
import {
  createInterleavedTierSequence,
  ICE_RIVER_OBJECT_TIER_TOTALS,
  STAGE_OBJECT_TIER_TOTALS,
} from '../objectDistribution'

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
    id: 'level2-headset',
    label: '헤드셋',
    fact: '좋아하는 음악과 함께 가볍게 달려요.',
    subject: '생활',
    size: 0.59,
    points: 29,
    color: '#6366F1',
    shape: 'torus',
    position: [11, 0, 14],
  },
  {
    id: 'level2-note',
    label: '노트',
    fact: '오늘 발견한 보물을 한 장씩 기록해요.',
    subject: '한글',
    size: 0.66,
    points: 31,
    color: '#F59E0B',
    shape: 'book',
    position: [-14, 0, 12],
  },
  {
    id: 'level2-running-shoe',
    label: '러닝화',
    fact: '발을 편안하게 감싸 주는 달리기 신발이에요.',
    subject: '생활',
    size: 0.73,
    points: 34,
    color: '#14B8A6',
    shape: 'box',
    position: [16, 0, -9],
  },
  {
    id: 'level2-digital-watch',
    label: '전자시계',
    fact: '달린 시간과 걸음 수를 숫자로 알려 줘요.',
    subject: '수학',
    size: 0.77,
    points: 37,
    color: '#2563EB',
    shape: 'cylinder',
    position: [-17, 0, -10],
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
    fact: '물을 챙겨 가볍고 씩씩하게 달릴 준비를 해요.',
    subject: '생활',
    size: 0.76,
    points: 39,
    color: '#10B981',
    shape: 'box',
    position: [-21, 0, 9],
  },
  {
    id: 'level2-cat-doll',
    label: '고양이 인형',
    fact: '폭신한 고양이 친구가 달리기 모험을 응원해요.',
    subject: '생활',
    size: 0.7,
    points: 35,
    color: '#F9A8D4',
    shape: 'box',
    position: [21, 0, -5],
  },
  {
    id: 'level2-bera-ice-cream',
    label: '베라 아이스크림',
    fact: '달콤하고 시원한 아이스크림으로 잠깐 쉬어 가요.',
    subject: '생활',
    size: 0.62,
    points: 31,
    color: '#F472B6',
    shape: 'cylinder',
    position: [-20, 0, -4],
  },
  {
    id: 'level2-energy-drink',
    label: '에너지드링크',
    fact: '달리기 전에는 몸 상태와 성분을 먼저 살펴봐요.',
    subject: '과학',
    size: 0.7,
    points: 35,
    color: '#22C55E',
    shape: 'cylinder',
    position: [13, 0, -18],
  },
  {
    id: 'level2-taekwondo-uniform',
    label: '태권도복',
    fact: '예의와 집중을 배우며 씩씩하게 움직일 때 입어요.',
    subject: '생활',
    size: 0.78,
    points: 39,
    color: '#F8FAFC',
    shape: 'box',
    position: [-12, 0, 20],
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
    id: 'level3-athlete-running-shoe',
    label: '선수 러닝화',
    fact: '선수처럼 힘차게 달릴 수 있도록 발을 받쳐 줘요.',
    subject: '생활',
    size: 0.9,
    points: 44,
    color: '#EF4444',
    shape: 'box',
    position: [20, 0, 10],
  },
  {
    id: 'level3-raccoon',
    label: '너구리',
    fact: '꼬리를 살랑이며 공원 곳곳을 탐험하는 친구예요.',
    subject: '과학',
    size: 1.02,
    points: 51,
    color: '#78716C',
    shape: 'box',
    position: [-19, 0, 15],
  },
  {
    id: 'level3-inline-skates',
    label: '인라인스케이트',
    fact: '한 줄 바퀴로 균형을 잡으며 미끄러져요.',
    subject: '생활',
    size: 1.13,
    points: 59,
    color: '#8B5CF6',
    shape: 'box',
    position: [8, 0, -22],
  },
  {
    id: 'level3-running-vest',
    label: '러닝 조끼',
    fact: '달릴 때 필요한 물건을 몸 가까이에 가볍게 챙겨요.',
    subject: '생활',
    size: 1.08,
    points: 57,
    color: '#F97316',
    shape: 'box',
    position: [-8, 0, -23],
  },
  {
    id: 'level3-soda-cooler',
    label: '탄산음료 아이스박스',
    fact: '차가운 음료를 시원하게 보관하는 튼튼한 상자예요.',
    subject: '과학',
    size: 0.96,
    points: 53,
    color: '#38BDF8',
    shape: 'box',
    position: [18, 0, 21],
  },
  {
    id: 'level3-cat',
    label: '고양이',
    fact: '살금살금 움직이다 공과 만나면 얌전히 멈춰요.',
    subject: '과학',
    size: 1.06,
    points: 55,
    color: '#F59E0B',
    shape: 'box',
    position: [-22, 0, -12],
  },
  {
    id: 'level3-shiba-inu',
    label: '시바견',
    fact: '쫑긋한 귀와 말린 꼬리가 귀여운 씩씩한 친구예요.',
    subject: '과학',
    size: 1.04,
    points: 54,
    color: '#D97706',
    shape: 'box',
    position: [23, 0, -12],
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
  {
    id: 'level4-car',
    label: '차',
    fact: '네 바퀴가 힘을 모아 길 위를 달려요.',
    subject: '생활',
    size: 1.61,
    points: 70,
    color: '#EF4444',
    shape: 'box',
    position: [23, 0, 15],
  },
  {
    id: 'level4-noise-canceling-headset',
    label: '노이즈 캔슬링 헤드셋',
    fact: '주변 소음을 줄여 듣고 싶은 소리에 집중하게 해 줘요.',
    subject: '과학',
    size: 1.39,
    points: 80,
    color: '#7C3AED',
    shape: 'torus',
    position: [-23, 0, 16],
  },
  {
    id: 'level4-luxury-car',
    label: '대형 고급차',
    fact: '넓은 차체와 네 바퀴로 편안하게 길을 달려요.',
    subject: '생활',
    size: 2.15,
    points: 88,
    color: '#0F172A',
    shape: 'box',
    position: [26, 0, -18],
  },
  {
    id: 'level4-luxury-car-2',
    label: '대형 고급차 2',
    fact: '커다란 차체와 반짝이는 모습이 눈에 띄는 자동차예요.',
    subject: '생활',
    size: 2.2,
    points: 90,
    color: '#334155',
    shape: 'box',
    position: [-27, 0, -17],
  },
  {
    id: 'level4-drink-vending-machine',
    label: '음료 자판기',
    fact: '버튼을 누르면 고른 음료를 내어 주는 기계예요.',
    subject: '과학',
    size: 1.44,
    points: 84,
    color: '#DC2626',
    shape: 'box',
    position: [5, 0, 27],
  },
  {
    id: 'level4-lotte-tower',
    label: '롯데타워',
    fact: '하늘 높이 솟은 건물의 층과 구조를 관찰해 봐요.',
    subject: '수학',
    size: 1.8,
    points: 92,
    color: '#94A3B8',
    shape: 'cylinder',
    position: [-3, 0, 28],
  },
  ...createStructuredCollectibleTemplates(),
]

export { ASSET_BACKED_LEVEL_UP_MODEL_IDS }

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
export const OBJECTS_PER_STAGE = 360
export const ICE_RIVER_OBJECTS_PER_STAGE = 440
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
export const SCORE_GOAL_SCALE = 0.5

function scaleScoreGoal(score: number): number {
  return Math.round(score * SCORE_GOAL_SCALE)
}

interface SpecialObjectSlot {
  position: [number, number, number]
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

/**
 * 레벨별 목표를 만든다.
 *
 * perTierCount 는 "그 레벨의 물건을 몇 개 모으면 다음 레벨이 열리는지"다.
 * 4레벨까지 채우면 맵이 끝나므로 한 맵의 분량은 perTierCount × 4 다.
 * 한 차시에 맞춰 늘리거나 줄이려면 아래 맵 정의의 이 숫자만 바꾸면 된다.
 *
 * requiredScore 는 표시용으로만 남는다 — 진행은 개수로만 판정한다.
 */
function createTierGoals(
  perTierCount: number,
  requiredScores: [number, number, number, number],
): StageTierGoal[] {
  const labels = [
    '작은 보물과 친해지기',
    '보통 보물 이어 붙이기',
    '큰 보물 찾아가기',
    '아주 큰 보물로 마무리',
  ] as const

  return labels.map((label, index) => ({
    level: (index + 1) as StageTierGoal['level'],
    label,
    requiredCount: perTierCount,
    requiredScore: scaleScoreGoal(requiredScores[index]),
  }))
}

/** 레벨당 목표 개수 — 모든 맵 10개로 통일.
 *
 * 원본은 맵마다 10/12/14 로 늘렸는데, 퀴즈런에서는 "10개만 더" 가 항상 같아야
 * 학생이 목표를 가늠할 수 있다(수업 중이라 진행 속도도 예측 가능해야 한다).
 * 한 맵 = 10개 × 4레벨 = 40개, 3개 맵 = 120개. */
const PER_TIER_COUNTS = {
  'sunny-start': 10,
  'wind-forest': 10,
  'starlight-river': 10,
} as const

const stageBlueprints: StageBlueprint[] = [
  {
    id: 'sunny-start',
    title: '햇살 스타트 광장',
    subtitle: '잔디와 2층 전망대를 누비는 첫 번째 맵',
    description: '넓은 광장, 경사로와 보물 엘리베이터를 오가며 러닝 보물을 모아요.',
    theme: 'sunny-plaza',
    mapSize: 144,
    objectiveCount: PER_TIER_COUNTS['sunny-start'] * 4,
    scoreGoal: scaleScoreGoal(6000),
    tierGoals: createTierGoals(
      PER_TIER_COUNTS['sunny-start'],
      [250, 1200, 3300, 6000],
    ),
    accentColor: '#16866A',
    skyColor: '#D9F2FF',
    fogColor: '#D9F2FF',
    colors: ['#FF6B6B', '#38BDF8', '#FBBF24', '#2DD4BF', '#A78BFA'],
  },
  {
    id: 'wind-forest',
    title: '달그늘 탐험숲',
    subtitle: '러닝볼의 빛으로 길을 여는 두 번째 맵',
    description: '어두운 숲에서 밝아지는 러닝볼과 함께 움직이는 러닝크루와 곰을 피해 언덕, 물길과 터널을 탐험해요.',
    theme: 'forest-trail',
    mapSize: 168,
    objectiveCount: PER_TIER_COUNTS['wind-forest'] * 4,
    scoreGoal: scaleScoreGoal(7500),
    tierGoals: createTierGoals(
      PER_TIER_COUNTS['wind-forest'],
      [350, 1600, 4200, 7500],
    ),
    unlockRequirement: {
      previousStageId: 'sunny-start',
      requiredScore: scaleScoreGoal(6000),
      requiredTierLevel: 4,
    },
    accentColor: '#7EA8D8',
    skyColor: '#07101C',
    fogColor: '#0B1722',
    colors: ['#0EA5E9', '#F97316', '#22C55E', '#8B5CF6', '#EC4899'],
  },
  {
    id: 'starlight-river',
    title: '아이스 리버파크',
    subtitle: '맵의 대부분을 덮은 빙판과 수직 동선을 누비는 마지막 맵',
    description: '조향이 늦게 따라오고 관성이 오래 남는 넓은 빙판에서 미끄러짐을 조절하며 큰 보물을 모아요.',
    theme: 'starlight-river',
    mapSize: 192,
    objectiveCount: PER_TIER_COUNTS['starlight-river'] * 4,
    scoreGoal: scaleScoreGoal(9000),
    tierGoals: createTierGoals(
      PER_TIER_COUNTS['starlight-river'],
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
  const isIceRiver = blueprint.id === 'starlight-river'
  const tierTotals = isIceRiver
    ? ICE_RIVER_OBJECT_TIER_TOTALS
    : STAGE_OBJECT_TIER_TOTALS
  const objectsPerStage = isIceRiver
    ? ICE_RIVER_OBJECTS_PER_STAGE
    : OBJECTS_PER_STAGE
  const templates = objectTemplates.filter(
    (template) =>
      getSizeTier(template.size).level === 1 ||
      isAssetBackedLevelUpModelId(template.id) ||
      isStructuredCollectibleModelId(template.id),
  )
  const templatesByTier = [1, 2, 3, 4].map((level) =>
    templates.filter((template) => getSizeTier(template.size).level === level),
  )
  const maxRadius = blueprint.mapSize / 2 - 5
  const physicsLayout = createWorldPhysicsLayout(blueprint)
  const pushRewardSlots: SpecialObjectSlot[] =
    physicsLayout.pushRewardSlots.map((position) => ({
      position,
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
    ...physicsLayout.surfaceZones
      .filter((zone) => zone.kind === 'mud')
      .map((zone) => ({
        x: zone.x,
        z: zone.z,
        radius: Math.hypot(zone.halfWidth, zone.halfDepth) + 1,
      })),
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
  const tierSequence = createInterleavedTierSequence([
    tierTotals[0] - 8,
    tierTotals[1],
    tierTotals[2],
    tierTotals[3],
  ])
  const tierUseCounts = [0, 0, 0, 0]

  return Array.from({ length: objectsPerStage }, (_, index) => {
    const starter = index < 8
    const mixedIndex = Math.max(0, index - 8)
    const specialSlot = starter ? undefined : specialSlots[mixedIndex]
    const mixedTierIndex = starter ? 0 : tierSequence[mixedIndex]
    const mixedTierTemplates = templatesByTier[mixedTierIndex]
    const templateCycle = tierUseCounts[mixedTierIndex]
    tierUseCounts[mixedTierIndex] += 1
    const template = starter
      ? templatesByTier[0][index % templatesByTier[0].length]
      : mixedTierTemplates[
          (templateCycle * 5 +
            Math.floor(templateCycle / mixedTierTemplates.length) +
            stageIndex * 3) %
            mixedTierTemplates.length
        ]
    const groundIndex = Math.max(0, mixedIndex - specialSlots.length)
    const groundCount = objectsPerStage - 8 - specialSlots.length
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

    const id = `${blueprint.id}-${template.id}-${index + 1}`

    return {
      ...template,
      id,
      modelId: template.id,
      stageId: blueprint.id,
      label:
        getSizeTier(size).level === 1 &&
        !isStructuredCollectibleModelId(template.id)
          ? getLevelOneAssetLabel(id)
          : template.label,
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
  version: 22,
  title: '러닝크루 월드 투어',
  stages,
  objects: stages.flatMap((stage) => stage.objects),
}
