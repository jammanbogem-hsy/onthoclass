// 전국 강태공 대결 — 선생님 화면: 구글 로그인 → 학교 등록 → 방 만들기 → 칠판 화면(대기실·시작·순위·시상대) → 결과
// 서버: functions/src/fishingShare.ts (ktApi 하나, op 로 나뉨)
import { FB } from "./fb-config.js";
import { SETS } from "./sets.js?v=1";
import { MAP, REGIONS } from "./korea.js?v=1";

const V = "12.13.0";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Math.round(n || 0).toLocaleString("ko-KR");
let toastT = 0;
function toast(msg, ms = 2600) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }

let S = null;
async function sdk() {
  if (S) return S;
  const [{ initializeApp }, A, Fn] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-functions.js`),
  ]);
  const app = initializeApp(FB, "ktteacher"), auth = A.getAuth(app), f = Fn.httpsCallable(Fn.getFunctions(app, "asia-northeast3"), "ktApi", { timeout: 30000 });
  S = { A, auth, call: (op, d = {}) => f({ ...d, op }).then((r) => r.data) };
  return S;
}
const msgOf = (e) => e?.message?.replace(/^.*?: /, "") || "잠깐 문제가 생겼어요. 다시 해 주세요";
async function call(op, d, quiet) { try { return await (await sdk()).call(op, d); } catch (e) { if (!quiet) toast(msgOf(e)); throw e; } }

let ME = null, ROOMS = [];
const views = ["vLoading", "vLogin", "vSignup", "vHome", "vDash"];
const show = (v) => { views.forEach((x) => { $(x).hidden = x !== v; }); scrollTo(0, 0); };

// ---------------------------------------------------------------- 로그인
async function login() {
  const { A, auth } = await sdk(), p = new A.GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
  try { await A.signInWithPopup(auth, p); }
  catch (e) { if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(e?.code)) await A.signInWithRedirect(auth, p); else if (!["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(e?.code)) toast("로그인하지 못했어요. 다시 눌러 주세요"); }
}
$("loginBtn").addEventListener("click", login);
$("logoutBtn").addEventListener("click", async () => { const { A, auth } = await sdk(); await A.signOut(auth); });
$("adminLink").addEventListener("click", () => { location.href = "admin.html"; });

(async () => {
  try {
    const { A, auth } = await sdk();
    A.getRedirectResult(auth).catch(() => {});
    A.onAuthStateChanged(auth, async (u) => {
      $("logoutBtn").hidden = !u;
      if (!u) { ME = null; $("adminLink").hidden = true; show("vLogin"); return; }
      show("vLoading");
      try { ME = await call("me"); } catch { show("vLogin"); return; }
      $("adminLink").hidden = ME.role !== "admin";
      if (ME.role === "blocked") { show("vLogin"); toast("이 계정은 지금 쓸 수 없어요. 관리자에게 알려 주세요", 6000); return; }
      if (!ME.teacher) openSignup(); else openHome();
    });
  } catch { show("vLogin"); toast("연결이 잠깐 끊겼어요. 새로고침해 주세요"); }
})();

// ---------------------------------------------------------------- 학교 등록(카카오 장소 검색 → 이름·주소·위치)
let PICK = null, kakaoP = null;
function loadKakao() {
  if (kakaoP) return kakaoP;
  kakaoP = (async () => {
    const { KAKAO_KEY } = await import("./kakao-key.js");
    if (!KAKAO_KEY) throw new Error("no key");
    await new Promise((ok, no) => { const s = document.createElement("script"); s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false&libraries=services`; s.onload = ok; s.onerror = no; document.head.append(s); });
    await new Promise((ok) => window.kakao.maps.load(ok));
    return new window.kakao.maps.services.Places();
  })();
  kakaoP.catch(() => { kakaoP = null; });
  return kakaoP;
}
const REGION_LIST = REGIONS.map((r) => r.key).sort((a, b) => a.localeCompare(b, "ko"));
$("mRegion").innerHTML = `<option value="">시·도</option>` + REGION_LIST.map((r) => `<option>${r}</option>`).join("");
function openSignup(change = false) {
  show("vSignup"); PICK = null; renderPick();
  $("suTitle").textContent = change ? "학교를 바꿔요" : "어느 학교 선생님이세요?";
  $("suSub").textContent = change ? "바꾸면 새로 만드는 방부터 새 학교로 기록돼요." : "학교를 등록하면 학생들이 잡은 물고기가 우리 학교 점수로 전국 지도에 올라가요.";
  $("suCancel").hidden = !change; $("suOk").textContent = change ? "학교 바꾸기" : "학교 등록하기";
  $("tName").value = ME?.teacher?.name || (ME?.name ? `${String(ME.name).slice(0, 1)} 선생님` : "");
  $("schoolQ").value = ""; $("schoolRes").innerHTML = ""; $("suErr").textContent = "";
  setTimeout(() => $("schoolQ").focus(), 60);
  loadKakao().catch(() => {});
}
async function searchSchool() {
  const q = $("schoolQ").value.trim(), box = $("schoolRes");
  if (q.length < 2) { toast("학교 이름을 두 글자 이상 써 주세요"); return; }
  box.innerHTML = `<p class="muted">찾는 중…</p>`;
  let ps; try { ps = await loadKakao(); } catch { box.innerHTML = ""; manual(true); toast("검색을 쓸 수 없어서 직접 쓰기로 바꿨어요"); return; }
  ps.keywordSearch(q, (data, status) => {
    const list = status === window.kakao.maps.services.Status.OK ? data.filter((d) => /학교|초등|중학|고등|학원|school/i.test(d.place_name + d.category_name)) : [];
    if (!list.length) { box.innerHTML = `<p class="muted">'${esc(q)}'(으)로 찾은 학교가 없어요. 이름을 줄여서 다시 찾아 보거나, 아래 '직접 쓰기'를 눌러 주세요.</p>`; return; }
    box.innerHTML = list.slice(0, 15).map((d, i) => `<button type="button" data-i="${i}"><b>${esc(d.place_name)}</b><small>${esc(d.road_address_name || d.address_name)}</small></button>`).join("");
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { const d = list[+b.dataset.i]; PICK = { id: d.id, name: d.place_name, addr: d.address_name || d.road_address_name, lat: +d.y, lng: +d.x }; renderPick(); }));
  }, { category_group_code: "SC4", size: 15 });
}
function manual(on) { $("suManual").hidden = !on; $("suSearch").hidden = on; if (on) { PICK = null; renderPick(); $("mName").value = $("schoolQ").value.trim(); setTimeout(() => $("mRegion").focus(), 50); } updOk(); }
function manualPick() {
  const r = $("mRegion").value, n = $("mName").value.trim(), g = REGIONS.find((x) => x.key === r);
  if (!r || !n || !g) return null;
  return { name: n, addr: `${r} ${n}`, region: r, lat: MAP.lat0 - g.cy / MAP.k, lng: MAP.lng0 + g.cx / (MAP.c * MAP.k) };
}
function renderPick() {
  const el = $("suPicked");
  el.hidden = !PICK;
  if (PICK) { el.innerHTML = `<div class="picked"><span class="pin">📍</span><div><b>${esc(PICK.name)}</b><small>${esc(PICK.addr)}</small></div><button type="button" class="btn sm ghost" id="pickRe">다시 고르기</button></div>`; $("pickRe").addEventListener("click", () => { PICK = null; renderPick(); $("suSearch").hidden = false; $("schoolQ").focus(); }); $("suSearch").hidden = true; }
  updOk();
}
const updOk = () => { $("suOk").disabled = !(PICK || (!$("suManual").hidden && manualPick())); };
$("schoolGo").addEventListener("click", searchSchool);
$("schoolQ").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); searchSchool(); } });
$("manualOpen").addEventListener("click", () => manual(true));
$("manualClose").addEventListener("click", () => manual(false));
$("mRegion").addEventListener("change", updOk); $("mName").addEventListener("input", updOk);
$("suCancel").addEventListener("click", () => openHome());
$("suOk").addEventListener("click", async () => {
  const school = PICK || manualPick(); if (!school) return;
  const b = $("suOk"); b.disabled = true; $("suErr").textContent = "";
  try { const r = await call("signup", { school, name: $("tName").value }, true); ME.teacher = { name: r.name, school: r.school }; if (ME.role === "user") ME.role = "teacher"; toast(`${r.school.name}, 등록했어요!`); openHome(); }
  catch (e) { $("suErr").textContent = msgOf(e); b.disabled = false; }
});

