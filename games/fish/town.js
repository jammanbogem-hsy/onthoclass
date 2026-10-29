// 로그인 + 수산시장·낚시 가게·캠핑 요리·옷장 (서버: functions/src/fishing.ts)
// 세 점수: 손맛 점수(잡은 물고기) · 돈(팔아서) · 낭만 점수(옷차림·장식·요리)
// Firebase SDK는 게임이 뜬 뒤에 불러온다. 로그인하지 않아도 낚시는 그대로 할 수 있다.
import { FB } from "./fb-config.js";

const V = "12.13.0";
export const NET = { ready: false, user: null, me: null, bag: [], market: {}, rods: [], shop: {}, recipes: {}, day: "" };
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
export async function call(name, data) {
  try { return await (await sdk()).call(name, data); }
  catch (e) { const msg = e?.message?.replace(/^.*?: /, "") || "잠깐 문제가 생겼어요"; hooks.toast?.(msg); throw e; }
}
const changed = () => { renderAcct(); hooks.onProfile?.(NET.me); if (!$("town").hidden) renderTown(); };

// hooks: { SPECIES, fishThumb, toast, sample, onProfile }
export async function initNet(h) {
  hooks = h;
  renderAcct();
  try {
    const { A, auth } = await sdk();
    A.getRedirectResult(auth).catch(() => {});
    A.onAuthStateChanged(auth, async (u) => {
      NET.user = u; NET.ready = true;
      if (u) { try { Object.assign(NET, await call("fishMe")); } catch {} } else Object.assign(NET, { me: null, bag: [] });
      changed();
    });
  } catch { NET.ready = true; renderAcct(); }
}
export async function login() {
  const { A, auth } = await sdk(), p = new A.GoogleAuthProvider();
  try { await A.signInWithPopup(auth, p); }
  catch (e) { if (e?.code === "auth/popup-blocked" || e?.code === "auth/operation-not-supported-in-this-environment") await A.signInWithRedirect(auth, p); else if (e?.code !== "auth/popup-closed-by-user" && e?.code !== "auth/cancelled-popup-request") hooks.toast?.("로그인하지 못했어요. 선생님께 알려 주세요"); }
}
export async function logout() { const { A, auth } = await sdk(); await A.signOut(auth); }

// 잡은 물고기를 살림망에(게임이 부른다). 실패해도 게임은 계속
export async function saveCatch(sp, cm, kg, run) {
  if (!NET.me) return null;
  try {
    const r = await call("fishCatch", { sp, cm, kg, run });
    NET.me.taste += r.taste; NET.me.caught++;
    if (r.saved) NET.me.bagN = (NET.me.bagN || NET.bag.length) + 1;
    renderAcct();
    return r;
  } catch { return null; }
}
export const refresh = async () => { if (NET.user) { Object.assign(NET, await call("fishMe")); changed(); } };

// ---------------------------------------------------------------- 시작·끝 화면의 계정 칸
export function renderAcct() {
  document.querySelectorAll("[data-acct]").forEach((box) => {
    if (!NET.ready) { box.innerHTML = `<p class="acctwait">로그인 확인 중…</p>`; return; }
    if (!NET.user) {
      box.innerHTML = `<button class="go acctlogin" data-login>구글로 로그인</button><p>로그인하면 잡은 물고기를 <b>수산시장</b>에 팔고, 돈으로 <b>낚싯대·옷·요리 재료</b>를 살 수 있어요.</p>`;
    } else {
      const m = NET.me || { name: NET.user.displayName || "낚시꾼", taste: 0, money: 0, romance: 0 };
      box.innerHTML = `<div class="acctrow"><b class="acctname">${esc(m.name)}</b><button class="acctout" data-logout>로그아웃</button></div>
        <div class="scores3"><div><small>손맛 점수</small><b>${(m.taste || 0).toLocaleString("ko-KR")}</b></div><div><small>돈</small><b class="money">${won(m.money || 0)}</b></div><div><small>낭만 점수</small><b class="romance">${(m.romance || 0).toLocaleString("ko-KR")}</b></div></div>
        <div class="townbtns"><button class="go alt" data-town="market">수산시장${NET.bag.length ? ` <i>${NET.bag.length}</i>` : ""}</button><button class="go alt" data-town="shop">낚시 가게</button><button class="go alt" data-town="cook">캠핑 요리</button></div>`;
    }
    box.querySelector("[data-login]")?.addEventListener("click", login);
    box.querySelector("[data-logout]")?.addEventListener("click", logout);
    box.querySelectorAll("[data-town]").forEach((b) => b.addEventListener("click", () => openTown(b.dataset.town)));
  });
}

// ---------------------------------------------------------------- 마을(수산시장·가게·요리·옷장)
let tab = "market", pick = new Set(), cooking = null, busy = false;
export async function openTown(t = "market") {
  tab = t; pick = new Set(); cooking = null;
  $("town").hidden = false; renderTown();
  try { Object.assign(NET, await call("fishMe")); renderTown(); renderAcct(); } catch {}
}
const TABS = { market: "수산시장", shop: "낚시 가게", cook: "캠핑 요리", closet: "옷장" };
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
  $("townTabs").innerHTML = Object.entries(TABS).map(([k, v]) => `<button class="go ${k === tab ? "" : "alt"}" data-tab="${k}">${v}</button>`).join("");
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
const sell = (ids) => act(async () => {
  const r = await call("fishSell", { ids });
  Object.assign(NET, { me: r.me, bag: r.bag }); pick = new Set();
  hooks.sample?.("cash") || hooks.sample?.("ding"); pop(`+${won(r.earned)}`, "money", `${r.n}마리를 팔았어요!`); changed();
});
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
