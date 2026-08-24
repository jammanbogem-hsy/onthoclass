import type { LearningObject } from './types'
import { getLevelOneAssetLabel } from './levelOneAssets'
import { getLegacyLevelUpAssetReplacement } from './levelUpAssets'
import { getSizeTier } from './mechanics'
import { isStructuredCollectibleModelId } from './structuredCollectibleAssets'

type PresentableItem = Pick<
  LearningObject,
  'id' | 'label' | 'fact' | 'size' | 'modelId'
>

export function getItemDisplayLabel(item: PresentableItem): string {
  if (isStructuredCollectibleModelId(item.modelId)) return item.label

  if (
    item.modelId !== 'radar-treasure' &&
    getSizeTier(item.size).level === 1
  ) {
    return getLevelOneAssetLabel(item.id)
  }

  const legacyReplacement = getLegacyLevelUpAssetReplacement(item)
  if (legacyReplacement) return legacyReplacement.label

  return item.label
}

export function getCollectionAnnouncementTitle(
  item: PresentableItem,
  awardedPoints: number,
  multiplier: number,
): string {
  const reward = `${getItemDisplayLabel(item)} 획득 · +${awardedPoints}`
  return multiplier > 1 ? `x${multiplier} 콤보 · ${reward}` : reward
}

function hasFinalConsonant(value: string): boolean {
  const lastCodePoint = Array.from(value.trim()).at(-1)?.codePointAt(0)
  if (lastCodePoint === undefined) return false
  return (
    lastCodePoint >= 0xac00 &&
    lastCodePoint <= 0xd7a3 &&
    (lastCodePoint - 0xac00) % 28 !== 0
  )
}

export function getCollectionAnnouncementBody(item: PresentableItem): string {
  const legacyReplacement = getLegacyLevelUpAssetReplacement(item)
  if (legacyReplacement) {
    const label = legacyReplacement.label
    return `${label}${hasFinalConsonant(label) ? '을' : '를'} 러닝볼에 붙였어요.`
  }

  if (
    item.modelId === 'radar-treasure' ||
    getSizeTier(item.size).level !== 1
  ) {
    return item.fact
  }

  const label = getItemDisplayLabel(item)
  return `${label}${hasFinalConsonant(label) ? '을' : '를'} 러닝볼에 붙였어요.`
}
