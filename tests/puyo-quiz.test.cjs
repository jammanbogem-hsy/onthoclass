const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function load(file) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,Math,Set,Map,JSON,Number,Array,String});return exports; }
const E = load('src/lib/puyo-engine.ts'); const Q = load('src/lib/puyo-quiz.ts');
let n = 0; const id = () => `q${n++}`;
const items = Array.from({ length: 5 }, (_, i) => ({ id: `i${i}`, prompt: `문제${i}`, options: ['a', 'b', 'c', 'd'], answerIndex: i % 4 }));

test('a question is due every 5 placed pairs, only when a fresh piece waits', () => {
  const s = E.createState(3);
  const place = k => { for (let m = 0; m < 3; m++) E.input(s, 'left'); for (let m = 0; m < k % 6; m++) E.input(s, 'right'); E.input(s, 'drop'); };
  for (let k = 0; k < 4; k++) { place(k); E.tick(s, 2000); }
  assert.equal(s.placed, 4); assert.equal(E.quizDue(s, 5), false);
  place(4); assert.equal(s.placed, 5);
  assert.equal(E.quizDue(s, 5), false, 'not while the pair is settling');
  E.tick(s, 2000); assert.equal(s.phase, 'fall'); assert.equal(E.quizDue(s, 5), true);
  E.answerQuiz(s, true, 500, 2); assert.equal(E.quizDue(s, 5), false); assert.equal(s.asked, 1); assert.equal(s.right, 1);
});

test('right answer adds bonus; wrong answer drops penalty nuisance now, never on the active pair', () => {
  const s = E.createState(3); const before = s.score;
  E.answerQuiz(s, true, 500, 2); assert.equal(s.score, before + 500);
  const active = E.pairCells(s.active).map(({ x, y }) => y * 6 + x);
  E.answerQuiz(s, false, 500, 2);
  assert.equal(s.wrong, 1); assert.equal(s.board.filter(v => v === 5).length, 2); assert.equal(s.effect, 'garbage');
  for (const i of active) assert.equal(s.board[i], 0);
  assert.ok(E.fits(s, s.active)); assert.ok(E.parseState(JSON.stringify(s)));
});

test('questions cycle through every item per student and restart reshuffled without an immediate repeat', () => {
  const first = Array.from({ length: 5 }, (_, k) => Q.pickQuestion(items, 'uid:g', k).id);
  assert.deepEqual([...first].sort(), items.map(i => i.id));
  assert.deepEqual(first, Array.from({ length: 5 }, (_, k) => Q.pickQuestion(items, 'uid:g', k).id), 'stable across reloads');
  for (let r = 1; r < 30; r++) assert.notEqual(Q.pickQuestion(items, 'uid:g', r * 5).id, Q.pickQuestion(items, 'uid:g', r * 5 - 1).id);
  const other = Array.from({ length: 5 }, (_, k) => Q.pickQuestion(items, 'other:g', k).id);
  assert.notDeepEqual(first, other);
});

test('CSV template round-trips, with quotes, commas, blank options and answer text', () => {
  const tpl = Q.quizFromCsv(Q.quizCsvTemplate(), id);
  assert.equal(tpl.errors.length, 0); assert.equal(tpl.items.length, 3);
  assert.deepEqual([...tpl.items[2].options], ['부산', '대구', '서울']); assert.equal(tpl.items[2].answerIndex, 2);
  const csv = '문제,보기1,보기2,보기3,보기4,정답\r\n"쉼표, 따옴표 ""테스트""",가,,다,라,4\n두번째,하나,둘,,,둘\n,x,y,,,1\n셋,a,b,,,3\n';
  const r = Q.quizFromCsv(csv, id);
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].prompt, '쉼표, 따옴표 "테스트"'); assert.deepEqual([...r.items[0].options], ['가', '다', '라']); assert.equal(r.items[0].answerIndex, 2);
  assert.equal(r.items[1].answerIndex, 1);
  assert.equal(r.errors.length, 2); assert.match(r.errors[0], /^4번째 줄/); assert.match(r.errors[1], /^5번째 줄/);
  const again = Q.quizFromCsv(Q.quizToCsv(r.items), id).items;
  assert.equal(JSON.stringify(again.map(i => [i.prompt, i.options, i.answerIndex])), JSON.stringify(r.items.map(i => [i.prompt, i.options, i.answerIndex])));
});

test('normalizeQuiz drops broken items, clamps numbers, and returns null without usable items', () => {
  assert.equal(Q.normalizeQuiz(null), null);
  assert.equal(Q.normalizeQuiz({ items: [{ id: 'x', prompt: '', options: ['a', 'b'], answerIndex: 0 }] }), null);
  const q = Q.normalizeQuiz({ items: [...items, { id: 'bad', prompt: 'p', options: ['a'], answerIndex: 0 }], every: 999, bonus: -5, penalty: 'x' });
  assert.equal(q.items.length, 5); assert.equal(q.every, 20); assert.equal(q.bonus, 0); assert.equal(q.penalty, 2);
});
