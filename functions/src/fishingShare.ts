/**
 * 전국 강태공 대결(jammanboeng.web.app/fishing/) 서버 — 다른 선생님에게 나눠 주는 공유용 낚시 게임
 *
 * 나의 /fish(잠만보 낚시터, fishing.ts)와 데이터·함수가 완전히 따로다(kt* 컬렉션, 함수 하나 ktApi).
 *  - 선생님: 구글 로그인 + 학교 등록(카카오 장소 검색으로 고른 학교 이름·주소·위도·경도) → ktTeachers/{uid}
 *  - 방: 선생님이 만든 대결 방(6자리 코드). 학교 정보가 방에 박혀서, 그 방에 들어온 학생은 그 학교로 지도에 찍힌다
 *  - 학생: 방 코드 + 이름만(구글 계정·입장번호 없음) → 입장권 st(해시만 저장) → 이후 모든 요청에 st
 *  - 전국 순위: 학교별 합계 ktSchools/{key} · 강태공 개인 ktAnglers/{rid_pid} · 대어 소식 ktBig — 누구나 읽기(ktBoard, 이름은 가림)
 * 세 점수: 손맛(잡은 물고기 화면 점수) · 마리 · 낭만(희귀한 물고기·월척·방생·처음 만난 물고기·노을/비 낚시·문제 정답)
 * 모든 쓰기는 이 함수만 한다(규칙에서 kt* 는 클라이언트 읽기·쓰기 모두 금지).
 */
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, type DocumentData } from "firebase-admin/firestore";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { SPECIES, kgOf, gradeOf, tasteOf, type Fish } from "./fishing";

const db = () => getFirestore();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const cut = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const cleanName = (n: unknown) => String(n ?? "").normalize("NFC").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 12);
const ID = /^[\w-]{1,64}$/;
const ADMINS = ["jammanbogem@gmail.com"];
const isAdmin = (req: CallableRequest) => !!req.auth?.token?.email_verified && ADMINS.includes(String(req.auth.token.email || "").toLowerCase());
const CODE_CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0·O·1·I 빼고
const HERE_MS = 30e3, GAP_MS = 3000, PLAYER_MAX = 60, CATCH_MAX = 400;

// ---------------------------------------------------------------- 지역(시·도) — 카카오 주소 첫 낱말을 짧은 이름으로
// 2026-07-01 전남광주통합특별시 출범: 광주·전남 → "전남광주" 하나로 묶어요(예전 기록도 순위에서 합쳐 보여요)
export const REGIONS = ["서울", "부산", "대구", "인천", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남광주", "경북", "경남", "제주"] as const;
const normRegion = (r: string) => (r === "광주" || r === "전남" ? "전남광주" : r);
function regionOf(addr: string): string {
  const w = addr.trim().split(/\s+/)[0] || "";
  const M: [RegExp, string][] = [[/^서울/, "서울"], [/^부산/, "부산"], [/^대구/, "대구"], [/^인천/, "인천"], [/^대전/, "대전"], [/^울산/, "울산"], [/^세종/, "세종"],
    [/^경기/, "경기"], [/^강원/, "강원"], [/^(충북|충청북)/, "충북"], [/^(충남|충청남)/, "충남"], [/^(전북|전라북)/, "전북"], [/^(전남|전라남|광주)/, "전남광주"],
    [/^(경북|경상북)/, "경북"], [/^(경남|경상남)/, "경남"], [/^제주/, "제주"]];
  return M.find(([re]) => re.test(w))?.[1] || "";
}
type School = { key: string; name: string; addr: string; lat: number; lng: number; region: string };
function cleanSchool(x: unknown): School {
  const s = (x || {}) as Record<string, unknown>;
  const name = cut(s.name, 40).normalize("NFC").replace(/[<>]/g, "").trim(), addr = cut(s.addr, 120).replace(/[<>]/g, "").trim();
  const lat = Number(s.lat), lng = Number(s.lng);
  if (!name) throw new HttpsError("invalid-argument", "학교 이름을 골라 주세요.");
  if (!(lat > 33 && lat < 38.7 && lng > 124.5 && lng < 131.9)) throw new HttpsError("invalid-argument", "학교 위치를 찾지 못했어요. 목록에서 학교를 골라 주세요.");
  const region = regionOf(addr) || (REGIONS as readonly string[]).find((r) => r === normRegion(String(s.region || ""))) || "";
  if (!region) throw new HttpsError("invalid-argument", "학교 주소(시·도)를 확인해 주세요.");
  const pid = cut(s.id, 20).replace(/\D/g, "");
  return { key: pid ? `k${pid}` : `n${sha(`${name}|${region}`).slice(0, 16)}`, name, addr, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, region };
}
// 이름 가리기(전국 순위는 누구나 보니까): 김민지 → 김*지, 민지 → 민*
const mask = (n: string) => { const a = [...String(n || "")]; return a.length <= 1 ? a.join("") : a.length === 2 ? a[0] + "*" : a[0] + "*".repeat(a.length - 2) + a[a.length - 1]; };

// ---------------------------------------------------------------- 방
type Quiz = { q: string; o: string[]; a: number };
type Room = { open: boolean; closesAt: number; minutes?: number; place: "fresh" | "sea"; roundSec: number; quizOn: boolean; quiz: Quiz[]; setName?: string;
  mode?: "contest" | "free"; phase?: "lobby" | "play"; round?: number; startAt?: number; endAt?: number };
const roomOpen = (r: Room | null) => !!r && r.open && Date.now() < r.closesAt;
const roomPlaying = (r: Room | null) => roomOpen(r) && (r!.mode === "free" || (r!.phase === "play" && Date.now() >= (r!.startAt || 0) - 2000 && Date.now() < (r!.endAt || 0) + 30e3));
const phaseOf = (r: Room | null) => { if (!roomOpen(r)) return "closed"; if (r!.mode === "free") return "free"; if (r!.phase !== "play") return "lobby"; const n = Date.now(); return n < (r!.startAt || 0) ? "countdown" : n < (r!.endAt || 0) ? "play" : "done"; };
const roomPub = (r: Room | null, withQuiz = true) => r ? { open: roomOpen(r), closesAt: r.closesAt, place: r.place === "sea" ? "sea" : "fresh", roundSec: r.roundSec, quizOn: !!r.quizOn && r.quiz?.length > 0, quizN: r.quiz?.length || 0,
  ...(withQuiz && r.quizOn ? { quiz: r.quiz } : {}), setName: r.setName || "", minutes: r.minutes || 60, mode: r.mode || "contest", phase: phaseOf(r), round: r.round || 0, startAt: r.startAt || 0, endAt: r.endAt || 0, now: Date.now() }
  : { open: false, closesAt: 0, place: "fresh", roundSec: 180, quizOn: false, quizN: 0, setName: "", minutes: 60, mode: "contest", phase: "closed", round: 0, startAt: 0, endAt: 0, now: Date.now() };
const roomRef = (rid: string) => db().doc(`ktRooms/${rid}`);
const playersCol = (rid: string) => db().collection(`ktRooms/${rid}/players`);
const eventsCol = (rid: string) => db().collection(`ktRooms/${rid}/events`);
function cleanQuiz(v: unknown): Quiz[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 300) throw new HttpsError("invalid-argument", "문제는 300개까지 올릴 수 있어요.");
  return v.map((x) => { const q = x as Quiz; const o = Array.isArray(q?.o) ? q.o.map((s) => cut(s, 120).trim()).filter(Boolean).slice(0, 5) : [];
    return { q: cut(q?.q, 300).trim(), o, a: Math.round(Number(q?.a)) }; }).filter((q) => q.q && q.o.length >= 2 && q.a >= 0 && q.a < q.o.length);
}

