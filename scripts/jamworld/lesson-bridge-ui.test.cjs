const { test }=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

test('Deployed lesson-file import opens a draft, shows cited analysis and applies only after review',async()=>{
 const {createLessonPacket}=await import('../../packages/learningcrew-cli/lib/lesson.mjs');
 const origin=process.env.JAMWORLD_ORIGIN || 'http://127.0.0.1:5000';
 const packet=createLessonPacket({classId:'class-demo',lessonId:'lesson-demo',origin,students:[{code:'S01'}],responses:{lesson:{title:'물의 변화',date:'2026-10-22'},activities:[{id:'q1',kind:'question',title:'설명',prompt:'물은 어디로 갔나요?',responses:[{student:'S01',content:'물이 없어졌어요'}]}]},goal:'물의 상태 변화를 설명하기'});
 const review={facts:[{text:'한 응답에 물이 없어졌다는 표현이 있어요.',evidenceIds:['e1']}],hypotheses:[{text:'증발 뒤 물의 상태를 다시 확인해요.',evidenceIds:['e1']}],goals:['상태 변화의 근거를 설명해요'],sequence:[{title:'생각 확인',minutes:10,purpose:'기존 생각 확인',zone:'시작 광장',check:'물은 어디로 갔을까요?'},{title:'탐구·공유',minutes:30,purpose:'상태 변화 관찰',zone:'물 탐구실',check:'물질이 남아 있나요?'}],uncertainties:['한 응답에서 전체 학급을 일반화하지 않아요.']};
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let calls=0;
  await page.route('**/api/jamworld/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/me'))return route.fulfill({json:{role:'teacher',teacher:{id:'teacher-fixture',name:'선생님'},status:{db:true,files:true,imageGeneration:false,imageModel:''}}});
   if(url.pathname.endsWith('/classes'))return route.fulfill({json:{classes:[]}});
   if(url.pathname.endsWith('/agent/status'))return route.fulfill({json:{providers:{openai:{configured:true,model:'fixture'}}}});
   if(url.pathname.endsWith('/agent')){calls++;const b=route.request().postDataJSON();assert.equal(b.lessonEvidence.records[0].id,'e1');assert.equal(b.brief.minutes,40);return route.fulfill({json:{provider:'openai',model:'fixture',latencyMs:1,summary:'응답을 바탕으로 탐구 공간을 설계했어요.',lessonReview:review,ops:[{op:'zone',name:'물 탐구실',x:5,y:5,w:8,h:8}]}});}
   return route.fulfill({json:{assets:[],canManage:false}});
  });
  await page.goto(origin+'/jamworldmake/?view=worlds');
  await page.getByLabel('월드 또는 수업 기록 파일').setInputFiles({name:'lesson.moa.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(packet))});
  await page.getByRole('button',{name:'분석하고 다음 수업 설계',exact:true}).waitFor();assert.equal(calls,0);
  await page.getByRole('button',{name:'분석하고 다음 수업 설계',exact:true}).click();await page.getByTestId('agent-preview').waitFor();
  const region=page.getByRole('region',{name:'수업 분석과 다음 수업 제안'});await region.getByRole('heading',{name:'수업 분석과 다음 수업',exact:true}).waitFor();
  await region.locator('summary').filter({hasText:'근거 보기'}).first().click();assert.match(await region.innerText(),/물이 없어졌어요/);
  await page.screenshot({path:'/tmp/jamworld-lesson-bridge-production.png'});
  await page.getByTestId('agent-preview').getByRole('button',{name:'적용',exact:true}).click();await page.getByRole('button',{name:'저장',exact:true}).click();await page.reload();
  await page.getByRole('region',{name:'수업 분석과 다음 수업 제안'}).waitFor();assert.equal(calls,1);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
