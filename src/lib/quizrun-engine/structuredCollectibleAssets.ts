import type {
  LearningObject,
  LearningSubject,
  SizeTierLevel,
} from './types'
import { LEVEL_ASSET_ENTRIES } from './data/modelUrls'

export interface StructuredCollectibleAsset {
  fileName: string
  modelId: string
  label: string
  sourceLevel: number
  level: SizeTierLevel
  url: string
}

// 원본은 Vite 의 import.meta.glob 으로 레벨 모델을 한꺼번에 끌어왔다.
// Next 에는 그 문법이 없어 목록을 modelUrls 에 두고 여기서 읽는다.
const assetModules: Record<string, string> = Object.fromEntries(
  LEVEL_ASSET_ENTRIES.map((entry) => [entry.fileName, entry.url]),
)

function parseStructuredAsset(
  path: string,
  url: string,
): StructuredCollectibleAsset | null {
  const fileName = path.split('/').at(-1) ?? path
  const match = /^레벨(\d+)_(.+)\.glb$/u.exec(fileName)
  if (!match) return null

  const sourceLevel = Number(match[1])
  if (!Number.isInteger(sourceLevel) || sourceLevel < 1) return null
  const label = match[2].trim()
  const level = Math.min(4, sourceLevel) as SizeTierLevel

  return {
    fileName,
    modelId: `structured-level${sourceLevel}-${label}`,
    label,
    sourceLevel,
    level,
    url,
  }
}

export const STRUCTURED_COLLECTIBLE_ASSETS = Object.entries(assetModules)
  .map(([path, url]) => parseStructuredAsset(path, url))
  .filter((asset): asset is StructuredCollectibleAsset => asset !== null)
  .sort(
    (left, right) =>
      left.sourceLevel - right.sourceLevel ||
      left.label.localeCompare(right.label, 'ko'),
  )

const structuredAssetsByModelId = new Map(
  STRUCTURED_COLLECTIBLE_ASSETS.map((asset) => [asset.modelId, asset]),
)

export function getStructuredCollectibleAsset(
  modelId?: string,
): StructuredCollectibleAsset | undefined {
  return modelId ? structuredAssetsByModelId.get(modelId) : undefined
}

export function isStructuredCollectibleModelId(
  modelId?: string,
): boolean {
  return getStructuredCollectibleAsset(modelId) !== undefined
}

const TEMPLATE_SIZES = [0.34, 0.68, 1.02, 1.6] as const
const TEMPLATE_POINTS = [18, 40, 66, 94] as const
const TEMPLATE_COLORS = ['#F97316', '#3B82F6', '#EAB308', '#E85D4A'] as const

function getSubject(asset: StructuredCollectibleAsset): LearningSubject {
  if (
    /지구|토성|공룡|티라노|트리케라|스켈레톤|자동차|테슬라/u.test(
      asset.label,
    )
  ) {
    return '과학'
  }
  if (/빌딩|타워|에펠탑|아파트|학교|야구장|덕수궁/u.test(asset.label)) {
    return '수학'
  }
  if (/앨범|굿즈|닌텐도|뽀삐/u.test(asset.label)) return '한글'
  return '생활'
}

export function createStructuredCollectibleTemplates(): LearningObject[] {
  return STRUCTURED_COLLECTIBLE_ASSETS.map((asset) => {
    const tierIndex = asset.level - 1
    const isFormerLevelFive = asset.sourceLevel > 4

    return {
      id: asset.modelId,
      modelId: asset.modelId,
      label: asset.label,
      fact: isFormerLevelFive
        ? `${asset.label}의 거대한 크기와 특징을 관찰해 봐요.`
        : `${asset.label}의 모양과 쓰임을 자세히 관찰해 봐요.`,
      subject: getSubject(asset),
      size: isFormerLevelFive ? 2.15 : TEMPLATE_SIZES[tierIndex],
      points: isFormerLevelFive ? 118 : TEMPLATE_POINTS[tierIndex],
      color: TEMPLATE_COLORS[tierIndex],
      shape: 'box',
      position: [0, 0, 0],
    }
  })
}
