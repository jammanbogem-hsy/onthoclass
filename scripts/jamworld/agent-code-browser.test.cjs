const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

test('Generated code executes in isolation before preview and a runtime error is sent back for repair', async () => {
 const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let calls=0;
  await page.route('**/api/jamworld/**', async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/me'))return route.fulfill({json:{role:null,status:{db:true,files:true,imageGeneration:false,imageModel:''}}});
   if(url.pathname.endsWith('/agent/status'))return route.fulfill({json:{providers:{openai:{configured:true,model:'fixture'}}}});
   if(url.pathname.endsWith('/agent')){
    const body=route.request().postDataJSON();calls++;
    if(calls===2){assert.match(body.prompt,/missingMethod/);assert.match(body.failedProposal.ops[0].source,/missingMethod/);}
    return route.fulfill({json:{provider:'openai',model:'fixture',latencyMs:1,summary:'열쇠를 모으면 문을 열어요.',ops:[{op:'setScript',source:calls===1?'World.missingMethod();':'let score=0; World.hud("score","찾은 열쇠",score); World.onEnter("시작",()=>World.hud("score","찾은 열쇠",++score));'}]}});
   }
   return route.fulfill({json:{assets:[],canManage:false}});
  });
  await page.goto((process.env.JAMWORLD_ORIGIN || 'http://127.0.0.1:5000')+'/jamworldmake/?view=worlds');
  await page.getByRole('button',{name:'＋ 새 월드',exact:true}).click();await page.getByRole('button',{name:'만들고 편집하기',exact:true}).click();await page.locator('.ed-center canvas').waitFor();
  await page.getByLabel('맵 도우미 요청').fill('열쇠를 모으면 문이 열리는 코드를 만들어 줘');
  await page.getByRole('button',{name:'도우미에게 부탁하기'}).click();
  await page.getByTestId('agent-preview').waitFor();assert.equal(calls,2);
  await page.getByText('바뀌는 맵 코드 보기').click();assert.match(await page.locator('.script-proposal').innerText(),/World.hud/);assert.doesNotMatch(await page.locator('.script-proposal').innerText(),/missingMethod/);
  assert.equal(await page.locator('iframe[sandbox="allow-scripts"]').count(),0,'Probe runtime must be disposed');
  await page.getByTestId('agent-preview').getByRole('button',{name:'적용',exact:true}).click();
  await page.getByRole('button',{name:/저장 후 플레이/}).click();
  await page.getByLabel('활동 진행 상황').getByText('찾은 열쇠').waitFor();assert.equal(await page.locator('.play-script-notice').count(),0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
