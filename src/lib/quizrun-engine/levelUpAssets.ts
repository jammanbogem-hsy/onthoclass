import type { LearningObject } from './types'
import { getSizeTier } from './mechanics'
import { isStructuredCollectibleModelId } from './structuredCollectibleAssets'

type LevelUpItem = Pick<LearningObject, 'id' | 'size' | 'modelId'>

export const ASSET_BACKED_LEVEL_UP_MODELS = {
  'water-bottle': '찰랑 물병',
  stopwatch: '초시계',
  sunglasses: '런닝용 선글라스',
  'level2-headset': '헤드셋',
  'level2-note': '노트',
  'level2-running-shoe': '러닝화',
  'level2-digital-watch': '전자시계',
  'hydration-pack': '찰랑 러닝 가방',
  'level2-cat-doll': '고양이 인형',
  'level2-bera-ice-cream': '베라 아이스크림',
  'level2-energy-drink': '에너지드링크',
  'level2-taekwondo-uniform': '태권도복',
  'crew-medal': '함께 달린 메달',
  'level3-athlete-running-shoe': '선수 러닝화',
  'level3-raccoon': '너구리',
  'level3-inline-skates': '인라인스케이트',
  'level3-running-vest': '러닝 조끼',
  'level3-soda-cooler': '탄산음료 아이스박스',
  'level3-cat': '고양이',
  'level3-shiba-inu': '시바견',
  'level4-car': '차',
  'level4-noise-canceling-headset': '노이즈 캔슬링 헤드셋',
  'level4-luxury-car': '대형 고급차',
  'level4-luxury-car-2': '대형 고급차 2',
  'level4-drink-vending-machine': '음료 자판기',
  'level4-lotte-tower': '롯데타워',
} as const

export type AssetBackedLevelUpModelId =
  keyof typeof ASSET_BACKED_LEVEL_UP_MODELS

export const ASSET_BACKED_LEVEL_UP_MODEL_IDS = Object.keys(
  ASSET_BACKED_LEVEL_UP_MODELS,
) as AssetBackedLevelUpModelId[]

const assetBackedModelIds = new Set<string>(
  ASSET_BACKED_LEVEL_UP_MODEL_IDS,
)

const assetPools: Record<2 | 3 | 4, readonly AssetBackedLevelUpModelId[]> = {
  2: [
    'water-bottle',
    'stopwatch',
    'sunglasses',
    'level2-headset',
    'level2-note',
    'level2-running-shoe',
    'level2-digital-watch',
    'hydration-pack',
    'level2-cat-doll',
    'level2-bera-ice-cream',
    'level2-energy-drink',
    'level2-taekwondo-uniform',
  ],
  3: [
    'crew-medal',
    'level3-athlete-running-shoe',
    'level3-raccoon',
    'level3-inline-skates',
    'level3-running-vest',
    'level3-soda-cooler',
    'level3-cat',
    'level3-shiba-inu',
  ],
  4: [
    'level4-car',
    'level4-noise-canceling-headset',
    'level4-luxury-car',
    'level4-luxury-car-2',
    'level4-drink-vending-machine',
    'level4-lotte-tower',
  ],
}

const legacyModelReplacements: Record<string, AssetBackedLevelUpModelId> = {
  'running-cap': 'sunglasses',
  wristwatch: 'level2-digital-watch',
  headphones: 'level2-headset',
  'small-box': 'level2-note',
  'running-shoe': 'level2-running-shoe',
  'play-ball': 'level3-soda-cooler',
  skateboard: 'level3-inline-skates',
  'gem-cluster': 'crew-medal',
  'treasure-box': 'level3-soda-cooler',
  'running-shoe-pair': 'level3-athlete-running-shoe',
  'giant-sneaker': 'level4-luxury-car',
  'trophy-cup': 'level4-luxury-car-2',
  'finish-banner': 'level4-drink-vending-machine',
  'giant-headphones': 'level4-noise-canceling-headset',
  'drink-crate': 'level4-drink-vending-machine',
  'treasure-chest': 'level4-luxury-car',
  'crew-kiosk': 'level4-drink-vending-machine',
}

function getStableIndex(value: string, length: number): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % length
}

export function isAssetBackedLevelUpModelId(
  modelId: string,
): modelId is AssetBackedLevelUpModelId {
  return assetBackedModelIds.has(modelId)
}

export function getLegacyLevelUpAssetReplacement(
  item: LevelUpItem,
): { modelId: AssetBackedLevelUpModelId; label: string } | undefined {
  const level = getSizeTier(item.size).level
  if (level === 1) return undefined

  const currentModelId = item.modelId ?? item.id
  if (isAssetBackedLevelUpModelId(currentModelId)) return undefined
  if (isStructuredCollectibleModelId(currentModelId)) return undefined

  const tier = level as 2 | 3 | 4
  const pool = assetPools[tier]
  const modelId =
    legacyModelReplacements[currentModelId] ??
    pool[getStableIndex(item.id, pool.length)]

  return {
    modelId,
    label: ASSET_BACKED_LEVEL_UP_MODELS[modelId],
  }
}

export function getAssetBackedLevelUpModelId(
  item: LevelUpItem,
): string {
  return (
    getLegacyLevelUpAssetReplacement(item)?.modelId ??
    item.modelId ??
    item.id
  )
}

export function getLevelUpBadgeHeightMultiplier(
  item: LevelUpItem,
): number {
  const modelId = getAssetBackedLevelUpModelId(item)

  if (modelId === 'level4-car') return 0.82
  if (modelId === 'level4-luxury-car') return 0.9
  if (modelId === 'level4-luxury-car-2') return 1.05
  if (modelId === 'level4-lotte-tower') return 1.35
  return 1.6
}