// ---------------------------------------------------------------- 누가 불렀나
async function teacher(req: CallableRequest, need = true) {
  if (!req.auth) throw new HttpsError("unauthenticated", "구글로 로그인해 주세요.");
  const t = await db().doc(`ktTeachers/${req.auth.uid}`).get();
  if (need && !t.exists) throw new HttpsError("failed-precondition", "먼저 학교를 등록해 주세요.");
  if (t.data()?.blocked && !isAdmin(req)) throw new HttpsError("permission-denied", "이 계정은 지금 쓸 수 없어요. 관리자에게 알려 주세요.");
  return { uid: req.auth.uid, t: t.data() };
}
async function myRoom(req: CallableRequest, rid: string) {
  if (!ID.test(rid)) throw new HttpsError("invalid-argument", "방을 골라 주세요.");
  const { uid } = await teacher(req, !isAdmin(req));
  const s = await roomRef(rid).get();
  if (!s.exists) throw new HttpsError("not-found", "방을 찾지 못했어요.");
  if (s.data()!.teacher !== uid && !isAdmin(req)) throw new HttpsError("permission-denied", "내 방이 아니에요.");
  return s;
}
async function student(req: CallableRequest) {
  const st = req.data?.st;
  if (typeof st !== "string" || st.length < 20 || st.length > 80) throw new HttpsError("unauthenticated", "방 코드로 다시 들어와 주세요.");
  const t = await db().doc(`ktTokens/${sha(st)}`).get();
  if (!t.exists) throw new HttpsError("unauthenticated", "들어온 지 오래됐어요. 방 코드로 다시 들어와 주세요.");
  return { rid: t.data()!.rid as string, pid: t.data()!.pid as string };
}

// ---------------------------------------------------------------- 낭만 점수
const TIER_ROMANCE: Record<string, number> = { "흔함": 1, "보통": 2, "희귀": 4, "전설": 8, "보스": 15 };
function romanceOf(sp: string, grade: string, first: boolean, weather: unknown) {
  let r = TIER_ROMANCE[SPECIES[sp]?.t] || 1;
  if (grade === "월척") r += 5; else if (grade === "S급") r += 2;
  if (grade === "놔주자급") r += 3; // 작은 물고기는 놓아주는 낭만
  if (first) r += 3; // 처음 만난 물고기
  if (weather === "sunset") r += 2; else if (weather === "rain") r += 1;
  return r;
}

