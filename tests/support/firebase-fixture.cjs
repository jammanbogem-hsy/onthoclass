const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');
function fixture() {
  let now = Date.parse('2026-09-07T01:00:00Z'); // 월요일 10시 KST
  const docs = new Map();
  const reads = [];
  let seq = 0;
  const stamp = () => ({ toMillis: () => now });
  const snapshot = (p) => ({ id: p.split('/').at(-1), exists: docs.has(p), data: () => docs.get(p), ref: ref(p) });
  function ref(p) { return { path: p, get: async () => { reads.push(p); return snapshot(p); }, collection: name => query(`${p}/${name}`) }; }
  function query(p, filters = [], max = Infinity, order = null) {
    return {
      path: p,
      doc: id => ref(`${p}/${id ?? `auto-${++seq}`}`),
      where: (key, op, value) => query(p, [...filters, [key, op, value]], max, order),
      orderBy: key => query(p, filters, max, key),
      limit: n => query(p, filters, n, order),
      select: () => query(p, filters, max, order),
      get: async () => {
        reads.push(p);
        const matches = [...docs.keys()].filter(k => k.startsWith(`${p}/`) && k.split('/').length === p.split('/').length + 1 && filters.every(([key, op, value]) => op === '==' ? docs.get(k)[key] === value : op === '>=' ? docs.get(k)[key] >= value : docs.get(k)[key] <= value));
        if (order) matches.sort((a, b) => String(docs.get(a)[order]).localeCompare(String(docs.get(b)[order])));
        const result = matches.slice(0, max).map(snapshot);
        return { docs: result, size: result.length };
      },
    };
  }
  const db = {
    doc: ref, collection: query,
    async runTransaction(callback) {
      const pending = [];
      const result = await callback({
        get: target => { assert.equal(pending.length, 0, 'all transaction reads precede writes'); return target.get(); },
        set: (target, data, options) => pending.push([target, data, options]),
      });
      for (const [target, data, options] of pending) {
        const prev = docs.get(target.path) ?? {};
        const next = options?.merge ? { ...prev } : {};
        for (const [key, value] of Object.entries(data)) next[key] = value?.increment !== undefined ? (prev[key] ?? 0) + value.increment : value;
        docs.set(target.path, next);
      }
      return result;
    },
  };
  const file = path.resolve('functions/lib/index.js');
  const realRequire = createRequire(file);
  class HttpError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const wrap = (...args) => args.at(-1);
  const fakeRequire = name => {
    if (name === 'firebase-functions/v2/https') return { onCall: wrap, HttpsError: HttpError };
    if (name === 'firebase-functions/v2/firestore') return { onDocumentCreated: wrap };
    if (name === 'firebase-functions/v2/scheduler') return { onSchedule: wrap };
    if (name === 'firebase-functions/params') return { defineSecret: () => ({ value: () => '' }) };
    if (name === 'firebase-functions/v2') return { setGlobalOptions() {} };
    if (name === 'firebase-admin/app') return { initializeApp() {} };
    if (name === 'firebase-admin/firestore') return { getFirestore: () => db, FieldValue: { increment: value => ({ increment: value }), serverTimestamp: stamp } };
    return realRequire(name);
  };
  class Clock extends Date { static now() { return now; } }
  const context = { exports: {}, require: fakeRequire, Date: Clock, console, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  docs.set('classes/c/members/u', { displayName: '학생', role: 'student' });
  docs.set('classes/c/trading/config', { override: 'open' });
  docs.set('classes/c/manbo/u', { balance: 10000 });
  docs.set('tradingPrices/current', { updatedAt: stamp(), stocks: { '005930': { mbPrice: 100 } } });
  return { api: context.exports, docs, reads, tick: ms => { now += ms; }, request: data => ({ auth: { uid: 'u', token: {} }, data: { cid: 'c', ...data } }) };
}

module.exports = { fixture };
