export function moveActivity(ids: string[], from: number, to: number) {
  if (from < 0 || to < 0 || from >= ids.length || to >= ids.length || from === to) return ids;
  const next = [...ids]; const [id] = next.splice(from, 1); next.splice(to, 0, id); return next;
}
