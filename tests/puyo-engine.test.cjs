const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function load(file) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,Math,Set,Map,JSON});return exports; }
const E=load('src/lib/puyo-engine.ts');const L=load('functions/src/puyoLogic.ts');
const cell=(x,y)=>y*6+x;
test('equal seeds give equal pieces, garbage does not change sequence',()=>{const a=E.createState(9),b=E.createState(9);E.receive(a,12);E.input(a,'drop');E.input(b,'drop');E.tick(a,600);E.tick(b,600);assert.deepEqual(a.next,b.next);assert.equal(a.rng,b.rng);});
test('four orthogonal cells clear, diagonals and nuisance never form groups',()=>{const s=E.createState(1);[0,7,14,21].forEach(i=>s.board[i]=1);assert.equal(E.groups(s.board).length,0);s.board.fill(0);[72,73,74,75].forEach(i=>s.board[i]=2);assert.equal(E.groups(s.board)[0].length,4);s.board.fill(5);assert.equal(E.groups(s.board).length,0);});
test('falling after red clear causes blue second chain and all clear bonus',()=>{const s=E.createState(1);s.active=null;s.phase='settle';s.timer=1;for(let x=0;x<3;x++)s.board[cell(x,12)]=2;for(let x=3;x<6;x++)s.board[cell(x,12)]=1;s.board[cell(3,11)]=1;s.board[cell(3,10)]=2;E.tick(s,1800);assert.equal(s.maxChain,2);assert.equal(s.cleared,8);assert.equal(s.score,2460);assert.equal(s.board.filter(Boolean).length,0);assert.equal(s.sent,35);});
test('only directly adjacent nuisance clears and attacks offset pending garbage',()=>{const s=E.createState(1);s.active=null;s.phase='settle';s.timer=1;[72,73,74,75].forEach(i=>s.board[i]=1);s.board[76]=5;s.board[77]=5;s.pending=5;s.remainder=40;E.tick(s,20);assert.ok(s.clearing.includes(76));assert.ok(!s.clearing.includes(77));assert.equal(s.pending,4);assert.equal(s.sent,0);});
test('receive cumulative attacks is idempotent and only 30 nuisance drop at once',()=>{const s=E.createState(1);E.receive(s,35);E.receive(s,35);assert.equal(s.pending,35);s.active=null;s.phase='settle';s.timer=1;E.tick(s,20);assert.equal(s.board.filter(x=>x===5).length,30);assert.equal(s.pending,5);});
test('wall kicks keep rotation in the board and hard drop locks two cells',()=>{const s=E.createState(1);s.active.x=0;E.input(s,'ccw');assert.ok(E.fits(s,s.active));assert.equal(s.active.r,3);E.input(s,'drop');assert.equal(s.board.filter(Boolean).length,2);assert.equal(s.active,null);});
test('blocked spawn loses and ignores further input',()=>{const s=E.createState(1);s.active=null;s.phase='settle';s.timer=1;for(let y=0;y<13;y++)s.board[cell(2,y)]=5;E.tick(s,20);assert.equal(s.phase,'over');const before=JSON.stringify(s);E.input(s,'drop');assert.equal(JSON.stringify(s),before);});
test('odd roster includes teacher once, even roster excludes teacher; nobody repeats',()=>{assert.deepEqual([...L.pairPlayers(['a'],'t',()=>.3).flat()].sort(),['a','t']);const all=[...L.pairPlayers(['a','b','b'],'t',()=>.4).flat()].sort();assert.deepEqual(all,['a','b']);assert.throws(()=>L.pairPlayers([],'t',()=>0));});
test('server resolves topout, deadline scores and ties; a disconnect never ends a match early',()=>{const m={a:'a',b:'b',id:'m1',seed:1,result:null};const fresh=at=>({toMillis:()=>at});assert.equal(L.decide(m,{lost:true,score:99},{score:1},10000,0,20000,false).winner,'b');assert.equal(L.decide(m,{score:50},{score:10},22000,0,20000,false).winner,'a');assert.equal(L.decide(m,{score:10},{score:10},22000,0,20000,false).winner,null);assert.equal(L.decide(m,{at:fresh(1)},{at:fresh(30000)},30000,0,60000,false),null);assert.equal(L.decide(m,{at:fresh(1),score:5},{at:fresh(30000),score:3},62000,0,60000,false).winner,'a');assert.equal(L.decide(m,{at:fresh(1000)},{at:fresh(1000)},1001,0,60000,false),null);});

