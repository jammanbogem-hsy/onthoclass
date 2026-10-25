/**
 * 학급 성과 공유 — 링크가 있는 누구나(로그인 없이) 학급의 수업 결과물을 실시간으로 본다.
 *
 * 주소(호스팅 rewrite 로 이 함수 하나에 모인다)
 *   https://jammanboeng.web.app/showcase/?t=<토큰>      보는 화면(Next 정적 페이지)
 *   /api/showcase/data?t=&v=overview|lesson|maps|board|life&l=&b=   데이터(JSON)
 *   /api/showcase/file?t=&p=<Storage 경로>              첨부 사진·그림(이 학급 경로의 이미지만)
 *
 * 이름 가리기(모자이크)
 *   - 학생 이름·계정 id 는 서버에서 아예 빼고 보낸다(화면 CSS 로만 흐리게 하면 소스에서 보인다).
 *   - 글쓴이는 학생 번호(1…, 들어온 순서)만 보낸다 — 화면이 번호 색의 모자이크로 그린다.
 *   - 학생이 쓴 글 안의 친구 이름(성명·이름 두 글자 이상)은 MOSAIC 문자로 바꿔 보낸다.
 *   - 개인 대화(메시지)·오류 신고·출결·경험치 요청·개인 지갑 내역·음성 녹음은 보내지 않는다.
 *
 * 링크: showcaseLinks/{토큰} = { cid, createdBy, createdAt }. 규칙에 match 가 없어 관리자 SDK 만 읽는다.
 *   교사가 showcaseLink 함수로 만들기·다시 만들기(이전 링크 끊김)·멈추기를 한다.
 */
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp, FieldValue, type DocumentData } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomBytes } from "node:crypto";
import { mergeLeaves, plain, type Leaf } from "./knowledgeMap";
import { TRADING_ALIAS } from "./tradingAlias";

const db = () => getFirestore();
/** 글 안에서 가린 이름 자리 — 화면이 모자이크로 그린다(유니코드 사용자 영역 문자) */
export const MOSAIC = "";
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

/* ---------------------------------------------------------------- 링크 관리(교사) */

async function assertTeacher(uid: string, cid: string) {
  if (!ID_RE.test(cid)) throw new HttpsError("invalid-argument", "학급 id 가 올바르지 않아요.");
  const m = await db().doc(`classes/${cid}/members/${uid}`).get();
  if (m.data()?.role !== "teacher") throw new HttpsError("permission-denied", "이 학급의 선생님만 공유 링크를 다룰 수 있어요.");
}

