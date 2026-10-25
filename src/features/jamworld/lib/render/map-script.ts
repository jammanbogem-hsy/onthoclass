import { validateScriptActions, type ScriptAction, type ScriptContext, type ScriptEvent } from "../world/script-scene";
import { parseEffects, type ZoneEffects } from "../world/effects";

// Executes only in a Worker owned by an opaque, network-disabled iframe.
const WORKER = `
(()=>{
const send=globalThis.postMessage.bind(globalThis);
for(const key of ['postMessage','Worker','importScripts'])Object.defineProperty(globalThis,key,{value:undefined,writable:false,configurable:false});
let handlers={enter:[],leave:[],update:[],interact:[],choice:[],quiz:[],key:[],arrive:[]}, previous=new Set(), commands=[], timers=[], now=0, launched=0;
const add=(kind,name,fn)=>{if(typeof fn!=='function'||handlers[kind].length>=32)throw Error('이벤트를 확인해 주세요');handlers[kind].push({name,fn});};
const emit=(kind,value,ms=1000)=>{if(commands.length>=32)throw Error('한 번에 요청할 수 있는 동작은 32개예요');commands.push({kind,value,ms});};
const World=Object.freeze({
 onEnter:(name,fn)=>add('enter',name,fn),onLeave:(name,fn)=>add('leave',name,fn),onUpdate:fn=>add('update',null,fn),
 onInteract:(name,fn)=>add('interact',name,fn),onChoice:(name,fn)=>add('choice',name,fn),onQuiz:fn=>add('quiz',null,fn),
 shake:(v,ms)=>emit('shake',v,ms),reverseControls:(v,ms)=>emit('reverseControls',v,ms),vision:(v,ms)=>emit('vision',v,ms),speed:(v,ms)=>emit('speed',v,ms),message:(v,ms)=>emit('message',v,ms),
 hud:(id,label,value)=>emit('hud',{id,label,value}),choose:(id,title,choices)=>emit('choose',{id,title,choices}),object:(id,patch)=>emit('object',{id,patch}),teleport:(x,y)=>emit('teleport',{x,y}),completeQuiz:(id,label)=>emit('completeQuiz',{id,label}),
 onKey:(name,fn)=>add('key',String(name),fn),onArrive:(id,fn)=>add('arrive',String(id),fn),
 after:(ms,fn)=>timer(ms,fn,0),every:(ms,fn)=>timer(ms,fn,Math.max(100,+ms||0)),cancel:id=>{timers=timers.filter(t=>t.id!==id);},
 button:(id,label)=>emit('button',{id,label}),animate:(id,type,ms)=>emit('animate',{id,type,ms:ms===undefined?1500:ms}),
 launch:(id,o)=>{o=o||{};emit('launch',{id,from:o.from,to:o.to,ms:o.ms===undefined?1000:o.ms,sprite:o.sprite===undefined?'⚾':String(o.sprite),arc:o.arc,size:o.size});launched++;},
 effect:(type,x,y)=>emit('effect',{type,x,y}),sound:name=>emit('sound',{name})
});
let nextTimer=1;
const timer=(ms,fn,repeat)=>{if(typeof fn!=='function'||!(+ms>=0)||timers.length>=64)throw Error('타이머를 확인해 주세요');const id=nextTimer++;timers.push({id,at:now+(+ms)/1000,fn,repeat});return id;};
const reply=type=>{send({type,commands,bindings:handlers.interact.map(h=>h.name)});commands=[];};
addEventListener('message',e=>{if(!e.isTrusted)return;try{
 const d=e.data;
 if(d.type==='init'){Function('World','"use strict";\\n'+d.source)(World);reply('ready');return;}
 if(d.type!=='tick')return;
 const ctx=Object.freeze({...d.context,zones:Object.freeze(d.context.zones),objects:Object.freeze((d.context.objects||[]).map(o=>Object.freeze(o)))}),current=new Set(ctx.zones);
 for(const h of handlers.enter)if(current.has(h.name)&&!previous.has(h.name))h.fn(ctx);
 for(const h of handlers.leave)if(!current.has(h.name)&&previous.has(h.name))h.fn(ctx);
 for(const ev of d.events||[]){for(const h of handlers[ev.kind]||[]){
  if(ev.kind==='interact'&&[ev.value.id,ev.value.name,ev.value.assetId].includes(h.name))h.fn(ctx,ev.value);
  else if(ev.kind==='choice'&&h.name===ev.name)h.fn(ev.value,ctx);
  else if(ev.kind==='quiz')h.fn(ev.value,ctx);
  else if(ev.kind==='key'&&(h.name==='*'||[ev.name,ev.value].some(k=>typeof k==='string'&&k.toLowerCase()===h.name.toLowerCase())))h.fn(ctx,ev.name);
  else if(ev.kind==='arrive'&&h.name===ev.name)h.fn(ctx,ev.value);
 }}
 now=ctx.time;
 for(const t of timers.filter(t=>t.at<=now)){if(t.repeat)t.at=now+t.repeat/1000;else timers=timers.filter(x=>x!==t);t.fn(ctx);}
 for(const h of handlers.update)h.fn(ctx);
 previous=current;reply('effects');
 }catch(e){send({type:'error',message:String(e.message||e).slice(0,150)});}});
})();
`;
const BOOTSTRAP = `let worker,nonce;onmessage=e=>{if(e.source!==parent)return;const d=e.data;if(d.type==='dispose'){worker?.terminate();return;}if(d.type==='init'&&!worker){nonce=d.nonce;worker=new Worker(URL.createObjectURL(new Blob([${JSON.stringify(WORKER)}],{type:'text/javascript'})));worker.onmessage=e=>parent.postMessage({channel:nonce,payload:e.data},'*');worker.onerror=()=>parent.postMessage({channel:nonce,payload:{type:'error',message:'코드를 실행하지 못했어요'}},'*');worker.postMessage({type:'init',source:d.source});}else if(d.type==='tick')worker?.postMessage(d);};`;

