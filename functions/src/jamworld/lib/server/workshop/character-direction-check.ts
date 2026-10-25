import sharp from "sharp";
import { CANONICAL_CHARACTER_DIRECTIONS, type CharacterView } from "./character-sprite";

function difference(a: Buffer, b: Buffer) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    const aa = a[i + 3] / 255, ba = b[i + 3] / 255;
    for (let c = 0; c < 3; c++) sum += Math.abs(a[i + c] * aa - b[i + c] * ba);
    sum += Math.abs(a[i + 3] - b[i + 3]);
  }
  return sum / (a.length * 255);
}

/** Conservative pixel checks for duplicate headings and obvious row swaps, not semantic vision. */
export async function checkCanonicalCharacterDirections(png: Buffer, view: CharacterView, columns: number, contentHeight: number) {
  const directions = CANONICAL_CHARACTER_DIRECTIONS[view];
  const top = Math.max(0, 152 - contentHeight), height = Math.max(1, Math.min(160 - top, Math.ceil(contentHeight * 0.6)));
  const heads = await Promise.all(directions.map((_, row) => Promise.all(Array.from({ length: columns }, (_, col) =>
    sharp(png).extract({ left: col * 128, top: row * 160 + top, width: 128, height }).resize(32, 24).ensureAlpha().raw().toBuffer(),
  ))));
  const front = directions.indexOf("s"), back = directions.indexOf("n");
  for (let col = 0; col < columns; col++) {
    if (difference(heads[front][col], heads[back][col]) < 0.012) throw Error("캐릭터 동작 그림을 확인해 주세요: 앞쪽과 뒤쪽 모습이 너무 비슷하거나 중복됐어요");
  }
  for (let row = 0; row < directions.length; row++) for (let col = 1; col < columns; col++) {
    const own = difference(heads[row][0], heads[row][col]);
    const other = Math.min(...heads.filter((_, i) => i !== row).map(h => difference(h[0], heads[row][col])));
    if (own > 0.025 && other + 0.012 < own) throw Error(`캐릭터 동작 그림을 확인해 주세요: ${row + 1}번째 줄의 ${col + 1}번째 동작이 다른 방향의 그림과 섞였어요`);
  }
}
