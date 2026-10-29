/**
 * 잼만보 낚시터(jammanbo-fish.web.app) 서버 — 살림망·수산시장·낚시 가게·캠핑 요리
 *
 * 세 가지 점수: 손맛 점수(잡은 물고기), 돈(수산시장에 팔아서), 낭만 점수(옷차림·장식·요리)
 * 돈·물고기·아이템은 모두 이 함수들만 바꾼다(fishers/** 는 규칙에서 클라이언트 쓰기 금지).
 * 게임은 브라우저에서 돌기 때문에 잡은 물고기를 완전히 증명할 수는 없고,
 * 크기·무게가 그 물고기로 가능한 범위인지, 너무 빨리 잡지 않았는지(3초)와 하루 개수만 서버가 막는다.
 * 러닝크루의 만보와는 따로 쓰는 게임 돈(원)이라 기존 경제에 영향이 없다.
 */
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, type Transaction, type DocumentData } from "firebase-admin/firestore";

const options = { region: "asia-northeast3", maxInstances: 10, timeoutSeconds: 20 };

// 게임(games/fish/game.js SPECIES)과 같은 값. w: 낚시터, t: 등급, p: 기본 점수, len: 크기(cm)
const SPECIES: Record<string, { w: "fresh" | "sea"; n: string; t: string; p: number; len: [number, number] }> = {
  minnow: { w: "fresh", n: "송사리", t: "흔함", p: 10, len: [3, 6] }, pirami: { w: "fresh", n: "피라미", t: "흔함", p: 14, len: [8, 16] },
  crucian: { w: "fresh", n: "붕어", t: "흔함", p: 20, len: [15, 32] }, bluegill: { w: "fresh", n: "블루길", t: "흔함", p: 22, len: [10, 25] },
  carp: { w: "fresh", n: "잉어", t: "보통", p: 45, len: [40, 85] }, bass: { w: "fresh", n: "배스", t: "보통", p: 50, len: [25, 60] },
  trout: { w: "fresh", n: "송어", t: "보통", p: 55, len: [25, 60] }, catfish: { w: "fresh", n: "메기", t: "희귀", p: 80, len: [45, 110] },
  eel: { w: "fresh", n: "뱀장어", t: "희귀", p: 90, len: [40, 100] }, mandarin: { w: "fresh", n: "쏘가리", t: "희귀", p: 95, len: [25, 55] },
  snakehead: { w: "fresh", n: "가물치", t: "희귀", p: 100, len: [40, 90] }, sturgeon: { w: "fresh", n: "철갑상어", t: "전설", p: 220, len: [100, 190] },
  goldkoi: { w: "fresh", n: "황금 잉어", t: "전설", p: 320, len: [60, 95] },
  jack: { w: "sea", n: "전갱이", t: "흔함", p: 14, len: [15, 35] }, mackerel: { w: "sea", n: "고등어", t: "흔함", p: 18, len: [25, 45] },
  rockfish: { w: "sea", n: "우럭", t: "흔함", p: 25, len: [20, 50] }, puffer: { w: "sea", n: "복어", t: "보통", p: 45, len: [15, 40] },
  cutlass: { w: "sea", n: "갈치", t: "보통", p: 48, len: [60, 150] }, seabream: { w: "sea", n: "참돔", t: "보통", p: 50, len: [30, 80] },
  flounder: { w: "sea", n: "광어", t: "보통", p: 55, len: [35, 90] }, yellowtail: { w: "sea", n: "방어", t: "희귀", p: 100, len: [60, 110] },
  sunfish: { w: "sea", n: "개복치", t: "희귀", p: 120, len: [100, 250] }, tuna: { w: "sea", n: "참치", t: "전설", p: 250, len: [120, 280] },
  marlin: { w: "sea", n: "청새치", t: "전설", p: 320, len: [180, 400] },
  bossFresh: { w: "fresh", n: "메기 대왕", t: "보스", p: 800, len: [250, 320] }, bossSea: { w: "sea", n: "청새치 대왕", t: "보스", p: 900, len: [450, 600] },
};
const WEIGHT_K: Record<string, number> = { minnow: 10, pirami: 9, eel: 2, cutlass: 1.5, marlin: 5, bossSea: 5, sturgeon: 7, snakehead: 9, catfish: 9, bossFresh: 9, sunfish: 30, puffer: 25, flounder: 14, tuna: 18, yellowtail: 13 };
const kgOf = (id: string, cm: number, cond: number) => (WEIGHT_K[id] || 12) * (cm / 100) ** 3 * cond;
const GRADES: [number, string][] = [[.92, "월척"], [.72, "S급"], [.45, "A급"], [.18, "B급"], [0, "놔주자급"]];
const gradeOf = (t: number) => GRADES.find(([min]) => t >= min)![1];

