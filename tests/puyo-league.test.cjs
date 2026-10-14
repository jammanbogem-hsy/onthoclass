const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function load(file) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,Math,Set,Map,JSON,Number,Array,String,Object,Infinity});return exports; }
const G = load('src/lib/puyo-league.ts'); const R = load('src/lib/puyo-rules.ts');
const plain = v => JSON.parse(JSON.stringify(v));

test('place points: group tables by size, 1:1 is 5/3, ties share', () => {
  assert.deepEqual(plain(G.placePoints({ a: 9, b: 7, c: 5, d: 1 }, ['a', 'b', 'c', 'd'], 4)), { a: 10, b: 7, c: 4, d: 2 });
  assert.deepEqual(plain(G.placePoints({ a: 9, b: 7, c: 5 }, ['a', 'b', 'c'], 4)), { a: 9, b: 5, c: 2 });
  assert.deepEqual(plain(G.placePoints({ a: 9, b: 9, c: 5, d: 1 }, ['a', 'b', 'c', 'd'], 4)), { a: 8.5, b: 8.5, c: 4, d: 2 });
  assert.deepEqual(plain(G.placePoints({ a: 3, b: 1 }, ['a', 'b'], 2)), { a: 5, b: 3 });
  assert.deepEqual(plain(G.placePoints({ a: 3, b: 3 }, ['a', 'b'], 2)), { a: 4, b: 4 });
});

test('standings add points across rounds, skip unfinished matches and the teacher; tiebreak by firsts then score', () => {
  const games = [
    { id: 'g1', round: 1, size: 4, matches: [{ ids: ['a', 'b', 'c', 'd'], result: { scores: { a: 100, b: 80, c: 60, d: 10 } } }, { ids: ['e', 'f', 'g', 't'], result: { scores: { e: 5, f: 50, g: 40, t: 999 } } }] },
    { id: 'g2', round: 2, size: 4, matches: [{ ids: ['a', 'e', 'f', 'g'], result: { scores: { a: 1, e: 90, f: 70, g: 30 } } }, { ids: ['b', 'c', 'd'], result: null }] },
  ];
  const rows = plain(G.leagueStandings(games, ['t']));
  assert.ok(!rows.some(r => r.uid === 't'));
  const by = Object.fromEntries(rows.map(r => [r.uid, r]));
  assert.equal(by.a.points, 12); assert.equal(by.e.points, 12); assert.equal(by.f.points, 14);
  assert.equal(by.b.rounds, 1, 'unfinished match not counted');
  assert.equal(rows[0].uid, 'f'); assert.equal(by.a.rank, 2); assert.equal(by.e.rank, 3, 'a and e tie on points and firsts; a wins on total score');
  assert.equal(by.f.byRound[1].place, 2); assert.equal(by.f.byRound[1].groupSize, 4);
});

test('league planning avoids people who already met whenever possible', () => {
  const ids = Array.from({ length: 16 }, (_, i) => `s${i}`);
  const rules = { ...R.DEFAULT_PUYO_RULES, size: 4 };
  const games = []; let repeats = 0;
  for (let round = 1; round <= 4; round++) {
    const met = G.meetCounts(games);
    const plan = G.leastRepeated(() => R.planPairs(ids, 't', rules, [], Math.random), met);
    repeats += G.repeatPairs(plan.pairs, met);
    games.push({ id: `g${round}`, round, size: 4, matches: plan.pairs.map(g => ({ ids: g, result: null })) });
  }
  // 16명·4인 모둠 4판: 겹침 없이 짤 수 있는 경우가 많고, 무작위로 짜면 보통 10쌍 넘게 겹친다
  assert.ok(repeats <= 4, `repeats ${repeats}`);
});

test('quiz report groups identical questions, sorts hardest first, lists wrong answers per student', () => {
  const q1 = { id: 'x', prompt: '1+1', options: ['1', '2', '3'], answerIndex: 1 };
  const q2 = { id: 'y', prompt: '2+2', options: ['4', '5'], answerIndex: 0 };
  const q1copy = { ...q1, id: 'z' };
  const r = plain(G.quizReport([
    { uid: 'a', items: [q1, q2], answers: [0, 1, 1, 0] },
    { uid: 'b', items: [q1, q2], answers: [0, 2, 1, 0] },
    { uid: 'a', items: [q1copy], answers: [0, 0] },
  ]));
  assert.equal(r.items.length, 2); assert.equal(r.items[0].item.prompt, '1+1');
  assert.equal(r.items[0].asked, 3); assert.equal(r.items[0].correct, 1); assert.deepEqual(r.items[0].picks, [1, 1, 1]);
  assert.deepEqual(r.items[0].wrongBy.sort(), ['a', 'b']);
  const a = r.students.find(s => s.uid === 'a'); assert.equal(a.asked, 3); assert.equal(a.correct, 2); assert.equal(a.wrong[0].picked, 0);
});
