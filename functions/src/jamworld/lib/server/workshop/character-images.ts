import sharp from "sharp";
import { createHash } from "node:crypto";
import { CANONICAL_CHARACTER_DIRECTIONS, canonicalCharacterDirection, characterSheet, type CharacterView } from "./character-sprite";
import { checkCanonicalCharacterDirections } from "./character-direction-check";

/** 정해진 격자를 검사하고, 전체 동작에 같은 배율과 발 기준점을 적용한다. */
export async function prepareCharacterSheet(
  bytes: Uint8Array,
  view: CharacterView,
  image: string,
  columns: 4 | 5 = 5,
  layout: "full" | "canonical" = "full",
) {
  const sheet = characterSheet(view, image, columns);
  const sourceDirections: readonly string[] = layout === "canonical" ? CANONICAL_CHARACTER_DIRECTIONS[view] : sheet.directions;
  const sourceRows = sourceDirections.length;
  if (layout === "canonical") sheet.construction = "canonical-mirrored-v1";
  const { data, info } = await sharp(bytes, { limitInputPixels: 16_777_216 })
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const fail = (detail: string): never => {
    throw new Error(`캐릭터 동작 그림을 확인해 주세요: ${detail}`);
  };
  if (info.width < 512 || info.height < 512)
    fail("방향별 격자 크기가 맞지 않아요");
  const cw = info.width / columns,
    ch = info.height / sourceRows;
  // AI 시트는 바깥 여백 때문에 격자 간격이 수 픽셀씩 다를 수 있다.
  // 투명 영역으로 분리된 실제 인물을 찾고 행·열로 정렬해 머리나 발이 잘리지 않게 한다.
  const labels = new Uint32Array(info.width * info.height),
    queue = new Uint32Array(labels.length);
  type Part = {
    label: number;
    x: number;
    y: number;
    right: number;
    bottom: number;
    count: number;
  };
  const parts: Part[] = [];
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] || data[i * 4 + 3] <= 32) continue;
    const label = parts.length + 1;
    const p: Part = {
      label,
      x: info.width,
      y: info.height,
      right: -1,
      bottom: -1,
      count: 0,
    };
    let head = 0,
      tail = 1;
    queue[0] = i;
    labels[i] = label;
    while (head < tail) {
      const at = queue[head++],
        x = at % info.width,
        y = Math.floor(at / info.width);
      p.x = Math.min(p.x, x);
      p.y = Math.min(p.y, y);
      p.right = Math.max(p.right, x);
      p.bottom = Math.max(p.bottom, y);
      p.count++;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy,
            next = ny * info.width + nx;
          if (
            nx < 0 ||
            nx >= info.width ||
            ny < 0 ||
            ny >= info.height ||
            labels[next] ||
            data[next * 4 + 3] <= 32
          )
            continue;
          labels[next] = label;
          queue[tail++] = next;
        }
    }
    parts.push(p);
  }
  const target = sourceRows * columns;
  const candidates = parts
    .filter((p) => p.count >= cw * ch * 0.02)
    .sort((a, b) => b.count - a.count);
  if (layout === "canonical" && candidates.length > target) fail(`인물은 정확히 ${target}개여야 해요. 격자 밖에 추가 인물이나 큰 그림이 있어요`);
  const primary = candidates.slice(0, target);
  if (primary.length !== target)
    fail("비어 있는 동작이 있거나 인물이 서로 붙어 있어요");
  if (
    primary.some(
      (p) =>
        p.count > cw * ch * 0.82 ||
        p.right - p.x >= cw * 0.95 ||
        p.bottom - p.y >= ch * 1.5,
    )
  )
    fail("배경이 투명하지 않거나 동작이 서로 붙어 있어요");
  primary.sort((a, b) => a.y + a.bottom - (b.y + b.bottom));
  const ordered: Part[] = [];
  for (let row = 0; row < sourceRows; row++) {
    const group = primary
      .slice(row * columns, (row + 1) * columns)
      .sort((a, b) => a.x + a.right - (b.x + b.right));
    const ys = group.map((p) => (p.y + p.bottom) / 2);
    if (Math.max(...ys) - Math.min(...ys) > ch * 0.6)
      fail("방향별 동작의 줄이 맞지 않아요");
    for (let col = 1; col < columns; col++)
      if (
        (group[col].x +
          group[col].right -
          group[col - 1].x -
          group[col - 1].right) /
          2 <
        cw * 0.2
      )
        fail("한 칸에 여러 인물이 있어요");
    ordered.push(...group);
  }
  const groups = ordered.map((p) => ({ ...p, labels: new Set([p.label]) }));
  const mainLabels = new Set(primary.map((p) => p.label));
  // 몸과 약간 떨어진 작은 장식도 가장 가까운 몸에 포함한다.
  for (const p of parts) {
    if (mainLabels.has(p.label) || p.count < 4) continue;
    let best = -1,
      distance = Infinity;
    ordered.forEach((body, index) => {
      const dx = Math.max(0, body.x - p.right, p.x - body.right),
        dy = Math.max(0, body.y - p.bottom, p.y - body.bottom);
      const d = Math.hypot(dx, dy);
      if (d < distance) {
        best = index;
        distance = d;
      }
    });
    if (best < 0 || distance > Math.min(cw, ch) * 0.15) continue;
    const body = groups[best];
    body.labels.add(p.label);
    body.x = Math.min(body.x, p.x);
    body.y = Math.min(body.y, p.y);
    body.right = Math.max(body.right, p.right);
    body.bottom = Math.max(body.bottom, p.bottom);
  }
  const cells: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    hash: string;
    pixels: Buffer;
    anchorX: number;
  }> = [];
  for (let row = 0; row < sourceRows; row++) {
    for (let col = 0; col < columns; col++) {
      const p = groups[row * columns + col];
      if (
        p.x < 1 ||
        p.y < 1 ||
        p.right >= info.width - 1 ||
        p.bottom >= info.height - 1
      )
        fail("캐릭터가 그림 밖으로 잘렸어요");
      const width = p.right - p.x + 1,
        height = p.bottom - p.y + 1,
        pixels = Buffer.alloc(width * height * 4);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const from = (p.y + y) * info.width + p.x + x;
          if (p.labels.has(labels[from]))
            data.copy(pixels, (y * width + x) * 4, from * 4, from * 4 + 4);
        }
      let upperX = 0,
        upperWeight = 0;
      for (let y = 0; y < height * 0.55; y++)
        for (let x = 0; x < width; x++) {
          const alpha = pixels[(y * width + x) * 4 + 3];
          upperX += (x + 0.5) * alpha;
          upperWeight += alpha;
        }
      cells.push({
        x: p.x,
        y: p.y,
        w: width,
        h: height,
        pixels,
        // 손발의 스윙이 전체 바운딩 박스를 바꿔도 머리·몸 중심이 옆으로 튀지 않는다.
        anchorX:
          columns === 5 && upperWeight ? upperX / upperWeight : width / 2,
        hash: createHash("sha256").update(pixels).digest("hex"),
      });
    }
    if (
      new Set(
        cells.slice(row * columns + 1, (row + 1) * columns).map((c) => c.hash),
      ).size < 2
    )
      fail(`${row + 1}번째 방향의 걷기 동작이 모두 같아요`);
  }
  const scale = Math.min(
    112 /
      Math.max(...cells.map((c) => 2 * Math.max(c.anchorX, c.w - c.anchorX))),
    144 / Math.max(...cells.map((c) => c.h)),
  );
  const input = await Promise.all(
    cells.map(async (cell, i) => {
      const w = Math.max(1, Math.round(cell.w * scale)),
        h = Math.max(1, Math.round(cell.h * scale));
      return {
        input: await sharp(cell.pixels, {
          raw: { width: cell.w, height: cell.h, channels: 4 },
        })
          .resize(w, h)
          .png()
          .toBuffer(),
        left: (i % columns) * 128 + Math.round(64 - cell.anchorX * scale),
        top: Math.floor(i / columns) * 160 + 152 - h,
      };
    }),
  );
  let png = await sharp({
    create: {
      width: columns * 128,
      height: sourceRows * 160,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(input)
    .png()
    .toBuffer();
  if (layout === "canonical") {
    await checkCanonicalCharacterDirections(png, view, columns, Math.ceil(Math.max(...cells.map(c => c.h)) * scale));
    const width = columns * 128, sourcePixels = await sharp(png).ensureAlpha().raw().toBuffer();
    const expanded = Buffer.alloc(width * sheet.rows * 160 * 4);
    sheet.directions.forEach((direction, row) => {
      const source = canonicalCharacterDirection(direction), sourceRow = sourceDirections.indexOf(source.direction);
      for (let y = 0; y < 160; y++) {
        const from = (sourceRow * 160 + y) * width * 4, to = (row * 160 + y) * width * 4;
        if (!source.mirror) { sourcePixels.copy(expanded, to, from, from + width * 4); continue; }
        // Flip each frame, never the whole strip: reversing columns would reverse the walking cycle.
        // Copy RGBA exactly, avoiding a second alpha composite that changes edge colors.
        for (let col = 0; col < columns; col++) for (let x = 0; x < 128; x++) {
          const a = from + (col * 128 + 127 - x) * 4, b = to + (col * 128 + x) * 4;
          sourcePixels.copy(expanded, b, a, a + 4);
        }
      }
    });
    png = await sharp(expanded, { raw: { width, height: sheet.rows * 160, channels: 4 } }).png().toBuffer();
  }
  const preview = await sharp(png)
    .extract({ left: 0, top: 0, width: 128, height: 160 })
    .webp({ lossless: true })
    .toBuffer();
  return { sheet, bytes: png, preview };
}
