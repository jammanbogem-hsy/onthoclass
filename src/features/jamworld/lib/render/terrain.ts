import type { AssetDef, MapDoc } from "../world/types";
import { getAsset } from "../world/catalog";
import { tileAt } from "../world/map";
import { UNIT } from "./projection";

type C = CanvasRenderingContext2D;
type Side = "n" | "e" | "s" | "w";
const SIDES: Side[] = ["n", "e", "s", "w"];
export interface TerrainEdges {
  n: boolean;
  w: boolean;
  e?: boolean;
  s?: boolean;
  neighbors?: Partial<Record<Side, AssetDef>>;
}

/** Look up all four banks, including cells in the next render chunk. */
export function terrainEdges(doc: MapDoc, x: number, y: number): TerrainEdges {
  const id = tileAt(doc, x, y);
  const neighbors = Object.fromEntries(
    SIDES.map((side, i) => {
      const nx = x + [0, 1, 0, -1][i],
        ny = y + [-1, 0, 1, 0][i];
      return [
        side,
        getAsset(
          nx < 0 || ny < 0 || nx >= doc.width || ny >= doc.height
            ? id
            : tileAt(doc, nx, ny),
        ),
      ];
    }),
  );
  return {
    n: neighbors.n?.id !== id,
    e: neighbors.e?.id !== id,
    s: neighbors.s?.id !== id,
    w: neighbors.w?.id !== id,
    neighbors,
  };
}

/** A painted neighbor can change a bank on any side of a cached chunk. */
export function terrainChunkChanged(
  a: MapDoc,
  b: MapDoc,
  cx: number,
  cy: number,
  size: number,
) {
  for (
    let y = Math.max(0, cy * size - 1);
    y < Math.min(b.height, (cy + 1) * size + 1);
    y++
  )
    for (
      let x = Math.max(0, cx * size - 1);
      x < Math.min(b.width, (cx + 1) * size + 1);
      x++
    )
      if (tileAt(a, x, y) !== tileAt(b, x, y)) return true;
  return false;
}

// All detail is seeded in world space: it stays in place across zooms, views and chunk borders.
function hash(x: number, y: number, salt = 0): number {
  let h =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(salt, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const PALETTE: Record<string, string> = {
  "tile.grass": "#79b95a",
  "tile.grass_dark": "#57964b",
  "tile.dirt": "#d5ad79",
  "tile.sand": "#ead39a",
  "tile.stone": "#9aa9b1",
  "tile.wood": "#c59357",
  "tile.carpet": "#37aaa2",
  "tile.coral": "#df8978",
  "tile.water": "#299fbb",
};
export function terrainColor(a?: AssetDef) {
  return (a && PALETTE[a.id]) || a?.colors.top || PALETTE["tile.grass"];
}
function line(ctx: C, points: number[][]) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const p of points.slice(1)) ctx.lineTo(p[0], p[1]);
}
function oval(
  ctx: C,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Broad translucent washes continue across cells, without a per-cell brightness checker. */
function wash(ctx: C, cx: number, cy: number, light: string, shade: string) {
  const ox = cx * UNIT,
    oy = cy * UNIT,
    pitch = 112;
  for (
    let gy = Math.floor(oy / pitch) - 1;
    gy <= Math.ceil((oy + UNIT) / pitch);
    gy++
  )
    for (
      let gx = Math.floor(ox / pitch) - 1;
      gx <= Math.ceil((ox + UNIT) / pitch);
      gx++
    ) {
      const h = hash(gx, gy, 1),
        x = gx * pitch + hash(gx, gy, 2) * pitch - ox,
        y = gy * pitch + hash(gx, gy, 3) * pitch - oy;
      const r = 45 + h * 55;
      if (x + r < 0 || y + r < 0 || x - r > UNIT || y - r > UNIT) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, h > 0.45 ? light : shade);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1, UNIT + 2, UNIT + 2);
    }
}