export const showcaseLink = onCall({ memory: "256MiB", maxInstances: 5 }, async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  const { classId, action } = (req.data ?? {}) as { classId?: string; action?: string };
  await assertTeacher(req.auth.uid, String(classId ?? ""));
  const cid = String(classId);
  const existing = await db().collection("showcaseLinks").where("cid", "==", cid).get();
  if (action === "get") return { token: existing.docs[0]?.id ?? null };
  if (action === "create" && existing.docs[0]) return { token: existing.docs[0].id };
  if (action === "create" || action === "reset" || action === "revoke") {
    const batch = db().batch();
    existing.docs.forEach(d => batch.delete(d.ref));
    let token: string | null = null;
    if (action !== "revoke") {
      token = randomBytes(24).toString("base64url"); // 32자
      batch.set(db().doc(`showcaseLinks/${token}`), { cid, createdBy: req.auth.uid, createdAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
    return { token };
  }
  throw new HttpsError("invalid-argument", "알 수 없는 동작이에요.");
});

/* ---------------------------------------------------------------- 이름 가리기 */

type Anon = { num: Map<string, number>; names: RegExp | null; teacher: Set<string> };

async function anonOf(cid: string): Promise<Anon> {
  const snap = await db().collection(`classes/${cid}/members`).get();
  const kids = snap.docs.filter(d => d.data().role !== "teacher")
    .map(d => ({ uid: d.id, name: String(d.data().displayName ?? "").trim(), at: (d.data().joinedAt as Timestamp | undefined)?.toMillis?.() ?? 0 }))
    .sort((a, b) => a.at - b.at || a.uid.localeCompare(b.uid));
  const num = new Map(kids.map((k, i) => [k.uid, i + 1]));
  // 가릴 낱말: 성명 전체 + (한글 3자 이상이면) 이름 두 글자 + (영문이면) 3자 이상 낱말
  const words = new Set<string>();
  for (const k of kids) {
    if (!k.name) continue;
    if (Array.from(k.name).length >= 2) words.add(k.name);
    for (const part of k.name.split(/\s+/)) {
      const ch = Array.from(part);
      if (/^[가-힣]+$/.test(part) && ch.length >= 3) words.add(ch.slice(1).join(""));
      if (/^[A-Za-z]{3,}$/.test(part)) words.add(part);
      if (ch.length >= 2) words.add(part);
    }
  }
  const list = [...words].sort((a, b) => b.length - a.length).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return { num, names: list.length ? new RegExp(list.join("|"), "gi") : null, teacher: new Set(snap.docs.filter(d => d.data().role === "teacher").map(d => d.id)) };
}

const UIDLIKE = /\b[A-Za-z0-9]{28}\b/g;
/** 학생 글 → 이름·계정 id 를 가린 글 */
function mask(a: Anon, text: unknown, max = 4000): string {
  let s = typeof text === "string" ? text : "";
  if (s.length > max) s = s.slice(0, max) + "…";
  if (a.names) s = s.replace(a.names, MOSAIC);
  return s.replace(UIDLIKE, m => (/[0-9]/.test(m) && /[A-Za-z]/.test(m) ? MOSAIC : m));
}
/** 글쓴이 → 학생 번호(명단 밖이면 0, 선생님이면 -1) */
const who = (a: Anon, uid: unknown) => (typeof uid !== "string" ? 0 : a.teacher.has(uid) ? -1 : a.num.get(uid) ?? 0);

const msOf = (v: unknown): number => {
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const t = (v as { toMillis?: () => number } | null)?.toMillis?.();
  return typeof t === "number" ? t : 0;
};

/** 첨부 → 사진·그림만(음성은 목소리로 학생을 알 수 있어 뺀다). 주소 대신 Storage 경로 */
function images(cid: string, list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap(x => {
    const v = x as { type?: string; path?: string };
    return v?.type === "image" && typeof v.path === "string" && filePathOk(cid, v.path) ? [v.path] : [];
  }).slice(0, 12);
}
function filePathOk(cid: string, p: string) {
  return p.startsWith(`classes/${cid}/`) && !p.includes("..") && !p.includes("/feedback/") && p.length < 400;
}

/** 지식맵 → 학생 id 를 번호로, 라벨·근거의 이름은 ○○ 로 */
function mapOut(a: Anon, o: Leaf) {
  const lab = (s: string) => mask(a, s, 300).split(MOSAIC).join("○○");
  return {
    nodes: (o.nodes ?? []).slice(0, 160).map(n => ({ ...n, label: lab(n.label), sources: (n.sources ?? []).map(u => `s${who(a, u)}`) })),
    edges: (o.edges ?? []).slice(0, 300).map(e => ({ ...e, evidence: lab(e.evidence ?? "") })),
    overallSentiment: o.overallSentiment ?? { positive: 0, neutral: 0, negative: 0 },
    summary: lab(o.summary ?? ""),
  };
}

/* ---------------------------------------------------------------- 화면별 데이터 */

async function lessonsOf(cid: string) {
  const snap = await db().collection(`classes/${cid}/lessons`).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as DocumentData & { id: string })
    .sort((x, y) => String(x.date ?? "").localeCompare(String(y.date ?? "")) || (x.order ?? 0) - (y.order ?? 0));
}
async function questionsOf(cid: string, lid: string) {
  const snap = await db().collection(`classes/${cid}/lessons/${lid}/questions`).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as DocumentData & { id: string })
    .filter(q => q.published !== false) // 예약(학생에게 숨김) 활동은 공유에서도 숨긴다
    .sort((x, y) => (x.phase === y.phase ? 0 : x.phase === "pre" ? -1 : 1) || (x.order ?? 0) - (y.order ?? 0));
}

