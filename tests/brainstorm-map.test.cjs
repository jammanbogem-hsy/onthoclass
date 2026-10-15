const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function load(file) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,Math,Set,Map,JSON,Number,Array,String,Object,Infinity});return exports; }
const M = load('src/lib/brainstorm-map.ts');

test('island is a sizeable blob and differs per activity', () => {
  const a = M.islandCells('q1'); const b = M.islandCells('q2');
  const total = M.MAP_COLS * M.MAP_ROWS;
  assert.ok(a.length > total * 0.45 && a.length < total * 0.85, `island ${a.length}/${total}`);
  assert.notEqual(a.map(c => c.i).join(), b.map(c => c.i).join());
});

test('homes are distinct, spread out, and stable when new students join', () => {
  const painters = Array.from({ length: 25 }, (_, k) => ({ uid: 'u' + k, ideas: 1 }));
  const t = M.paintTerritory('q1', painters);
  assert.equal(new Set(t.homes.map(h => h.i)).size, 25);
  const t2 = M.paintTerritory('q1', [...painters, { uid: 'new', ideas: 3 }]);
  assert.deepEqual(t2.homes.slice(0, 25).map(h => h.i), t.homes.map(h => h.i));
  let minD = Infinity; for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) minD = Math.min(minD, Math.hypot(t.homes[i].x - t.homes[j].x, t.homes[i].y - t.homes[j].y));
  assert.ok(minD > 40, 'first homes spread apart');
});

test('more ideas paint more ground; nobody paints without ideas; cells owned once', () => {
  const t = M.paintTerritory('q1', [{ uid: 'a', ideas: 5 }, { uid: 'b', ideas: 1 }, { uid: 'c', ideas: 0 }]);
  assert.equal(t.area[0], M.cellsFor(5)); assert.equal(t.area[1], M.cellsFor(1)); assert.equal(t.area[2], 0);
  const counts = [0, 0, 0]; for (const k of t.owner.values()) counts[k]++;
  assert.deepEqual(counts, t.area);
});

test('a full class with many ideas fills the island without overflowing', () => {
  const painters = Array.from({ length: 30 }, (_, k) => ({ uid: 'u' + k, ideas: 20 }));
  const t = M.paintTerritory('q9', painters);
  assert.ok(t.owner.size > t.cells.length * 0.9, 'island nearly all painted');
  assert.ok(t.area.every(a => a > 0));
});

test('once the island is full, area follows the share of ideas', () => {
  const painters = Array.from({ length: 20 }, (_, k) => ({ uid: 'u' + k, ideas: k === 0 ? 12 : 3 }));
  const t = M.paintTerritory('q3', painters);
  assert.ok(t.area[0] > t.area[1] * 2.5, `leader ${t.area[0]} vs ${t.area[1]}`);
  assert.ok(t.owner.size <= t.cells.length);
});

const C = load('src/lib/brainstorm-chars.ts');
test('characters: same student keeps the same character, no duplicates within 30', () => {
  const uids = Array.from({ length: 30 }, (_, k) => 'student' + k);
  const a = C.assignChars(uids);
  assert.equal(new Set(a.map(c => c.id)).size, 30);
  assert.equal(C.assignChars(['student7'])[0].id, C.assignChars(['student7'])[0].id);
  assert.equal(C.BRAIN_CHARS.length, 30);
  const big = C.assignChars(Array.from({ length: 35 }, (_, k) => 'x' + k));
  assert.equal(big.length, 35);
});
