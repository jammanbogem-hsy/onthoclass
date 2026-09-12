const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function harness() {
  let now = Date.parse('2026-09-07T00:00:00Z');
  let visible = true, focused = true;
  const listeners = new Map(), intervals = [], cleanups = [], storage = new Map(), sent = [];
  const window = { addEventListener: (k, fn) => listeners.set(k, fn), removeEventListener: k => listeners.delete(k) };
  const document = { get visibilityState() { return visible ? 'visible' : 'hidden'; }, hasFocus: () => focused, addEventListener: window.addEventListener, removeEventListener: window.removeEventListener };
  class Clock extends Date { static now() { return now; } }
  const context = { exports: {}, Date: Clock, window, document, navigator: {}, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) }, setInterval: fn => { intervals.push(fn); return intervals.length; }, clearInterval() {}, require: name => {
    if (name === 'react') return { useRef: current => ({ current }), useEffect: fn => { const result = fn(); if (result) cleanups.push(result); } };
    if (name === 'next/navigation') return { usePathname: () => '/trade' };
    if (name === '@/lib/usage') return { usageFeature: () => 'trade', USAGE_LABELS: { trade: '트레이딩' }, recordUsage: async (cid, entries) => { sent.push({ cid, entries }); } };
    throw Error(name);
  } };
  const js = ts.transpileModule(fs.readFileSync('src/components/UsageTracker.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, context);
  context.exports.UsageTracker({ cid: 'c', uid: 'u' });
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  return { storage, sent, async step({ input = false, show = true, focus = true } = {}) { visible = show; focused = focus; if (input) listeners.get('pointerdown')?.(); now += 10000; intervals.forEach(fn => fn()); await settle(); }, async close() { cleanups.forEach(fn => fn()); await settle(); } };
}
test('tracker writes no time before input, in background, or without focus', async () => {
  const h = harness();
  for (let i = 0; i < 6; i++) await h.step();
  for (let i = 0; i < 6; i++) await h.step({ input: true, show: false });
  for (let i = 0; i < 6; i++) await h.step({ input: true, focus: false });
  assert.equal(h.storage.has('usage:v1:u:c'), false);
});
test('active input batches once per completed five-minute interval', async () => {
  const h = harness();
  for (let i = 0; i < 30; i++) await h.step({ input: true });
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].entries[0].counts.trade, 300);
  assert.equal(Object.keys(JSON.parse(h.storage.get('usage:v1:u:c'))).length, 0);
});
test('one interaction counts at most sixty seconds then becomes idle', async () => {
  const h = harness();
  await h.step({ input: true });
  for (let i = 0; i < 29; i++) await h.step();
  assert.equal(h.sent[0].entries[0].counts.trade, 60);
});
