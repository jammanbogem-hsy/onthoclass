// Integration tests run only against the disposable demo-puyo emulators.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:9000';
const assert=require('node:assert/strict');
const adminRequire=require('node:module').createRequire(require('node:path').resolve('functions/package.json'));
const {initializeApp:adminInit}=adminRequire('firebase-admin/app');
const {getFirestore:adminDb,FieldValue}=adminRequire('firebase-admin/firestore');
const {getAuth:adminAuth}=adminRequire('firebase-admin/auth');
const {getDatabaseWithUrl}=adminRequire('firebase-admin/database');
const {getDatabase,connectDatabaseEmulator,ref:liveRef,set:liveSet,get:liveGet,serverTimestamp:liveTimestamp}=require('firebase/database');
const {initializeApp,deleteApp}=require('firebase/app');
const {getAuth,connectAuthEmulator,signInWithEmailAndPassword}=require('firebase/auth');
const {getFirestore,connectFirestoreEmulator,doc,setDoc,getDoc,serverTimestamp,updateDoc}=require('firebase/firestore');
const {getFunctions,connectFunctionsEmulator,httpsCallable}=require('firebase/functions');
adminInit({projectId:'demo-puyo'});const db=adminDb();const liveAdmin=getDatabaseWithUrl('https://demo-puyo-default-rtdb.firebaseio.com');const apps=[];
const people=[['teacher','선생님','teacher'],['student-a','지우','student'],['student-b','이슬','student'],['outsider','외부','student']];
async function client(id){const app=initializeApp({projectId:'demo-puyo',apiKey:'demo-key',appId:'demo-puyo'},id);apps.push(app);const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});await signInWithEmailAndPassword(auth,`${id}@puyo.test`,'puyo-test-1234');const fs=getFirestore(app);connectFirestoreEmulator(fs,'127.0.0.1',8080);const fns=getFunctions(app,'asia-northeast3');connectFunctionsEmulator(fns,'127.0.0.1',5001);const live=getDatabase(app,'https://demo-puyo-default-rtdb.firebaseio.com');connectDatabaseEmulator(live,'127.0.0.1',9000);return{fs,live,call:(name,data)=>httpsCallable(fns,name)(data)}}
async function room(gid){await db.doc(`classes/puyo-test/games/${gid}`).set({kind:'puyo',status:'draft',by:'teacher',link:{name:'뿌요뿌요 테스트'},puyo:{durationSec:60},createdAt:FieldValue.serverTimestamp()});for(const[id,name]of people.slice(0,3))await db.doc(`classes/puyo-test/games/${gid}/puyoPresence/${id}`).set({uid:id,name,online:true,at:FieldValue.serverTimestamp()});}
(async()=>{
await db.recursiveDelete(db.doc("classes/puyo-test"));
for(const[uid,displayName,role]of people){try{await adminAuth().createUser({uid,email:`${uid}@puyo.test`,password:'puyo-test-1234',displayName,emailVerified:true})}catch(e){if(e.code!=='auth/uid-already-exists')throw e;}await db.doc(`users/${uid}`).set({role,displayName,email:`${uid}@puyo.test`});if(uid!=='outsider')await db.doc(`classes/puyo-test/members/${uid}`).set({role,displayName,uid,joinedAt:FieldValue.serverTimestamp()});}
await adminAuth().setCustomUserClaims('teacher',{teacher:true});await db.doc('classes/puyo-test').set({name:'포켓 뿌요 테스트 학급',ownerId:'teacher',createdAt:FieldValue.serverTimestamp()});
if(process.argv.includes('--seed')){await room('browser-room');await db.doc('classes/puyo-test/control/game').set({gameId:'browser-room',at:FieldValue.serverTimestamp()});console.log('Seeded demo-puyo teacher/student-a/student-b. Password: puyo-test-1234 (local emulator only).');return;}
await db.doc('classes/puyo-test/xp/student-a').set({uid:'student-a',xp:37});
await db.doc('classes/puyo-test/manbo/student-a').set({uid:'student-a',balance:22,earned:42});
const t=await client('teacher'),a=await client('student-a'),b=await client('student-b'),o=await client('outsider');
const data=gid=>({cid:'puyo-test',gid});
await room('odd');await assert.rejects(a.call('puyoStart',{...data('odd'),students:['student-a']}));await t.call('puyoStart',{...data('odd'),students:['student-a']});let g=(await db.doc('classes/puyo-test/games/odd').get()).data();assert.deepEqual(g.puyo.rosterIds.sort(),['student-a','teacher']);assert.equal(g.puyo.matches.length,1);await assert.rejects(t.call('puyoStart',{...data('odd'),students:['student-a']}));console.log('PASS odd teacher inclusion, teacher-only start, duplicate start blocked');
await room('even');await t.call('puyoStart',{...data('even'),students:['student-a','student-b']});g=(await db.doc('classes/puyo-test/games/even').get()).data();assert.deepEqual(g.puyo.rosterIds.sort(),['student-a','student-b']);assert.equal(g.puyo.matches.length,1);await assert.rejects(o.call('puyoClock',{cid:'puyo-test'}));await assert.rejects(a.call('puyoFinish',{...data('even'),manual:true}));console.log('PASS even excludes teacher, outsider and student manual end denied');
assert.equal(g.puyo.realtime,true);
const livePath='puyo/puyo-test/even';
await liveAdmin.ref(livePath+'/meta').update({startsAt:Date.now()-1000,endsAt:Date.now()+60000});
const liveState={state:'{}',score:100,sent:1,lost:false,maxChain:0,at:liveTimestamp()};
await liveSet(liveRef(a.live,livePath+'/boards/student-a'),liveState);
assert.equal((await liveGet(liveRef(b.live,livePath+'/boards/student-a'))).val().score,100);
await assert.rejects(liveSet(liveRef(a.live,livePath+'/boards/student-b'),liveState));
await assert.rejects(liveSet(liveRef(a.live,livePath+'/meta'),{teacher:'student-a'}));
await assert.rejects(liveGet(liveRef(o.live,livePath+'/boards/student-a')));
await liveAdmin.ref(livePath+'/meta/players/outsider').set('different-match');
await assert.rejects(liveGet(liveRef(o.live,livePath+'/boards/student-a')));
await assert.rejects(liveSet(liveRef(a.live,livePath+'/boards/student-a'),{...liveState,sent:10000}));
console.log('PASS realtime own writes and rival read; rival writes, pairing edits, outsider/unpaired reads and invalid attacks denied');
await db.doc('classes/puyo-test/games/even').update({'puyo.startsAt':Date.now()-1000,'puyo.endsAt':Date.now()+60000});
const state=(uid,score,seq=1)=>({uid,score,sent:0,maxChain:0,lost:false,seq,state:'{}',at:serverTimestamp()});
const ref=(who,id)=>doc(who.fs,`classes/puyo-test/games/even/puyoStates/${id}`);
await setDoc(ref(a,'student-a'),state('student-a',100));await assert.rejects(setDoc(ref(a,'student-b'),state('student-b',999)));await assert.rejects(setDoc(ref(a,'student-a'),state('student-a',-1,2)));await assert.rejects(updateDoc(doc(a.fs,'classes/puyo-test/games/even'),{ranks:[]}));await assert.rejects(getDoc(doc(o.fs,'classes/puyo-test/games/even')));console.log('PASS valid state accepted; rival state, negative score, game result edits, outsider read denied');
await setDoc(ref(b,'student-b'),{...state('student-b',90),lost:true});await a.call('puyoFinish',data('even'));g=(await db.doc('classes/puyo-test/games/even').get()).data();assert.equal(g.status,'done');assert.equal(g.puyo.matches[0].result.winner,'student-a');assert.equal(g.puyo.matches[0].result.reason,'topout');await assert.rejects(setDoc(ref(a,'student-a'),state('student-a',999,2)));console.log('PASS topout winner and closed state writes');
assert.equal((await liveAdmin.ref(livePath).get()).exists(),false);
await assert.rejects(liveSet(liveRef(a.live,livePath+'/boards/student-a'),liveState));
assert.deepEqual(g.puyo.matches[0].result.reward,{uid:'student-a',xp:10});
await Promise.all(Array.from({length:6},()=>a.call('puyoFinish',data('even'))));
assert.equal((await db.doc('classes/puyo-test/xp/student-a').get()).data().xp,47);
assert.equal((await db.doc('classes/puyo-test/manbo/student-a').get()).data().balance,32);
assert.equal((await db.doc('classes/puyo-test/manbo/student-a').get()).data().earned,52);
assert.equal((await db.collection('classes/puyo-test/xp/student-a/log').get()).size,1);
assert.equal((await db.doc('classes/puyo-test/xp/student-b').get()).exists,false);
// Restoring a game result cannot replay its payout log.
await db.doc('classes/puyo-test/games/even').update({status:'play','puyo.matches':g.puyo.matches.map(m=>({...m,result:null}))});
await a.call('puyoFinish',data('even'));
assert.equal((await db.doc('classes/puyo-test/xp/student-a').get()).data().xp,47);
console.log('PASS winner +10 XP and mirrored wallet, concurrent/replayed payout exactly once, loser not rewarded');
await db.doc('classes/puyo-test/games/odd').update({'puyo.startsAt':Date.now()-65000,'puyo.endsAt':Date.now()-3000});await db.doc('classes/puyo-test/games/odd/puyoStates/teacher').update({score:500});await db.doc('classes/puyo-test/games/odd/puyoStates/student-a').update({score:700});await a.call('puyoFinish',data('odd'));g=(await db.doc('classes/puyo-test/games/odd').get()).data();assert.equal(g.puyo.matches[0].result.winner,'student-a');assert.equal(g.puyo.matches[0].result.reason,'time');assert.equal((await db.doc('classes/puyo-test/xp/student-a').get()).data().xp,57);console.log('PASS server deadline score winner and a new round earns another 10 XP');
for(const [gid,teacherScore,studentScore] of [['teacher-wins',100,0],['tie',100,100]]){
 await room(gid);await t.call('puyoStart',{...data(gid),students:['student-a']});
 await db.doc(`classes/puyo-test/games/${gid}`).update({'puyo.startsAt':Date.now()-10000,'puyo.endsAt':Date.now()-3000});
 await db.doc(`classes/puyo-test/games/${gid}/puyoStates/teacher`).update({score:teacherScore});
 await db.doc(`classes/puyo-test/games/${gid}/puyoStates/student-a`).update({score:studentScore});
 await Promise.all([a.call('puyoFinish',data(gid)),t.call('puyoFinish',data(gid))]);
 const result=(await db.doc(`classes/puyo-test/games/${gid}`).get()).data().puyo.matches[0].result;
 assert.equal(result.winner,gid==='tie'?null:'teacher');assert.equal(result.reward,undefined);
}
assert.equal((await db.doc('classes/puyo-test/xp/teacher').get()).exists,false);
assert.equal((await db.doc('classes/puyo-test/xp/student-a').get()).data().xp,57);
console.log('PASS teacher wins and draws never reward students or teachers');
await room('offline');await db.doc('classes/puyo-test/games/offline/puyoPresence/student-a').update({online:false});await assert.rejects(t.call('puyoStart',{...data('offline'),students:['student-a']}));console.log('PASS stale/offline student cannot be selected');
await room('live-score');await t.call('puyoStart',{...data('live-score'),students:['student-a','student-b']});
await liveAdmin.ref('puyo/puyo-test/live-score/meta').update({startsAt:Date.now()-1000,endsAt:Date.now()+60000});
await liveSet(liveRef(a.live,'puyo/puyo-test/live-score/boards/student-a'),{...liveState,score:777,sent:0});
await liveSet(liveRef(b.live,'puyo/puyo-test/live-score/boards/student-b'),{...liveState,score:333,sent:0});
await db.doc('classes/puyo-test/games/live-score').update({'puyo.startsAt':Date.now()-65000,'puyo.endsAt':Date.now()-3000});
await Promise.all([a.call('puyoFinish',data('live-score')),b.call('puyoFinish',data('live-score'))]);
g=(await db.doc('classes/puyo-test/games/live-score').get()).data();assert.equal(g.puyo.matches[0].result.scores['student-a'],777);assert.equal(g.puyo.matches[0].result.winner,'student-a');
assert.equal((await db.doc('classes/puyo-test/xp/student-a').get()).data().xp,67);
assert.equal((await db.doc('classes/puyo-test/games/live-score/puyoStates/student-a').get()).data().score,777);
console.log('PASS last realtime scores decide the result and persist even without a Firestore checkpoint; +10 XP once');
})().then(async()=>{await Promise.all(apps.map(deleteApp));process.exit(0)}).catch(e=>{console.error(e);process.exit(1)});
