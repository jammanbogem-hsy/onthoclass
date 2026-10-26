/**
 * 모아 월드 MCP 도구 — ChatGPT·Claude 가 선생님 계정으로 모아 월드 스페이스를 읽고 만들고 고친다.
 *
 * 흐름(grill-me): moa_guide 로 엔진·스타일을 읽고 → 사용자와 충분히 묻고 답한 뒤 moa_submit_brief 로 설계서를 낸다
 *   → 설계서가 완성된 스페이스에만 moa_apply_ops / moa_set_script 로 쓴다. 쓰기마다 이전 상태를 버전으로 남긴다(moa_revert).
 * 에셋: moa_asset_recipe 가 앱과 똑같은 생성 프롬프트·순서를 주고, AI 가 자기 이미지 생성으로 그린 원본을 moa_upload_asset 으로
 *   넘기면 서버가 앱과 같은 후처리(배경 지우기·걷기 시트 자르기·발 맞춤·좌우 뒤집기)로 '에셋 모음'에 넣는다. 서버 이미지 생성(유료)은 쓰지 않는다.
 * 비용: 맵은 스페이스 문서·맵 문서만 읽고 쓴다. 카탈로그는 인스턴스 메모(publishedAssets).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getFirestore } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { applyOps } from "./lib/world/ops";
import { createMap } from "./lib/world/map";
import { CATALOG, scopedUserAssets, withAssetScope } from "./lib/world/catalog";
import { embeddedFromLibrary } from "./lib/world/user-assets";
import { mapContext, SYSTEM_PROMPT } from "./lib/agent/prompt";
import { publishedAssets } from "./lib/server/workshop/catalog";
import { cleanSpec, createUploadedAsset, startUpload, TOKEN_RE } from "./lib/server/asset-upload";
import { assetRecipe } from "./lib/server/workshop/prompts";
import { scriptSyntaxError } from "./lib/server/map-script";
import { getWorld, getWorldMeta, listVersions, listWorlds, revertWorld, saveWorld } from "./lib/server/worlds";
import type { EmbeddedAsset } from "./lib/world/types";

type Ctx = { uid: string };
const BASE = "https://jammanboeng.web.app";
const json = (data: unknown) => ({ content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 1) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : "처리하지 못했어요." }] });
const RO = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const owner = (ctx: Ctx) => `t:${ctx.uid}`;
const links = (pid: string, mid?: string) => ({
  editUrl: `${BASE}/jamworldmake/?view=editor&id=${pid}${mid ? `&map=${mid}` : ""}`,
  playUrl: `${BASE}/jamworldmake/?view=play&id=${pid}${mid ? `&map=${mid}` : ""}`,
});
const newId = (p: string) => `${p}-${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;

async function library(): Promise<Record<string, EmbeddedAsset>> {
  const out: Record<string, EmbeddedAsset> = {};
  for (const a of await publishedAssets()) { const { id, embed } = embeddedFromLibrary(a); out[id] = embed; }
  return out;
}

/* ------------------------------------------------------------- 설계서(grill-me) */

const BRIEF_FIELDS = {
  goal: "수업 목표·주제(무엇을 배우나)",
  players: "누가·몇 명이 어떻게 플레이하나(개인/모둠, 학년)",
  minutes: "플레이 시간(분)",
  coreLoop: "핵심 놀이 흐름(학생이 처음부터 끝까지 무엇을 하나)",
  controls: "조작(이동 외 키·화면 버튼)",
  interactions: "상호작용 목록(물체·NPC·퀴즈·구역 효과 등과 그 반응)",
  feedback: "피드백·연출(점수판, 효과, 소리, 메시지)",
  winCondition: "끝·성공 조건",
  assets: "필요한 에셋(있는 것 재사용 / 새로 만들 것과 모습)",
} as const;
type Brief = Partial<Record<keyof typeof BRIEF_FIELDS, string>> & { openQuestions?: string[] };

