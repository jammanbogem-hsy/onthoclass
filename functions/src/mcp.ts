/**
 * 러닝크루 MCP 서버 — Claude(커스텀 커넥터)·ChatGPT(앱/커넥터)에서 교사가 자기 학급 활동 기록을 읽게 한다.
 *
 * 주소(호스팅 rewrite 로 이 함수 하나에 모인다)
 *   https://jammanboeng.web.app/mcp                                   MCP(Streamable HTTP, 상태 없음)
 *   https://jammanboeng.web.app/.well-known/oauth-protected-resource  자원 메타데이터
 *   https://jammanboeng.web.app/.well-known/oauth-authorization-server  인가 서버 메타데이터
 *   https://jammanboeng.web.app/oauth/register | authorize | token   OAuth 2.1(동적 등록 + PKCE)
 *   https://jammanboeng.web.app/mcp-auth/?req=…                       교사 로그인·허용 화면(Next 정적 페이지)
 *
 * 보안
 *   - 쓰기는 지식맵 만들기(build_knowledge_map) 하나뿐 — 화면의 “분석” 버튼과 같은 자리에 저장한다. 응답 고치기·지우기·학생에게 보내기 도구는 없다.
 *   - 교사 계정(users/{uid}.role=="teacher")만 허용 화면에서 승인할 수 있고, 학급마다 members/{uid}.role=="teacher" 를 다시 확인한다.
 *   - 토큰은 무작위 32바이트, Firestore 에는 sha256 해시만 둔다(mcpTokens). 접근 1시간 / 갱신 60일.
 *   - 학생 이름은 기본으로 가린다(학생 코드 S01…). 허용 화면에서 교사가 "이름 함께"를 켰을 때만 이름을 보낸다.
 *   - 사진·첨부 파일 주소(다운로드 URL — 규칙을 우회한다)·이메일은 절대 내보내지 않는다.
 *
 * Firestore(관리자 SDK 전용 — 규칙에 match 가 없어 클라이언트는 못 읽는다)
 *   mcpClients/{clientId}  mcpAuthRequests/{id}  mcpCodes/{sha}  mcpTokens/{sha}
 */
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { createHash, randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { TRADING_ALIAS } from "./tradingAlias";
import { hashResponses, mergeLeaves, MAP_KINDS, plain, type Leaf } from "./knowledgeMap";
import { registerMoaTools } from "./jamworld/mcp-moa";

const BASE = "https://jammanboeng.web.app";
const RESOURCE = `${BASE}/mcp`; // 함수 rewrite 주소는 호스팅의 trailingSlash 리디렉트를 받지 않는다
const ACCESS_TTL = 3600_000;
const REFRESH_TTL = 60 * 86400_000;
const db = (): Firestore => getFirestore();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");

/* ====================================================================== */
/* OAuth                                                                   */
/* ====================================================================== */

const protectedResource = () => ({
  resource: RESOURCE,
  authorization_servers: [BASE],
  scopes_supported: ["read"],
  bearer_methods_supported: ["header"],
  resource_name: "러닝크루",
});
const authServer = () => ({
  issuer: BASE,
  authorization_endpoint: `${BASE}/oauth/authorize`,
  token_endpoint: `${BASE}/oauth/token`,
  registration_endpoint: `${BASE}/oauth/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
  scopes_supported: ["read"],
});

/** 돌려보내도 되는 주소: https(또는 내 컴퓨터의 http://localhost — Claude Code 등) */
const okRedirect = (u: unknown): u is string => {
  if (typeof u !== "string" || u.length > 500) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"));
  } catch { return false; }
};

type Req = Parameters<Parameters<typeof onRequest>[0]>[0];
type Res = Parameters<Parameters<typeof onRequest>[0]>[1];

function oauthError(res: Res, status: number, error: string, description?: string) {
  res.status(status).json({ error, ...(description ? { error_description: description } : {}) });
}

async function register(req: Req, res: Res) {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris : [];
  if (!uris.length || uris.length > 10 || !uris.every(okRedirect)) return oauthError(res, 400, "invalid_redirect_uri");
  const clientId = `rc_${token().slice(0, 24)}`;
  const method = typeof b.token_endpoint_auth_method === "string" ? b.token_endpoint_auth_method : "none";
  const secret = method === "none" ? null : token();
  const name = String(b.client_name ?? "AI 도우미").slice(0, 80);
  await db().doc(`mcpClients/${clientId}`).set({
    name, redirectUris: uris, method, secretHash: secret ? sha(secret) : null, createdAt: Timestamp.now(),
  });
  res.status(201).json({
    client_id: clientId, client_name: name, redirect_uris: uris, token_endpoint_auth_method: method,
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
  });
}

async function authorize(req: Req, res: Res) {
  const q = req.query as Record<string, string | undefined>;
  const client = q.client_id ? await db().doc(`mcpClients/${q.client_id}`).get() : null;
  if (!client?.exists) return void res.status(400).send("알 수 없는 연결 요청이에요(client_id).");
  const uris = (client.data()?.redirectUris ?? []) as string[];
  if (!q.redirect_uri || !uris.includes(q.redirect_uri)) return void res.status(400).send("돌아갈 주소가 등록된 것과 달라요(redirect_uri).");
  const back = new URL(q.redirect_uri);
  const fail = (error: string) => { back.searchParams.set("error", error); if (q.state) back.searchParams.set("state", q.state); res.redirect(302, back.toString()); };
  if (q.response_type !== "code") return fail("unsupported_response_type");
  if (!q.code_challenge || q.code_challenge_method !== "S256") return fail("invalid_request");
  const id = token();
  await db().doc(`mcpAuthRequests/${id}`).set({
    clientId: q.client_id, clientName: client.data()?.name ?? "AI 도우미", redirectUri: q.redirect_uri,
    state: q.state ?? null, challenge: q.code_challenge, exp: Date.now() + 15 * 60_000,
  });
  res.redirect(302, `${BASE}/mcp-auth/?req=${id}`);
}

/** 허용 화면이 보여 줄 정보(로그인 전에도 — 요청 id 를 아는 사람만) */
export const mcpAuthInfo = onCall({ memory: "256MiB", maxInstances: 5 }, async req => {
  const id = String((req.data as { req?: string })?.req ?? "");
  const snap = id ? await db().doc(`mcpAuthRequests/${id}`).get() : null;
  const v = snap?.data();
  if (!v || v.exp < Date.now()) throw new HttpsError("not-found", "연결 요청이 만료됐어요. AI 앱에서 다시 연결해 주세요.");
  return { clientName: v.clientName, redirectHost: new URL(v.redirectUri).host };
});

/** 교사가 허용/거절 → 돌아갈 주소(코드 또는 오류 포함)를 돌려준다 */
export const mcpApprove = onCall({ memory: "256MiB", maxInstances: 5 }, async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  const { req: id, allow, includeNames } = (req.data ?? {}) as { req?: string; allow?: boolean; includeNames?: boolean };
  const ref = db().doc(`mcpAuthRequests/${String(id ?? "")}`);
  const snap = await ref.get(); const v = snap.data();
  if (!v || v.exp < Date.now()) throw new HttpsError("not-found", "연결 요청이 만료됐어요. AI 앱에서 다시 연결해 주세요.");
  const back = new URL(v.redirectUri);
  if (v.state) back.searchParams.set("state", v.state);
  if (allow) {
    const user = await db().doc(`users/${req.auth.uid}`).get();
    if (user.data()?.role !== "teacher") throw new HttpsError("permission-denied", "선생님 계정만 연결할 수 있어요.");
    const code = token();
    await db().doc(`mcpCodes/${sha(code)}`).set({
      uid: req.auth.uid, clientId: v.clientId, redirectUri: v.redirectUri, challenge: v.challenge,
      includeNames: includeNames === true, exp: Date.now() + 5 * 60_000,
    });
    back.searchParams.set("code", code);
  } else back.searchParams.set("error", "access_denied");
  await ref.delete();
  return { redirect: back.toString() };
});

async function issue(uid: string, clientId: string, includeNames: boolean) {
  const access = token(); const refresh = token(); const now = Date.now();
  const b = db().batch();
  b.set(db().doc(`mcpTokens/${sha(access)}`), { kind: "access", uid, clientId, includeNames, exp: now + ACCESS_TTL });
  b.set(db().doc(`mcpTokens/${sha(refresh)}`), { kind: "refresh", uid, clientId, includeNames, exp: now + REFRESH_TTL });
  await b.commit();
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL / 1000, refresh_token: refresh, scope: "read" };
}

async function tokenEndpoint(req: Req, res: Res) {
  const b = (req.body ?? {}) as Record<string, string | undefined>;
  // 클라이언트 인증(비밀이 있는 클라이언트만): Basic 헤더 또는 본문
  let clientId = b.client_id; let secret = b.client_secret;
  const basic = /^Basic (.+)$/i.exec(String(req.headers.authorization ?? ""));
  if (basic) { const [id, s] = Buffer.from(basic[1], "base64").toString().split(":"); clientId = decodeURIComponent(id); secret = decodeURIComponent(s ?? ""); }
  const client = clientId ? await db().doc(`mcpClients/${clientId}`).get() : null;
  if (!client?.exists) return oauthError(res, 401, "invalid_client");
  const hash = client.data()?.secretHash as string | null;
  if (hash && (!secret || sha(secret) !== hash)) return oauthError(res, 401, "invalid_client");
  res.set("Cache-Control", "no-store");

  if (b.grant_type === "authorization_code") {
    if (!b.code || !b.code_verifier) return oauthError(res, 400, "invalid_request");
    const ref = db().doc(`mcpCodes/${sha(b.code)}`);
    const snap = await ref.get(); const v = snap.data();
    await ref.delete(); // 한 번만 쓸 수 있다
    if (!v || v.exp < Date.now() || v.clientId !== clientId) return oauthError(res, 400, "invalid_grant");
    if (b.redirect_uri && b.redirect_uri !== v.redirectUri) return oauthError(res, 400, "invalid_grant");
    if (createHash("sha256").update(b.code_verifier).digest("base64url") !== v.challenge) return oauthError(res, 400, "invalid_grant", "PKCE");
    return void res.json(await issue(v.uid, clientId!, v.includeNames === true));
  }
  if (b.grant_type === "refresh_token") {
    if (!b.refresh_token) return oauthError(res, 400, "invalid_request");
    const ref = db().doc(`mcpTokens/${sha(b.refresh_token)}`);
    const v = (await ref.get()).data();
    if (!v || v.kind !== "refresh" || v.exp < Date.now() || v.clientId !== clientId) return oauthError(res, 400, "invalid_grant");
    await ref.delete(); // 갱신 토큰은 돌려쓰지 않는다(회전)
    const user = await db().doc(`users/${v.uid}`).get();
    if (user.data()?.role !== "teacher") return oauthError(res, 400, "invalid_grant");
    return void res.json(await issue(v.uid, clientId!, v.includeNames === true));
  }
  oauthError(res, 400, "unsupported_grant_type");
}

/* ====================================================================== */
/* 데이터 다듬기 — 시각, 학생 코드·이름 가리기, 내보내면 안 되는 필드 빼기   */
/* ====================================================================== */

type Ctx = { uid: string; includeNames: boolean };
type Roster = { codeOf: Map<string, string>; nameOf: Map<string, string>; uidOfCode: Map<string, string>; names: [string, string][] };

const DROP = new Set(["photoURL", "photo", "email", "url", "downloadURL", "storagePath", "path", "thumb", "board", "history", "calledWords", "secretHash", "lastActiveAt", "inactive", "heartbeat", "ua", "by"]);
const kst = (ms: number) => (Number.isFinite(ms) && ms > 0 ? new Date(ms + 9 * 3600_000).toISOString().replace("T", " ").slice(0, 19) : "");

/** 학급 학생 명단 → 학생 코드(S01…: 들어온 순서) */
async function roster(cid: string): Promise<Roster> {
  const snap = await db().collection(`classes/${cid}/members`).get();
  const kids = snap.docs.filter(d => d.data().role !== "teacher")
    .map(d => ({ uid: d.id, name: String(d.data().displayName ?? ""), at: (d.data().joinedAt as Timestamp | undefined)?.toMillis?.() ?? 0 }))
    .sort((a, b) => a.at - b.at || a.uid.localeCompare(b.uid));
  const r: Roster = { codeOf: new Map(), nameOf: new Map(), uidOfCode: new Map(), names: [] };
  kids.forEach((k, i) => {
    const code = `S${String(i + 1).padStart(2, "0")}`;
    r.codeOf.set(k.uid, code); r.nameOf.set(k.uid, k.name); r.uidOfCode.set(code, k.uid);
    if (k.name.trim().length >= 2) r.names.push([k.name.trim(), code]);
  });
  r.names.sort((a, b) => b[0].length - a[0].length); // 긴 이름부터 바꾼다(‘김민’ 보다 ‘김민수’ 먼저)
  return r;
}

/** 학생을 가리키는 표시: 이름 허용이면 "이름(S01)", 아니면 "S01" */
const who = (ctx: Ctx, r: Roster, uid: string, fallback = "") => {
  const code = r.codeOf.get(uid);
  if (!code) return ctx.includeNames ? fallback || "학생" : "(명단 밖)";
  return ctx.includeNames ? `${r.nameOf.get(uid) || fallback}(${code})` : code;
};

/** 명단에 없는 계정 id(다른 반 학생 등)처럼 보이는 문자열 — 그대로 내보내지 않는다 */
const UIDLIKE = /^[A-Za-z0-9]{28}$/; // 파이어베이스 계정 id 는 28자(문서 id 는 20자라 건드리지 않는다)
const otherKey = (v: string) => `다른반-${createHash("sha256").update(v).digest("hex").slice(0, 6)}`;

function clean(v: unknown, ctx: Ctx, r: Roster | null, depth = 0): unknown {
  if (v == null) return v;
  if (v instanceof Timestamp) return kst(v.toMillis());
  if (typeof v === "string") {
    if (r?.codeOf.has(v)) return who(ctx, r, v);
    if (UIDLIKE.test(v) && /[0-9]/.test(v) && /[A-Za-z]/.test(v)) return otherKey(v);
    let s = v.length > 4000 ? v.slice(0, 4000) + "…" : v;
    if (!ctx.includeNames && r) for (const [n, code] of r.names) if (s.includes(n)) s = s.split(n).join(code);
    return s;
  }
  if (typeof v !== "object") return v;
  if (depth > 8) return "…";
  if (Array.isArray(v)) return v.slice(0, 300).map(x => clean(x, ctx, r, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (DROP.has(k)) continue;
    // 계정 id 가 칸 이름인 경우(대회 기준값·보유 표 등)도 학생 코드로
    const key = r?.codeOf.has(k) ? who(ctx, r, k) : UIDLIKE.test(k) && /[0-9]/.test(k) && /[A-Za-z]/.test(k) ? otherKey(k) : k;
    // 첨부는 종류만(주소 없이)
    if (k === "attachments" && Array.isArray(x)) { out.attachments = x.map(a => (a as { kind?: string; type?: string })?.kind ?? (a as { type?: string })?.type ?? "file"); continue; }
    out[key] = clean(x, ctx, r, depth + 1);
  }
  return out;
}

const ms = (v: unknown): number => {
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const t = (v as { toMillis?: () => number } | null)?.toMillis?.();
  if (typeof t === "number") return t;
  if (typeof v === "string") { const p = Date.parse(v); return Number.isFinite(p) ? p : 0; }
  return 0;
};

/* ====================================================================== */
/* 권한                                                                    */
/* ====================================================================== */

async function assertTeacherOf(ctx: Ctx, cid: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(cid)) throw new Error("학급 id 가 올바르지 않아요.");
  const m = await db().doc(`classes/${cid}/members/${ctx.uid}`).get();
  if (m.data()?.role !== "teacher") throw new Error("이 학급의 선생님만 볼 수 있어요.");
}
const idOk = (s: string) => /^[A-Za-z0-9_-]{1,100}$/.test(s);

async function myClasses(ctx: Ctx) {
  const snap = await db().collection("classes").where("ownerId", "==", ctx.uid).get();
  const list = await Promise.all(snap.docs.map(async d => {
    const m = await db().doc(`classes/${d.id}/members/${ctx.uid}`).get();
    return m.data()?.role === "teacher" ? { id: d.id, name: String(d.data().name ?? ""), subject: String(d.data().subject ?? "") } : null;
  }));
  return list.filter(Boolean) as { id: string; name: string; subject: string }[];
}

/* ====================================================================== */
/* 도구                                                                    */
/* ====================================================================== */

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 1) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : "읽지 못했어요." }] });
const RO = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

async function lessonsOf(cid: string, limit: number) {
  const snap = await db().collection(`classes/${cid}/lessons`).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as DocumentData & { id: string })
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")) || ms(b.createdAt) - ms(a.createdAt))
    .slice(0, limit);
}
async function questionsOf(cid: string, lid: string) {
  const snap = await db().collection(`classes/${cid}/lessons/${lid}/questions`).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as DocumentData & { id: string }).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
const qSummary = (q: DocumentData & { id: string }) => ({
  id: q.id, kind: q.kind ?? "question", phase: q.phase ?? "", title: String(q.title ?? ""),
  prompt: plain(q.text).slice(0, 500), published: q.published !== false,
  ...(q.kind === "quiz" ? { options: q.options ?? [], answerIndex: q.answerIndex ?? -1 } : {}),
});

/** 브레인스토밍 아이디어(한 섬) → 학생별 묶음 */
async function islandIdeas(ctx: Ctx, cid: string, lid: string, qid: string) {
  const [snap, r] = await Promise.all([db().collection(`classes/${cid}/lessons/${lid}/questions/${qid}/ideas`).get(), roster(cid)]);
  const by = new Map<string, { at: number; text: string }[]>();
  for (const d of snap.docs) {
    const v = d.data(); const list = by.get(v.uid) ?? []; list.push({ at: ms(v.at), text: String(v.text ?? "") }); by.set(v.uid, list);
  }
  const students = [...by.entries()].map(([u, ideas]) => {
    ideas.sort((a, b) => a.at - b.at);
    return { student: who(ctx, r, u, String(snap.docs.find(d => d.data().uid === u)?.data().name ?? "")), count: ideas.length, ideas: ideas.map(i => ({ at: kst(i.at), text: clean(i.text, ctx, r) })) };
  }).sort((a, b) => b.count - a.count);
  return { totalIdeas: snap.size, students };
}


/* ---------- 학급 기록 읽기(get_class_records / get_class_summary / 학생 이력) ---------- */

type Row = { _t: number; v: DocumentData };
const timeOf = (v: DocumentData) => ms(v.at) || ms(v.createdAt) || ms(v.submittedAt) || ms(v.decidedAt) || ms(v.requestedAt) || ms(v.updatedAt) || ms(v.date);
const rowsOf = (docs: FirebaseFirestore.QueryDocumentSnapshot[], extra?: (d: FirebaseFirestore.QueryDocumentSnapshot) => DocumentData): Row[] =>
  docs.map(d => { const v = { id: d.id, ...d.data(), ...(extra ? extra(d) : {}) }; return { _t: timeOf(v), v }; });
/** 종목 코드 옆에 학생에게 보이는 별칭(만보전자 등)을 붙인다 */
const withStock = (v: DocumentData) => (typeof v.symbol === "string" && TRADING_ALIAS[v.symbol] ? { stock: TRADING_ALIAS[v.symbol], ...v } : v);
const studentUid = (r: Roster, s: string) => r.uidOfCode.get(s.trim().toUpperCase()) ?? [...r.nameOf.entries()].find(([, n]) => n === s.trim())?.[0] ?? null;

async function classRecords(cid: string, kind: string, r: Roster, only: string | null): Promise<Row[]> {
  const col = (p: string) => db().collection(`classes/${cid}/${p}`).get().then(x => rowsOf(x.docs));
  const students = only ? [only] : [...r.codeOf.keys()];
  /** 학생마다 있는 하위 기록(지갑·경험치·칭찬함·메시지) */
  const perStudent = async (path: (u: string) => string) => (await Promise.all(students.map(async u => {
    const snap = await db().collection(`classes/${cid}/${path(u)}`).get();
    return rowsOf(snap.docs, () => ({ studentUid: u }));
  }))).flat();
  switch (kind) {
    case "trades": return col("trades");
    case "positions": return col("positions").then(rows => rows.map(x => ({ ...x, v: { ...x.v, studentUid: x.v.id } })));
    case "trading_config": return col("trading");
    case "stock_contests": {
      const snap = await db().collection("stockContests").where("cids", "array-contains", cid).get();
      return rowsOf(snap.docs);
    }
    case "purchases": return col("purchases");
    case "market_items": return col("market");
    case "fundings": return col("fundings");
    case "manbo_log": return perStudent(u => `manbo/${u}/log`);
    case "manbo_wallets": return col("manbo").then(rows => rows.map(x => ({ ...x, v: { ...x.v, studentUid: x.v.id } })));
    case "xp_log": return perStudent(u => `xp/${u}/log`);
    case "xp_totals": return col("xp").then(rows => rows.map(x => ({ ...x, v: { ...x.v, studentUid: x.v.id } })));
    case "xp_requests": return col("xpRequests");
    case "praises": return col("praises");
    case "praise_inbox": return perStudent(u => `praiseInbox/${u}/items`);
    case "feedback": return col("feedback");
    case "messages": return perStudent(u => `threads/${u}/messages`);
    case "comments": {
      // 응답 댓글은 수가 적어 전체에서 이 학급 경로만 고른다
      const snap = await db().collectionGroup("comments").get();
      return rowsOf(snap.docs.filter(d => d.ref.path.startsWith(`classes/${cid}/lessons/`)), d => {
        const seg = d.ref.path.split("/"); // classes/c/lessons/l/questions/q/submissions/s/comments/x
        return { lessonId: seg[3], activityId: seg[5], onResponseOf: seg[7] };
      });
    }
    case "presentation_requests": return col("presentationRequests");
    case "attendance": return col("attendance");
    case "badges": return col("badges").then(rows => rows.map(x => ({ ...x, v: { ...x.v, studentUid: x.v.id } })));
    case "quests": return col("quests");
    case "groups": return col("groups");
    case "projects": return col("projects");
  }
  throw new Error("알 수 없는 기록 종류예요.");
}

/** 요청마다 만드는 MCP 서버(테스트에서도 직접 불러 쓴다) */
/* ====================================================================== */
/* 지식맵 — 화면(/lesson)과 같은 저장 자리·같은 해시를 쓴다                   */
/* ====================================================================== */

const lessonUrl = (cid: string, lid: string) => `${BASE}/lesson/?class=${cid}&id=${lid}`;
const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const MAP_STATE = { no_responses: "응답 없음", not_built: "아직 안 만듦", outdated: "새 응답이 있어 다시 만들어야 함", up_to_date: "최신" } as const;
type MapState = keyof typeof MAP_STATE;

/** 차시의 지식맵 활동(질문·보드)마다 응답 수·지식맵 상태 */
async function mapStatus(cid: string, lid: string) {
  const qs = (await questionsOf(cid, lid)).filter(q => MAP_KINDS.has(q.kind ?? "question"));
  const base = `classes/${cid}/lessons/${lid}`;
  return Promise.all(qs.map(async q => {
    const [subs, leaf] = await Promise.all([db().collection(`${base}/questions/${q.id}/submissions`).get(), db().doc(`${base}/ontology/q:${q.id}`).get()]);
    const ans = subs.docs.map(d => { const v = d.data(); return { uid: String(v.uid ?? ""), content: String(v.content ?? "") }; }).filter(a => a.content.trim());
    const lv = leaf.data() as (Leaf & { generatedAt?: unknown }) | undefined;
    const state: MapState = !ans.length ? "no_responses" : !lv ? "not_built" : lv.inputHash === hashResponses(ans) ? "up_to_date" : "outdated";
    return { q, responses: ans.length, state, leaf: lv ?? null, generatedAt: lv ? kst(ms(lv.generatedAt)) : "" };
  }));
}

/** 지식맵 → 내보낼 모양(학생은 코드로, 많이 나온 개념부터) */
function mapOut(ctx: Ctx, r: Roster, o: Leaf, maxNodes = 80) {
  const nodes = [...(o.nodes ?? [])].sort((a, b) => (b.sourceCount ?? 0) - (a.sourceCount ?? 0) || (b.weight ?? 0) - (a.weight ?? 0)).slice(0, maxNodes);
  const keep = new Set(nodes.map(n => n.id));
  const label = new Map((o.nodes ?? []).map(n => [n.id, n.label]));
  return {
    summary: clean(o.summary ?? "", ctx, r),
    overallSentiment: o.overallSentiment ?? null,
    concepts: nodes.map(n => ({ label: n.label, type: n.type, sentiment: n.sentiment, studentCount: n.sourceCount ?? n.sources?.length ?? 0, students: (n.sources ?? []).map(u => who(ctx, r, u)) })),
    links: (o.edges ?? []).filter(e => keep.has(e.source) && keep.has(e.target))
      .sort((a, b) => (b.sourceCount ?? 0) - (a.sourceCount ?? 0) || (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 160)
      .map(e => ({ from: label.get(e.source) ?? e.source, to: label.get(e.target) ?? e.target, relation: e.relation, studentCount: e.sourceCount ?? 0, evidence: clean(e.evidence ?? "", ctx, r) })),
    ...((o.nodes?.length ?? 0) > maxNodes ? { omittedConcepts: o.nodes.length - maxNodes } : {}),
  };
}

const JOB_WAIT = 45_000; // 도구 응답 안에서 기다리는 시간 — 넘으면 작업 id 로 나중에 확인
const MAX_TASKS = 40;
const LOCK_TTL = 15 * 60_000;

/** 지식맵 작업 진행 상황 */
async function jobView(ctx: Ctx, jobId: string) {
  if (!idOk(jobId)) throw new Error("작업 id 가 올바르지 않아요.");
  const job = await db().doc(`mcpJobs/${jobId}`).get();
  if (!job.exists || job.data()?.uid !== ctx.uid) throw new Error("작업을 찾을 수 없어요.");
  const tasks = (await db().collection(`mcpJobs/${jobId}/tasks`).get()).docs.map(d => d.data());
  const rosters = new Map<string, Roster>();
  for (const cid of new Set(tasks.map(t => String(t.cid)))) rosters.set(cid, await roster(cid));
  const count = (s: string) => tasks.filter(t => t.status === s).length;
  const finished = tasks.every(t => ["done", "skipped", "error"].includes(t.status));
  const lessons = new Map<string, { class: string; lesson: string; date: string; viewUrl: string }>();
  for (const t of tasks) lessons.set(`${t.cid}/${t.lid}`, { class: t.className, lesson: t.lessonTitle, date: t.date, viewUrl: lessonUrl(t.cid, t.lid) });
  return {
    jobId, finished,
    progress: { total: tasks.length, waiting: count("queued"), running: count("running"), done: count("done"), skipped: count("skipped"), error: count("error") },
    activities: tasks.map(t => ({
      class: t.className, lesson: t.lessonTitle, classId: t.cid, lessonId: t.lid, activityId: t.qid, activity: t.title,
      status: ({ queued: "기다리는 중", running: "분석 중", done: "완료", skipped: "건너뜀", error: "실패" } as Record<string, string>)[t.status] ?? t.status,
      ...(t.nodes != null ? { concepts: t.nodes, links: t.edges } : {}),
      ...(t.summary ? { summary: clean(t.summary, ctx, rosters.get(t.cid) ?? null) } : {}),
      ...(t.note ? { note: t.note } : {}), ...(t.error ? { error: t.error } : {}),
    })),
    lessons: [...lessons.values()],
    next: finished ? "get_knowledge_map 으로 차시별 지식맵(개념·관계)을 읽을 수 있어요. 러닝크루 차시 화면(viewUrl)에도 바로 보여요."
      : "분석은 서버에서 계속돼요(질문 하나에 보통 20초~1분). 잠시 뒤 get_knowledge_map_job 으로 다시 확인하세요.",
  };
}

export function buildServer(ctx: Ctx) {
  const s = new McpServer({ name: "러닝크루", version: "1.4.0" } /* 도구를 바꾸면 올린다(1.1.0: 학급 생활 기록·요약, 1.2.0: 지식맵 읽기·만들기, 1.3.0: 모아 월드 만들기, 1.4.0: 에셋 레시피·앱과 같은 후처리) */, {
    instructions: "러닝크루(초등 학급 LMS) 교사용 도구. 먼저 list_classes 로 학급 id 를 얻고, list_lessons 로 차시·활동 id 를 얻은 뒤 응답을 읽으세요. "
      + "주식 거래·만보 경제·칭찬·피드백·댓글·메시지 같은 학급 생활 기록은 get_class_records(kind 로 종류 선택), 기간 요약은 get_class_summary 를 쓰세요. "
      + "지식구조맵(지식맵)은 get_knowledge_map 으로 읽고, build_knowledge_map 으로 만들어 러닝크루에 저장합니다(예: 오늘 수업 모두 → date 생략, 특정 수업 → classId+lessonId). "
      + "모아 월드(학급 메타버스) 제작은 moa_ 도구: 먼저 moa_guide 를 읽고, 사용자와 충분히 묻고 답해 설계를 정한 뒤 moa_submit_brief, 그다음 moa_apply_ops(맵)·moa_set_script(동작·상호작용 코드)·moa_asset_recipe(앱과 같은 그림 프롬프트) → 이미지 생성 → moa_upload_asset(원본 파일 그대로)으로 만듭니다. 쓰기마다 버전이 남아 moa_revert 로 되돌릴 수 있어요. "
      + "쓰기 도구는 build_knowledge_map 과 moa_ 의 쓰기 도구뿐입니다. "
      + "학생은 기본으로 학생 코드(S01…)로 표시됩니다. 결과를 학생·학부모에게 그대로 공유하지 말고, 분석은 한국어로 해 주세요.",
  });

  s.registerTool("list_classes", { title: "내 학급 목록", description: "선생님이 맡은 학급 id·이름 목록.", inputSchema: {}, annotations: RO },
    async () => { try { return json(await myClasses(ctx)); } catch (e) { return fail(e); } });

  s.registerTool("list_students", {
    title: "학생 명단", description: "학급 학생의 학생 코드(S01…)와 들어온 날. 이름은 선생님이 연결할 때 허용한 경우에만.",
    inputSchema: { classId: z.string() }, annotations: RO,
  }, async ({ classId }) => {
    try {
      await assertTeacherOf(ctx, classId); const r = await roster(classId);
      return json([...r.codeOf.entries()].map(([u, code]) => ({ code, ...(ctx.includeNames ? { name: r.nameOf.get(u) } : {}) })));
    } catch (e) { return fail(e); }
  });

  s.registerTool("list_lessons", {
    title: "차시·활동 목록", description: "학급의 차시(최근 날짜부터)와 각 차시의 활동(질문·퀴즈·설문·브레인스토밍·보드 등) id·종류·제목.",
    inputSchema: { classId: z.string(), limit: z.number().int().min(1).max(100).optional() }, annotations: RO,
  }, async ({ classId, limit }) => {
    try {
      await assertTeacherOf(ctx, classId);
      const lessons = await lessonsOf(classId, limit ?? 30);
      return json(await Promise.all(lessons.map(async l => ({
        id: l.id, title: String(l.title ?? ""), date: String(l.date ?? ""),
        preQuestion: String(l.preQuestion ?? ""), postQuestion: String(l.postQuestion ?? ""),
        activities: (await questionsOf(classId, l.id)).map(qSummary),
      }))));
    } catch (e) { return fail(e); }
  });

  s.registerTool("get_lesson_responses", {
    title: "차시 응답 전체", description: "한 차시의 모든 활동과 학생 응답(질문 답·퀴즈 선택·설문·성찰·브레인스토밍 아이디어)을 한 번에.",
    inputSchema: { classId: z.string(), lessonId: z.string() }, annotations: RO,
  }, async ({ classId, lessonId }) => {
    try {
      await assertTeacherOf(ctx, classId); if (!idOk(lessonId)) throw new Error("차시 id 가 올바르지 않아요.");
      const r = await roster(classId);
      const lesson = (await db().doc(`classes/${classId}/lessons/${lessonId}`).get()).data();
      if (!lesson) throw new Error("차시를 찾을 수 없어요.");
      const qs = await questionsOf(classId, lessonId);
      const activities = await Promise.all(qs.map(async q => {
        if (q.kind === "brainstorm") return { ...qSummary(q), brainstorm: await islandIdeas(ctx, classId, lessonId, q.id) };
        const subs = await db().collection(`classes/${classId}/lessons/${lessonId}/questions/${q.id}/submissions`).get();
        return { ...qSummary(q), responses: subs.docs.map(d => { const v = d.data(); return { student: who(ctx, r, d.id, v.studentName), ...(clean({ ...v, uid: undefined, studentName: undefined }, ctx, r) as object) }; }) };
      }));
      const reflections = await db().collection(`classes/${classId}/lessons/${lessonId}/submissions`).get();
      return json({
        lesson: { title: lesson.title, date: lesson.date, preQuestion: lesson.preQuestion, postQuestion: lesson.postQuestion },
        activities,
        reflections: reflections.docs.map(d => { const v = d.data(); return { student: who(ctx, r, d.id, v.studentName), ...(clean({ ...v, uid: undefined, studentName: undefined }, ctx, r) as object) }; }),
      });
    } catch (e) { return fail(e); }
  });

  s.registerTool("get_brainstorm", {
    title: "브레인스토밍 결과", description: "브레인스토밍 활동의 학생별 아이디어(쓴 시각 포함). 여러 반 섬을 이었으면 선생님이 맡은 반의 섬도 함께.",
    inputSchema: { classId: z.string(), lessonId: z.string(), activityId: z.string() }, annotations: RO,
  }, async ({ classId, lessonId, activityId }) => {
    try {
      await assertTeacherOf(ctx, classId); if (!idOk(lessonId) || !idOk(activityId)) throw new Error("id 가 올바르지 않아요.");
      const q = (await db().doc(`classes/${classId}/lessons/${lessonId}/questions/${activityId}`).get()).data();
      if (!q) throw new Error("활동을 찾을 수 없어요.");
      let islands: { cid: string; lid: string; qid: string; name: string }[] = [{ cid: classId, lid: lessonId, qid: activityId, name: "" }];
      if (typeof q.world === "string" && q.world) {
        const w = (await db().doc(`brainstormWorlds/${q.world}`).get()).data();
        if (Array.isArray(w?.islands)) islands = w!.islands;
      }
      const out = [];
      for (const I of islands) {
        try { await assertTeacherOf(ctx, I.cid); } catch { out.push({ class: I.name, skipped: "선생님이 맡지 않은 반이라 뺐어요." }); continue; }
        out.push({ class: I.name || "우리 반", classId: I.cid, ...(await islandIdeas(ctx, I.cid, I.lid, I.qid)) });
      }
      return json({ topic: String(q.title ?? ""), prompt: plain(q.text), islands: out });
    } catch (e) { return fail(e); }
  });

  s.registerTool("list_games", {
    title: "게임 기록", description: "학급 게임(빙고·퀴즈런·뿌요뿌요·리그전) 최근 기록과 학생별 결과·순위.",
    inputSchema: { classId: z.string(), limit: z.number().int().min(1).max(50).optional() }, annotations: RO,
  }, async ({ classId, limit }) => {
    try {
      await assertTeacherOf(ctx, classId); const r = await roster(classId);
      const snap = await db().collection(`classes/${classId}/games`).orderBy("createdAt", "desc").limit(limit ?? 15).get();
      return json(await Promise.all(snap.docs.map(async d => {
        const v = d.data();
        const subs = await d.ref.collection("submissions").get();
        const { candidates: _c, turn: _t, config: _cfg, ...rest } = v;
        return { id: d.id, ...(clean(rest, ctx, r) as object), players: subs.docs.map(x => ({ student: who(ctx, r, x.id, x.data().name), ...(clean({ ...x.data(), uid: undefined, name: undefined, picked: undefined, marked: undefined }, ctx, r) as object) })) };
      })));
    } catch (e) { return fail(e); }
  });

  s.registerTool("get_student_activity", {
    title: "학생 한 명의 활동 이력", description: "한 학생의 최근 활동을 시간순으로: 활동 응답·성찰·브레인스토밍 아이디어·게임 결과·칭찬(보냄/받음)·경험치·주식 거래·마켓 구매·만보 지갑·메시지·댓글. student 는 학생 코드(S01) 또는 이름.",
    inputSchema: { classId: z.string(), student: z.string(), days: z.number().int().min(1).max(365).optional() }, annotations: RO,
  }, async ({ classId, student, days }) => {
    try {
      await assertTeacherOf(ctx, classId); const r = await roster(classId);
      const target = r.uidOfCode.get(student.trim().toUpperCase()) ?? [...r.nameOf.entries()].find(([, n]) => n === student.trim())?.[0];
      if (!target) throw new Error("학생을 찾지 못했어요. list_students 의 학생 코드를 써 주세요.");
      const since = Date.now() - (days ?? 30) * 86400_000;
      const items: { at: number; type: string; [k: string]: unknown }[] = [];
      const lessons = await lessonsOf(classId, 60);
      await Promise.all(lessons.map(async l => {
        const qs = await questionsOf(classId, l.id);
        await Promise.all(qs.map(async q => {
          const where = { lesson: String(l.title ?? ""), activity: String(q.title || q.kind || "") };
          if (q.kind === "brainstorm") {
            const ideas = await db().collection(`classes/${classId}/lessons/${l.id}/questions/${q.id}/ideas`).where("uid", "==", target).get();
            for (const d of ideas.docs) if (ms(d.data().at) >= since) items.push({ at: ms(d.data().at), type: "브레인스토밍", ...where, text: clean(d.data().text, ctx, r) });
            return;
          }
          const sub = await db().doc(`classes/${classId}/lessons/${l.id}/questions/${q.id}/submissions/${target}`).get();
          const v = sub.data(); if (v && ms(v.submittedAt) >= since) items.push({ at: ms(v.submittedAt), type: `활동(${q.kind ?? "question"})`, ...where, response: clean({ ...v, uid: undefined, studentName: undefined, submittedAt: undefined }, ctx, r) });
        }));
        const ref = await db().doc(`classes/${classId}/lessons/${l.id}/submissions/${target}`).get();
        const v = ref.data(); if (v && ms(v.submittedAt) >= since) items.push({ at: ms(v.submittedAt), type: "차시 성찰", lesson: String(l.title ?? ""), response: clean({ ...v, uid: undefined, studentName: undefined, submittedAt: undefined }, ctx, r) });
      }));
      const games = await db().collection(`classes/${classId}/games`).orderBy("createdAt", "desc").limit(40).get();
      await Promise.all(games.docs.map(async g => {
        if (ms(g.data().createdAt) < since) return;
        const sub = await g.ref.collection("submissions").doc(target).get();
        const rank = (g.data().ranks as { uid: string; rank: number }[] | undefined)?.find(x => x.uid === target)?.rank;
        if (sub.exists || rank) items.push({ at: ms(g.data().createdAt), type: `게임(${g.data().kind ?? ""})`, rank: rank ?? null, result: clean({ ...sub.data(), uid: undefined, name: undefined, picked: undefined, marked: undefined }, ctx, r) });
      }));
      const [pTo, pFrom] = await Promise.all([
        db().collection(`classes/${classId}/praises`).where("toUid", "==", target).get(),
        db().collection(`classes/${classId}/praises`).where("fromUid", "==", target).get(),
      ]);
      for (const d of pTo.docs) if (ms(d.data().createdAt) >= since) items.push({ at: ms(d.data().createdAt), type: "칭찬 받음", from: who(ctx, r, d.data().fromUid, d.data().fromName), reason: clean(d.data().reason, ctx, r), status: d.data().status });
      for (const d of pFrom.docs) if (ms(d.data().createdAt) >= since) items.push({ at: ms(d.data().createdAt), type: "칭찬 보냄", to: who(ctx, r, d.data().toUid, d.data().toName), reason: clean(d.data().reason, ctx, r), status: d.data().status });
      const xp = await db().collection(`classes/${classId}/xp/${target}/log`).orderBy("at", "desc").limit(100).get().catch(() => null);
      for (const d of xp?.docs ?? []) if (ms(d.data().at) >= since) items.push({ at: ms(d.data().at), type: "경험치", ...(clean({ ...d.data(), at: undefined }, ctx, r) as object) });
      // 주식 거래·마켓 구매·만보 지갑·메시지·댓글
      const extra: [string, string][] = [["trades", "주식 거래"], ["purchases", "마켓 구매"], ["manbo_log", "만보 지갑"], ["messages", "선생님과 메시지"], ["comments", "댓글"], ["xp_requests", "경험치 요청"], ["presentation_requests", "발표 신청"]];
      for (const [k, label] of extra) {
        const rows: Row[] = await classRecords(classId, k, r, target).catch(() => [] as Row[]);
        for (const x of rows) {
          if (x._t < since) continue;
          if (!["manbo_log", "messages"].includes(k) && !JSON.stringify(x.v).includes(target)) continue;
          const { type: sub, ...rest } = x.v;
          items.push({ at: x._t, ...(clean(withStock({ ...rest, id: undefined, studentUid: undefined, at: undefined, createdAt: undefined }), ctx, r) as object), type: sub ? `${label}(${sub === "spend" ? "씀" : sub === "earn" ? "받음" : sub})` : label });
        }
      }
      items.sort((a, b) => a.at - b.at);
      return json({ student: who(ctx, r, target), days: days ?? 30, count: items.length, timeline: items.map(({ at, ...x }) => ({ at: kst(at), ...x })) });
    } catch (e) { return fail(e); }
  });

  s.registerTool("list_praises", {
    title: "칭찬 기록", description: "학급 칭찬(누가 누구에게 무슨 이유로, 승인 상태) 최근 기록.",
    inputSchema: { classId: z.string(), days: z.number().int().min(1).max(365).optional() }, annotations: RO,
  }, async ({ classId, days }) => {
    try {
      await assertTeacherOf(ctx, classId); const r = await roster(classId);
      const since = Timestamp.fromMillis(Date.now() - (days ?? 30) * 86400_000);
      const snap = await db().collection(`classes/${classId}/praises`).where("createdAt", ">=", since).get();
      return json(snap.docs.map(d => { const v = d.data(); return { at: kst(ms(v.createdAt)), from: who(ctx, r, v.fromUid, v.fromName), to: who(ctx, r, v.toUid, v.toName), reason: clean(v.reason, ctx, r), status: v.status, crossClass: v.crossClass === true }; })
        .sort((a, b) => a.at.localeCompare(b.at)));
    } catch (e) { return fail(e); }
  });

  s.registerTool("list_feedback", {
    title: "학생 피드백·오류 신고", description: "학생이 보낸 의견·오류 신고 최근 기록(사진은 빼고 글만).",
    inputSchema: { classId: z.string(), limit: z.number().int().min(1).max(100).optional() }, annotations: RO,
  }, async ({ classId, limit }) => {
    try {
      await assertTeacherOf(ctx, classId); const r = await roster(classId);
      const snap = await db().collection(`classes/${classId}/feedback`).get();
      return json(snap.docs.map(d => ({ id: d.id, ...(clean(d.data(), ctx, r) as Record<string, unknown>), _t: ms(d.data().createdAt) }))
        .sort((a, b) => b._t - a._t).slice(0, limit ?? 30).map(({ _t, ...x }) => x));
    } catch (e) { return fail(e); }
  });

  s.registerTool("list_idea_sessions", {
    title: "아이디어 섬 세션", description: "선생님이 연 아이디어 섬(jambrain.web.app) 세션 목록.", inputSchema: {}, annotations: RO,
  }, async () => {
    try {
      const snap = await db().collection("ideaSessions").where("ownerId", "==", ctx.uid).get();
      return json(snap.docs.map(d => ({ id: d.id, title: d.data().title, detail: d.data().detail, size: d.data().size, status: d.data().status, createdAt: kst(ms(d.data().createdAt)) }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (e) { return fail(e); }
  });

  s.registerTool("get_idea_session", {
    title: "아이디어 섬 결과", description: "아이디어 섬 세션의 참여자(닉네임)별 아이디어.", inputSchema: { sessionId: z.string() }, annotations: RO,
  }, async ({ sessionId }) => {
    try {
      if (!idOk(sessionId)) throw new Error("세션 id 가 올바르지 않아요.");
      const ref = db().doc(`ideaSessions/${sessionId}`); const v = (await ref.get()).data();
      if (!v || v.ownerId !== ctx.uid) throw new Error("내가 연 세션만 볼 수 있어요.");
      const ideas = await ref.collection("ideas").get();
      const by = new Map<string, { name: string; ideas: { at: number; text: string }[] }>();
      for (const d of ideas.docs) { const x = d.data(); const e = by.get(x.uid) ?? { name: String(x.name ?? ""), ideas: [] }; e.ideas.push({ at: ms(x.at), text: String(x.text ?? "") }); by.set(x.uid, e); }
      return json({
        title: v.title, detail: v.detail, totalIdeas: ideas.size,
        participants: [...by.values()].map(p => ({ nickname: p.name, count: p.ideas.length, ideas: p.ideas.sort((a, b) => a.at - b.at).map(i => ({ at: kst(i.at), text: i.text })) })).sort((a, b) => b.count - a.count),
      });
    } catch (e) { return fail(e); }
  });

  /* ---------- 학급 생활 기록: 트레이딩·경제·칭찬·피드백·상호작용 ---------- */

  s.registerTool("get_class_records", {
    title: "학급 기록 꺼내기",
    description: "학급의 활동·상호작용 기록을 종류별로(최근 순). kind: "
      + "trades(주식 매수·매도), positions(학생별 보유 주식), trading_config(거래 시간 설정), stock_contests(주식 대회), "
      + "purchases(러닝마켓 구매), market_items(마켓 상품), fundings(크라우드펀딩), manbo_log(학생별 만보 지갑 입출금), manbo_wallets(만보 잔액), "
      + "xp_log(경험치 내역), xp_totals(경험치 합계), xp_requests(경험치 요청·승인), praises(칭찬), praise_inbox(학생이 받은 칭찬함), "
      + "feedback(학생 의견·오류 신고), comments(응답에 달린 댓글), messages(선생님-학생 메시지), presentation_requests(발표 신청), "
      + "attendance(출석), badges(배지), quests(퀘스트), groups(모둠), projects(프로젝트). days 로 기간(기본 30일), student 로 한 학생만.",
    inputSchema: {
      classId: z.string(),
      kind: z.enum(["trades", "positions", "trading_config", "stock_contests", "purchases", "market_items", "fundings", "manbo_log", "manbo_wallets",
        "xp_log", "xp_totals", "xp_requests", "praises", "praise_inbox", "feedback", "comments", "messages", "presentation_requests",
        "attendance", "badges", "quests", "groups", "projects"]),
      days: z.number().int().min(1).max(730).optional(),
      student: z.string().optional(),
      limit: z.number().int().min(1).max(1000).optional(),
    },
    annotations: RO,
  }, async ({ classId, kind, days, student, limit }) => {
    try {
      await assertTeacherOf(ctx, classId); const r = await roster(classId);
      const target = student ? studentUid(r, student) : null;
      if (student && !target) throw new Error("학생을 찾지 못했어요. list_students 의 학생 코드를 써 주세요.");
      const rows = await classRecords(classId, kind, r, target);
      const since = Date.now() - (days ?? 30) * 86400_000;
      const timeless = ["positions", "trading_config", "market_items", "manbo_wallets", "xp_totals", "badges", "groups", "projects", "quests"].includes(kind);
      const kept = rows.filter(x => timeless || x._t === 0 || x._t >= since)
        .filter(x => !target || timeless || JSON.stringify(x.v).includes(target))
        .sort((a, b) => b._t - a._t).slice(0, limit ?? 300);
      return json({ kind, days: timeless ? null : days ?? 30, count: kept.length, rows: kept.map(x => clean(withStock(x.v), ctx, r)) });
    } catch (e) { return fail(e); }
  });

  s.registerTool("get_class_summary", {
    title: "학급 활동 한눈에", description: "기간(기본 7일) 동안 학급에서 일어난 일을 숫자로: 주식 매수·매도(종목별), 마켓 구매, 칭찬, 피드백, 경험치 요청, 댓글·메시지, 학생별 활동량 순위.",
    inputSchema: { classId: z.string(), days: z.number().int().min(1).max(365).optional() }, annotations: RO,
  }, async ({ classId, days }) => {
    try {
      await assertTeacherOf(ctx, classId); const r = await roster(classId);
      const since = Date.now() - (days ?? 7) * 86400_000;
      const kinds = ["trades", "purchases", "praises", "feedback", "xp_requests", "comments", "messages", "fundings", "presentation_requests"] as const;
      const per: Record<string, number> = {}; const byStudent = new Map<string, Record<string, number>>();
      const stocks: Record<string, { buy: number; sell: number; qty: number }> = {};
      for (const k of kinds) {
        const rows = (await classRecords(classId, k, r, null)).filter(x => x._t >= since);
        per[k] = rows.length;
        for (const x of rows) {
          const u = String(x.v.uid ?? x.v.buyerUid ?? x.v.fromUid ?? x.v.byUid ?? x.v.authorUid ?? x.v.studentUid ?? "");
          if (r.codeOf.has(u)) { const e = byStudent.get(u) ?? {}; e[k] = (e[k] ?? 0) + 1; byStudent.set(u, e); }
          if (k === "trades") {
            const name = TRADING_ALIAS[String(x.v.symbol)] ?? String(x.v.symbol);
            const e = stocks[name] ?? { buy: 0, sell: 0, qty: 0 };
            if (x.v.side === "sell") e.sell++; else e.buy++;
            e.qty += Number(x.v.qty ?? 0); stocks[name] = e;
          }
        }
      }
      const ranking = [...byStudent.entries()].map(([u, c]) => ({ student: who(ctx, r, u), total: Object.values(c).reduce((a, b) => a + b, 0), ...c }))
        .sort((a, b) => b.total - a.total);
      const quiet = [...r.codeOf.keys()].filter(u => !byStudent.has(u)).map(u => who(ctx, r, u));
      return json({ days: days ?? 7, students: r.codeOf.size, counts: per, tradesByStock: stocks, activeStudents: ranking, noActivity: quiet });
    } catch (e) { return fail(e); }
  });

  // ChatGPT(딥 리서치·커넥터)가 기대하는 search / fetch
  s.registerTool("get_knowledge_map", {
    title: "지식맵 읽기",
    description: "러닝크루에 저장된 지식구조맵(학생 응답에서 뽑은 개념·관계·감정). lessonId 를 주면 그 차시 전체 지식맵(질문별 지식맵을 합친 것, 화면의 '차시 전체 지식맵'과 같음)과 활동별 상태, "
      + "activityId 까지 주면 그 질문(보드)의 지식맵. lessonId 를 빼면 최근 차시들의 지식맵 상태와 주요 개념. 상태가 '아직 안 만듦'·'다시 만들어야 함'이면 build_knowledge_map 으로 만드세요.",
    inputSchema: { classId: z.string(), lessonId: z.string().optional(), activityId: z.string().optional(), limit: z.number().int().min(1).max(30).optional().describe("lessonId 없을 때 볼 최근 차시 수(기본 10)") },
    annotations: RO,
  }, async ({ classId, lessonId, activityId, limit }) => {
    try {
      await assertTeacherOf(ctx, classId); const r = await roster(classId);
      if (!lessonId) {
        const lessons = await lessonsOf(classId, limit ?? 10);
        return json(await Promise.all(lessons.map(async l => {
          const st = await mapStatus(classId, l.id);
          const merged = mergeLeaves(st.map(x => x.leaf).filter(Boolean) as Leaf[]);
          return {
            lessonId: l.id, title: String(l.title ?? ""), date: String(l.date ?? ""), viewUrl: lessonUrl(classId, l.id),
            activities: st.map(x => ({ activityId: x.q.id, title: String(x.q.title ?? ""), responses: x.responses, map: MAP_STATE[x.state] })),
            topConcepts: merged.nodes.sort((a, b) => b.sourceCount - a.sourceCount).slice(0, 10).map(n => n.label),
          };
        })));
      }
      if (!idOk(lessonId)) throw new Error("차시 id 가 올바르지 않아요.");
      const lesson = (await db().doc(`classes/${classId}/lessons/${lessonId}`).get()).data();
      if (!lesson) throw new Error("차시를 찾을 수 없어요.");
      const st = await mapStatus(classId, lessonId);
      const head = { lesson: { title: String(lesson.title ?? ""), date: String(lesson.date ?? "") }, viewUrl: lessonUrl(classId, lessonId) };
      if (activityId) {
        const x = st.find(y => y.q.id === activityId);
        if (!x) throw new Error("지식맵을 만드는 활동(질문·보드)이 아니거나 없는 활동이에요.");
        return json({ ...head, activity: { activityId, title: String(x.q.title ?? ""), prompt: plain(x.q.text).slice(0, 500) }, responses: x.responses, state: MAP_STATE[x.state], generatedAt: x.generatedAt, map: x.leaf ? mapOut(ctx, r, x.leaf) : null });
      }
      const merged = mergeLeaves(st.map(x => x.leaf).filter(Boolean) as Leaf[]);
      return json({
        ...head,
        activities: st.map(x => ({ activityId: x.q.id, title: String(x.q.title ?? ""), responses: x.responses, state: MAP_STATE[x.state], generatedAt: x.generatedAt })),
        needsBuild: st.filter(x => x.state === "not_built" || x.state === "outdated").length,
        map: merged.nodes.length ? mapOut(ctx, r, merged, 100) : null,
      });
    } catch (e) { return fail(e); }
  });

  s.registerTool("build_knowledge_map", {
    title: "지식맵 만들기",
    description: "학생 응답으로 지식구조맵을 만들어 러닝크루에 저장해요(차시 화면의 '분석' 버튼과 같은 일). 저장하면 /lesson 지식맵에 바로 보여요. "
      + "① 날짜로: date(YYYY-MM-DD, 기본 오늘)의 모든 차시 — classId 를 주면 그 학급만, 빼면 선생님의 모든 학급. ② 차시로: classId+lessonId(activityIds 로 일부 질문만). "
      + "응답이 바뀐 질문만 분석하고 이미 최신이면 건너뛰어요(force=true 면 다시 만듦). 분석은 서버에서 돌고, 45초 안에 끝나지 않으면 jobId 로 get_knowledge_map_job 을 불러 확인하세요.",
    inputSchema: {
      date: z.string().optional().describe("YYYY-MM-DD 또는 today. lessonId 가 없을 때 쓰는 날짜(기본 오늘, 한국 시간)"),
      classId: z.string().optional(), lessonId: z.string().optional(),
      activityIds: z.array(z.string()).max(40).optional(), force: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ date, classId, lessonId, activityIds, force }) => {
    try {
      // 1) 대상 차시
      const targets: { cid: string; className: string; lid: string; lesson: DocumentData }[] = [];
      let day = "";
      if (lessonId) {
        if (!classId) throw new Error("lessonId 를 줄 때는 classId 도 함께 주세요.");
        await assertTeacherOf(ctx, classId); if (!idOk(lessonId)) throw new Error("차시 id 가 올바르지 않아요.");
        const l = (await db().doc(`classes/${classId}/lessons/${lessonId}`).get()).data();
        if (!l) throw new Error("차시를 찾을 수 없어요.");
        const c = (await db().doc(`classes/${classId}`).get()).data();
        targets.push({ cid: classId, className: String(c?.name ?? ""), lid: lessonId, lesson: l });
      } else {
        day = !date || date === "today" ? todayKst() : date;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("date 는 YYYY-MM-DD 로 주세요.");
        let classes: { id: string; name: string }[];
        if (classId) { await assertTeacherOf(ctx, classId); classes = [{ id: classId, name: String((await db().doc(`classes/${classId}`).get()).data()?.name ?? "") }]; }
        else classes = await myClasses(ctx);
        for (const c of classes) {
          const snap = await db().collection(`classes/${c.id}/lessons`).where("date", "==", day).get();
          for (const d of snap.docs) targets.push({ cid: c.id, className: c.name, lid: d.id, lesson: d.data() });
        }
        if (!targets.length) return json({ date: day, message: `${day} 날짜의 차시가 없어요. list_lessons 로 차시 날짜를 확인하거나 lessonId 로 지정해 주세요.` });
      }
      // 2) 만들 질문 고르기
      const want = activityIds?.length ? new Set(activityIds) : null;
      const plan: { t: (typeof targets)[number]; qid: string; title: string }[] = [];
      const already: { class: string; lesson: string; activity: string; state: string }[] = [];
      for (const t of targets) {
        for (const x of await mapStatus(t.cid, t.lid)) {
          if (want && !want.has(x.q.id)) continue;
          const row = { class: t.className, lesson: String(t.lesson.title ?? ""), activity: String(x.q.title ?? "") };
          if (x.state === "no_responses" || (x.state === "up_to_date" && !force)) { already.push({ ...row, state: MAP_STATE[x.state] }); continue; }
          plan.push({ t, qid: x.q.id, title: String(x.q.title ?? "") });
        }
      }
      if (!plan.length) return json({ date: day || undefined, message: "새로 만들 지식맵이 없어요(모두 최신이거나 응답이 없어요).", activities: already, lessons: targets.map(t => ({ class: t.className, lesson: t.lesson.title, viewUrl: lessonUrl(t.cid, t.lid) })) });
      if (plan.length > MAX_TASKS) throw new Error(`한 번에 ${MAX_TASKS}개 질문까지 만들 수 있어요(지금 ${plan.length}개). 학급이나 차시를 나눠 주세요.`);
      // 3) 같은 질문이 이미 분석 중이면 겹쳐 돌리지 않는다(잠금)
      const now = Date.now();
      const busy: string[] = [];
      const go: typeof plan = [];
      for (const p of plan) {
        const lock = db().doc(`mcpMapLocks/${p.t.cid}_${p.t.lid}_${p.qid}`);
        const got = await db().runTransaction(async tx => {
          const v = (await tx.get(lock)).data();
          if (v && now - ms(v.at) < LOCK_TTL) return false;
          tx.set(lock, { at: Timestamp.fromMillis(now), uid: ctx.uid });
          return true;
        });
        if (got) go.push(p); else busy.push(p.title);
      }
      if (!go.length) return json({ message: "요청한 질문들은 이미 분석 중이에요. 1~2분 뒤 get_knowledge_map 으로 확인하세요.", busy });
      // 4) 작업 넣기 → 서버(mcpMapTask)가 질문마다 동시에 분석
      const job = db().collection("mcpJobs").doc();
      await job.set({ uid: ctx.uid, createdAt: FieldValue.serverTimestamp(), date: day, total: go.length });
      const batch = db().batch();
      for (const p of go) batch.set(job.collection("tasks").doc(), {
        uid: ctx.uid, cid: p.t.cid, lid: p.t.lid, qid: p.qid, force: !!force, status: "queued",
        className: p.t.className, lessonTitle: String(p.t.lesson.title ?? ""), date: String(p.t.lesson.date ?? ""), title: p.title, createdAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      // 5) 잠깐 기다렸다가 결과(또는 진행 상황) 돌려주기
      const until = Date.now() + JOB_WAIT;
      let view = await jobView(ctx, job.id);
      while (!view.finished && Date.now() < until) { await new Promise(res => setTimeout(res, 3000)); view = await jobView(ctx, job.id); }
      return json({ ...view, ...(already.length ? { notBuilt: already } : {}), ...(busy.length ? { alreadyRunning: busy } : {}) });
    } catch (e) { return fail(e); }
  });

  s.registerTool("get_knowledge_map_job", {
    title: "지식맵 만들기 진행 상황", description: "build_knowledge_map 이 돌려준 jobId 의 진행 상황(질문별 완료·실패, 만든 개념 수·요약).",
    inputSchema: { jobId: z.string() }, annotations: RO,
  }, async ({ jobId }) => { try { return json(await jobView(ctx, jobId)); } catch (e) { return fail(e); } });

  s.registerTool("search", {
    title: "검색", description: "내 학급의 차시·활동 제목과 질문 글에서 찾기. 결과 id 를 fetch 에 넘기면 응답 전체를 읽는다.",
    inputSchema: { query: z.string() }, annotations: RO,
  }, async ({ query }) => {
    try {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const hit = (s: string) => !words.length || words.some(w => s.toLowerCase().includes(w));
      const results: { id: string; title: string; url: string }[] = [];
      for (const c of await myClasses(ctx)) {
        for (const l of await lessonsOf(c.id, 60)) {
          const qs = await questionsOf(c.id, l.id);
          const text = `${c.name} ${l.title ?? ""} ${l.preQuestion ?? ""} ${l.postQuestion ?? ""} ${qs.map(q => `${q.title ?? ""} ${plain(q.text)}`).join(" ")}`;
          if (hit(text)) results.push({ id: `lesson:${c.id}:${l.id}`, title: `[${c.name}] ${l.date ?? ""} ${l.title ?? ""}`.trim(), url: lessonUrl(c.id, l.id) });
          if (results.length >= 20) break;
        }
        if (results.length >= 20) break;
      }
      return json({ results });
    } catch (e) { return fail(e); }
  });

  s.registerTool("fetch", {
    title: "가져오기", description: "search 결과 id(lesson:학급:차시)의 차시 응답 전체를 글로.", inputSchema: { id: z.string() }, annotations: RO,
  }, async ({ id }) => {
    try {
      const [kind, cid, lid] = id.split(":");
      if (kind !== "lesson" || !cid || !lid || !idOk(lid)) throw new Error("알 수 없는 id 예요.");
      await assertTeacherOf(ctx, cid); const r = await roster(cid);
      const lesson = (await db().doc(`classes/${cid}/lessons/${lid}`).get()).data();
      if (!lesson) throw new Error("차시를 찾을 수 없어요.");
      const lines: string[] = [`차시: ${lesson.title ?? ""} (${lesson.date ?? ""})`];
      for (const q of await questionsOf(cid, lid)) {
        lines.push("", `## ${q.title || q.kind} [${q.kind}]`, plain(q.text));
        if (q.kind === "brainstorm") {
          const b = await islandIdeas(ctx, cid, lid, q.id);
          for (const st of b.students) lines.push(`- ${st.student}: ${st.ideas.map(i => i.text).join(" / ")}`);
        } else {
          const subs = await db().collection(`classes/${cid}/lessons/${lid}/questions/${q.id}/submissions`).get();
          for (const d of subs.docs) { const v = d.data(); lines.push(`- ${who(ctx, r, d.id, v.studentName)}: ${clean(v.content ?? JSON.stringify(v.surveyAnswers ?? ""), ctx, r)}`); }
        }
      }
      return json({ id, title: String(lesson.title ?? ""), text: lines.join("\n"), url: lessonUrl(cid, lid), metadata: { classId: cid, date: lesson.date ?? "" } });
    } catch (e) { return fail(e); }
  });

  registerMoaTools(s, ctx);
  return s;
}

