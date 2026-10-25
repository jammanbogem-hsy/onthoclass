const { test } = require('node:test');
const assert = require('node:assert/strict');
const reqFn = require('node:module').createRequire(require('node:path').resolve(__dirname, '../../functions/package.json'));
process.env.GCLOUD_PROJECT = 'demo-jamworld';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FUNCTIONS_EMULATOR = 'true';
reqFn('firebase-admin/app').initializeApp({ projectId: 'demo-jamworld', storageBucket: 'demo-jamworld.appspot.com' });
const db = reqFn('firebase-admin/firestore').getFirestore();
const root = 'http://127.0.0.1:5000/api/jamworld';
async function call(path, cookie, method = 'GET', body) {
  const r = await fetch(root + path, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
async function teacher() {
  const signup = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `agent-${crypto.randomUUID()}@example.test`, password: 'test-only-password', returnSecureToken: true }) });
  const identity = await signup.json(); await db.doc('users/' + identity.localId).set({ role: 'teacher' });
  const login = await fetch(root + '/workshop/me', { headers: { authorization: `Bearer ${identity.idToken}` } });
  return { uid: identity.localId, cookie: login.headers.get('set-cookie').split(';')[0] };
}
const draft = { name: '물의 요정', description: '물의 순환을 안내하는 파란 탐험가', category: 'character', tags: ['물', '요정'], footprint: { w: 1, d: 1 }, passable: true, height: 1 };

