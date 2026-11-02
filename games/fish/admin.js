// 낚시터 관리 화면: 선생님은 내 학급 기록(잡은 물고기·푼 문제), 최고 관리자는 전체 학급·선생님·오류 로그까지
// 권한은 모두 서버(fishAdmin·fishDash·fishClassList)가 검사한다. 이 화면은 보여 주기만 한다
import { FB } from "./fb-config.js";
const V = "12.13.0";
const [{ initializeApp }, A, Fn] = await Promise.all([
  import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
  import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
  import(`https://www.gstatic.com/firebasejs/${V}/firebase-functions.js`),
]);
const app = initializeApp(FB), auth = A.getAuth(app), fns = Fn.getFunctions(app, "asia-northeast3");
const call = (name, data = {}) => Fn.httpsCallable(fns, name, { timeout: 40000 })(data).then((r) => r.data);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nf = (n) => Number(n || 0).toLocaleString("ko-KR");
const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const errMsg = (e) => String(e?.message || "잠깐 문제가 생겼어요").replace(/^.*?: /, "");
function when(t) {
  if (!t) return "-";
  const d = new Date(t), s = (Date.now() - t) / 1000;
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const device = (ua = "") => /CrOS/.test(ua) ? "크롬북" : /iPad|Macintosh.*Mobile/.test(ua) ? "아이패드" : /iPhone/.test(ua) ? "아이폰" : /Android/.test(ua) ? (/Mobile/.test(ua) ? "안드로이드 폰" : "안드로이드 태블릿") : /Windows/.test(ua) ? "윈도우" : /Mac/.test(ua) ? "맥" : ua ? "기타" : "-";
const phaseName = (r) => !r?.open ? ["", "닫힘"] : r.mode === "free" ? ["free", "자유시간"] : ({ lobby: ["open", "대기실"], countdown: ["play", "곧 시작"], play: ["play", "대회 중"], done: ["open", "판 끝"] })[r.phase] || ["open", "열림"];

const S = { admin: false, ov: null, classes: [], dash: null, tab: "", cid: new URLSearchParams(location.search).get("cid") || "", clearArm: 0 };
function status(text, bad) { $("status").textContent = text; $("statusBar").classList.toggle("bad", !!bad); }

// ---------------------------------------------------------------- 로그인·역할
$("loginBtn").addEventListener("click", async () => {
  try { await A.signInWithPopup(auth, new A.GoogleAuthProvider()); }
  catch (e) { if (e?.code === "auth/popup-blocked") await A.signInWithRedirect(auth, new A.GoogleAuthProvider()); else if (e?.code !== "auth/popup-closed-by-user" && e?.code !== "auth/cancelled-popup-request") $("gateMsg").textContent = "로그인하지 못했어요. 다시 눌러 주세요."; }
});
$("logoutBtn").addEventListener("click", () => A.signOut(auth));
A.getRedirectResult(auth).catch(() => {});
A.onAuthStateChanged(auth, async (u) => {
  $("booting").hidden = true;
  if (!u) { $("gate").hidden = false; $("app").hidden = true; $("who").hidden = true; return; }
  $("gate").hidden = true; $("who").hidden = false; $("whoName").textContent = u.email || u.displayName || "";
  $("booting").hidden = false; $("booting").textContent = "권한을 확인하는 중이에요…";
  try { S.ov = await call("fishAdmin", { action: "overview" }); S.admin = true; }
  catch { S.admin = false; }
  if (!S.admin) {
    try { S.classes = (await call("fishClassList")).classes.map((c) => ({ cid: c.cid, name: c.name, code: c.code, students: c.students.length })); }
    catch (e) { $("booting").hidden = true; $("gate").hidden = false; $("gateMsg").textContent = `${errMsg(e)} 낚시터에서 선생님 가입을 마치면 볼 수 있어요.`; $("loginBtn").hidden = true; return; }
  } else S.classes = S.ov.classes;
  $("booting").hidden = true; $("app").hidden = false; $("loginBtn").hidden = false;
  $("roleTag").textContent = S.admin ? "최고 관리자" : "선생님";
  document.querySelectorAll("[data-admin]").forEach((b) => { b.hidden = !S.admin; });
  fillClassSelect();
  if (S.admin) renderOverview();
  showTab(S.cid || !S.admin ? "tabDash" : "tabOverview");
});

// ---------------------------------------------------------------- 탭·새로고침
document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
function showTab(id) {
  S.tab = id;
  document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === id)));
  document.querySelectorAll(".tab").forEach((t) => { t.hidden = t.id !== id; });
  if (id === "tabDash") loadDash();
  if (id === "tabClasses") renderClasses();
  if (id === "tabTeachers") renderTeachers();
  if (id === "tabLogs") renderLogs();
}
async function reload() {
  const b = $("reloadBtn"); b.disabled = true;
  try {
    if (S.admin) { S.ov = await call("fishAdmin", { action: "overview" }); S.classes = S.ov.classes; renderOverview(); fillClassSelect(); }
    if (S.tab === "tabDash") await loadDash(); else showTab(S.tab);
    status(`${when(Date.now())} 새로 불러왔어요`);
  } catch (e) { status(`불러오지 못했어요: ${errMsg(e)}`, true); }
  b.disabled = false;
}
$("reloadBtn").addEventListener("click", reload);
let autoT = 0;
$("autoRefresh").addEventListener("change", (e) => { clearInterval(autoT); if (e.target.checked) autoT = setInterval(() => { if (!document.hidden) reload(); }, 30000); });