// ---------------------------------------------------------------- 홈: 내 방들
const studentUrl = (code) => `${location.origin}${location.pathname.replace(/[^/]*$/, "")}?code=${code}`;
const PHASE_TXT = { closed: ["닫힘", ""], lobby: ["대기실 열림", "open"], countdown: ["곧 시작", "play"], play: ["대결 중", "play"], done: ["한 판 끝", "open"], free: ["자유시간", "play"] };
const placeTxt = (p) => (p === "sea" ? "🌊 바다" : "🏞️ 민물");
async function openHome() {
  show("vHome");
  const s = ME.teacher.school;
  $("hSchool").textContent = s.name;
  $("hSchoolSub").innerHTML = `${esc(s.region)} · ${esc(ME.teacher.name || "")}<button id="chSchool">학교 바꾸기</button>`;
  $("chSchool").addEventListener("click", () => openSignup(true));
  $("roomsBox").innerHTML = `<p class="muted">방을 불러오는 중…</p>`;
  try { ROOMS = (await call("roomList")).rooms; } catch { ROOMS = []; }
  renderRooms();
}
function renderRooms() {
  const box = $("roomsBox");
  if (!ROOMS.length) {
    box.innerHTML = `<div class="card emptyhome"><h2>첫 대결 방을 만들어 볼까요?</h2><p>방을 만들면 6자리 코드와 QR이 생겨요.<br>칠판(TV)에 띄우고 학생들이 들어오면 <b>다 같이 시작</b>을 눌러요.</p><button class="btn big" data-new>＋ 새 대결 방 만들기</button></div>`;
  } else {
    box.innerHTML = `<div class="rooms">${ROOMS.map((r) => { const ph = r.room.phase, [pt, pc] = PHASE_TXT[ph] || PHASE_TXT.closed;
      return `<div class="card room"><div class="rh"><h3>${esc(r.name)}</h3><span class="pill ${pc}">${pt}</span></div>
        <div class="code">${esc(r.code)}</div>
        <div class="meta"><span>${placeTxt(r.room.place)}</span><span>한 판 ${Math.round(r.room.roundSec / 60)}분</span><span>${r.room.quizN ? `📝 ${esc(r.room.setName || "문제")} ${r.room.quizN}개` : "문제 없음"}</span><span>👥 ${r.players}명</span></div>
        <div class="acts"><button class="btn sm" data-host="${r.rid}">칠판에 띄우기 ▶</button><button class="btn sm ghost" data-dash="${r.rid}">결과</button><button class="btn sm ghost" data-more="${r.rid}" aria-label="더 보기">⋯</button></div>
        <div class="acts" data-moreb="${r.rid}" hidden style="grid-template-columns:1fr 1fr"><button class="btn sm ghost" data-rename="${r.rid}">이름 바꾸기</button><button class="btn sm warn" data-del="${r.rid}">방 지우기</button></div></div>`; }).join("")}
      <button class="newroom" data-new><i>＋</i>새 대결 방</button></div>`;
  }
  box.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", openCreate));
  box.querySelectorAll("[data-host]").forEach((b) => b.addEventListener("click", () => openHost(b.dataset.host)));
  box.querySelectorAll("[data-dash]").forEach((b) => b.addEventListener("click", () => openDash(b.dataset.dash)));
  box.querySelectorAll("[data-more]").forEach((b) => b.addEventListener("click", () => { const m = box.querySelector(`[data-moreb="${b.dataset.more}"]`); m.hidden = !m.hidden; }));
  box.querySelectorAll("[data-rename]").forEach((b) => b.addEventListener("click", async () => {
    const r = ROOMS.find((x) => x.rid === b.dataset.rename), name = prompt("새 방 이름", r.name); if (!name?.trim()) return;
    try { const x = await call("roomRename", { rid: r.rid, name }); r.name = x.name; renderRooms(); } catch {}
  }));
  box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "정말 지울까요? 한 번 더"; setTimeout(() => { delete b.dataset.sure; b.textContent = "방 지우기"; }, 3000); return; }
    b.disabled = true;
    try { await call("roomDelete", { rid: b.dataset.del }); ROOMS = ROOMS.filter((x) => x.rid !== b.dataset.del); renderRooms(); toast("방을 지웠어요. 전국 순위 점수는 그대로 남아요"); } catch { b.disabled = false; }
  }));
}
$("newRoomBtn").addEventListener("click", openCreate);

