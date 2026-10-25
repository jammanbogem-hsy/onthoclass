import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMap } from '../../../src/features/jamworld/lib/world/map';
import { applyOps } from '../../../src/features/jamworld/lib/world/ops';
import { parseMapJson, serializeMap } from '../../../src/features/jamworld/lib/world/io';
import { effectsAt } from '../../../src/features/jamworld/lib/world/effects';
import { planDemo } from '../../../src/features/jamworld/lib/agent/demo';
import { mapContext, SYSTEM_PROMPT } from '../../../src/features/jamworld/lib/agent/prompt';

test('Zone effects and JavaScript survive export/import and stop outside the zone', () => {
  const original = createMap('effects', '실험 월드', 20, 20);
  const source = 'World.onEnter("실험실", () => World.message("반가워요", 1000));';
  const result = applyOps(original, [{ op: 'zone', id: 'lab', name: '실험실', x: 4, y: 4, w: 8, h: 8 }, { op: 'zoneEffect', zoneId: 'lab', effects: { shake: 3, reverseControls: true, vision: 4, speed: 0.5 } }, { op: 'setScript', source }]);
  assert.equal(result.ok, true); assert.equal(original.zones.length, 0); assert.equal(original.script, undefined);
  const imported = parseMapJson(serializeMap(result.doc)); assert.equal(imported.ok, true);
  if (!imported.ok) return;
  assert.equal(imported.doc.script, source);
  assert.deepEqual(effectsAt(imported.doc, 5.5, 5.5), { shake: 3, reverseControls: true, vision: 4, speed: 0.5 });
  assert.deepEqual(effectsAt(imported.doc, 12, 12), {});
  assert.match(mapContext(imported.doc), /reverseControls/); assert.match(SYSTEM_PROMPT, /World.onUpdate/);
});
test('Malformed or excessive effects fail atomically on client and server', async () => {
  const { applyOps: serverApply } = await import('../../../functions/src/jamworld/lib/world/ops');
  const map = createMap('bounds', '검증', 20, 20);
  map.zones.push({ id: 'lab', name: '실험실', x: 4, y: 4, w: 8, h: 8 });
  for (const effects of [{ shake: 100 }, { reverseControls: 'yes' }, { vision: 0 }, { speed: NaN }, { fetch: 'https://example.test' }, null]) {
    const ops = [{ op: 'paint', tileId: 'tile.water', x: 0, y: 0 }, { op: 'zoneEffect', zoneId: 'lab', effects }];
    assert.equal(applyOps(map, ops).ok, false); assert.equal(serverApply(map, ops).ok, false);
    assert.equal(map.terrain[0], 0); assert.equal(map.zones[0].effects, undefined);
  }
  assert.equal(applyOps(map, [{ op: 'setScript', source: 'x'.repeat(8001) }]).ok, false);
  assert.equal(parseMapJson(JSON.stringify({ ...map, script: 42 })).ok, false);
});
test('Agent demo maps requests to composable effects without altering existing geometry', () => {
  const map = createMap('agent-effects', '도우미', 20, 20);
  map.zones.push({ id: 'lab', name: '실험실', x: 4, y: 4, w: 8, h: 8 });
  const plan = planDemo(map, '실험실에 가면 화면이 흔들리고 방향키가 반대로 되고 시야가 좁아지게 해줘');
  const result = applyOps(map, plan.ops, { strict: true }); assert.equal(result.ok, true);
  assert.equal(result.doc.zones[0].x, 4); assert.equal(result.doc.objects.length, 0);
  assert.deepEqual(effectsAt(result.doc, 5, 5), { shake: 3, reverseControls: true, vision: 4 });
});