// ---------------------------------------------------------------- 개요·이상 감지(최고 관리자)
function issues() {
  const out = [], logs = S.ov.logs || [], day = Date.now() - 864e5;
  const errs = logs.filter((l) => l.kind === "error" && !l.done), groups = new Map();
  for (const l of errs) { const k = String(l.msg).slice(0, 120); groups.set(k, [...(groups.get(k) || []), l]); }
  for (const [msg, list] of groups) if (list.length >= 3) out.push({ lv: "warn", title: `같은 오류가 ${list.length}번 났어요`, body: msg, tab: "tabLogs", q: msg.slice(0, 40) });
  const fresh = errs.filter((l) => l.at > day).length;
  if (fresh) out.push({ lv: "warn", title: `최근 24시간 동안 확인 안 한 오류 ${fresh}건`, body: "오류 로그에서 내용과 기기를 확인해 주세요.", tab: "tabLogs" });
  const fb = logs.filter((l) => l.kind === "feedback" && !l.done).length;
  if (fb) out.push({ lv: "info", title: `읽지 않은 의견 ${fb}건`, body: "학생·선생님이 보낸 의견이에요.", tab: "tabLogs", kind: "feedback" });
  const open = S.ov.classes.filter((c) => c.room?.open);
  if (open.length) out.push({ lv: "info", title: `지금 열린 낚시터 ${open.length}곳`, body: open.slice(0, 5).map((c) => c.name).join(", "), tab: "tabClasses", status: "open" });
  const empty = S.ov.classes.filter((c) => !c.students && Date.now() - c.createdAt > 3 * 864e5);
  if (empty.length) out.push({ lv: "info", title: `만든 지 3일이 지났는데 학생이 없는 학급 ${empty.length}개`, body: "선생님이 학급 코드를 아직 안 알려 줬을 수 있어요.", tab: "tabClasses" });
  return out;
}
function renderOverview() {
  const ov = S.ov, open = ov.classes.filter((c) => c.room?.open).length, today = ov.classes.reduce((n, c) => n + (c.today || 0), 0);
  const todo = (ov.logs || []).filter((l) => l.kind === "error" && !l.done).length;
  const tiles = [["학급", nf(ov.classes.length), `학생 ${nf(ov.classes.reduce((n, c) => n + c.students, 0))}명`], ["선생님", nf(ov.teachers?.length), "가입 코드·러닝크루"], ["낚시꾼 계정", nf(ov.fishers), "학생+구글 로그인"],
    ["지금 열린 낚시터", nf(open), "열어 둔 학급"], ["오늘 기록", nf(today), "잡은 물고기+푼 문제"], ["확인 안 한 오류", nf(todo), `최근 ${nf(ov.logs?.length)}건 중`]];
  $("tiles").innerHTML = tiles.map(([l, v, f]) => `<div class="tile"><span class="t-lbl">${l}</span><b>${v}</b><span class="t-foot">${f}</span></div>`).join("");
  const list = issues();
  $("issueCount").textContent = list.length; $("issueCount").hidden = !list.length;
  $("logCount").textContent = todo; $("logCount").hidden = !todo;
  $("issues").innerHTML = list.length ? list.map((x, i) => `<li class="${x.lv}"><span class="ico">${x.lv === "warn" ? "!" : "i"}</span><div><b>${esc(x.title)}</b><span>${esc(x.body)}</span></div><button class="btn small ghost" type="button" data-go="${i}">보러 가기</button></li>`).join("")
    : `<li class="ok"><span class="ico">✓</span><div><b>문제 없어요</b><span>반복되는 오류, 확인 안 한 오류·의견이 없어요.</span></div></li>`;
  $("issues").querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
    const x = list[+b.dataset.go];
    if (x.q !== undefined) $("logSearch").value = x.q; if (x.kind) $("logKind").value = x.kind; if (x.status) $("classStatus").value = x.status;
    showTab(x.tab);
  }));
  status(`${when(Date.now())} 불러왔어요 · 학급 ${ov.classes.length}개`);
}