// 낚시 가게. romance 는 처음 살 때 한 번 오르는 낭만 점수
export const ROD = [
  { lv: 1, name: "대나무 낚싯대", price: 0, desc: "처음 받는 낚싯대" },
  { lv: 2, name: "튼튼한 낚싯대", price: 3000, desc: "캐스팅 초록 칸이 넓어져요" },
  { lv: 3, name: "카본 낚싯대", price: 9000, desc: "연타가 조금 쉬워지고 미니게임 시간이 늘어요" },
  { lv: 4, name: "프로 낚싯대", price: 22000, desc: "하트가 하나 더 생겨요" },
  { lv: 5, name: "황금 낚싯대", price: 50000, desc: "더 큰 물고기가 잘 걸려요" },
];
export const SHOP: Record<string, { name: string; kind: "wear" | "decor" | "stock"; slot?: "head" | "face" | "body"; price: number; romance: number; desc: string }> = {
  hat_straw: { name: "밀짚모자", kind: "wear", slot: "head", price: 1500, romance: 10, desc: "여름 낚시의 기본" },
  hat_beanie: { name: "털모자", kind: "wear", slot: "head", price: 2000, romance: 10, desc: "바닷바람도 끄떡없어요" },
  glasses: { name: "선글라스", kind: "wear", slot: "face", price: 2500, romance: 15, desc: "물 위 반짝임을 막아 줘요" },
  vest: { name: "낚시 조끼", kind: "wear", slot: "body", price: 4000, romance: 20, desc: "주머니가 열두 개" },
  hat_pirate: { name: "해적 모자", kind: "wear", slot: "head", price: 8000, romance: 30, desc: "바다의 주인" },
  crown: { name: "왕관", kind: "wear", slot: "head", price: 30000, romance: 80, desc: "낚시왕만 쓰는 왕관" },
  chair: { name: "캠핑 의자", kind: "decor", price: 3500, romance: 20, desc: "데크에 놓는 접이식 의자" },
  fire: { name: "모닥불", kind: "decor", price: 6000, romance: 40, desc: "타닥타닥, 데크 옆 모닥불" },
  ramen: { name: "라면", kind: "stock", price: 500, romance: 0, desc: "요리 재료(최대 20개)" },
};
// 캠핑 요리: 살림망 물고기를 써서 낭만 점수를 올린다
type Fish = { sp: string; cm: number; kg: number; grade: string };
export const RECIPES: Record<string, { name: string; romance: number; ramen: number; fish: number; desc: string; ok: (f: Fish) => boolean }> = {
  ramen: { name: "라면", romance: 6, ramen: 1, fish: 0, desc: "라면 1개", ok: () => true },
  seafoodRamen: { name: "해물라면", romance: 22, ramen: 1, fish: 1, desc: "라면 1개 + 바다 물고기 1마리", ok: (f) => SPECIES[f.sp]?.w === "sea" },
  gui: { name: "생선구이", romance: 14, ramen: 0, fish: 1, desc: "A급 이상 물고기 1마리", ok: (f) => ["월척", "S급", "A급"].includes(f.grade) },
  maeuntang: { name: "매운탕", romance: 35, ramen: 0, fish: 3, desc: "민물 물고기 3마리", ok: (f) => SPECIES[f.sp]?.w === "fresh" },
  haemultang: { name: "해물탕", romance: 40, ramen: 0, fish: 3, desc: "바다 물고기 3마리", ok: (f) => SPECIES[f.sp]?.w === "sea" },
  hoe: { name: "대왕 회 한 접시", romance: 100, ramen: 0, fish: 1, desc: "전설·보스 물고기 1마리", ok: (f) => ["전설", "보스"].includes(SPECIES[f.sp]?.t) },
};
const BAG_MAX = 40, DAY_MAX = 400, GAP_MS = 3000;

