import { objectCells } from "./map";
import type { MapDoc } from "./types";

/** 미리보기 강조용: 추가/제거된 셀 */
export function diffCells(prev: MapDoc, next: MapDoc) {
  const added = new Set<string>();
  const removed = new Set<string>();
  const prevIds = new Map(prev.objects.map((o) => [o.id, o]));
  const nextIds = new Map(next.objects.map((o) => [o.id, o]));
  for (const o of next.objects) {
    const p = prevIds.get(o.id);
    if (!p || p.x !== o.x || p.y !== o.y || p.rot !== o.rot) for (const [x, y] of objectCells(o)) added.add(`${x},${y}`);
  }
  for (const o of prev.objects) {
    const n = nextIds.get(o.id);
    if (!n || n.x !== o.x || n.y !== o.y || n.rot !== o.rot) for (const [x, y] of objectCells(o)) removed.add(`${x},${y}`);
  }
  for (let y = 0; y < next.height; y++) for (let x = 0; x < next.width; x++) {
    if (x >= prev.width || y >= prev.height || prev.terrainPalette[prev.terrain[y * prev.width + x]] !== next.terrainPalette[next.terrain[y * next.width + x]]) added.add(`${x},${y}`);
  }
  for (const z of next.zones) {
    const old = prev.zones.find(p => p.id === z.id);
    if (JSON.stringify(old?.effects || {}) === JSON.stringify(z.effects || {})) continue;
    for (let x = z.x; x < z.x + z.w; x++) { added.add(`${x},${z.y}`); added.add(`${x},${z.y + z.h - 1}`); }
    for (let y = z.y; y < z.y + z.h; y++) { added.add(`${z.x},${y}`); added.add(`${z.x + z.w - 1},${y}`); }
  }
  for (const k of added) removed.delete(k);
  return {
    added,
    removed,
    objectsAdded: next.objects.filter((o) => !prevIds.has(o.id)).length,
    objectsRemoved: prev.objects.filter((o) => !nextIds.has(o.id)).length,
  };
}
