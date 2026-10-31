// 로그인 + 수산시장·낚시 가게·캠핑 요리·옷장 (서버: functions/src/fishing.ts)
// 세 점수: 손맛 점수(잡은 물고기) · 돈(팔아서) · 낭만 점수(옷차림·장식·요리)
// Firebase SDK는 게임이 뜬 뒤에 불러온다.
// 누가 낚시할 수 있나: 교사(러닝크루 교사 계정)·최고 관리자는 언제나, 학생은 선생님이 방을 열었을 때만(gate)
import { FB } from "./fb-config.js";

const V = "12.13.0";
// 계정: 학생(학급 코드+이름+입장번호 → 입장권 st, localStorage) 또는 구글(선생님·누구나)
let ST = null; try { ST = localStorage.getItem("jamfish-st"); } catch {}
// 생김새 팔레트(서버는 번호 0~7만 저장). 0번이 원래 색
export const LOOK_PAL = {
  coat: ["#f4c21c", "#e0483c", "#3d7be0", "#4caf50", "#9b59d0", "#ff8fb8", "#f4f1e8", "#33343f"],
  boots: ["#3aa0c8", "#e0483c", "#f4c21c", "#4caf50", "#ff8fb8", "#8a5a2b", "#f4f1e8", "#33343f"],
  hat: ["#6b7a2a", "#e0483c", "#3d7be0", "#f4c21c", "#9b59d0", "#ff8fb8", "#f4f1e8", "#33343f"],
  hair: ["#3b2618", "#141414", "#8a5a2b", "#e8c05a", "#c0492b", "#7d8db0", "#ff8fb8", "#f4f1e8"],
};
export const NET = { ready: false, failed: false, role: "", room: null, players: [], skew: 0, user: null, student: null, me: null, bag: [], market: {}, rods: [], shop: {}, recipes: {}, day: "" };
let api = null, hooks = {};
const $ = (id) => document.getElementById(id);
const won = (n) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function sdk() {
  if (api) return api;
  const [{ initializeApp }, A, Fn] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-functions.js`),
  ]);
  const app = initializeApp(FB), auth = A.getAuth(app), fns = Fn.getFunctions(app, "asia-northeast3");
  api = { A, auth, call: (name, data) => Fn.httpsCallable(fns, name)(data).then((r) => r.data) };
  return api;
}
export async function call(name, data = {}) {
  try { return await (await sdk()).call(name, ST ? { ...data, st: ST } : data); }
  catch (e) { const msg = e?.message?.replace(/^.*?: /, "") || "잠깐 문제가 생겼어요"; hooks.toast?.(msg); throw e; }
}
// 오류는 자동으로(한 번 열 때 5개까지, 같은 건 한 번), 의견은 직접 써서 보낸다 → 최고 관리자가 본다
const ADMIN_EMAIL = "jammanbogem@gmail.com"; // 화면 표시용. 실제 권한은 서버가 이메일로 검사
let errN = 0; const errSeen = new Set();
function reportErr(msg, stack) {
  if (errN >= 5 || errSeen.has(msg)) return; errSeen.add(msg); errN++;
  sdk().then((a) => a.call("fishReport", { kind: "error", msg, stack: String(stack || ""), url: location.href, ua: navigator.userAgent, ...(ST ? { st: ST } : {}) })).catch(() => {});
}
addEventListener("error", (e) => reportErr(String(e.message || "오류"), e.error?.stack || `${e.filename}:${e.lineno}:${e.colno}`));
addEventListener("unhandledrejection", (e) => { const r = e.reason; if (r?.code?.startsWith?.("functions/")) return; reportErr(`Promise: ${r?.message || r}`, r?.stack); });
export async function sendFeedback(msg) { await call("fishReport", { kind: "feedback", msg, url: location.href, ua: navigator.userAgent }); }
const isAdminView = () => !NET.student && (NET.user?.email || "").toLowerCase() === ADMIN_EMAIL;
let ADM = null, ADMC = {}, admOpen = "";
const changed = () => { renderAcct(); hooks.onProfile?.(NET.me); hooks.onGate?.(); if (!$("town").hidden) renderTown(); };

// hooks: { SPECIES, fishThumb, toast, sample, onProfile }
export async function initNet(h) {
  hooks = h;
  renderAcct();
  try {
    const { A, auth } = await sdk();
    A.getRedirectResult(auth).catch(() => {});
    A.onAuthStateChanged(auth, async (u) => {
      NET.user = u;
      if (ST) { // 학생 입장권이 먼저
        try { const t0 = Date.now(); Object.assign(NET, await (await sdk()).call("fishMe", { st: ST })); keepSkew(NET.room, t0); NET.student = { name: NET.me.name, className: (() => { try { return localStorage.getItem("jamfish-class") || ""; } catch { return ""; } })() }; }
        catch { setST(null); NET.student = null; }
      }
      if (!ST && u) { try { Object.assign(NET, await call("fishMe")); } catch {} } else if (!ST) Object.assign(NET, { me: null, bag: [] });
      NET.ready = true; changed();
    });
  } catch { NET.ready = true; NET.failed = true; renderAcct(); hooks.onGate?.(); }
}
// 서버 시계(학생마다 시계가 달라도 같은 순간에 시작·끝나게)
export const serverNow = () => Date.now() + (NET.skew || 0);
const keepSkew = (r, t0) => { if (r?.now) NET.skew = r.now - (t0 + Date.now()) / 2; };
// 대기실 단계: closed(닫힘) · lobby(대기실) · countdown(곧 시작) · play(한 판 중) · done(끝, 다음 판 기다림)
export function phaseNow(r = NET.room) {
  if (!r?.open || r.closesAt < serverNow()) return "closed";
  if (r.mode === "free" || r.phase === "free") return "free"; // 자유 낚시: 열려 있는 동안 언제든 여러 판
  if (r.phase === "lobby" || r.phase === "closed") return r.phase;
  const n = serverNow(); return n < r.startAt ? "countdown" : n < r.endAt ? "play" : "done";
}
export const hasTicket = () => !!ST;
// 지금 낚시할 수 있는지와 그 이유. 서버에 아예 못 닿으면(학교망이 막는 등) 막지 않는다
export function gate() {
  if (NET.failed) return { ok: true };
  if (!NET.ready) return { ok: false, why: "로그인 확인 중…" };
  if (NET.role === "teacher" || NET.role === "admin") return { ok: true, free: true };
  if (NET.role === "student") {
    const ph = phaseNow(), r = NET.room;
    if (ph === "free") return { ok: true, room: r, free: true };
    if (ph === "play" || (ph === "done" && serverNow() < r.endAt + 25e3)) return { ok: true, room: r }; // 끝난 직후 싸우던 물고기는 마저
    return { ok: false, why: ph === "closed" ? "선생님이 낚시터를 열면 대기실에 들어가요" : "선생님이 시작하면 다 같이 낚시해요" };
  }
  if (NET.user) return { ok: false, why: "학생은 학급 코드로 입장해요 (선생님은 러닝크루 교사 계정으로 로그인)" };
  return { ok: false, why: "학급 코드로 입장하면 낚시할 수 있어요" };
}
// 학생: 방 상태를 자주 묻는다(대기실·카운트다운은 2.5초, 한 판 중은 5초). 10초마다 "나 여기 있어요"
let lastHere = 0;
const roomKey = (r) => JSON.stringify(r ? [r.open, r.closesAt, r.phase, r.round, r.startAt, r.endAt, r.place, r.roundSec, r.quizOn, r.quizN] : null);
async function pollRoom() {
  let wait = 6000;
  if (NET.role === "student" && ST && !document.hidden) {
    const ph = phaseNow(); wait = ph === "play" ? 5000 : 2500;
    try {
      const here = Date.now() - lastHere > 9000, t0 = Date.now();
      const r = await (await sdk()).call("fishRoom", { st: ST, here });
      if (here) lastHere = Date.now();
      keepSkew(r.room, t0);
      const was = roomKey(NET.room), wasP = JSON.stringify(NET.players);
      NET.room = r.room; NET.players = r.players || [];
      if (roomKey(r.room) !== was) { renderAcct(); hooks.onGate?.(); }
      if (roomKey(r.room) !== was || JSON.stringify(NET.players) !== wasP) hooks.onLobby?.();
    } catch {}
  }
  setTimeout(pollRoom, wait);
}
setTimeout(pollRoom, 1500);
setInterval(() => { if (NET.role === "student") { renderAcct(); hooks.onGate?.(); } }, 30000); // 남은 시간 표시
// 던지기 전 문제(선생님이 문제를 올리고 켜 두었을 때)
export const quizNeeded = () => NET.role === "student" && !!NET.room?.quizOn && (NET.room.quiz?.length || 0) > 0;
let quizCool = 0;
export function askQuiz(onPass) {
  if (Date.now() < quizCool) { hooks.toast?.("잠깐! 조금 뒤에 다시 풀어요"); return; }
  const qs = NET.room.quiz, q = qs[Math.floor(Math.random() * qs.length)], el = $("quizBox");
  el.hidden = false;
  el.querySelector(".qq").textContent = q.q;
  el.querySelector(".qo").innerHTML = q.o.map((o, i) => `<button class="go alt" data-qi="${i}"><i>${i + 1}</i> ${esc(o)}</button>`).join("");
  const done = (i) => {
    removeEventListener("keydown", key, true);
    const ok = i === q.a, btns = el.querySelectorAll("[data-qi]");
    btns.forEach((b, k) => { b.disabled = true; b.classList.toggle("right", k === q.a); b.classList.toggle("wrong", k === i && !ok); });
    hooks.sample?.(ok ? "perfect" : "miss");
    el.querySelector(".qmsg").textContent = ok ? "정답! 이제 던질 수 있어요" : `아쉬워요! 정답은 ${q.a + 1}번`;
    setTimeout(() => { el.hidden = true; el.querySelector(".qmsg").textContent = ""; if (ok) onPass(); else quizCool = Date.now() + 2500; }, ok ? 700 : 1600);
  };
  const key = (e) => { const n = +e.key; if (n >= 1 && n <= q.o.length) { e.preventDefault(); e.stopPropagation(); done(n - 1); } };
  addEventListener("keydown", key, true);
  el.querySelectorAll("[data-qi]").forEach((b) => b.addEventListener("click", () => done(+b.dataset.qi)));
}
function setST(v, cls = "") { ST = v; try { if (v) { localStorage.setItem("jamfish-st", v); localStorage.setItem("jamfish-class", cls); } else { localStorage.removeItem("jamfish-st"); localStorage.removeItem("jamfish-class"); } } catch {} }
// 학생 입장 1단계: 학급 코드 확인(학급 이름을 돌려받는다)
export async function checkCode(code) { return (await sdk()).call("fishCodeCheck", { code }).catch((e) => { hooks.toast?.(e?.message?.replace(/^.*?: /, "") || "코드를 확인하지 못했어요"); throw e; }); }
// 학생 입장: 학급 코드 + 이름 + 입장번호 4자리
export async function join(code, name, pin) {
  const r = await (await sdk()).call("fishJoin", { code, name, pin }).catch((e) => { hooks.toast?.(e?.message?.replace(/^.*?: /, "") || "입장하지 못했어요"); throw e; });
  setST(r.st, r.className); NET.student = { name: r.name, className: r.className };
  const t0 = Date.now(); Object.assign(NET, await call("fishMe")); keepSkew(NET.room, t0); NET.ready = true; lastHere = 0; changed(); hooks.onLobby?.();
  hooks.toast?.(`${r.className} ${r.name}, 어서 와요!`);
}
export async function leave() { const st = ST; setST(null); NET.student = null; NET.role = ""; NET.room = null; NET.players = []; try { await (await sdk()).call("fishLeave", { st }); } catch {} Object.assign(NET, { me: null, bag: [] }); if (NET.user) { try { Object.assign(NET, await call("fishMe")); } catch {} } changed(); }
export async function login() {
  const { A, auth } = await sdk(), p = new A.GoogleAuthProvider();
  try { await A.signInWithPopup(auth, p); }
  catch (e) { if (e?.code === "auth/popup-blocked" || e?.code === "auth/operation-not-supported-in-this-environment") await A.signInWithRedirect(auth, p); else if (e?.code !== "auth/popup-closed-by-user" && e?.code !== "auth/cancelled-popup-request") hooks.toast?.("로그인하지 못했어요. 선생님께 알려 주세요"); }
}
export async function logout() { if (ST) return leave(); const { A, auth } = await sdk(); await A.signOut(auth); }

// 잡은 물고기를 살림망에(게임이 부른다). 실패해도 게임은 계속
export async function saveCatch(sp, cm, kg, run, pts) {
  if (!NET.me) return null;
  if (NET.me.bagN == null) NET.me.bagN = NET.bag.length;
  try {
    const r = await call("fishCatch", { sp, cm, kg, run, pts });
    NET.me.taste += r.taste; NET.me.caught++;
    if (r.saved) NET.me.bagN = (NET.me.bagN || NET.bag.length) + 1;
    renderAcct();
    return r;
  } catch { return null; }
}
export const refresh = async () => { if (ST || NET.user) { Object.assign(NET, await call("fishMe")); changed(); } };

// 학생 전용 주소(/fish/student 또는 /student). 지금 주소의 폴더 기준
export const studentUrl = (code = "") => location.origin + location.pathname.replace(/student\/?$/, "").replace(/[^/]*$/, "") + "student" + (code ? `?code=${code}` : "");
const PLACE_NAME = { fresh: "민물", sea: "바다", any: "민물" };
function roomLine() {
  const r = NET.room, ph = phaseNow();
  if (ph === "closed") return `<div class="roomline wait">선생님이 낚시터를 열 때까지 기다려요… <small>(저절로 확인해요)</small></div>`;
  return `<div class="roomline open">${{ lobby: "대기실", countdown: "곧 시작!", play: "대회 중", done: "이번 판 끝", free: "자유시간" }[ph]} · ${ph === "free" ? "낚시터는 내가 골라요" : PLACE_NAME[r.place]} · 한 판 ${Math.round(r.roundSec / 60)}분${r.quizOn ? " · 문제 풀고 던지기" : ""}</div>`;
}
// ---------------------------------------------------------------- 시작·끝 화면의 계정 칸
export function renderAcct() {
  const info = document.getElementById("charInfo");
  if (info) {
    const m = NET.me, worn = m ? Object.values(m.wear || {}).filter(Boolean).map((k) => `${art(k)} ${esc(NET.shop[k]?.name || "")}`) : [];
    info.innerHTML = m ? `<b>${esc(m.name)}</b><small>${worn.length ? worn.join(" · ") : "아직 기본 차림이에요"}</small>` : `<b>내 낚시꾼</b><small>학급으로 입장하면 옷·악세서리·색을 바꿀 수 있어요</small>`;
    document.querySelectorAll("[data-closet]").forEach((btn) => { btn.disabled = !m; });
  }
  document.querySelectorAll("[data-acct]").forEach((box) => {
    if (!NET.ready) { box.innerHTML = `<p class="acctwait">로그인 확인 중…</p>`; return; }
    if (!NET.me) {
      box.innerHTML = `<a class="go studentcta" href="${studentUrl()}">학생 입장하기 <small>학급 코드 입력 ▶</small></a>
        <p>선생님이 알려 준 학급 코드 6자리와 이름, 입장번호 4자리로 들어와요. 들어오면 대기실에서 친구들을 기다렸다가 다 같이 시작해요.</p>
        <button class="acctout" data-login>선생님이세요? 구글로 로그인해 낚시 학급 만들기</button>`;
    } else {
      const m = NET.me, who = NET.student ? `${esc(NET.student.className)} · ${esc(m.name)}` : esc(m.name);
      box.innerHTML = `<div class="acctrow"><b class="acctname">${who}</b>${!NET.student ? `<button class="acctout" data-town="class">낚시 학급 관리</button>` : ""}${isAdminView() ? `<button class="acctout" data-town="admin">관리자</button>` : ""}<button class="acctout" data-logout>${NET.student ? "나가기" : "로그아웃"}</button></div>
        ${NET.student ? roomLine() : ""}
        <div class="scores3"><div><small>손맛 점수</small><b>${(m.taste || 0).toLocaleString("ko-KR")}</b></div><div><small>돈</small><b class="money">${won(m.money || 0)}</b></div><div><small>낭만 점수</small><b class="romance">${(m.romance || 0).toLocaleString("ko-KR")}</b></div></div>
        <div class="townbtns"><button class="go alt" data-town="market">수산시장${NET.bag.length ? ` <i>${NET.bag.length}</i>` : ""}</button><button class="go alt" data-town="shop">낚시 가게</button><button class="go alt" data-town="cook">캠핑 요리</button></div>`;
    }
    box.insertAdjacentHTML("beforeend", `<button class="acctout fbopen" data-feedback>의견·오류 알리기</button>`);
    box.querySelector("[data-feedback]").addEventListener("click", openFeedback);
    box.querySelector("[data-login]")?.addEventListener("click", login);
    box.querySelector("[data-logout]")?.addEventListener("click", logout);
    box.querySelectorAll("[data-town]").forEach((b) => b.addEventListener("click", () => openTown(b.dataset.town)));
    if (!NET.student && (NET.role === "teacher" || NET.role === "admin") && !CLASSES) loadClasses(); // 선생님은 학급 목록을 미리 받아 둔다(함수도 깨워 둠)
  });
}

// ---------------------------------------------------------------- 마을(수산시장·가게·요리·옷장)
let tab = "market", pick = new Set(), cooking = null, busy = false;
document.addEventListener("click", (e) => { if (e.target.closest?.("[data-closet]") && NET.me) openTown("closet"); });
export async function openTown(t = "market") {
  tab = t; pick = new Set(); cooking = null; if (t === "class") loadClasses(); if (t === "admin") { ADM = null; ADMC = {}; }
  $("town").hidden = false; renderTown();
  try { Object.assign(NET, await call("fishMe")); renderTown(); renderAcct(); } catch {}
}
const TABS = { market: "수산시장", shop: "낚시 가게", cook: "캠핑 요리", closet: "꾸미기" };
let CLASSES = null, classLoading = null;
// 학급 목록: 있던 것을 바로 보여 주고 뒤에서 새로 받아 맞춘다(함수가 잠들어 있으면 몇 초 걸리니까)
function loadClasses() {
  return classLoading ??= call("fishClassList").then((r) => { CLASSES = r.classes; if (tab === "class" && !$("town").hidden) renderTown(); }).catch(() => {}).finally(() => { classLoading = null; });
}
const RECIPE_OK = {
  ramen: () => true, seafoodRamen: (f, S) => S[f.sp]?.water === "sea", gui: (f) => ["월척", "S급", "A급"].includes(f.grade),
  maeuntang: (f, S) => S[f.sp]?.water === "fresh", haemultang: (f, S) => S[f.sp]?.water === "sea", hoe: (f, S) => ["전설", "보스"].includes(S[f.sp]?.tier),
};
// 요리마다 하는 말과 연출: 탕·라면은 냄비, 구이는 석쇠, 회는 도마
const COOK = { gui: { verb: "굽기", done: "구움", sound: "지글지글…", art: "grill" }, hoe: { verb: "뜨기", done: "뜸", sound: "슥슥 써는 중…", art: "board" } };
const cookOf = (k) => COOK[k] || { verb: "끓이기", done: "끓임", sound: "보글보글…", art: "pot" };
const FOOD_ART = { ramen: "🍜", seafoodRamen: "🍜", gui: "🐟", maeuntang: "🍲", haemultang: "🦀", hoe: "🍣" };
// 옷·장식은 3D 모델을 찍은 그림(assets/avatar/thumb), 그 밖(라면·낚싯대)은 이모지
const THUMB = new Set(["hat_bucket","hat_straw","hat_beanie","hat_pirate","crown","cap","flower","bunny","glasses","roundglasses","mustache","backpack","flag","wings","cape","chair","fire","cooler","lantern","cat","vest","scarf"]);
const art = (k) => THUMB.has(k) ? `<img class="ia" src="assets/avatar/thumb/${k}.webp?v=3" alt="">` : (SHOP_ART[k] || "🎁");
const SHOP_ART = { hat_straw: "👒", hat_beanie: "🧶", glasses: "🕶️", vest: "🦺", hat_pirate: "🏴‍☠️", crown: "👑", chair: "🪑", fire: "🔥", ramen: "🍜",
  cap: "🧢", flower: "🌸", bunny: "🐰", roundglasses: "👓", mustache: "🥸", scarf: "🧣", cape: "🦸", backpack: "🎒", flag: "🚩", wings: "🪽", cooler: "🧊", lantern: "🏮", cat: "🐈" };
const LOOK_LABEL = { coat: "비옷", boots: "장화", hat: "벙거지", hair: "머리카락" };

function fishRow(f, on, extra = "") {
  const S = hooks.SPECIES[f.sp] || {};
  return `<button class="fishrow ${on ? "on" : ""}" data-fid="${f.id}" ${extra}><img alt="" src="${hooks.fishThumb(f.sp)}"><span><b>${esc(S.name || f.sp)}</b><small>${esc(f.grade)} · ${f.cm}cm · ${kgText(f.kg)}</small></span><em>${won(f.price)}</em></button>`;
}
const kgText = (kg) => (kg >= 100 ? `${Math.round(kg)}kg` : kg >= 1 ? `${kg.toFixed(1)}kg` : `${Math.round(kg * 1000)}g`);

export function renderTown() {
  const m = NET.me; if (!m) { $("townBody").innerHTML = `<p class="empty">로그인이 필요해요.</p>`; return; }
  const tabs = { ...TABS, ...(NET.user && !NET.student ? { class: "낚시 학급" } : {}), ...(isAdminView() ? { admin: "관리자" } : {}) };
  $("townTabs").innerHTML = Object.entries(tabs).map(([k, v]) => `<button class="go ${k === tab ? "" : "alt"}" data-tab="${k}">${v}</button>`).join("");
  $("townTabs").querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; pick = new Set(); cooking = null; renderTown(); }));
  $("townScores").innerHTML = `<span>손맛 <b>${m.taste.toLocaleString("ko-KR")}</b></span><span>돈 <b class="money">${won(m.money)}</b></span><span>낭만 <b class="romance">${m.romance.toLocaleString("ko-KR")}</b></span>`;
  const body = $("townBody"), S = hooks.SPECIES;
  if (tab === "market") {
    const tops = Object.entries(NET.market).filter(([id]) => S[id] && S[id].points).sort((a, b) => b[1] - a[1]);
    const total = NET.bag.reduce((t, f) => t + f.price, 0), picked = NET.bag.filter((f) => pick.has(f.id)).reduce((t, f) => t + f.price, 0);
    body.innerHTML = `<div class="mkt"><h3>오늘의 시세 <small>${NET.day} · 날마다 바뀌어요</small></h3>
        <div class="ticker">${tops.map(([id, k]) => `<span class="${k >= 1.15 ? "up" : k <= .85 ? "down" : ""}">${esc(S[id].name)} <b>×${k.toFixed(2)}</b>${k >= 1.15 ? " ▲" : k <= .85 ? " ▼" : ""}</span>`).join("")}</div></div>
      <h3>살림망 <small>${NET.bag.length} / 40마리 · 모두 팔면 ${won(total)}</small></h3>
      ${NET.bag.length ? `<div class="fishlist">${NET.bag.map((f) => fishRow(f, pick.has(f.id))).join("")}</div>
        <div class="townact"><button class="go" data-sell="pick" ${pick.size ? "" : "disabled"}>고른 ${pick.size}마리 팔기 (${won(picked)})</button><button class="go alt" data-sell="all">전부 팔기</button></div>`
      : `<p class="empty">살림망이 비었어요. 낚시하러 가요! 잡은 물고기(놔주자급 빼고)가 여기 들어와요.</p>`}`;
    body.querySelectorAll("[data-fid]").forEach((b) => b.addEventListener("click", () => { const id = b.dataset.fid; pick.has(id) ? pick.delete(id) : pick.add(id); renderTown(); }));
    body.querySelectorAll("[data-sell]").forEach((b) => b.addEventListener("click", () => sell(b.dataset.sell === "all" ? "all" : [...pick])));
  } else if (tab === "shop") {
    const next = NET.rods[m.rod], cur = NET.rods[m.rod - 1];
    body.innerHTML = `<h3>낚싯대 <small>지금: Lv.${m.rod} ${esc(cur?.name || "")}</small></h3>
      <div class="rods">${NET.rods.map((r) => `<div class="rod ${r.lv <= m.rod ? "have" : ""}"><b>Lv.${r.lv} ${esc(r.name)}</b><small>${esc(r.desc)}</small><em>${r.lv <= m.rod ? "보유" : won(r.price)}</em></div>`).join("")}</div>
      ${next ? `<div class="townact"><button class="go" data-buy="rod" ${m.money >= next.price ? "" : "disabled"}>Lv.${next.lv} ${esc(next.name)}로 바꾸기 (${won(next.price)})</button></div>` : `<p class="empty">최고의 낚싯대를 갖고 있어요!</p>`}
      <h3>옷·장식·재료 <small>옷과 장식은 처음 살 때 낭만 점수가 올라요</small></h3>
      <div class="shopgrid">${Object.entries(NET.shop).map(([k, it]) => {
        const own = it.kind !== "stock" && m.own[k], n = it.kind === "stock" ? m.stock[k] || 0 : 0;
        return `<div class="item ${own ? "have" : ""}"><i>${art(k)}</i><b>${esc(it.name)}</b><small>${esc(it.desc)}${it.romance ? ` · 낭만 +${it.romance}` : ""}${it.kind === "stock" ? ` · ${n}개 있음` : ""}</small>
          ${own ? `<em>보유</em>` : `<button class="go ${m.money >= it.price ? "" : "alt"}" data-buy="${k}" ${m.money >= it.price ? "" : "disabled"}>${won(it.price)}</button>`}</div>`;
      }).join("")}</div>`;
    body.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => buy(b.dataset.buy)));
  } else if (tab === "cook") {
    if (cooking) {
      const r = NET.recipes[cooking], ok = NET.bag.filter((f) => RECIPE_OK[cooking](f, S));
      body.innerHTML = `<h3>${FOOD_ART[cooking]} ${esc(r.name)} <small>${esc(r.desc)} · 물고기 ${r.fish}마리 골라요</small></h3>
        ${ok.length ? `<div class="fishlist">${ok.map((f) => fishRow(f, pick.has(f.id))).join("")}</div>` : `<p class="empty">이 요리에 쓸 물고기가 살림망에 없어요.</p>`}
        <div class="townact"><button class="go" data-cookgo ${pick.size === r.fish && (m.stock.ramen || 0) >= r.ramen ? "" : "disabled"}>${esc(r.name)} ${cookOf(cooking).verb} (${pick.size}/${r.fish})</button><button class="go alt" data-cookback>뒤로</button></div>`;
      body.querySelectorAll("[data-fid]").forEach((b) => b.addEventListener("click", () => { const id = b.dataset.fid; if (pick.has(id)) pick.delete(id); else if (pick.size < r.fish) pick.add(id); renderTown(); }));
      body.querySelector("[data-cookgo]")?.addEventListener("click", () => cook(cooking, [...pick]));
      body.querySelector("[data-cookback]").addEventListener("click", () => { cooking = null; pick = new Set(); renderTown(); });
      return;
    }
    body.innerHTML = `<h3>캠핑 요리 <small>살림망 물고기로 요리해 낭만 점수를 올려요 · 라면 ${m.stock.ramen || 0}개</small></h3>
      <div class="shopgrid">${Object.entries(NET.recipes).map(([k, r]) => {
        const have = NET.bag.filter((f) => RECIPE_OK[k](f, S)).length, can = have >= r.fish && (m.stock.ramen || 0) >= r.ramen;
        return `<div class="item"><i>${FOOD_ART[k]}</i><b>${esc(r.name)}</b><small>${esc(r.desc)} · <span class="romance">낭만 +${r.romance}</span>${m.cooked[k] ? ` · ${m.cooked[k]}번 ${cookOf(k).done}` : ""}</small>
          <button class="go ${can ? "" : "alt"}" data-cook="${k}" ${can ? "" : "disabled"}>${can ? "요리하기" : r.ramen && !(m.stock.ramen || 0) ? "라면 없음" : "재료 부족"}</button></div>`;
      }).join("")}</div>`;
    body.querySelectorAll("[data-cook]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.cook; if (!NET.recipes[k].fish) return cook(k, []); cooking = k; pick = new Set(); renderTown(); }));
  } else if (tab === "admin") {
    if (!ADM) { body.innerHTML = `<p class="empty">불러오는 중…</p>`; call("fishAdmin", { action: "overview" }).then((r) => { ADM = r; renderTown(); }).catch(() => {}); return; }
    const errs = ADM.logs.filter((l) => l.kind === "error"), fbs = ADM.logs.filter((l) => l.kind === "feedback");
    const when = (t) => new Date(t).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const studN = ADM.classes.reduce((a, c) => a + c.students, 0);
    body.innerHTML = `<div class="admsum"><div><small>낚시꾼(계정)</small><b>${ADM.fishers}</b></div><div><small>낚시 학급</small><b>${ADM.classes.length}</b></div><div><small>학급 학생</small><b>${studN}</b></div><div><small>오류</small><b class="${errs.length ? "bad" : ""}">${errs.length}</b></div><div><small>의견(미확인)</small><b>${fbs.filter((f) => !f.done).length}</b></div></div>
      <div class="townact"><button class="go alt" data-admreload>새로고침</button></div>
      <h3>학급 <small>눌러서 학생 상황 보기</small></h3>
      <div class="admlist">${ADM.classes.map((c) => `<button class="admrow" data-admcls="${c.cid}"><b>${esc(c.name)}</b><span>${esc(c.teacherName || "-")}</span><em>${c.code}</em><span>${c.students}명</span><small>${c.createdAt ? when(c.createdAt) : ""}</small></button>
        ${admOpen === c.cid ? (ADMC[c.cid] ? `<div class="clstable admst"><div class="th"><span>이름</span><span>손맛</span><span>돈</span><span>낭만</span><span>잡은 수</span><span>살림망·낚싯대·상태</span></div>${[...ADMC[c.cid]].sort((a, b) => b.taste - a.taste).map((s) => `<div><span>${esc(s.name)}</span><span>${s.taste.toLocaleString("ko-KR")}</span><span class="money">${won(s.money)}</span><span class="romance">${s.romance}</span><span>${s.caught}</span><span>${s.bag}마리 · Lv.${s.rod}${s.locked ? " · 잠김" : ""}${!s.hasPin ? " · 번호 초기화됨" : ""}${s.lastCatchAt ? ` · 최근 ${when(s.lastCatchAt)}` : ""}</span></div>`).join("") || "<p class='empty'>학생 없음</p>"}</div>` : `<p class="empty">불러오는 중…</p>`) : ""}`).join("") || `<p class="empty">아직 학급이 없어요.</p>`}</div>
      <h3>의견 <small>${fbs.length}개</small></h3>
      <div class="admlogs">${fbs.map((l) => `<div class="admlog ${l.done ? "done" : ""}"><small>${when(l.at)} · ${esc(l.name || l.email || "익명")}</small><p>${esc(l.msg)}</p><button class="acctout" data-admdone="${l.id}:${l.done ? "" : "1"}">${l.done ? "확인 취소" : "확인함"}</button></div>`).join("") || `<p class="empty">아직 의견이 없어요.</p>`}</div>
      <h3>오류 로그 <small>${errs.length}개 · 학생 화면에서 난 오류가 자동으로 들어와요</small></h3>
      ${errs.length ? `<div class="townact"><button class="go alt" data-admclear>확인한 오류 로그 비우기</button></div>` : ""}
      <div class="admlogs">${errs.map((l) => `<div class="admlog err"><small>${when(l.at)} · ${esc(l.name || l.email || "로그인 전")} · ${esc((l.ua || "").replace(/^.*?\((.*?)\).*$/, "$1").slice(0, 60))}</small><p>${esc(l.msg)}</p>${l.stack ? `<details><summary>자세히</summary><pre>${esc(l.stack)}\n${esc(l.url || "")}</pre></details>` : ""}</div>`).join("") || `<p class="empty">오류가 없어요.</p>`}</div>`;
    body.querySelector("[data-admreload]").addEventListener("click", () => { ADM = null; ADMC = {}; renderTown(); });
    body.querySelectorAll("[data-admcls]").forEach((b) => b.addEventListener("click", () => { const cid = b.dataset.admcls; admOpen = admOpen === cid ? "" : cid; if (admOpen && !ADMC[cid]) call("fishAdmin", { action: "class", cid }).then((r) => { ADMC[cid] = r.students; renderTown(); }).catch(() => {}); renderTown(); }));
    body.querySelectorAll("[data-admdone]").forEach((b) => b.addEventListener("click", () => { const [id, d] = b.dataset.admdone.split(":"); act(async () => { await call("fishAdmin", { action: "done", id, done: !!d }); const l = ADM.logs.find((x) => x.id === id); if (l) l.done = !!d; renderTown(); }); }));
    body.querySelector("[data-admclear]")?.addEventListener("click", () => act(async () => { const r = await call("fishAdmin", { action: "clearErrors" }); hooks.toast?.(`오류 로그 ${r.removed}개를 비웠어요`); ADM = null; renderTown(); }));
  } else if (tab === "class") {
    if (!CLASSES) { body.innerHTML = `<p class="empty">학급을 불러오는 중…</p>`; loadClasses(); return; }
    if (NET.role !== "teacher" && NET.role !== "admin") { body.innerHTML = `<p class="empty">선생님 계정만 학급을 만들 수 있어요. 러닝크루에서 교사로 가입한 구글 계정으로 로그인해 주세요.</p>`; return; }
    body.innerHTML = `<h3>낚시 학급 <small>학생은 학급 코드 + 이름 + 입장번호 4자리로 들어와요(구글 계정 필요 없음). 학생은 선생님이 낚시터를 열었을 때만 낚시할 수 있어요</small></h3>
      <form class="joinf" data-newclass><input name="name" maxlength="12" placeholder="학급 이름 (예: 5학년 3반)"><button class="go">학급 만들기</button></form>
      ${CLASSES.length ? CLASSES.map((c) => `<div class="clsbox"><div class="clshead"><b>${esc(c.name)}</b><span>학급 코드 <em>${c.code}</em></span><small>${c.students.length}명</small></div>${roomBox(c)}
        ${c.students.length ? `<div class="clstable"><div class="th"><span>이름</span><span>손맛</span><span>돈</span><span>낭만</span><span>잡은 수</span><span></span></div>
          ${[...c.students].sort((a, b) => b.taste - a.taste).map((s) => `<div><span>${esc(s.name)}</span><span>${s.taste.toLocaleString("ko-KR")}</span><span class="money">${won(s.money)}</span><span class="romance">${s.romance}</span><span>${s.caught}</span><span><button class="acctout" data-reset="${c.cid}:${s.sid}">${s.hasPin ? "입장번호 초기화" : "초기화됨"}</button></span></div>`).join("")}</div>`
          : `<p class="empty">아직 들어온 학생이 없어요. 칠판에 코드 <b>${c.code}</b>를 적어 주세요.</p>`}</div>`).join("") : `<p class="empty">아직 만든 학급이 없어요.</p>`}`;
    body.querySelectorAll("[data-room]").forEach((box) => bindRoom(box));
    body.querySelector("[data-newclass]").addEventListener("submit", (e) => { e.preventDefault(); const btn = e.target.querySelector("button"); btn.disabled = true; btn.textContent = "만드는 중…";
      act(async () => { const r = await call("fishClassCreate", { name: e.target.name.value }); CLASSES = [...(CLASSES || []), { cid: r.cid, name: r.name, code: r.code, students: [], room: { open: false, closesAt: 0, place: "fresh", roundSec: 180, quizOn: false, quizN: 0 } }]; pop(r.code, "money", `${r.name} 학급 코드`); }).finally(renderTown); });
    body.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", () => { const [cid, sid] = b.dataset.reset.split(":"); b.disabled = true; b.textContent = "초기화 중…";
      act(async () => { await call("fishClassResetPin", { cid, sid }); const st = CLASSES?.find((c) => c.cid === cid)?.students.find((x) => x.sid === sid); if (st) st.hasPin = false; hooks.toast?.("초기화했어요. 학생이 다음에 들어올 때 새 번호를 정해요"); }).finally(renderTown); }));
  } else {
    const slots = { head: "머리", face: "얼굴", body: "몸", back: "등" }, L = m.look || {};
    body.innerHTML = `<div class="dress"><div class="dressav" data-avslot></div><div class="dressopt">
      <h3>생김새 <small>무료로 언제든 바꿔요</small></h3>
      <div class="closet"><b>캐릭터</b><div>${[["0", "남자"], ["1", "여자"]].map(([v, t]) => `<button class="go ${String(L.base || 0) === v ? "" : "alt"}" data-look="base:${v}">${t}</button>`).join("")}</div></div>
      ${Object.entries(LOOK_LABEL).map(([k, label]) => `<div class="closet"><b>${label}</b><div class="sw">${LOOK_PAL[k].map((c, i) => `<button class="swatch ${(L[k] || 0) === i ? "on" : ""}" style="--c:${c}" data-look="${k}:${i}" aria-label="${label} ${i + 1}번 색"></button>`).join("")}</div></div>`).join("")}
      <h3>옷·악세서리 <small>가게에서 산 것을 골라 입어요</small></h3>
      ${Object.entries(slots).map(([slot, label]) => {
        const items = Object.entries(NET.shop).filter(([k, it]) => it.slot === slot && m.own[k]);
        return `<div class="closet"><b>${label}</b><div>${items.length ? items.map(([k, it]) => `<button class="go ${m.wear[slot] === k ? "" : "alt"}" data-wear="${slot}:${k}">${art(k)} ${esc(it.name)}</button>`).join("") + `<button class="go alt" data-wear="${slot}:">벗기</button>` : `<small>가게에서 사 와요</small>`}</div></div>`;
      }).join("")}
      <h3>데크 장식</h3><div class="closet"><div>${Object.entries(NET.shop).filter(([, it]) => it.kind === "decor").map(([k, it]) => `<span class="deco ${m.own[k] ? "on" : ""}">${art(k)} ${esc(it.name)} ${m.own[k] ? "· 데크에 있어요" : "· 아직 없어요"}</span>`).join("")}</div></div>
      </div></div>`;
    hooks.mountAvatar?.(body.querySelector("[data-avslot]"));
    body.querySelectorAll("[data-wear]").forEach((b) => b.addEventListener("click", () => { const [slot, item] = b.dataset.wear.split(":"); wear(slot, item || null); }));
    body.querySelectorAll("[data-look]").forEach((b) => b.addEventListener("click", () => { const [k, i] = b.dataset.look.split(":"); setLook(k, +i); }));
  }
}
async function act(fn) { if (busy) { hooks.toast?.("앞에 누른 것을 처리하는 중이에요"); return; } busy = true; try { await fn(); } catch {} busy = false; }
// 판 것·산 것처럼 먼저 보여 주고, 서버 답이 오면 맞춘다(아직 다른 요청이 남아 있으면 화면 값을 그대로 둔다)
// 실패하면 서버에서 다시 받아 되돌린다. call() 이 실패 문구를 띄운다
let inflight = 0;
async function optimistic(apply, req, after) {
  apply(); changed(); inflight++;
  try { const r = await req(); inflight--; if (!inflight && r?.me) NET.me = r.me; after?.(r); }
  catch { inflight--; try { Object.assign(NET, await call("fishMe")); } catch {} }
  changed();
}
function sell(ids) {
  const list = ids === "all" ? NET.bag : NET.bag.filter((f) => ids.includes(f.id));
  if (!list.length) return;
  const gone = new Set(list.map((f) => f.id)), earned = list.reduce((t, f) => t + f.price, 0);
  hooks.sample?.("cash") || hooks.sample?.("ding"); pop(`+${won(earned)}`, "money", `${list.length}마리를 팔았어요!`);
  return optimistic(() => { NET.bag = NET.bag.filter((f) => !gone.has(f.id)); NET.me = { ...NET.me, money: NET.me.money + earned }; pick = new Set(); },
    () => call("fishSell", { ids: [...gone] }));
}
// 가게 물건을 산 뒤의 내 정보(서버 fishBuy 와 같은 규칙). 살 수 없으면 null
function bought(me, item) {
  if (item === "rod") { const next = NET.rods?.find((r) => r.lv === (me.rod || 1) + 1); return next && me.money >= next.price ? { ...me, money: me.money - next.price, rod: next.lv } : null; }
  const it = NET.shop?.[item]; if (!it || me.money < it.price) return null;
  if (it.kind === "stock") { const n = me.stock?.[item] || 0; return n >= 20 ? null : { ...me, money: me.money - it.price, stock: { ...me.stock, [item]: n + 1 } }; }
  if (me.own?.[item]) return null;
  return { ...me, money: me.money - it.price, romance: me.romance + it.romance, own: { ...me.own, [item]: true }, wear: it.kind === "wear" && it.slot ? { ...me.wear, [it.slot]: item } : me.wear };
}
function buy(item) {
  const next = bought(NET.me, item); if (!next) return;
  const gain = next.romance - NET.me.romance;
  hooks.sample?.("cash") || hooks.sample?.("ding");
  pop(item === "rod" ? `Lv.${next.rod}` : NET.shop[item]?.name || "", gain ? "romance" : "money", gain ? `낭만 +${gain}` : "샀어요!");
  return optimistic(() => { NET.me = next; }, () => call("fishBuy", { item }));
}
const wear = (slot, item) => optimistic(() => { const w = { ...NET.me.wear }; if (item) w[slot] = item; else delete w[slot]; NET.me = { ...NET.me, wear: w }; }, () => call("fishWear", { slot, item }));
// 생김새는 팔레트 번호만 바꾼다(무료). 여러 번 눌러도 마지막 것만 서버로
let lookT = null, lookQ = {};
function setLook(k, i) {
  NET.me = { ...NET.me, look: { ...NET.me.look, [k]: i } }; lookQ[k] = i; changed();
  clearTimeout(lookT); lookT = setTimeout(() => { const q = lookQ; lookQ = {}; optimistic(() => {}, () => call("fishLook", { look: q })); }, 400);
}
// 요리: 냄비 연출(1.6초) 동안 서버를 기다리지 않고 바로 재료를 빼고 낭만을 올린다
function cook(recipe, ids) {
  const r = NET.recipes[recipe], pot = $("cookPot"), gone = new Set(ids), C = cookOf(recipe);
  const ART = { pot: `<div class="pot"><i></i><i></i><i></i></div>`, grill: `<div class="grill"><em>🐟</em><s></s><i></i><i></i><i></i></div>`, board: `<div class="board"><em>🐟</em><u></u><span>🔪</span></div>` };
  pot.querySelector(".cookart").innerHTML = ART[C.art];
  pot.hidden = false; pot.querySelector("b").textContent = C.sound; pot.querySelector("small").textContent = r.name;
  hooks.sample?.("cook");
  setTimeout(() => {
    pot.querySelector("b").textContent = `${r.name} 완성!`; pot.querySelector("small").textContent = `낭만 +${r.romance}`;
    hooks.sample?.("mission") || hooks.sample?.("ding");
    setTimeout(() => { pot.hidden = true; }, 1500);
  }, 1600);
  return optimistic(() => {
    const m = NET.me; cooking = null; pick = new Set();
    NET.bag = NET.bag.filter((f) => !gone.has(f.id));
    NET.me = { ...m, romance: m.romance + r.romance, stock: { ...m.stock, ramen: (m.stock?.ramen || 0) - r.ramen }, cooked: { ...m.cooked, [recipe]: (m.cooked?.[recipe] || 0) + 1 } };
  }, () => call("fishCook", { recipe, ids }).catch((e) => { pot.hidden = true; throw e; }));
}
function pop(big, cls, small) {
  const el = $("townPop"); el.className = `townpop ${cls}`; el.innerHTML = `<b>${esc(big)}</b><small>${esc(small)}</small>`;
  el.hidden = false; el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; clearTimeout(pop.t); pop.t = setTimeout(() => { el.hidden = true; }, 1600);
}
document.addEventListener("click", (e) => { if (e.target.id === "townClose") $("town").hidden = true; });

// 의견 보내기 창
function openFeedback() {
  const el = $("fbBox"); el.hidden = false; const ta = el.querySelector("textarea"); ta.value = ""; setTimeout(() => ta.focus(), 50);
}
document.addEventListener("click", (e) => {
  if (e.target.id === "fbClose") $("fbBox").hidden = true;
  if (e.target.id === "fbSend") {
    const ta = $("fbBox").querySelector("textarea"), msg = ta.value.trim(); if (!msg) return;
    e.target.disabled = true;
    sendFeedback(msg).then(() => { $("fbBox").hidden = true; hooks.toast?.("고마워요! 선생님께 잘 전달했어요"); }).catch(() => {}).finally(() => { e.target.disabled = false; });
  }
});

// ---------------------------------------------------------------- 교사: 낚시터 방 열기·설정
// 고르기만 하고 아직 저장 안 한 설정: 학급 목록이 새로 와서 화면을 다시 그려도 고른 값이 그대로 남게(바다로 골랐는데 '학생이 고르기'로 열리던 문제)
const DRAFT = {};
function roomBox(c) {
  const r = { ...c.room, ...DRAFT[c.cid] }, open = c.room.open && c.room.closesAt > Date.now();
  const opt = (vals, cur) => vals.map(([v, t]) => `<option value="${v}" ${String(v) === String(cur) ? "selected" : ""}>${t}</option>`).join("");
  return `<div class="roombox ${open ? "open" : ""}" data-room="${c.cid}">
    <b>${open ? `낚시터 열림 · ${Math.ceil((r.closesAt - Date.now()) / 60000)}분 남음 · ${{ lobby: "대기실", countdown: "곧 시작", play: "대회 중", done: "한 판 끝", free: "자유 낚시" }[r.phase] || "대기실"}` : "낚시터 닫힘"}</b>
    <div class="roomset">
      <label title="이 시간이 지나면 낚시터가 저절로 닫혀요">열어 둘 시간 <small>(지나면 자동으로 닫힘)</small><select name="minutes">${opt([[20, "20분"], [40, "40분"], [60, "60분"], [90, "90분"]], r.minutes || 40)}</select></label>
      <label title="학생이 한 번 대회할 때 타이머 길이">한 판 시간 <small>(대회 한 번 타이머)</small><select name="roundSec">${opt([[120, "2분"], [180, "3분"], [300, "5분"], [600, "10분"]], r.roundSec)}</select></label>
      <label title="선생님이 정한 낚시터로 다 같이 해요. 자유시간에는 학생이 골라요">낚시터<select name="place">${opt([["fresh", "민물"], ["sea", "바다"]], r.place === "sea" ? "sea" : "fresh")}</select></label>
      <label class="chk freetog" title="켜면 학생이 낚시터를 골라 언제든 여러 판, 끄면 하던 낚시를 마치고 대기실로"><input type="checkbox" name="free" ${r.mode === "free" ? "checked" : ""}> 자유시간 <small>(학생이 골라 마음껏)</small></label>
    </div>
    <div class="roomquiz"><label class="chk"><input type="checkbox" name="quizOn" ${r.quizOn ? "checked" : ""}> 던지기 전에 문제 풀기</label>
      <span>문제 ${r.quizN}개</span><label class="go alt filebtn">CSV 올리기<input type="file" accept=".csv,text/csv" hidden></label><button class="acctout" data-tpl>양식 받기</button></div>
    <div class="townact">${open ? `<button class="go" data-host>대기실 화면 ▶</button><button class="go alt" data-roomsave>설정 바꾸기</button><button class="go alt" data-roomclose>낚시터 닫기</button>` : `<button class="go" data-roomopen>낚시터 열고 대기실 만들기</button><button class="go alt" data-roomsave>설정만 저장</button>`}</div>
    <small class="roomhow">학생은 <b>${esc(studentUrl().replace(/^https?:\/\//, ""))}</b> 에서 학급 코드로 들어와 대기실에서 기다려요. 다 들어오면 대기실 화면에서 <b>시작</b>을 눌러요. <b>자유시간</b>을 켜면 학생이 낚시터를 골라 마음껏, 끄면 모두 대기실로 돌아와요</small>
  </div>`;
}
const settings = (box) => ({ mode: box.querySelector("[name=free]").checked ? "free" : "contest", minutes: +box.querySelector("[name=minutes]").value, roundSec: +box.querySelector("[name=roundSec]").value, place: box.querySelector("[name=place]").value, quizOn: box.querySelector("[name=quizOn]").checked });
function bindRoom(box) {
  const cid = box.dataset.room, save = (extra) => {
    box.querySelectorAll("button").forEach((b) => { b.disabled = true; }); box.querySelector(".townact")?.insertAdjacentHTML("beforeend", `<small class="saving">저장 중…</small>`);
    return act(async () => { const r = await call("fishRoomSet", { cid, ...settings(box), ...extra }); delete DRAFT[cid]; const c = CLASSES?.find((x) => x.cid === cid); if (c && r?.room) c.room = r.room; }).finally(renderTown);
  };
  box.querySelectorAll(".roomset select, .roomset input, [name=quizOn]").forEach((x) => x.addEventListener("change", () => { DRAFT[cid] = settings(box); }));
  box.querySelector("[data-roomopen]")?.addEventListener("click", () => save({ open: true }).then(() => { const c = CLASSES?.find((x) => x.cid === cid); if (c?.room?.open) openHost(cid); }));
  box.querySelector("[data-host]")?.addEventListener("click", () => openHost(cid));
  box.querySelector("[data-roomclose]")?.addEventListener("click", () => save({ open: false }));
  box.querySelector("[data-roomsave]")?.addEventListener("click", () => save({}).then(() => hooks.toast?.("저장했어요")));
  box.querySelector("[data-tpl]").addEventListener("click", () => {
    const csv = "\ufeff문제,보기1,보기2,보기3,보기4,정답\n붕어는 어디에 살까요?,바다,민물,하늘,사막,2\n3 + 4 = ?,6,7,8,9,7\napple의 뜻은?,사과,배,포도,,1\n";
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "낚시터_문제_양식.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  box.querySelector("input[type=file]").addEventListener("change", async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const { quiz, bad } = parseQuizCsv(await f.text());
    if (!quiz.length) { hooks.toast?.("문제를 읽지 못했어요. 양식(문제,보기1~4,정답)을 확인해 주세요"); return; }
    await save({ quiz, quizOn: true });
    hooks.toast?.(`문제 ${quiz.length}개를 올렸어요${bad ? ` (읽지 못한 줄 ${bad}개)` : ""}`);
  });
}
// CSV: 문제,보기1,보기2,보기3,보기4,정답(번호 1~4 또는 보기 글자). 큰따옴표·쉼표 포함 칸 지원, 첫 줄 제목은 건너뜀
export function parseQuizCsv(text) {
  const rows = [], t = text.replace(/^\ufeff/, ""); let row = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  let bad = 0; const quiz = [];
  rows.forEach((r, k) => {
    const v = r.map((x) => x.trim());
    if (!v.some(Boolean)) return;
    if (k === 0 && /문제|question/i.test(v[0])) return;
    const opts = v.slice(1, -1).filter(Boolean), ans = v[v.length - 1];
    let a = /^\d+$/.test(ans) ? +ans - 1 : opts.indexOf(ans);
    if (/^\d+$/.test(ans) && opts.indexOf(ans) >= 0 && (+ans > opts.length || +ans < 1)) a = opts.indexOf(ans); // 정답이 숫자 보기인 경우
    if (!v[0] || opts.length < 2 || a < 0 || a >= opts.length) { bad++; return; }
    quiz.push({ q: v[0], o: opts, a });
  });
  return { quiz: quiz.slice(0, 300), bad };
}

// ---------------------------------------------------------------- 교사: 대기실 화면(블루킷처럼 칠판에 띄운다)
// 들어온 학생이 이름표로 뜨고, 다 오면 "시작" → 4초 카운트다운 → 모두 같은 시간에 한 판. 한 판 중에는 실시간 순위, 끝나면 시상대
let HOST = null;
const hnow = () => Date.now() + (HOST?.skew || 0);
const hphase = (r) => { if (!r?.open || r.closesAt < hnow()) return "closed"; if (r.mode === "free") return "free"; if (r.phase !== "countdown" && r.phase !== "play" && r.phase !== "done") return "lobby"; const n = hnow(); return n < r.startAt ? "countdown" : n < r.endAt ? "play" : "done"; };
const CHIP_COL = ["#ffd23f", "#3ec7ff", "#9cf25a", "#ff6bb5", "#b26bff", "#ff9f43", "#5ee0c0", "#ff4d6d"];
const chipCol = (n) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CHIP_COL[h % CHIP_COL.length]; };
export function openHost(cid) {
  closeHost(); const c = CLASSES?.find((x) => x.cid === cid);
  HOST = { cid, d: c ? { name: c.name, code: c.code, room: c.room, players: c.students.map((s) => ({ sid: s.sid, name: s.name, here: false, pts: 0, n: 0 })) } : null, skew: 0, ph: "", busy: false };
  $("host").hidden = false; renderHost(); pollHost();
  HOST.tick = setInterval(tickHost, 250);
}
function closeHost() { if (!HOST) return; clearTimeout(HOST.t); clearInterval(HOST.tick); HOST = null; $("host").hidden = true; }
async function pollHost() {
  if (!HOST) return; const h = HOST;
  try {
    const t0 = Date.now(), r = await call("fishLobby", { cid: h.cid }); if (HOST !== h) return; h.skew = r.room.now - (t0 + Date.now()) / 2;
    const key = JSON.stringify({ ...r, room: { ...r.room, now: 0 } }); h.d = r; if (key !== h.key) { h.key = key; renderHost(); } // 바뀐 게 있을 때만 다시 그린다(애니메이션이 처음부터 다시 돌지 않게)
  } catch {}
  if (HOST === h) h.t = setTimeout(pollHost, 2000);
}
function tickHost() {
  if (!HOST?.d) return; const r = HOST.d.room, ph = hphase(r);
  if (ph !== HOST.ph) { renderHost(); return; }
  const el = $("host").querySelector("[data-hclock]"); if (!el) return;
  if (ph === "countdown") el.textContent = Math.max(1, Math.ceil((r.startAt - hnow()) / 1000));
  if (ph === "play") { const s = Math.max(0, Math.ceil((r.endAt - hnow()) / 1000)); el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; el.classList.toggle("low", s <= 20); }
}
function hostAct(extra) {
  if (!HOST || HOST.busy) return; const h = HOST; h.busy = true; renderHost();
  call("fishRoomSet", { cid: h.cid, ...extra }).then((r) => { if (HOST !== h) return; h.d.room = { ...r.room }; h.skew = r.room.now - Date.now(); const c = CLASSES?.find((x) => x.cid === h.cid); if (c) c.room = r.room; if (extra.start) h.d.players.forEach((p) => { p.pts = 0; p.n = 0; }); })
    .catch(() => {}).finally(() => { h.busy = false; if (HOST === h) renderHost(); if (!$("town").hidden && tab === "class") renderTown(); });
}
// 칠판 화면에서 바로 보이고 바꿀 수 있는 낚시터(학생 화면은 몇 초 안에 따라 바뀜)
const hostPlace = (r, b) => `<div class="hostplace"><small>낚시터</small>${[["sea", "🌊 바다"], ["fresh", "🏞️ 민물"]].map(([v, t]) => `<button class="${(r.place === "sea" ? "sea" : "fresh") === v ? "on" : ""}" data-hplace="${v}" ${b}>${t}</button>`).join("")}</div>`;
// 자유시간 토글: 켜면 학생이 낚시터를 골라 마음껏, 끄면 하던 낚시를 마치고 모두 대기실로(선생님이 다시 정함)
const hostFree = (r, b) => `<button class="hostfree ${r.mode === "free" ? "on" : ""}" data-hfree ${b}><i></i><span>자유시간 ${r.mode === "free" ? "ON" : "OFF"}</span><small>${r.mode === "free" ? "끄면 모두 대기실로 돌아와요" : "켜면 학생이 낚시터를 골라 마음껏"}</small></button>`;
function renderHost() {
  const el = $("host"); if (!HOST) return;
  const d = HOST.d; if (!d) { el.innerHTML = `<div class="hostp"><p class="empty">불러오는 중…</p></div>`; return; }
  const r = d.room, ph = hphase(r), P = d.players, here = P.filter((p) => p.here), away = P.filter((p) => !p.here), b = HOST.busy ? "disabled" : "";
  if (HOST.ph !== ph) HOST.seen = new Set(); HOST.ph = ph; const seen = HOST.seen; // 새로 들어온 학생만 톡 튀어나오게
  const url = studentUrl().replace(/^https?:\/\//, "");
  const head = `<div class="hosthead"><div class="hostcode"><small>학급 코드</small><b>${esc(d.code)}</b></div><div class="hosturl"><small>주소창에 이렇게 쳐요</small><b>${esc(url)}</b></div><button class="tutx hostx" data-hclose aria-label="닫기">✕</button></div>`;
  const rank = [...P].filter((p) => p.n || p.pts || p.here).sort((a, b2) => b2.pts - a.pts);
  let main = "";
  if (ph === "closed") main = `<div class="hostmid"><h2>낚시터가 닫혀 있어요</h2><button class="go" data-hopen ${b}>낚시터 열고 대기실 만들기</button></div>`;
  else if (ph === "lobby") main = `<div class="hostcount"><b>${here.length}</b><span>/ ${P.length}명 들어왔어요</span></div>
    <div class="hostchips">${here.map((p) => `<span class="hchip ${seen.has(p.sid) ? "old" : ""}" style="--c:${chipCol(p.name)}">${esc(p.name)}</span>`).join("") || `<p class="empty">학생들이 들어오면 여기에 이름이 떠요</p>`}</div>
    ${away.length ? `<div class="hostaway"><small>아직 안 들어온 친구 ${away.length}명</small>${away.map((p) => `<span>${esc(p.name)}</span>`).join("")}</div>` : ""}
    <div class="hostbtns"><button class="go hoststart" data-hstart ${b || (here.length ? "" : "disabled")}>${HOST.busy ? "시작하는 중…" : here.length && !away.length ? "모두 왔어요! 시작 ▶" : "시작 ▶"}</button></div>
    <div class="hostctl">${hostPlace(r, b)}${hostFree(r, b)}</div><p class="hostset">한 판 ${Math.round(r.roundSec / 60)}분${r.quizOn ? " · 문제 풀고 던지기" : ""} · 낚시터는 ${Math.max(1, Math.ceil((r.closesAt - hnow()) / 60000))}분 뒤 저절로 닫혀요</p>`;
  else if (ph === "free") main = `<div class="hostplay"><b class="hostclock">자유시간</b><small>${here.length} / ${P.length}명 들어옴 · 학생이 낚시터를 골라 원할 때 한 판씩(${Math.round(r.roundSec / 60)}분) · ${Math.max(1, Math.ceil((r.closesAt - hnow()) / 60000))}분 뒤 닫힘</small></div>
    <div class="hostchips">${here.map((p) => `<span class="hchip ${seen.has(p.sid) ? "old" : ""}" style="--c:${chipCol(p.name)}">${esc(p.name)}</span>`).join("") || `<p class="empty">학생들이 들어오면 여기에 이름이 떠요</p>`}</div>
    ${rank.some((p) => p.pts) ? `<div class="hostrank">${rank.filter((p) => p.pts).slice(0, 12).map((p, i) => `<div><i>${i + 1}</i><span>${esc(p.name)}</span><em style="--w:${Math.max(4, p.pts / rank[0].pts * 100)}%;--c:${chipCol(p.name)}"></em><b>${p.pts.toLocaleString("ko-KR")}</b><small>${p.n}마리</small></div>`).join("")}</div>` : ""}
    <div class="hostctl">${hostFree(r, b)}</div><div class="hostbtns"><button class="go alt" data-hclose2 ${b}>낚시터 닫기</button></div>`;
  else if (ph === "countdown") main = `<div class="hostmid"><h2>준비!</h2><b class="hostbig" data-hclock>${Math.max(1, Math.ceil((r.startAt - hnow()) / 1000))}</b></div>`;
  else if (ph === "play") main = `<div class="hostplay"><b class="hostclock" data-hclock>0:00</b><small>${here.length}명 낚시 중</small></div>
    <div class="hostrank">${rank.slice(0, 12).map((p, i) => `<div><i>${i + 1}</i><span>${esc(p.name)}</span><em style="--w:${rank[0]?.pts ? Math.max(4, p.pts / rank[0].pts * 100) : 4}%;--c:${chipCol(p.name)}"></em><b>${p.pts.toLocaleString("ko-KR")}</b><small>${p.n}마리</small></div>`).join("")}</div>
    <div class="hostbtns"><button class="go alt" data-hlobby ${b}>그만하고 대기실로</button></div><div class="hostctl">${hostFree(r, b)}</div>`;
  else { const top = rank.slice(0, 3), order = [top[1], top[0], top[2]];
    main = `<h2 class="hostdone">대회 끝!</h2><div class="podium">${order.map((p, k) => p ? `<div class="pod p${[2, 1, 3][k]}"><span>${esc(p.name)}</span><b>${p.pts.toLocaleString("ko-KR")}</b><small>${p.n}마리</small><i>${[2, 1, 3][k]}</i></div>` : `<div class="pod empty"></div>`).join("")}</div>
    <div class="hostrank small">${rank.slice(3).map((p, i) => `<div><i>${i + 4}</i><span>${esc(p.name)}</span><b>${p.pts.toLocaleString("ko-KR")}</b><small>${p.n}마리</small></div>`).join("")}</div>
    <div class="hostbtns"><button class="go" data-hlobby ${b}>다음 판 준비 (대기실로)</button><button class="go alt" data-hclose2 ${b}>낚시터 닫기</button></div><div class="hostctl">${hostFree(r, b)}</div>`; }
  here.forEach((p) => seen.add(p.sid));
  el.innerHTML = `<div class="hostp hp-${ph}"><div class="hosttitle">${esc(d.name)} ${ph === "free" ? "자유시간" : "낚시 대회"}</div>${head}${main}</div>`;
  tickHost();
  el.querySelector("[data-hclose]").addEventListener("click", closeHost);
  el.querySelector("[data-hstart]")?.addEventListener("click", () => hostAct({ start: true }));
  el.querySelector("[data-hlobby]")?.addEventListener("click", () => hostAct({ lobby: true }));
  el.querySelector("[data-hopen]")?.addEventListener("click", () => hostAct({ open: true, minutes: 40 }));
  el.querySelector("[data-hclose2]")?.addEventListener("click", () => hostAct({ open: false }));
  el.querySelector("[data-hfree]")?.addEventListener("click", () => hostAct({ mode: HOST.d.room.mode === "free" ? "contest" : "free" }));
  el.querySelectorAll("[data-hplace]").forEach((x) => x.addEventListener("click", () => { if (x.dataset.hplace !== HOST.d.room.place) hostAct({ place: x.dataset.hplace }); }));
  el.querySelectorAll("[data-hmode]").forEach((x) => x.addEventListener("click", () => hostAct({ mode: x.dataset.hmode })));
}

// ---------------------------------------------------------------- 학생: 입장(코드 → 이름·번호)과 대기실
export function bindJoin() {
  const f1 = $("joinCode"), f2 = $("joinWho");
  let code = "";
  const pre = new URLSearchParams(location.search).get("code"); if (pre) f1.code.value = pre.toUpperCase().slice(0, 6);
  f1.code.addEventListener("input", () => { f1.code.value = f1.code.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); });
  f1.addEventListener("submit", async (e) => {
    e.preventDefault(); const b = f1.querySelector("button"), v = f1.code.value.trim();
    if (v.length !== 6) { hooks.toast?.("학급 코드는 6자리예요"); f1.code.focus(); return; }
    b.disabled = true; b.textContent = "확인 중…";
    try { const r = await checkCode(v); code = r.code; $("joinCls").innerHTML = `<b>${esc(r.name || "우리 반")}</b> 낚시터예요`; f1.hidden = true; f2.hidden = false; setTimeout(() => f2.name.focus(), 50); } catch {}
    b.disabled = false; b.textContent = "입장하기 ▶";
  });
  f2.addEventListener("submit", (e) => {
    e.preventDefault(); const b = f2.querySelector("button.go"); b.disabled = true; b.textContent = "들어가는 중…";
    join(code, f2.name.value, f2.pin.value).catch(() => {}).finally(() => { b.disabled = false; b.textContent = "들어가기"; });
  });
  $("joinBack").addEventListener("click", () => { f2.hidden = true; f1.hidden = false; f1.code.focus(); });
}
export function renderLobby() {
  const ph = phaseNow(), r = NET.room, me = NET.me?.name;
  $("lobClass").textContent = NET.student?.className ? `${NET.student.className} · ${me || ""}` : me || "";
  const T = { closed: ["낚시터 닫힘", "선생님이 낚시터를 열면 대기실에 들어가요"], lobby: ["대기실", `선생님이 시작하면 다 같이 ${r?.place === "sea" ? "바다" : "민물"} 낚시가 시작돼요!`], countdown: ["곧 시작!", "준비하세요!"], play: ["대회 중", "낚시터로 들어가요…"], done: ["이번 판 끝!", "선생님이 다음 판을 준비하고 있어요"], free: ["자유시간!", "낚시터를 골라 언제든 낚시하러 가요. 몇 판이든 OK!"] }[ph];
  $("lobTitle").textContent = T[0]; $("lobMsg").textContent = T[1];
  $("lobby").dataset.ph = ph;
  const P = ph === "closed" ? [] : NET.players || [];
  $("lobCount").textContent = ph === "closed" ? "" : `들어온 친구 ${P.length}명`;
  const seen = renderLobby.seen ??= new Set();
  $("lobPlayers").innerHTML = P.map((n) => `<span class="hchip ${n === me ? "me" : ""} ${seen.has(n) ? "old" : ""}" style="--c:${chipCol(n)}">${esc(n)}</span>`).join("");
  P.forEach((n) => seen.add(n));
  $("lobPlaces").hidden = ph !== "free"; // 자유시간에만 학생이 낚시터를 고른다
  $("lobGo").hidden = ph !== "free";
  $("lobPractice").hidden = !(ph === "lobby" || ph === "done"); // 대회를 기다리는 동안 연습(도감·살림망에 안 들어감)
}