// 한국 날짜와 오늘의 시세(종마다 0.7~1.4배, 날짜로 정해짐)
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
function hash(s: string) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; }
const market = (day: string, id: string) => Math.round((.7 + (hash(`${day}:${id}`) % 1000) / 1000 * .7) * 100) / 100;
function sizeOf(f: Fish) {
  const sp = SPECIES[f.sp], t = Math.min(1, Math.max(0, (f.cm - sp.len[0]) / (sp.len[1] - sp.len[0])));
  const cond = Math.min(1.15, Math.max(.85, f.kg / kgOf(f.sp, f.cm, 1)));
  return { t, cond };
}
const priceOf = (f: Fish, day: string) => { const { t, cond } = sizeOf(f); return Math.max(10, Math.round(SPECIES[f.sp].p * 10 * (.5 + 1.5 * t ** 1.2) * cond ** 1.2 * market(day, f.sp))); };
const tasteOf = (f: Fish) => { const { t, cond } = sizeOf(f); return Math.round(SPECIES[f.sp].p * (.5 + 1.5 * t ** 1.2) * cond ** 1.5 * (f.grade === "놔주자급" ? .5 : 1)); };

const db = () => getFirestore();
const meRef = (uid: string) => db().doc(`fishers/${uid}`);
function auth(req: CallableRequest) {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  return req.auth.uid;
}
// 클라이언트에 보여 줄 내 정보
function pub(d: DocumentData) {
  return { name: d.name || "낚시꾼", money: d.money || 0, romance: d.romance || 0, taste: d.taste || 0, rod: d.rod || 1,
    own: d.own || {}, wear: d.wear || {}, stock: d.stock || {}, cooked: d.cooked || {}, best: d.best || 0, caught: d.caught || 0 };
}
async function bagOf(uid: string) {
  const s = await meRef(uid).collection("bag").orderBy("at", "desc").limit(BAG_MAX).get();
  const day = kstDay();
  return s.docs.map((d) => { const f = d.data() as Fish; return { id: d.id, ...f, price: priceOf(f, day) }; });
}
async function readMe(tx: Transaction, uid: string) {
  const s = await tx.get(meRef(uid));
  if (!s.exists) throw new HttpsError("failed-precondition", "먼저 낚시터에 들어와 주세요.");
  return s.data()!;
}

