import { test } from "node:test";
import assert from "node:assert/strict";
import {
  terrainChunkChanged,
  terrainEdges,
} from "../../../src/features/jamworld/lib/render/terrain";
import { createMap } from "../../../src/features/jamworld/lib/world/map";
import { applyOps } from "../../../src/features/jamworld/lib/world/ops";

test("Water banks follow all four actual neighbors, without adding a bank between water cells", () => {
  const doc = applyOps(createMap("m", "t", 20, 20), [
    { op: "paint", tileId: "tile.water", x: 4, y: 4, w: 3, h: 3 },
    { op: "paint", tileId: "tile.sand", x: 4, y: 3, w: 3, h: 1 },
  ]).doc;
  assert.deepEqual(SIDES(terrainEdges(doc, 5, 5)), [
    false,
    false,
    false,
    false,
  ]);
  assert.deepEqual(SIDES(terrainEdges(doc, 4, 4)), [true, false, false, true]);
  assert.deepEqual(SIDES(terrainEdges(doc, 6, 6)), [false, true, true, false]);
  assert.equal(terrainEdges(doc, 4, 4).neighbors?.n?.id, "tile.sand");
  assert.equal(terrainEdges(doc, 4, 4).neighbors?.w?.id, "tile.grass");
});
function SIDES(e: ReturnType<typeof terrainEdges>) {
  return [e.n, e.e, e.s, e.w];
}

test("Editing east/south neighbors invalidates a cached bank across the chunk boundary", () => {
  const a = createMap("m", "t", 24, 24);
  for (const [x, y] of [
    [8, 6],
    [6, 8],
    [3, 6],
    [6, 3],
  ]) {
    const b = applyOps(a, [
      { op: "paint", tileId: "tile.water", x, y, w: 1, h: 1 },
    ]).doc;
    assert.equal(
      terrainChunkChanged(a, b, 1, 1, 4),
      true,
      `${x},${y}: adjacent bank`,
    );
  }
  const far = applyOps(a, [
    { op: "paint", tileId: "tile.water", x: 16, y: 16, w: 1, h: 1 },
  ]).doc;
  assert.equal(terrainChunkChanged(a, far, 1, 1, 4), false);
  assert.equal(terrainChunkChanged(a, a, 1, 1, 4), false);
});