async function overview(cid: string, a: Anon) {
  const c = (await db().doc(`classes/${cid}`).get()).data() ?? {};
  const [lessons, projects, boards, praises, games] = await Promise.all([
    lessonsOf(cid),
    db().collection(`classes/${cid}/projects`).get(),
    db().collection(`classes/${cid}/canvas`).get(),
    db().collection(`classes/${cid}/praises`).where("status", "==", "approved").count().get(),
    db().collection(`classes/${cid}/games`).count().get(),
  ]);
  const rows = await Promise.all(lessons.map(async l => {
    const qs = await questionsOf(cid, l.id);
    const counts = await Promise.all(qs.map(q => q.kind === "brainstorm"
      ? db().collection(`classes/${cid}/lessons/${l.id}/questions/${q.id}/ideas`).count().get().then(x => x.data().count)
      : db().collection(`classes/${cid}/lessons/${l.id}/questions/${q.id}/submissions`).count().get().then(x => x.data().count)));
    return {
      id: l.id, title: String(l.title ?? ""), date: String(l.date ?? ""), projectId: typeof l.projectId === "string" ? l.projectId : null,
      activities: qs.length, responses: counts.reduce((s, n) => s + n, 0),
      kinds: [...new Set(qs.map(q => String(q.kind ?? "question")))],
    };
  }));
  return {
    class: { name: String(c.name ?? ""), subject: String(c.subject ?? ""), description: mask(a, c.description, 600) },
    students: a.num.size,
    projects: projects.docs.map(d => ({ id: d.id, name: String(d.data().name ?? ""), parentId: d.data().parentProjectId ?? null, order: d.data().order ?? 0 })).sort((x, y) => x.order - y.order),
    lessons: rows,
    boards: boards.docs.map(d => ({ id: d.id, name: String(d.data().name ?? "보드") })),
    totals: { lessons: rows.length, responses: rows.reduce((s, r) => s + r.responses, 0), praises: praises.data().count, games: games.data().count },
  };
}

/** 보드(캔버스) 카드 — v2(카드별 문서) / 옛 배열 둘 다 */
async function boardCards(cid: string, ref: FirebaseFirestore.DocumentReference, a: Anon) {
  const meta = (await ref.get()).data() ?? {};
  const sub = await ref.collection("nodes").limit(400).get();
  const raw: DocumentData[] = sub.size ? sub.docs.map(d => d.data()) : Array.isArray(meta.nodes) ? meta.nodes : [];
  const pages = Array.isArray(meta.pages) ? meta.pages.map((p: DocumentData) => ({ id: String(p.id), name: String(p.name ?? "") })) : [];
  return {
    id: ref.id, name: String(meta.name ?? "보드"), pages,
    cards: raw.slice(0, 400).map(n => ({
      text: mask(a, n.text, 2000), link: n.kind === "link" && typeof n.url === "string" ? n.url : undefined,
      color: typeof n.color === "string" ? n.color : null, page: typeof n.page === "string" ? n.page : null,
      by: who(a, n.authorUid), img: images(cid, n.attachments), at: msOf(n.createdAt),
    })).sort((x, y) => x.at - y.at),
  };
}

