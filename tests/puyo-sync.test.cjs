const test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const exportsEngine={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/puyo-engine.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsEngine,require,Math,Set,JSON});
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/puyo-sync.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:out,require:()=>exportsEngine,setTimeout,clearTimeout,performance});
const {PuyoPublisher}=out,delay=ms=>new Promise(r=>setTimeout(r,ms));
test('slow writes coalesce to newest state without overlapping or losing sequence',async()=>{
 const s=exportsEngine.createState(1),writes=[];let inFlight=0,peak=0;
 const p=new PuyoPublisher({seq:7,snapshot:()=>s,write:async(state,seq)=>{peak=Math.max(peak,++inFlight);writes.push({score:state.score,seq});await delay(110);inFlight--},saved:()=>{},error:()=>assert.fail('write failed')});
 p.request(true);await delay(15);for(let i=1;i<=20;i++){s.score=i;p.request(true)}
 await delay(260);p.dispose();assert.equal(peak,1);assert.deepEqual(writes,[{score:0,seq:8},{score:20,seq:9}]);
});
test('retry keeps sequence; disposal and disabled snapshots send nothing',async()=>{
 const s=exportsEngine.createState(1);const seqs=[];let errors=0,enabled=true;
 const p=new PuyoPublisher({seq:0,snapshot:()=>enabled?s:null,write:async(_,seq)=>{seqs.push(seq);if(seqs.length===1)throw Error('offline')},saved:()=>{},error:()=>errors++});
 p.request(true);await delay(15);p.request(true);await delay(15);enabled=false;p.request(true);await delay(15);p.dispose();enabled=true;p.request(true);await delay(15);
 assert.deepEqual(seqs,[1,1]);assert.equal(errors,1);
});
test('urgent chain attack bypasses ordinary input throttle',async()=>{
 const s=exportsEngine.createState(1),times=[];
 const p=new PuyoPublisher({seq:0,snapshot:()=>s,write:async()=>times.push(performance.now()),saved:()=>{},error:()=>{}});
 p.request();await delay(10);s.sent=8;p.request(true);await delay(25);p.dispose();assert.equal(times.length,2);assert.ok(times[1]-times[0]<70);
});
test('unacknowledged local state survives reload but other games and stale snapshots do not',()=>{
 const values=new Map(),storage={setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k)||null};
 const s=exportsEngine.createState(21);s.score=123;
 out.cachePuyo(storage,'class/game/student',s,10000);
 assert.equal(out.restorePuyo(storage,'class/game/student',9000,11000).score,123);
 assert.equal(out.restorePuyo(storage,'class/other/student',9000,11000),null);
 assert.equal(out.restorePuyo(storage,'class/game/student',11000,11000),null);
 assert.equal(out.restorePuyo(storage,'class/game/student',9000,1000000),null);
 values.set('puyo-recovery','broken');assert.equal(out.restorePuyo(storage,'class/game/student',0,11000),null);
});
test('live ticker sends on change and on a 2s heartbeat only, not every tick',async()=>{const E=exportsEngine;const s=E.createState(3);let sent=0;const realNow=performance.now.bind(performance);let fake=0;const perf={now:()=>fake};
const o={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/puyo-sync.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:o,require:()=>exportsEngine,setTimeout,clearTimeout,setInterval,clearInterval,performance:perf});
const stop=o.startLiveTicker(()=>s,()=>sent++,10);
await delay(60);assert.equal(sent,1,'first look sends once, then nothing while unchanged');
E.input(s,'left');await delay(30);assert.equal(sent,2,'a move is sent');
await delay(60);assert.equal(sent,2,'no repeats while still');
fake+=2001;await delay(30);assert.equal(sent,3,'heartbeat after 2s');
stop();void realNow;});
