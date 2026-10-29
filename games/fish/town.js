// 로그인 + 수산시장·낚시 가게·캠핑 요리·옷장 (서버: functions/src/fishing.ts)
// 세 점수: 손맛 점수(잡은 물고기) · 돈(팔아서) · 낭만 점수(옷차림·장식·요리)
// Firebase SDK는 게임이 뜬 뒤에 불러온다.
// 누가 낚시할 수 있나: 교사(러닝크루 교사 계정)·최고 관리자는 언제나, 학생은 선생님이 방을 열었을 때만(gate)
import { FB } from "./fb-config.js";

const V = "12.13.0";
// 계정: 학생(학급 코드+이름+입장번호 → 입장권 st, localStorage) 또는 구글(선생님·누구나)
let ST = null; try { ST = localStorage.getItem("jamfish-st"); } catch {}
export const NET = { ready: false, failed: false, role: "", room: null, user: null, student: null, me: null, bag: [], market: {}, rods: [], shop: {}, recipes: {}, day: "" };
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
        try { Object.assign(NET, await (await sdk()).call("fishMe", { st: ST })); NET.student = { name: NET.me.name, className: (() => { try { return localStorage.getItem("jamfish-class") || ""; } catch { return ""; } })() }; }
        catch { setST(null); NET.student = null; }
      }
      if (!ST && u) { try { Object.assign(NET, await call("fishMe")); } catch {} } else if (!ST) Object.assign(NET, { me: null, bag: [] });
      NET.ready = true; changed();
    });
  } catch { NET.ready = true; NET.failed = true; renderAcct(); hooks.onGate?.(); }
}
// 지금 낚시할 수 있는지와 그 이유. 서버에 아예 못 닿으면(학교망이 막는 등) 막지 않는다
export function gate() {
  if (NET.failed) return { ok: true };
  if (!NET.ready) return { ok: false, why: "로그인 확인 중…" };
  if (NET.role === "teacher" || NET.role === "admin") return { ok: true, free: true };
  if (NET.role === "student") {
    const r = NET.room;
    if (r?.open && r.closesAt > Date.now()) return { ok: true, room: r };
    return { ok: false, why: "선생님이 낚시터를 열면 시작할 수 있어요" };
  }
  if (NET.user) return { ok: false, why: "학생은 위에서 학급 코드로 입장해요 (선생님은 러닝크루 교사 계정으로 로그인)" };
  return { ok: false, why: "위에서 학급 코드로 입장하면 낚시할 수 있어요" };
}
// 학생: 몇 초마다 방 상태를 묻는다(열림·닫힘·설정 변경)
setInterval(async () => {
  if (NET.role !== "student" || document.hidden) return;
  try { const r = await (await sdk()).call("fishRoom", { st: ST }); const was = JSON.stringify(NET.room); NET.room = r.room; if (JSON.stringify(r.room) !== was) { renderAcct(); hooks.onGate?.(); } } catch {}
}, 8000);
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
// 학생 입장: 학급 코드 + 이름 + 입장번호 4자리
export async function join(code, name, pin) {
  const r = await (await sdk()).call("fishJoin", { code, name, pin }).catch((e) => { hooks.toast?.(e?.message?.replace(/^.*?: /, "") || "입장하지 못했어요"); throw e; });
  setST(r.st, r.className); NET.student = { name: r.name, className: r.className };
  Object.assign(NET, await call("fishMe")); NET.ready = true; changed();
  hooks.toast?.(`${r.className} ${r.name}, 어서 와요!`);
}
export async function leave() { const st = ST; setST(null); NET.student = null; try { await (await sdk()).call("fishLeave", { st }); } catch {} Object.assign(NET, { me: null, bag: [] }); if (NET.user) { try { Object.assign(NET, await call("fishMe")); } catch {} } changed(); }
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

