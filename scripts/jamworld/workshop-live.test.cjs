const { test } = require('node:test');
const assert = require('node:assert/strict');
const rf = require('node:module').createRequire(require('node:path').resolve(__dirname, '../../functions/package.json'));
process.env.GCLOUD_PROJECT = 'demo-jamworld';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FUNCTIONS_EMULATOR = 'true';
rf('firebase-admin/app').initializeApp({ projectId: 'demo-jamworld', storageBucket: 'demo-jamworld.appspot.com' });
const db = rf('firebase-admin/firestore').getFirestore();
const root = 'http://127.0.0.1:5000/api/jamworld/workshop';
const { getWorkshop } = require('../../functions/lib/jamworld/lib/server/workshop/runtime');
const { Workshop } = require('../../functions/lib/jamworld/lib/server/workshop/service');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVR4nGPwrj3RgA8zjAwFAPe1hAGDpHvcAAAAAElFTkSuQmCC', 'base64');
async function call(path, cookie, body, options = {}) {
 const r = await fetch(root + path, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type':'application/json' } : {}), ...options.headers }, body: body ? JSON.stringify(body) : undefined, signal: options.signal });
 return { status:r.status, data:await r.json(), cookie:r.headers.get('set-cookie')?.split(';')[0] };
}
async function teacher() {
 const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:crypto.randomUUID()+'@example.test',password:'test-only-password',returnSecureToken:true})});
 const a=await r.json(); await db.doc('users/'+a.localId).set({role:'teacher'});
 const me=await fetch(root+'/me',{headers:{authorization:'Bearer '+a.idToken}});
 return {uid:a.localId,cookie:me.headers.get('set-cookie').split(';')[0]};
}
const draft={name:'빠른 요청 바닥',description:'조용한 연보라색 바닥',category:'terrain',tags:['바닥'],footprint:{w:1,d:1},passable:true,height:0};
test('Live workshop delivery, atomic approval/queue, execution updates and scoped access', async t => {
 const a=await teacher(), other=await teacher();
 const cls=await call('/classes',a.cookie,{name:'즉시 전달 공방'}), id=cls.data.class.id;
 const s=await call('/join',null,{invite:cls.data.invite,nickname:'달토끼',pin:'123456'});
 const b=await call('/join',null,{invite:cls.data.invite,nickname:'별토끼',pin:'123456'});
 const request=(await call('/requests',s.cookie,{draft})).data.request;
 let pending, generationId;
 const path='/requests?classId='+id;
 await t.test('A submission wakes the teacher immediately; another student sees only their own scope',async()=>{
  const initial=await call(path,a.cookie); const started=Date.now();
  const waiting=call(path+'&after='+initial.data.rev+'&wait=1',a.cookie);
  pending=(await call('/requests/'+request.id+'/action',s.cookie,{action:'submit',rev:request.rev})).data.request;
  const delivered=await waiting; assert.equal(delivered.status,200); assert.equal(delivered.data.requests.find(r=>r.id===request.id).status,'pending');
  const ms=Date.now()-started; assert.ok(ms<3000,'Submission delivery took '+ms+'ms'); console.log('Submission → teacher feed:',ms,'ms');
  assert.equal((await call('/requests?classId='+id,b.cookie)).data.requests.length,0);
  assert.equal((await call(path,other.cookie)).status,403);
 });
 await t.test('Approval and the durable queue commit together; stale versions and students cannot approve',async()=>{
  const url='/requests/'+request.id+'/generate';
  assert.equal((await call(url,s.cookie,{approveRev:pending.rev},{headers:{'idempotency-key':'student-denied-key'}})).status,403);
  assert.equal((await call(url,a.cookie,{approveRev:pending.rev+1},{headers:{'idempotency-key':'stale-approved-key'}})).status,409);
  assert.equal((await call(url,a.cookie,{approveRev:pending.rev},{headers:{'idempotency-key':'missing-cost-review'}})).status,409,'An image job must not start without a reviewed quote');
  assert.equal((await call(url,a.cookie,{approveRev:pending.rev,quoteId:'forged-price'},{headers:{'idempotency-key':'forged-cost-review'}})).status,409);
  assert.equal((await call('/requests',s.cookie)).data.requests[0].status,'pending');
  const rev=(await call('/requests',s.cookie)).data.rev, start=Date.now();
  const waiting=call('/requests?after='+rev+'&wait=1',s.cookie);
  const quote=(await call(url,a.cookie)).data.quote;
  assert.ok(quote.lowUsd > 0 && quote.highUsd >= quote.lowUsd);
  assert.equal((await call(url,s.cookie)).status,403,'Students cannot approve costs');
  const options={headers:{'idempotency-key':'atomic-approve-generate'}};
  const result=await call(url,a.cookie,{approveRev:pending.rev,quoteId:quote.id},options); assert.equal(result.status,202); generationId=result.data.generationId;
  const delivered=await waiting; const row=delivered.data.requests.find(r=>r.id===request.id);
  assert.equal(row.status,'generating'); assert.equal(row.generation.status,'queued'); assert.ok(row.approved); assert.equal(row.attempts,1);
  assert.ok(Date.now()-start<3000); console.log('Approval → queued/student feed:',Date.now()-start,'ms');
  const duplicate=await call(url,a.cookie,{approveRev:pending.rev,quoteId:quote.id},options); assert.equal(duplicate.data.generationId,generationId); assert.equal(duplicate.data.started,false);
  const stored=(await db.doc('jamworldRequests/'+request.id).get()).data(); assert.equal(stored.approvedSnapshot,stored.submittedSnapshot); assert.equal(stored.generationId,generationId);
  const generation=(await db.doc('jamworldGenerations/'+generationId).get()).data();
  assert.equal(generation.costApproval.id,quote.id);assert.equal(generation.costApproval.teacherId,a.uid);assert.ok(generation.costApproval.acceptedAt);
 });
 await t.test('Starting and finishing a worker wake students without a page reload; only one provider runs',async()=>{
  const base=getWorkshop(); let calls=0, release; const blocked=new Promise(r=>{release=r;});
  const ws=new Workshop(base.store,base.files,{model:'gpt-image-2.5-flare',create:async()=>{calls++;await blocked;return {bytes:png,contentType:'image/png'};}});
  const before=(await call('/requests',s.cookie)).data;
  const waiter=call('/requests?after='+before.rev+'&wait=1',s.cookie);
  const run=ws.runGeneration(generationId);
  const running=(await waiter).data; assert.equal(running.requests[0].generation.status,'running');
  await assert.rejects(ws.runGeneration(generationId),/이미 실행/);
  release(); await run;
  const complete=await call('/requests?after='+running.rev+'&wait=1',s.cookie);
  assert.equal(complete.data.requests[0].status,'generated'); assert.ok(complete.data.requests[0].generation.outputs.texture); assert.equal(calls,1);
 });
 await t.test('An unchanged revision skips requests, generation and roster reads',async()=>{
  const {GET}=require('../../functions/lib/jamworld/routes/workshop/requests/route');
  const store=getWorkshop().store, methods=['requestsByClass','requestsByStudent','studentsInClass','getGeneration','latestGeneration'];
  for(const [cookie,query] of [[a.cookie,'?classId='+id],[s.cookie,'']]){
   const full=await call('/requests'+query,cookie), rev=full.data.rev;
   const saved=Object.fromEntries(methods.map(name=>[name,store[name]]));
   for(const name of methods)store[name]=async()=>{throw Error('Unexpected data read: '+name);};
   try{
    const result=await GET(new Request(root+'/requests'+query+(query?'&':'?')+'after='+rev,{headers:{cookie}}));
    assert.equal(result.status,200);assert.deepEqual(await result.json(),{unchanged:true,rev});
   }finally{for(const name of methods)store[name]=saved[name];}
  }
 });
 await t.test('A changed approval invalidates the quote; a changed worker model stops before billing',async()=>{
  let row=(await call('/requests',s.cookie,{draft:{...draft,name:'견적 변경 검사'}})).data.request;
  row=(await call('/requests/'+row.id+'/action',s.cookie,{action:'submit',rev:row.rev})).data.request;
  const path='/requests/'+row.id+'/generate', first=(await call(path,a.cookie)).data.quote;
  await call('/requests/'+row.id+'/action',a.cookie,{action:'approve',rev:row.rev});
  const options={headers:{'idempotency-key':'cost-version-guard'}};
  assert.equal((await call(path,a.cookie,{quoteId:first.id},options)).status,409);
  const second=(await call(path,a.cookie)).data.quote;assert.notEqual(first.id,second.id);
  const queued=await call(path,a.cookie,{quoteId:second.id},options);assert.equal(queued.status,202);
  let calls=0;const base=getWorkshop(),changed=new Workshop(base.store,base.files,{model:'different-unapproved-model',create:async()=>{calls++;return{bytes:png,contentType:'image/png'};}});
  await changed.runGeneration(queued.data.generationId);assert.equal(calls,0);
  const failed=(await call('/requests',s.cookie)).data.requests.find(r=>r.id===row.id);assert.equal(failed.status,'failed');
  const retry=(await call(path,a.cookie)).data.quote;assert.equal(retry.attempt,2);assert.notEqual(retry.id,second.id);
 });
 await t.test('Role revocation during an open wait is rechecked before returning private data',async()=>{
  const snap=await call(path,a.cookie); const waiting=call(path+'&after='+snap.data.rev+'&wait=1',a.cookie);
  await db.doc('users/'+a.uid).update({role:'student'});
  const base=getWorkshop(), row=await base.store.getRequest(request.id);
  await base.store.casRequest(row.id,row.rev,[row.status],{updatedAt:Date.now()});
  assert.equal((await waiting).status,401);
 });
});
