// 전국의 강태공 — 전국 순위(누구나 볼 수 있음, 서버 ktApi op "board" · "school")
import { FB } from "./fb-config.js";
import { MAP, project, REGIONS } from "./korea.js?v=2";
import { ic } from "./icons.js?v=2";

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

let B = null, tab = "school", sort = "taste", regionPick = "", find = "", shown = 50, mineInfo = null, farHits = null;
const LABEL = { taste: "손맛", caught: "마리", romance: "낭만" };
const TIER_IC = { "보스": ["crown", "boss"], "전설": ["star", "legend"] };
const PAGE = 50;

// 숫자가 촤르륵 올라가게
function countTo(el, v) {
  const from = +el.dataset.v || 0; el.dataset.v = v;
  if (from === v) { el.textContent = fmt(v); return; }
  const t0 = performance.now(), d = 900;
  const step = (t) => { const k = Math.min(1, (t - t0) / d), e = 1 - (1 - k) ** 3; el.textContent = fmt(from + (v - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const sorted = () => [...(B?.schools || [])].sort((a, b) => b[sort] - a[sort]);
const rankIn = (all, key) => { const i = all.findIndex((s) => s.key === key); return i < 0 ? 0 : i + 1; };

// ---------------------------------------------------------------- 지도(전국 → 확대 → 동네 지도)
const W = 600, H = MAP.h + 6, BASE = { x: -4, y: -4, w: W, h: H }, KMAX = 10;
let view = { ...BASE };
const zoomK = () => BASE.w / view.w;
// 글자 자리: 좁은 곳(서울·인천·세종·대전·울산·부산)은 바다나 빈 곳으로 빼고 선으로 이어요
const LAB = { "경기": [228, 84], "인천": [148, 126, 1], "서울": [199, 108], "충남": [170, 232], "세종": [196, 194, 1], "대전": [262, 252, 1], "울산": [412, 312, 1], "부산": [396, 368, 1], "전남광주": [196, 395] };
const heat = (k) => { // 0~1 → 남색·파랑·하늘·연두·노랑
  const C = [[27, 37, 96], [43, 90, 168], [62, 199, 255], [156, 242, 90], [255, 210, 63]];
  const x = Math.max(0, Math.min(1, k)) * (C.length - 1), i = Math.min(C.length - 2, Math.floor(x)), f = x - i;
  return `rgb(${C[i].map((c, j) => Math.round(c + (C[i + 1][j] - c) * f)).join(",")})`;
};
const dotCol = (i, key) => (i === 0 ? "var(--gold)" : i === 1 ? "var(--silver)" : i === 2 ? "var(--bronze)" : key === MINE ? "var(--cream)" : "var(--sky)");
function mapSchools() { // 지도에 찍을 학교(우리 학교가 목록 밖이어도 넣어요)
  const S = (B?.schools || []).filter((s) => s.caught > 0 || s.key === MINE);
  if (mineInfo && !S.some((s) => s.key === MINE)) S.push(mineInfo);
  return S;
}
function drawMap() {
  const R = new Map((B?.regions || []).map((r) => [r.region, r])), max = Math.max(1, ...[...R.values()].map((r) => r[sort]));
  const all = sorted(), rank = new Map(all.map((s, i) => [s.key, i]));
  const S = mapSchools(), maxS = Math.max(1, ...S.map((s) => s.caught)), dens = Math.max(.38, Math.min(1, Math.sqrt(40 / Math.max(1, S.length)))); // 학교가 많을수록 점을 작게
  const dot = (s) => { const [x, y] = project(s.lat, s.lng), i = rank.get(s.key) ?? 1e9, r = (2.4 + Math.sqrt(s.caught / maxS) * 8.5) * dens, col = dotCol(i, s.key);
    return `<g class="dot ${i < 10 ? "top" : ""} ${s.key === MINE ? "mine" : ""}" data-k="${esc(s.key)}" style="transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(var(--ds))"><circle class="halo" r="${r.toFixed(1)}" style="stroke:${col}"></circle><circle class="core" r="${r.toFixed(1)}" style="fill:${col}"></circle></g>`; };
  // 많이 낚은 학교가 위로, 빛나는 효과는 상위 10곳·우리 학교만(학교가 수천 곳이어도 가볍게)
  const lo = S.filter((s) => (rank.get(s.key) ?? 1e9) >= 10 && s.key !== MINE).sort((a, b) => a.caught - b.caught), hi = S.filter((s) => !lo.includes(s)).sort((a, b) => (rank.get(b.key) ?? 1e9) - (rank.get(a.key) ?? 1e9));
  const box = $("map");
  box.innerHTML = `<svg viewBox="${view.x} ${view.y} ${view.w} ${view.h}" role="img" aria-label="전국 지도">
    <defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <g class="regions">${REGIONS.map((g) => { const r = R.get(g.key), v = r ? r[sort] : 0; return `<path d="${g.d}" data-r="${g.key}" class="${regionPick === g.key ? "on" : ""}" style="fill:${v ? heat(.15 + .85 * Math.sqrt(v / max)) : "#18204f"}"></path>`; }).join("")}</g>
    <g class="rlabels">${REGIONS.map((g) => { const [x, y, lead] = LAB[g.key] || [g.cx, g.cy]; return (lead ? `<line class="lead" x1="${g.cx}" y1="${g.cy}" x2="${x}" y2="${y - 3}"></line><circle class="anc" cx="${g.cx}" cy="${g.cy}" r="1.8"></circle>` : "") + `<text class="rlabel${lead ? " sm" : ""}" x="${x}" y="${y + 4}">${g.key}</text>`; }).join("")}</g>
    <g>${lo.map(dot).join("")}</g><g filter="url(#glow)">${hi.map(dot).join("")}</g>
    <g class="names" id="names"></g>
    <g transform="translate(${project(37.24, 131.87).map((v) => v.toFixed(1)).join(" ")})"><circle r="2.2" fill="#9fb0e0"></circle><text class="dokdo" x="0" y="-6" text-anchor="middle">독도</text></g>
  </svg><div class="tip" id="tip" hidden></div>
  <div class="zoom"><button data-z="in" aria-label="크게 보기">${ic("plus", 22)}</button><button data-z="out" aria-label="작게 보기"><b>−</b></button><button data-z="home" aria-label="전국 다시 보기">${ic("home", 22)}</button></div>
  <button class="kgo" id="kgo" hidden>${ic("pin", 18)} 동네 지도로 크게 보기</button>
  <div class="zhint" id="zhint">두 손가락으로 벌리거나 + 를 누르면 커져요</div>`;
  const svg = box.querySelector("svg");
  svg.querySelectorAll(".dot").forEach((d) => d.addEventListener("click", (e) => { if (moved) return; e.stopPropagation(); showTip(d.dataset.k); }));
  svg.querySelectorAll("path").forEach((p) => p.addEventListener("click", () => { if (moved) return; regionPick = regionPick === p.dataset.r ? "" : p.dataset.r; shown = PAGE; setTab("school"); }));
  svg.addEventListener("click", () => { if (!moved) $("tip").hidden = true; });
  box.querySelectorAll("[data-z]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); const z = b.dataset.z;
    if (z === "home") { view = { ...BASE }; applyView(); } else if (z === "in" && zoomK() >= KMAX - .01) openKakao(); else zoomAt(view.x + view.w / 2, view.y + view.h / 2, z === "in" ? 2 : .5); }));
  $("kgo").addEventListener("click", (e) => { e.stopPropagation(); openKakao(); });
  bindGestures(svg);
  applyView();
}
// 확대·이동: 휠 · 끌기 · 두 손가락 · 두 번 톡
function applyView() {
  const svg = $("map")?.querySelector("svg"); if (!svg) return;
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  const k = zoomK();
  svg.style.setProperty("--ds", (1 / Math.pow(k, .7)).toFixed(3));
  svg.style.setProperty("--ls", (1 / k).toFixed(3));
  svg.classList.toggle("zoomed", k > 1.4);
  $("kgo").hidden = k < 2.5; if (k < KMAX - .01) $("kgo").classList.remove("nudge"); $("zhint").hidden = k > 1.01;
  const tip = $("tip"); if (tip && !tip.hidden && tip.dataset.k) placeTip(tip.dataset.k);
  drawNames();
}
function clampView() {
  const k = zoomK(); if (k < 1) { view = { ...BASE }; return; }
  view.x = Math.max(BASE.x - view.w * .3, Math.min(BASE.x + BASE.w - view.w * .7, view.x));
  view.y = Math.max(BASE.y - view.h * .3, Math.min(BASE.y + BASE.h - view.h * .7, view.y));
}
function zoomAt(cx, cy, f) {
  const k = Math.max(1, Math.min(KMAX, zoomK() * f)), w = BASE.w / k, h = BASE.h / k;
  view = { x: cx - (cx - view.x) * (w / view.w), y: cy - (cy - view.y) * (h / view.h), w, h };
  clampView(); applyView();
}
function toSvg(svg, cx, cy) { const r = svg.getBoundingClientRect(); return [view.x + (cx - r.left) / r.width * view.w, view.y + (cy - r.top) / r.height * view.h]; }
let moved = false;
function bindGestures(svg) {
  const P = new Map(); let start = null, lastTap = 0;
  let push = 0, pushT = 0; // 가장 크게 본 뒤에도 한참 더 굴리면 동네 지도로(실수로 넘어가지 않게)
  svg.addEventListener("wheel", (e) => { e.preventDefault(); const [x, y] = toSvg(svg, e.clientX, e.clientY);
    if (e.deltaY < 0 && zoomK() >= KMAX - .01) { const t = performance.now(); if (t - pushT > 700) push = 0; pushT = t; push -= e.deltaY; $("kgo").classList.add("nudge"); if (push > 900) { push = 0; openKakao(); } return; }
    push = 0; zoomAt(x, y, Math.exp(-e.deltaY * .0025)); }, { passive: false });
  svg.addEventListener("pointerdown", (e) => {
    P.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false;
    start = { view: { ...view }, pts: [...P.values()].map((p) => ({ ...p })) };
  });
  svg.addEventListener("pointermove", (e) => {
    if (!P.has(e.pointerId) || !start) return; P.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = svg.getBoundingClientRect(), pts = [...P.values()];
    if (pts.length === 1 && start.pts.length === 1) {
      const dx = pts[0].x - start.pts[0].x, dy = pts[0].y - start.pts[0].y;
      if (Math.hypot(dx, dy) > 6) moved = true;
      if (moved && zoomK() > 1.01) { view.x = start.view.x - dx / r.width * view.w; view.y = start.view.y - dy / r.height * view.h; clampView(); applyView(); }
    } else if (pts.length >= 2 && start.pts.length >= 2) {
      moved = true;
      const d0 = Math.hypot(start.pts[0].x - start.pts[1].x, start.pts[0].y - start.pts[1].y), d1 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
      const k = Math.max(1, Math.min(KMAX, BASE.w / start.view.w * d1 / Math.max(10, d0))), w = BASE.w / k, h = BASE.h / k;
      const sx = start.view.x + ((start.pts[0].x + start.pts[1].x) / 2 - r.left) / r.width * start.view.w, sy = start.view.y + ((start.pts[0].y + start.pts[1].y) / 2 - r.top) / r.height * start.view.h;
      view = { x: sx - (mx - r.left) / r.width * w, y: sy - (my - r.top) / r.height * h, w, h }; clampView(); applyView();
    }
  });
  const up = (e) => {
    P.delete(e.pointerId);
    if (!P.size && !moved && e.type === "pointerup") { const t = performance.now(); if (t - lastTap < 300) { const [x, y] = toSvg(svg, e.clientX, e.clientY); zoomK() >= KMAX - .01 ? openKakao() : zoomAt(x, y, 2); lastTap = 0; } else lastTap = t; }
    start = P.size ? { view: { ...view }, pts: [...P.values()].map((p) => ({ ...p })) } : null;
    if (!P.size) setTimeout(() => { moved = false; }, 0);
  };
  svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  svg.style.touchAction = "none";
}
// 크게 보면 학교 이름이 나와요(보이는 곳 중 순위 높은 학교부터, 겹치면 빼요)
function drawNames() {
  const g = $("names"); if (!g) return;
  const k = zoomK(); if (k < 2.2) { g.innerHTML = ""; return; }
  const all = sorted(), rank = new Map(all.map((s, i) => [s.key, i]));
  const inView = mapSchools().map((s) => ({ s, p: project(s.lat, s.lng) })).filter(({ p }) => p[0] > view.x && p[0] < view.x + view.w && p[1] > view.y && p[1] < view.y + view.h)
    .sort((a, b) => (b.s.key === MINE) - (a.s.key === MINE) || (rank.get(a.s.key) ?? 1e9) - (rank.get(b.s.key) ?? 1e9));
  const placed = [], out = [], fs = 11 / k;
  for (const { s, p } of inView) {
    const label = s.name.replace(/등학교$/, "") + (rank.has(s.key) && rank.get(s.key) < 100 ? ` · ${rank.get(s.key) + 1}위` : "");
    const w = [...label].length * fs * .95, box = [p[0] - w / 2, p[1] - fs * 2.4, p[0] + w / 2, p[1] - fs * 1.1];
    if (placed.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) continue;
    placed.push(box); out.push(`<text class="sname${s.key === MINE ? " me" : ""}" x="${p[0].toFixed(2)}" y="${(p[1] - fs * 1.35).toFixed(2)}" style="font-size:${fs.toFixed(3)}px;stroke-width:${(3 / k).toFixed(3)}px">${esc(label)}</text>`);
    if (out.length >= 60) break;
  }
  g.innerHTML = out.join("");
}
function schoolBy(key) { return B?.schools.find((x) => x.key === key) || (mineInfo?.key === key ? mineInfo : null) || farHits?.find((x) => x.key === key) || null; }
function tipHtml(s) {
  const n = rankIn(sorted(), s.key) || s.rank?.[sort] || 0;
  return `<b>${esc(s.name)}</b><span class="r">${esc(s.region)}${s.dong ? ` ${esc(s.dong)}` : ""}${n ? ` · 전국 ${LABEL[sort]} ${fmt(n)}위` : ""}</span><br>${ic("fish")} ${fmt(s.caught)}마리 · 손맛 ${fmt(s.taste)} · 낭만 ${fmt(s.romance)}<br>${ic("rod")} 강태공 ${fmt(s.anglers)}명${s.big ? `<br>${ic("medal1")} 대어: ${esc(s.big.n)} ${s.big.cm}cm (${esc(s.big.who)})` : ""}`;
}
function placeTip(key) {
  const s = schoolBy(key), tip = $("tip"); if (!s || !tip) return;
  const [x, y] = project(s.lat, s.lng), box = $("map").getBoundingClientRect();
  const px = (x - view.x) / view.w * box.width, py = (y - view.y) / view.h * box.height;
  if (px < 0 || py < 0 || px > box.width || py > box.height) { tip.hidden = true; return; }
  tip.style.left = `${Math.min(box.width - 110, Math.max(110, px))}px`; tip.style.top = `${Math.max(90, py)}px`;
}
function showTip(key, zoom) {
  const s = schoolBy(key); if (!s) return;
  if (KM.on) return KM.focus(s);
  if (zoom) { const [x, y] = project(s.lat, s.lng), k = Math.max(zoomK(), 4), w = BASE.w / k, h = BASE.h / k; view = { x: x - w / 2, y: y - h / 2, w, h }; clampView(); applyView(); }
  const tip = $("tip"); tip.innerHTML = tipHtml(s); tip.dataset.k = key; tip.hidden = false; placeTip(key);
}

// 동네 지도(카카오) — 크게 보면 동·길 이름까지
const KM = { on: false, map: null, ovs: [], p: null };
async function kakao() {
  if (KM.p) return KM.p;
  KM.p = (async () => {
    const { KAKAO_KEY } = await import("./kakao-key.js");
    if (!window.kakao?.maps?.Map) {
      await new Promise((ok, no) => { const s = document.createElement("script"); s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false`; s.onload = ok; s.onerror = no; document.head.append(s); });
      await new Promise((ok) => window.kakao.maps.load(ok));
    }
    return window.kakao.maps;
  })();
  KM.p.catch(() => { KM.p = null; });
  return KM.p;
}
async function openKakao(center) {
  if (KM.on) return;
  const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
  const lat = center?.lat ?? MAP.lat0 - cy / MAP.k, lng = center?.lng ?? MAP.lng0 + cx / (MAP.c * MAP.k);
  const level = center ? 4 : Math.max(3, Math.min(11, Math.round(12 - Math.log2(zoomK()))));
  $("kbox").hidden = false; $("kinfo").hidden = true; KM.on = true; $("kmsg").textContent = "동네 지도를 여는 중이에요…"; $("kmsg").hidden = false;
  try {
    const K = await kakao();
    if (!KM.map) {
      KM.map = new K.Map($("kmap"), { center: new K.LatLng(lat, lng), level });
      K.event.addListener(KM.map, "idle", kDraw);
      K.event.addListener(KM.map, "zoom_changed", () => { if (KM.map.getLevel() >= 12) closeKakao(); });
    } else { KM.map.relayout(); KM.map.setLevel(level); KM.map.setCenter(new K.LatLng(lat, lng)); }
    $("kmsg").hidden = true; kDraw();
  } catch (e) { $("kmsg").textContent = "동네 지도를 열지 못했어요. 잠시 뒤 다시 해 주세요"; }
}
function closeKakao() {
  if (!KM.on) return;
  KM.on = false; $("kbox").hidden = true;
  if (KM.map) { // 보던 곳을 전국 지도에서도 이어서
    const c = KM.map.getCenter(), [x, y] = project(c.getLat(), c.getLng()), k = Math.max(1, Math.min(KMAX - 1, Math.pow(2, 12 - KM.map.getLevel())));
    view = { x: x - BASE.w / k / 2, y: y - BASE.h / k / 2, w: BASE.w / k, h: BASE.h / k }; clampView(); applyView();
  }
}
function kDraw() {
  if (!KM.map || !KM.on) return;
  const K = window.kakao.maps, b = KM.map.getBounds(), sw = b.getSouthWest(), ne = b.getNorthEast();
  KM.ovs.forEach((o) => o.setMap(null)); KM.ovs = [];
  const all = sorted(), rank = new Map(all.map((s, i) => [s.key, i]));
  const inB = mapSchools().filter((s) => s.lat > sw.getLat() && s.lat < ne.getLat() && s.lng > sw.getLng() && s.lng < ne.getLng())
    .sort((a, b2) => (rank.get(a.key) ?? 1e9) - (rank.get(b2.key) ?? 1e9)).slice(0, 150);
  for (const s of inB) {
    const i = rank.get(s.key) ?? 1e9, el = document.createElement("button");
    el.className = `kpin${s.key === MINE ? " me" : ""}${i < 3 ? ` m${i + 1}` : ""}`;
    el.innerHTML = `${i < 3 ? ic(`medal${i + 1}`, 18) : `<i style="background:${dotCol(i, s.key)}"></i>`}<b>${esc(s.name.replace(/등학교$/, ""))}</b><small>${i < 1e9 ? `${fmt(i + 1)}위 · ` : ""}${fmt(s[sort])} ${LABEL[sort]}</small>`;
    el.addEventListener("click", (e) => { e.stopPropagation(); KM.focus(s); });
    const o = new K.CustomOverlay({ position: new K.LatLng(s.lat, s.lng), content: el, yAnchor: 1.15, zIndex: s.key === MINE ? 9 : i < 3 ? 5 : 2 });
    o.setMap(KM.map); KM.ovs.push(o);
  }
  $("kcount").textContent = inB.length ? `이 화면에 ${fmt(inB.length)}곳` : "이 화면에는 아직 참여한 학교가 없어요";
}
KM.focus = (s) => { if (!KM.map) return; const K = window.kakao.maps; KM.map.panTo(new K.LatLng(s.lat, s.lng)); const t = $("kinfo"); t.innerHTML = tipHtml(s); t.hidden = false; };

