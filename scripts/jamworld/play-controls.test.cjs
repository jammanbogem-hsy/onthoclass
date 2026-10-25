const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

// A fresh browser's local sample map: no classroom records or paid providers.
test('Map controls stay readable and usable by pointer, keyboard and touch', async () => {
  const browser = await chromium.launch({ executablePath: process.env.JAMWORLD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', hasTouch: true });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/jamworld/**', route => route.fulfill({ json: route.request().url().endsWith('/me')
      ? { role: null, status: { db: true, files: true, imageGeneration: false, imageModel: '' } }
      : { assets: [], canManage: false } }));
    await page.goto((process.env.JAMWORLD_ORIGIN || 'http://127.0.0.1:5000') + '/jamworldmake/?view=worlds');
    const template = page.locator('.template-grid .world-tile').filter({ has: page.getByRole('heading', { name: '숲속 광장', exact: true }) });
    await template.getByRole('button', { name: '이 월드로 시작', exact: true }).click();
    await page.getByRole('button', { name: '만들고 편집하기', exact: true }).click();
    await page.locator('.ed-center canvas').waitFor();
    await page.getByRole('button', { name: /저장 후 플레이/ }).click();
    await page.locator('.play canvas').waitFor();
    await page.waitForFunction(() => window.__moaPerf?.().view === 'td');
    assert.equal((await page.locator('.play-location').innerText()).trim(), '숲속 광장', 'Matching project and map names should appear once');
    for (const name of ['편집', '나가기']) {
      const link = page.getByRole('link', { name, exact: true });
      assert.ok((await link.boundingBox()).height >= 44, 'Touch targets must be at least 44px high');
      assert.equal(await link.evaluate(el => getComputedStyle(el).borderTopWidth), '0px');
      assert.ok(await link.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }));
    }
    assert.ok((await page.locator('.play-navigation').boundingBox()).height <= 72, 'The map toolbar should remain compact');
    const quality = page.getByRole('button', { name: '가볍게 보기', exact: true });
    const before = await quality.getAttribute('aria-pressed');
    await quality.focus(); await page.keyboard.press('Space');
    await page.waitForFunction(value => document.querySelector('.play-quality').getAttribute('aria-pressed') !== value, before);
    await page.getByRole('button', { name: '입체로 보기', exact: true }).click();
    await page.waitForFunction(() => window.__moaPerf?.().view === 'iso');
    await page.getByRole('button', { name: '위에서 보기', exact: true }).click();
    await page.waitForFunction(() => window.__moaPerf?.().view === 'td');
    await page.locator('.play-navigation').screenshot({ path: '/tmp/jamworld-play-navigation-fixed.png' });
    await page.screenshot({ path: '/tmp/jamworld-play-controls-desktop.png' });

    await page.getByRole('link', { name: '편집', exact: true }).click();
    await page.locator('.ed-title').fill('우리가 함께 만든 아주 긴 이름의 숲속 탐험 월드');
    await page.getByRole('button', { name: /저장 후 플레이/ }).click();
    await page.locator('.play canvas').waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    const geometry = await page.evaluate(() => {
      const map = document.querySelector('.play').getBoundingClientRect();
      const nav = document.querySelector('.play-navigation').getBoundingClientRect();
      const options = document.querySelector('.play-options').getBoundingClientRect();
      return { inside: [nav, options].every(r => r.left >= map.left && r.right <= map.right && r.top >= map.top && r.bottom <= map.bottom), separated: nav.bottom <= options.top, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.deepEqual(geometry, { inside: true, separated: true, overflow: false });
    assert.equal(await page.locator('.play-location span').innerText(), '숲속 광장');
    await page.screenshot({ path: '/tmp/jamworld-play-controls-mobile.png' });

    const spawnNear = async (type, yOffset) => {
      await page.evaluate(({ type, yOffset }) => {
        const id = new URLSearchParams(location.search).get('id');
        const project = JSON.parse(localStorage.getItem('jamworld.guest.projects.v1')).find(p => p.id === id);
        const key = 'jamworld.guest.map.v1.' + project.mapIds[0];
        const doc = JSON.parse(localStorage.getItem(key));
        const target = doc.interactions.find(i => i.type === type);
        doc.spawn = { x: target.x, y: target.y + yOffset };
        localStorage.setItem(key, JSON.stringify(doc));
      }, { type, yOffset });
      await page.reload(); await page.locator('.play canvas').waitFor();
    };
    await spawnNear('sign', 1);
    const read = page.locator('.play-interact').getByRole('button', { name: '읽기', exact: true });
    await read.waitFor(); await read.focus(); await page.keyboard.press('Space');
    const sign = page.getByRole('dialog', { name: '안내판', exact: true }); await sign.waitFor();
    await page.screenshot({ path: '/tmp/jamworld-play-dialog-mobile.png' });
    await sign.getByRole('button', { name: '확인', exact: true }).click(); await sign.waitFor({ state: 'detached' });
    await spawnNear('quiz', 1);
    await page.locator('.play-interact').getByRole('button', { name: '퀴즈 풀기', exact: true }).tap();
    const quiz = page.getByRole('dialog', { name: '퀴즈', exact: true });
    await quiz.getByRole('button', { name: '1. 햇빛', exact: true }).tap();
    await quiz.getByRole('status').waitFor();
    assert.match(await page.getByTestId('quiz-score').innerText(), /1\/1/);
    await quiz.getByRole('button', { name: '확인', exact: true }).tap(); await quiz.waitFor({ state: 'detached' });
    await page.getByRole('link', { name: '나가기', exact: true }).tap(); await page.locator('.world-dashboard').waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
