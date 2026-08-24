export const LEVEL_ONE_ASSET_VARIANTS = [
  'red-lego',
  'green-lego',
  'yellow-lego',
  'water',
  'candy',
  'orange-juice',
  'phantom-keyring',
] as const

export type LevelOneAssetVariant = (typeof LEVEL_ONE_ASSET_VARIANTS)[number]

const LEVEL_ONE_ASSET_LABELS: Record<LevelOneAssetVariant, string> = {
  'red-lego': '레고',
  'green-lego': '레고',
  'yellow-lego': '레고',
  water: '생수',
  candy: '막대사탕',
  'orange-juice': '오렌지 주스',
  'phantom-keyring': '팬텀 키링',
}

export function getLevelOneAssetVariant(
  itemId: string,
): LevelOneAssetVariant {
  let hash = 2166136261
  for (const character of itemId) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }

  return LEVEL_ONE_ASSET_VARIANTS[
    (hash >>> 0) % LEVEL_ONE_ASSET_VARIANTS.length
  ]
}

export function getLevelOneAssetLabel(itemId: string): string {
  return LEVEL_ONE_ASSET_LABELS[getLevelOneAssetVariant(itemId)]
}