test('peer snapshots reject malformed boards without crashing a receiver', () => {
  const s = E.createState(2741);
  assert.equal(JSON.stringify(E.parseState(JSON.stringify(s))), JSON.stringify(s));
  for (const value of ['', '{}', 'null', 'broken', JSON.stringify({...s, board: [1]}), JSON.stringify({...s, active: {...s.active, r: 9}}), JSON.stringify({...s, next: [1, 2]})]) assert.equal(E.parseState(value), null);
});

test('class battle revive clears a topped-out board and keeps score, attacks and the shared sequence',()=>{const s=E.createState(5);const twin=E.createState(5);s.score=900;s.sent=7;s.seen=3;s.pending=12;s.board.fill(2);s.phase='over';s.active=null;const next=[...s.next],rng=s.rng;E.revive(s);assert.equal(s.downs,1);assert.equal(s.board.filter(Boolean).length,0);assert.equal(s.pending,0);assert.equal(s.score,900);assert.equal(s.sent,7);assert.equal(s.seen,3);assert.equal(s.effect,'revive');assert.ok(E.parseState(JSON.stringify(s)));E.tick(s,1000);assert.equal(s.phase,'fall');assert.ok(s.active);assert.equal(s.active.a,next[0]);assert.equal(s.active.b,next[1]);assert.notEqual(s.rng,undefined);void rng;void twin;});
test('revive does nothing unless the board is over',()=>{const s=E.createState(5);const before=JSON.stringify(s);E.revive(s);assert.equal(JSON.stringify(s),before);});
test('drops record how far cells fell: garbage from above, chain falls, and the landed pair',()=>{
  const s=E.createState(1);s.active=null;s.phase='settle';s.timer=1;s.pending=6;E.tick(s,20);
  assert.equal(s.effect,'garbage');const g=[];for(let k=0;k<s.drops.length;k+=2)g.push([s.drops[k],s.drops[k+1]]);
  assert.equal(g.length,6);for(const [i,d] of g){assert.equal(s.board[i],5);assert.equal(d,Math.floor(i/6)+1);}
  const t=E.createState(1);t.active=null;t.phase='settle';t.timer=1;[72,73,74,75].forEach(i=>t.board[i]=1);t.board[66]=2;E.tick(t,20);E.tick(t,500);
  assert.equal(t.effect,'fall');assert.deepEqual(Array.from(t.drops),[72,1]);
  const u=E.createState(1);E.input(u,'drop');E.tick(u,1);assert.equal(u.effect,'land');assert.equal(u.drops.length,4);assert.ok(E.parseState(JSON.stringify(u)));
});
test('garbage never fills the hidden row and overflow is discarded instead of ending the board',()=>{
  const s=E.createState(3);s.active=null;s.phase='settle';s.timer=1;
  for(let y=1;y<13;y++){s.board[y*6]=5;s.board[y*6+1]=5;}
  s.pending=12;E.tick(s,20);
  assert.notEqual(s.phase,'over');for(let x=0;x<6;x++)assert.equal(s.board[x],0,'hidden row stays empty');
});
test('quick turn flips a vertical pair stuck in a one-wide well',()=>{
  const s=E.createState(3);for(let y=3;y<13;y++){s.board[y*6+1]=5;s.board[y*6+3]=5;}s.active={x:2,y:5,r:0,a:1,b:2};
  E.input(s,'cw');assert.equal(s.active.r,2);assert.equal(s.active.x,2);
});
