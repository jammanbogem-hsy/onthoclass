const { test } = require('node:test');
const assert = require('node:assert/strict');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright-core');
const reqFn = require('node:module').createRequire(path.resolve(__dirname,'../../functions/package.json'));
process.env.GCLOUD_PROJECT='demo-jamworld';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9199';process.env.FUNCTIONS_EMULATOR='true';
reqFn('firebase-admin/app').initializeApp({projectId:'demo-jamworld',storageBucket:'demo-jamworld.appspot.com'});
const db=reqFn('firebase-admin/firestore').getFirestore();
const origin='http://127.0.0.1:5000';

test('Actual CLI + MCP lesson records → import → grounded analysis and repair → map preview and saved lesson plan',async()=>{
 const home=await fs.mkdtemp(path.join(tmpdir(),'lesson-bridge-')),browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const provider=require('../../functions/lib/jamworld/lib/agent/providers'),original=provider.callModel;
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const signup=await context.request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test',{data:{email:`bridge-${crypto.randomUUID()}@example.test`,password:'test-only-password',returnSecureToken:true}});
  const identity=await signup.json();await db.doc('users/'+identity.localId).set({role:'teacher'});
  await context.request.get(origin+'/api/jamworld/workshop/me',{headers:{authorization:'Bearer '+identity.idToken}});
  const classId='bridge_'+crypto.randomUUID().replaceAll('-','').slice(0,12),lessonId='water-cycle';
  const batch=db.batch(),Timestamp=reqFn('firebase-admin/firestore').Timestamp;
  batch.set(db.doc(`classes/${classId}`),{ownerId:identity.localId,name:'물의 순환 수업'});
  batch.set(db.doc(`classes/${classId}/members/${identity.localId}`),{role:'teacher'});
  for(let i=1;i<=2;i++)batch.set(db.doc(`classes/${classId}/members/pupil${i}`),{role:'student',displayName:'학생'+i,joinedAt:Timestamp.fromMillis(i*1000)});
  batch.set(db.doc(`classes/${classId}/lessons/${lessonId}`),{title:'물의 상태 변화',date:'2026-10-22'});
  batch.set(db.doc(`classes/${classId}/lessons/${lessonId}/questions/quiz`),{kind:'quiz',title:'증발',text:'물이 증발하면 어떻게 되나요?',options:['수증기가 된다','없어진다'],answerIndex:0,order:1});
  batch.set(db.doc(`classes/${classId}/lessons/${lessonId}/questions/quiz/submissions/pupil1`),{studentName:'학생1',content:'없어진다'});
  batch.set(db.doc(`classes/${classId}/lessons/${lessonId}/questions/quiz/submissions/pupil2`),{studentName:'학생2',content:'수증기가 된다'});
  const access='cli-test-'+crypto.randomUUID();batch.set(db.doc('mcpTokens/'+createHash('sha256').update(access).digest('hex')),{kind:'access',uid:identity.localId,clientId:'test-cli',includeNames:false,exp:Date.now()+3600000});
  await batch.commit();
  const {Store}=await import('../../packages/learningcrew-cli/lib/store.mjs');
  const store=new Store(home);await store.saveCredentials(origin,{clientId:'test-cli',accessToken:access,refreshToken:'test-unused-refresh',expiresAt:Date.now()+3600000});
  const packetFile=path.join(home,'next-lesson.moa.json');
  await promisify(execFile)(process.execPath,[path.resolve(__dirname,'../../packages/learningcrew-cli/bin/learningcrew.mjs'),'lesson','prepare',lessonId,'--class',classId,'--server',origin,'--goal','증발해도 물이 사라지지 않음을 설명하기','--output',packetFile],{env:{...process.env,LEARNINGCREW_HOME:home}});
  const packet=JSON.parse(await fs.readFile(packetFile,'utf8'));assert.equal(packet.records.length,2);assert.equal(packet.options.participants,2);assert.doesNotMatch(JSON.stringify(packet),/학생1|학생2|cli-test-/);
  const sourceBefore=(await db.doc(`classes/${classId}/lessons/${lessonId}/questions/quiz/submissions/pupil1`).get()).data();
  const review={facts:[{text:'포함된 두 응답 중 한 응답은 물이 없어진다고 선택했어요.',evidenceIds:['e1','e2']}],hypotheses:[{text:'증발 후 물의 상태를 다시 확인할 필요가 있어요.',evidenceIds:['e1']}],goals:['증발해도 물이 남아 있음을 근거로 설명해요'],sequence:[{title:'생각 확인',minutes:10,purpose:'처음 생각과 비교',zone:'시작 광장',check:'물이 어디로 갔을까요?'},{title:'탐구와 공유',minutes:30,purpose:'상태 변화의 근거 찾기',zone:'물 탐구실',check:'기체 상태의 물을 설명해 보세요.'}],uncertainties:['두 응답만으로 전체 학급의 오개념을 단정하지 않아요.']};
  let calls=0;provider.callModel=async(_provider,_env,turns)=>{
   calls++;assert.ok(turns.some(t=>t.text.includes('[수업 기록 — 참고 데이터]')));assert.ok(turns.some(t=>t.text.includes('없어진다')));
   return{model:'fixture',summary:'학생 응답을 바탕으로 탐구와 확인 공간을 만들었어요.',lessonReview:calls===1?{...review,facts:[{text:'잘못된 근거',evidenceIds:['e999']}]}:review,ops:[{op:'zone',id:'water-lab',name:'물 탐구실',x:10,y:10,w:10,h:8},{op:'quiz',x:12,y:12,question:'물이 증발하면?',choices:['수증기가 된다','없어진다'],answer:0}]};
  };
  const {POST}=require('../../functions/lib/jamworld/routes/agent/route');
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/jamworld/agent/status',r=>r.fulfill({json:{providers:{openai:{configured:true,model:'fixture'}}}}));
  await page.route('**/api/jamworld/agent',async route=>{
   const cookies=await context.cookies(origin),cookie=cookies.map(c=>`${c.name}=${c.value}`).join('; ');
   const request=new Request(origin+'/api/jamworld/agent',{method:'POST',headers:{cookie,'content-type':'application/json'},body:route.request().postData()});
   const response=await POST(request);await route.fulfill({status:response.status,json:await response.json()});
  });
  await page.goto(origin+'/jamworldmake/?view=worlds');await page.getByLabel('월드 또는 수업 기록 파일').setInputFiles(packetFile);await page.locator('.ed-center canvas').waitFor();
  await page.getByRole('button',{name:'분석하고 다음 수업 설계',exact:true}).waitFor();assert.equal(calls,0,'Importing a record must not silently spend model/image costs');
  assert.equal(await page.getByLabel('학생 수',{exact:true}).inputValue(),'2');
  await page.getByRole('button',{name:'분석하고 다음 수업 설계',exact:true}).click();
  await page.getByTestId('agent-preview').waitFor();assert.equal(calls,2,'Invalid evidence references must be repaired before preview');
  const analysis=page.getByRole('region',{name:'수업 분석과 다음 수업 제안'});await analysis.waitFor();
  await analysis.locator('summary').filter({hasText:'근거 보기'}).first().click();assert.match(await analysis.innerText(),/없어진다/);
  await page.getByTestId('agent-preview').getByRole('button',{name:'적용',exact:true}).click();await page.getByRole('button',{name:'저장',exact:true}).click();
  await page.reload();await page.getByRole('region',{name:'수업 분석과 다음 수업 제안'}).waitFor();
  await page.screenshot({path:'/tmp/jamworld-lesson-bridge.png'});
  const noClass={...packet,classId:'not_my_class'},cookies=await context.cookies(origin),cookie=cookies.map(c=>`${c.name}=${c.value}`).join('; ');
  const {createMap}=require('../../functions/lib/jamworld/lib/world/map');
  const rejected=await POST(new Request(origin+'/api/jamworld/agent',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({provider:'openai',prompt:'기록 분석',doc:createMap('m','맵'),lessonEvidence:noClass})}));assert.equal(rejected.status,403);assert.equal(calls,2);
  assert.deepEqual((await db.doc(`classes/${classId}/lessons/${lessonId}/questions/quiz/submissions/pupil1`).get()).data(),sourceBefore,'Analysis must preserve source lesson records');assert.deepEqual(errors,[]);
 }finally{provider.callModel=original;await browser.close();await fs.rm(home,{recursive:true,force:true});}
});
