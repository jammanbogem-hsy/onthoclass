import { test } from "node:test";
import assert from "node:assert/strict";
import { createMap } from "../../../src/features/jamworld/lib/world/map";
import { ScriptScene, validateScriptActions } from "../../../src/features/jamworld/lib/world/script-scene";
import { estimateImages } from "../../../functions/src/jamworld/lib/server/workshop/estimate";
import { parsePricing } from "../../../functions/src/jamworld/lib/server/workshop/pricing";
import type { ApprovedSnapshot } from "../../../functions/src/jamworld/lib/server/workshop/types";

test("Runtime collection, door opening and movement preserve authored data and player collision", () => {
  const doc = createMap("m", "test", 20, 20);
  doc.objects = [{ id: "door", assetId: "wall.stone", x: 5, y: 5, rot: 0 }, { id: "item", assetId: "deco.flag", x: 4, y: 5, rot: 0 }];
  const saved = JSON.stringify(doc), scene = new ScriptScene(doc);
  const player = { x: 4.5, y: 6.5, dir: 0, moving: false };
  assert.ok(scene.world.isBlocked(5, 5));
  assert.equal(scene.nearby(player, ["깃발"])?.id, "item");
  scene.changeObject("item", { visible: false }, player);
  assert.equal(scene.doc.objects.some(o => o.id === "item"), false);
  scene.changeObject("door", { blocking: false }, player);
  assert.equal(scene.world.isBlocked(5, 5), false);
  assert.equal(scene.changeObject("door", { blocking: true, x: 4, y: 6 }, player), false);
  assert.equal(scene.world.isBlocked(4, 6), false, "Closing a door must not trap the player");
  scene.changeObject("door", { x: 8, y: 8, blocking: true }, player);
  assert.equal(scene.world.isBlocked(8, 8), true);
  assert.equal(scene.changeObject("item", { visible: true, x: 8, y: 8 }, player), false, "Moving objects cannot overlap blocking objects");
  assert.throws(() => scene.changeObject("door", { x: 30 }, player));
  assert.throws(() => scene.changeObject("missing", {}, player));
  assert.equal(JSON.stringify(doc), saved);
  assert.ok(new ScriptScene(doc).world.isBlocked(5, 5), "A new play session starts from the authored map");
});

test("Script command boundary rejects unsupported UI, network commands and malformed patches", () => {
  validateScriptActions([{ kind: "hud", value: { id: "points", label: "점수", value: 10 } }, { kind: "choose", value: { id: "q", title: "길을 골라요", choices: ["숲", "학교"] } }]);
  validateScriptActions([{ kind: "completeQuiz", value: { id: "q1", label: "해결!" } }, { kind: "completeQuiz", value: { id: "q2" } }]);
  for (const command of [
    { kind: "fetch", value: { url: "https://example.com" } },
    { kind: "teleport", value: { x: 1e100, y: 10 } },
    { kind: "teleport", value: { x: -1, y: 10 } },
    { kind: "object", value: { id: "door", patch: { x: NaN } } },
    { kind: "object", value: { id: "door", patch: { html: "<script>" } } },
    { kind: "completeQuiz", value: { id: "q1", label: "x".repeat(13) } },
    { kind: "completeQuiz", value: { id: "q1", label: { html: "완료" } } },
    { kind: "completeQuiz", value: { id: "q1", label: "완료\n다시" } },
    { kind: "choose", value: { id: "q", title: "wrong", choices: ["a", "b", "c", "d", "e", "f"] } },
  ]) assert.throws(() => validateScriptActions([command]));
});

test("Image estimates count reusable textures once and include view-reference inputs without inventing unknown-model prices", () => {
  const snap: ApprovedSnapshot = { version: 1, draft: { name: "숲 바닥", description: "이끼와 작은 돌", category: "terrain", tags: ["숲"], footprint: { w: 1, d: 1 }, height: 0, passable: true }, uploadKey: null, uploadSha256: null, outputs: ["texture"] };
  const terrain = estimateImages(snap, "gpt-image-2.5-flare", parsePricing(null));
  assert.equal(terrain.images, 1); assert.equal(terrain.outputUsd, 0.01317); assert.ok(terrain.lowUsd! > terrain.outputUsd!); assert.ok(terrain.highUsd! > terrain.lowUsd!);
  const building = estimateImages({ ...snap, draft: { ...snap.draft, category: "building" }, outputs: ["td", "iso"] }, "gpt-image-2.5-flare", parsePricing(null));
  assert.equal(building.images, 2); assert.equal(building.referenceImages, 1); assert.ok(building.lowUsd! > terrain.lowUsd! * 2);
  assert.equal(estimateImages(snap, "unpriced", parsePricing(null)).lowUsd, null);
});