async function lessonView(cid: string, lid: string, a: Anon) {
  const lref = db().doc(`classes/${cid}/lessons/${lid}`);
  const l = (await lref.get()).data();
  if (!l) throw new Error("차시를 찾을 수 없어요.");
  const [qs, reflections, resources, boards, leaves] = await Promise.all([
    questionsOf(cid, lid),
    lref.collection("submissions").get(),
    db().collection(`classes/${cid}/resources`).where("lessonId", "==", lid).get(),
    lref.collection("canvas").get(),
    lref.collection("ontology").get(),
  ]);
  const activities = await Promise.all(qs.map(async q => {
    const base = {
      id: q.id, kind: String(q.kind ?? "question"), phase: String(q.phase ?? ""), title: mask(a, q.title, 300), prompt: mask(a, plain(q.text), 3000),
      ...(q.kind === "quiz" ? { options: (q.options ?? []).map((o: string) => mask(a, o, 300)), answerIndex: q.ungraded ? -1 : q.answerIndex ?? -1 } : {}),
      ...(q.kind === "survey" ? { surveyItems: (q.surveyItems ?? []).map((s: DocumentData) => ({ id: s.id, type: s.type, prompt: mask(a, s.prompt, 300), options: s.options ?? [], scaleMax: s.scaleMax ?? 5 })) } : {}),
      ...(q.kind === "link" ? { links: (q.links ?? []).map((k: DocumentData) => ({ title: mask(a, k.title ?? k.label ?? "", 200), url: String(k.url ?? "") })) } : {}),
    };
    const qref = lref.collection("questions").doc(q.id);
    if (q.kind === "brainstorm") {
      const ideas = await qref.collection("ideas").get();
      return { ...base, ideas: ideas.docs.map(d => ({ by: who(a, d.data().uid), text: mask(a, d.data().text, 600), at: msOf(d.data().at) })).sort((x, y) => x.at - y.at) };
    }
    if (q.kind === "game-result") {
      const g = (q.gameResult ?? {}) as DocumentData;
      return { ...base, game: { name: String(g.gameName ?? ""), ranks: (g.ranks ?? []).slice(0, 60).map((r: DocumentData) => ({ by: who(a, r.uid), rank: r.rank })), words: (g.wordCloud ?? []).slice(0, 60).map((w: DocumentData) => ({ word: mask(a, w.word, 60), count: w.count })) } };
    }
    if (q.kind === "link") return base;
    const subs = await qref.collection("submissions").get();
    const responses = await Promise.all(subs.docs.map(async d => {
      const v = d.data();
      const cm = await d.ref.collection("comments").limit(30).get();
      return {
        by: who(a, v.uid ?? d.id), text: mask(a, plain(v.content), 4000), img: images(cid, v.attachments), at: msOf(v.submittedAt),
        ...(v.surveyAnswers ? { survey: Object.fromEntries(Object.entries(v.surveyAnswers as Record<string, unknown>).map(([k, x]) => [k, typeof x === "string" ? mask(a, x, 600) : x])) } : {}),
        ...(typeof v.understanding === "number" ? { understanding: v.understanding } : {}),
        ...(typeof v.interest === "number" ? { interest: v.interest } : {}),
        ...(typeof v.application === "string" && v.application ? { application: mask(a, v.application, 1000) } : {}),
        comments: cm.docs.map(c => ({ by: who(a, c.data().uid ?? c.data().authorUid), text: mask(a, c.data().text ?? c.data().body, 800), at: msOf(c.data().createdAt) })).sort((x, y) => x.at - y.at),
      };
    }));
    return { ...base, responses: responses.sort((x, y) => x.at - y.at) };
  }));
  const qLeaves = leaves.docs.filter(d => d.id.startsWith("q:")).map(d => d.data() as Leaf);
  return {
    lesson: { id: lid, title: String(l.title ?? ""), date: String(l.date ?? ""), preQuestion: mask(a, l.preQuestion, 1000), postQuestion: mask(a, l.postQuestion, 1000) },
    resources: resources.docs.map(d => ({ title: mask(a, d.data().title, 200), type: String(d.data().type ?? ""), url: String(d.data().url ?? ""), order: d.data().order ?? 0 })).sort((x, y) => x.order - y.order),
    activities,
    reflections: reflections.docs.map(d => { const v = d.data(); return { by: who(a, v.uid ?? d.id), phase: v.phase, text: mask(a, plain(v.content), 3000), understanding: v.understanding, interest: v.interest }; }),
    boards: await Promise.all(boards.docs.slice(0, 12).map(b => boardCards(cid, b.ref, a))),
    map: qLeaves.length ? mapOut(a, mergeLeaves(qLeaves)) : null,
  };
}

