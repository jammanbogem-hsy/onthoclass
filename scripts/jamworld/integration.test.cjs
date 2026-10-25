const requireFunction = require("node:module").createRequire(require("node:path").resolve(__dirname, "../../functions/package.json"));
const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.GCLOUD_PROJECT = 'demo-jamworld';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FUNCTIONS_EMULATOR = 'true';
const { initializeApp } = requireFunction('firebase-admin/app');
initializeApp({ projectId: 'demo-jamworld', storageBucket: 'demo-jamworld.appspot.com' });
const { getAuth } = requireFunction("firebase-admin/auth");
const { getFirestore } = requireFunction('firebase-admin/firestore');
const { getWorkshop } = require('../../functions/lib/jamworld/lib/server/workshop/runtime');
const { Workshop } = require('../../functions/lib/jamworld/lib/server/workshop/service');
const root = 'http://127.0.0.1:5000/api/jamworld/workshop';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVR4nGPwrj3RgA8zjAwFAPe1hAGDpHvcAAAAAElFTkSuQmCC', 'base64');
async function call(path, { method = 'GET', body, cookie, token, origin, headers = {} } = {}) {
  const res = await fetch(root + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null); return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
async function teacher(role = 'teacher') {
  const email = `test-${crypto.randomUUID()}@example.test`;
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'test-only-password', returnSecureToken: true }) });
  const data = await res.json(); assert.ok(data.idToken);
  await getFirestore().doc(`users/${data.localId}`).set({ role, displayName: '검증 선생님' });
  const me = await call('/me', { token: data.idToken }); assert.equal(me.status, 200);
  return { token: data.idToken, cookie: me.cookie, uid: data.localId, me: me.data };
}
const draft = { name: '무지개 바닥', description: '부드럽게 이어지는 알록달록한 바닥', category: 'terrain', tags: ['무지개'], footprint: { w: 1, d: 1 }, passable: true, height: 0 };

