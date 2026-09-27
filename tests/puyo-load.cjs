// Forty isolated clients against demo-puyo only. Never points at production.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:9000';
const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const ar=require('module').createRequire(path.resolve('functions/package.json'));
ar('firebase-admin/app').initializeApp({projectId:'demo-puyo'});const db=ar('firebase-admin/firestore').getFirestore(),auth=ar('firebase-admin/auth').getAuth();
const liveAdmin=ar('firebase-admin/database').getDatabaseWithUrl('https://demo-puyo-default-rtdb.firebaseio.com');
const {getDatabase,connectDatabaseEmulator,ref,set,onValue,serverTimestamp:liveTimestamp}=require('firebase/database');
const {initializeApp,deleteApp}=require('firebase/app'),{getAuth,connectAuthEmulator,signInWithEmailAndPassword}=require('firebase/auth');
const {getFirestore,connectFirestoreEmulator,doc,setDoc,serverTimestamp,collection,query,where,onSnapshot}=require('firebase/firestore');
const E={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/puyo-engine.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:E,require,Math,Set,JSON});
const S={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/puyo-sync.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:S,require:()=>E,setTimeout,clearTimeout,performance});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),cid='puyo-load',gid='round',clients=[],accounts=[],sentAt=new Map(),latencies=[],acks=[],errors=[];
const percentile=(a,p)=>Math.round([...a].sort((a,b)=>a-b)[Math.ceil(a.length*p)-1]||0);
(async()=>{
 await db.recursiveDelete(db.doc(`classes/${cid}`));
 const ids=Array.from({length:40},(_,i)=>`puyo-load-${i}`),start=Date.now()-1000;
 const batch=db.batch();batch.set(db.doc(`classes/${cid}`),{name:'Local load test'});batch.set(db.doc(`classes/${cid}/games/${gid}`),{kind:'puyo',status:'play',puyo:{rosterIds:ids,startsAt:start,endsAt:start+120000}});
 for(const uid of ids){try{await auth.createUser({uid,email:`${uid}@puyo.test`,password:'puyo-test-1234'})}catch(e){if(e.code!=='auth/uid-already-exists')throw e}accounts.push(uid);batch.set(db.doc(`classes/${cid}/members/${uid}`),{uid,role:'student'});batch.set(db.doc(`classes/${cid}/games/${gid}/puyoStates/${uid}`),{uid,score:0,sent:0,maxChain:0,lost:false,seq:0,state:'',at:new Date()});}
 await batch.commit();
 await liveAdmin.ref(`puyo/${cid}/${gid}`).set({meta:{startsAt:start,endsAt:start+120000,teacher:"teacher",players:Object.fromEntries(ids.map((id,i)=>[id,`m${Math.floor(i/2)}`]))}});
 for(let index=0;index<40;index++){
  const uid=ids[index],app=initializeApp({projectId:'demo-puyo',apiKey:'demo-key'},uid),a=getAuth(app);connectAuthEmulator(a,'http://127.0.0.1:9099',{disableWarnings:true});await signInWithEmailAndPassword(a,`${uid}@puyo.test`,'puyo-test-1234');
  const d=getFirestore(app);connectFirestoreEmulator(d,'127.0.0.1',8080);const col=collection(d,`classes/${cid}/games/${gid}/puyoStates`),state=E.createState(2741);let previous=0;
  const live=getDatabase(app,'https://demo-puyo-default-rtdb.firebaseio.com');connectDatabaseEmulator(live,'127.0.0.1',9000);
  const off=onValue(ref(live,`puyo/${cid}/${gid}/boards/${ids[index^1]}`),snap=>{const r=snap.val();if(!r)return;assert.ok(r.score>=previous);previous=r.score;const at=sentAt.get(`${ids[index^1]}/${r.score}`);if(at!==undefined)latencies.push(performance.now()-at)},e=>errors.push(e.message));
  const publisher=new S.PuyoPublisher({seq:0,snapshot:()=>state,write:async s=>{sentAt.set(`${uid}/${s.score}`,performance.now());await set(ref(live,`puyo/${cid}/${gid}/boards/${uid}`),{score:s.score,sent:0,lost:false,maxChain:0,state:JSON.stringify(s),at:liveTimestamp()})},saved:(_,elapsed)=>acks.push(elapsed),error:()=>errors.push('live publish failed')});
  const checkpoint=new S.PuyoPublisher({seq:0,snapshot:()=>state,write:async(s,seq)=>{await setDoc(doc(col,uid),{uid,score:s.score,sent:0,maxChain:0,lost:false,seq,state:JSON.stringify(s),at:serverTimestamp()})},saved:()=>{},error:()=>errors.push('checkpoint failed')});
  clients.push({app,off,publisher,checkpoint,state});
 }
 await delay(500);
 // Each player receives their rival; the teacher also receives all 40 states.
 const spectator=onSnapshot(collection(getFirestore(clients[0].app),`classes/${cid}/games/${gid}/puyoStates`),()=>{},e=>errors.push(e.message));
 const timer=setInterval(()=>clients.forEach(c=>{c.state.score++;c.publisher.request()}),100);
 const checkpoints=setInterval(()=>clients.forEach(c=>c.checkpoint.request()),1000);
 await delay(12000);clearInterval(timer);clearInterval(checkpoints);await delay(1500);spectator();
 const result={clients:40,simultaneousMatches:20,durationSeconds:12,intervalMs:100,received:latencies.length,writeAcks:acks.length,opponentMs:{median:percentile(latencies,.5),p95:percentile(latencies,.95),max:Math.round(Math.max(...latencies))},ackMs:{p95:percentile(acks,.95)},errors};
 fs.mkdirSync('work',{recursive:true});fs.writeFileSync('work/puyo-load-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));assert.equal(errors.length,0);assert.ok(latencies.length>=3000,'expected sustained delivery across every match');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{for(const c of clients){c.publisher.dispose();c.checkpoint.dispose();c.off();await deleteApp(c.app)}await db.recursiveDelete(db.doc(`classes/${cid}`));await liveAdmin.ref(`puyo/${cid}/${gid}`).remove();for(const id of accounts)await auth.deleteUser(id);process.exit(process.exitCode||0)});
