import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps } from "../../../src/features/jamworld/lib/world/ops";
import { applyOps as serverOps } from "../../../functions/src/jamworld/lib/world/ops";
import { createMap, tileAt } from "../../../src/features/jamworld/lib/world/map";
import { History } from "../../../src/features/jamworld/lib/world/history";
import { parseToolInput } from "../../../src/features/jamworld/lib/agent/prompt";
import { parseBrief } from "../../../src/features/jamworld/lib/agent/design";

test("Map expansion preserves coordinates, old terrain, interactions and undo; later failure is atomic", () => {
  const before = applyOps(createMap("m", "lesson", 20, 20), [
    { op: "paint", tileId: "tile.stone", x: 2, y: 2, w: 3, h: 4 },
    { op: "place", assetId: "nature.tree", x: 5, y: 3 },
    { op: "sign", x: 7, y: 4, text: "시작" },
    { op: "zone", name: "탐구", x: 8, y: 8, w: 3, h: 3 },
  ], { strict: true });
  assert.ok(before.ok);
  const ops = [{ op: "resize", width: 60, height: 50, tileId: "tile.grass" }, { op: "quiz", x: 50, y: 40, question: "다음 활동은?", choices: ["공유", "종료"], answer: 0 }];
  const result = applyOps(before.doc, ops, { strict: true });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.deepEqual(serverOps(before.doc, ops, { strict: true }).doc, result.doc);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) assert.equal(tileAt(result.doc, x, y), tileAt(before.doc, x, y));
  assert.deepEqual(result.doc.objects.slice(0, before.doc.objects.length), before.doc.objects);
  assert.deepEqual(result.doc.spawn, before.doc.spawn);
  assert.deepEqual(result.doc.zones, before.doc.zones);
  assert.equal(result.doc.interactions.at(-1)?.x, 50);
  const history = new History(); history.record(before.doc, "확장", result.doc);
  assert.deepEqual(history.undo(result.doc)?.doc, before.doc);
  assert.deepEqual(history.redo(before.doc)?.doc, result.doc);
  for (const invalid of [
    [{ op: "resize", width: 19, height: 20 }],
    [{ op: "resize", width: 121, height: 20 }],
    [{ op: "resize", width: 40, height: 40, tileId: "tile.water" }],
    [...ops, { op: "place", assetId: "missing", x: 1, y: 1 }],
  ]) { const fail = applyOps(before.doc, invalid); assert.equal(fail.ok, false); assert.equal(fail.doc, before.doc); }
});

test("Follow-up questions cannot silently execute a map change or an image request", () => {
  const questions = ["모둠마다 동시에 활동하나요?"];
  assert.deepEqual(parseToolInput({ summary: "확인할게요", ops: [], questions })?.questions, questions);
  // 질문과 작업이 함께 오면 작업은 실행하지 않고 질문만 남긴다(전체를 버리지 않음)
  const mixed = parseToolInput({ summary: "확인", ops: [{ op: "resize", width: 60, height: 50 }], questions });
  assert.deepEqual(mixed?.ops, []);
  assert.deepEqual(mixed?.questions, questions);
  assert.equal(parseToolInput({ ops: [], questions: ["1", "2", "3", "4"] })?.questions?.length, 3);
  // 고칠 수 없는 그림 요청 항목만 빠지고 나머지 결과는 살아 있다
  assert.equal(parseToolInput({ ops: [], assets: [{ draft: { name: "누락" }, x: 1, y: 1 }] })?.assets, undefined);
  const big = parseToolInput({ ops: [], assets: [{ draft: { name: "야구 경기장", description: "큰 경기장", category: "building", tags: ["아주아주아주긴태그이름입니다"], footprint: { w: 5, d: 5 }, passable: false, height: 2 }, x: 10, y: 10 }] });
  assert.deepEqual(big?.assets?.[0].draft.footprint, { w: 5, d: 5 });
  assert.equal(big?.assets?.[0].draft.tags[0].length, 12);
  const brief = { participants: 28, minutes: 40, subject: "4학년 과학", flow: "도입→탐구→공유", details: "", allowExpand: true };
  assert.deepEqual(parseBrief(brief), brief);
  assert.equal(parseBrief({ ...brief, participants: 100000 }), null);
});
