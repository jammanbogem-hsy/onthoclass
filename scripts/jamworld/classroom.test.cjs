const { test } = require('node:test');
const assert = require('node:assert/strict');
const rf = require('node:module').createRequire(require('node:path').resolve(__dirname, '../../functions/package.json'));
process.env.GCLOUD_PROJECT = 'demo-jamworld';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'; process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'; process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199'; process.env.FUNCTIONS_EMULATOR = 'true';
rf('firebase-admin/app').initializeApp({ projectId: 'demo-jamworld', storageBucket: 'demo-jamworld.appspot.com' });
const db = rf('firebase-admin/firestore').getFirestore();
const { createMap } = require('../../functions/lib/jamworld/lib/world/map');
const { serializeProject } = require('../../functions/lib/jamworld/lib/world/bundle');
const origin = 'http://127.0.0.1:5000';
async function call(path, cookie, body, query = '') {
  const res = await fetch(origin + '/api/jamworld/' + path + query, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}), ...(body ? { origin, 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
async function teacher() {
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: crypto.randomUUID() + '@example.test', password: 'test-only-password', returnSecureToken: true }) });
  const auth = await res.json(); await db.doc('users/' + auth.localId).set({ role: 'teacher' });
  const me = await fetch(origin + '/api/jamworld/workshop/me', { headers: { authorization: 'Bearer ' + auth.idToken } });
  return { cookie: me.headers.get('set-cookie').split(';')[0], uid: auth.localId, token: auth.idToken };
}

