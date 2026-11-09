// 전국 강태공 대결 — 학생 화면의 서버 연결(서버: functions/src/fishingShare.ts 의 ktApi 하나)
// 학생은 구글 계정 없이 방 코드 + 이름으로 들어온다 → 입장권 st(이 기기 localStorage) → 모든 요청에 붙인다
// game.js 가 쓰는 것: NET, initNet, saveCatch, refresh, gate, quizNeeded, askQuiz, closeQuiz, quizOpen, LOOK_PAL, serverNow, phaseNow, hasTicket, renderLobby, bindJoin, endTest
import { FB } from "./fb-config.js";

const V = "12.13.0";
const K_ST = "ktfish-st", K_INFO = "ktfish-info";
let ST = null; try { ST = localStorage.getItem(K_ST); } catch {}
export const LOOK_PAL = {
  coat: ["#f4c21c", "#e0483c", "#3d7be0", "#4caf50", "#9b59d0", "#ff8fb8", "#f4f1e8", "#33343f"],
  boots: ["#3aa0c8", "#e0483c", "#f4c21c", "#4caf50", "#ff8fb8", "#8a5a2b", "#f4f1e8", "#33343f"],
  hat: ["#6b7a2a", "#e0483c", "#3d7be0", "#f4c21c", "#9b59d0", "#ff8fb8", "#f4f1e8", "#33343f"],
  hair: ["#3b2618", "#141414", "#8a5a2b", "#e8c05a", "#c0492b", "#7d8db0", "#ff8fb8", "#f4f1e8"],
};
export const NET = { ready: false, failed: false, role: "", room: null, players: [], skew: 0, me: null, bag: [], roomName: "", school: null };
let fn = null, hooks = {};
const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function sdk() {
  if (fn) return fn;
  const [{ initializeApp }, Fn] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-functions.js`),
  ]);
  const app = initializeApp(FB, "ktfish"), fns = Fn.getFunctions(app, "asia-northeast3"), api = Fn.httpsCallable(fns, "ktApi", { timeout: 30000 });
  fn = (op, data) => api({ ...data, op }).then((r) => r.data);
  return fn;
}
const msgOf = (e, d = "잠깐 문제가 생겼어요") => e?.message?.replace(/^.*?: /, "") || d;
// quiet: 실패해도 알림을 띄우지 않는다(폴링 등)
export async function call(op, data = {}, quiet = false) {
  try { return await (await sdk())(op, ST ? { ...data, st: ST } : data); }
  catch (e) {
    if (e?.code === "functions/unauthenticated" && ST) { setST(null); NET.role = ""; NET.me = null; NET.room = null; changed(); }
    if (!quiet) hooks.toast?.(msgOf(e)); throw e;
  }
}
// 오류는 자동으로(한 번 열 때 5개까지), 의견은 직접 → 관리자 화면
let errN = 0; const errSeen = new Set();
function reportErr(msg, stack) {
  if (errN >= 5 || errSeen.has(msg)) return; errSeen.add(msg); errN++;
  sdk().then((f) => f("report", { kind: "error", msg, stack: String(stack || ""), url: location.href, ua: navigator.userAgent, ...(ST ? { st: ST } : {}) })).catch(() => {});
}
addEventListener("error", (e) => reportErr(String(e.message || "오류"), e.error?.stack || `${e.filename}:${e.lineno}:${e.colno}`));
addEventListener("unhandledrejection", (e) => { const r = e.reason; if (r?.code?.startsWith?.("functions/")) return; reportErr(`Promise: ${r?.message || r}`, r?.stack); });
export async function sendFeedback(msg) { await call("report", { kind: "feedback", msg, url: location.href, ua: navigator.userAgent }); }

const changed = () => { hooks.onProfile?.(NET.me); hooks.onGate?.(); };
function setST(v) { ST = v; try { if (v) localStorage.setItem(K_ST, v); else localStorage.removeItem(K_ST); } catch {} }
const keepSkew = (r, t0) => { if (r?.now) NET.skew = r.now - (t0 + Date.now()) / 2; };
function takeMe(r) { NET.role = "student"; NET.me = r.me; NET.room = r.room; NET.roomName = r.roomName; NET.school = r.school; try { localStorage.setItem(K_INFO, JSON.stringify({ roomName: r.roomName, school: r.school })); } catch {} }

// hooks: { toast, sample, onProfile, onGate, onLobby, weather }
export async function initNet(h) {
  hooks = h;
  if (ST) {
    try { const t0 = Date.now(), r = await call("stuMe", {}, true); takeMe(r); keepSkew(r.room, t0); }
    catch (e) { if (e?.code !== "functions/unauthenticated") NET.failed = !navigator.onLine; }
  }
  NET.ready = true; changed(); hooks.onLobby?.();
}
export const serverNow = () => Date.now() + (NET.skew || 0);
// 대기실 단계: closed · lobby · countdown · play · done · free
export function phaseNow(r = NET.room) {
  if (!r?.open || r.closesAt < serverNow()) return "closed";
  if (r.mode === "free" || r.phase === "free") return "free";
  if (r.phase === "lobby" || r.phase === "closed") return r.phase;
  const n = serverNow(); return n < r.startAt ? "countdown" : n < r.endAt ? "play" : "done";
}
export const hasTicket = () => !!ST;
export function gate() {
  if (!NET.ready) return { ok: false, why: "확인 중…" };
  if (NET.role === "student") {
    const ph = phaseNow(), r = NET.room;
    if (ph === "free") return { ok: true, room: r, free: true };
    if (ph === "play" || (ph === "done" && serverNow() < r.endAt + 25e3)) return { ok: true, room: r };
    return { ok: false, why: ph === "closed" ? "선생님이 방을 열면 대기실에 들어가요" : "선생님이 시작하면 다 같이 낚시해요" };
  }
  return { ok: false, why: "방 코드로 들어오면 낚시할 수 있어요" };
}
// 학생: 방 상태를 자주 묻는다(대기실 2.5초, 한 판 중 5초). 10초마다 "나 여기 있어요"
let lastHere = 0;
const roomKey = (r) => JSON.stringify(r ? [r.open, r.closesAt, r.phase, r.round, r.startAt, r.endAt, r.place, r.roundSec, r.quizOn, r.quizN, r.mode] : null);
async function pollRoom() {
  let wait = 6000;
  if (NET.role === "student" && ST && !document.hidden) {
    const ph = phaseNow(); wait = ph === "play" ? 5000 : 2500;
    try {
      const here = Date.now() - lastHere > 9000, t0 = Date.now();
      const r = await call("room", { here }, true);
      if (here) lastHere = Date.now();
      keepSkew(r.room, t0);
      const was = roomKey(NET.room), wasP = JSON.stringify(NET.players);
      NET.room = r.room; NET.players = r.players || [];
      if (roomKey(r.room) !== was) hooks.onGate?.();
      if (roomKey(r.room) !== was || JSON.stringify(NET.players) !== wasP) hooks.onLobby?.();
    } catch {}
  }
  setTimeout(pollRoom, wait);
}
setTimeout(pollRoom, 1500);
setInterval(() => { if (NET.role === "student") hooks.onGate?.(); }, 30000);

// ---------------------------------------------------------------- 문제(선생님이 문제 세트를 고른 방)
let TEST = null;
export const endTest = () => { TEST = null; };
export const quizNeeded = () => TEST ? TEST.quiz.length > 0 : NET.role === "student" && !!NET.room?.quizOn && (NET.room.quiz?.length || 0) > 0;
let quizCool = 0, quizKey = null, quizT = 0;
// 세트를 1번부터 끝까지 한 번씩, 다 풀면 다시 1번부터(새로고침해도 이어서). 문제가 바뀌면 1번부터
function nextQi(qs) {
  let h = 5381; for (const q of qs) for (let i = 0; i < q.q.length; i++) h = (h * 33 + q.q.charCodeAt(i)) | 0;
  const key = `${qs.length}:${h}`;
  let st = null; try { st = JSON.parse(localStorage.getItem("ktfish-qpos") || "null"); } catch {}
  const i = st?.key === key && st.i >= 0 ? st.i % qs.length : 0;
  try { localStorage.setItem("ktfish-qpos", JSON.stringify({ key, i: (i + 1) % qs.length })); } catch {}
  return i;
}
export const quizOpen = () => !$("quizBox").hidden;
export function askQuiz(onPass, { ctx = "cast", onFail } = {}) {
  if (ctx === "cast" && Date.now() < quizCool) { hooks.toast?.("잠깐! 조금 뒤에 다시 풀어요"); return; }
  closeQuiz();
  const qs = TEST?.quiz.length ? TEST.quiz : NET.room.quiz, qi = nextQi(qs), q = qs[qi], el = $("quizBox");
  el.hidden = false; el.classList.toggle("fightq", ctx === "fight");
  el.querySelector(".qtag").textContent = ctx === "fight" ? "물고기가 버텨요! 맞히면 계속 감고, 틀리면 놓쳐요" : "문제를 맞히면 던질 수 있어요";
  el.querySelector(".qq").textContent = q.q;
  el.querySelector(".qo").innerHTML = q.o.map((o, i) => `<button class="go alt" data-qi="${i}"><i>${i + 1}</i> ${esc(o)}</button>`).join("");
  const done = (i) => {
    closeQuiz(true);
    const ok = i === q.a, btns = el.querySelectorAll("[data-qi]");
    btns.forEach((b, k) => { b.disabled = true; b.classList.toggle("right", k === q.a); b.classList.toggle("wrong", k === i && !ok); });
    hooks.sample?.(ok ? "perfect" : "miss");
    el.querySelector(".qmsg").textContent = ok ? (ctx === "fight" ? "정답! 계속 감아요 · 낭만 +1" : "정답! 이제 던질 수 있어요 · 낭만 +1") : `아쉬워요! 정답은 ${q.a + 1}번${ctx === "fight" ? "이에요. 물고기가 도망가요" : "이에요"}`;
    if (!TEST && NET.role === "student" && ST) call("quiz", { qi, pick: i, ctx }, true).catch(() => {});
    quizT = setTimeout(() => { quizT = 0; el.hidden = true; el.querySelector(".qmsg").textContent = ""; if (ok) onPass(); else if (onFail) onFail(); else quizCool = Date.now() + 2500; }, ok ? 700 : 1600);
  };
  quizKey = (e) => { const n = +e.key; if (n >= 1 && n <= q.o.length) { e.preventDefault(); e.stopPropagation(); done(n - 1); } };
  addEventListener("keydown", quizKey, true);
  el.querySelectorAll("[data-qi]").forEach((b) => b.addEventListener("click", () => done(+b.dataset.qi)));
}
export function closeQuiz(keepBox) {
  if (quizKey) { removeEventListener("keydown", quizKey, true); quizKey = null; }
  if (keepBox) return;
  clearTimeout(quizT); quizT = 0;
  const el = $("quizBox"); if (el) { el.hidden = true; el.querySelector(".qmsg").textContent = ""; }
}

// ---------------------------------------------------------------- 입장·나가기
export async function checkCode(code) { return call("codeCheck", { code }); }
export async function join(code, name, base) {
  const r = await call("join", { code, name, base, ...(ST ? { st: ST } : {}) });
  setST(r.st);
  const t0 = Date.now(), me = await call("stuMe"); takeMe(me); keepSkew(me.room, t0);
  NET.ready = true; lastHere = 0; changed(); hooks.onLobby?.();
  hooks.toast?.(`${esc(r.name)}, 어서 와요! ${r.school?.name ? esc(r.school.name) + " 대표 강태공이에요" : ""}`);
}
export async function leave() {
  const st = ST; setST(null);
  Object.assign(NET, { role: "", me: null, room: null, players: [], roomName: "", school: null });
  if (st) (await sdk())("leave", { st }).catch(() => {});
  changed(); hooks.onLobby?.();
}
// 잡은 물고기(게임이 부른다). 실패해도 게임은 계속
export async function saveCatch(sp, cm, kg, run, pts) {
  if (!NET.me) return null;
  try {
    const r = await call("catch", { sp, cm, kg, run, pts, weather: hooks.weather?.() }, true);
    NET.me.taste += r.taste; NET.me.caught++; NET.me.romance = (NET.me.romance || 0) + r.romance;
    return r;
  } catch (e) { if (e?.code === "functions/failed-precondition") hooks.toast?.(msgOf(e)); return null; }
}
export const refresh = async () => { if (ST) { try { const r = await call("stuMe", {}, true); takeMe(r); hooks.onGate?.(); } catch {} } };

// ---------------------------------------------------------------- 학생: 입장(코드 → 이름·캐릭터)과 대기실
const CHIP_COL = ["#ffd23f", "#3ec7ff", "#9cf25a", "#ff6bb5", "#b26bff", "#ff9f43", "#5ee0c0", "#ff4d6d"];
const chipCol = (n) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CHIP_COL[h % CHIP_COL.length]; };
const joinStep = (n) => $("joinSteps")?.querySelectorAll("li").forEach((li, i) => { li.className = i < n ? "done" : i === n ? "now" : ""; });
export function bindJoin() {
  const f1 = $("joinCode"), f2 = $("joinWho");
  let code = "", base = 0;
  try { base = +localStorage.getItem("ktfish-base") === 1 ? 1 : 0; } catch {}
  const setBase = (b) => { base = b; f2.querySelectorAll("[data-base]").forEach((x) => x.setAttribute("aria-pressed", String(+x.dataset.base === b))); try { localStorage.setItem("ktfish-base", String(b)); } catch {} };
  setBase(base);
  f2.querySelectorAll("[data-base]").forEach((x) => x.addEventListener("click", () => setBase(+x.dataset.base)));
  const pre = new URLSearchParams(location.search).get("code"); if (pre) f1.code.value = pre.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  f1.code.addEventListener("input", () => { f1.code.value = f1.code.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); });
  f1.addEventListener("submit", async (e) => {
    e.preventDefault(); const b = f1.querySelector("button.go"), v = f1.code.value.trim();
    if (v.length !== 6) { hooks.toast?.("방 코드 6자리를 모두 넣어 주세요"); f1.code.focus(); return; }
    b.disabled = true; b.textContent = "확인하는 중…";
    try { const r = await checkCode(v); code = r.code; $("joinCls").innerHTML = `<b>${esc(r.school || "")}</b><span>${esc(r.name || "대결 방")}</span>`; f1.hidden = true; f2.hidden = false; joinStep(1); setTimeout(() => f2.name.focus(), 50); } catch {}
    b.disabled = false; b.textContent = "다음";
  });
  f2.addEventListener("submit", (e) => {
    e.preventDefault(); const b = f2.querySelector("button.go");
    if (!f2.name.value.trim()) { hooks.toast?.("이름을 써 주세요"); f2.name.focus(); return; }
    b.disabled = true; b.textContent = "들어가는 중…";
    join(code, f2.name.value, base).catch(() => {}).finally(() => { b.disabled = false; b.textContent = "들어가기"; });
  });
  $("joinBack").addEventListener("click", () => { f2.hidden = true; f1.hidden = false; joinStep(0); f1.code.focus(); });
  $("lobLeave")?.addEventListener("click", () => { if (confirmLeave()) leave(); });
  if (f1.code.value.length === 6 && !ST) f1.requestSubmit(); // 선생님 링크·QR로 왔으면 코드 단계는 건너뛴다
}
function confirmLeave() { const b = $("lobLeave"); if (b.dataset.sure) return true; b.dataset.sure = "1"; b.textContent = "한 번 더 누르면 나가요"; setTimeout(() => { delete b.dataset.sure; b.textContent = "다른 방으로 가기"; }, 2500); return false; }
export function renderLobby() {
  const ph = phaseNow(), r = NET.room, me = NET.me?.name;
  $("lobClass").innerHTML = `${NET.school?.name ? `<b>${esc(NET.school.name)}</b> · ` : ""}${esc(NET.roomName || "")} · ${esc(me || "")}`;
  const P0 = r?.place === "sea" ? "바다" : "민물";
  const T = { closed: ["방이 아직 닫혀 있어요", "선생님이 방을 열면 저절로 대기실로 바뀌어요"], lobby: ["대기실", `선생님이 시작하면 다 같이 ${P0} 낚시를 해요${r?.quizOn ? " · 문제를 맞히면 던질 수 있어요" : ""}`], countdown: ["곧 시작해요!", "준비!"], play: ["대결 중", "낚시터로 들어가요…"], done: ["이번 판 끝!", "전국 순위를 보며 다음 판을 기다려요"], free: ["자유시간!", "낚시터를 골라 원하는 만큼 낚시해요"] }[ph];
  $("lobTitle").textContent = T[0]; $("lobMsg").textContent = T[1];
  $("lobby").dataset.ph = ph;
  const P = ph === "closed" ? [] : NET.players || [];
  $("lobCount").textContent = ph === "closed" ? "" : `들어온 친구 ${P.length}명`;
  const seen = renderLobby.seen ??= new Set();
  $("lobPlayers").innerHTML = P.map((n) => `<span class="hchip ${n === me ? "me" : ""} ${seen.has(n) ? "old" : ""}" style="--c:${chipCol(n)}">${esc(n)}</span>`).join("");
  P.forEach((n) => seen.add(n));
  const m = NET.me; $("lobMe").innerHTML = m ? `<span><small>내 손맛</small><b>${(m.taste || 0).toLocaleString("ko-KR")}</b></span><span><small>마리</small><b>${m.caught || 0}</b></span><span><small>낭만</small><b>${m.romance || 0}</b></span>` : "";
  $("lobPlaces").hidden = ph !== "free";
  $("lobGo").hidden = ph !== "free";
  $("lobPractice").hidden = !(ph === "lobby" || ph === "done" || ph === "closed");
}