async function requireBrief(ctx: Ctx, pid: string) {
  const snap = await getFirestore().doc(`jamworldWorlds/${pid}`).get();
  if (!snap.exists || snap.data()!.ownerKey !== owner(ctx)) throw new Error("스페이스를 찾지 못했어요. moa_list_worlds 로 id 를 확인하세요.");
  const b = snap.data()!.brief as Brief | undefined;
  if (!b) throw new Error("먼저 사용자와 충분히 대화해 설계를 정하고 moa_submit_brief 로 설계서를 내세요(빠진 항목은 사용자에게 물어보세요).");
  if (b.openQuestions?.length) throw new Error(`설계서에 아직 답하지 않은 질문이 있어요: ${b.openQuestions.join(" / ")} — 사용자에게 묻고 moa_submit_brief 로 갱신하세요.`);
  return b;
}

/* ------------------------------------------------------------- 에셋 올리기 */

// 그림은 '이미지 생성 모델이 그린 래스터 그림'만 받는다. 코드(SVG)로 그린 그림은 아이콘처럼 납작해서 모아 월드 스타일이 안 나온다.
const ImageInput = z.object({
  download_url: z.string().url().optional().describe("ChatGPT 가 넘기는 파일 주소(대화에서 만든·올린 그림)"),
  file_id: z.string().optional(),
  url: z.string().url().optional().describe("https 이미지 주소(PNG/WebP, 8MB 이하)"),
  base64: z.string().max(16_000_000).optional().describe("PNG/WebP base64(12MB 이하)"),
}).describe("이미지 생성 모델이 그린 그림 파일 — download_url·url·base64 중 하나(SVG 안 받음)");