function grass(ctx: C, cx: number, cy: number, dark: boolean) {
  wash(ctx, cx, cy, "rgba(223,239,137,.24)", "rgba(40,100,48,.15)");
  const seed = hash(cx, cy, 8),
    count = 1 + (seed > 0.7 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const x = 7 + hash(cx, cy, i + 12) * 49,
      y = 9 + hash(cx, cy, i + 22) * 46;
    const s = 0.65 + hash(cx, cy, i + 32) * 0.5;
    oval(ctx, x, y + 1, 4.8 * s, 1.8 * s, "rgba(44,98,44,.10)");
    ctx.lineCap = "round";
    ctx.lineWidth = 1.15 * s;
    ctx.strokeStyle = dark ? "rgba(37,95,47,.60)" : "rgba(55,116,45,.52)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - 0.6 * s, y - 3 * s, x - 3 * s, y - 4 * s);
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + s, y - 4 * s, x + 2 * s, y - 6 * s);
    ctx.stroke();
    ctx.strokeStyle = "rgba(227,246,151,.55)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + 1.8 * s, y - 1.2 * s);
    ctx.quadraticCurveTo(x + 3 * s, y - 3 * s, x + 4.7 * s, y - 3.5 * s);
    ctx.stroke();
  }
  if (seed > 0.88) {
    const x = 12 + seed * 36,
      y = 14 + hash(cx, cy, 91) * 37;
    for (const [dx, dy] of [
      [-1.5, 0],
      [1.5, 0],
      [0, -2],
    ])
      oval(ctx, x + dx, y + dy, 1.8, 1.2, "rgba(207,229,128,.65)");
  }
}

function earth(ctx: C, cx: number, cy: number, sand: boolean) {
  wash(ctx, cx, cy, "rgba(255,243,195,.24)", "rgba(140,103,63,.12)");
  for (let i = 0; i < 5; i++) {
    const x = 5 + hash(cx, cy, 110 + i) * 54,
      y = 5 + hash(cx, cy, 120 + i) * 54;
    const r = 0.6 + hash(cx, cy, 130 + i) * (sand ? 0.6 : 1.2);
    oval(
      ctx,
      x,
      y + 0.6,
      r + 0.3,
      r * 0.55,
      sand ? "rgba(163,130,72,.22)" : "rgba(130,98,60,.28)",
    );
    oval(
      ctx,
      x - 0.2,
      y,
      r,
      r * 0.5,
      sand ? "rgba(255,247,208,.7)" : "rgba(238,215,167,.8)",
    );
  }
  if (sand && hash(cx, cy, 140) > 0.5) {
    ctx.strokeStyle = "rgba(177,142,78,.16)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(14, 38);
    ctx.quadraticCurveTo(22, 34, 30, 37);
    ctx.moveTo(33, 17);
    ctx.quadraticCurveTo(40, 14, 47, 16);
    ctx.stroke();
  }
}

/** Rounded, bevelled pavers laid in running bond rather than a repeated square inset. */
function stone(ctx: C, cx: number, cy: number) {
  const ox = cx * UNIT,
    oy = cy * UNIT;
  for (let row = cy * 2; row < cy * 2 + 2; row++) {
    const offset = (row % 2) * 32;
    for (
      let col = Math.floor((ox - offset) / 64);
      col <= Math.floor((ox + UNIT - offset) / 64);
      col++
    ) {
      const x = col * 64 + offset - ox + 1.7,
        y = row * 32 - oy + 1.5;
      const h = hash(col, row, 150),
        cut = 4 + h * 2,
        w = 60.6,
        d = 28.6;
      const shape = (dy = 0) => {
        ctx.beginPath();
        ctx.moveTo(x + cut, y + dy);
        ctx.lineTo(x + w - cut, y + dy);
        ctx.quadraticCurveTo(x + w, y + dy, x + w, y + cut + dy);
        ctx.lineTo(x + w, y + d - cut + dy);
        ctx.quadraticCurveTo(x + w, y + d + dy, x + w - cut, y + d + dy);
        ctx.lineTo(x + cut, y + d + dy);
        ctx.quadraticCurveTo(x, y + d + dy, x, y + d - cut + dy);
        ctx.lineTo(x, y + cut + dy);
        ctx.quadraticCurveTo(x, y + dy, x + cut, y + dy);
        ctx.closePath();
      };
      shape(1.6);
      ctx.fillStyle = "#85939b";
      ctx.fill();
      const g = ctx.createLinearGradient(x, y, x + 9, y + d);
      const l = 70 + h * 8;
      g.addColorStop(0, `hsl(${209 - h * 14} 12% ${l + 4}%)`);
      g.addColorStop(0.72, `hsl(${211 - h * 14} 11% ${l}%)`);
      g.addColorStop(1, `hsl(210 12% ${l - 3}%)`);
      shape();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(62,83,99,.35)";
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.strokeStyle = "rgba(250,252,237,.4)";
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x + 1.7, y + d - 7);
      ctx.lineTo(x + 1.7, y + cut);
      ctx.quadraticCurveTo(x + 1.7, y + 1.5, x + cut, y + 1.5);
      ctx.lineTo(x + w - cut - 3, y + 1.5);
      ctx.stroke();
      if (h > 0.72) {
        ctx.strokeStyle = "rgba(102,124,135,.22)";
        ctx.lineWidth = 0.7;
        line(ctx, [
          [x + w - 5, y + d - 7],
          [x + w - 10, y + d - 10],
          [x + w - 15, y + d - 9],
        ]);
        ctx.stroke();
      }
    }
  }
}