// 내 정보 + 살림망 + 오늘의 시세 + 가게 목록. 처음이면 만든다(이름은 러닝크루 이름 → 구글 이름)
export const fishMe = onCall(options, async (req) => {
  const uid = auth(req), ref = meRef(uid);
  let snap = await ref.get();
  if (!snap.exists) {
    const u = await db().doc(`users/${uid}`).get();
    const name = String(u.data()?.name || req.auth?.token?.name || "낚시꾼").slice(0, 20);
    await ref.set({ name, money: 0, romance: 0, taste: 0, rod: 1, own: {}, wear: {}, stock: { ramen: 1 }, cooked: {}, bagN: 0, caught: 0, best: 0, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    snap = await ref.get();
  }
  const day = kstDay();
  const prices = Object.fromEntries(Object.keys(SPECIES).map((id) => [id, market(day, id)]));
  return { me: pub(snap.data()!), bag: await bagOf(uid), day, market: prices,
    rods: ROD, shop: SHOP, recipes: Object.fromEntries(Object.entries(RECIPES).map(([k, r]) => [k, { name: r.name, romance: r.romance, ramen: r.ramen, fish: r.fish, desc: r.desc }])) };
});

// 잡은 물고기 → 살림망. 놔주자급은 손맛만 오르고 물로 돌려보낸다
export const fishCatch = onCall(options, async (req) => {
  const uid = auth(req);
  const { sp, cm, kg, run } = (req.data || {}) as { sp?: string; cm?: number; kg?: number; run?: number };
  const S = sp ? SPECIES[sp] : undefined;
  if (!S || typeof cm !== "number" || typeof kg !== "number" || !isFinite(cm) || !isFinite(kg)) throw new HttpsError("invalid-argument", "물고기 정보를 확인해 주세요.");
  if (cm < S.len[0] - 1 || cm > S.len[1] + 1) throw new HttpsError("invalid-argument", "그 물고기는 그런 크기가 될 수 없어요.");
  const lo = kgOf(sp!, cm, .85) * .97, hi = kgOf(sp!, cm, 1.15) * 1.03;
  if (kg < lo || kg > hi) throw new HttpsError("invalid-argument", "무게가 이상해요.");
  const t = (cm - S.len[0]) / (S.len[1] - S.len[0]);
  const fish: Fish = { sp: sp!, cm: Math.round(cm), kg: Math.round(kg * 1000) / 1000, grade: gradeOf(t) };
  const day = kstDay();
  return db().runTransaction(async (tx) => {
    const d = await readMe(tx, uid), now = Date.now();
    if (now - (d.lastCatchAt || 0) < GAP_MS) throw new HttpsError("resource-exhausted", "너무 빨라요! 잠깐 쉬었다 잡아요.");
    const count = d.day === day ? d.dayCount || 0 : 0;
    if (count >= DAY_MAX) throw new HttpsError("resource-exhausted", "오늘은 충분히 잡았어요. 내일 또 와요!");
    const taste = tasteOf(fish), release = fish.grade === "놔주자급", full = (d.bagN || 0) >= BAG_MAX;
    const upd: DocumentData = { taste: FieldValue.increment(taste), caught: FieldValue.increment(1), lastCatchAt: now, day, dayCount: count + 1 };
    if (typeof run === "number" && isFinite(run) && run > (d.best || 0) && run < 200000) upd.best = Math.round(run); // 한 판 최고 손맛(화면 점수)
    let saved = false;
    if (!release && !full) { tx.create(meRef(uid).collection("bag").doc(), { ...fish, at: now }); upd.bagN = FieldValue.increment(1); saved = true; }
    tx.update(meRef(uid), upd);
    return { taste, saved, full, release, price: priceOf(fish, day), grade: fish.grade };
  });
});

// 수산시장: 고른 물고기(없으면 전부)를 오늘 시세로 판다
export const fishSell = onCall(options, async (req) => {
  const uid = auth(req), ids = req.data?.ids;
  if (ids !== "all" && (!Array.isArray(ids) || ids.length < 1 || ids.length > BAG_MAX || ids.some((i) => typeof i !== "string" || !/^[\w-]{1,64}$/.test(i)))) throw new HttpsError("invalid-argument", "팔 물고기를 골라 주세요.");
  const day = kstDay(), bag = meRef(uid).collection("bag");
  const res = await db().runTransaction(async (tx) => {
    await readMe(tx, uid);
    const docs = ids === "all" ? (await tx.get(bag.limit(BAG_MAX))).docs : (await Promise.all((ids as string[]).map((i) => tx.get(bag.doc(i))))).filter((s) => s.exists);
    if (!docs.length) throw new HttpsError("failed-precondition", "팔 물고기가 없어요.");
    let earned = 0;
    for (const s of docs) { earned += priceOf(s.data() as Fish, day); tx.delete(s.ref); }
    tx.update(meRef(uid), { money: FieldValue.increment(earned), bagN: FieldValue.increment(-docs.length), sold: FieldValue.increment(docs.length) });
    return { earned, n: docs.length };
  });
  return { ...res, me: pub((await meRef(uid).get()).data()!), bag: await bagOf(uid) };
});

// 낚시 가게: 낚싯대는 한 단계씩, 옷·장식은 한 번, 라면은 여러 개
export const fishBuy = onCall(options, async (req) => {
  const uid = auth(req), item = String(req.data?.item || "");
  await db().runTransaction(async (tx) => {
    const d = await readMe(tx, uid), money = d.money || 0;
    if (item === "rod") {
      const next = ROD[(d.rod || 1)]; if (!next) throw new HttpsError("failed-precondition", "이미 최고의 낚싯대예요.");
      if (money < next.price) throw new HttpsError("failed-precondition", "돈이 모자라요.");
      tx.update(meRef(uid), { money: money - next.price, rod: next.lv });
      return;
    }
    const it = SHOP[item]; if (!it) throw new HttpsError("invalid-argument", "없는 물건이에요.");
    if (money < it.price) throw new HttpsError("failed-precondition", "돈이 모자라요.");
    if (it.kind === "stock") {
      const n = d.stock?.[item] || 0; if (n >= 20) throw new HttpsError("failed-precondition", "더 이상 들고 갈 수 없어요.");
      tx.update(meRef(uid), { money: money - it.price, [`stock.${item}`]: n + 1 });
      return;
    }
    if (d.own?.[item]) throw new HttpsError("failed-precondition", "이미 갖고 있어요.");
    const upd: DocumentData = { money: money - it.price, [`own.${item}`]: true, romance: FieldValue.increment(it.romance) };
    if (it.kind === "wear" && it.slot) upd[`wear.${it.slot}`] = item; // 사면 바로 입는다
    tx.update(meRef(uid), upd);
  });
  return { me: pub((await meRef(uid).get()).data()!) };
});

// 옷 갈아입기/벗기
export const fishWear = onCall(options, async (req) => {
  const uid = auth(req), slot = String(req.data?.slot || ""), item = req.data?.item == null ? null : String(req.data.item);
  if (!["head", "face", "body"].includes(slot)) throw new HttpsError("invalid-argument", "어디에 입을지 골라 주세요.");
  const d = (await meRef(uid).get()).data();
  if (!d) throw new HttpsError("failed-precondition", "먼저 낚시터에 들어와 주세요.");
  if (item && (!d.own?.[item] || SHOP[item]?.slot !== slot)) throw new HttpsError("failed-precondition", "갖고 있지 않은 옷이에요.");
  await meRef(uid).update({ [`wear.${slot}`]: item ?? FieldValue.delete() });
  return { me: pub((await meRef(uid).get()).data()!) };
});

// 캠핑 요리: 레시피에 맞는 살림망 물고기(ids)와 라면을 써서 낭만 점수
export const fishCook = onCall(options, async (req) => {
  const uid = auth(req), key = String(req.data?.recipe || ""), r = RECIPES[key];
  const ids = Array.isArray(req.data?.ids) ? (req.data.ids as unknown[]).filter((i): i is string => typeof i === "string" && /^[\w-]{1,64}$/.test(i)) : [];
  if (!r) throw new HttpsError("invalid-argument", "없는 요리예요.");
  if (new Set(ids).size !== r.fish || ids.length !== r.fish) throw new HttpsError("invalid-argument", `물고기 ${r.fish}마리를 골라 주세요.`);
  await db().runTransaction(async (tx) => {
    const d = await readMe(tx, uid), bag = meRef(uid).collection("bag");
    const snaps = await Promise.all(ids.map((i) => tx.get(bag.doc(i))));
    if (snaps.some((s) => !s.exists || !r.ok(s.data() as Fish))) throw new HttpsError("failed-precondition", "그 물고기로는 이 요리를 못 해요.");
    const ramen = d.stock?.ramen || 0;
    if (ramen < r.ramen) throw new HttpsError("failed-precondition", "라면이 없어요. 가게에서 사 와요!");
    snaps.forEach((s) => tx.delete(s.ref));
    tx.update(meRef(uid), { romance: FieldValue.increment(r.romance), "stock.ramen": ramen - r.ramen, [`cooked.${key}`]: FieldValue.increment(1), ...(r.fish ? { bagN: FieldValue.increment(-r.fish) } : {}) });
  });
  return { romance: r.romance, name: r.name, me: pub((await meRef(uid).get()).data()!), bag: await bagOf(uid) };
});