// ---------------------------------------------------------------- 전국 순위(누구나)
// 학교가 수천 곳이 돼도 버티게:
//  - 목록은 손맛 상위 BOARD_N 곳만(지도·순위표용). 합계·지역 대항전은 전체 학교 숫자 칸만 읽어 정확히 센다
//  - 다 만든 결과는 ktMeta/board 문서에 2분 저장(여러 서버가 같이 씀) + 서버 기억 20초 → 읽기 비용이 사람 수와 상관없음
//  - 목록 밖 학교는 op "school"(key 로 정확한 전국 순위, q 로 이름 찾기)
const BOARD_N = 2000, BIG_N = 300;
const dongOf = (addr: string) => String(addr || "").trim().split(/\s+/).slice(1, 3).join(" ");
const schoolOut = (key: string, s: DocumentData, withBig: boolean) => ({ key, name: s.name, region: normRegion(s.region), dong: dongOf(s.addr), lat: s.lat, lng: s.lng,
  caught: s.caught || 0, taste: s.taste || 0, romance: s.romance || 0, anglers: s.anglers || 0,
  big: withBig && s.big ? { n: s.big.n, cm: s.big.cm, kg: s.big.kg, grade: s.big.grade, who: mask(s.big.who) } : null });
async function buildBoard() {
  const col = db().collection("ktSchools");
  // 합계·지역 대항전은 모든 학교의 숫자 칸만 골라 읽어 정확히 센다(색인 필요 없음, 2분에 한 번)
  const [sc, an, big, nums] = await Promise.all([
    col.orderBy("taste", "desc").limit(BOARD_N).get(),
    db().collection("ktAnglers").orderBy("taste", "desc").limit(100).get(),
    db().collection("ktBig").orderBy("at", "desc").limit(20).get(),
    col.select("region", "caught", "taste", "romance", "anglers").get(),
  ]);
  const schools = sc.docs.map((d, i) => schoolOut(d.id, d.data(), i < BIG_N));
  const R = new Map<string, { region: string; schools: number; caught: number; taste: number; romance: number; anglers: number }>();
  const totals = { schools: 0, registered: 0, anglers: 0, caught: 0, taste: 0, romance: 0 };
  for (const d of nums.docs) {
    const x = d.data(), reg = normRegion(String(x.region || "")), c = Number(x.caught) || 0, t = Number(x.taste) || 0, ro = Number(x.romance) || 0, a = Number(x.anglers) || 0;
    totals.registered++; if (c > 0) totals.schools++; totals.caught += c; totals.taste += t; totals.romance += ro; totals.anglers += a;
    if (!reg || c <= 0) continue;
    const r = R.get(reg) || (R.set(reg, { region: reg, schools: 0, caught: 0, taste: 0, romance: 0, anglers: 0 }), R.get(reg)!);
    r.schools++; r.caught += c; r.taste += t; r.romance += ro; r.anglers += a;
  }
  const anglers = an.docs.map((d) => { const a = d.data(); return { name: mask(a.name), school: a.schoolName, region: normRegion(a.region), taste: a.taste || 0, caught: a.caught || 0, romance: a.romance || 0, big: a.big ? { n: a.big.n, cm: a.big.cm } : null }; });
  const bigs = big.docs.map((d) => { const b = d.data(); return { n: b.n, sp: b.sp, cm: b.cm, kg: b.kg, grade: b.grade, tier: b.tier, who: mask(b.name), school: b.schoolName, region: normRegion(b.region), at: b.at }; });
  return { schools, regions: [...R.values()], anglers, bigs, totals, more: totals.registered > schools.length, at: Date.now() };
}
let BOARD: { t: number; v: unknown } | null = null;
async function board() {
  if (BOARD && Date.now() - BOARD.t < 20e3) return BOARD.v;
  const ref = db().doc("ktMeta/board"), c = (await ref.get()).data();
  let v: unknown;
  if (c?.j && Date.now() - (c.at || 0) < 120e3) v = JSON.parse(c.j);
  else { v = await buildBoard(); const j = JSON.stringify(v); if (j.length < 900e3) await ref.set({ at: Date.now(), j }).catch(() => undefined); }
  BOARD = { t: Date.now(), v };
  return v;
}
// 학교 하나의 정확한 전국 순위(목록 밖 학교도) · 이름으로 찾기(앞글자 일치)
const SORTS = ["taste", "caught", "romance"] as const;
async function rankOf(s: DocumentData) {
  const col = db().collection("ktSchools");
  const n = await Promise.all(SORTS.map((k) => col.where(k, ">", s[k] || 0).count().get()));
  return Object.fromEntries(SORTS.map((k, i) => [k, n[i].data().count + 1]));
}
async function schoolOp({ d }: { d: Record<string, unknown> }) {
  const key = cut(d.key, 40), q = cut(d.q, 20).normalize("NFC").trim();
  if (key) {
    if (!ID.test(key)) throw new HttpsError("invalid-argument", "학교를 다시 골라 주세요.");
    const x = await db().doc(`ktSchools/${key}`).get();
    if (!x.exists) return { school: null };
    return { school: { ...schoolOut(x.id, x.data()!, true), rank: await rankOf(x.data()!) } };
  }
  if (q.length < 2) return { list: [] };
  const r = await db().collection("ktSchools").orderBy("name").startAt(q).endAt(q + "\uf8ff").limit(12).get();
  return { list: await Promise.all(r.docs.map(async (x) => ({ ...schoolOut(x.id, x.data(), true), rank: await rankOf(x.data()) }))) };
}

