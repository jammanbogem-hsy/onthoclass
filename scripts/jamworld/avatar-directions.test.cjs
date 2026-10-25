const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright-core');
const prepared = path.resolve(__dirname, '../../design/jamworld/headset-runner-v3');
const manifest = JSON.parse(fs.readFileSync(path.join(prepared, 'manifest.json'), 'utf8'));

// Use the actual corrected art, with isolated guest storage and mocked business APIs.
test('Custom runner uses front/back/opposite side frames in both views, including after a delayed sheet load', async () => {
  const browser = await chromium.launch({ executablePath: process.env.JAMWORLD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.__avatarDraws = []; window.__staticAvatarDraws = 0;
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(...args) {
        if (this.canvas.closest('.play') && args[0] instanceof HTMLImageElement && args[0].src.includes('/direction-fixture/')) {
          if (args.length === 9) {
            window.__avatarDraws.push({ view: args[0].src.includes('iso') ? 'iso' : 'td', x: args[1], y: args[2], w: args[3], h: args[4], mirrored: this.getTransform().a < 0 });
            if (window.__avatarDraws.length > 600) window.__avatarDraws.shift();
          } else window.__staticAvatarDraws++;
        }
        return draw.apply(this, args);
      };
    });
    let release, requested;
    const waiting = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { requested = resolve; });
    let delayed = false;
    const url = file => '/api/jamworld/workshop/files/direction-fixture/' + file;
    const avatar = { base: 'explorer', assetId: manifest.id, top: 'teal', pack: 'gold', shoes: 'coral', hair: 'brown', asset: {
      name: manifest.name, td: url('td.webp'), iso: url('iso.webp'), sprites: Object.fromEntries(['td', 'iso'].map(view => [view, { ...manifest.appearance.sprites[view], image: url(view + '-sprite.png') }]))
    } };
    await page.route('**/api/jamworld/**', async route => {
      const p = new URL(route.request().url()).pathname;
      if (p.includes('/direction-fixture/')) {
        const file = p.split('/').at(-1);
        if (file === 'td-sprite.png' && !delayed) { delayed = true; requested(); await waiting; }
        return route.fulfill({ path: path.join(prepared, file), contentType: file.endsWith('.png') ? 'image/png' : 'image/webp' });
      }
      return route.fulfill({ json: p.endsWith('/me') ? { role: null, avatar, status: { db: true, files: true, imageGeneration: false, imageModel: '' } } : { assets: [], canManage: false } });
    });
    const origin = process.env.JAMWORLD_ORIGIN || 'http://127.0.0.1:5000';
    await page.goto(origin + '/jamworldmake/?view=worlds');
    await page.getByRole('button', { name: '＋ 새 월드', exact: true }).click();
    await page.getByRole('button', { name: '만들고 편집하기', exact: true }).click(); await page.locator('.ed-center canvas').waitFor();
    await page.evaluate(() => {
      const id = new URLSearchParams(location.search).get('id'), project = JSON.parse(localStorage.getItem('jamworld.guest.projects.v1')).find(p => p.id === id);
      const key = 'jamworld.guest.map.v1.' + project.mapIds[0], doc = JSON.parse(localStorage.getItem(key));
      doc.spawn = { x: 20, y: 15 }; localStorage.setItem(key, JSON.stringify(doc)); localStorage.setItem('moa.view', 'td');
    });
    await page.reload(); await page.locator('.ed-center canvas').waitFor();
    await page.getByRole('button', { name: /저장 후 플레이/ }).click();
    await page.waitForFunction(() => window.__moaPerf?.().player);
    await started;
    await page.locator('.play canvas').click(); await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(250); await page.keyboard.up('ArrowLeft');
    assert.equal(await page.evaluate(() => window.__staticAvatarDraws), 0, 'An unloaded directional sheet must never become a static, same-facing avatar');
    release(); await page.waitForFunction(() => window.__avatarDraws.some(f => f.view === 'td'));

    const directions = {
      td: [['s', ['ArrowDown']], ['w', ['ArrowLeft']], ['n', ['ArrowUp']], ['e', ['ArrowRight']]],
      iso: [['s', ['ArrowDown']], ['sw', ['ArrowDown', 'ArrowLeft']], ['w', ['ArrowLeft']], ['nw', ['ArrowUp', 'ArrowLeft']], ['n', ['ArrowUp']], ['ne', ['ArrowUp', 'ArrowRight']], ['e', ['ArrowRight']], ['se', ['ArrowDown', 'ArrowRight']]],
    };
    for (const view of ['td', 'iso']) {
      if (view === 'iso') await page.getByRole('button', { name: '입체로 보기', exact: true }).click();
      await page.locator('.play canvas').click();
      for (const [direction, keys] of directions[view]) {
        const row = manifest.appearance.sprites[view].directions.indexOf(direction);
        await page.evaluate(() => { window.__avatarDraws = []; });
        for (const key of keys) await page.keyboard.down(key);
        await page.waitForTimeout(500);
        for (const key of keys) await page.keyboard.up(key);
        await page.waitForFunction(({ view, row }) => window.__avatarDraws.some(f => f.view === view && f.y === row * 160 && f.x > 0), { view, row });
        const frames = await page.evaluate(view => window.__avatarDraws.filter(f => f.view === view), view);
        assert.ok(frames.filter(f => f.x > 0).every(f => f.y === row * 160), `${view}/${direction}: the whole walk maintains one facing`);
        await page.waitForFunction(({ view, row }) => { const f = window.__avatarDraws.at(-1); return f?.view === view && f.x === 0 && f.y === row * 160; }, { view, row });
      }
      await page.screenshot({ path: '/tmp/jamworld-runner-directions-' + view + '.png' });
    }
    for (const view of ['td', 'iso']) delete avatar.asset.sprites[view].construction;
    await page.evaluate(() => localStorage.setItem('moa.view', 'td'));
    await page.reload(); await page.waitForFunction(() => window.__avatarDraws.some(f => f.view === 'td'));
    await page.locator('.play canvas').click(); await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(300); await page.keyboard.up('ArrowLeft');
    await page.waitForFunction(() => window.__avatarDraws.some(f => f.view === 'td' && f.y === 480 && f.mirrored && f.x > 0));
    assert.equal(await page.evaluate(() => window.__staticAvatarDraws), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