async function mapsView(cid: string, a: Anon) {
  const lessons = await lessonsOf(cid);
  const per = await Promise.all(lessons.map(async l => {
    const leaves = (await db().collection(`classes/${cid}/lessons/${l.id}/ontology`).get()).docs.filter(d => d.id.startsWith("q:")).map(d => d.data() as Leaf);
    return { l, leaves };
  }));
  const all = per.flatMap(p => p.leaves);
  return {
    map: all.length ? mapOut(a, mergeLeaves(all)) : null,
    lessons: per.filter(p => p.leaves.length).map(p => {
      const m = mergeLeaves(p.leaves);
      return { id: p.l.id, title: String(p.l.title ?? ""), date: String(p.l.date ?? ""), top: m.nodes.sort((x, y) => y.sourceCount - x.sourceCount).slice(0, 8).map(n => mask(a, n.label, 80).split(MOSAIC).join("○○")) };
    }),
  };
}

async function lifeView(cid: string, a: Anon) {
  const col = (p: string) => db().collection(`classes/${cid}/${p}`);
  const [praises, games, market, purchases, fundings, trades, badges, groups] = await Promise.all([
    col("praises").where("status", "==", "approved").get(),
    col("games").orderBy("createdAt", "desc").limit(30).get(),
    col("market").get(), col("purchases").get(), col("fundings").get(), col("trades").get(), col("badges").get(), col("groups").get(),
  ]);
  const bought = new Map<string, number>();
  purchases.docs.forEach(d => bought.set(String(d.data().itemId), (bought.get(String(d.data().itemId)) ?? 0) + 1));
  const stocks = new Map<string, { trades: number; volume: number }>();
  trades.docs.forEach(d => { const v = d.data(); const k = TRADING_ALIAS[v.symbol] ?? String(v.symbol ?? ""); const s = stocks.get(k) ?? { trades: 0, volume: 0 }; s.trades++; s.volume += Number(v.total) || 0; stocks.set(k, s); });
  const badgeCount = new Map<string, number>();
  badges.docs.forEach(d => Object.keys(d.data().collected ?? {}).forEach(id => badgeCount.set(id, (badgeCount.get(id) ?? 0) + 1)));
  return {
    praises: praises.docs.map(d => { const v = d.data(); return { from: who(a, v.fromUid), to: who(a, v.toUid), reason: mask(a, v.reason, 400), at: msOf(v.decidedAt) || msOf(v.createdAt) }; })
      .sort((x, y) => y.at - x.at).slice(0, 300),
    praiseTotal: praises.size,
    games: games.docs.map(d => {
      const v = d.data();
      const matches = (v.puyo?.matches ?? []).filter((m: DocumentData) => m.result).map((m: DocumentData) => ({
        winner: who(a, m.result.winner), scores: Object.entries((m.result.scores ?? {}) as Record<string, number>).map(([u, s]) => ({ by: who(a, u), score: s })).sort((x, y) => y.score - x.score),
      }));
      return { kind: String(v.kind ?? ""), name: mask(a, v.link?.name ?? "", 100), at: msOf(v.playStartedAt) || msOf(v.createdAt), status: String(v.status ?? ""), players: Array.isArray(v.puyo?.players) ? v.puyo.players.filter((p: DocumentData) => !p.teacher).length : undefined, matches };
    }),
    market: market.docs.map(d => ({ title: mask(a, d.data().title, 100), price: d.data().price ?? 0, active: d.data().active !== false, bought: bought.get(d.id) ?? 0 })),
    fundings: fundings.docs.map(d => { const v = d.data(); return { title: mask(a, v.title, 100), goal: v.goal ?? 0, raised: v.raised ?? 0, status: String(v.status ?? ""), by: who(a, v.creatorUid), backers: Object.keys(v.contribs ?? {}).length, at: msOf(v.createdAt) }; }).sort((x, y) => y.at - x.at),
    stocks: [...stocks.entries()].map(([name, s]) => ({ name, ...s })).sort((x, y) => y.trades - x.trades),
    badges: [...badgeCount.entries()].map(([id, students]) => ({ id, students })).sort((x, y) => y.students - x.students),
    groups: groups.docs.map(d => ({ name: mask(a, d.data().name, 60), members: Array.isArray(d.data().memberUids) ? d.data().memberUids.map((u: string) => who(a, u)) : [] })),
  };
}