/* ====================================================================== */
/* HTTP 입구                                                               */
/* ====================================================================== */

async function bearer(req: Req): Promise<Ctx | null> {
  const m = /^Bearer (.+)$/i.exec(String(req.headers.authorization ?? ""));
  if (!m) return null;
  const v = (await db().doc(`mcpTokens/${sha(m[1].trim())}`).get()).data();
  if (!v || v.kind !== "access" || v.exp < Date.now()) return null;
  return { uid: v.uid, includeNames: v.includeNames === true };
}

export const mcp = onRequest({ memory: "512MiB", maxInstances: 10, timeoutSeconds: 120, cors: false }, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID");
  res.set("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
  res.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.set("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return void res.status(204).end();
  const path = req.path.replace(/\/+$/, "") || "/";
  try {
    if (path.startsWith("/.well-known/oauth-protected-resource")) return void res.json(protectedResource());
    if (path.startsWith("/.well-known/oauth-authorization-server") || path.startsWith("/.well-known/openid-configuration")) return void res.json(authServer());
    if (path === "/oauth/register" && req.method === "POST") return await register(req, res);
    if (path === "/oauth/authorize" && req.method === "GET") return await authorize(req, res);
    if (path === "/oauth/token" && req.method === "POST") return await tokenEndpoint(req, res);
    if (path === "/mcp") {
      const ctx = await bearer(req);
      if (!ctx) {
        res.set("WWW-Authenticate", `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource"`);
        return oauthError(res, 401, "invalid_token", "러닝크루 선생님 계정으로 연결해 주세요.");
      }
      if (req.method !== "POST") return void res.status(405).set("Allow", "POST").json({ error: "method_not_allowed" });
      // 요청마다 새 서버(상태 없음) — 함수 인스턴스가 여럿이어도 문제없다
      const server = buildServer(ctx);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }
    res.status(404).json({ error: "not_found" });
  } catch (e) {
    console.error("mcp", e);
    if (!res.headersSent) res.status(500).json({ error: "server_error" });
  }
});
