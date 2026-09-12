// npm --prefix functions run build && node --test tests/trading-cost.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSharedCache, sumBuyTotal, hasInvested } = require('../functions/lib/sharedCache');

test('30 concurrent cold callers share one calculation', async () => {
  let owner, value, builds = 0;
  const store = {
    async claim(token) { if (value) return { kind: 'hit', value }; if (owner) return { kind: 'busy' }; owner = token; return { kind: 'owner' }; },
    async publish(token, next) { assert.equal(token, owner); value = next; owner = null; },
    async release() { owner = null; },
  };
  const rows = await Promise.all(Array.from({ length: 30 }, (_, i) => loadSharedCache(store, String(i), async () => { builds++; await new Promise(r => setTimeout(r, 2)); return { rows: [1] }; }, () => new Promise(r => setTimeout(r, 1)))));
  assert.equal(builds, 1); assert.equal(rows.length, 30);
  assert.ok(rows.every(r => r === value));
});
test('failed builds release lease; next request can retry', async () => {
  let released = false;
  const store = { claim: async () => ({ kind: 'owner' }), publish: async () => {}, release: async () => { released = true; } };
  await assert.rejects(loadSharedCache(store, 'a', async () => { throw Error('failed'); }));
  assert.equal(released, true);
  assert.equal(await loadSharedCache(store, 'b', async () => 123), 123);
});
test('cold busy wait is bounded and does not fall back to duplicate scans', async () => {
  let claims = 0, builds = 0;
  await assert.rejects(loadSharedCache({ claim: async () => { claims++; return { kind: 'busy' }; } }, 'a', async () => { builds++; }, async () => {}));
  assert.equal(claims, 20); assert.equal(builds, 0);
});
test('legacy sum keeps buy fees, ignores sells, and accepts migrated zero', () => {
  assert.equal(sumBuyTotal([{ side: 'buy', total: 101 }, { side: 'sell', total: 200 }, { side: 'buy', total: 202 }, { side: 'buy', total: NaN }]), 303);
  assert.equal(hasInvested(0), true); assert.equal(hasInvested(undefined), false);
});

// 실제 callable 코드를 로드하고 Firestore 경계만 가짜 저장소로 대체한다.
const { fixture } = require('./support/firebase-fixture.cjs');
test('legacy ranking migrates once; warm and expired caches never rescan trades', async () => {
  const f = fixture();
  f.docs.set('classes/c/positions/u', { holdings: { '005930': { qty: 2, avgCost: 101 } }, realized: 20 });
  f.docs.set('classes/c/trades/old', { uid: 'u', side: 'buy', total: 202 });
  const result = await f.api.getTradingRanking(f.request({}));
  assert.equal(f.docs.get('classes/c/positions/u').invested, 202);
  assert.equal(result.rows[0].returnPct, 18 / 202 * 100);
  assert.equal(f.reads.filter(p => p === 'classes/c/trades').length, 1);
  f.reads.length = 0;
  await f.api.getTradingRanking(f.request({}));
  assert.equal(f.reads.length, 2, 'warm ranking reads only membership and cache');
  f.tick(31000); f.reads.length = 0;
  await f.api.getTradingRanking(f.request({}));
  assert.equal(f.reads.filter(p => p === 'classes/c/trades').length, 0);
  f.docs.delete('classes/c/members/u');
  await assert.rejects(f.api.getTradingRanking(f.request({})), e => e.code === 'permission-denied');
});
test('trade migration, buy fee, duplicate id, and full sell preserve cumulative investment', async () => {
  const f = fixture();
  f.docs.set('classes/c/positions/u', { holdings: { '005930': { qty: 1, avgCost: 101 } }, realized: 0 });
  f.docs.set('classes/c/trades/old', { uid: 'u', side: 'buy', total: 101 });
  const buy = f.request({ symbol: '005930', side: 'buy', qty: 1, tradeId: 'buy' });
  await f.api.executeTrade(buy);
  assert.equal(f.docs.get('classes/c/positions/u').invested, 202);
  assert.equal(f.docs.get('classes/c/manbo/u').balance, 9899);
  f.reads.length = 0;
  await f.api.executeTrade(buy);
  assert.equal(f.docs.get('classes/c/positions/u').invested, 202);
  assert.equal(f.docs.get('classes/c/manbo/u').balance, 9899);
  await f.api.executeTrade(f.request({ symbol: '005930', side: 'sell', qty: 2, tradeId: 'sell' }));
  const pos = f.docs.get('classes/c/positions/u');
  assert.equal(pos.invested, 202); assert.equal(Object.keys(pos.holdings).length, 0);
  assert.equal(pos.realized, -3);
  assert.equal(f.reads.filter(p => p === 'classes/c/trades').length, 0);
});