test('Agent image request → teacher review → generation → save → personal teacher/student defaults', async t => {
  const a = await teacher(), other = await teacher();
  const room = await call('/workshop/classes', a.cookie, 'POST', { name: '물의 순환' });
  const classId = room.data.class.id;
  const student = await call('/workshop/join', null, 'POST', { invite: room.data.invite, nickname: '탐구자', pin: '123456' });
  const studentId = (await call('/workshop/me', student.cookie)).data.student.id;
  let request;
  await t.test('Teacher and student authorization, retry deduplication and no implicit image billing', async () => {
    assert.equal((await call('/agent/assets', null, 'POST', { classId, draft, key: crypto.randomUUID() })).status, 401);
    assert.equal((await call('/agent/assets', other.cookie, 'POST', { classId, draft, key: crypto.randomUUID() })).status, 403);
    const key = crypto.randomUUID();
    const attempts = await Promise.all([1, 2].map(() => call('/agent/assets', a.cookie, 'POST', { classId, draft, key })));
    assert.deepEqual(attempts.map(a => a.status), [200, 200]);
    assert.equal(attempts[0].data.request.id, attempts[1].data.request.id);
    request = attempts[0].data.request;
    assert.equal(request.status, 'pending'); assert.equal(request.generation, null); assert.equal(request.creatorRole, 'teacher');
    assert.equal((await call('/agent/assets', a.cookie, 'POST', { classId, draft: { ...draft, name: '다른 것' }, key })).status, 409);
    const pupil = await call('/agent/assets', student.cookie, 'POST', { classId, draft, key: crypto.randomUUID() });
    assert.equal(pupil.status, 200); assert.equal(pupil.data.request.status, 'pending');
    const visible = await call('/workshop/requests?classId=' + classId, a.cookie);
    assert.ok(visible.data.requests.some(r => r.id === pupil.data.request.id));
  });
  let assetId;
  await t.test('Teacher-owned asset can complete and become a public map asset', async () => {
    const { getWorkshop } = require('../../functions/lib/jamworld/lib/server/workshop/runtime');
    const { Workshop } = require('../../functions/lib/jamworld/lib/server/workshop/service');
    const { characterFixture } = require('./character-fixture.cjs');
    const base = getWorkshop(); let calls = 0;
    const ws = new Workshop(base.store, base.files, { model: 'test-only', create: async () => ({ bytes: await characterFixture(calls++ === 0 ? 'td' : 'iso', false, false, 5, true), contentType: 'image/png' }) });
    const queued = await ws.startGeneration(await base.store.teacherById(a.uid), request.id, 'test-agent-character', { rev: request.rev });
    await ws.runGeneration(queued.generation.id); assert.equal(calls, 2);
    request = (await call('/workshop/requests?classId=' + classId, a.cookie)).data.requests.find(r => r.id === request.id);
    assert.equal((await call(`/workshop/requests/${request.id}/action`, student.cookie, 'POST', { action: 'save', rev: request.rev })).status, 404);
    const saved = await call(`/workshop/requests/${request.id}/action`, a.cookie, 'POST', { action: 'save', rev: request.rev });
    assert.equal(saved.status, 200); assetId = saved.data.assetId;
    assert.ok((await call('/workshop/catalog')).data.assets.some(a => a.id === assetId));
  });
  await t.test('Bad character directions fail before a second image call and cannot be saved or retried automatically', async () => {
    const { getWorkshop } = require('../../functions/lib/jamworld/lib/server/workshop/runtime');
    const { Workshop } = require('../../functions/lib/jamworld/lib/server/workshop/service');
    const { characterFixture } = require('./character-fixture.cjs');
    const base = getWorkshop(); let calls = 0;
    const bad = (await call('/agent/assets', a.cookie, 'POST', { classId, draft: { ...draft, name: '앞뒤 중복 검사' }, key: crypto.randomUUID() })).data.request;
    const ws = new Workshop(base.store, base.files, { model: 'test-only', create: async () => { calls++; return { bytes: await characterFixture('td', false, false, 5, true, true), contentType: 'image/png' }; } });
    const queued = await ws.startGeneration(await base.store.teacherById(a.uid), bad.id, 'invalid-direction', { rev: bad.rev });
    const failed = await ws.runGeneration(queued.generation.id);
    assert.equal(failed.status, 'failed'); assert.match(failed.error, /앞쪽과 뒤쪽/); assert.equal(calls, 1);
    const row = (await call('/workshop/requests?classId=' + classId, a.cookie)).data.requests.find(r => r.id === bad.id);
    assert.equal(row.status, 'failed'); assert.equal(row.attempts, 1);
    assert.equal((await call(`/workshop/requests/${bad.id}/action`, a.cookie, 'POST', { action: 'save', rev: row.rev })).status, 409);
    assert.equal(calls, 1, 'No hidden image retry or second-view generation');
  });
  await t.test('Both roles save their own default only; revoked or deleted selections are rejected', async () => {
    assert.equal((await call('/workshop/avatar', null, 'PUT', { look: { assetId } })).status, 401);
    const selected = await call('/workshop/avatar', a.cookie, 'PUT', { look: { assetId, asset: { iso: 'https://evil.example/file' } }, studentId });
    assert.equal(selected.status, 200); assert.ok(selected.data.look.asset.sprites.iso.image.startsWith('/api/jamworld/'));
    assert.equal((await call('/workshop/me', a.cookie)).data.avatar.assetId, assetId);
    assert.equal((await call('/workshop/me', student.cookie)).data.avatar, null, 'Teacher cannot overwrite the student through body fields');
    assert.equal((await call('/workshop/avatar', student.cookie, 'PUT', { look: { assetId } })).status, 200);
    assert.equal((await call('/workshop/me', student.cookie)).data.student.avatar.assetId, assetId);
    assert.equal((await call('/workshop/me', other.cookie)).data.avatar, null);
    await db.doc('jamworldLibrary/' + assetId).update({ removedAt: Date.now() });
    assert.equal((await call('/workshop/me', a.cookie)).data.avatar.assetId, undefined);
    assert.equal((await call('/workshop/me', student.cookie)).data.avatar.assetId, undefined);
    assert.equal((await call('/workshop/avatar', a.cookie, 'PUT', { look: { assetId } })).status, 404);
  });
  await t.test('Real agent route accepts questions, carries conversation and repairs a forbidden expansion', async () => {
    const provider = require('../../functions/lib/jamworld/lib/agent/providers');
    const original = provider.callModel;
    const { POST } = require('../../functions/lib/jamworld/routes/agent/route');
    const { createMap } = require('../../functions/lib/jamworld/lib/world/map');
    const body = { provider: 'openai', prompt: '추가 요구를 받아 주세요', doc: createMap('lesson', '물의 순환'), history: [{ role: 'user', text: '학생은 28명이에요' }], brief: { participants: 28, minutes: 40, subject: '과학 물의 순환', flow: '도입→모둠 탐구→발표', details: '', allowExpand: false } };
    const requestFor = () => new Request(root + '/agent', { method: 'POST', headers: { cookie: a.cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    try {
      provider.callModel = async (_p, _env, turns) => { assert.ok(turns.some(t => t.text.includes('28명이에요'))); assert.ok(turns[0].text.includes('allowExpand')); return { model: 'fixture', summary: '추가 확인', ops: [], questions: ['모둠별 동시 활동인가요?'] }; };
      const question = await POST(requestFor()); assert.equal(question.status, 200); assert.equal((await question.json()).questions.length, 1);
      let calls = 0;
      provider.callModel = async () => ({ model: 'fixture', summary: '수업 공간', ops: calls++ === 0 ? [{ op: 'resize', width: 60, height: 50 }] : [{ op: 'sign', x: 1, y: 1, text: '탐구를 시작해요' }] });
      const repaired = await POST(requestFor()); assert.equal(repaired.status, 200); const data = await repaired.json(); assert.equal(data.repaired, true); assert.equal(data.ops[0].op, 'sign'); assert.equal(calls, 2);
    } finally { provider.callModel = original; }
  });
});