export class MapScriptRuntime {
  get isReady() { return this.ready && !this.stopped; }
  private frame: HTMLIFrameElement;
  private nonce = crypto.randomUUID();
  private ready = false;
  private busy = false;
  private stopped = false;
  private lastTick = -1000;
  private timer: ReturnType<typeof setTimeout> | undefined;
  bindings: string[] = [];
  private events: ScriptEvent[] = [];
  private actions: ScriptAction[] = [];
  private values = new Map<
    keyof ZoneEffects,
    { value: unknown; until: number }
  >();
  constructor(
    source: string,
    private onError: (message: string) => void,
  ) {
    this.frame = document.createElement("iframe");
    this.frame.setAttribute("sandbox", "allow-scripts");
    this.frame.setAttribute("aria-hidden", "true");
    this.frame.style.display = "none";
    this.frame.referrerPolicy = "no-referrer";
    this.frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; frame-src 'none'; img-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none'"><script>${BOOTSTRAP.replace(/<\/script/gi, "<\\/script")}</script>`;
    this.frame.onload = () => {
      if (!this.stopped)
        this.frame.contentWindow?.postMessage(
          { type: "init", nonce: this.nonce, source },
          "*",
        );
    };
    window.addEventListener("message", this.receive);
    document.body.appendChild(this.frame);
    this.timer = setTimeout(
      () => this.fail("맵 코드 준비 시간이 초과됐어요"),
      2500,
    );
  }
  private receive = (event: MessageEvent) => {
    if (
      this.stopped ||
      event.source !== this.frame.contentWindow ||
      event.data?.channel !== this.nonce
    )
      return;
    const data = event.data.payload;
    if (data?.type === "error") {
      this.fail(
        typeof data.message === "string"
          ? data.message.slice(0, 150)
          : "맵 코드를 확인해 주세요",
      );
      return;
    }
    if (data?.type !== "ready" && data?.type !== "effects") return;
    if (
      (data.type === "ready" && this.ready) ||
      (data.type === "effects" && !this.busy)
    )
      return;
    clearTimeout(this.timer);
    this.ready = true;
    this.busy = false;
    if (data.type === "effects" || data.type === "ready") {
      if (!Array.isArray(data.bindings) || data.bindings.length > 32 || data.bindings.some((b: unknown) => typeof b !== "string" || b.length > 120)) { this.fail("상호작용 대상을 확인해 주세요"); return; }
      this.bindings = data.bindings;
      if (!Array.isArray(data.commands) || data.commands.length > 32) {
        this.fail("맵 효과 요청이 너무 많아요");
        return;
      }
      try {
        const actions: ScriptAction[] = data.commands.filter((c: ScriptAction) => ["hud", "choose", "object", "teleport", "completeQuiz", "button", "animate", "launch", "effect", "sound"].includes(c.kind));
        validateScriptActions(actions);
        if (this.actions.length + actions.length > 64) throw Error("맵 동작이 너무 많이 쌓였어요");
        for (const cmd of data.commands) {
          if (actions.includes(cmd)) continue;
          const clean = parseEffects({ [cmd.kind]: cmd.value });
          if (
            typeof cmd.ms !== "number" ||
            !Number.isFinite(cmd.ms) ||
            cmd.ms < 100 ||
            cmd.ms > 10000
          )
            throw new Error("효과 시간은 100~10000ms 사이여야 해요");
          for (const [key, value] of Object.entries(clean))
            this.values.set(key as keyof ZoneEffects, {
              value,
              until: performance.now() + cmd.ms,
            });
        }
        this.actions.push(...actions);
      } catch (e) {
        this.fail(e instanceof Error ? e.message : "맵 효과를 확인해 주세요");
      }
    }
  };
  event(event: ScriptEvent) { if (!this.stopped && this.events.length < 16) this.events.push(event); }
  drainActions() { const actions = this.actions; this.actions = []; return actions; }
  tick(context: ScriptContext) {
    const now = performance.now();
    if (!this.ready || this.busy || this.stopped || now - this.lastTick < 100)
      return;
    this.lastTick = now;
    this.busy = true;
    const events = this.events; this.events = [];
    this.frame.contentWindow?.postMessage({ type: "tick", context, events }, "*");
    this.timer = setTimeout(
      () => this.fail("맵 코드 실행 시간이 초과됐어요"),
      350,
    );
  }
  effects(): ZoneEffects {
    const now = performance.now(),
      out: Record<string, unknown> = {};
    for (const [key, entry] of this.values) {
      if (entry.until > now) out[key] = entry.value;
      else this.values.delete(key);
    }
    return out as ZoneEffects;
  }
  private fail(message: string) {
    this.dispose();
    this.onError(message);
  }
  dispose() {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.timer);
    this.values.clear();
    this.events = []; this.actions = []; this.bindings = [];
    this.frame.contentWindow?.postMessage({ type: "dispose" }, "*");
    window.removeEventListener("message", this.receive);
    this.frame.remove();
  }
}
