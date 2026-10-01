const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function load(file) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require, Math, Set, Map, JSON, Number, Error }); return exports; }
const R = load('src/lib/puyo-rules.ts');
const plain = v => JSON.parse(JSON.stringify(v)); // vm 컨텍스트 배열을 이 컨텍스트 값으로
const L = load('functions/src/puyoLogic.ts');
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const ids = n => Array.from({ length: n }, (_, i) => `s${i + 1}`);
const rules = over => ({ ...R.DEFAULT_PUYO_RULES, ...over });

test('client and server normalize rules to the same bounded values', () => {
  for (const raw of [undefined, {}, { durationSec: 5, winXp: 99, pairing: 'x', odd: 'y' }, { durationSec: 4000, winXp: -3 }, { durationSec: 300, winXp: 15, pairing: 'manual', odd: 'rest' }]) {
    assert.deepEqual({ ...R.normalizeRules(raw) }, { ...L.normalizeRules(raw) });
  }
  assert.deepEqual({ ...R.normalizeRules({ durationSec: 5, winXp: 99 }) }, { durationSec: 60, pairing: 'random', odd: 'teacher', winXp: 20 });
});

test('even students pair among themselves; teacher watches', () => {
  const plan = R.planPairs(ids(6), 't', rules(), [], seq(.3, .7, .1, .9));
  assert.equal(plan.pairs.length, 3);
  assert.equal(plan.resting.length, 0);
  assert.ok(!plan.pairs.flat().includes('t'));
  assert.deepEqual(plain(plan.pairs.flat().sort()), ids(6).sort());
});

test('odd students: teacher joins under teacher rule, one rests under rest rule', () => {
  const withTeacher = R.planPairs(ids(5), 't', rules({ odd: 'teacher' }), [], seq(.5));
  assert.equal(withTeacher.pairs.length, 3);
  assert.ok(withTeacher.pairs.flat().includes('t'));
  const resting = R.planPairs(ids(5), 't', rules({ odd: 'rest' }), [], seq(.5));
  assert.equal(resting.pairs.length, 2);
  assert.equal(resting.resting.length, 1);
  assert.ok(!resting.pairs.flat().includes('t'));
});

test('a student who rested last round is not chosen to rest again', () => {
  for (let k = 0; k < 30; k++) {
    const r = Math.random;
    const plan = R.planPairs(ids(5), 't', rules({ odd: 'rest' }), ['s1', 's2'], r);
    assert.ok(!['s1', 's2'].includes(plan.resting[0]), `rested again: ${plan.resting[0]}`);
  }
});

test('manual swaps move players across pairs and the rest seat, never inside one pair', () => {
  const plan = { pairs: [['a', 'b'], ['c', 'd']], resting: ['e'] };
  assert.deepEqual(plain(R.swapInPlan(plan, 'a', 'c').pairs), [['c', 'b'], ['a', 'd']]);
  const rest = R.swapInPlan(plan, 'e', 'd');
  assert.deepEqual(plain(rest.pairs[1]), ['c', 'e']);
  assert.deepEqual(plain(rest.resting), ['d']);
  assert.equal(R.swapInPlan(plan, 'a', 'b'), plan);
});

test('a plan is stale once selection changes', () => {
  const plan = { pairs: [['a', 'b'], ['c', 't']], resting: [] };
  assert.ok(R.planMatches(plan, ['a', 'b', 'c'], 't'));
  assert.ok(!R.planMatches(plan, ['a', 'b'], 't'));
  assert.ok(!R.planMatches(plan, ['a', 'b', 'c', 'd'], 't'));
  assert.ok(!R.planMatches(null, ['a'], 't'));
});

test('server accepts only plans that follow the teacher rules', () => {
  const tRule = L.normalizeRules({ odd: 'teacher' }); const rRule = L.normalizeRules({ odd: 'rest' });
  assert.deepEqual(L.validatePlan([['a', 'b'], ['c', 't']], [], 't', tRule).pairs.length, 2);
  assert.throws(() => L.validatePlan([['a', 'b'], ['c', 't']], [], 't', rRule), /선생님/);
  assert.equal(L.validatePlan([['a', 'b']], ['c'], 't', rRule).resting[0], 'c');
  assert.throws(() => L.validatePlan([['a', 'b']], ['c'], 't', tRule), /쉬는/);
  assert.throws(() => L.validatePlan([['a', 'b'], ['c', 'd']], ['e', 'f'], 't', rRule), /쉬는/);
  assert.throws(() => L.validatePlan([['a', 'a']], [], 't', tRule), /두 번/);
  assert.throws(() => L.validatePlan([['a', 'b']], ['a'], 't', rRule), /두 번/);
  assert.throws(() => L.validatePlan([['a', 'b']], ['t'], 't', rRule));
  assert.throws(() => L.validatePlan([['a']], [], 't', tRule));
  assert.throws(() => L.validatePlan([], [], 't', tRule));
  assert.throws(() => L.validatePlan([['a/b', 'c']], [], 't', tRule));
  const many = Array.from({ length: 21 }, (_, i) => [`x${i}`, `y${i}`]);
  assert.throws(() => L.validatePlan(many, [], 't', tRule), /1~40/);
});

test('every planned pairing passes server validation', () => {
  for (const n of [1, 2, 3, 7, 8, 39, 40]) for (const odd of ['teacher', 'rest']) {
    const r = rules({ odd });
    const plan = R.planPairs(ids(n), 't', r, [], Math.random);
    if (n === 1 && odd === 'rest') { assert.equal(plan.pairs.length, 0); continue; }
    assert.doesNotThrow(() => L.validatePlan(plan.pairs, plan.resting, 't', L.normalizeRules(r)), `${n}/${odd}`);
  }
});

test('flow lists every stage from opening to next round and reflects the rules', () => {
  const flow = R.puyoFlow(rules({ odd: 'rest', winXp: 0, pairing: 'manual' }));
  assert.deepEqual(plain(flow.map(s => s.stage)), ['open', 'enter', 'pick', 'pair', 'ready', 'battle', 'judge', 'reward', 'next']);
  assert.match(flow.find(s => s.stage === 'pair').body, /쉬고/);
  assert.match(flow.find(s => s.stage === 'pair').body, /자리를 바꿀/);
  assert.match(flow.find(s => s.stage === 'reward').body, /보상 없이/);
});
