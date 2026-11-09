// 전국의 강태공 — 전국 순위(누구나 볼 수 있음, 서버 ktApi op "board")
import { FB } from "./fb-config.js";
import { MAP, project, REGIONS } from "./korea.js?v=1";

const V = "12.13.0";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Math.round(n || 0).toLocaleString("ko-KR");
const Q = new URLSearchParams(location.search), MINE = Q.get("school") || "";
if (Q.get("embed")) document.body.classList.add("embed");

let call = null;
async function api() {
  if (call) return call;
  const [{ initializeApp }, Fn] = await Promise.all([import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`), import(`https://www.gstatic.com/firebasejs/${V}/firebase-functions.js`)]);
  const f = Fn.httpsCallable(Fn.getFunctions(initializeApp(FB, "ktrank"), "asia-northeast3"), "ktApi");
  call = (op, d = {}) => f({ ...d, op }).then((r) => r.data);
  return call;
}

let B = null, tab = "school", sort = "taste", regionPick = "";
const LABEL = { taste: "손맛", caught: "마리", romance: "낭만" };
const TIER_IC = { "보스": ["👑", "boss"], "전설": ["🌟", "legend"] };

// 숫자가 촤르륵 올라가게
function countTo(el, v) {
  const from = +el.dataset.v || 0; el.dataset.v = v;
  if (from === v) { el.textContent = fmt(v); return; }
  const t0 = performance.now(), d = 900;
  const step = (t) => { const k = Math.min(1, (t - t0) / d), e = 1 - (1 - k) ** 3; el.textContent = fmt(from + (v - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- 지도
const W = 600, H = MAP.h + 6;
const heat = (k) => { // 0~1 → 남색·파랑·하늘·연두·노랑
  const C = [[27, 37, 96], [43, 90, 168], [62, 199, 255], [156, 242, 90], [255, 210, 63]];
  const x = Math.max(0, Math.min(1, k)) * (C.length - 1), i = Math.min(C.length - 2, Math.floor(x)), f = x - i;
  return `rgb(${C[i].map((c, j) => Math.round(c + (C[i + 1][j] - c) * f)).join(",")})`;
};
function drawMap() {
  const R = new Map((B?.regions || []).map((r) => [r.region, r])), max = Math.max(1, ...[...R.values()].map((r) => r[sort]));
  const top = [...(B?.schools || [])].sort((a, b) => b[sort] - a[sort]).filter((s) => s[sort] > 0);
  const maxS = Math.max(1, ...top.map((s) => s.caught));
  const rank = new Map(top.map((s, i) => [s.key, i]));
  const dots = [...(B?.schools || [])].filter((s) => s.caught > 0 || s.key === MINE).sort((a, b) => a.caught - b.caught).map((s) => {
    const [x, y] = project(s.lat, s.lng), i = rank.get(s.key) ?? 999, r = 3 + Math.sqrt(s.caught / maxS) * 9;
    const col = i === 0 ? "var(--gold)" : i === 1 ? "var(--silver)" : i === 2 ? "var(--bronze)" : s.key === MINE ? "var(--cream)" : "var(--sky)";
    return `<g class="dot ${i < 10 ? "top" : ""} ${s.key === MINE ? "mine" : ""}" data-k="${esc(s.key)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle class="halo" r="${r.toFixed(1)}" style="stroke:${col}"></circle><circle class="core" r="${r.toFixed(1)}" style="fill:${col}"></circle></g>`;
  }).join("");
  $("map").innerHTML = `<svg viewBox="-4 -4 ${W} ${H}" role="img" aria-label="전국 지도">
    <defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    ${REGIONS.map((g) => { const r = R.get(g.key), v = r ? r[sort] : 0; return `<path d="${g.d}" data-r="${g.key}" class="${regionPick === g.key ? "on" : ""}" style="fill:${v ? heat(.15 + .85 * Math.sqrt(v / max)) : "#18204f"}"></path>`; }).join("")}
    ${REGIONS.filter((g) => !["세종", "광주", "대전", "울산"].includes(g.key)).map((g) => `<text class="rlabel" x="${g.cx}" y="${g.cy + 4}">${g.key}</text>`).join("")}
    <g filter="url(#glow)">${dots}</g>
    <g transform="translate(${project(37.24, 131.87).map((v) => v.toFixed(1)).join(" ")})"><circle r="2.2" fill="#9fb0e0"></circle><text class="dokdo" x="0" y="-6" text-anchor="middle">독도</text></g>
  </svg><div class="tip" id="tip" hidden></div>`;
  const svg = $("map").querySelector("svg");
  svg.querySelectorAll(".dot").forEach((d) => d.addEventListener("click", (e) => { e.stopPropagation(); showTip(d.dataset.k); }));
  svg.querySelectorAll("path").forEach((p) => p.addEventListener("click", () => { regionPick = regionPick === p.dataset.r ? "" : p.dataset.r; setTab("school"); }));
  svg.addEventListener("click", () => { $("tip").hidden = true; });
}
function showTip(key) {
  const s = B.schools.find((x) => x.key === key); if (!s) return;
  const [x, y] = project(s.lat, s.lng), box = $("map").getBoundingClientRect(), tip = $("tip");
  const order = [...B.schools].sort((a, b) => b[sort] - a[sort]), n = order.findIndex((o) => o.key === key) + 1;
  tip.innerHTML = `<b>${esc(s.name)}</b><span class="r">${esc(s.region)} · 전국 ${LABEL[sort]} ${n}위</span><br>🐟 ${fmt(s.caught)}마리 · 손맛 ${fmt(s.taste)} · 낭만 ${fmt(s.romance)}<br>🎣 강태공 ${fmt(s.anglers)}명${s.big ? `<br>🏅 대어: ${esc(s.big.n)} ${s.big.cm}cm (${esc(s.big.who)})` : ""}`;
  tip.style.left = `${Math.min(box.width - 100, Math.max(100, (x + 4) / W * box.width))}px`; tip.style.top = `${(y + 4) / H * box.height}px`;
  tip.hidden = false;
}

// ---------------------------------------------------------------- 순위 목록
const medal = (i) => ["🥇", "🥈", "🥉"][i] || "";
function setTab(t) {
  tab = t;
  document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  $("sorts").hidden = t === "news";
  render();
}
function podium(items, name, sub) {
  const top = items.slice(0, 3), order = [top[1], top[0], top[2]];
  return order.map((it, k) => { const p = [2, 1, 3][k]; return it ? `<div class="pod p${p}"><div class="medal">${medal(p - 1)}</div><b>${esc(name(it))}</b><small>${esc(sub(it))}</small><strong>${fmt(it[sort])}</strong></div>` : `<div class="pod p${p} empty"><div class="medal">${medal(p - 1)}</div><b>?</b><small>도전하세요!</small></div>`; }).join("");
}
function render() {
  if (!B) return;
  const podEl = $("podium"), list = $("list");
  drawMap();
  if (tab === "school") {
    let S = B.schools.filter((s) => s[sort] > 0 || s.key === MINE).sort((a, b) => b[sort] - a[sort]);
    const all = S;
    if (regionPick) S = S.filter((s) => s.region === regionPick);
    const max = Math.max(1, ...S.map((s) => s[sort]));
    podEl.hidden = !S.length || !!regionPick; podEl.innerHTML = podium(S.filter((s) => s[sort] > 0), (s) => s.name, (s) => `${s.region} · ${s.anglers}명`);
    list.innerHTML = (regionPick ? `<div class="sorts"><span>📍 ${esc(regionPick)} 학교만 보는 중</span><button data-clearregion aria-pressed="true">전체 보기</button></div>` : "")
      + (S.length ? `<div class="list">${S.slice(regionPick ? 0 : 3, 100).map((s) => { const i = all.indexOf(s);
        return `<div class="row click ${s.key === MINE ? "mine" : ""}" data-k="${esc(s.key)}"><span class="no ${i < 3 ? `m${i + 1}` : ""}">${i + 1}</span><span class="nm"><b>${esc(s.name)}${s.key === MINE ? " · 우리 학교" : ""}</b><small>${esc(s.region)} · 강태공 ${fmt(s.anglers)}명${s.big ? ` · 대어 ${esc(s.big.n)} ${s.big.cm}cm` : ""}</small><span class="bar"><i style="width:${Math.max(3, s[sort] / max * 100)}%"></i></span></span><span class="val"><b>${fmt(s[sort])}</b><small>${LABEL[sort]}</small></span></div>`; }).join("")}</div>`
        : `<div class="empty"><b>아직 기록이 없어요</b>첫 번째 강태공이 되어 우리 학교를 지도에 올려 보세요!</div>`);
    list.querySelector("[data-clearregion]")?.addEventListener("click", () => { regionPick = ""; render(); });
    list.querySelectorAll("[data-k]").forEach((r) => r.addEventListener("click", () => { showTip(r.dataset.k); $("map").scrollIntoView({ behavior: "smooth", block: "nearest" }); }));
    if (MINE && !render.scrolled) { render.scrolled = true; setTimeout(() => list.querySelector(".row.mine")?.scrollIntoView({ block: "center", behavior: "smooth" }), 400); }
  } else if (tab === "region") {
    const R = [...B.regions].filter((r) => r[sort] > 0).sort((a, b) => b[sort] - a[sort]), max = Math.max(1, ...R.map((r) => r[sort]));
    const mineR = B.schools.find((s) => s.key === MINE)?.region;
    podEl.hidden = !R.length; podEl.innerHTML = podium(R, (r) => r.region, (r) => `${r.schools}개 학교`);
    list.innerHTML = R.length ? `<div class="list">${R.slice(3).map((r, i) => `<div class="row click ${r.region === mineR ? "mine" : ""}" data-r="${esc(r.region)}"><span class="no">${i + 4}</span><span class="nm"><b>${esc(r.region)}</b><small>${r.schools}개 학교 · 강태공 ${fmt(r.anglers)}명 · ${fmt(r.caught)}마리</small><span class="bar"><i style="width:${Math.max(3, r[sort] / max * 100)}%"></i></span></span><span class="val"><b>${fmt(r[sort])}</b><small>${LABEL[sort]}</small></span></div>`).join("")}</div>`
      : `<div class="empty"><b>아직 기록이 없어요</b>우리 지역을 처음으로 밝혀 보세요!</div>`;
    list.querySelectorAll("[data-r]").forEach((r) => r.addEventListener("click", () => { regionPick = r.dataset.r; setTab("school"); }));
  } else if (tab === "angler") {
    const A = [...B.anglers].sort((a, b) => b[sort] - a[sort]).filter((a) => a[sort] > 0);
    podEl.hidden = !A.length; podEl.innerHTML = podium(A, (a) => a.name, (a) => a.school);
    list.innerHTML = A.length ? `<div class="list">${A.slice(3, 30).map((a, i) => `<div class="row"><span class="no">${i + 4}</span><span class="nm"><b>${esc(a.name)}</b><small>${esc(a.school)} · ${esc(a.region)}</small><span class="chips3"><span>🐟 <b>${fmt(a.caught)}</b>마리</span><span>손맛 <b>${fmt(a.taste)}</b></span><span>낭만 <b>${fmt(a.romance)}</b></span>${a.big ? `<span>대어 <b>${esc(a.big.n)} ${a.big.cm}cm</b></span>` : ""}</span></span><span class="val"><b>${fmt(a[sort])}</b><small>${LABEL[sort]}</small></span></div>`).join("")}</div>`
      : `<div class="empty"><b>아직 강태공이 없어요</b>첫 물고기를 낚으면 여기에 이름이 올라가요!</div>`;
  } else {
    podEl.hidden = true;
    list.innerHTML = B.bigs.length ? `<div class="news">${B.bigs.map((b) => { const [ic, cls] = TIER_IC[b.tier] || ["🐟", ""];
      return `<div><span class="ic ${cls}">${ic}</span><p><b>${esc(b.school)}</b> ${esc(b.who)} 강태공이 <b>${esc(b.grade === "월척" ? "월척 " : "")}${esc(b.n)}</b>(${b.cm}cm · ${b.kg >= 1 ? b.kg.toFixed(1) + "kg" : Math.round(b.kg * 1000) + "g"})를 낚았어요!<small>${esc(b.region)} · ${ago(b.at)}</small></p></div>`; }).join("")}</div>`
      : `<div class="empty"><b>아직 대어 소식이 없어요</b>월척·전설·보스 물고기를 낚으면 전국에 소식이 퍼져요!</div>`;
  }
}
const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? "방금" : s < 3600 ? `${Math.floor(s / 60)}분 전` : s < 86400 ? `${Math.floor(s / 3600)}시간 전` : `${Math.floor(s / 86400)}일 전`; };

async function load() {
  try {
    B = await (await api())("board");
    const T = B.totals;
    countTo($("tSchools"), T.schools); countTo($("tAnglers"), T.anglers); countTo($("tCaught"), T.caught); countTo($("tTaste"), T.taste); countTo($("tRomance"), T.romance);
    $("liveTxt").textContent = `실시간 · ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준`;
    render();
  } catch (e) {
    $("liveTxt").textContent = "순위를 불러오지 못했어요. 잠시 뒤 다시 시도해요";
    if (!B) $("list").innerHTML = `<div class="empty"><b>연결이 잠깐 끊겼어요</b>인터넷 연결을 확인하고 새로고침해 주세요.</div>`;
  }
}
document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.tab !== "school") regionPick = ""; setTab(b.dataset.tab); }));
document.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => { sort = b.dataset.sort; document.querySelectorAll("[data-sort]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); render(); }));
addEventListener("message", (e) => { if (e.data === "ktfish-refresh") load(); });
drawMap(); load();
setInterval(() => { if (!document.hidden) load(); }, 30000);