// ---------------------------------------------------------------- 전체 학급·선생님
const teacherOf = (c) => { const t = S.ov.teachers?.find((x) => x.uid === c.teacher); return t?.email || t?.name || c.teacherName || "-"; };
function renderClasses() {
  const q = $("classSearch").value.trim().toLowerCase(), st = $("classStatus").value;
  const rows = S.ov.classes.filter((c) => (!q || [c.name, c.code, c.teacherName, teacherOf(c)].join(" ").toLowerCase().includes(q)) && (!st || (st === "open") === !!c.room?.open));
  $("classCount").textContent = `${rows.length}개`;
  $("classRows").innerHTML = rows.length ? rows.map((c) => { const [cls, name] = phaseName(c.room);
    return `<tr><td class="nowrap">${when(c.createdAt)}</td><td><b>${esc(c.name)}</b><span class="sub">코드 ${esc(c.code)}</span></td><td>${esc(teacherOf(c))}</td><td><span class="badge ${cls}">${name}</span></td><td class="num">${nf(c.students)}</td><td class="num">${nf(c.today)}</td><td><div class="actions"><button class="btn small ghost" type="button" data-dash="${esc(c.cid)}">기록 보기</button></div></td></tr>`; }).join("")
    : `<tr><td colspan="7" class="empty">찾는 학급이 없어요</td></tr>`;
  $("classRows").querySelectorAll("[data-dash]").forEach((b) => b.addEventListener("click", () => { S.cid = b.dataset.dash; $("dashClass").value = S.cid; showTab("tabDash"); }));
}
$("classSearch").addEventListener("input", renderClasses); $("classStatus").addEventListener("change", renderClasses);
function renderTeachers() {
  const list = S.ov.teachers || [];
  $("teacherRows").innerHTML = list.length ? list.map((t) => `<tr><td><b>${esc(t.name || "-")}</b><span class="sub">${esc(t.email || "러닝크루 교사 계정")}</span></td><td><span class="badge ${t.via}">${t.via === "code" ? "가입 코드" : "러닝크루"}</span></td><td class="nowrap">${when(t.joinedAt)}</td><td class="num">${nf(t.classes)}</td></tr>`).join("")
    : `<tr><td colspan="4" class="empty">아직 가입한 선생님이 없어요</td></tr>`;
}