function privateIp(ip: string) {
  return /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1$|fc|fd|fe80)/i.test(ip);
}
async function fetchImage(raw: string): Promise<Buffer> {
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new Error("이미지 주소는 https 만 받아요.");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".internal") || /^[\d.]+$|:/.test(host)) throw new Error("이 주소의 이미지는 받을 수 없어요.");
  const ips = await lookup(host, { all: true });
  if (!ips.length || ips.some(a => privateIp(a.address))) throw new Error("이 주소의 이미지는 받을 수 없어요.");
  let res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
  for (let hop = 0; hop < 3 && res.status >= 300 && res.status < 400 && res.headers.get("location"); hop++) {
    const next = new URL(res.headers.get("location")!, u);
    if (next.protocol !== "https:" || /^[\d.]+$|:/.test(next.hostname)) throw new Error("이 주소의 이미지는 받을 수 없어요.");
    const hopIps = await lookup(next.hostname, { all: true });
    if (!hopIps.length || hopIps.some(a => privateIp(a.address))) throw new Error("이 주소의 이미지는 받을 수 없어요.");
    res = await fetch(next, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
  }
  if (!res.ok) throw new Error(`이미지를 받지 못했어요(${res.status}).`);
  if (!/^image\//.test(res.headers.get("content-type") ?? "")) throw new Error("이미지 파일이 아니에요.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) throw new Error("이미지가 너무 커요(8MB 이하).");
  return buf;
}
async function readImage(src: z.infer<typeof ImageInput> | undefined): Promise<Buffer | undefined> {
  if (!src) return undefined;
  if (src.base64) return Buffer.from(src.base64.replace(/^data:[^,]+,/, ""), "base64");
  if (src.download_url) return fetchImage(src.download_url);
  if (src.url) return fetchImage(src.url);
  throw new Error("그림 파일(download_url·url·base64 중 하나)을 주세요.");
}
/* ------------------------------------------------------------- 도구 */

export function registerMoaTools(s: McpServer, ctx: Ctx) {
  s.registerTool("moa_guide", {
    title: "모아 월드 엔진·스타일 안내",
    description: "모아 월드(학급용 2D/쿼터뷰 메타버스)를 만들기 전에 꼭 먼저 읽으세요. 맵 작업(ops) 형식, 맵 코드 World API(입력·타이머·움직임·날리기·효과·소리·HUD·선택창·오브젝트 제어), 에셋 그림 규격·스타일, 설계서 항목을 알려 줘요.",
    inputSchema: { topic: z.enum(["all", "design", "map", "script", "assets"]).optional() }, annotations: RO,
  }, async ({ topic = "all" }) => {
    const design = `# 설계 대화(필수)\n사용자와 충분히 묻고 답하세요. 한 번에 2~3개씩 구체적으로 물어보고, 답을 요약해 확인받으세요. 아래 항목이 모두 정해지면 moa_submit_brief 로 내고, 그 뒤에만 맵을 쓸 수 있어요.\n${Object.entries(BRIEF_FIELDS).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n애매한 항목은 openQuestions 에 넣으면 쓰기가 막혀요. 작업 후에는 editUrl/playUrl 을 사용자에게 주고 플레이해 본 느낌을 물어 다듬으세요.`;
    const refs = (await publishedAssets()).filter(a => a.provenance?.model !== "mcp-upload").slice(0, 6)
      .map(a => `  - ${a.name}: ${BASE}${(a.urls as { iso?: string | null; texture?: string | null }).iso ?? (a.urls as { texture?: string | null }).texture ?? ""}`).join("\n");
    const assets = `# 에셋 만들기 — 모아 월드 앱과 같은 품질로(반드시 이 순서)
1. moa_get_catalog 로 이미 있는 에셋을 먼저 찾아 재사용하세요.
2. 새로 만들 때는 moa_asset_recipe 를 부르세요. 앱이 이미지 모델에 보내는 것과 똑같은 영어 프롬프트와 단계(위에서 본 그림 → 그것을 참고한 입체 그림, 인물은 걷기 시트 2장)를 줘요.
3. 각 단계를 '이미지 생성 도구'로 그리세요. 프롬프트를 줄이거나 바꾸지 말고 그대로 쓰세요(스타일·격자·방향 규칙이 들어 있어요). 2단계는 1단계 그림을 참고 이미지로 붙여 같은 대상으로 그리세요.
4. 그린 원본 파일을 moa_upload_asset 에 바로 넘기세요(ChatGPT 는 파일 칸에 그림 그대로). Python 으로 자르기·크기 바꾸기·합치기·배경 지우기를 하지 마세요 — 서버가 앱과 똑같이 해요(배경 지우기, 걷기 시트 인물 찾기·발 높이 맞춤·왼쪽 방향은 오른쪽을 뒤집어 만들기, 512px 맞춤).
5. 결과의 preview 주소를 열어 사용자에게 보여 주고, 마음에 안 들면 같은 레시피로 다시 그리세요.
- SVG·코드로 그린 그림, 384px 보다 작은 그림은 거절돼요.
- 그림을 도구로 넘길 수 없을 때만 moa_start_upload 로 링크를 만들어 사용자에게 파일을 올려 달라고 하세요. 이미지를 그릴 수 없는 AI(예: Claude)는 레시피 프롬프트를 사용자에게 주고 이미지 생성 도구로 그려 링크에 올려 달라고 하세요.
- 크기: footprint 1~6칸(건물·경기장은 4~6), height 0.2~5, 막히는 물체 passable=false.
- 기준 그림(앱에서 만든 에셋 — 느낌 비교용):
${refs}`;
    const map = SYSTEM_PROMPT.split("작업 형식(op 필드로 구분):")[1] ?? "";
    const rules = SYSTEM_PROMPT.replace(/^[\s\S]*?규칙:\n/, "").split("\n작업 형식")[0];
    const text = topic === "design" ? design : topic === "assets" ? assets
      : topic === "map" ? `# 맵 작업(moa_apply_ops 의 ops)\n${map}\n\n# 규칙\n${rules}`
      : topic === "script" ? `# 맵 코드(moa_set_script)\n${rules.split("\n").filter(l => /World\.|setScript|스크립트|코드/.test(l)).join("\n")}`
      : `${design}\n\n# 맵 작업(moa_apply_ops 의 ops)\n${map}\n\n# 규칙·맵 코드 World API\n${rules.replace(/submit_map_ops 도구를 정확히 한 번 호출하세요\. 코드나 설명문만 답하지 마세요\./, "")}\n\n${assets}`;
    return json(text);
  });

  s.registerTool("moa_list_worlds", { title: "내 모아 월드 목록", description: "선생님의 모아 월드 스페이스(여러 맵 묶음) 목록과 편집·플레이 주소.", inputSchema: {}, annotations: RO },
    async () => { try { return json((await listWorlds(owner(ctx))).map(w => ({ ...w, ...links(w.id) }))); } catch (e) { return fail(e); } });

  s.registerTool("moa_get_world", {
    title: "모아 월드 읽기",
    description: "스페이스 정보·설계서와 맵 한 장의 상태(점유 격자·바닥 격자·구역·상호작용·오브젝트 id·맵 코드)를 글로 줘요. mapId 를 빼면 첫 맵.",
    inputSchema: { worldId: z.string(), mapId: z.string().optional() }, annotations: RO,
  }, async ({ worldId, mapId }) => {
    try {
      const meta = await getWorldMeta(owner(ctx), worldId);
      if (!meta) throw new Error("스페이스를 찾지 못했어요.");
      const mid = mapId ?? meta.mapIds[0];
      const w = await getWorld(owner(ctx), worldId, [mid]);
      const doc = w?.maps[mid];
      if (!doc) throw new Error("맵을 찾지 못했어요.");
      const brief = (await getFirestore().doc(`jamworldWorlds/${worldId}`).get()).data()?.brief ?? null;
      const text = withAssetScope({ ...(await library()), ...(doc.assets ?? {}) }, () => mapContext(doc));
      return json(`# ${meta.name} (rev ${meta.rev})\nmaps: ${meta.mapIds.join(", ")}\n${JSON.stringify(links(worldId, mid))}\n설계서: ${brief ? JSON.stringify(brief) : "(아직 없음 — moa_submit_brief)"}\n\n${text}`);
    } catch (e) { return fail(e); }
  });

  s.registerTool("moa_get_catalog", {
    title: "에셋 찾기",
    description: "맵에 놓을 수 있는 에셋 id 목록(기본 에셋 + 학생·교사가 만든 공개 에셋 'u:…'). query 로 이름·태그 검색, category 로 거르기.",
    inputSchema: { query: z.string().optional(), category: z.enum(["terrain", "nature", "building", "furniture", "interactive", "decor", "character"]).optional(), limit: z.number().int().min(1).max(300).optional() },
    annotations: RO,
  }, async ({ query, category, limit = 120 }) => {
    try {
      const lib = await library();
      const rows = withAssetScope(lib, () => [...CATALOG, ...scopedUserAssets()]).filter(a =>
        (!category || a.category === category) && (!query || `${a.name} ${a.tags.join(" ")} ${a.id}`.toLowerCase().includes(query.toLowerCase())));
      return json({ total: rows.length, assets: rows.slice(0, limit).map(a => ({ id: a.id, name: a.name, kind: a.kind, category: a.category, footprint: a.footprint, blocking: a.blocking, height: a.height, tags: a.tags })) });
    } catch (e) { return fail(e); }
  });

  s.registerTool("moa_create_world", {
    title: "빈 월드 만들기", description: "빈 도화지 스페이스(맵 한 장)를 만들어요. 기본 40×30, 최대 120×120. 만든 뒤 moa_submit_brief 로 설계서를 내세요.",
    inputSchema: { name: z.string().min(1).max(60), description: z.string().max(300).optional(), width: z.number().int().min(10).max(120).optional(), height: z.number().int().min(10).max(120).optional() },
    annotations: WRITE,
  }, async ({ name, description, width = 40, height = 30 }) => {
    try {
      const pid = newId("prj"), mid = newId("map");
      const doc = createMap(mid, "1 맵", width, height);
      const meta = await saveWorld(owner(ctx), pid, { name, description: description ?? "AI 와 함께 만든 월드", mapIds: [mid], maps: { [mid]: doc }, by: "AI(MCP)" });
      return json({ worldId: pid, mapId: mid, rev: meta.rev, ...links(pid, mid), next: "사용자와 설계 대화를 마치고 moa_submit_brief 를 부르세요." });
    } catch (e) { return fail(e); }
  });

  s.registerTool("moa_submit_brief", {
    title: "설계서 내기", description: `사용자와 대화로 정한 설계를 저장해요. 모든 항목(${Object.keys(BRIEF_FIELDS).join(", ")})이 있어야 하고, 아직 모르는 건 openQuestions 에 넣으세요(남아 있으면 쓰기 도구가 막혀요). 바뀌면 다시 내면 돼요.`,
    inputSchema: { worldId: z.string(), brief: z.object({ ...Object.fromEntries(Object.keys(BRIEF_FIELDS).map(k => [k, z.string().max(1500).optional()])), openQuestions: z.array(z.string().max(300)).max(10).optional() }) },
    annotations: { ...WRITE, idempotentHint: true },
  }, async ({ worldId, brief }) => {
    try {
      if (!(await getWorldMeta(owner(ctx), worldId))) throw new Error("스페이스를 찾지 못했어요.");
      const b = brief as Brief;
      const missing = Object.keys(BRIEF_FIELDS).filter(k => !String(b[k as keyof typeof BRIEF_FIELDS] ?? "").trim());
      if (missing.length) return json({ saved: false, missing: missing.map(k => `${k}: ${BRIEF_FIELDS[k as keyof typeof BRIEF_FIELDS]}`), next: "빠진 항목을 사용자에게 물어본 뒤 다시 내세요." });
      await getFirestore().doc(`jamworldWorlds/${worldId}`).set({ brief: { ...b, at: Date.now() } }, { merge: true });
      return json({ saved: true, openQuestions: b.openQuestions ?? [], next: b.openQuestions?.length ? "남은 질문을 사용자에게 물어보세요." : "moa_get_catalog 로 에셋을 찾고, 없는 그림은 moa_upload_asset, 그다음 moa_apply_ops·moa_set_script 로 만드세요." });
    } catch (e) { return fail(e); }
  });

  s.registerTool("moa_apply_ops", {
    title: "맵 고치기",
    description: "맵에 작업 목록(ops)을 적용해 저장해요(형식은 moa_guide topic=map). 하나라도 틀리면 아무것도 바뀌지 않고 이유를 돌려줘요. 저장 전 상태는 버전으로 남아 moa_revert 로 되돌릴 수 있어요. 설계서가 먼저 있어야 해요.",
    inputSchema: { worldId: z.string(), mapId: z.string(), ops: z.array(z.record(z.string(), z.unknown())).min(1).max(600), note: z.string().max(120).describe("무엇을 바꿨는지 한 줄") },
    annotations: WRITE,
  }, async ({ worldId, mapId, ops, note }) => {
    try {
      await requireBrief(ctx, worldId);
      const w = await getWorld(owner(ctx), worldId, [mapId]);
      const doc = w?.maps[mapId];
      if (!w || !doc) throw new Error("맵을 찾지 못했어요.");
      const r = applyOps(doc, ops, { maxOps: 600, extraAssets: await library() });
      if (!r.ok) return json({ applied: false, errors: r.errors.slice(0, 12).map(e => e.message), hint: "고친 ops 로 다시 부르세요(맵은 그대로예요)." });
      const meta = await saveWorld(owner(ctx), worldId, { maps: { [mapId]: r.doc }, baseRev: w.project.rev, force: true, version: `AI 작업 전: ${note}`, by: "AI(MCP)" });
      return json({ applied: true, rev: meta.rev, summary: r.summary, warnings: r.warnings.slice(0, 12).map(e => e.message), ...links(worldId, mapId), next: "사용자에게 playUrl 로 플레이해 보라고 하고 느낌을 물어 다듬으세요. 편집기를 열어 둔 상태면 창으로 돌아올 때 새로 불러와요." });
    } catch (e) { return fail(e); }
  });

  s.registerTool("moa_set_script", {
    title: "맵 코드(동작·상호작용) 쓰기",
    description: "맵의 JavaScript(World API)를 통째로 바꿔요 — 없던 놀이·상호작용·피드백을 코드로 구현. 최대 8000자. 기존 코드를 고칠 땐 moa_get_world 로 읽은 뒤 전체를 다시 주세요. 문법을 검사하고, 저장 전 상태는 버전으로 남겨요.",
    inputSchema: { worldId: z.string(), mapId: z.string(), source: z.string().max(8000), note: z.string().max(120) },
    annotations: WRITE,
  }, async ({ worldId, mapId, source, note }) => {
    try {
      await requireBrief(ctx, worldId);
      const err = scriptSyntaxError(source);
      if (err) return json({ applied: false, errors: [err] });
      const w = await getWorld(owner(ctx), worldId, [mapId]);
      const doc = w?.maps[mapId];
      if (!w || !doc) throw new Error("맵을 찾지 못했어요.");
      const r = applyOps(doc, [{ op: "setScript", source }], { extraAssets: await library() });
      if (!r.ok) return json({ applied: false, errors: r.errors.map(e => e.message) });
      const meta = await saveWorld(owner(ctx), worldId, { maps: { [mapId]: r.doc }, baseRev: w.project.rev, force: true, version: `AI 코드 전: ${note}`, by: "AI(MCP)" });
      return json({ applied: true, rev: meta.rev, ...links(worldId, mapId), next: "편집기 '검사' 탭이나 플레이로 실제 동작을 확인해 달라고 하세요. 오류 문구를 알려 주면 고칠 수 있어요." });
    } catch (e) { return fail(e); }
  });

  s.registerTool("moa_add_map", {
    title: "맵 추가", description: "스페이스에 새 맵(페이지)을 더해요. 포털로 맵끼리 이을 수 있어요.",
    inputSchema: { worldId: z.string(), name: z.string().min(1).max(40), width: z.number().int().min(10).max(120).optional(), height: z.number().int().min(10).max(120).optional() },
    annotations: WRITE,
  }, async ({ worldId, name, width = 40, height = 30 }) => {
    try {
      await requireBrief(ctx, worldId);
      const meta = await getWorldMeta(owner(ctx), worldId);
      if (!meta) throw new Error("스페이스를 찾지 못했어요.");
      const mid = newId("map");
      const next = await saveWorld(owner(ctx), worldId, { mapIds: [...meta.mapIds, mid], maps: { [mid]: createMap(mid, name, width, height) }, baseRev: meta.rev, force: true, by: "AI(MCP)" });
      return json({ mapId: mid, rev: next.rev, ...links(worldId, mid) });
    } catch (e) { return fail(e); }
  });

  s.registerTool("moa_list_versions", { title: "버전 목록", description: "AI 쓰기·덮어쓰기 전에 남긴 최근 10개 버전.", inputSchema: { worldId: z.string() }, annotations: RO },
    async ({ worldId }) => { try { return json(await listVersions(owner(ctx), worldId)); } catch (e) { return fail(e); } });

  s.registerTool("moa_revert", {
    title: "버전으로 되돌리기", description: "스페이스 전체를 고른 버전으로 되돌려요(지금 상태도 버전으로 남아요).",
    inputSchema: { worldId: z.string(), versionId: z.string() }, annotations: { ...WRITE, destructiveHint: true },
  }, async ({ worldId, versionId }) => {
    try { const m = await revertWorld(owner(ctx), worldId, versionId, "AI(MCP)"); return json({ reverted: true, rev: m.rev, ...links(worldId) }); } catch (e) { return fail(e); }
  });

  s.registerTool("moa_asset_recipe", {
    title: "에셋 그리기 레시피",
    description: "새 에셋을 그리기 전에 꼭 부르세요. 모아 월드 앱이 이미지 모델에 보내는 것과 똑같은 프롬프트와 순서를 줘요(물체: td → iso, 바닥: texture, 인물: 걷기 시트 sheetTd → sheetIso). 각 단계를 이미지 생성 도구로 프롬프트 그대로 그리고, 원본 파일을 손대지 말고 moa_upload_asset 으로 넘기세요.",
    inputSchema: {
      name: z.string().min(1).max(30), description: z.string().max(300).describe("모습 설명(색·옷·특징). 사용자 말을 살려 구체적으로"),
      kind: z.enum(["object", "tile", "character"]),
      category: z.enum(["terrain", "nature", "building", "furniture", "interactive", "decor", "character"]).optional(),
      footprint: z.object({ w: z.number().int().min(1).max(6), d: z.number().int().min(1).max(6) }).optional(),
      height: z.number().min(0).max(5).optional(),
    },
    annotations: RO,
  }, async (a) => {
    const category = a.kind === "tile" ? "terrain" : a.kind === "character" ? "character" : (a.category && a.category !== "terrain" && a.category !== "character" ? a.category : "decor");
    const steps = assetRecipe({ name: a.name, description: a.description, category, footprint: a.footprint ?? { w: 1, d: 1 }, height: a.height ?? 1 });
    return json({
      steps,
      rules: [
        "각 단계를 이미지 생성 도구로 그리세요(코드·SVG·Python 그림 금지). prompt 는 한 글자도 줄이지 말고 그대로 쓰세요.",
        "background 가 transparent 면 투명 배경으로 생성하세요(안 되면 흰 단색 배경도 서버가 지워요).",
        "reference 가 있는 단계는 앞 단계 그림을 참고 이미지로 붙여 같은 대상으로 그리세요.",
        "생성된 원본 파일을 자르거나 크기를 바꾸거나 합치지 마세요. 서버가 앱과 똑같이 다듬어요.",
        a.kind === "character"
          ? "두 시트를 moa_upload_asset 의 sheetTd·sheetIso 에 함께 넘기세요(td·iso 대표 그림은 시트에서 자동). 행 방향이 rows 와 다르게 그려졌으면 sheetRows 로 실제 순서를 알려 주세요(예: td ['s','n','w','e'])."
          : a.kind === "tile" ? "texture 에 넘기세요." : "td·iso 에 함께 넘기세요.",
        "올린 뒤 preview 주소를 사용자에게 보여 주고 확인받으세요.",
      ],
      upload: { tool: "moa_upload_asset", name: a.name, kind: a.kind, category, ...(a.footprint ? { footprint: a.footprint } : {}), ...(a.height !== undefined ? { height: a.height } : {}) },
    });
  });

  s.registerTool("moa_upload_asset", {
    title: "에셋 올리기",
    description: "moa_asset_recipe 대로 이미지 생성 도구가 그린 원본 그림 파일을 그대로 넘기면, 앱과 같은 후처리(배경 지우기·걷기 시트 자르기·발 맞춤·좌우 방향 만들기)를 해서 모아 월드 에셋으로 넣어요(서버 이미지 생성 비용 없음). 물체는 td+iso, 바닥은 texture, 인물은 걷기 시트 sheetTd+sheetIso(움직이는 캐릭터). 미리 자르거나 크기를 바꾸지 마세요. SVG·코드 그림은 거절돼요. 결과의 preview 를 사용자에게 보여 주세요. 'u:…' id 로 moa_apply_ops 에 놓을 수 있어요.",
    inputSchema: {
      name: z.string().min(1).max(30), kind: z.enum(["object", "tile", "character"]),
      category: z.enum(["terrain", "nature", "building", "furniture", "interactive", "decor", "character"]),
      tags: z.array(z.string().min(1).max(12)).min(1).max(8),
      footprint: z.object({ w: z.number().int().min(1).max(6), d: z.number().int().min(1).max(6) }).optional(),
      height: z.number().min(0).max(5).optional(), passable: z.boolean().optional(),
      td: ImageInput.optional(), iso: ImageInput.optional(), texture: ImageInput.optional(),
      sheetTd: ImageInput.optional(), sheetIso: ImageInput.optional(),
      sheetRows: z.object({ td: z.array(z.enum(["s", "w", "n", "e"])).optional(), iso: z.array(z.enum(["s", "sw", "w", "nw", "n", "ne", "e", "se"])).optional() }).optional()
        .describe("걷기 시트의 실제 행 방향(위→아래). 레시피대로 그렸으면 비워 두세요. s=앞(정면) n=뒤 e=화면 오른쪽 w=화면 왼쪽"),
    },
    annotations: WRITE,
    // ChatGPT: 대화의 그림 파일(만든 것·올린 것)을 이 칸들로 넘길 수 있게
    _meta: { "openai/fileParams": ["td", "iso", "texture", "sheetTd", "sheetIso"] },
  }, async (a) => {
    try {
      const spec = cleanSpec(a);
      const [td, iso, texture, sheetTd, sheetIso] = await Promise.all([a.td, a.iso, a.texture, a.sheetTd, a.sheetIso].map(readImage));
      const r = await createUploadedAsset(ctx.uid, spec, { td, iso, texture, sheetTd, sheetIso }, "mcp-upload", a.sheetRows);
      return json({ ...r, next: `preview 주소의 그림을 사용자에게 보여 주세요. ${a.kind === "character" && !r.animated ? "걷기 시트가 없어 정지 그림으로 움직여요 — 걸어 다니게 하려면 moa_asset_recipe 의 시트 2장을 그려 다시 올리세요. " : ""}moa_apply_ops 의 place{assetId,x,y} 로 놓으세요(바닥은 paint{tileId}).` });
    } catch (e) { return fail(e); }
  });

  s.registerTool("moa_start_upload", {
    title: "업로드 링크 만들기",
    description: "그림 파일을 moa_upload_asset 으로 넘길 수 없을 때만 쓰세요(예: 이미지를 그릴 수 없는 AI). ChatGPT 가 그린 그림은 moa_upload_asset 의 파일 칸으로 바로 넘기세요. 에셋 정보(이름·종류·크기)를 정해 링크를 만들면, 사용자가 그 페이지에 그림 파일을 끌어다 놓아 올려요(2시간 유효, 로그인 불필요, 한 번만). 사용자에게 링크를 주고, 올렸다고 하면 moa_check_upload 로 에셋 id 를 받으세요.",
    inputSchema: {
      name: z.string().min(1).max(30), kind: z.enum(["object", "tile", "character"]),
      category: z.enum(["terrain", "nature", "building", "furniture", "interactive", "decor", "character"]),
      tags: z.array(z.string().min(1).max(12)).min(1).max(8),
      footprint: z.object({ w: z.number().int().min(1).max(6), d: z.number().int().min(1).max(6) }).optional(),
      height: z.number().min(0).max(5).optional(), passable: z.boolean().optional(),
    },
    annotations: WRITE,
  }, async (a) => {
    try {
      const token = await startUpload(ctx.uid, cleanSpec(a));
      return json({ uploadId: token, uploadUrl: `${BASE}/moa-upload/?t=${token}`, expiresInMinutes: 120, next: "사용자에게 uploadUrl 을 열어 그림 파일(PNG/WebP, 이미지 생성 모델이 그린 것)을 올려 달라고 하세요. 올렸다고 하면 moa_check_upload 를 부르세요." });
    } catch (e) { return fail(e); }
  });

  s.registerTool("moa_check_upload", {
    title: "업로드 확인", description: "업로드 링크로 그림을 올렸는지 확인하고, 올렸으면 에셋 id('u:…')를 줘요.",
    inputSchema: { uploadId: z.string() }, annotations: RO,
  }, async ({ uploadId }) => {
    try {
      if (!TOKEN_RE.test(uploadId)) throw new Error("업로드 id 가 올바르지 않아요.");
      const d = (await getFirestore().doc(`jamworldUploads/${uploadId}`).get()).data();
      if (!d || d.uid !== ctx.uid) throw new Error("업로드를 찾지 못했어요.");
      if (d.status === "done") return json({ done: true, assetId: d.assetId, name: d.spec?.name, next: "moa_apply_ops 의 place{assetId,x,y} 로 놓으세요." });
      return json({ done: false, expired: Date.now() > d.expiresAt, next: Date.now() > d.expiresAt ? "링크가 만료됐어요. moa_start_upload 로 새로 만드세요." : "아직 안 올렸어요. 사용자에게 링크에서 올려 달라고 하세요." });
    } catch (e) { return fail(e); }
  });
}
