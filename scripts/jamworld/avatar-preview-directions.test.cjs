const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright-core');
const prepared = path.resolve(__dirname, '../../design/jamworld/headset-runner-v3');
const manifest = JSON.parse(fs.readFileSync(path.join(prepared, 'manifest.json'), 'utf8'));

// Local artwork and mocked APIs: also safe to run against the published frontend.
test('Direction preview shows every custom facing, retains walking frames and fits a phone', async () => {
  const browser = await chromium.launch({ executablePath: process.env.JAMWORLD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } }), errors = [], writes = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.__previewDraws = [];
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(...args) {
        const source = args[0];
        if (source instanceof HTMLImageElement && source.src.includes('/direction-fixture/')) this.canvas.dataset.source = source.src;
        if (this.canvas.getAttribute('aria-label') === '아바타 미리보기' && source instanceof HTMLCanvasElement && source.dataset.source?.includes('/direction-fixture/')) {
          window.__previewDraws.push({ view: source.dataset.source.includes('iso') ? 'iso' : 'td', x: args[1], y: args[2] });
          if (window.__previewDraws.length > 500) window.__previewDraws.splice(0, 100);
        }
        return draw.apply(this, args);
      };
    });
    const url = file => '/api/jamworld/workshop/files/direction-fixture/' + file;
    const urls = { td: url('td.webp'), iso: url('iso.webp'), tdSheet: url('td-sprite.png'), isoSheet: url('iso-sprite.png') };
    const avatar = { base: 'explorer', assetId: manifest.id, top: 'teal', pack: 'gold', shoes: 'coral', hair: 'brown', asset: {
      name: manifest.name, td: urls.td, iso: urls.iso, sprites: Object.fromEntries(['td', 'iso'].map(view => [view, { ...manifest.appearance.sprites[view], image: urls[view + 'Sheet'] }]))
    } };
    await page.route('**/api/jamworld/**', async route => {
      const request = route.request(), p = new URL(request.url()).pathname;
      if (request.method() !== 'GET') writes.push(p);
      if (p.includes('/direction-fixture/')) {
        const file = p.split('/').at(-1);
        return route.fulfill({ path: path.join(prepared, file), contentType: file.endsWith('.png') ? 'image/png' : 'image/webp' });
      }
      return route.fulfill({ json: p.endsWith('/me') ? { role: 'teacher', teacher: { id: 'direction-preview', name: '방향 확인' }, avatar, status: { db: true, files: true, imageGeneration: false, imageModel: '' } } : p.endsWith('/classes') ? { classes: [] } : { assets: [{ ...manifest, urls }], canManage: false } });
    });
    const origin = process.env.JAMWORLD_ORIGIN || 'http://127.0.0.1:5000';
    await page.goto(origin + '/jamworldmake/?view=profile');
    const controls = page.getByRole('group', { name: '캐릭터 방향 확인', exact: true });
    await controls.waitFor();
    const seen = { td: new Set(), iso: new Set() };
    for (const [name, td, iso] of [
      ['앞·뒤', ['s', 'n'], ['s', 'n']],
      ['왼쪽·오른쪽', ['w', 'e'], ['w', 'e']],
      ['대각선 ↙↗', ['w', 'e'], ['sw', 'ne']],
      ['대각선 ↖↘', ['w', 'e'], ['nw', 'se']],
    ]) {
      await controls.getByRole('button', { name, exact: true }).click();
      await page.evaluate(() => { window.__previewDraws = []; });
      const rows = Object.fromEntries(Object.entries({ td, iso }).map(([view, headings]) => [view, headings.map(h => manifest.appearance.sprites[view].directions.indexOf(h) * 160)]));
      await page.waitForFunction(rows => ['td', 'iso'].every(view => rows[view].every(y => window.__previewDraws.some(f => f.view === view && f.y === y && f.x > 0))), rows);
      assert.equal(await controls.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await controls.locator('[aria-pressed="true"]').count(), 1);
      for (const frame of await page.evaluate(() => window.__previewDraws)) {
        assert.ok(rows[frame.view].includes(frame.y), name + ': selected heading must match the rendered row');
        seen[frame.view].add(frame.y / 160);
      }
    }
    assert.equal(seen.td.size, 4); assert.equal(seen.iso.size, 8);
    await page.setViewportSize({ width: 390, height: 844 });
    await controls.getByRole('button', { name: '앞·뒤', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Direction controls must wrap on a phone');
    for (const button of await controls.getByRole('button').all()) {
      const box = await button.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `Direction controls must remain large enough to tap: ${JSON.stringify(box)}`);
      assert.ok(box.x >= 0 && box.x + box.width <= 390);
    }
    await page.screenshot({ path: '/tmp/jamworld-direction-preview-mobile.png', fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(writes, [], 'Preview changes never submit, save or generate images');
  } finally { await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]); }
});
