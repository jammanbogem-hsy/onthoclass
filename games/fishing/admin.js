// 전국 강태공 대결 — 최고 관리자 화면(선생님·방·오류/의견·전국 합계). 권한은 서버가 이메일로 검사
import { FB } from "./fb-config.js";
const V = "12.13.0";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Math.round(n || 0).toLocaleString("ko-KR");
const day = (t) => t ? new Date(t).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

const [{ initializeApp }, A, Fn] = await Promise.all([import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`), import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`), import(`https://www.gstatic.com/firebasejs/${V}/firebase-functions.js`)]);
const app = initializeApp(FB, "ktadmin"), auth = A.getAuth(app), fnc = Fn.httpsCallable(Fn.getFunctions(app, "asia-northeast3"), "ktApi", { timeout: 60000 });
const call = (op, d = {}) => fnc({ ...d, op }).then((r) => r.data);
let D = null, tab = "teachers";

$("out").addEventListener("click", () => A.signOut(auth));
A.onAuthStateChanged(auth, async (u) => {
  $("out").hidden = !u;
  if (!u) { $("main").innerHTML = `<div class="center"><p>관리자 구글 계정으로 로그인해 주세요.</p><button class="big" id="in">구글로 로그인</button></div>`; $("in").addEventListener("click", () => A.signInWithPopup(auth, new A.GoogleAuthProvider()).catch(() => A.signInWithRedirect(auth, new A.GoogleAuthProvider()))); return; }
  load();
});
async function load() {
  $("main").innerHTML = `<p class="center">불러오는 중…</p>`;
  try { D = await call("admin"); render(); }
  catch (e) { $("main").innerHTML = `<div class="center"><p>${esc(e?.message?.replace(/^.*?: /, "") || "볼 수 없어요")}</p></div>`; }
}
function render() {
  const T = D.board.totals, open = D.rooms.filter((r) => r.room.open).length, errs = D.logs.filter((l) => l.kind === "error" && !l.done).length, fb = D.logs.filter((l) => l.kind === "feedback" && !l.done).length;
  let body = "";
  if (tab === "teachers") body = `<table><thead><tr><th>이름</th><th>이메일</th><th>학교</th><th>지역</th><th class="n">방</th><th>가입</th><th></th></tr></thead><tbody>${D.teachers.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(t.email)}</td><td>${esc(t.school)}</td><td>${esc(t.region)}</td><td class="n">${t.rooms}</td><td>${day(t.joinedAt)}</td><td>${t.blocked ? `<span class="pill bad">막힘</span> <button class="sbtn" data-block="${t.uid}" data-v="0">풀기</button>` : `<button class="sbtn warn" data-block="${t.uid}" data-v="1">막기</button>`}</td></tr>`).join("") || `<tr><td colspan="7">아직 없어요</td></tr>`}</tbody></table>`;
  else if (tab === "rooms") body = `<table><thead><tr><th>방</th><th>코드</th><th>학교</th><th>선생님</th><th class="n">학생</th><th>상태</th><th>만든 날</th><th></th></tr></thead><tbody>${D.rooms.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.code)}</td><td>${esc(r.school)} <small>${esc(r.region)}</small></td><td>${esc(r.teacherName)}</td><td class="n">${r.players}</td><td><span class="pill ${r.room.open ? "on" : ""}">${esc(r.room.phase)}</span></td><td>${day(r.createdAt)}</td><td><button class="sbtn" data-room="${r.rid}">결과</button></td></tr>`).join("") || `<tr><td colspan="8">아직 없어요</td></tr>`}</tbody></table>`;
  else if (tab === "schools") body = `<table><thead><tr><th>#</th><th>학교</th><th>지역</th><th class="n">강태공</th><th class="n">마리</th><th class="n">손맛</th><th class="n">낭만</th></tr></thead><tbody>${D.board.schools.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.region)}</td><td class="n">${fmt(s.anglers)}</td><td class="n">${fmt(s.caught)}</td><td class="n">${fmt(s.taste)}</td><td class="n">${fmt(s.romance)}</td></tr>`).join("")}</tbody></table>`;
  else body = `<div style="display:flex;gap:8px;margin-bottom:8px"><button class="sbtn warn" data-clear>오류 로그 비우기</button></div>${D.logs.filter((l) => tab === "logs" ? l.kind === "error" : l.kind === "feedback").map((l) => `<div class="log ${l.done ? "done" : ""}"><small>${day(l.at)} · ${esc(l.who || "익명")} · ${esc(l.url)}</small><p>${esc(l.msg)}</p>${l.stack ? `<pre>${esc(l.stack)}</pre>` : ""}<small>${esc(l.ua)}</small> <button class="sbtn" data-done="${l.id}" data-v="${l.done ? 0 : 1}">${l.done ? "다시 열기" : "확인함"}</button></div>`).join("") || "<p>없어요</p>"}`;
  $("main").innerHTML = `<div class="kpis"><div class="kpi"><small>선생님</small><b>${D.teachers.length}</b></div><div class="kpi"><small>방(열림)</small><b>${D.rooms.length} <small>(${open})</small></b></div><div class="kpi"><small>참여 학교</small><b>${fmt(T.schools)}</b></div><div class="kpi"><small>강태공</small><b>${fmt(T.anglers)}</b></div><div class="kpi"><small>잡은 물고기</small><b>${fmt(T.caught)}</b></div><div class="kpi"><small>손맛</small><b>${fmt(T.taste)}</b></div><div class="kpi"><small>낭만</small><b>${fmt(T.romance)}</b></div></div>
    <div class="tabs">${[["teachers", "선생님"], ["rooms", "방"], ["schools", "학교 순위"], ["feedback", `의견 ${fb || ""}`], ["logs", `오류 ${errs || ""}`]].map(([k, t]) => `<button data-tab="${k}" aria-selected="${tab === k}">${t}</button>`).join("")}<button data-reload>새로고침</button></div><div class="card">${body}</div>`;
  const on = (sel, fn) => $("main").querySelectorAll(sel).forEach((x) => x.addEventListener("click", () => fn(x)));
  on("[data-tab]", (x) => { tab = x.dataset.tab; render(); });
  on("[data-reload]", load);
  on("[data-block]", async (x) => { await call("admin", { action: "block", uid: x.dataset.block, blocked: x.dataset.v === "1" }); const t = D.teachers.find((y) => y.uid === x.dataset.block); t.blocked = x.dataset.v === "1"; render(); });
  on("[data-done]", async (x) => { await call("admin", { action: "done", id: x.dataset.done, done: x.dataset.v === "1" }); D.logs.find((y) => y.id === x.dataset.done).done = x.dataset.v === "1"; render(); });
  on("[data-clear]", async () => { const r = await call("admin", { action: "clearErrors" }); D.logs = D.logs.filter((l) => l.kind !== "error"); render(); alert(`${r.removed}개 지웠어요`); });
  on("[data-room]", async (x) => {
    $("modal").hidden = false; $("sheet").innerHTML = "불러오는 중…";
    const R = await call("admin", { action: "room", rid: x.dataset.room });
    $("sheet").innerHTML = `<h2 style="margin-top:0">${esc(R.name)} <small>${esc(R.school?.name || "")} · ${esc(R.code)}</small></h2><table><thead><tr><th>이름</th><th class="n">마리</th><th class="n">손맛</th><th class="n">낭만</th><th class="n">정답</th></tr></thead><tbody>${R.students.map((s) => `<tr><td>${esc(s.name)}</td><td class="n">${s.caught}</td><td class="n">${fmt(s.taste)}</td><td class="n">${s.romance}</td><td class="n">${s.right}/${s.quiz}</td></tr>`).join("")}</tbody></table><p><button class="sbtn" onclick="document.getElementById('modal').hidden=true">닫기</button></p>`;
  });
}
$("modal").addEventListener("click", (e) => { if (e.target === $("modal")) $("modal").hidden = true; });