// ---------------------------------------------------------------- 동작들
type Ctx = { req: CallableRequest; d: Record<string, unknown> };
const OPS: Record<string, (c: Ctx) => Promise<unknown>> = {
  // 누구나: 전국 순위
  board: async () => board(),
  school: (c) => schoolOp(c),

  // ------------------------------------------------ 선생님
  // 내 정보(가입 여부·학교·관리자)
  me: async ({ req }) => {
    if (!req.auth) return { role: "" };
    const t = await db().doc(`ktTeachers/${req.auth.uid}`).get();
    return { role: isAdmin(req) ? "admin" : t.exists ? (t.data()!.blocked ? "blocked" : "teacher") : "user", teacher: t.exists ? { name: t.data()!.name, school: t.data()!.school } : null,
      email: req.auth.token.email || "", name: req.auth.token.name || "" };
  },
  // 가입(또는 학교 바꾸기): 구글 로그인 + 학교. 가입 코드 없이 누구나 — 관리자가 막을 수 있다
  signup: async ({ req, d }) => {
    if (!req.auth?.token?.email_verified) throw new HttpsError("permission-denied", "구글 계정으로 로그인해 주세요.");
    const uid = req.auth.uid, school = cleanSchool(d.school), name = cleanName(d.name) || cut(req.auth.token.name, 12) || "선생님";
    const ref = db().doc(`ktTeachers/${uid}`), old = await ref.get();
    if (old.data()?.blocked) throw new HttpsError("permission-denied", "이 계정은 지금 쓸 수 없어요. 관리자에게 알려 주세요.");
    await ref.set({ email: String(req.auth.token.email || ""), name, school, ...(old.exists ? { updatedAt: Date.now() } : { joinedAt: Date.now() }) }, { merge: true });
    // 학교 칸이 없으면 만든다(점수는 0부터). 이름·위치는 마지막 등록으로
    const sref = db().doc(`ktSchools/${school.key}`), info = { name: school.name, addr: school.addr, lat: school.lat, lng: school.lng, region: school.region };
    await db().runTransaction(async (tx) => { const s = await tx.get(sref); if (s.exists) tx.update(sref, info); else tx.create(sref, { ...info, caught: 0, taste: 0, romance: 0, anglers: 0, createdAt: Date.now() }); });
    return { ok: true, school, name };
  },
  roomCreate: async ({ req, d }) => {
    const { uid, t } = await teacher(req);
    const mine = await db().collection("ktRooms").where("teacher", "==", uid).count().get();
    if (mine.data().count >= 40) throw new HttpsError("resource-exhausted", "방은 40개까지 만들 수 있어요. 안 쓰는 방을 지워 주세요.");
    const quiz = cleanQuiz(d.quiz), room: Room = { open: false, closesAt: 0, minutes: 60, place: d.place === "sea" ? "sea" : "fresh",
      roundSec: Math.min(900, Math.max(60, Math.round(Number(d.roundSec) || 180))), quizOn: quiz.length > 0, quiz, setName: cut(d.setName, 40), mode: "contest", phase: "lobby", round: 0 };
    const name = cleanName(d.name) || "우리 반";
    for (let i = 0; i < 8; i++) {
      const code = Array.from({ length: 6 }, () => CODE_CH[randomInt(CODE_CH.length)]).join("");
      const ok = await db().runTransaction(async (tx) => {
        const c = db().doc(`ktCodes/${code}`); if ((await tx.get(c)).exists) return null;
        const ref = db().collection("ktRooms").doc();
        tx.create(c, { rid: ref.id }); tx.create(ref, { name, code, teacher: uid, teacherName: t!.name || "", school: t!.school, room, createdAt: Date.now() });
        return { rid: ref.id, code, name };
      });
      if (ok) return ok;
    }
    throw new HttpsError("internal", "코드를 만들지 못했어요. 다시 눌러 주세요.");
  },
  roomList: async ({ req }) => {
    const { uid } = await teacher(req);
    const s = await db().collection("ktRooms").where("teacher", "==", uid).get();
    const rooms = await Promise.all(s.docs.map(async (r) => {
      const n = await r.ref.collection("players").count().get(), x = r.data();
      return { rid: r.id, name: x.name, code: x.code, createdAt: x.createdAt || 0, players: n.data().count, room: roomPub(x.room || null) };
    }));
    return { rooms: rooms.sort((a, b) => b.createdAt - a.createdAt) };
  },
  roomDelete: async ({ req, d }) => {
    const s = await myRoom(req, cut(d.rid, 64));
    await db().doc(`ktCodes/${s.data()!.code}`).delete().catch(() => {});
    await db().recursiveDelete(s.ref);
    return { ok: true }; // 전국 순위에 더해진 점수는 그대로 남는다
  },
  roomRename: async ({ req, d }) => {
    const s = await myRoom(req, cut(d.rid, 64)), name = cleanName(d.name);
    if (!name) throw new HttpsError("invalid-argument", "방 이름을 써 주세요.");
    await s.ref.update({ name }); return { ok: true, name };
  },
  // 방 열기(대기실)·시작·대기실로·닫기·설정(한 판 시간·낚시터·문제·자유시간)
  roomSet: async ({ req, d }) => {
    const s = await myRoom(req, cut(d.rid, 64));
    const old: Room = s.data()!.room || { open: false, closesAt: 0, place: "fresh", roundSec: 180, quizOn: false, quiz: [] };
    const room: Room = { ...old }, now = Date.now();
    if (d.place === "fresh" || d.place === "sea") room.place = d.place;
    if (d.roundSec !== undefined) room.roundSec = Math.min(900, Math.max(60, Math.round(Number(d.roundSec) || 180)));
    if (d.quiz !== undefined) { room.quiz = cleanQuiz(d.quiz); room.setName = cut(d.setName, 40); room.quizOn = room.quiz.length > 0; }
    if (d.quizOn !== undefined) room.quizOn = !!d.quizOn && room.quiz.length > 0;
    if (d.minutes !== undefined) room.minutes = Math.min(240, Math.max(10, Math.round(Number(d.minutes) || 60)));
    if (d.mode === "contest" || d.mode === "free") { if ((room.mode || "contest") !== d.mode) { room.round = (room.round || 0) + 1; room.phase = "lobby"; } room.mode = d.mode; }
    if (d.open === true) { if (!roomOpen(room)) { room.phase = "lobby"; room.round = (room.round || 0) + 1; } room.open = true; room.closesAt = now + (room.minutes || 60) * 60e3; }
    if (d.open === false) { room.open = false; room.closesAt = 0; room.phase = "lobby"; }
    if (d.start === true) {
      if (!roomOpen(room)) { room.open = true; room.closesAt = now + (room.minutes || 60) * 60e3; }
      room.mode = "contest"; room.phase = "play"; room.round = (room.round || 0) + 1; room.startAt = now + 4000; room.endAt = room.startAt + room.roundSec * 1000;
      if (room.endAt > room.closesAt) room.closesAt = room.endAt + 10 * 60e3;
    }
    if (d.lobby === true) { room.phase = "lobby"; if (room.endAt && room.endAt > now) room.endAt = now; }
    await s.ref.update({ room });
    return { room: roomPub(room) };
  },
  // 칠판 화면: 들어온 학생·이번 판 순위
  lobby: async ({ req, d }) => {
    const s = await myRoom(req, cut(d.rid, 64)), x = s.data()!, room = (x.room as Room) || null, now = Date.now(), round = room?.round || 0;
    const ps = await playersCol(s.id).limit(PLAYER_MAX).get();
    const players = ps.docs.map((p) => { const v = p.data(), mine = v.round === round;
      return { pid: p.id, name: String(v.name || ""), here: now - (v.at || 0) < HERE_MS, pts: mine ? v.pts || 0 : 0, n: mine ? v.n || 0 : 0, romanceR: mine ? v.romanceR || 0 : 0 }; });
    return { name: x.name, code: x.code, school: x.school, room: roomPub(room, false), players };
  },
  kick: async ({ req, d }) => { // 칠판에서 이름을 눌러 내보내기(장난 이름 등)
    const s = await myRoom(req, cut(d.rid, 64)), pid = cut(d.pid, 64);
    if (!ID.test(pid)) throw new HttpsError("invalid-argument", "학생을 골라 주세요.");
    const p = await playersCol(s.id).doc(pid).get();
    if (p.data()?.tok) await db().doc(`ktTokens/${p.data()!.tok}`).delete().catch(() => {});
    await p.ref.delete(); return { ok: true };
  },
  // 방 결과: 학생별·문제별·물고기별
  dash: async ({ req, d }) => {
    const s = await myRoom(req, cut(d.rid, 64)), x = s.data()!;
    const [ps, ev] = await Promise.all([playersCol(s.id).get(), eventsCol(s.id).orderBy("at", "desc").limit(5000).get()]);
    const S = new Map(ps.docs.map((p) => { const v = p.data(); return [p.id, { pid: p.id, name: String(v.name || ""), caught: v.caught || 0, taste: v.taste || 0, romance: v.romance || 0, quiz: v.quizN || 0, right: v.quizOk || 0, best: v.big ? { n: v.big.n, cm: v.big.cm, grade: v.big.grade } : null }]; }));
    const Q = new Map<string, { q: string; o: string[]; a: number; n: number; right: number; picks: number[] }>(), SP = new Map<string, number>();
    for (const e of ev.docs.map((z) => z.data())) {
      if (e.t === "catch") SP.set(e.sp, (SP.get(e.sp) || 0) + 1);
      else if (e.t === "quiz") { const q = Q.get(e.q) || (Q.set(e.q, { q: e.q, o: e.o || [], a: e.a, n: 0, right: 0, picks: [] }), Q.get(e.q)!); q.n++; if (e.ok) q.right++; q.picks[e.pick] = (q.picks[e.pick] || 0) + 1; }
    }
    const students = [...S.values()].sort((a, b) => b.taste - a.taste);
    return { name: x.name, code: x.code, school: x.school, room: roomPub(x.room || null, false), students,
      totals: { students: students.length, caught: students.reduce((n, v) => n + v.caught, 0), taste: students.reduce((n, v) => n + v.taste, 0), romance: students.reduce((n, v) => n + v.romance, 0), quiz: students.reduce((n, v) => n + v.quiz, 0), right: students.reduce((n, v) => n + v.right, 0) },
      questions: [...Q.values()].sort((a, b) => a.right / a.n - b.right / b.n), species: [...SP.entries()].map(([sp, n]) => ({ sp, n: SPECIES[sp]?.n || sp, tier: SPECIES[sp]?.t || "", count: n })).sort((a, b) => b.count - a.count) };
  },

  // ------------------------------------------------ 학생
  codeCheck: async ({ d }) => {
    const code = String(d.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 6) throw new HttpsError("invalid-argument", "방 코드 6자리를 확인해 주세요.");
    const c = await db().doc(`ktCodes/${code}`).get();
    if (!c.exists) throw new HttpsError("not-found", "방 코드를 다시 확인해 주세요. 선생님 화면에 있는 6자리예요.");
    const r = (await roomRef(c.data()!.rid).get()).data();
    return { code, name: r?.name || "", school: r?.school?.name || "" };
  },
  // 입장: 방 코드 + 이름. 같은 이름이 지금 들어와 있으면 막고, 오래 안 보였으면 그 자리를 이어받는다(기기를 바꿔도 점수 그대로)
  join: async ({ d }) => {
    const code = String(d.code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""), name = cleanName(d.name), base = d.base === 1 ? 1 : 0;
    if (code.length !== 6) throw new HttpsError("invalid-argument", "방 코드 6자리를 확인해 주세요.");
    if (!name) throw new HttpsError("invalid-argument", "이름을 써 주세요.");
    const c = await db().doc(`ktCodes/${code}`).get();
    if (!c.exists) throw new HttpsError("not-found", "방 코드를 다시 확인해 주세요.");
    const rid = c.data()!.rid as string, room = await roomRef(rid).get(), col = playersCol(rid), now = Date.now();
    if (!room.exists) throw new HttpsError("not-found", "방이 없어졌어요. 선생님에게 말해 주세요.");
    const st = randomBytes(24).toString("base64url"), tok = sha(st);
    const pid = await db().runTransaction(async (tx) => {
      const found = await tx.get(col.where("name", "==", name).limit(1));
      if (!found.empty) {
        const p = found.docs[0], v = p.data();
        if (now - (v.at || 0) < 20e3) { // 지금 다른 기기에서 쓰는 이름(같은 기기의 예전 입장권이면 통과)
          const mine = typeof d.st === "string" && d.st.length <= 80 && sha(d.st) === v.tok;
          if (!mine) throw new HttpsError("already-exists", `'${name}' 친구가 벌써 들어와 있어요. 이름 뒤에 번호를 붙여 주세요(예: ${name}2)`);
        }
        if (v.tok) tx.delete(db().doc(`ktTokens/${v.tok}`));
        tx.update(p.ref, { tok, look: { base }, at: now });
        tx.set(db().doc(`ktTokens/${tok}`), { rid, pid: p.id, at: now });
        return p.id;
      }
      const n = await tx.get(col.limit(PLAYER_MAX));
      if (n.size >= PLAYER_MAX) throw new HttpsError("resource-exhausted", "이 방은 자리가 다 찼어요. 선생님에게 말해 주세요.");
      const ref = col.doc();
      tx.create(ref, { name, look: { base }, tok, at: now, round: 0, pts: 0, n: 0, taste: 0, caught: 0, romance: 0, quizN: 0, quizOk: 0, species: {}, createdAt: now });
      tx.set(db().doc(`ktTokens/${tok}`), { rid, pid: ref.id, at: now });
      return ref.id;
    });
    const x = room.data()!;
    return { st, pid, name, roomName: x.name || "", school: { name: x.school?.name || "", region: x.school?.region || "", key: x.school?.key || "" } };
  },
  leave: async ({ d }) => { if (typeof d.st === "string" && d.st.length <= 80) await db().doc(`ktTokens/${sha(d.st)}`).delete().catch(() => {}); return { ok: true }; },
  // 학생 내 정보 + 방
  stuMe: async ({ req }) => {
    const { rid, pid } = await student(req);
    const [p, r] = await Promise.all([playersCol(rid).doc(pid).get(), roomRef(rid).get()]);
    if (!p.exists || !r.exists) throw new HttpsError("unauthenticated", "방 코드로 다시 들어와 주세요.");
    const v = p.data()!, x = r.data()!;
    return { role: "student", me: { name: v.name, look: v.look || {}, wear: {}, taste: v.taste || 0, caught: v.caught || 0, romance: v.romance || 0, best: v.best || 0 },
      room: roomPub(x.room || null), roomName: x.name || "", school: { name: x.school?.name || "", region: x.school?.region || "", key: x.school?.key || "" } };
  },
  // 대기실: 방 상태 + 같은 방 친구 이름. here 면 "나 여기 있어요"
  room: async ({ req, d }) => {
    const { rid, pid } = await student(req);
    const r = await roomRef(rid).get(), room = (r.data()?.room as Room) || null;
    if (d.here) await playersCol(rid).doc(pid).update({ at: Date.now() }).catch(() => {});
    if (!roomOpen(room)) return { room: roomPub(room), players: [] };
    const ps = await playersCol(rid).where("at", ">", Date.now() - HERE_MS).limit(PLAYER_MAX).get();
    return { room: roomPub(room), players: ps.docs.map((p) => String(p.data().name || "")).sort((a, b) => a.localeCompare(b, "ko")) };
  },
  // 잡은 물고기 → 이번 판 순위 · 내 합계 · 학교 합계 · 전국 강태공 · 대어 소식
  catch: async ({ req, d }) => {
    const { rid, pid } = await student(req);
    const sp = String(d.sp || ""), cm = Number(d.cm), kg = Number(d.kg), S = SPECIES[sp];
    if (!S || !isFinite(cm) || !isFinite(kg)) throw new HttpsError("invalid-argument", "물고기 정보를 확인해 주세요.");
    if (cm < S.len[0] - 1 || cm > S.len[1] + 1) throw new HttpsError("invalid-argument", "물고기 크기를 다시 확인해 주세요.");
    if (kg < kgOf(sp, cm, .85) * .97 || kg > kgOf(sp, cm, 1.15) * 1.03) throw new HttpsError("invalid-argument", "물고기 무게를 다시 확인해 주세요.");
    const rs = await roomRef(rid).get(), room = (rs.data()?.room as Room) || null, school = rs.data()?.school as School | undefined;
    if (!roomPlaying(room)) throw new HttpsError("failed-precondition", "선생님이 시작하면 낚시할 수 있어요.");
    const fish: Fish = { sp, cm: Math.round(cm), kg: Math.round(kg * 1000) / 1000, grade: gradeOf((cm - S.len[0]) / (S.len[1] - S.len[0])) };
    const pref = playersCol(rid).doc(pid);
    const out = await db().runTransaction(async (tx) => {
      const p = await tx.get(pref), v = p.data(), now = Date.now();
      if (!v) throw new HttpsError("unauthenticated", "방 코드로 다시 들어와 주세요.");
      if (now - (v.lastCatchAt || 0) < GAP_MS) throw new HttpsError("resource-exhausted", "너무 빨라요! 잠깐 쉬었다 잡아요.");
      if ((v.caught || 0) >= CATCH_MAX) throw new HttpsError("resource-exhausted", "이 방에서는 충분히 잡았어요!");
      const base = tasteOf(fish), pts = Number(d.pts), taste = isFinite(pts) && pts >= 0 ? Math.min(Math.round(pts), base * 6 + 300) : base;
      const first = !(v.species || {})[sp], romance = romanceOf(sp, fish.grade, first, d.weather);
      const sameRound = v.round === room!.round, big = !v.big || fish.kg > v.big.kg;
      const upd: DocumentData = { taste: FieldValue.increment(taste), caught: FieldValue.increment(1), romance: FieldValue.increment(romance), lastCatchAt: now, [`species.${sp}`]: FieldValue.increment(1),
        round: room!.round || 0, pts: sameRound ? FieldValue.increment(taste) : taste, n: sameRound ? FieldValue.increment(1) : 1, romanceR: sameRound ? FieldValue.increment(romance) : romance };
      const run = Number(d.run); if (isFinite(run) && run > (v.best || 0) && run < 200000) upd.best = Math.round(run);
      if (big) upd.big = { sp, n: S.n, cm: fish.cm, kg: fish.kg, grade: fish.grade };
      tx.update(pref, upd);
      tx.create(eventsCol(rid).doc(), { t: "catch", pid, name: v.name || "", sp, cm: fish.cm, kg: fish.kg, grade: fish.grade, taste, romance, round: room!.round || 0, at: now });
      if (school?.key) {
        tx.set(db().doc(`ktSchools/${school.key}`), { name: school.name, addr: school.addr || "", lat: school.lat, lng: school.lng, region: school.region,
          caught: FieldValue.increment(1), taste: FieldValue.increment(taste), romance: FieldValue.increment(romance), ...(v.caught ? {} : { anglers: FieldValue.increment(1) }), updatedAt: now }, { merge: true });
        tx.set(db().doc(`ktAnglers/${rid}_${pid}`), { name: v.name || "", school: school.key, schoolName: school.name, region: school.region,
          taste: FieldValue.increment(taste), caught: FieldValue.increment(1), romance: FieldValue.increment(romance), ...(big ? { big: { n: S.n, cm: fish.cm, kg: fish.kg } } : {}), updatedAt: now }, { merge: true });
        if (fish.grade === "월척" || S.t === "전설" || S.t === "보스")
          tx.create(db().collection("ktBig").doc(), { sp, n: S.n, cm: fish.cm, kg: fish.kg, grade: fish.grade, tier: S.t, name: v.name || "", school: school.key, schoolName: school.name, region: school.region, at: now });
      }
      return { taste, romance, first, grade: fish.grade, release: fish.grade === "놔주자급" };
    });
    // 학교 대어 기록(가장 무거운 물고기) — 큰 물고기일 때만 따로 살짝(학교 칸을 여러 학생이 동시에 읽지 않게)
    if (school?.key && (fish.grade === "월척" || fish.grade === "S급" || ["희귀", "전설", "보스"].includes(S.t))) {
      const sref = db().doc(`ktSchools/${school.key}`), name = (await pref.get()).data()?.name || "";
      await db().runTransaction(async (tx) => { const s = (await tx.get(sref)).data(); if (!s?.big || fish.kg > s.big.kg) tx.update(sref, { big: { sp, n: S.n, cm: fish.cm, kg: fish.kg, grade: fish.grade, who: name } }); }).catch(() => {});
    }
    return out;
  },
  // 푼 문제(정답이면 낭만 +1). 정답 여부는 서버가 방 문제로 다시 매긴다
  quiz: async ({ req, d }) => {
    const { rid, pid } = await student(req);
    const rs = await roomRef(rid).get(), room = (rs.data()?.room as Room) || null, school = rs.data()?.school as School | undefined;
    const qi = Math.round(Number(d.qi)), pick = Math.round(Number(d.pick)), ctx = d.ctx === "fight" ? "fight" : "cast";
    const q = roomOpen(room) && room!.quizOn ? room!.quiz?.[qi] : undefined;
    if (!q || !(pick >= 0 && pick < q.o.length)) return { ok: false };
    const pref = playersCol(rid).doc(pid), ok = pick === q.a;
    return db().runTransaction(async (tx) => {
      const v = (await tx.get(pref)).data(), now = Date.now();
      if (!v || now - (v.lastQuizAt || 0) < 600) return { ok: false };
      tx.update(pref, { lastQuizAt: now, quizN: FieldValue.increment(1), ...(ok ? { quizOk: FieldValue.increment(1), romance: FieldValue.increment(1) } : {}) });
      tx.create(eventsCol(rid).doc(), { t: "quiz", pid, name: v.name || "", qi, q: q.q, o: q.o, pick, a: q.a, ok, ctx, round: room!.round || 0, at: now });
      if (ok && school?.key && v.caught) { // 학교·강태공 칸이 이미 있을 때만(물고기를 잡아야 지도에 뜬다)
        tx.set(db().doc(`ktSchools/${school.key}`), { romance: FieldValue.increment(1) }, { merge: true });
        tx.set(db().doc(`ktAnglers/${rid}_${pid}`), { romance: FieldValue.increment(1) }, { merge: true });
      }
      return { ok };
    });
  },

  // ------------------------------------------------ 오류·의견, 최고 관리자
  report: async ({ req, d }) => {
    const kind = d.kind === "feedback" ? "feedback" : "error", msg = cut(d.msg, 2000).trim();
    if (!msg) throw new HttpsError("invalid-argument", "내용을 써 주세요.");
    let who = req.auth?.token?.email ? String(req.auth.token.email) : "";
    if (!who && typeof d.st === "string") { try { const s = await student(req); who = `학생 ${s.rid}/${s.pid}`; } catch { /* 누구나 */ } }
    await db().collection("ktLogs").add({ kind, msg, who, url: cut(d.url, 300), ua: cut(d.ua, 300), stack: cut(d.stack, 3000), at: Date.now(), done: false });
    return { ok: true };
  },
  admin: async ({ req, d }) => {
    if (!isAdmin(req)) throw new HttpsError("permission-denied", "최고 관리자만 볼 수 있어요.");
    const action = String(d.action || "overview");
    if (action === "block") { const uid = cut(d.uid, 128); if (!/^[\w-]{1,128}$/.test(uid)) throw new HttpsError("invalid-argument", "?"); await db().doc(`ktTeachers/${uid}`).update({ blocked: !!d.blocked }); return { ok: true }; }
    if (action === "done") { const id = cut(d.id, 64); if (!ID.test(id)) throw new HttpsError("invalid-argument", "?"); await db().doc(`ktLogs/${id}`).update({ done: !!d.done }); return { ok: true }; }
    if (action === "clearErrors") { const s = await db().collection("ktLogs").where("kind", "==", "error").limit(400).get(); const b = db().batch(); s.docs.forEach((x) => b.delete(x.ref)); await b.commit(); return { removed: s.size }; }
    if (action === "room") { const s = await myRoom(req, cut(d.rid, 64)); return OPS.dash({ req, d: { rid: s.id } }); }
    const [ts, rs, logs] = await Promise.all([db().collection("ktTeachers").get(), db().collection("ktRooms").orderBy("createdAt", "desc").limit(300).get(), db().collection("ktLogs").orderBy("at", "desc").limit(150).get()]);
    const rooms = await Promise.all(rs.docs.map(async (r) => { const x = r.data(), n = await r.ref.collection("players").count().get();
      return { rid: r.id, name: x.name, code: x.code, teacher: x.teacher, teacherName: x.teacherName || "", school: x.school?.name || "", region: x.school?.region || "", createdAt: x.createdAt || 0, players: n.data().count, room: roomPub(x.room || null, false) }; }));
    const per = new Map<string, number>(); rooms.forEach((r) => per.set(r.teacher, (per.get(r.teacher) || 0) + 1));
    const teachers = ts.docs.map((t) => { const x = t.data(); return { uid: t.id, email: x.email || "", name: x.name || "", school: x.school?.name || "", region: x.school?.region || "", joinedAt: x.joinedAt || 0, blocked: !!x.blocked, rooms: per.get(t.id) || 0 }; }).sort((a, b) => b.joinedAt - a.joinedAt);
    return { teachers, rooms, logs: logs.docs.map((x) => ({ id: x.id, ...x.data() })), board: await board() };
  },
};

export const ktApi = onCall({ region: "asia-northeast3", maxInstances: 20, timeoutSeconds: 30, memory: "256MiB" }, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>, op = String(d.op || "");
  const f = Object.prototype.hasOwnProperty.call(OPS, op) ? OPS[op] : null;
  if (!f) throw new HttpsError("invalid-argument", "알 수 없는 요청이에요.");
  return f({ req, d });
});
