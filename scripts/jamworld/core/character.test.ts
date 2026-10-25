import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { prepareCharacterSheet } from "../../../functions/src/jamworld/lib/server/workshop/character-images";
import {
  characterFacing,
  characterFrame,
  characterSheet,
  isCharacterSheet,
  canonicalCharacterDirection,
  characterPose,
} from "../../../src/features/jamworld/lib/server/workshop/character-sprite";
const require = createRequire(import.meta.url);
const { characterFixture } = require("../character-fixture.cjs");
const sharp = createRequire(
  new URL("../../../functions/package.json", import.meta.url),
)("sharp");

test("All character poses are cut, scaled together and aligned at the feet", async () => {
  for (const view of ["td", "iso"] as const) {
    const out = await prepareCharacterSheet(
      await characterFixture(view),
      view,
      `/${view}.png`,
    );
    assert.ok(isCharacterSheet(out.sheet, view));
    const meta = await sharp(out.bytes).metadata();
    assert.equal(meta.width, 640);
    assert.equal(meta.height, view === "td" ? 640 : 1280);
    assert.equal((await sharp(out.preview).metadata()).height, 160);
    for (const direction of out.sheet.directions)
      for (let i = 0; i < out.sheet.columns; i++) {
        const f = characterFrame(out.sheet, direction, i);
        const { data, info } = await sharp(out.bytes)
          .extract({ left: f.x, top: f.y, width: f.w, height: f.h })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        let last = -1;
        for (let y = 0; y < info.height; y++)
          for (let x = 0; x < info.width; x++)
            if (data[(y * info.width + x) * 4 + 3] > 32) last = y;
        assert.ok(
          last >= 150 && last <= 151,
          "Every pose must stand on the same ground line",
        );
      }
  }
});
test("Blank, opaque and repeated static poses cannot be labeled as walking sprites", async () => {
  for (const alpha of [0, 1]) {
    const png = await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 120, g: 50, b: 20, alpha },
      },
    })
      .png()
      .toBuffer();
    await assert.rejects(
      prepareCharacterSheet(png, "td", "test.png"),
      /캐릭터 동작 그림/,
    );
  }
  await assert.rejects(
    prepareCharacterSheet(await characterFixture("td", true), "td", "test.png"),
    /모두 같아요/,
  );
});
test("Grid direction and screen direction select the intended sheet row", () => {
  assert.deepEqual(
    [0, 1, 2, 3].map((dir) => characterFacing("td", dir)),
    ["s", "w", "n", "e"],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((dir) => characterFacing("iso", dir)),
    ["sw", "nw", "ne", "se"],
  );
  const sheet = characterSheet("iso", "test.png");
  for (let face = 0; face < 8; face++)
    assert.deepEqual(
      characterFrame(sheet, characterFacing("iso", 0, face), 3),
      { x: 384, y: face * 160, w: 128, h: 160 },
    );
  assert.equal(
    isCharacterSheet({ ...sheet, directions: ["wrong"] }, "iso"),
    false,
  );
});
test("Outer margins and small row offsets do not cut heads or feet", async () => {
  const out = await prepareCharacterSheet(
    await characterFixture("iso", false, true),
    "iso",
    "test.png",
  );
  assert.equal((await sharp(out.bytes).metadata()).height, 1280);
  assert.equal(out.sheet.directions.length * out.sheet.columns, 40);
});
test("Old four-column saved sheets keep their original geometry", async () => {
  const out = await prepareCharacterSheet(
    await characterFixture("iso", false, false, 4),
    "iso",
    "old.png",
    4,
  );
  assert.ok(isCharacterSheet(out.sheet, "iso"));
  assert.equal(out.sheet.columns, 4);
  assert.equal((await sharp(out.bytes).metadata()).width, 512);
  assert.equal(characterFrame(out.sheet, "se", 4).x, 384);
});

