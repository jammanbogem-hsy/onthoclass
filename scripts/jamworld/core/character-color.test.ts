import { test } from "node:test";
import assert from "node:assert/strict";
import {
  characterPalette,
  recolorCharacterPixels,
} from "../../../src/features/jamworld/lib/render/character-color";
import {
  hsl2rgb,
  rgb2hsl,
  recolorPixels,
} from "../../../src/features/jamworld/lib/render/avatar-look";
import { DEFAULT_LOOK } from "../../../src/features/jamworld/lib/server/workshop/avatar";
import { validateAvatar } from "../../../functions/src/jamworld/lib/server/workshop/service";

test("Original color detection ignores transparency, white and dark outlines", () => {
  const data = new Uint8ClampedArray(80 * 4);
  for (let i = 0; i < 80; i++)
    data.set(
      i < 20
        ? [...hsl2rgb(174, 0.8, 0.5), 255]
        : i < 40
          ? [255, 255, 255, 255]
          : i < 60
            ? [27, 31, 58, 255]
            : [255, 30, 30, 0],
      i * 4,
    );
  const palette = characterPalette([data]);
  assert.equal(palette.length, 1);
  assert.ok(Math.abs(palette[0].hue - 174) <= 1);
});
test("Color replacement preserves transparency, outlines and relative shading without cascading", () => {
  const source = new Uint8ClampedArray([
    ...hsl2rgb(174, 0.8, 0.35),
    255,
    ...hsl2rgb(174, 0.8, 0.6),
    200,
    27,
    31,
    58,
    255,
    255,
    255,
    255,
    255,
    23,
    45,
    67,
    0,
  ]);
  const original = source.slice();
  recolorCharacterPixels(source, [
    { source: 174, target: "violet" },
    { source: 262, target: "coral" },
  ]);
  assert.ok(Math.abs(rgb2hsl(source[0], source[1], source[2])[0] - 262) < 2);
  assert.ok(
    rgb2hsl(source[4], source[5], source[6])[2] >
      rgb2hsl(source[0], source[1], source[2])[2],
  );
  assert.deepEqual(source.slice(8), original.slice(8));
  assert.equal(source[3], 255);
  assert.equal(source[7], 200);
  const reset = original.slice();
  recolorCharacterPixels(reset, []);
  assert.deepEqual(reset, original);
});
test("Built-in clothing remains editable and arbitrary character color settings are bounded", () => {
  const data = new Uint8ClampedArray([...hsl2rgb(174, 0.72, 0.42), 255]);
  recolorPixels(data, { ...DEFAULT_LOOK, top: "violet" });
  assert.ok(Math.abs(rgb2hsl(data[0], data[1], data[2])[0] - 262) < 2);
  const profile = validateAvatar({
    assetId: "ast_example",
    assetColors: [{ source: 174, target: "violet", url: "https://bad.test" }],
    asset: { td: "https://bad.test" },
  });
  assert.deepEqual(profile.assetColors, [{ source: 174, target: "violet" }]);
  assert.equal(profile.asset, undefined);
  for (const colors of [
    [{ source: -1, target: "pink" }],
    [{ source: 360, target: "pink" }],
    [{ source: 20.5, target: "pink" }],
    [{ source: 20, target: "bad" }],
    Array.from({ length: 5 }, (_, i) => ({ source: i, target: "teal" })),
    [
      { source: 20, target: "pink" },
      { source: 20, target: "gold" },
    ],
  ])
    assert.throws(() =>
      validateAvatar({ assetId: "ast_example", assetColors: colors }),
    );
  assert.equal(
    validateAvatar({ ...profile, assetId: undefined }).assetColors,
    undefined,
  );
});