function wood(ctx: C, cx: number, cy: number) {
  const ox = cx * UNIT,
    oy = cy * UNIT,
    pitch = UNIT / 3;
  for (let row = cy * 3; row < cy * 3 + 3; row++) {
    const y = row * pitch - oy,
      offset = (row % 2) * 64;
    for (
      let col = Math.floor((ox - offset) / 128);
      col <= Math.floor((ox + UNIT - offset) / 128);
      col++
    ) {
      const x = col * 128 + offset - ox,
        h = hash(col, row, 160);
      const g = ctx.createLinearGradient(0, y, 0, y + pitch);
      g.addColorStop(0, `hsl(35 55% ${66 + h * 5}%)`);
      g.addColorStop(0.18, `hsl(34 48% ${60 + h * 5}%)`);
      g.addColorStop(1, `hsl(30 43% ${51 + h * 5}%)`);
      ctx.fillStyle = g;
      ctx.fillRect(x + 0.6, y + 0.7, 126.8, pitch - 1.4);
      ctx.strokeStyle = "rgba(112,72,39,.25)";
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 5 + i * 4);
        ctx.bezierCurveTo(
          x + 40,
          y + 2 + i * 4,
          x + 78,
          y + 10 + i * 2,
          x + 120,
          y + 5 + i * 4,
        );
        ctx.stroke();
      }
      if (h > 0.65) {
        ctx.strokeStyle = "rgba(112,72,39,.25)";
        ctx.beginPath();
        ctx.ellipse(x + 29 + h * 62, y + 11, 5.5, 1.7, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

/** A water boundary is a shallow, rounded inlet, with a bank coloured by its actual neighbor. */
function water(ctx: C, cx: number, cy: number, edges: TerrainEdges) {
  const U = UNIT;
  for (const side of SIDES) {
    if (!edges[side]) continue;
    ctx.fillStyle = terrainColor(edges.neighbors?.[side]);
    if (side === "n") ctx.fillRect(-1, -1, U + 2, 22);
    if (side === "s") ctx.fillRect(-1, U - 22, U + 2, 23);
    if (side === "w") ctx.fillRect(-1, -1, 22, U + 2);
    if (side === "e") ctx.fillRect(U - 22, -1, 23, U + 2);
  }
  const depth = (side: Side, t: number) =>
    edges[side]
      ? 6.5 +
        Math.sin(((side === "n" || side === "s" ? cx : cy) * U + t) / 17) * 1.3
      : -1;
  const n = (t: number) => depth("n", t),
    e = (t: number) => U - depth("e", t),
    s = (t: number) => U - depth("s", t),
    w = (t: number) => depth("w", t);
  const r = {
    nw: edges.n && edges.w ? 16 : 0,
    ne: edges.n && edges.e ? 16 : 0,
    se: edges.s && edges.e ? 16 : 0,
    sw: edges.s && edges.w ? 16 : 0,
  };
  const segments = () => {
    const top = [[w(0) + r.nw, n(0)]];
    for (let t = Math.max(8, w(0) + r.nw + 8); t < e(0) - r.ne; t += 8)
      top.push([t, n(t)]);
    top.push([e(0) - r.ne, n(U)]);
    const right = [[e(0), n(U) + r.ne]];
    for (let t = Math.max(8, n(U) + r.ne + 8); t < s(U) - r.se; t += 8)
      right.push([e(t), t]);
    right.push([e(U), s(U) - r.se]);
    const bottom = [[e(U) - r.se, s(U)]];
    for (let t = Math.min(56, e(U) - r.se - 8); t > w(U) + r.sw; t -= 8)
      bottom.push([t, s(t)]);
    bottom.push([w(U) + r.sw, s(0)]);
    const left = [[w(U), s(0) - r.sw]];
    for (let t = Math.min(56, s(0) - r.sw - 8); t > n(0) + r.nw; t -= 8)
      left.push([w(t), t]);
    left.push([w(0), n(0) + r.nw]);
    return [top, right, bottom, left];
  };
  const paths = segments();
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(...(paths[0][0] as [number, number]));
    for (let i = 0; i < 4; i++) {
      for (const p of paths[i].slice(1)) ctx.lineTo(p[0], p[1]);
      const control = [
          [e(0), n(U)],
          [e(U), s(U)],
          [w(U), s(0)],
          [w(0), n(0)],
        ][i],
        next = paths[(i + 1) % 4][0];
      ctx.quadraticCurveTo(control[0], control[1], next[0], next[1]);
    }
    ctx.closePath();
  };
  ctx.save();
  outline();
  ctx.clip();
  ctx.fillStyle = PALETTE["tile.water"];
  ctx.fillRect(-1, -1, U + 2, U + 2);
  wash(ctx, cx, cy, "rgba(83,221,209,.38)", "rgba(18,88,147,.27)");
  for (const side of SIDES) {
    if (!edges[side]) continue;
    const from = {
      n: [0, 0, 0, 25],
      e: [U, 0, U - 25, 0],
      s: [0, U, 0, U - 25],
      w: [0, 0, 25, 0],
    }[side];
    const g = ctx.createLinearGradient(
      ...(from as [number, number, number, number]),
    );
    g.addColorStop(0, "rgba(153,236,197,.75)");
    g.addColorStop(0.4, "rgba(84,219,212,.48)");
    g.addColorStop(1, "rgba(84,219,212,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, U + 2, U + 2);
  }
  // Sparse, varied reflections replace the same S-shaped glyph on every tile.
  const ox = cx * U,
    oy = cy * U,
    pitch = 39;
  for (
    let gy = Math.floor(oy / pitch) - 1;
    gy <= Math.ceil((oy + U) / pitch);
    gy++
  )
    for (
      let gx = Math.floor(ox / pitch) - 1;
      gx <= Math.ceil((ox + U) / pitch);
      gx++
    ) {
      const h = hash(gx, gy, 170),
        x = gx * pitch + h * 22 - ox,
        y = gy * pitch + hash(gx, gy, 171) * 25 - oy;
      if (x < -20 || x > U + 20 || y < -10 || y > U + 10) continue;
      ctx.lineCap = "round";
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = "rgba(204,255,239,.38)";
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        7 + h * 10,
        3 + h * 2,
        -0.2,
        0.16 * Math.PI,
        0.83 * Math.PI,
      );
      ctx.stroke();
      ctx.lineWidth = 0.65;
      ctx.strokeStyle = "rgba(143,238,228,.25)";
      ctx.beginPath();
      ctx.ellipse(
        x + 5,
        y + 8,
        6 + h * 8,
        2.8,
        -0.2,
        1.12 * Math.PI,
        1.75 * Math.PI,
      );
      ctx.stroke();
    }
  ctx.restore();
  // Draw only real banks, never shared water-cell edges.
  for (let i = 0; i < 4; i++) {
    if (!edges[SIDES[i]]) continue;
    line(ctx, paths[i]);
    if (edges[SIDES[(i + 1) % 4]]) {
      const control = [
          [e(0), n(U)],
          [e(U), s(U)],
          [w(U), s(0)],
          [w(0), n(0)],
        ][i],
        next = paths[(i + 1) % 4][0];
      ctx.quadraticCurveTo(control[0], control[1], next[0], next[1]);
    }
    ctx.strokeStyle = "rgba(68,104,72,.55)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = "rgba(216,251,214,.85)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function fringe(
  ctx: C,
  cx: number,
  cy: number,
  edges: TerrainEdges,
  id: string,
) {
  for (const side of SIDES) {
    const neighbor = edges.neighbors?.[side];
    if (
      !edges[side] ||
      !neighbor?.id.startsWith("tile.grass") ||
      neighbor.id === id
    )
      continue;
    ctx.save();
    if (side === "e") {
      ctx.translate(UNIT, 0);
      ctx.rotate(Math.PI / 2);
    }
    if (side === "s") {
      ctx.translate(UNIT, UNIT);
      ctx.rotate(Math.PI);
    }
    if (side === "w") {
      ctx.translate(0, UNIT);
      ctx.rotate(-Math.PI / 2);
    }
    const g = ctx.createLinearGradient(0, 0, 0, 7);
    g.addColorStop(0, terrainColor(neighbor));
    g.addColorStop(1, "rgba(94,145,63,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, UNIT, 7);
    ctx.fillStyle = terrainColor(neighbor);
    for (let i = 0; i < 5; i++) {
      const h = hash(cx, cy, 200 + SIDES.indexOf(side) * 7 + i),
        x = i * 13 + h * 5;
      ctx.beginPath();
      ctx.moveTo(x, -1);
      ctx.quadraticCurveTo(x + 2, 5 + h * 2, x + 4.5, 2 + h * 3);
      ctx.lineTo(x + 6, -1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Code-native terrain art; rendered once into bounded chunk caches in both projections. */
export function drawTileUnit(
  ctx: C,
  a: AssetDef | undefined,
  cx: number,
  cy: number,
  edges: TerrainEdges,
  _view: "td" | "iso",
  texture?: {
    image: CanvasImageSource;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null,
) {
  const U = UNIT;
  if (texture) {
    // The student's uploaded texture remains the source, without a brightness checker overlay.
    ctx.drawImage(
      texture.image,
      texture.x,
      texture.y,
      texture.w,
      texture.h,
      -1,
      -1,
      U + 2,
      U + 2,
    );
    return;
  }
  const id = a?.id ?? "tile.grass";
  ctx.fillStyle = terrainColor(a);
  ctx.fillRect(-1, -1, U + 2, U + 2);
  ctx.save();
  ctx.beginPath();
  // Paint the same world-space detail in the one-pixel overlap, so zoomed cells do not leave a flat-colour seam.
  ctx.rect(-1, -1, U + 2, U + 2);
  ctx.clip();
  if (id.startsWith("tile.grass")) grass(ctx, cx, cy, id === "tile.grass_dark");
  else if (id === "tile.water") water(ctx, cx, cy, edges);
  else if (id === "tile.stone") stone(ctx, cx, cy);
  else if (id === "tile.wood") wood(ctx, cx, cy);
  else if (id === "tile.dirt" || id === "tile.sand")
    earth(ctx, cx, cy, id === "tile.sand");
  else if (id === "tile.carpet") {
    wash(ctx, cx, cy, "rgba(209,255,233,.09)", "rgba(28,80,78,.09)");
    // Threads share world coordinates too; no per-cell gradient or rectangular carpet outlines.
    ctx.fillStyle = "rgba(255,255,255,.045)";
    for (let y = Math.floor((cy * U) / 5) * 5 - cy * U; y <= U + 1; y += 5)
      ctx.fillRect(-1, y, U + 2, 0.6);
  } else if (id === "tile.coral") {
    ctx.fillStyle = "#b97065";
    ctx.fillRect(-1, -1, U + 2, U + 2);
    const g = ctx.createLinearGradient(2, 2, U - 2, U - 2);
    g.addColorStop(0, "#f2ad96");
    g.addColorStop(0.6, "#e69b85");
    g.addColorStop(1, "#d78a78");
    ctx.beginPath();
    ctx.roundRect(1.8, 1.8, U - 3.6, U - 3.6, 7);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(127,65,56,.25)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,232,202,.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(3.4, U - 9);
    ctx.lineTo(3.4, 8);
    ctx.quadraticCurveTo(3.4, 3.4, 8, 3.4);
    ctx.lineTo(U - 9, 3.4);
    ctx.stroke();
  }
  if (id !== "tile.water") fringe(ctx, cx, cy, edges, id);
  ctx.restore();
}