test("Canonical directions expand to every heading and mirror each pose without reversing the walking cycle", async () => {
  for (const view of ["td", "iso"] as const) {
    const out = await prepareCharacterSheet(await characterFixture(view, false, false, 5, true), view, `${view}.png`, 5, "canonical");
    assert.ok(isCharacterSheet(out.sheet, view));
    assert.equal(out.sheet.construction, "canonical-mirrored-v1");
    for (const direction of out.sheet.directions) {
      const source = canonicalCharacterDirection(direction);
      if (!source.mirror) continue;
      for (let col = 0; col < 5; col++) {
        const target = characterFrame(out.sheet, direction, col), original = characterFrame(out.sheet, source.direction, col);
        const bytes = async (f: typeof target, mirror = false) => {
          let image = sharp(out.bytes).extract({ left: f.x, top: f.y, width: f.w, height: f.h });
          if (mirror) image = image.flop();
          return image.raw().toBuffer();
        };
        assert.deepEqual(await bytes(target), await bytes(original, true), `${view}/${direction}/${col}: same gait phase and opposite screen heading`);
      }
    }
    const south = characterFrame(out.sheet, "s", 0), north = characterFrame(out.sheet, "n", 0);
    assert.notDeepEqual(await sharp(out.bytes).extract({ left: south.x, top: south.y, width: south.w, height: south.h }).raw().toBuffer(), await sharp(out.bytes).extract({ left: north.x, top: north.y, width: north.w, height: north.h }).raw().toBuffer(), "Front and back remain distinct");
  }
});

test("Legacy five-column avatars derive missing left facings from the right, while packed and older four-column sheets keep their own frames", () => {
  const sheet = characterSheet("iso", "old.png");
  assert.deepEqual(characterPose(sheet, "w", 2), { x: 256, y: 960, w: 128, h: 160, mirror: true });
  assert.deepEqual(characterPose(sheet, "nw", 3), { x: 384, y: 800, w: 128, h: 160, mirror: true });
  assert.equal(characterPose(sheet, "n", 1).mirror, false);
  assert.deepEqual(characterPose({ ...sheet, construction: "canonical-mirrored-v1" }, "w", 2), { x: 256, y: 320, w: 128, h: 160, mirror: false });
  assert.equal(characterPose(characterSheet("iso", "older.png", 4), "w", 2).mirror, false);
});

test("Canonical generation rejects duplicate front/back, a walking pose from another row, missing cells and extra figures", async () => {
  const original = await characterFixture("td", false, false, 5, true);
  const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = Math.floor(info.height / 3), cw = info.width / 5;
  const encode = (pixels: Buffer) => sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  const copy = (pixels: Buffer, sx: number, sy: number, dx: number, dy: number, w: number, h: number) => {
    for (let y = 0; y < h; y++) data.copy(pixels, ((dy + y) * info.width + dx) * 4, ((sy + y) * info.width + sx) * 4, ((sy + y) * info.width + sx + w) * 4);
  };
  const repeated = Buffer.from(data); copy(repeated, 0, 0, 0, ch * 2, info.width, ch);
  await assert.rejects(prepareCharacterSheet(await encode(repeated), "td", "bad.png", 5, "canonical"), /앞쪽과 뒤쪽/);
  const turned = Buffer.from(data); copy(turned, 0, ch, cw * 3, 0, cw, ch);
  await assert.rejects(prepareCharacterSheet(await encode(turned), "td", "bad.png", 5, "canonical"), /다른 방향/);
  const missing = Buffer.from(data);
  for (let y = 0; y < ch; y++) missing.fill(0, (y * info.width + cw * 4) * 4, ((y + 1) * info.width) * 4);
  await assert.rejects(prepareCharacterSheet(await encode(missing), "td", "bad.png", 5, "canonical"), /비어 있는 동작/);
  const extra = await sharp(original).composite([{ input: Buffer.from('<svg width="1280" height="1024"><rect x="5" y="5" width="48" height="48" fill="#123456"/></svg>') }]).png().toBuffer();
  await assert.rejects(prepareCharacterSheet(extra, "td", "bad.png", 5, "canonical"), /정확히 15개/);
});

test("The checked-in corrected runner still passes the stricter direction checks", async () => {
  const source = await readFile(new URL("../../../design/jamworld/headset-runner-direction-source-v3.png", import.meta.url));
  const out = await prepareCharacterSheet(source, "iso", "runner.png", 5, "canonical");
  assert.ok(isCharacterSheet(out.sheet, "iso"));
});
