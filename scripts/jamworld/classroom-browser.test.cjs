const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const rf = require('node:module').createRequire(require('node:path').resolve(__dirname, '../../functions/package.json'));
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'; process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
rf('firebase-admin/app').initializeApp({ projectId: 'demo-jamworld' });
const db = rf('firebase-admin/firestore').getFirestore();
const origin = 'http://127.0.0.1:5000';

test('Teacher publishes a world; students chat, receive individual controls and resume after blackout', async () => {
  const browser = await chromium.launch({ executablePath: process.env.JAMWORLD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const teacher = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const auth = await (await teacher.request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test', { data: { email: crypto.randomUUID() + '@example.test', password: 'test-only-password', returnSecureToken: true } })).json();
    await db.doc('users/' + auth.localId).set({ role: 'teacher' });
    await teacher.request.get(origin + '/api/jamworld/workshop/me', { headers: { authorization: 'Bearer ' + auth.idToken } });
    const page = await teacher.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    // This scenario tests classroom controls; map effects use the free local planner.
    await page.route('**/api/jamworld/agent/status', route => route.fulfill({ json: { providers: { openai: { configured: false }, anthropic: { configured: false } } } }));
    await page.goto(origin + '/jamworldmake/'); await page.getByPlaceholder('새 공방 이름').fill('우리 반 실험 수업'); await page.getByRole('button', { name: '만들기', exact: true }).click();
    const inviteBox = page.getByRole('textbox', { name: '초대 링크', exact: true }); await inviteBox.waitFor(); const invite = await inviteBox.inputValue();
    const student = await browser.newContext({ viewport: { width: 1280, height: 1000 } }); const studio = await student.newPage(); studio.on('pageerror', e => errors.push(e.message));
    await studio.goto(invite); await studio.locator('#nick').fill('달토끼'); await studio.locator('#pin').fill('123456'); await studio.locator('#pin2').fill('123456'); await studio.getByRole('button', { name: '공방에 들어가기', exact: true }).click(); await studio.locator('.ws-studio').waitFor();
    await page.getByRole('link', { name: '내 월드', exact: true }).click(); await page.getByRole('button', { name: '＋ 새 월드', exact: true }).click(); await page.locator('#space-name').fill('모험 실험실'); await page.getByRole('button', { name: '만들고 편집하기', exact: true }).click(); await page.locator('.ed-center canvas').waitFor();
    await page.locator('.ed-right textarea').fill('시작하는 공간의 화면을 흔들고 방향키를 반대로 하고 시야도 좁게 해줘'); await page.getByRole('button', { name: '도우미에게 부탁하기', exact: true }).click(); await page.getByTestId('agent-preview').waitFor(); await page.getByTestId('agent-preview').getByRole('button', { name: '적용', exact: true }).click();
    await page.getByRole('tab', { name: '공간 효과', exact: true }).click(); assert.ok(await page.getByLabel('방향키 반대로', { exact: true }).isChecked());
    await page.getByRole('button', { name: '수업으로 공유', exact: true }).click(); await page.locator('.play canvas').waitFor();
    await studio.getByRole('link', { name: '수업', exact: true }).click(); await studio.locator('.play canvas').waitFor();
    await studio.waitForFunction(() => window.__moaPerf?.().effects.reverseControls);
    assert.equal(await studio.getByRole('link', { name: '편집', exact: true }).count(), 0);
    const sid = (await (await student.request.get(origin + '/api/jamworld/workshop/me')).json()).student.id;
    await page.getByRole('button', { name: /수업 채팅/ }).click(); await studio.getByRole('button', { name: /수업 채팅/ }).click();
    await page.getByRole('textbox', { name: '수업 대화 입력', exact: true }).fill('모두 반가워요'); await page.getByRole('button', { name: '대화 보내기', exact: true }).click(); await studio.getByRole('log').getByText('모두 반가워요', { exact: true }).waitFor();
    await studio.getByRole('combobox', { name: '대화 받는 사람', exact: true }).selectOption(auth.localId); await studio.getByRole('textbox', { name: '수업 대화 입력', exact: true }).fill('선생님, 여기는 방향키가 반대예요'); await studio.getByRole('button', { name: '대화 보내기', exact: true }).click(); await page.getByRole('log').getByText('선생님, 여기는 방향키가 반대예요', { exact: true }).waitFor();
    await page.getByRole('tab', { name: '학생 관리', exact: true }).click();
    await page.getByRole('button', { name: '멈추기', exact: true }).click(); await studio.waitForFunction(() => window.__moaPerf?.().paused);
    await studio.getByRole('button', { name: '수업 패널 닫기', exact: true }).click();
    const before = await studio.evaluate(() => window.__moaPerf().player);
    await studio.mouse.click(500, 500); await studio.keyboard.down('ArrowRight'); await studio.waitForTimeout(400); await studio.keyboard.up('ArrowRight');
    assert.deepEqual(await studio.evaluate(() => window.__moaPerf().player), before);
    await page.getByRole('combobox', { name: '제어할 학생', exact: true }).selectOption(sid); await page.getByRole('button', { name: '화면 가리기', exact: true }).click();
    await studio.getByRole('alertdialog', { name: '선생님이 화면을 잠시 가렸어요', exact: true }).waitFor();
    assert.ok(await studio.locator('.nav-lens').evaluate(e => e.inert));
    await studio.screenshot({ path: '/tmp/jamworld-student-blackout.png' });
    await studio.reload(); await studio.getByRole('alertdialog', { name: '선생님이 화면을 잠시 가렸어요', exact: true }).waitFor();
    await page.getByRole('button', { name: '모두 정상으로', exact: true }).click(); await studio.locator('.classroom-blackout').waitFor({ state: 'detached' }); await studio.waitForFunction(() => !window.__moaPerf?.().paused);
    assert.equal(await studio.locator('.nav-lens').evaluate(e => e.inert), false);
    await page.screenshot({ path: '/tmp/jamworld-classroom-teacher.png' });
    await studio.setViewportSize({ width: 390, height: 844 }); await studio.getByRole('button', { name: /수업 채팅/ }).click();
    assert.ok(await studio.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await studio.screenshot({ path: '/tmp/jamworld-classroom-student-mobile.png' });
    assert.deepEqual(errors, []);
    await page.close(); await studio.close();
  } finally { await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]); }
});
