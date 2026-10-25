const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { build } = require('esbuild');
const path = require('node:path');

test('Real Canvas terrain has continuous grass/water, correct neighboring chunk updates and unchanged custom textures', async () => {
  const bundle = await build({ absWorkingDir: path.resolve(__dirname, '../..'), write: false, bundle: true, platform: 'browser', format: 'iife', stdin: { resolveDir: path.resolve(__dirname, '../..'), contents: `
    import { drawTileUnit, terrainEdges } from './src/features/jamworld/lib/render/terrain';
    import { getAsset } from './src/features/jamworld/lib/world/catalog';
    import { createMap } from './src/features/jamworld/lib/world/map';
    import { applyOps } from './src/features/jamworld/lib/world/ops';
    import { WorldRenderer } from './src/features/jamworld/lib/render/renderer';
    window.__terrainCheck = () => {
      const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
      const continuity = id => {
        const c = canvas(256, 256), g = c.getContext('2d');
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
          g.setTransform(1, 0, 0, 1, x * 64, y * 64);
          drawTileUnit(g, getAsset(id), x + 17, y + 23, { n: false, e: false, s: false, w: false }, 'td');
        }
        const d = g.getImageData(0, 0, 256, 256).data, seam = [], interior = [];
        for (let y = 8; y < 248; y++) for (let x = 8; x < 248; x++) {
          const i = (y * 256 + x) * 4, j = i - 4;
          const difference = Math.max(...[0, 1, 2].map(k => Math.abs(d[i + k] - d[j + k])));
          (x % 64 === 0 ? seam : interior).push(difference);
        }
        const mean = a => a.reduce((s, n) => s + n, 0) / a.length;
        seam.sort((a, b) => a - b);
        return { seamMean: mean(seam), interiorMean: mean(interior), seamP95: seam[Math.floor(seam.length * .95)], opaque: d.every((v, i) => i % 4 !== 3 || v === 255) };
      };
      const cache = [];
      for (const view of ['td', 'iso']) for (const [x, y] of [[4, 3], [3, 4], [2, 3], [3, 2]]) {
        const a = applyOps(createMap('m', 't', 16, 16), [{ op:'paint', tileId:'tile.water', x:3, y:3, w:1, h:1 }]).doc;
        const b = applyOps(a, [{ op:'paint', tileId:'tile.water', x, y, w:1, h:1 }]).doc;
        const scene = { mode:'play', time:0 };
        const c = canvas(700, 700); c.style.width = '700px'; c.style.height = '700px'; document.body.append(c);
        const r = new WorldRenderer(c, 'low', view); r.resize(); r.setDoc(a); r.fitToMap(); r.render(scene);
        r.setDoc(b); r.render(scene);
        const actual = r.ctx.getImageData(0, 0, c.width, c.height).data;
        const fresh = canvas(700, 700); fresh.style.width = '700px'; fresh.style.height = '700px'; document.body.append(fresh);
        const q = new WorldRenderer(fresh, 'low', view); q.resize(); q.setDoc(b); q.camera = { ...r.camera }; q.render(scene);
        const expected = q.ctx.getImageData(0, 0, fresh.width, fresh.height).data;
        cache.push({ view, x, y, matches: actual.every((v, i) => v === expected[i]) });
        r.clearCaches(); q.clearCaches(); c.remove(); fresh.remove();
      }
      const source = canvas(64, 64), sg = source.getContext('2d'); sg.fillStyle = '#a87dbe'; sg.fillRect(0, 0, 64, 64);
      const c = canvas(128, 64), g = c.getContext('2d');
      for (let x = 0; x < 2; x++) { g.setTransform(1,0,0,1,x*64,0); drawTileUnit(g, getAsset('tile.grass'), x, 0, {n:false,w:false}, 'td', {image:source,x:0,y:0,w:64,h:64}); }
      return { grass:continuity('tile.grass'), water:continuity('tile.water'), carpet:continuity('tile.carpet'), cache, customA:[...g.getImageData(32,32,1,1).data], customB:[...g.getImageData(96,32,1,1).data] };
    };
  ` } });
  const browser = await chromium.launch({ executablePath: process.env.JAMWORLD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
    // Everything in this harness is local and bundled directly from the renderer source.
    await page.route('http://terrain.test/**', route => route.fulfill(route.request().url().endsWith('.js')
      ? { contentType: 'text/javascript', body: bundle.outputFiles[0].text }
      : { contentType: 'text/html', body: '<!doctype html><script src="/terrain.js"></script>' }));
    await page.goto('http://terrain.test/');
    const result = await page.evaluate(() => window.__terrainCheck());
    for (const id of ['grass', 'water', 'carpet']) {
      assert.equal(result[id].opaque, true);
      assert.ok(result[id].seamMean < result[id].interiorMean * 2 + .75, id + ': cell edges must not add a line ' + JSON.stringify(result[id]));
      assert.ok(result[id].seamP95 <= 3, id + ': no bright checker seams');
    }
    assert.ok(result.cache.every(c => c.matches), JSON.stringify(result.cache));
    assert.deepEqual(result.customA, [168, 125, 190, 255]);
    assert.deepEqual(result.customB, result.customA, 'Student textures should not get alternating brightness');
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
});