// ---------------------------------------------------------------- 순위 목록
const medal = (i) => (i >= 0 && i < 3 ? ic(`medal${i + 1}`, 34) : "");
function setTab(t) {
  tab = t;
  document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  $("sorts").hidden = t === "news";
  $("findBox").hidden = t !== "school";
  render();
}
function podium(items, name, sub) {
  const top = items.slice(0, 3), order = [top[1], top[0], top[2]];
  return order.map((it, k) => { const p = [2, 1, 3][k]; return it ? `<div class="pod p${p}${it.key && it.lat ? " click" : ""}"${it.key && it.lat ? ` data-k="${esc(it.key)}"` : ""}><div class="medal">${medal(p - 1)}</div><b>${esc(name(it))}</b><small>${esc(sub(it))}</small><strong>${fmt(it[sort])}</strong></div>` : `<div class="pod p${p} empty"><div class="medal">${medal(p - 1)}</div><b>?</b><small>도전하세요!</small></div>`; }).join("");
}
const schoolRow = (s, n, max) => `<div class="row click ${s.key === MINE ? "mine" : ""}" data-k="${esc(s.key)}"><span class="no ${n && n <= 3 ? `m${n}` : ""}" style="${n >= 1000 ? "font-size:12px" : n >= 100 ? "font-size:14px" : ""}">${n ? fmt(n) : "-"}</span><span class="nm"><b>${esc(s.name)}${s.key === MINE ? " · 우리 학교" : ""}</b><small>${esc(s.region)}${s.dong ? ` ${esc(s.dong)}` : ""} · 강태공 ${fmt(s.anglers)}명${s.big ? ` · 대어 ${esc(s.big.n)} ${s.big.cm}cm` : ""}</small><span class="bar"><i style="width:${Math.max(3, Math.min(100, s[sort] / max * 100))}%"></i></span></span><span class="val"><b>${fmt(s[sort])}</b><small>${LABEL[sort]}</small></span></div>`;
const norm = (t) => String(t || "").replace(/\s+/g, "").toLowerCase();
function render() {
  if (!B) return;
  const podEl = $("podium"), list = $("list");
  drawMap();
  if (tab === "school") {
    const all = sorted().filter((s) => s[sort] > 0 || s.key === MINE), max = Math.max(1, all[0]?.[sort] || 0);
    let S = all;
    if (regionPick) S = S.filter((s) => s.region === regionPick);
    if (find) { const f = norm(find); S = S.filter((s) => norm(s.name).includes(f) || norm(s.dong).includes(f) || norm(s.region).includes(f)); }
    const filtered = !!(regionPick || find);
    podEl.hidden = !S.length || filtered; podEl.innerHTML = podium(S.filter((s) => s[sort] > 0), (s) => s.name, (s) => `${s.region} · ${s.anglers}명`);
    // 우리 학교는 늘 맨 위에 한 줄(목록 밖이어도 정확한 전국 순위)
    const me = MINE && (all.find((s) => s.key === MINE) || mineInfo);
    const meN = me ? rankIn(all, MINE) || me.rank?.[sort] : 0;
    const pin = me && !filtered ? `<div class="pinned">${schoolRow(me, meN, max)}</div>` : "";
    const head = filtered ? `<div class="sorts filt"><span>${ic(regionPick ? "pin" : "eye")} ${regionPick ? `${esc(regionPick)} ` : ""}${find ? `“${esc(find)}” ` : ""}학교 ${fmt(S.length)}곳</span><button data-clear>전체 보기</button></div>` : "";
    const start = filtered ? 0 : 3, rows = S.slice(start, start + shown);
    const extra = find && farHits ? farHits.filter((h) => !S.some((s) => s.key === h.key)) : [];
    const far = extra.length ? `<div class="farh">불러온 목록 밖에서 찾은 학교</div><div class="list">${extra.map((h) => schoolRow(h, h.rank?.[sort], max)).join("")}</div>` : "";
    list.innerHTML = head + pin + (rows.length || far ? (rows.length ? `<div class="list">${rows.map((s) => schoolRow(s, rankIn(all, s.key), max)).join("")}</div>` : "")
      + (S.length > start + shown ? `<button class="more" data-more>${fmt(Math.min(PAGE, S.length - start - shown))}곳 더 보기 <small>${fmt(start + shown)} / ${fmt(S.length)}</small></button>` : "") + far
      : (S.length && !filtered ? "" : `<div class="empty"><b>${filtered ? "찾는 학교가 없어요" : "아직 기록이 없어요"}</b>${filtered ? (find && B.more && !farHits ? "전국에서 찾는 중이에요…" : "이름을 다시 확인해 주세요.") : "첫 번째 강태공이 되어 우리 학교를 지도에 올려 보세요!"}</div>`));
    list.querySelector("[data-clear]")?.addEventListener("click", () => { regionPick = ""; find = ""; $("findQ").value = ""; farHits = null; shown = PAGE; render(); });
    list.querySelector("[data-more]")?.addEventListener("click", () => { shown += PAGE; render(); });
    [...list.querySelectorAll("[data-k]"), ...podEl.querySelectorAll("[data-k]")].forEach((r) => r.addEventListener("click", () => { showTip(r.dataset.k, true); $("map").scrollIntoView({ behavior: "smooth", block: "nearest" }); }));
  } else if (tab === "region") {
    const R = [...B.regions].filter((r) => r[sort] > 0).sort((a, b) => b[sort] - a[sort]), max = Math.max(1, ...R.map((r) => r[sort]));
    const mineR = (B.schools.find((s) => s.key === MINE) || mineInfo)?.region;
    podEl.hidden = !R.length; podEl.innerHTML = podium(R, (r) => r.region, (r) => `${fmt(r.schools)}개 학교`);
    list.innerHTML = R.length ? `<div class="list">${R.slice(3).map((r, i) => `<div class="row click ${r.region === mineR ? "mine" : ""}" data-r="${esc(r.region)}"><span class="no">${i + 4}</span><span class="nm"><b>${esc(r.region)}</b><small>${fmt(r.schools)}개 학교 · 강태공 ${fmt(r.anglers)}명 · ${fmt(r.caught)}마리</small><span class="bar"><i style="width:${Math.max(3, r[sort] / max * 100)}%"></i></span></span><span class="val"><b>${fmt(r[sort])}</b><small>${LABEL[sort]}</small></span></div>`).join("")}</div>`
      : `<div class="empty"><b>아직 기록이 없어요</b>우리 지역을 처음으로 밝혀 보세요!</div>`;
    list.querySelectorAll("[data-r]").forEach((r) => r.addEventListener("click", () => { regionPick = r.dataset.r; shown = PAGE; setTab("school"); }));
  } else if (tab === "angler") {
    const A = [...B.anglers].sort((a, b) => b[sort] - a[sort]).filter((a) => a[sort] > 0);
    podEl.hidden = !A.length; podEl.innerHTML = podium(A, (a) => a.name, (a) => a.school);
    list.innerHTML = A.length ? `<div class="list">${A.slice(3, 3 + shown).map((a, i) => `<div class="row"><span class="no">${i + 4}</span><span class="nm"><b>${esc(a.name)}</b><small>${esc(a.school)} · ${esc(a.region)}</small><span class="chips3"><span>${ic("fish")} <b>${fmt(a.caught)}</b>마리</span><span>손맛 <b>${fmt(a.taste)}</b></span><span>낭만 <b>${fmt(a.romance)}</b></span>${a.big ? `<span>대어 <b>${esc(a.big.n)} ${a.big.cm}cm</b></span>` : ""}</span></span><span class="val"><b>${fmt(a[sort])}</b><small>${LABEL[sort]}</small></span></div>`).join("")}</div>`
      + (A.length > 3 + shown ? `<button class="more" data-more>더 보기</button>` : "")
      : `<div class="empty"><b>아직 강태공이 없어요</b>첫 물고기를 낚으면 여기에 이름이 올라가요!</div>`;
    list.querySelector("[data-more]")?.addEventListener("click", () => { shown += PAGE; render(); });
  } else {
    podEl.hidden = true;
    list.innerHTML = B.bigs.length ? `<div class="news">${B.bigs.map((b) => { const [icn, cls] = TIER_IC[b.tier] || [b.grade === "월척" ? "bigfish" : "fish", ""];
      return `<div><span class="ic ${cls}">${ic(icn, 26)}</span><p><b>${esc(b.school)}</b> ${esc(b.who)} 강태공이 <b>${esc(b.grade === "월척" ? "월척 " : "")}${esc(b.n)}</b>(${b.cm}cm · ${b.kg >= 1 ? b.kg.toFixed(1) + "kg" : Math.round(b.kg * 1000) + "g"})를 낚았어요!<small>${esc(b.region)} · ${ago(b.at)}</small></p></div>`; }).join("")}</div>`
      : `<div class="empty"><b>아직 대어 소식이 없어요</b>월척·전설·보스 물고기를 낚으면 전국에 소식이 퍼져요!</div>`;
  }
}
const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? "방금" : s < 3600 ? `${Math.floor(s / 60)}분 전` : s < 86400 ? `${Math.floor(s / 3600)}시간 전` : `${Math.floor(s / 86400)}일 전`; };