test('Firebase sessions, ownership, approval, generation deduplication, library and revocation', async t => {
  const a = await teacher(), b = await teacher(), ordinary = await teacher('student');
  await t.test('Only registered teachers create rooms; forged roles and cross-origin writes fail', async () => {
    assert.equal(a.me.role, 'teacher'); assert.equal(ordinary.me.role, null);
    assert.equal((await call('/classes', { method: 'POST', body: { name: 'spoof', role: 'teacher' }, token: ordinary.token })).status, 401);
    assert.equal((await call('/classes', { method: 'POST', body: { name: 'spoof' }, cookie: a.cookie, origin: 'https://other.example' })).status, 403);
    assert.equal((await call('/me', { cookie: a.cookie })).data.role, 'teacher');
  });
  const room = await call('/classes', { method: 'POST', body: { name: '테스트 공방' }, cookie: a.cookie }); assert.equal(room.status, 201);
  const classId = room.data.class.id, invite = room.data.invite;
  const student = await call('/join', { method: 'POST', body: { invite, nickname: '보라', pin: '123456' } }); assert.equal(student.status, 201);
  const other = await call('/join', { method: 'POST', body: { invite, nickname: '초록', pin: '654321' } }); assert.equal(other.status, 201);
  let request;
  let asset;
  await t.test('Students join using PIN and cannot impersonate another student or teacher', async () => {
    assert.equal((await call('/me', { cookie: student.cookie })).data.role, 'student');
    assert.equal((await call('/login', { method: 'POST', body: { invite, nickname: '보라', pin: '000000' } })).status, 401);
    assert.equal((await call('/classes', { method: 'POST', body: { name: 'forbidden' }, cookie: student.cookie })).status, 401);
    const created = await call('/requests', { method: 'POST', body: { draft }, cookie: student.cookie }); assert.equal(created.status, 201); request = created.data.request;
    assert.equal((await call(`/requests/${request.id}`, { method: 'PATCH', body: { draft, rev: request.rev }, cookie: other.cookie })).status, 404);
    assert.equal((await call(`/requests/${request.id}/action`, { method: 'POST', body: { action: 'approve', rev: request.rev }, cookie: student.cookie })).status, 403);
  });
  await t.test('Reference image, immutable approval, and cross-class access', async () => {
    const upload = await fetch(`${root}/requests/${request.id}/upload?rev=${request.rev}`, { method: 'POST', headers: { cookie: student.cookie, 'content-type': 'image/png' }, body: png }); assert.equal(upload.status, 200);
    request = (await call('/requests', { cookie: student.cookie })).data.requests[0];
    request = (await call(`/requests/${request.id}/action`, { method: 'POST', cookie: student.cookie, body: { action: 'submit', rev: request.rev } })).data.request;
    assert.equal((await call(`/requests/${request.id}/action`, { method: 'POST', cookie: b.cookie, body: { action: 'approve', rev: request.rev } })).status, 403);
    request = (await call(`/requests/${request.id}/action`, { method: 'POST', cookie: a.cookie, body: { action: 'approve', rev: request.rev } })).data.request;
    assert.equal(request.status, 'approved');
    assert.equal((await call(`/requests/${request.id}`, { method: 'PATCH', cookie: student.cookie, body: { draft: { ...draft, name: 'changed' }, rev: request.rev } })).status, 409);
    assert.equal((await call(`/requests/${request.id}/generate`, { method: 'POST', cookie: student.cookie, headers: { 'idempotency-key': 'test-student-denied' } })).status, 403);
  });
  await t.test('Firestore transactions allow one paid attempt and one library save', async () => {
    const base = getWorkshop(); let calls = 0;
    const ws = new Workshop(base.store, base.files, { model: 'test-provider', create: async () => { calls++; return { bytes: png, contentType: 'image/png' }; } });
    const teacherRow = await ws.store.teacherById(a.uid);
    const results = await Promise.all([ws.startGeneration(teacherRow, request.id, 'concurrent-test'), ws.startGeneration(teacherRow, request.id, 'concurrent-test')]);
    assert.equal(results.filter(r => r.started).length, 1); assert.equal(results[0].generation.id, results[1].generation.id);
    const runs = await Promise.allSettled([ws.runGeneration(results[0].generation.id), ws.runGeneration(results[0].generation.id)]);
    assert.equal(runs.filter(r => r.status === 'fulfilled').length, 1); assert.equal(calls, 1);
    request = (await call('/requests', { cookie: student.cookie })).data.requests[0]; assert.equal(request.status, 'generated');
    const image = request.generation.outputs.texture;
    assert.equal((await fetch('http://127.0.0.1:5000' + image, { headers: { cookie: other.cookie } })).status, 403);
    assert.equal((await fetch('http://127.0.0.1:5000' + image, { headers: { cookie: a.cookie } })).status, 200);
    const saves = await Promise.all([1, 2].map(() => call(`/requests/${request.id}/action`, { method: 'POST', cookie: student.cookie, body: { action: 'save', rev: request.rev } })));
    assert.equal(saves.filter(r => r.status === 200).length, 1);
    const saved = (await call('/library', { cookie: student.cookie })).data.assets;
    assert.equal(saved.length, 1); asset = saved[0];
    assert.equal((await call('/library', { cookie: other.cookie })).data.assets.length, 0);
  });
  await t.test('Saved assets are public catalog entries and download as actual PNG', async () => {
    const catalog = await call('/catalog'); assert.equal(catalog.status, 200); assert.ok(catalog.data.assets.some(a => a.id === asset.id)); assert.equal(catalog.data.canManage, false);
    assert.equal((await fetch('http://127.0.0.1:5000' + asset.urls.texture)).status, 200);
    const download = await fetch(`${root}/catalog/${asset.id}/download?view=texture`);
    assert.equal(download.status, 200); assert.equal(download.headers.get('content-type'), 'image/png');
    assert.match(download.headers.get('content-disposition'), /attachment/);
    const bytes = Buffer.from(await download.arrayBuffer()); assert.deepEqual([...bytes.subarray(0,8)], [137,80,78,71,13,10,26,10]);
    assert.equal((await call('/avatar', { method: 'PUT', cookie: student.cookie, body: { look: { assetId: asset.id } } })).status, 400, 'Floor assets cannot become avatars');
    assert.equal((await call(`/catalog/${asset.id}`, { method: 'DELETE', cookie: a.cookie })).status, 403);
    assert.equal((await call(`/catalog/${asset.id}`, { method: 'DELETE', cookie: student.cookie })).status, 403);
    const auth = getAuth();
    let admin;
    try { admin = await auth.getUserByEmail('jammanbogem@gmail.com'); } catch { admin = await auth.createUser({ email: 'jammanbogem@gmail.com', emailVerified: true, password: 'test-admin-only' }); }
    await auth.updateUser(admin.uid, { emailVerified: true, password: 'test-admin-only' });
    const login = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'jammanbogem@gmail.com', password: 'test-admin-only', returnSecureToken: true }) });
    const identity = await login.json(); const token = identity.idToken; assert.ok(token);
    assert.equal((await call('/catalog', { token })).data.canManage, true);
    assert.equal((await call(`/catalog/${asset.id}`, { method: 'DELETE', token })).status, 200);
    assert.ok(!(await call('/catalog')).data.assets.some(a => a.id === asset.id));
    assert.equal((await fetch('http://127.0.0.1:5000' + asset.urls.texture)).status, 403);
    assert.equal((await fetch(`${root}/catalog/${asset.id}/download?view=texture`)).status, 404);
    assert.equal((await call('/library', { cookie: student.cookie })).data.assets.length, 0);
  });
  await t.test('Invite rotation, server logout and teacher-role revocation take effect', async () => {
    assert.equal((await call(`/classes/${classId}/invite`, { method: 'POST', cookie: b.cookie, body: { active: true } })).status, 403);
    await call(`/classes/${classId}/invite`, { method: 'POST', cookie: a.cookie, body: { active: true } });
    assert.equal((await call('/join', { method: 'POST', body: { invite, nickname: '새학생', pin: '123456' } })).status, 404);
    await call('/logout', { method: 'POST', cookie: other.cookie }); assert.equal((await call('/me', { cookie: other.cookie })).data.role, null);
    await getFirestore().doc(`users/${a.uid}`).update({ role: 'student' });
    assert.equal((await call('/me', { cookie: a.cookie })).data.role, null); assert.equal((await call('/me', { cookie: student.cookie })).data.role, null);
  });
});
