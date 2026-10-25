const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const requireFunction = require('node:module').createRequire(require('node:path').resolve(__dirname, '../../functions/package.json'));
const sharp = requireFunction('sharp');

test('Glass visibly refracts, remains readable, and supplies an accessible surface', async () => {
  const browser = await chromium.launch({ executablePath: process.env.JAMWORLD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 960 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5000/jamworldmake/'); await page.locator('.entry-grid').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.liqui-glass__refract').length >= 4);
    await page.waitForTimeout(300);
    assert.ok(await page.locator('feDisplacementMap').count() > 0);
    const before = await page.screenshot();
    await page.addStyleTag({ content: '.jamworld .liqui-glass__refract { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }' });
    const after = await page.screenshot();
    const a = await sharp(before).ensureAlpha().raw().toBuffer(), b = await sharp(after).ensureAlpha().raw().toBuffer();
    let different = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2]) > 35) different++;
    assert.ok(different > 2000, `Refraction must visibly alter the background, got ${different} pixels`);
    const text = await page.locator('body').innerText(); assert.doesNotMatch(text, /MAKE A LITTLE WORLD|LITTLE IDEAS|FOR CREATORS|FOR TEACHERS|ASSET WORKSHOP|MADE TOGETHER|gpt-|claude-|OpenAI|Anthropic/);
    await page.emulateMedia({ contrast: 'more' }); await page.locator('.water-glass-solid').first().waitFor();
    assert.equal(await page.locator('.liqui-glass--refract').count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(errors, []);
    console.log('Visible refracted pixels:', different);
  } finally { await browser.close(); }
});

// Static export used to treat a link with no view query as the current page.
// Exercise the real exported application and the native controls, including keyboard activation.
test('Workshop navigation returns from every screen and main cards/buttons refract', async () => {
  const browser = await chromium.launch({ executablePath: process.env.JAMWORLD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1040 }, reducedMotion: 'reduce', hasTouch: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const origin = 'http://127.0.0.1:5000';
    await page.goto(origin + '/jamworldmake/?view=worlds');
    const card = page.locator('.template-grid .world-tile').first();
    await card.locator(':scope > .liqui-glass__refract').waitFor();
    assert.equal(await page.locator('.template-grid .world-tile > .liqui-glass__refract').count(), 3);
    await card.getByRole('button', { name: '이 월드로 시작', exact: true }).waitFor();
    assert.equal(await card.locator('.glass-control > .liqui-glass__refract').count(), 1);
    await page.evaluate(() => document.fonts.ready);
    const before = await card.screenshot();
    await page.evaluate(() => document.querySelectorAll('feDisplacementMap').forEach(n => n.setAttribute('scale', '0')));
    const after = await card.screenshot();
    const a = await sharp(before).ensureAlpha().raw().toBuffer(), b = await sharp(after).ensureAlpha().raw().toBuffer();
    let changed = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2]) > 20) changed++;
    assert.ok(changed > 300, `Main card lens must visibly bend the backdrop, got ${changed} pixels`);
    for (const source of ['worlds', 'catalog']) {
      await page.goto(origin + '/jamworldmake/?view=' + source);
      await page.getByRole('link', { name: '에셋 공방', exact: true }).click();
      await page.locator('.entry-grid').waitFor();
      assert.equal(new URL(page.url()).searchParams.get('view'), 'workshop');
      assert.equal(await page.getByRole('link', { name: '에셋 공방', exact: true }).getAttribute('aria-current'), 'page');
    }
    await page.getByRole('link', { name: '내 월드', exact: true }).click();
    const create = page.getByRole('button', { name: '＋ 새 월드', exact: true });
    await create.focus(); await page.keyboard.press('Enter');
    await page.locator('#space-name').fill('유리 테스트 월드');
    await page.getByRole('button', { name: '만들고 편집하기', exact: true }).click();
    await page.locator('.ed-center canvas').waitFor();
    await page.getByRole('link', { name: '에셋 공방', exact: true }).click();
    await page.locator('.entry-grid').waitFor();
    await page.getByRole('link', { name: '내 월드', exact: true }).click();
    await page.getByRole('link', { name: '모아 월드', exact: true }).click();
    await page.locator('.entry-grid').waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('link', { name: '내 월드', exact: true }).tap();
    await page.locator('.template-grid').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.evaluate(() => document.querySelector('.jamworld').getBoundingClientRect().bottom >= document.querySelector('main').getBoundingClientRect().bottom), 'Long mobile content must stay inside the page surface');
    assert.deepEqual(errors, []);
    console.log('Main card displaced pixels:', changed);
  } finally { await browser.close(); }
});