// 학교 찾기: 불러온 목록에서 먼저, 학교가 아주 많으면 서버에서 이름 앞글자로도
let findT = 0;
$("findQ").addEventListener("input", (e) => {
  find = e.target.value.trim(); shown = PAGE; farHits = null; render();
  clearTimeout(findT);
  if (find.length >= 2 && B?.more) findT = setTimeout(async () => { const q = find; try { const r = await (await api())("school", { q }); if (q === find) { farHits = r.list || []; render(); } } catch { farHits = []; render(); } }, 450);
});

async function load() {
  try {
    B = await (await api())("board");
    const T = B.totals;
    countTo($("tSchools"), T.schools); countTo($("tAnglers"), T.anglers); countTo($("tCaught"), T.caught); countTo($("tTaste"), T.taste); countTo($("tRomance"), T.romance);
    $("liveTxt").textContent = `실시간 · ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준`;
    if (MINE && !B.schools.some((s) => s.key === MINE)) { try { mineInfo = (await (await api())("school", { key: MINE })).school; } catch { mineInfo = null; } }
    if (KM.on) kDraw();
    render();
  } catch (e) {
    $("liveTxt").textContent = "순위를 불러오지 못했어요. 잠시 뒤 다시 시도해요";
    if (!B) $("list").innerHTML = `<div class="empty"><b>연결이 잠깐 끊겼어요</b>인터넷 연결을 확인하고 새로고침해 주세요.</div>`;
  }
}
document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.tab !== "school") regionPick = ""; shown = PAGE; setTab(b.dataset.tab); }));
document.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => { sort = b.dataset.sort; document.querySelectorAll("[data-sort]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); render(); if (KM.on) kDraw(); }));
$("kback").addEventListener("click", closeKakao);
addEventListener("message", (e) => { if (e.data === "ktfish-refresh") load(); });
drawMap(); load();
setInterval(() => { if (!document.hidden && !KM.on) load(); }, 30000);
