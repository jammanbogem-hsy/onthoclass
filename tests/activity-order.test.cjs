const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
test('activity moves preserve all ids at both boundaries without mutating the source', () => {
  const ctx = { exports: {} }; vm.runInNewContext(compile('src/lib/activityOrder.ts'), ctx);
  const original = ['a', 'b', 'c'];
  assert.equal(ctx.exports.moveActivity(original, 0, 2).join(','), 'b,c,a');
  assert.equal(ctx.exports.moveActivity(original, 2, 0).join(','), 'c,a,b');
  assert.equal(original.join(','), 'a,b,c');
  assert.equal(ctx.exports.moveActivity(original, 0, -1), original);
});
test('reorder uses atomic updates so deleted activities are not recreated', async () => {
  const documents = new Map([['classes/c/lessons/l/questions/a', { order: 0, title: 'A' }], ['classes/c/lessons/l/questions/b', { order: 1, title: 'B' }]]);
  const ctx = { exports: {}, require: name => {
    if (name === 'firebase/firestore') return { collection: (_, ...parts) => parts.join('/'), doc: (col, id) => `${col}/${id}`, writeBatch: () => {
      const pending = [];
      return { update: (key, value) => pending.push([key, value]), commit: async () => { if (pending.some(([key]) => !documents.has(key))) throw Error('missing'); pending.forEach(([key, value]) => documents.set(key, { ...documents.get(key), ...value })); } };
    } };
    if (name === '@/lib/firebase') return { getDbClient: () => ({}) };
    return {};
  } };
  vm.runInNewContext(compile('src/lib/lessons.ts'), ctx);
  await ctx.exports.reorderQuestions('c', 'l', ['b', 'a']);
  assert.equal(documents.get('classes/c/lessons/l/questions/b').order, 0);
  await assert.rejects(ctx.exports.reorderQuestions('c', 'l', ['a', 'deleted']));
  assert.equal(documents.get('classes/c/lessons/l/questions/a').order, 1);
  assert.equal(documents.has('classes/c/lessons/l/questions/deleted'), false);
});