const PLACE_NAME = { fresh: "민물", sea: "바다", any: "장소는 자유" };
function roomLine() {
  const r = NET.room;
  if (r?.open && r.closesAt > Date.now()) return `<div class="roomline open">낚시터 열림 · ${Math.max(1, Math.ceil((r.closesAt - Date.now()) / 60000))}분 남음 · ${PLACE_NAME[r.place]} · 한 판 ${Math.round(r.roundSec / 60)}분${r.quizOn ? " · 문제 풀고 던지기" : ""}</div>`;
  return `<div class="roomline wait">선생님이 낚시터를 열 때까지 기다려요… <small>(저절로 확인해요)</small></div>`;
}
// ---------------------------------------------------------------- 시작·끝 화면의 계정 칸
export function renderAcct() {
  document.querySelectorAll("[data-acct]").forEach((box) => {
    if (!NET.ready) { box.innerHTML = `<p class="acctwait">로그인 확인 중…</p>`; return; }
    if (!NET.me) {
      box.innerHTML = `<b class="accth">학급으로 입장</b>
        <form class="joinf" data-join><input name="code" maxlength="6" placeholder="학급 코드 6자리" autocomplete="off" autocapitalize="characters" spellcheck="false"><input name="name" maxlength="12" placeholder="이름" autocomplete="off"><input name="pin" maxlength="4" inputmode="numeric" pattern="\\d{4}" placeholder="입장번호 4자리" autocomplete="off" type="password"><button class="go">입장</button></form>
        <p>처음이면 이름과 입장번호 4자리를 정해서 들어와요. 다음부터 같은 이름·번호로 들어오면 잡은 물고기와 돈이 이어져요. 로그인하면 물고기를 <b>수산시장</b>에 팔고 <b>낚싯대·옷·요리 재료</b>를 살 수 있어요.</p>
        <button class="acctout" data-login>선생님이세요? 구글로 로그인해 낚시 학급 만들기</button>`;
      box.querySelector("[data-join]").addEventListener("submit", (e) => { e.preventDefault(); const f = e.target; const b = f.querySelector("button"); b.disabled = true; join(f.code.value, f.name.value, f.pin.value).catch(() => {}).finally(() => { b.disabled = false; }); });
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
  });
}

// ---------------------------------------------------------------- 마을(수산시장·가게·요리·옷장)
let tab = "market", pick = new Set(), cooking = null, busy = false;
export async function openTown(t = "market") {
  tab = t; pick = new Set(); cooking = null; if (t === "class") CLASSES = null; if (t === "admin") { ADM = null; ADMC = {}; }
  $("town").hidden = false; renderTown();
  try { Object.assign(NET, await call("fishMe")); renderTown(); renderAcct(); } catch {}
}
const TABS = { market: "수산시장", shop: "낚시 가게", cook: "캠핑 요리", closet: "옷장" };
let CLASSES = null;
const RECIPE_OK = {
  ramen: () => true, seafoodRamen: (f, S) => S[f.sp]?.water === "sea", gui: (f) => ["월척", "S급", "A급"].includes(f.grade),
  maeuntang: (f, S) => S[f.sp]?.water === "fresh", haemultang: (f, S) => S[f.sp]?.water === "sea", hoe: (f, S) => ["전설", "보스"].includes(S[f.sp]?.tier),
};
const FOOD_ART = { ramen: "🍜", seafoodRamen: "🍜", gui: "🐟", maeuntang: "🍲", haemultang: "🦀", hoe: "🍣" };
const SHOP_ART = { hat_straw: "👒", hat_beanie: "🧢", glasses: "🕶️", vest: "🦺", hat_pirate: "🏴‍☠️", crown: "👑", chair: "🪑", fire: "🔥", ramen: "🍜" };

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
        return `<div class="item ${own ? "have" : ""}"><i>${SHOP_ART[k] || "🎁"}</i><b>${esc(it.name)}</b><small>${esc(it.desc)}${it.romance ? ` · 낭만 +${it.romance}` : ""}${it.kind === "stock" ? ` · ${n}개 있음` : ""}</small>
          ${own ? `<em>보유</em>` : `<button class="go ${m.money >= it.price ? "" : "alt"}" data-buy="${k}" ${m.money >= it.price ? "" : "disabled"}>${won(it.price)}</button>`}</div>`;
      }).join("")}</div>`;
    body.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => buy(b.dataset.buy)));
  } else if (tab === "cook") {
    if (cooking) {
      const r = NET.recipes[cooking], ok = NET.bag.filter((f) => RECIPE_OK[cooking](f, S));
      body.innerHTML = `<h3>${FOOD_ART[cooking]} ${esc(r.name)} <small>${esc(r.desc)} · 물고기 ${r.fish}마리 골라요</small></h3>
        ${ok.length ? `<div class="fishlist">${ok.map((f) => fishRow(f, pick.has(f.id))).join("")}</div>` : `<p class="empty">이 요리에 쓸 물고기가 살림망에 없어요.</p>`}
        <div class="townact"><button class="go" data-cookgo ${pick.size === r.fish && (m.stock.ramen || 0) >= r.ramen ? "" : "disabled"}>${esc(r.name)} 끓이기 (${pick.size}/${r.fish})</button><button class="go alt" data-cookback>뒤로</button></div>`;
      body.querySelectorAll("[data-fid]").forEach((b) => b.addEventListener("click", () => { const id = b.dataset.fid; if (pick.has(id)) pick.delete(id); else if (pick.size < r.fish) pick.add(id); renderTown(); }));
      body.querySelector("[data-cookgo]")?.addEventListener("click", () => cook(cooking, [...pick]));
      body.querySelector("[data-cookback]").addEventListener("click", () => { cooking = null; pick = new Set(); renderTown(); });
      return;
    }
    body.innerHTML = `<h3>캠핑 요리 <small>살림망 물고기로 요리해 낭만 점수를 올려요 · 라면 ${m.stock.ramen || 0}개</small></h3>
      <div class="shopgrid">${Object.entries(NET.recipes).map(([k, r]) => {
        const have = NET.bag.filter((f) => RECIPE_OK[k](f, S)).length, can = have >= r.fish && (m.stock.ramen || 0) >= r.ramen;
        return `<div class="item"><i>${FOOD_ART[k]}</i><b>${esc(r.name)}</b><small>${esc(r.desc)} · <span class="romance">낭만 +${r.romance}</span>${m.cooked[k] ? ` · ${m.cooked[k]}번 끓임` : ""}</small>
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
    if (!CLASSES) { body.innerHTML = `<p class="empty">학급을 불러오는 중…</p>`; call("fishClassList").then((r) => { CLASSES = r.classes; renderTown(); }).catch(() => {}); return; }
    if (NET.role !== "teacher" && NET.role !== "admin") { body.innerHTML = `<p class="empty">선생님 계정만 학급을 만들 수 있어요. 러닝크루에서 교사로 가입한 구글 계정으로 로그인해 주세요.</p>`; return; }
    body.innerHTML = `<h3>낚시 학급 <small>학생은 학급 코드 + 이름 + 입장번호 4자리로 들어와요(구글 계정 필요 없음). 학생은 선생님이 낚시터를 열었을 때만 낚시할 수 있어요</small></h3>
      <form class="joinf" data-newclass><input name="name" maxlength="12" placeholder="학급 이름 (예: 5학년 3반)"><button class="go">학급 만들기</button></form>
      ${CLASSES.length ? CLASSES.map((c) => `<div class="clsbox"><div class="clshead"><b>${esc(c.name)}</b><span>학급 코드 <em>${c.code}</em></span><small>${c.students.length}명</small></div>${roomBox(c)}
        ${c.students.length ? `<div class="clstable"><div class="th"><span>이름</span><span>손맛</span><span>돈</span><span>낭만</span><span>잡은 수</span><span></span></div>
          ${[...c.students].sort((a, b) => b.taste - a.taste).map((s) => `<div><span>${esc(s.name)}</span><span>${s.taste.toLocaleString("ko-KR")}</span><span class="money">${won(s.money)}</span><span class="romance">${s.romance}</span><span>${s.caught}</span><span><button class="acctout" data-reset="${c.cid}:${s.sid}">${s.hasPin ? "입장번호 초기화" : "초기화됨"}</button></span></div>`).join("")}</div>`
          : `<p class="empty">아직 들어온 학생이 없어요. 칠판에 코드 <b>${c.code}</b>를 적어 주세요.</p>`}</div>`).join("") : `<p class="empty">아직 만든 학급이 없어요.</p>`}`;
    body.querySelectorAll("[data-room]").forEach((box) => bindRoom(box));
    body.querySelector("[data-newclass]").addEventListener("submit", (e) => { e.preventDefault(); act(async () => { const r = await call("fishClassCreate", { name: e.target.name.value }); CLASSES = null; pop(r.code, "money", `${r.name} 학급 코드`); renderTown(); }); });
    body.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", () => { const [cid, sid] = b.dataset.reset.split(":"); act(async () => { await call("fishClassResetPin", { cid, sid }); CLASSES = null; hooks.toast?.("초기화했어요. 학생이 다음에 들어올 때 새 번호를 정해요"); renderTown(); }); }));
  } else {
    const slots = { head: "머리", face: "얼굴", body: "몸" };
    body.innerHTML = `<h3>옷장 <small>산 옷을 골라 입어요. 낚시할 때 내 낚시꾼이 입고 나와요</small></h3>
      ${Object.entries(slots).map(([slot, label]) => {
        const items = Object.entries(NET.shop).filter(([k, it]) => it.slot === slot && m.own[k]);
        return `<div class="closet"><b>${label}</b><div>${items.length ? items.map(([k, it]) => `<button class="go ${m.wear[slot] === k ? "" : "alt"}" data-wear="${slot}:${k}">${SHOP_ART[k]} ${esc(it.name)}</button>`).join("") + `<button class="go alt" data-wear="${slot}:">벗기</button>` : `<small>가게에서 사 와요</small>`}</div></div>`;
      }).join("")}
      <h3>장식</h3><div class="closet"><div>${["chair", "fire"].map((k) => `<span class="deco ${m.own[k] ? "on" : ""}">${SHOP_ART[k]} ${esc(NET.shop[k]?.name || k)} ${m.own[k] ? "· 데크에 있어요" : "· 아직 없어요"}</span>`).join("")}</div></div>`;
    body.querySelectorAll("[data-wear]").forEach((b) => b.addEventListener("click", () => { const [slot, item] = b.dataset.wear.split(":"); wear(slot, item || null); }));
  }
}
async function act(fn) { if (busy) return; busy = true; try { await fn(); } catch {} busy = false; }
// 판 것처럼 먼저 보여 주고(살림망에서 빼고 돈을 올림), 서버 답이 오면 맞추고, 실패하면 되돌린다
let selling = 0;
async function sell(ids) {
  const list = ids === "all" ? NET.bag : NET.bag.filter((f) => ids.includes(f.id));
  if (!list.length) return;
  const gone = new Set(list.map((f) => f.id)), earned = list.reduce((t, f) => t + f.price, 0), order = NET.bag.map((f) => f.id);
  NET.bag = NET.bag.filter((f) => !gone.has(f.id)); NET.me = { ...NET.me, money: NET.me.money + earned }; pick = new Set();
  hooks.sample?.("cash") || hooks.sample?.("ding"); pop(`+${won(earned)}`, "money", `${list.length}마리를 팔았어요!`); changed();
  selling++;
  try {
    const r = await call("fishSell", { ids: [...gone] });
    selling--;
    NET.me = selling ? { ...NET.me, money: NET.me.money + r.earned - earned } : r.me; // 다른 팔기가 없으면 서버 값 그대로
  } catch {
    selling--;
    NET.me = { ...NET.me, money: NET.me.money - earned };
    NET.bag = [...NET.bag, ...list].sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
  }
  changed();
}
const buy = (item) => act(async () => {
  const before = NET.me.romance, r = await call("fishBuy", { item });
  NET.me = r.me; hooks.sample?.("cash") || hooks.sample?.("ding");
  const gain = r.me.romance - before; pop(item === "rod" ? `Lv.${r.me.rod}` : NET.shop[item]?.name || "", gain ? "romance" : "money", gain ? `낭만 +${gain}` : "샀어요!"); changed();
});
const wear = (slot, item) => act(async () => { const r = await call("fishWear", { slot, item }); NET.me = r.me; changed(); });
const cook = (recipe, ids) => act(async () => {
  const pot = $("cookPot"); pot.hidden = false; pot.querySelector("b").textContent = "보글보글…"; pot.querySelector("small").textContent = NET.recipes[recipe].name;
  hooks.sample?.("cook");
  const [r] = await Promise.all([call("fishCook", { recipe, ids }).catch((e) => { pot.hidden = true; throw e; }), new Promise((ok) => setTimeout(ok, 1600))]);
  Object.assign(NET, { me: r.me, bag: r.bag }); cooking = null; pick = new Set();
  pot.querySelector("b").textContent = `${r.name} 완성!`; pot.querySelector("small").textContent = `낭만 +${r.romance}`;
  hooks.sample?.("mission") || hooks.sample?.("ding");
  setTimeout(() => { pot.hidden = true; }, 1500); changed();
});
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
function roomBox(c) {
  const r = c.room, open = r.open && r.closesAt > Date.now();
  const opt = (vals, cur) => vals.map(([v, t]) => `<option value="${v}" ${String(v) === String(cur) ? "selected" : ""}>${t}</option>`).join("");
  return `<div class="roombox ${open ? "open" : ""}" data-room="${c.cid}">
    <b>${open ? `낚시터 열림 · ${Math.ceil((r.closesAt - Date.now()) / 60000)}분 남음` : "낚시터 닫힘 (학생은 대기 중)"}</b>
    <div class="roomset">
      <label>열어 둘 시간<select name="minutes">${opt([[20, "20분"], [40, "40분"], [60, "60분"], [90, "90분"]], 40)}</select></label>
      <label>한 판 시간<select name="roundSec">${opt([[120, "2분"], [180, "3분"], [300, "5분"], [600, "10분"]], r.roundSec)}</select></label>
      <label>낚시터<select name="place">${opt([["any", "학생이 고르기"], ["fresh", "민물만"], ["sea", "바다만"]], r.place)}</select></label>
    </div>
    <div class="roomquiz"><label class="chk"><input type="checkbox" name="quizOn" ${r.quizOn ? "checked" : ""}> 던지기 전에 문제 풀기</label>
      <span>문제 ${r.quizN}개</span><label class="go alt filebtn">CSV 올리기<input type="file" accept=".csv,text/csv" hidden></label><button class="acctout" data-tpl>양식 받기</button></div>
    <div class="townact">${open ? `<button class="go" data-roomsave>설정 바꾸기</button><button class="go alt" data-roomclose>낚시터 닫기</button>` : `<button class="go" data-roomopen>낚시터 열기</button><button class="go alt" data-roomsave>설정만 저장</button>`}</div>
  </div>`;
}
const settings = (box) => ({ minutes: +box.querySelector("[name=minutes]").value, roundSec: +box.querySelector("[name=roundSec]").value, place: box.querySelector("[name=place]").value, quizOn: box.querySelector("[name=quizOn]").checked });
function bindRoom(box) {
  const cid = box.dataset.room, save = (extra) => act(async () => { await call("fishRoomSet", { cid, ...settings(box), ...extra }); CLASSES = null; renderTown(); });
  box.querySelector("[data-roomopen]")?.addEventListener("click", () => save({ open: true }).then(() => hooks.toast?.("낚시터를 열었어요! 학생 화면이 몇 초 안에 열려요")));
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
