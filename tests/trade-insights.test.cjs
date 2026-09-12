const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const compiled = ts.transpileModule(fs.readFileSync('src/components/trade/insights.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { previewOrder, averageTradePrices } = context.exports;
const trade = (side, qty, mbPrice, at = 10, symbol = 'A') => ({ side, qty, mbPrice, at, symbol });
test('weighted execution prices separate sides, symbols, dates and empty history', () => {
  const result = averageTradePrices([trade('buy', 1, 100), trade('buy', 3, 200), trade('sell', 2, 300), trade('buy', 10, 1, 1), trade('buy', 50, 1, 10, 'B'), trade('buy', 0, 999)], 'A', 5);
  assert.equal(result.buy, 175); assert.equal(result.sell, 300);
  assert.equal(averageTradePrices([], 'A').buy, null);
});
test('buy includes other holdings, cash and fee in total assets', () => {
  const p = previewOrder(1000, 1000, 5, 100, 2, 'buy', 1);
  assert.equal(p.cash, 799); assert.equal(p.nextQty, 7); assert.equal(p.beforeWeight, 25);
  assert.ok(Math.abs(p.afterWeight - 700 / 1999 * 100) < 1e-8);
});
test('full sale leaves zero concentration and credits net proceeds', () => {
  const p = previewOrder(50, 500, 5, 100, 5, 'sell', 3);
  assert.equal(p.cash, 547); assert.equal(p.afterWeight, 0); assert.equal(p.nextQty, 0);
});
test('invalid, unaffordable, oversold and fractional orders are not previewed', () => {
  assert.equal(previewOrder(100, 0, 0, 100, 1, 'buy', 1), null);
  assert.equal(previewOrder(100, 100, 1, 100, 2, 'sell', 1), null);
  assert.equal(previewOrder(100, 100, 1, 100, 0.5, 'buy', 1), null);
  assert.equal(previewOrder(NaN, 100, 1, 100, 1, 'buy', 1), null);
});
test('empty asset base and minimum-fee sale stay finite', () => {
  const p = previewOrder(0, 1, 1, 1, 1, 'sell', 1);
  assert.equal(p.cash, 0); assert.equal(p.afterWeight, 0);
  const first = previewOrder(101, 0, 0, 100, 1, 'buy', 1);
  assert.equal(first.beforeWeight, 0); assert.equal(first.afterWeight, 100);
});