// ---------------------------------------------------------------- 새 방 만들기
let C = { set: "none", csv: null, place: "fresh", roundSec: 180 };
function seg(id, key) {
  $(id).querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { C[key] = key === "roundSec" ? +b.dataset.v : b.dataset.v; $(id).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));
}
seg("cPlace", "place"); seg("cTime", "roundSec");
function renderSets() {
  const opts = [{ id: "none", name: "문제 없이 낚시만", tag: "바로 시작" }, ...SETS.map((s) => ({ id: s.id, name: s.name, tag: `${s.tag} · ${s.quiz.length}문제` })), { id: "csv", name: "내 문제 올리기", tag: C.csv ? `CSV · ${C.csv.length}문제` : "CSV 파일" }];
  $("cSets").innerHTML = opts.map((o) => `<button type="button" class="opt" data-set="${o.id}" aria-pressed="${C.set === o.id}"><b>${esc(o.name)}</b><small>${esc(o.tag)}</small></button>`).join("");
  $("cSets").querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => { C.set = b.dataset.set; renderSets(); }));
  $("csvBox").hidden = C.set !== "csv";
}
function openCreate() {
  C = { set: SETS[0]?.id || "none", csv: C.csv, place: "fresh", roundSec: 180 };
  $("cName").value = ""; $("cErr").textContent = "";
  ["cPlace", "cTime"].forEach((id) => $(id).querySelectorAll("button").forEach((x, i) => x.setAttribute("aria-pressed", String(i === 0))));
  renderSets(); $("mCreate").hidden = false; setTimeout(() => $("cName").focus(), 60);
}
$("mCreate").addEventListener("click", (e) => { if (e.target === $("mCreate") || e.target.closest("[data-close]")) $("mCreate").hidden = true; });
// CSV: 문제,보기1,보기2,보기3,보기4,정답(번호 1~4 또는 보기 글자). 큰따옴표·쉼표·줄바꿈 칸 지원, 첫 줄 제목은 건너뜀
function parseQuizCsv(text) {
  const rows = [], t = text.replace(/^﻿/, ""); let row = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  let bad = 0; const quiz = [];
  rows.forEach((r, k) => {
    let v = r.map((x) => x.trim()); while (v.length && !v[v.length - 1]) v.pop();
    if (!v.some(Boolean)) return;
    if (k === 0 && /문제|question|번호/i.test(v.join(","))) return;
    if (/^\d+$/.test(v[0]) && v.length >= 4 && !/^\d+$/.test(v[1])) v = v.slice(1); // 맨 앞 '번호' 칸이 있으면 뺀다
    const opts = v.slice(1, -1).filter(Boolean), ans = v[v.length - 1];
    let a = /^\d+$/.test(ans) ? +ans - 1 : opts.indexOf(ans);
    if (!v[0] || opts.length < 2 || a < 0 || a >= opts.length) { bad++; return; }
    quiz.push({ q: v[0], o: opts.slice(0, 5), a });
  });
  return { quiz: quiz.slice(0, 300), bad };
}
$("csvFile").addEventListener("change", async (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  let text = await f.text(); if (/�/.test(text)) { try { text = new TextDecoder("euc-kr").decode(await f.arrayBuffer()); } catch {} } // 엑셀 기본 CSV(EUC-KR)도 읽기
  const { quiz, bad } = parseQuizCsv(text); e.target.value = "";
  if (!quiz.length) { toast("문제를 읽지 못했어요. 템플릿 형식을 확인해 주세요"); return; }
  C.csv = quiz; C.set = "csv"; renderSets();
  const p = $("csvPrev"); p.hidden = false;
  p.innerHTML = `<b>${quiz.length}문제를 읽었어요${bad ? ` · 읽지 못한 줄 ${bad}개` : ""}</b><ol>${quiz.slice(0, 30).map((q) => `<li>${esc(q.q)} → <b>${esc(q.o[q.a])}</b></li>`).join("")}</ol>${quiz.length > 30 ? `<small>…그리고 ${quiz.length - 30}문제 더</small>` : ""}`;
});
$("csvTpl").addEventListener("click", () => {
  const rows = [["문제", "보기1", "보기2", "보기3", "보기4", "정답"], ["물고기는 무엇으로 숨을 쉴까요?", "아가미", "허파", "코", "피부", "1"], ["바다 = ?", "river", "sea", "sky", "", "2"], ["7 × 8 = ?", "54", "56", "64", "48", "2"]];
  const csv = "﻿" + rows.map((r) => r.map((c) => /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(",")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "강태공_문제_템플릿.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("createForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("cName").value.trim(); if (!name) { $("cErr").textContent = "방 이름을 써 주세요"; $("cName").focus(); return; }
  let quiz = [], setName = "";
  if (C.set === "csv") { if (!C.csv?.length) { $("cErr").textContent = "CSV 파일을 골라 주세요"; return; } quiz = C.csv; setName = "내 문제"; }
  else if (C.set !== "none") { const s = SETS.find((x) => x.id === C.set); quiz = s.quiz; setName = s.name; }
  const b = $("cOk"); b.disabled = true; b.textContent = "만드는 중…";
  try {
    const r = await call("roomCreate", { name, quiz, setName, place: C.place, roundSec: C.roundSec }, true);
    $("mCreate").hidden = true; toast(`'${r.name}' 방을 만들었어요`);
    await call("roomSet", { rid: r.rid, open: true }, true).catch(() => {});
    openHost(r.rid); openHome();
  } catch (err) { $("cErr").textContent = msgOf(err); }
  b.disabled = false; b.textContent = "방 만들고 칠판에 띄우기";
});

// ---------------------------------------------------------------- 칠판 화면(블루킷처럼): 대기실 → 다 같이 시작 → 실시간 순위 → 시상대
let HOST = null;
const hnow = () => Date.now() + (HOST?.skew || 0);
const hphase = (r) => { if (!r?.open || r.closesAt < hnow()) return "closed"; if (r.mode === "free") return "free"; if (r.phase !== "countdown" && r.phase !== "play" && r.phase !== "done") return "lobby"; const n = hnow(); return n < r.startAt ? "countdown" : n < r.endAt ? "play" : "done"; };
const CHIP_COL = ["#ffd23f", "#3ec7ff", "#9cf25a", "#ff6bb5", "#b26bff", "#ff9f43", "#5ee0c0", "#ff8fb8"];
const chipCol = (n) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CHIP_COL[h % CHIP_COL.length]; };
function qrSvg(text) { try { const q = window.qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 0, scalable: true }); } catch { return ""; } }
function openHost(rid) {
  closeHost();
  HOST = { rid, d: null, skew: 0, ph: "", busy: false, seen: new Set(), kick: "" };
  $("host").hidden = false; document.body.style.overflow = "hidden"; renderHost(); pollHost();
  HOST.tick = setInterval(tickHost, 250);
}
function closeHost() { if (!HOST) return; clearTimeout(HOST.t); clearInterval(HOST.tick); HOST = null; $("host").hidden = true; document.body.style.overflow = ""; if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); if (!$("vHome").hidden) openHome(); }
async function pollHost() {
  if (!HOST) return; const h = HOST;
  try {
    const t0 = Date.now(), r = await call("lobby", { rid: h.rid }, true); if (HOST !== h) return;
    h.skew = r.room.now - (t0 + Date.now()) / 2;
    const key = JSON.stringify({ ...r, room: { ...r.room, now: 0 } }); h.d = r; if (key !== h.key) { h.key = key; renderHost(); }
  } catch (e) { if (HOST === h && !h.d) { $("host").innerHTML = `<div class="hostp"><div class="hmid"><h2>방을 열지 못했어요</h2><p>${esc(msgOf(e))}</p><button class="hbtn" data-hclose>돌아가기</button></div></div>`; $("host").querySelector("[data-hclose]").addEventListener("click", closeHost); return; } }
  if (HOST === h) h.t = setTimeout(pollHost, document.hidden ? 5000 : 2000);
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
  call("roomSet", { rid: h.rid, ...extra }).then((r) => { if (HOST !== h) return; h.d.room = { ...r.room }; h.skew = r.room.now - Date.now(); if (extra.start) h.d.players.forEach((p) => { p.pts = 0; p.n = 0; }); })
    .catch(() => {}).finally(() => { h.busy = false; if (HOST === h) { h.key = ""; renderHost(); } });
}
async function nationalRank(h) { // 한 판이 끝나면 우리 학교 전국 순위를 한 줄로
  if (h.nat !== undefined) return; h.nat = null;
  try { const B = await call("board", {}, true), key = h.d.school?.key, S = [...B.schools].sort((a, b) => b.taste - a.taste), i = S.findIndex((s) => s.key === key);
    if (HOST === h) { h.nat = i >= 0 ? { n: i + 1, of: S.filter((s) => s.taste > 0).length, s: S[i] } : null; renderHost(); } } catch {}
}
function renderHost() {
  const el = $("host"); if (!HOST) return;
  const d = HOST.d; if (!d) { el.innerHTML = `<div class="hostp"><div class="hmid"><h2>불러오는 중…</h2></div></div>`; return; }
  const r = d.room, ph = hphase(r), P = d.players, here = P.filter((p) => p.here), b = HOST.busy ? "disabled" : "";
  if (HOST.ph !== ph) { HOST.seen = new Set(); if (ph !== "done") HOST.nat = undefined; }
  HOST.ph = ph; const seen = HOST.seen;
  const url = studentUrl(d.code), short = url.replace(/^https?:\/\//, "").replace(/\?code=.*/, "");
  const rank = [...P].filter((p) => p.n || p.pts || p.here).sort((a, b2) => b2.pts - a.pts);
  const chips = (list) => list.map((p) => `<button class="hchip ${seen.has(p.pid) ? "old" : ""} ${HOST.kick === p.pid ? "kick" : ""}" style="--c:${chipCol(p.name)}" data-kick="${p.pid}" title="눌러서 내보내기">${HOST.kick === p.pid ? "내보낼까요?" : esc(p.name)}</button>`).join("");
  const ctl = `<div class="hctl"><div class="grp"><small>낚시터</small>${[["fresh", "🏞️ 민물"], ["sea", "🌊 바다"]].map(([v, t]) => `<button class="${r.place === v ? "on" : ""}" data-hplace="${v}" ${b}>${t}</button>`).join("")}</div>
    <div class="grp"><small>한 판</small>${[180, 300, 420, 600].map((v) => `<button class="${r.roundSec === v ? "on" : ""}" data-hsec="${v}" ${b}>${v / 60}분</button>`).join("")}</div>
    ${r.quizN ? `<div class="grp"><small>문제 ${r.quizN}개</small><button class="${r.quizOn ? "on" : ""}" data-hquiz="1" ${b}>켜기</button><button class="${r.quizOn ? "" : "on"}" data-hquiz="0" ${b}>끄기</button></div>` : ""}</div>`;
  const joinBox = `<div class="hjoin"><div class="qr">${qrSvg(url)}</div><div class="hcode"><small>방 코드</small><b>${esc(d.code)}</b><div class="url">태블릿·크롬북 주소창에 <em>${esc(short)}</em> → 코드 입력<br>또는 카메라로 QR을 찍어요</div></div></div>`;
  let main = "";
  if (ph === "closed") main = `<div class="hmid"><h2>방이 닫혀 있어요</h2><p>열면 학생이 코드로 들어올 수 있어요.</p><button class="hstart" data-hopen ${b}>방 열기</button></div>`;
  else if (ph === "lobby") main = `${joinBox}<div class="hcount"><b>${here.length}</b>명 들어왔어요</div>
    <div class="hchips">${chips(here) || `<div class="hhow"><b>학생에게 이렇게 알려 주세요</b><br>① 카메라로 QR을 찍거나 주소창에 <b>${esc(short)}</b><br>② 방 코드 <b>${esc(d.code)}</b> 입력 → 이름 쓰기<br><small style="color:#9fb0e0">들어온 학생 이름이 여기에 떠요</small></div>`}</div>
    <div class="hmid" style="padding:4px 0"><button class="hstart" data-hstart ${b || (here.length ? "" : "disabled")}>${HOST.busy ? "시작하는 중…" : "다 같이 시작하기 ▶"}</button>${here.length ? "" : `<p style="margin-top:12px;font-size:16px">학생이 1명 이상 들어오면 시작할 수 있어요</p>`}</div>${ctl}`;
  else if (ph === "countdown") main = `<div class="hmid" style="padding-top:8vh"><h2>준비!</h2><div class="hclock" data-hclock>${Math.max(1, Math.ceil((r.startAt - hnow()) / 1000))}</div></div>`;
  else if (ph === "play" || ph === "free") main = `<div class="hclock" data-hclock>${ph === "free" ? "자유시간" : "0:00"}</div><div class="hcount" style="font-size:18px">${here.length}명 낚시 중 · 코드 <b style="font-size:22px;color:#ffd23f">${esc(d.code)}</b> (늦게 와도 들어올 수 있어요)</div>
    <div class="hrank">${rank.slice(0, 12).map((p, i) => `<div><i>${i + 1}</i><span>${esc(p.name)}</span><em style="--w:${rank[0]?.pts ? Math.max(4, p.pts / rank[0].pts * 100) : 4}%;--c:${chipCol(p.name)}"></em><b>${fmt(p.pts)}</b><small>${p.n}마리</small></div>`).join("") || `<p class="hmid" style="font-family:var(--ui);color:#9fb0e0">첫 물고기를 기다리는 중…</p>`}</div>
    <div class="hbig"><button class="hbtn" data-hlobby ${b}>이번 판 끝내기</button></div>`;
  else { // done
    nationalRank(HOST);
    const top = rank.slice(0, 3), order = [top[1], top[0], top[2]], nat = HOST.nat;
    main = `<div class="hmid" style="padding-bottom:0"><h2>🏆 대결 끝!</h2></div><div class="podium">${order.map((p, k) => p ? `<div class="pod p${[2, 1, 3][k]}"><i>${["🥈", "🥇", "🥉"][k]}</i><span>${esc(p.name)}</span><b>${fmt(p.pts)}</b><small>${p.n}마리</small></div>` : `<div class="pod empty"></div>`).join("")}</div>
      ${nat ? `<p class="hnational">우리 학교 <b>${esc(d.school?.name || "")}</b>는 지금 전국 <b>${nat.n}위</b>예요! <span style="color:#9fb0e0">(${nat.of}개 학교 중 · 손맛 ${fmt(nat.s.taste)})</span></p>` : ""}
      <div class="hrank">${rank.slice(3, 15).map((p, i) => `<div><i>${i + 4}</i><span>${esc(p.name)}</span><em style="--w:${rank[0]?.pts ? Math.max(4, p.pts / rank[0].pts * 100) : 4}%;--c:${chipCol(p.name)}"></em><b>${fmt(p.pts)}</b><small>${p.n}마리</small></div>`).join("")}</div>
      <div class="hbig"><button class="btn big" data-hlobby ${b}>한 판 더 하기</button><a class="btn big ghost" href="rank.html?school=${encodeURIComponent(d.school?.key || "")}" target="_blank" rel="noopener">🗺️ 전국 순위 보기</a></div>${ctl}`;
  }
  here.forEach((p) => seen.add(p.pid));
  el.innerHTML = `<div class="hostp"><div class="hbar"><div class="ttl">${esc(d.name)}<small>${esc(d.school?.name || "")} · ${r.quizOn ? `문제 ${r.quizN}개` : "문제 없이"} · ${placeTxt(r.place)} · 한 판 ${Math.round(r.roundSec / 60)}분</small></div>
    <button class="hbtn" data-hfull>⛶ 전체 화면</button>${ph !== "closed" ? `<button class="hbtn" data-hclose2 ${b}>방 닫기</button>` : ""}<button class="hbtn" data-hclose>✕ 나가기</button></div>${main}</div>`;
  tickHost();
  const on = (sel, fn) => el.querySelectorAll(sel).forEach((x) => x.addEventListener("click", fn));
  on("[data-hclose]", closeHost);
  on("[data-hfull]", () => { if (document.fullscreenElement) document.exitFullscreen?.(); else $("host").requestFullscreen?.().catch(() => toast("이 기기는 전체 화면을 지원하지 않아요")); });
  on("[data-hstart]", () => hostAct({ start: true }));
  on("[data-hlobby]", () => hostAct({ lobby: true }));
  on("[data-hopen]", () => hostAct({ open: true }));
  on("[data-hclose2]", () => hostAct({ open: false }));
  el.querySelectorAll("[data-hplace]").forEach((x) => x.addEventListener("click", () => { if (x.dataset.hplace !== HOST.d.room.place) hostAct({ place: x.dataset.hplace }); }));
  el.querySelectorAll("[data-hsec]").forEach((x) => x.addEventListener("click", () => { if (+x.dataset.hsec !== HOST.d.room.roundSec) hostAct({ roundSec: +x.dataset.hsec }); }));
  el.querySelectorAll("[data-hquiz]").forEach((x) => x.addEventListener("click", () => hostAct({ quizOn: x.dataset.hquiz === "1" })));
  el.querySelectorAll("[data-kick]").forEach((x) => x.addEventListener("click", async () => {
    const pid = x.dataset.kick;
    if (HOST.kick !== pid) { HOST.kick = pid; renderHost(); setTimeout(() => { if (HOST?.kick === pid) { HOST.kick = ""; renderHost(); } }, 3000); return; }
    HOST.kick = ""; try { await call("kick", { rid: HOST.rid, pid }); HOST.d.players = HOST.d.players.filter((p) => p.pid !== pid); renderHost(); toast("내보냈어요"); } catch {}
  }));
}
addEventListener("keydown", (e) => { if (e.key === "Escape" && HOST && !document.fullscreenElement) closeHost(); });

// ---------------------------------------------------------------- 결과(방별 대시보드)
let DASH = null, dSort = "taste";
async function openDash(rid) {
  show("vDash"); $("vDash").innerHTML = `<p class="muted">결과를 불러오는 중…</p>`;
  try { DASH = await call("dash", { rid }); DASH.rid = rid; renderDash(); } catch { openHome(); }
}
function renderDash() {
  const D = DASH, T = D.totals, rate = T.quiz ? Math.round(T.right / T.quiz * 100) : 0;
  const st = [...D.students].sort((a, b) => dSort === "name" ? a.name.localeCompare(b.name, "ko") : (b[dSort] || 0) - (a[dSort] || 0));
  $("vDash").innerHTML = `<div class="dashhead"><button class="btn sm ghost" data-back>← 내 방들</button><h1>${esc(D.name)} 결과</h1><button class="btn sm ghost" data-csv>엑셀(CSV)로 받기</button><button class="btn sm" data-host>칠판에 띄우기 ▶</button></div>
    <div class="kpis"><div class="kpi"><small>참여 학생</small><b>${T.students}명</b></div><div class="kpi"><small>잡은 물고기</small><b>${fmt(T.caught)}</b></div><div class="kpi"><small>손맛 합계</small><b>${fmt(T.taste)}</b></div><div class="kpi"><small>낭만 합계</small><b>${fmt(T.romance)}</b></div><div class="kpi"><small>문제 정답률</small><b>${T.quiz ? rate + "%" : "-"}</b></div></div>
    <div class="two"><div class="card"><h2 style="font-size:18px;margin-bottom:8px">학생별</h2><div class="tblwrap"><table class="tbl"><thead><tr>
      ${[["name", "이름", ""], ["caught", "마리", "n"], ["taste", "손맛", "n"], ["romance", "낭만", "n"], ["right", "정답", "n"]].map(([k, t, c]) => `<th class="${c}" data-sort="${k}">${t}${dSort === k ? " ▾" : ""}</th>`).join("")}<th>가장 큰 물고기</th></tr></thead><tbody>
      ${st.map((s) => `<tr><td>${esc(s.name)}</td><td class="n">${fmt(s.caught)}</td><td class="n">${fmt(s.taste)}</td><td class="n">${fmt(s.romance)}</td><td class="n">${s.quiz ? `${s.right}/${s.quiz}` : "-"}</td><td>${s.best ? `${esc(s.best.n)} ${s.best.cm}cm <small class="muted">${esc(s.best.grade)}</small>` : "-"}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">아직 들어온 학생이 없어요</td></tr>`}</tbody></table></div></div>
    <div style="display:flex;flex-direction:column;gap:14px"><div class="card"><h2 style="font-size:18px;margin-bottom:4px">문제별 정답률 <small class="muted" style="font-size:12px">어려운 문제부터</small></h2>
      ${D.questions.length ? D.questions.slice(0, 40).map((q) => { const p = Math.round(q.right / q.n * 100); return `<div class="qrow"><p>${esc(q.q)}</p><div class="bar"><i style="width:${p}%"></i></div><small>정답률 ${p}% (${q.right}/${q.n}) · 정답 ${esc(q.o[q.a] || "")}${q.picks.map((c, i) => c && i !== q.a ? ` · ${esc(q.o[i])} ${c}명` : "").join("")}</small></div>`; }).join("") : `<p class="muted">아직 푼 문제가 없어요</p>`}</div>
      <div class="card"><h2 style="font-size:18px;margin-bottom:8px">잡힌 물고기</h2><div class="spchips">${D.species.map((s) => `<span>${esc(s.n)} <b>${s.count}</b></span>`).join("") || `<span class="muted">아직 없어요</span>`}</div></div></div></div>`;
  const v = $("vDash");
  v.querySelector("[data-back]").addEventListener("click", openHome);
  v.querySelector("[data-host]").addEventListener("click", () => openHost(D.rid));
  v.querySelectorAll("[data-sort]").forEach((th) => th.addEventListener("click", () => { dSort = th.dataset.sort; renderDash(); }));
  v.querySelector("[data-csv]").addEventListener("click", () => {
    const rows = [["이름", "마리", "손맛", "낭만", "푼 문제", "맞힌 문제", "가장 큰 물고기", "크기(cm)"], ...D.students.map((s) => [s.name, s.caught, s.taste, s.romance, s.quiz, s.right, s.best?.n || "", s.best?.cm || ""])];
    const csv = "﻿" + rows.map((r) => r.map((c) => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(",")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `${D.name}_강태공_결과.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}