async function boardView(cid: string, bid: string, a: Anon) {
  const ref = db().doc(`classes/${cid}/canvas/${bid}`);
  if (!(await ref.get()).exists) throw new Error("보드를 찾을 수 없어요.");
  return boardCards(cid, ref, a);
}

/* ---------------------------------------------------------------- HTTP 입구 */

// 같은 인스턴스에서 잠깐(20초) 기억 — 여러 사람이 동시에 열어도 Firestore 를 반복해 읽지 않게
const memo = new Map<string, { at: number; body: string }>();

export const showcase = onRequest({ memory: "512MiB", maxInstances: 10, timeoutSeconds: 60, cors: false }, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("X-Robots-Tag", "noindex, nofollow");
  if (req.method === "OPTIONS") return void res.status(204).end();
  if (req.method !== "GET") return void res.status(405).end();
  const path = req.path.replace(/\/+$/, "");
  const t = String(req.query.t ?? "");
  try {
    if (!TOKEN_RE.test(t)) return void res.status(404).json({ error: "링크가 올바르지 않아요." });
    const link = (await db().doc(`showcaseLinks/${t}`).get()).data();
    if (!link) return void res.status(404).set("Cache-Control", "no-store").json({ error: "공유가 멈췄거나 없는 링크예요." });
    const cid = String(link.cid);

    if (path.endsWith("/file")) {
      const p = String(req.query.p ?? "");
      if (!filePathOk(cid, p)) return void res.status(404).end();
      const file = getStorage().bucket().file(p);
      const [meta] = await file.getMetadata().catch(() => [null]);
      if (!meta || !String(meta.contentType ?? "").startsWith("image/")) return void res.status(404).end();
      res.set("Content-Type", String(meta.contentType));
      res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
      file.createReadStream().on("error", () => res.status(404).end()).pipe(res);
      return;
    }

    if (path.endsWith("/data")) {
      const v = String(req.query.v ?? "overview");
      const l = String(req.query.l ?? ""); const b = String(req.query.b ?? "");
      if ((l && !ID_RE.test(l)) || (b && !ID_RE.test(b))) return void res.status(400).json({ error: "주소가 올바르지 않아요." });
      const key = `${t}|${v}|${l}|${b}`;
      const hit = memo.get(key);
      let body = hit && Date.now() - hit.at < 20_000 ? hit.body : "";
      if (!body) {
        const a = await anonOf(cid);
        const data = v === "lesson" ? await lessonView(cid, l, a)
          : v === "maps" ? await mapsView(cid, a)
          : v === "life" ? await lifeView(cid, a)
          : v === "board" ? await boardView(cid, b, a)
          : await overview(cid, a);
        body = JSON.stringify(data);
        memo.set(key, { at: Date.now(), body });
        if (memo.size > 200) memo.delete(memo.keys().next().value as string);
      }
      res.set("Content-Type", "application/json; charset=utf-8");
      res.set("Cache-Control", "public, max-age=15, s-maxage=30"); // 실시간에 가깝게, 몰려도 CDN 이 받아 준다
      return void res.send(body);
    }
    res.status(404).json({ error: "not_found" });
  } catch (e) {
    console.error("showcase", e);
    if (!res.headersSent) res.status(500).set("Cache-Control", "no-store").json({ error: e instanceof Error ? e.message : "불러오지 못했어요." });
  }
});


/** 점검용(로컬 스크립트) — 함수로 배포되지 않는다 */
export const showcaseViews = { anonOf, overview, lessonView, mapsView, lifeView, boardView };