test('Classroom authorization, private chat, durable controls, live updates and published scripts', async t => {
  const teacherA = await teacher(), teacherB = await teacher();
  const cls = await call('workshop/classes', teacherA.cookie, { name: '효과 수업' }); assert.equal(cls.status, 201);
  const id = cls.data.class.id, path = 'classroom/' + id;
  const a = await call('workshop/join', null, { invite: cls.data.invite, nickname: '달토끼', pin: '123456' });
  const b = await call('workshop/join', null, { invite: cls.data.invite, nickname: '별토끼', pin: '123456' });
  const meA = await call('workshop/me', a.cookie), meB = await call('workshop/me', b.cookie);
  const sidA = meA.data.student.id, sidB = meB.data.student.id;
  await t.test('Only the owning teacher controls a class; students cannot spoof roles', async () => {
    assert.equal((await call(path, null)).status, 401);
    const direct = await fetch('http://127.0.0.1:8080/v1/projects/demo-jamworld/databases/(default)/documents/jamworldClassrooms/' + id, { headers: { authorization: 'Bearer ' + teacherA.token } });
    assert.equal(direct.status, 403, 'Clients must not read the unfiltered message document directly');
    assert.equal((await call(path, teacherB.cookie)).status, 403);
    assert.equal((await call(path, a.cookie, { action: 'control', field: 'paused', value: true, role: 'teacher' })).status, 403);
    const cross = await fetch(origin + '/api/jamworld/' + path, { method: 'POST', headers: { cookie: teacherA.cookie, origin: 'https://other.example', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'reset' }) }); assert.equal(cross.status, 403);
  });
  await t.test('All-class and teacher/student private chat are isolated and deduplicated', async () => {
    const nonce = crypto.randomUUID();
    await call(path, a.cookie, { action: 'chat', nonce, text: '<script>반가워요</script>', senderName: '선생님', role: 'teacher' });
    await call(path, a.cookie, { action: 'chat', nonce, text: 'duplicate' });
    const publicState = (await call(path, b.cookie)).data; assert.equal(publicState.messages.length, 1); assert.equal(publicState.messages[0].senderName, '달토끼'); assert.equal(publicState.messages[0].role, 'student');
    await call(path, a.cookie, { action: 'chat', nonce: crypto.randomUUID(), text: '선생님께 비밀 질문', recipientId: teacherA.uid });
    assert.equal((await call(path, b.cookie)).data.messages.length, 1);
    assert.equal((await call(path, teacherA.cookie)).data.messages.length, 2);
    assert.equal((await call(path, a.cookie, { action: 'chat', nonce: crypto.randomUUID(), text: 'forged', recipientId: sidB })).status, 403);
    await call(path, teacherA.cookie, { action: 'chat', nonce: crypto.randomUUID(), text: '달토끼에게만 답변', recipientId: sidA });
    assert.equal((await call(path, a.cookie)).data.messages.length, 3); assert.equal((await call(path, b.cookie)).data.messages.length, 1);
  });
  await t.test('Long polls wake on control updates; per-student overrides and reconnect persist', async () => {
    const rev = (await call(path, a.cookie)).data.rev;
    const started = Date.now(); const waiting = call(path, a.cookie, undefined, `?after=${rev}&wait=1`);
    await call(path, teacherA.cookie, { action: 'control', field: 'paused', value: true });
    const state = await waiting; assert.equal(state.data.controls.paused, true); assert.ok(Date.now() - started < 5000);
    await call(path, teacherA.cookie, { action: 'control', field: 'blackout', value: true, studentId: sidA });
    assert.equal((await call(path, a.cookie)).data.controls.blackout, true); assert.equal((await call(path, b.cookie)).data.controls.blackout, false);
    await call(path, teacherA.cookie, { action: 'control', field: 'muted', value: true });
    assert.equal((await call(path, a.cookie, { action: 'chat', nonce: crypto.randomUUID(), text: 'blocked' })).status, 403);
    await call(path, teacherA.cookie, { action: 'control', field: 'paused', value: false, studentId: sidA });
    assert.equal((await call(path, a.cookie)).data.controls.paused, false); assert.equal((await call(path, b.cookie)).data.controls.paused, true);
    await call(path, teacherA.cookie, { action: 'reset' });
    assert.deepEqual((await call(path, a.cookie)).data.controls, { paused: false, blackout: false, muted: false });
  });
  await t.test('Published worlds preserve effects and parse scripts without running server-side code', async () => {
    const doc = createMap('lab', '실험실', 20, 20); doc.zones = [{ id: 'lab-zone', name: '실험실', x: 2, y: 2, w: 10, h: 10, effects: { shake: 3, reverseControls: true, vision: 4 } }]; doc.script = 'World.onEnter("실험실", () => World.message("반가워요", 1000));';
    const bundle = () => serializeProject('우리 수업', '', { order: [doc.id], docs: { [doc.id]: doc } });
    assert.equal((await call(path, a.cookie, { action: 'publish', bundle: bundle() })).status, 403);
    assert.equal((await call(path, teacherA.cookie, { action: 'publish', bundle: bundle() })).status, 200);
    const remote = await call(path, a.cookie, undefined, '?world=1'); assert.equal(remote.status, 200);
    const map = JSON.parse(remote.data.bundle).maps[0]; assert.equal(map.script, doc.script); assert.equal(map.zones[0].effects.reverseControls, true);
    doc.script = 'while ('; assert.equal((await call(path, teacherA.cookie, { action: 'publish', bundle: bundle() })).status, 400);
    assert.equal((await call(path, a.cookie, undefined, '?world=1')).data.revision, remote.data.revision);
  });
  await t.test('Compact unchanged responses and student chat never read the full class roster', async () => {
    const { getWorkshop } = require('../../functions/lib/jamworld/lib/server/workshop/runtime');
    const { classroomGet } = require('../../functions/lib/jamworld/lib/server/classroom/service');
    const store = getWorkshop().store, original = store.studentsInClass;
    const rev = (await call(path, teacherA.cookie)).data.rev;
    const get = (cookie, query) => classroomGet(new Request(origin + '/api/jamworld/' + path + query, { headers: { cookie } }), id);
    store.studentsInClass = async () => { throw new Error('Unexpected full roster read'); };
    try {
      const compact = await get(teacherA.cookie, `?compact=1&after=${rev}&roster=0`);
      assert.deepEqual(await compact.json(), { unchanged: true, rev });
      assert.deepEqual((await (await get(a.cookie, '')).json()).students, []);
    } finally { store.studentsInClass = original; }
    const roster = await get(teacherA.cookie, `?compact=1&after=${rev}&roster=1`);
    assert.equal((await roster.json()).students.length, 2, 'An explicit roster refresh still updates online status');
  });
  await t.test('Role revocation denies both teacher and linked student access', async () => {
    await db.doc('users/' + teacherA.uid).update({ role: 'student' });
    assert.equal((await call(path, teacherA.cookie)).status, 401); assert.equal((await call(path, a.cookie)).status, 401);
  });
});
