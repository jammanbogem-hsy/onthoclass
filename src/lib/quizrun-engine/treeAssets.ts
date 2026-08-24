export const TREE_ASSET_VARIANTS = [
  'low-poly-tree-a',
  'low-poly-tree-b',
  'low-poly-tree-c',
] as const

export type TreeAssetVariant = (typeof TREE_ASSET_VARIANTS)[number]

function getStableHash(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function getTreeAssetVariation(treeId: string): {
  variant: TreeAssetVariant
  rotationY: number
  scaleMultiplier: number
} {
  const hash = getStableHash(treeId)
  const variationHash = Math.imul(hash ^ 0x9e3779b9, 2246822519) >>> 0

  return {
    variant: TREE_ASSET_VARIANTS[hash % TREE_ASSET_VARIANTS.length],
    rotationY: (variationHash / 0xffffffff) * Math.PI * 2,
    scaleMultiplier: 0.9 + ((variationHash >>> 12) % 21) / 100,
  }
}
