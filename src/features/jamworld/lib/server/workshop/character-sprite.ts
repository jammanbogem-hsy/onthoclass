/** 0=대기, 새 시트 1~4=좌 접지·우 통과·우 접지·좌 통과. 예전 4열 시트도 지원한다. */
export const CHARACTER_DIRECTIONS = {
  td: ["s", "w", "n", "e"],
  iso: ["s", "sw", "w", "nw", "n", "ne", "e", "se"],
} as const;
export type CharacterView = keyof typeof CHARACTER_DIRECTIONS;
/** Draw each angle once; derive screen-left views from the matching screen-right view. */
export const CANONICAL_CHARACTER_DIRECTIONS = {
  td: ["s", "e", "n"],
  iso: ["s", "se", "e", "ne", "n"],
} as const;
export function canonicalCharacterDirection(direction: string) {
  const mirrored: Record<string, string> = { w: "e", sw: "se", nw: "ne" };
  return { direction: mirrored[direction] || direction, mirror: Object.hasOwn(mirrored, direction) };
}
export interface CharacterSheet {
  image: string;
  columns: 4 | 5;
  rows: 4 | 8;
  frameWidth: 128;
  frameHeight: 160;
  directions: readonly string[];
  construction?: "canonical-mirrored-v1";
}
export type CharacterSheets = Record<CharacterView, CharacterSheet>;
export function characterSheet(
  view: CharacterView,
  image: string,
  columns: 4 | 5 = 5,
): CharacterSheet {
  return {
    image,
    columns,
    rows: view === "td" ? 4 : 8,
    frameWidth: 128,
    frameHeight: 160,
    directions: [...CHARACTER_DIRECTIONS[view]],
  };
}
export function isCharacterSheet(
  value: unknown,
  view: CharacterView,
): value is CharacterSheet {
  if (!value || typeof value !== "object") return false;
  const s = value as CharacterSheet,
    directions = CHARACTER_DIRECTIONS[view];
  return (
    typeof s.image === "string" &&
    !!s.image &&
    (s.columns === 4 || s.columns === 5) &&
    s.rows === directions.length &&
    s.frameWidth === 128 &&
    s.frameHeight === 160 &&
    Array.isArray(s.directions) &&
    s.directions.length === directions.length &&
    directions.every((d, i) => s.directions[i] === d)
    && (s.construction === undefined || s.construction === "canonical-mirrored-v1")
  );
}
export function characterFrame(
  sheet: CharacterSheet,
  direction: string,
  frame: number,
) {
  const row = Math.max(0, sheet.directions.indexOf(direction));
  return {
    x:
      Math.max(0, Math.min(sheet.columns - 1, Math.floor(frame))) *
      sheet.frameWidth,
    y: row * sheet.frameHeight,
    w: sheet.frameWidth,
    h: sheet.frameHeight,
  };
}
/** Older generated sheets sometimes put a second right profile in a left-facing row. */
export function characterPose(sheet: CharacterSheet, direction: string, frame: number) {
  const source = canonicalCharacterDirection(direction);
  const mirror = sheet.columns === 5 && !sheet.construction && source.mirror;
  return { ...characterFrame(sheet, mirror ? source.direction : direction, frame), mirror };
}
/** 접지에 조금 더 시간을 주고 양쪽 통과 포즈를 번갈아 쓴다. */
export function characterGaitFrame(
  phase: number,
  moving: boolean,
  columns: 4 | 5 = 5,
) {
  if (!moving) return 0;
  const p = ((phase % 1) + 1) % 1;
  const step = p < 0.3 ? 0 : p < 0.5 ? 1 : p < 0.8 ? 2 : 3;
  return (columns === 5 ? [1, 2, 3, 4] : [1, 2, 3, 2])[step];
}
export function characterFacing(
  view: CharacterView,
  dir: number,
  face8?: number,
) {
  return view === "iso"
    ? CHARACTER_DIRECTIONS.iso[face8 ?? [1, 3, 5, 7][dir] ?? 1]
    : (CHARACTER_DIRECTIONS.td[dir] ?? "s");
}