// ---------------------------------------------------------------- 오류 로그·의견
function renderLogs() {
  const q = $("logSearch").value.trim().toLowerCase(), kind = $("logKind").value, done = $("logDone").value;
  const rows = (S.ov.logs || []).filter((l) => (!kind || l.kind === kind) && (!done || (done === "done") === !!l.done) && (!q || [l.msg, l.name, l.email, l.url].join(" ").toLowerCase().includes(q)));
  $("logInfo").textContent = `${rows.length}건`;
  $("logRows").innerHTML = rows.length ? rows.map((l) => `<tr class="${l.done ? "done" : ""}"><td class="nowrap">${when(l.at)}</td><td><span class="badge ${l.kind === "error" ? "err" : "fb"}">${l.kind === "error" ? "오류" : "의견"}</span></td>
    <td>${esc(l.name || "-")}<span class="sub">${esc(l.email || (l.key?.startsWith("s_") ? "학생" : ""))}</span></td>
    <td class="msgcell">${esc(l.msg)}${l.stack || l.url ? `<details><summary>자세히</summary><pre>${esc(l.url)}\n${esc(l.stack)}</pre></details>` : ""}</td>
    <td class="nowrap">${device(l.ua)}</td><td><div class="actions"><button class="btn small ghost" type="button" data-done="${esc(l.id)}">${l.done ? "다시 열기" : "확인했어요"}</button></div></td></tr>`).join("")
    : `<tr><td colspan="6" class="empty">${done === "todo" ? "확인할 오류·의견이 없어요" : "찾는 기록이 없어요"}</td></tr>`;
  $("logRows").querySelectorAll("[data-done]").forEach((b) => b.addEventListener("click", async () => {
    const l = S.ov.logs.find((x) => x.id === b.dataset.done); b.disabled = true;
    try { await call("fishAdmin", { action: "done", id: l.id, done: !l.done }); l.done = !l.done; renderLogs(); renderOverview(); }
    catch (e) { status(`바꾸지 못했어요: ${errMsg(e)}`, true); b.disabled = false; }
  }));
}
["logSearch", "logKind", "logDone"].forEach((id) => $(id).addEventListener(id === "logSearch" ? "input" : "change", renderLogs));
$("clearLogs").addEventListener("click", async () => {
  const b = $("clearLogs");
  if (Date.now() > S.clearArm) { S.clearArm = Date.now() + 4000; b.textContent = "한 번 더 누르면 지워요"; setTimeout(() => { b.textContent = "오류 로그 모두 지우기"; }, 4000); return; }
  S.clearArm = 0; b.disabled = true;
  try { const r = await call("fishAdmin", { action: "clearErrors" }); status(`오류 로그 ${r.removed}건을 지웠어요. 의견은 남겨 뒀어요`); await reload(); }
  catch (e) { status(`지우지 못했어요: ${errMsg(e)}`, true); }
  b.disabled = false; b.textContent = "오류 로그 모두 지우기";
});

