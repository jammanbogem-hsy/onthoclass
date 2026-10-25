const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

// Only a fresh guest's local map is written. This also runs against Hosting without production writes.
test('The actual isometric player walks through four poses in all eight directions and stops on idle', async () => {
  const browser = await chromium.launch({ executablePath: process.env.JAMWORLD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const origin = process.env.JAMWORLD_ORIGIN || 'http://127.0.0.1:5000';
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, recordVideo: { dir: '/tmp/jamworld-gait-recordings', size: { width: 1100, height: 800 } } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/jamworld/**', route => route.fulfill({ json: route.request().url().endsWith('/me')
      ? { role: null, status: { db: true, files: true, imageGeneration: false, imageModel: '' } }
      : { assets: [], canManage: false } }));
    await page.addInitScript(() => {
      window.__gaitDraws = [];
      const original = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...a) {
        if (this.canvas.closest('.play') && a[0]?.src?.includes('iso-avatar-walk-v2.png')) {
          window.__gaitDraws.push({ x: a[1], y: a[2], w: a[3], h: a[4], dw: a[7], dh: a[8], t: performance.now() });
          if (window.__gaitDraws.length > 1000) window.__gaitDraws.shift();
        }
        return original.apply(this, a);
      };
    });
    await page.goto(origin + '/jamworldmake/?view=worlds');
    await page.getByRole('button', { name: '＋ 새 월드', exact: true }).click();
    await page.locator('#space-name').fill('걷기 확인');
    await page.getByRole('button', { name: '만들고 편집하기', exact: true }).click();
    await page.locator('.ed-center canvas').waitFor();
    await page.getByRole('button', { name: /저장 후 플레이/ }).click();
    await page.locator('.play canvas').waitFor();
    await page.evaluate(() => {
      const id = new URLSearchParams(location.search).get('id');
      const project = JSON.parse(localStorage.getItem('jamworld.guest.projects.v1')).find(p => p.id === id);
      const key = 'jamworld.guest.map.v1.' + project.mapIds[0];
      const map = JSON.parse(localStorage.getItem(key));
      map.spawn = { x: 20, y: 15 };
      localStorage.setItem(key, JSON.stringify(map));
    });
    await page.reload(); await page.locator('.play canvas').waitFor();
    await page.getByRole('button', { name: '입체로 보기', exact: true }).click();
    await page.waitForFunction(() => window.__gaitDraws.length > 0);
    const metadata = await (await page.request.get(origin + '/jamworld/assets/atlas/iso-avatar.json')).json();
    const directions = [
      ['s', ['ArrowDown']], ['sw', ['ArrowDown', 'ArrowLeft']], ['w', ['ArrowLeft']], ['nw', ['ArrowUp', 'ArrowLeft']],
      ['n', ['ArrowUp']], ['ne', ['ArrowUp', 'ArrowRight']], ['e', ['ArrowRight']], ['se', ['ArrowDown', 'ArrowRight']],
    ];
    await page.locator('.play canvas').click();
    for (const [direction, keys] of directions) {
      await page.evaluate(() => { window.__gaitDraws.length = 0; });
      const before = await page.evaluate(() => ({ ...window.__moaPerf().player }));
      for (const key of keys) await page.keyboard.down(key);
      await page.waitForTimeout(1100);
      for (const key of keys) await page.keyboard.up(key);
      const after = await page.evaluate(() => ({ ...window.__moaPerf().player }));
      const dx = 64 * (after.x - before.x - after.y + before.y), dy = 32 * (after.x - before.x + after.y - before.y);
      assert.ok(Math.hypot(dx, dy) > 150 && Math.hypot(dx, dy) < 270, direction + ': grounded travel speed');
      const draws = await page.evaluate(() => window.__gaitDraws);
      const frame = f => Object.entries(metadata.frames).find(([name, rect]) => name.startsWith(direction) && rect.x === f.x && rect.y === f.y)?.[0];
      const poses = draws.map(frame).filter(Boolean).filter((name, i, a) => name !== a[i - 1]);
      for (const pose of [1, 2, 3, 4]) assert.ok(poses.includes(direction + pose), direction + ': must draw each contact and passing pose');
      const walking = poses.filter(p => !p.endsWith('0'));
      for (let i = 1; i < walking.length; i++) assert.equal(+walking[i].at(-1), +walking[i - 1].at(-1) % 4 + 1, direction + ': forward cycle');
      assert.ok(draws.every(f => f.w === 128 && f.h === 160 && f.dh === draws[0].dh && f.dw === draws[0].dw), 'Stable frame geometry');
      const idle = metadata.frames[direction + '0'];
      await page.waitForFunction(rect => window.__gaitDraws.at(-1)?.x === rect.x && window.__gaitDraws.at(-1)?.y === rect.y, idle);
      const stopped = await page.evaluate(() => window.__moaPerf().player);
      await page.waitForTimeout(80);
      assert.deepEqual(await page.evaluate(() => window.__moaPerf().player), stopped, 'Releasing movement must not drift');
    }
    await page.screenshot({ path: '/tmp/jamworld-walking-v2.png' });
    assert.deepEqual(errors, []);
    await context.close();
    await page.video().saveAs('/tmp/jamworld-walking-v2.webm');
  } finally {
    await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
  }
});
