const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const reqFn = require('node:module').createRequire(require('node:path').resolve(__dirname, '../../functions/package.json'));
process.env.GCLOUD_PROJECT = 'demo-jamworld';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FUNCTIONS_EMULATOR = 'true';
reqFn('firebase-admin/app').initializeApp({ projectId: 'demo-jamworld', storageBucket: 'demo-jamworld.appspot.com' });
const db = reqFn('firebase-admin/firestore').getFirestore();
const origin = 'http://127.0.0.1:5000';

test('Lesson interview → additional answer → real expansion/effects → approved asset generation and placement', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const signup = await context.request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test', { data: { email: `design-${crypto.randomUUID()}@example.test`, password: 'test-only-password', returnSecureToken: true } });
    const identity = await signup.json(); await db.doc('users/' + identity.localId).set({ role: 'teacher' });
    await context.request.get(origin + '/api/jamworld/workshop/me', { headers: { authorization: `Bearer ${identity.idToken}` } });
    const room = await (await context.request.post(origin + '/api/jamworld/workshop/classes', { data: { name: '물의 순환 수업' } })).json();
    const classId = room.class.id;
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    let modelCalls = 0;
    const assetName = '구름 관측 기구 ' + crypto.randomUUID().slice(0, 5);
    const draft = { name: assetName, description: '수업에 쓰는 하늘색 구름 관측 기구', category: 'decor', tags: ['구름', '관측'], footprint: { w: 1, d: 1 }, passable: true, height: 1 };
    await page.route('**/api/jamworld/agent/status', route => route.fulfill({ json: { providers: { openai: { configured: true, model: 'test' } } } }));
    await page.route('**/api/jamworld/agent', async route => {
      const body = route.request().postDataJSON(); modelCalls++;
      assert.equal(body.brief.participants, 28); assert.equal(body.brief.allowExpand, true);
      if (modelCalls === 1) return route.fulfill({ json: { provider: 'openai', model: 'test', latencyMs: 1, summary: '탐구 활동 방식을 확인할게요.', ops: [], questions: ['모둠별로 동시에 활동하나요, 순서대로 이동하나요?'] } });
      assert.ok(body.history.some(t => t.text.includes('물의 순환'))); assert.match(body.prompt, /동시에/);
      return route.fulfill({ json: { provider: 'openai', model: 'test', latencyMs: 1, summary: '28명이 모둠별로 탐구하고 모이는 수업 공간을 만들어요.', ops: [
        { op: 'resize', width: 60, height: 50 },
        { op: 'zone', id: 'inquiry', name: '탐구 공간', x: 42, y: 5, w: 8, h: 8 },
        { op: 'zoneEffect', zoneId: 'inquiry', effects: { vision: 4, message: '구름을 관찰해요' } },
        { op: 'sign', x: 43, y: 7, text: '모둠별로 구름의 변화를 설명해 보세요.' },
        { op: 'quiz', x: 50, y: 20, question: '수증기가 식으면?', choices: ['물방울', '돌'], answer: 0 },
        { op: 'setScript', source: 'World.onEnter("inquiry", () => World.message("탐구 시작", 3000));' },
      ], assets: [{ draft, x: 45, y: 10 }] } });
    });
    await page.goto(origin + '/jamworldmake/?view=worlds');
    await page.getByRole('button', { name: '＋ 새 월드', exact: true }).click();
    await page.locator('#space-name').fill('물의 순환 탐험');
    await page.getByRole('button', { name: '만들고 편집하기', exact: true }).click();
    await page.locator('.ed-center canvas').waitFor();
    const editorUrl = page.url(), projectId = new URL(editorUrl).searchParams.get('id');
    const readMap = () => page.evaluate(({ uid, projectId }) => {
      const p = JSON.parse(localStorage.getItem(`jamworld.${uid}.projects.v1`)).find(p => p.id === projectId);
      return JSON.parse(localStorage.getItem(`jamworld.${uid}.map.v1.${p.mapIds[0]}`));
    }, { uid: identity.localId, projectId });
    await page.getByRole('button', { name: '수업에 맞춰 만들기', exact: true }).click();
    await page.getByLabel('학년·과목·수업 목표', { exact: true }).fill('4학년 과학, 물의 순환 이해');
    await page.getByLabel('활동 순서와 모둠', { exact: true }).fill('4명씩 도입 → 탐구 → 발표 → 퀴즈');
    await page.getByLabel('더 필요한 것 (선택)', { exact: true }).fill('구름 관측 기구와 시야가 좁아지는 탐구 공간');
    await page.getByRole('button', { name: '수업 설계 시작', exact: true }).click();
    await page.getByLabel('모둠별로 동시에 활동하나요, 순서대로 이동하나요?', { exact: true }).fill('모둠별로 동시에 활동해요');
    assert.equal(await page.getByTestId('agent-preview').count(), 0, 'Questions must not change the map');
    await page.getByRole('button', { name: '답변 보내기', exact: true }).click();
    await page.getByTestId('agent-preview').getByText(/40×30 → 60×50/).waitFor();
    assert.equal((await readMap()).width, 40, 'Preview must not mutate saved data');
    await page.screenshot({ path: '/tmp/jamworld-lesson-preview.png' });
    await page.getByTestId('agent-preview').getByRole('button', { name: '적용', exact: true }).click();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    let map = await readMap(); assert.equal(map.width, 60); assert.equal(map.height, 50); assert.equal(map.interactions.filter(i => i.type === 'quiz').length, 1); assert.match(map.script, /World.onEnter/);
    await page.getByRole('button', { name: '되돌리기', exact: true }).click(); await page.getByRole('button', { name: '저장', exact: true }).click(); assert.equal((await readMap()).width, 40);
    await page.getByRole('button', { name: '다시 실행', exact: true }).click(); await page.getByRole('button', { name: '저장', exact: true }).click(); assert.equal((await readMap()).width, 60);
    await page.getByRole('button', { name: '공방에 제작 요청', exact: true }).click();
    await page.getByRole('button', { name: '비용 확인 · 승인하고 생성', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: '비용 확인 · 승인하고 생성', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '공방에 제작 요청', exact: true }).count(), 0, 'Saved agent task must resume without duplicate creation');
    await page.getByRole('button', { name: '비용 확인 · 승인하고 생성', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '그림 생성을 준비하고 있어요.' }).first().waitFor();
    const requests = await (await context.request.get(origin + '/api/jamworld/workshop/requests?classId=' + classId)).json();
    const request = requests.requests.find(r => r.draft.name === assetName); assert.equal(request.generation.status, 'queued');
    const { getWorkshop } = require('../../functions/lib/jamworld/lib/server/workshop/runtime');
    const { Workshop } = require('../../functions/lib/jamworld/lib/server/workshop/service');
    const base = getWorkshop(); let imageCalls = 0;
    const png = await reqFn('sharp')({ create: { width: 64, height: 64, channels: 4, background: { r: 70, g: 160, b: 220, alpha: 1 } } }).png().toBuffer();
    const worker = new Workshop(base.store, base.files, { model: 'gpt-image-2.5-flare', create: async () => { imageCalls++; return { bytes: png, contentType: 'image/png' }; } });
    await worker.runGeneration(request.generation.id); assert.equal(imageCalls, 2);
    await page.getByRole('button', { name: '저장하고 맵에 놓기', exact: true }).click();
    await page.getByTestId('agent-preview').waitFor();
    await page.getByTestId('agent-preview').getByRole('button', { name: '적용', exact: true }).click();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    map = await readMap(); assert.ok(map.objects.some(o => o.x === 45 && o.y === 10 && o.assetId.startsWith('u:'))); assert.ok(Object.values(map.assets).some(a => a.name === assetName));
    await page.reload(); await page.getByRole('button', { name: '수업 조건 바꾸기', exact: true }).click();
    assert.equal(await page.getByLabel('학생 수', { exact: true }).inputValue(), '28');
    assert.match(await page.getByLabel('학년·과목·수업 목표', { exact: true }).inputValue(), /물의 순환/);
    assert.equal(modelCalls, 2); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