// ---------------------------------------------------------------- 학급 기록(대시보드)
function fillClassSelect() {
  const sel = $("dashClass");
  sel.innerHTML = S.classes.length ? S.classes.map((c) => `<option value="${esc(c.cid)}">${esc(c.name)} · ${esc(c.code)}${S.admin && c.teacherName ? ` (${esc(c.teacherName)})` : ""}</option>`).join("") : `<option value="">학급이 없어요</option>`;
  if (S.cid && S.classes.some((c) => c.cid === S.cid)) sel.value = S.cid; else S.cid = sel.value;
}
$("dashClass").addEventListener("change", (e) => { S.cid = e.target.value; history.replaceState(null, "", `?cid=${encodeURIComponent(S.cid)}`); loadDash(); });
$("dashDays").addEventListener("change", loadDash);
let dashSeq = 0;
async function loadDash() {
  if (!S.cid) { $("dashBody").innerHTML = `<div class="panel empty">아직 학급이 없어요. 낚시터에서 <b>낚시 학급</b>을 만들면 여기에 기록이 모여요.</div>`; return; }
  const seq = ++dashSeq; $("dashInfo").textContent = "불러오는 중이에요…";
  try {
    const d = await call("fishDash", { cid: S.cid, days: +$("dashDays").value });
    if (seq !== dashSeq) return;
    S.dash = d; renderDash(d);
    $("dashInfo").textContent = `${when(Date.now())} 불러왔어요${d.truncated ? " · 기록이 많아 최근 5,000건만 모았어요" : ""}`;
    if (!S.admin) status(`${d.name} 학급 기록이에요`);
  } catch (e) { if (seq === dashSeq) { $("dashInfo").textContent = ""; $("dashBody").innerHTML = `<div class="panel empty">${esc(errMsg(e))}</div>`; } }
}
const rateBar = (r, n) => `<div class="pct"><div class="bar ${n ? (r >= 80 ? "ok" : r >= 50 ? "mid" : "low") : ""}"><i style="width:${n ? r : 0}%"></i></div><span>${n ? `${r}%` : "-"}</span></div>`;
function renderDash(d) {
  const T = d.totals, rate = pctOf(T.right, T.quiz);
  const tiles = [["참여한 학생", `${nf(T.active)}<small>/ ${nf(T.students)}명</small>`, "기간 안에 낚시하거나 문제를 푼 학생"], ["잡은 물고기", nf(T.catch), `${d.species.length}종`],
    ["푼 문제", nf(T.quiz), `맞힌 문제 ${nf(T.right)}개`], ["정답률", `${rate}<small>%</small>`, T.quiz ? "던지기 전 + 낚는 중" : "아직 푼 문제가 없어요"], ["문제 틀려서 놓친 물고기", nf(T.escaped), "낚는 도중 문제에서"]];
  const maxDay = Math.max(1, ...d.daily.map((x) => x.catch + x.quiz)), maxSp = Math.max(1, ...d.species.map((x) => x.count));
  const empty = !T.catch && !T.quiz;
  $("dashBody").innerHTML = `<div class="tiles five">${tiles.map(([l, v, f]) => `<div class="tile"><span class="t-lbl">${l}</span><b>${v}</b><span class="t-foot">${f}</span></div>`).join("")}</div>
  ${empty ? `<div class="panel empty">이 기간에는 기록이 없어요.<br>학생이 학급 코드로 들어와 낚시하거나 문제를 풀면 여기에 모여요. 기간을 늘려 볼 수도 있어요.</div>` : ""}
  <div class="panel">
    <h2 class="sec">학생별 기록 <small>잡은 물고기 많은 순 · 정답률은 던지기 전 문제와 낚는 중 문제를 합쳐서</small></h2>
    <div class="scroll"><table><thead><tr><th>이름</th><th class="num">잡은 물고기</th><th class="num">손맛</th><th>가장 멋진 물고기</th><th class="num">푼 문제</th><th>정답률</th><th class="num">문제로 놓침</th><th>마지막 활동</th></tr></thead><tbody>
    ${d.students.length ? d.students.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td class="num">${nf(s.catch)}</td><td class="num">${nf(s.taste)}</td><td>${s.best ? `${esc(s.best.n)} <span class="muted">${s.best.cm}cm · ${esc(s.best.grade)}</span>` : `<span class="muted">-</span>`}</td><td class="num">${nf(s.quiz)}</td><td>${rateBar(pctOf(s.right, s.quiz), s.quiz)}</td><td class="num">${s.escaped ? nf(s.escaped) : `<span class="muted">0</span>`}</td><td class="nowrap muted">${s.last ? when(s.last) : "아직 없음"}</td></tr>`).join("")
      : `<tr><td colspan="8" class="empty">아직 들어온 학생이 없어요. 칠판에 학급 코드 <b>${esc(d.code)}</b>를 적어 주세요.</td></tr>`}
    </tbody></table></div>
  </div>
  <div class="panel" style="margin-top:16px">
    <h2 class="sec">문제별 정답률 <small>어려워한 문제부터 · 많이 고른 오답을 보면 헷갈린 부분을 알 수 있어요</small></h2>
    <div class="scroll"><table><thead><tr><th>문제</th><th class="num">푼 횟수</th><th>정답률</th><th>가장 많이 고른 오답</th><th class="num">낚는 중</th></tr></thead><tbody>
    ${d.questions.length ? d.questions.map((q) => { const r = pctOf(q.right, q.n), wrong = q.picks.map((n, i) => [n || 0, i]).filter(([, i]) => i !== q.a).sort((a, b) => b[0] - a[0])[0];
      return `<tr><td class="qtext"><b>${esc(q.q)}</b><span class="sub">정답: ${esc(q.o[q.a] ?? "")}</span></td><td class="num">${nf(q.n)}</td><td>${rateBar(r, q.n)}</td><td>${wrong && wrong[0] ? `${esc(q.o[wrong[1]] ?? "")} <span class="muted">${wrong[0]}번</span>` : `<span class="muted">-</span>`}</td><td class="num">${nf(q.fight)}</td></tr>`; }).join("")
      : `<tr><td colspan="5" class="empty">아직 푼 문제가 없어요. 낚시 학급에서 <b>문제 풀기</b>를 켜고 CSV로 문제를 올리면 학생이 던질 때마다 풀어요.</td></tr>`}
    </tbody></table></div>
  </div>
  <div class="grid2">
    <div class="panel"><h2 class="sec">날짜별 활동 <small>파랑 높이 = 잡은 물고기 + 푼 문제</small></h2>
      ${d.daily.length ? `<div class="days">${d.daily.slice(-31).map((x) => `<div title="${x.d} · 물고기 ${x.catch} · 문제 ${x.quiz}"><i style="height:${Math.round(((x.catch + x.quiz) / maxDay) * 100)}%"></i><small>${x.d.slice(5).replace("-", "/")}</small></div>`).join("")}</div>` : `<p class="empty">기록이 없어요</p>`}
      <h2 class="sec" style="margin-top:18px">많이 잡은 물고기</h2>
      ${d.species.length ? `<div class="hbars">${d.species.slice(0, 10).map((x) => `<div><span>${esc(x.n)} <span class="muted">${esc(x.tier)}</span></span><div class="bar"><i style="width:${Math.round((x.count / maxSp) * 100)}%"></i></div><span class="num">${nf(x.count)}</span></div>`).join("")}</div>` : `<p class="empty">아직 잡은 물고기가 없어요</p>`}
    </div>
    <div class="panel"><h2 class="sec">최근 기록 <small>최근 80건</small></h2>
      ${d.recent.length ? `<ul class="feed">${d.recent.map((e) => `<li><time>${when(e.at)}</time><span><b>${esc(e.name)}</b> ${e.t === "catch" ? `${esc(e.sp)} ${e.cm}cm${e.grade ? ` · ${esc(e.grade)}` : ""}를 잡았어요` : `${e.ctx === "fight" ? "낚는 중 " : ""}문제 「${esc(String(e.q).slice(0, 40))}」 <span class="${e.ok ? "ok" : "no"}">${e.ok ? "맞힘" : `틀림${e.ctx === "fight" ? " · 놓침" : ""}`}</span>`}</span></li>`).join("")}</ul>` : `<p class="empty">아직 기록이 없어요</p>`}
    </div>
  </div>`;
}
$("csvBtn").addEventListener("click", () => {
  const d = S.dash; if (!d) return;
  const cell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [["이름", "잡은 물고기", "손맛", "가장 멋진 물고기", "크기(cm)", "푼 문제", "맞힌 문제", "정답률(%)", "문제로 놓친 물고기", "마지막 활동"],
    ...d.students.map((s) => [s.name, s.catch, s.taste, s.best?.n || "", s.best?.cm || "", s.quiz, s.right, s.quiz ? pctOf(s.right, s.quiz) : "", s.escaped, s.last ? new Date(s.last).toLocaleString("ko-KR") : ""])];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv" }));
  a.download = `${d.name}_낚시터_기록_${$("dashDays").selectedOptions[0].textContent}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
