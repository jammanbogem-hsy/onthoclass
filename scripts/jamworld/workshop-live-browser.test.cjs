const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

test('Approve-and-generate sends one request, reflects live worker state and reconnects when visible', async () => {
 const browser=await chromium.launch({executablePath:process.env.JAMWORLD_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const waiting=new Set(); const wake=()=>{for(const resolve of waiting) resolve();waiting.clear();};
 let closing=false;
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[], writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  const draft={name:'즉시 만드는 바닥',description:'조용한 보라색 바닥',category:'terrain',tags:['바닥'],footprint:{w:1,d:1},passable:true,height:0};
  let revision=1, reads=0;
  const row={id:'req_live_ui',status:'pending',rev:1,version:1,nickname:'달토끼',draft,uploadUrl:null,submitted:{version:1,draft,uploadUrl:null,outputs:['texture']},approved:null,rejectReason:null,attempts:0,generation:null,updatedAt:Date.now()};
  const room={classId:'cls_live',className:'우리 공방',teacherId:'teacher_live',selfId:'teacher_live',role:'teacher',rev:1,serverTime:Date.now(),controls:{paused:false,blackout:false,muted:false},students:[],messages:[],world:null};
  await page.route('**/api/jamworld/**',async route=>{
   const req=route.request(),url=new URL(req.url()),p=url.pathname;
   const send=(json,status=200)=>closing?Promise.resolve():route.fulfill({status,json}).catch(()=>{});
   if(p.endsWith('/me')) return send({role:'teacher',teacher:{id:'teacher_live',name:'선생님'},status:{db:true,files:true,imageGeneration:true,imageModel:'test'}});
   if(p.endsWith('/classes')) return send({classes:[{id:'cls_live',name:'우리 공방',inviteActive:true,students:[{id:'student_live',nickname:'달토끼'}],pending:row.status==='pending'?1:0}]});
   if(p.includes('/classroom/')) {
    if(url.searchParams.get('wait')==='1') await new Promise(resolve=>waiting.add(resolve));
    return send(room);
   }
   if(p.endsWith('/requests')) {
    reads++;
    if(url.searchParams.get('wait')==='1' && +url.searchParams.get('after')===revision) await new Promise(resolve=>waiting.add(resolve));
    return send({requests:[row],rev:revision,students:[{id:'student_live',nickname:'달토끼'}]});
   }
   if(p.endsWith('/generate') && req.method()==='GET') return send({quote:{id:'quote-test',requestId:row.id,rev:row.rev,attempt:1,model:'gpt-image-2.5-flare',images:1,outputUsd:0.01317,lowUsd:0.015,highUsd:0.02,pricingVersion:'test',quality:'medium',size:'1024x1024',referenceImages:0}});
   if(req.method()==='POST') {
    writes.push({path:p,body:req.postDataJSON(),key:req.headers()['idempotency-key']});
    if(p.endsWith('/generate')) {
     row.status='generating'; row.rev++; row.attempts=1; row.approved={...row.submitted,at:Date.now()};
     row.generation={id:'gen_live_ui',status:'queued',attempt:1,error:null,model:'test',startedAt:Date.now(),outputs:null};
     revision++;wake();return send({generationId:'gen_live_ui',started:true,status:'queued'},202);
    }
    return send({error:'This action must not be used by the combined button'},400);
   }
   return send({assets:[],canManage:false});
  });
  await page.goto((process.env.JAMWORLD_ORIGIN||'http://127.0.0.1:5000')+'/jamworldmake/?view=workshop');
  const button=page.getByRole('button',{name:'비용 확인 · 승인하고 생성',exact:true});await button.waitFor();
  await page.waitForFunction(()=>!document.querySelector('.generation-control button')?.disabled);
  const start=Date.now();await button.evaluate(b=>{b.click();b.click();});
  await page.getByText('승인과 생성 요청을 접수했어요',{exact:true}).waitFor();
  assert.equal(writes.length,1);assert.ok(writes[0].path.endsWith('/generate'));assert.equal(writes[0].body.approveRev,1);assert.ok(writes[0].key);
  await page.getByRole('button',{name:/^생성 중/}).click();
  await page.getByText('그림 생성을 준비하고 있어요.',{exact:true}).waitFor();
  assert.ok(Date.now()-start<3000,'Queue acknowledgement should not wait for periodic polling');
  row.generation.status='running';revision++;wake();
  await page.getByText('그림을 만들고 있어요.',{exact:true}).waitFor();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(100);const pausedReads=reads;await page.waitForTimeout(200);assert.equal(reads,pausedReads,'Hidden tabs must stop workshop subscriptions');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>document.querySelector('.ws-teacher'));
  await page.waitForTimeout(150);assert.ok(reads>pausedReads,'Returning to the page must reconnect immediately');
  assert.deepEqual(errors,[]);
 } finally {closing=true;wake();await browser.close();}
});
