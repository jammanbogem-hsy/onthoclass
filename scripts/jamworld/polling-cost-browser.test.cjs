const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

test('Classroom connections run only in a visible lesson or open chat and reconnect with fresh controls', async () => {
  const browser = await chromium.launch({ executablePath: process.env.JAMWORLD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  let closing = false;
  const waiting = new Set(), wake = () => { for (const resolve of waiting) resolve(); waiting.clear(); };
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } }), errors = [];
    page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
    await page.clock.install();
    let reads = 0, presence = 0, denied = false;
    const room = { classId: 'cls_cost', className: '연결 검사', teacherId: 'teacher_cost', selfId: 'student_cost', role: 'student', rev: 1, serverTime: Date.now(), controls: { paused: false, blackout: false, muted: false }, students: [], messages: [], world: null };
    await page.route('**/api/jamworld/**', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      const send = (data, status = 200) => closing ? Promise.resolve() : route.fulfill({ json: data, status }).catch(() => {});
      if (p.endsWith('/me')) return send({ role: 'student', student: { id: 'student_cost', nickname: '달토끼', classId: room.classId, className: room.className, avatar: null }, status: { db: true, files: true, imageGeneration: false, imageModel: '' } });
      if (p.includes('/classroom/')) {
        if (request.method() === 'POST') { presence++; return send({ ok: true }); }
        reads++;
        if (denied) return send({ error: '수업 연결 권한이 사라졌어요' }, 401);
        if (url.searchParams.get('wait') === '1') await new Promise(resolve => waiting.add(resolve));
        if (denied) return send({ error: '수업 연결 권한이 사라졌어요' }, 401);
        return send(room);
      }
      return send({ assets: [], canManage: false });
    });
    const origin = process.env.JAMWORLD_ORIGIN || 'http://127.0.0.1:5000';
    await page.goto(origin + '/jamworldmake/?view=catalog');
    const open = () => page.getByRole('button', { name: '수업 채팅', exact: true }).click();
    await page.getByRole('button', { name: '수업 채팅', exact: true }).waitFor();
    assert.equal(reads, 0); assert.equal(presence, 0, 'Browsing assets must not announce classroom presence');
    await open(); await page.getByText('연결됨', { exact: true }).waitFor();
    await page.waitForFunction(() => !!document.querySelector('.classroom-panel'));
    assert.ok(reads >= 1); assert.equal(presence, 1);
    await page.clock.fastForward(45000);
    await page.waitForTimeout(50);
    assert.equal(presence, 2, 'A visible student sends a bounded heartbeat');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(100); wake(); await page.waitForTimeout(50);
    const paused = { reads, presence };
    await page.clock.fastForward(5 * 60000); await page.waitForTimeout(50);
    assert.deepEqual({ reads, presence }, paused, 'Hidden tabs stop both long polls and heartbeat writes');
    room.rev++; room.controls.paused = true;
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.getByText('연결됨', { exact: true }).waitFor();
    assert.ok(reads > paused.reads); assert.equal(presence, paused.presence + 1);
    await page.getByRole('button', { name: '수업 패널 닫기', exact: true }).click();
    await page.waitForTimeout(100); wake(); await page.waitForTimeout(50);
    const closed = { reads, presence };
    await page.clock.fastForward(5 * 60000); await page.waitForTimeout(50);
    assert.deepEqual({ reads, presence }, closed, 'Closing chat outside a lesson disconnects it');
    await page.getByRole('link', { name: '수업', exact: true }).click();
    await page.getByText('수업 채팅 열기', { exact: true }).waitFor();
    await page.clock.fastForward(100); await page.waitForTimeout(50);
    assert.ok(reads > closed.reads, 'A classroom stays connected even when its chat panel is closed');
    denied = true; wake();
    await open(); await page.getByRole('alert').getByText('수업 연결 권한이 사라졌어요', { exact: true }).waitFor();
    const revoked = { reads, presence };
    await page.clock.fastForward(3 * 60000); await page.waitForTimeout(100);
    assert.deepEqual({ reads, presence }, revoked, 'Revoked access stops retries and presence writes together');
    assert.deepEqual(errors, []);
  } finally { closing = true; wake(); await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]); }
});
