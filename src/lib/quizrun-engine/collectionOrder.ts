export function getCollectedObjectsInOrder<T extends { id: string }>(
  objects: readonly T[],
  collectedIds: readonly string[],
): T[] {
  const objectsById = new Map(objects.map((item) => [item.id, item]))

  return collectedIds.flatMap((id) => {
    const item = objectsById.get(id)
    return item ? [item] : []
  })
}
