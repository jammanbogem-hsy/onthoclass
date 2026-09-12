const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./support/firebase-fixture.cjs');
const { validateUsage, mergeUsage, usageDay } = require('../functions/lib/usage');
const START = Date.parse('2026-09-07T00:55:00Z');
test('validates feature allowlist, time windows and per-slot total', () => {
  assert.equal(validateUsage([{ start: START, counts: { trade: 120, lesson: 100 } }], START + 300000).length, 1);
  for (const entry of [{ start: START, counts: { trade: 301 } }, { start: START, counts: { trade: 200, lesson: 200 } }, { start: START, counts: { secret: 1 } }, { start: START + 1, counts: {} }, { start: START, counts: { trade: -1 } }]) assert.throws(() => validateUsage([entry], START + 300000));
  assert.throws(() => validateUsage([{ start: START + 300000, counts: { trade: 2 } }], START));
  assert.throws(() => validateUsage([{ start: START, counts: { trade: 100 } }], START + 1000));
  assert.throws(() => validateUsage([{ start: START, counts: {} }], START + 8 * 86400000));
});
test('KST day boundaries and monotonic duplicate-safe capped merge', () => {
  assert.equal(usageDay(Date.parse('2026-09-06T15:00:00Z')), '2026-09-07');
  assert.deepEqual(mergeUsage({ trade: 120 }, { trade: 120 }), { trade: 120 });
  assert.deepEqual(mergeUsage({ trade: 120 }, { trade: 150, lesson: 30 }), { trade: 150, lesson: 30 });
  const merged = mergeUsage({ trade: 250 }, { class: 100 });
  assert.equal(merged.trade, 250); assert.equal(merged.class, 50);
});
test('records only authenticated student, ignores supplied uid, and retries do not add time', async () => {
  const f = fixture();
  const req = f.request({ uid: 'spoof', entries: [{ start: START, counts: { trade: 120 } }] });
  await f.api.recordClassUsage(req);
  await f.api.recordClassUsage(req);
  const row = f.docs.get('classes/c/usageDays/2026-09-07_u');
  assert.equal(row.activeSeconds, 120); assert.equal(row.uid, 'u');
  assert.equal(f.docs.has('classes/c/usageDays/2026-09-07_spoof'), false);
  await f.api.recordClassUsage(f.request({ entries: [{ start: START, counts: { trade: 150 } }] }));
  assert.equal(f.docs.get('classes/c/usageDays/2026-09-07_u').activeSeconds, 150);
  await assert.rejects(f.api.recordClassUsage({ data: req.data }), e => e.code === 'unauthenticated');
  f.docs.set('classes/c/members/u', { role: 'teacher' });
  await assert.rejects(f.api.recordClassUsage(req), e => e.code === 'permission-denied');
});
test('teacher-only bounded query omits raw buckets and isolates classes', async () => {
  const f = fixture();
  await f.api.recordClassUsage(f.request({ entries: [{ start: START, counts: { lesson: 60 } }] }));
  const req = f.request({ from: '2026-09-01', to: '2026-09-07' });
  await assert.rejects(f.api.getClassUsage(req), e => e.code === 'permission-denied');
  f.docs.set('classes/c/members/u', { role: 'teacher' });
  f.docs.set('classes/other/usageDays/2026-09-07_u', { uid: 'u', day: '2026-09-07', activeSeconds: 999 });
  const result = await f.api.getClassUsage(req);
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].activeSeconds, 60); assert.equal(result.rows[0].buckets, undefined);
  await assert.rejects(f.api.getClassUsage(f.request({ from: '2026-01-01', to: '2026-09-07' })), e => e.code === 'invalid-argument');
});
