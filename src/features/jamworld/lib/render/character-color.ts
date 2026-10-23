import { COLOR_HSL, type AssetColorChange } from "../server/workshop/avatar";
import { hsl2rgb, rgb2hsl } from "./avatar-look";

export interface CharacterColor {
  hue: number;
  css: string;
}
const distance = (a: number, b: number) =>
  Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));

/** 두 시점의 원본에서 최대 네 가지 대표 색을 고른다. 투명·검은 윤곽·흰색은 제외. */
export function characterPalette(
  images: readonly Uint8ClampedArray[],
): CharacterColor[] {
  const bins = Array.from({ length: 24 }, () => ({
    weight: 0,
    x: 0,
    y: 0,
    s: 0,
    l: 0,
  }));
  for (const data of images)
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      const [h, s, l] = rgb2hsl(data[i], data[i + 1], data[i + 2]);
      if (s < 0.35 || l < 0.22 || l > 0.85) continue;
      const b = bins[Math.round(h / 15) % 24],
        w = s;
      b.weight += w;
      b.x += Math.cos((h * Math.PI) / 180) * w;
      b.y += Math.sin((h * Math.PI) / 180) * w;
      b.s += s * w;
      b.l += l * w;
    }
  const total = bins.reduce((n, b) => n + b.weight, 0);
  const candidates = bins
    .map((_, i) =>
      [bins[(i + 23) % 24], bins[i], bins[(i + 1) % 24]].reduce(
        (a, b) => ({
          weight: a.weight + b.weight,
          x: a.x + b.x,
          y: a.y + b.y,
          s: a.s + b.s,
          l: a.l + b.l,
        }),
        { weight: 0, x: 0, y: 0, s: 0, l: 0 },
      ),
    )
    .filter((b) => b.weight > Math.max(8, total * 0.025))
    .sort((a, b) => b.weight - a.weight);
  const result: CharacterColor[] = [];
  for (const b of candidates) {
    const hue =
      (Math.round((Math.atan2(b.y, b.x) * 180) / Math.PI) + 360) % 360;
    if (result.some((c) => distance(c.hue, hue) < 30)) continue;
    result.push({
      hue,
      css: `hsl(${hue} ${Math.round((b.s / b.weight) * 100)}% ${Math.round((b.l / b.weight) * 100)}%)`,
    });
    if (result.length === 4) break;
  }
  return result;
}

/** 원본 색만 판정해 한 번 바꾼다. 전체 프레임에 같은 규칙, 명암·윤곽·알파 유지. */
export function recolorCharacterPixels(
  data: Uint8ClampedArray,
  changes: readonly AssetColorChange[],
) {
  if (!changes.length) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    const [h, s, l] = rgb2hsl(data[i], data[i + 1], data[i + 2]);
    if (s < 0.25 || l < 0.2 || l > 0.92) continue;
    let match: AssetColorChange | undefined,
      closest = 15;
    for (const change of changes) {
      const d = distance(h, change.source);
      if (d < closest) {
        closest = d;
        match = change;
      }
    }
    if (!match) continue;
    const [th, ts, tl] = COLOR_HSL[match.target];
    const color = hsl2rgb(
      th,
      clamp((s * ts) / 0.7),
      clamp(l + (tl - 0.5) * 0.75, 0.12, 0.95),
    );
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
  }
}

export function colorCharacterImage(
  image: HTMLImageElement,
  changes: readonly AssetColorChange[],
) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.dataset.characterSource = image.src;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  recolorCharacterPixels(pixels.data, changes);
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

export async function loadCharacterPalette(urls: readonly string[]) {
  const images = await Promise.all(
    urls.map(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (image.naturalWidth * image.naturalHeight > 16_777_216)
        throw new Error("그림이 너무 커요");
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    }),
  );
  return characterPalette(images);
}
