const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

test('Spatial effects and actual JavaScript run in isolation without blocking controls', async () => {
  const browser = await chromium.launch({ executablePath: process.env.JAMWORLD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/jamworld/**', route => route.fulfill({ json: route.request().url().endsWith('/me') ? { role: null, status: { db: true, files: true, imageGeneration: false, imageModel: '' } } : { assets: [], canManage: false } }));
    const origin = process.env.JAMWORLD_ORIGIN || 'http://127.0.0.1:5000';
    await page.goto(origin + '/jamworldmake/?view=worlds');
    await page.getByRole('button', { name: '＋ 새 월드', exact: true }).click();
    await page.getByRole('button', { name: '만들고 편집하기', exact: true }).click(); await page.locator('.ed-center canvas').waitFor();
    const id = new URL(page.url()).searchParams.get('id');
    const change = async (source, zoneEffects, spawn = { x: 12, y: 12 }, objects = []) => {
      await page.evaluate(({ id, source, zoneEffects, spawn, objects }) => {
        const project = JSON.parse(localStorage.getItem('jamworld.guest.projects.v1')).find(p => p.id === id);
        const key = 'jamworld.guest.map.v1.' + project.mapIds[0], doc = JSON.parse(localStorage.getItem(key));
        doc.zones = [{ id: 'lab', name: '실험 구역', x: 10, y: 10, w: 8, h: 8, effects: zoneEffects }];
        doc.script = source; doc.spawn = spawn; doc.objects = objects;
        localStorage.setItem(key, JSON.stringify(doc));
      }, { id, source, zoneEffects, spawn, objects });
      await page.goto(origin + '/jamworldmake/?view=play&id=' + id);
      await page.waitForFunction(() => window.__moaPerf?.().player);
    };
    await change('World.onEnter("실험 구역", () => World.message("코드로 만든 안내", 5000)); World.onUpdate(() => World.speed(0.5, 500));', { shake: 3, reverseControls: true, vision: 4 });
    await page.getByRole('status').filter({ hasText: '코드로 만든 안내' }).waitFor();
    await page.waitForFunction(() => window.__moaPerf?.().effects.speed === 0.5);
    assert.equal(await page.locator('.play-script-notice').count(), 0);
    assert.match(await page.locator('.play-vision').evaluate(e => e.style.background), /radial-gradient/);
    assert.match(await page.locator('.play canvas').evaluate(e => e.style.transform), /translate/);
    const before = await page.evaluate(() => window.__moaPerf().player.x);
    await page.mouse.click(400, 500);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(350); await page.keyboard.up('ArrowRight');
    assert.ok(await page.evaluate(x => window.__moaPerf().player.x < x - 0.1, before), 'Reverse controls should actually move left when right is pressed');
    await page.screenshot({ path: '/tmp/jamworld-spatial-effects.png' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('.play canvas').style.transform === '');
    await change('', {}, { x: 5, y: 5 });
    assert.equal(await page.locator('.play-vision').isVisible(), false);
    assert.deepEqual(await page.evaluate(() => window.__moaPerf().effects), {});

    await change(`
      let collected=false, last=-1;
      World.hud('inventory','열쇠',0);
      World.onInteract('item',()=>{if(!collected) World.choose('collect','상자를 열까요?',['열쇠 꺼내기','나중에']);});
      World.onChoice('collect',index=>{if(index===0){collected=true;World.hud('inventory','열쇠',1);World.object('item',{visible:false});World.object('door',{blocking:false});}});
      World.onInteract('exit',()=>World.teleport(20,20));
      World.onUpdate(ctx=>{const step=Math.floor(ctx.time);if(step!==last){last=step;World.object('npc',{x:18+step%2,y:18});}});
    `, {}, {x:12,y:12}, [
      {id:'item',assetId:'deco.crate',x:12,y:13,rot:0},
      {id:'door',assetId:'wall.stone',x:13,y:12,rot:0},
      {id:'exit',assetId:'deco.flag',x:15,y:12,rot:0},
      {id:'npc',assetId:'nature.bush',x:18,y:18,rot:0},
    ]);
    await page.getByLabel('활동 진행 상황').getByText('열쇠').waitFor();
    await page.getByRole('button',{name:'나무 상자 살펴보기',exact:true}).click();
    await page.getByRole('dialog',{name:'선택하기'}).getByRole('button',{name:'열쇠 꺼내기'}).click();
    await page.waitForFunction(()=>window.__moaPerf().scriptObjects.find(o=>o.id==='item').visible===false);
    assert.equal(await page.getByLabel('활동 진행 상황').locator('strong').innerText(),'1');
    await page.locator('.play canvas').click();
    await page.keyboard.down('ArrowRight');await page.waitForTimeout(550);await page.keyboard.up('ArrowRight');
    assert.ok(await page.evaluate(()=>window.__moaPerf().player.x>14),'Opening the door must actually remove its collision');
    await page.getByRole('button',{name:'깃발 살펴보기',exact:true}).click();
    await page.waitForFunction(()=>window.__moaPerf().player.x===20.5 && window.__moaPerf().player.y===20.5);
    const npcX=await page.evaluate(()=>window.__moaPerf().scriptObjects.find(o=>o.id==='npc').x);
    await page.waitForFunction(x=>window.__moaPerf().scriptObjects.find(o=>o.id==='npc').x!==x,npcX);
    await page.screenshot({path:'/tmp/jamworld-custom-script.png'});
    assert.equal(await page.locator('.play-script-notice').count(),0);
    await page.reload();
    await page.getByLabel('활동 진행 상황').getByText('열쇠').waitFor();
    assert.equal(await page.getByLabel('활동 진행 상황').locator('strong').innerText(),'0','Play state must reset without changing the saved map');

    let escaped = false;
    await page.route('https://escape.example/**', route => { escaped = true; return route.abort(); });
    await change('World.onEnter("실험 구역", () => { fetch("https://escape.example/private").catch(() => World.message("외부 연결 차단", 5000)); });', {});
    await page.getByRole('status').filter({ hasText: '외부 연결 차단' }).waitFor(); assert.equal(escaped, false);
    await change('World.onUpdate(() => { while (true) {} });', {});
    await page.locator('.play-script-notice').waitFor();
    await page.getByRole('link', { name: '나가기', exact: true }).click(); await page.locator('.world-dashboard').waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
