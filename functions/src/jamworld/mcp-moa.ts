/**
 * 모아 월드 MCP 도구 — ChatGPT·Claude 가 선생님 계정으로 모아 월드 스페이스를 읽고 만들고 고친다.
 *
 * 흐름(grill-me): moa_guide 로 엔진·스타일을 읽고 → 사용자와 충분히 묻고 답한 뒤 moa_submit_brief 로 설계서를 낸다
 *   → 설계서가 완성된 스페이스에만 moa_apply_ops / moa_set_script 로 쓴다. 쓰기마다 이전 상태를 버전으로 남긴다(moa_revert).
 * 에셋: AI 가 만든 그림(이미지 주소·SVG·작은 이미지)을 moa_upload_asset 으로 올리면 서버가 모아 월드 규격으로 다듬어
 *   '에셋 모음'에 넣는다. 서버 이미지 생성(유료)은 쓰지 않는다.
 * 비용: 맵은 스페이스 문서·맵 문서만 읽고 쓴다. 카탈로그는 인스턴스 메모(publishedAssets).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import sharp from "sharp";
import { applyOps } from "./lib/world/ops";
import { createMap } from "./lib/world/map";
import { CATALOG, scopedUserAssets, withAssetScope } from "./lib/world/catalog";
import { embeddedFromLibrary } from "./lib/world/user-assets";
import { mapContext, SYSTEM_PROMPT } from "./lib/agent/prompt";
import { bustCatalog, publishedAssets } from "./lib/server/workshop/catalog";
import { scriptSyntaxError } from "./lib/server/map-script";
import { getWorld, getWorldMeta, listVersions, listWorlds, revertWorld, saveWorld } from "./lib/server/worlds";
import type { EmbeddedAsset } from "./lib/world/types";
import type { LibraryManifest } from "./lib/server/workshop/types";

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
  base64: z.string().max(1_500_000).optional().describe("PNG/WebP base64(약 1MB 이하)"),
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
async function readImage(src: z.infer<typeof ImageInput>, minSide = 384): Promise<Buffer> {
  const buf = src.base64 ? Buffer.from(src.base64.replace(/^data:[^,]+,/, ""), "base64")
    : src.download_url ? await fetchImage(src.download_url)
    : src.url ? await fetchImage(src.url)
    : null;
  if (!buf) throw new Error("그림 파일(download_url·url·base64 중 하나)을 주세요.");
  const m = await sharp(buf).metadata().catch(() => null);
  if (!m || m.format === "svg") throw new Error("SVG·코드로 그린 그림은 받지 않아요. 이미지 생성 모델(예: ChatGPT 이미지 만들기)로 그린 PNG/WebP 를 주세요.");
  if ((m.width ?? 0) < minSide || (m.height ?? 0) < minSide) throw new Error(`그림이 너무 작아요(${minSide}px 이상). 이미지 생성 모델이 그린 원본 크기 그대로 주세요.`);
  return buf;
}
/** 물체 그림: 투명 여백을 자르고 512px 정사각 안에 바닥 가운데 맞춤(모아 월드 생성 그림과 같은 구도) */
async function objectSprite(buf: Buffer) {
  const trimmed = await sharp(buf).ensureAlpha().trim({ threshold: 2 }).png().toBuffer().catch(() => sharp(buf).ensureAlpha().png().toBuffer());
  const fit = await sharp(trimmed).resize({ width: 460, height: 460, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
  const left = Math.round((512 - fit.info.width) / 2), top = 512 - 26 - fit.info.height;
  return sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fit.data, left, top: Math.max(0, top) }]).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
}
const texture = (buf: Buffer) => sharp(buf).resize(256, 256, { fit: "cover" }).webp({ quality: 88 }).toBuffer();
async function sheet(buf: Buffer, view: "td" | "iso") {
  const m = await sharp(buf).metadata(), rows = view === "td" ? 4 : 8;
  if (m.height !== rows * 160 || (m.width !== 640 && m.width !== 512)) throw new Error(`${view} 걷기 시트는 ${640}×${rows * 160}px(5열×${rows}행, 칸 128×160)이어야 해요.`);
  return { data: await sharp(buf).webp({ lossless: true }).toBuffer(), columns: (m.width === 640 ? 5 : 4) as 4 | 5 };
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
    const assets = `# 에셋 규격·스타일(moa_upload_asset) — 반드시 지키세요
## 그림은 이미지 생성 모델로
- SVG·코드로 그린 그림은 받지 않아요(아이콘처럼 납작해져 모아 월드와 안 맞음). 이미지 생성 모델(ChatGPT 이미지 만들기 등)로 그린 PNG를 주세요.
- 이미지를 직접 그릴 수 없는 AI(예: Claude)는 사용자에게 아래 프롬프트로 이미지 생성 도구에서 그림을 만들어 달라고 하고, 받은 파일·주소로 올리세요.
## 모아 월드 스타일(기준)
- 브롤스타즈 같은 2.5D 카툰: 머리가 크고 몸이 짧은 통통한 비율, 비비드하고 채도 높은 색, 두꺼운 어두운 외곽선, 부드러운 셀 셰이딩과 하이라이트, 입체감 있는 덩어리.
- 시점: 위에서 약 35~45° 내려다본 쿼터뷰(iso). td 는 더 위에서 본 탑다운.
- 배경 완전 투명, 그림자·바닥·글자·테두리 없음, 대상 하나만 화면 가운데 꽉 차게(전신·전체가 다 보이게), 1024px 정사각.
- 기준 그림(이 느낌·두께·색감에 맞추세요. 열어 보고 비교하세요):
${refs}
## 생성 프롬프트 틀(영어가 더 잘 맞아요)
"A single [대상], 2.5D isometric game asset in the style of Brawl Stars / Supercell, chunky cute proportions, vivid saturated colors, thick dark outline, soft cel shading with glossy highlights, full body centered, 3/4 top-down view at 40 degrees, transparent background, no ground shadow, no text, 1024x1024"
## 종류별
- 물체(object): iso 한 장(필수에 가깝게) + 가능하면 td(위에서 본 것). 하나만 주면 둘 다에 써요. 서버가 여백을 자르고 512px 정사각, 바닥 가운데로 맞춰요.
- 바닥(tile): 이음매 없는 정사각 텍스처(위에서 본 평면, 같은 스타일 색감) — 256px로 맞춤.
- 인물(character): iso 전신 + td. 걷기 시트(sheetTd/sheetIso)는 칸 128×160, 5열(0=서 있기, 1~4=걷기), 행=방향 — td 4행[s,w,n,e] 640×640, iso 8행[s,sw,w,nw,n,ne,e,se] 640×1280. 시트가 없으면 정지 그림으로 움직여요.
- 크기: footprint 1~6칸(건물·경기장은 4~6), height 0.2~5, 막히는 물체 passable=false.
- 올리기 전에 사용자에게 그림을 보여 주고 확인받으세요. 올리면 '에셋 모음'에 공개되고 id 는 'u:…' 입니다. 있는 에셋은 moa_get_catalog 로 찾아 재사용하세요.`;
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

  s.registerTool("moa_upload_asset", {
    title: "에셋 올리기",
    description: "이미지 생성 모델이 그린 그림을 모아 월드 에셋으로 넣어요(서버 이미지 생성 비용 없음). 먼저 moa_guide topic=assets 의 스타일·기준 그림·프롬프트를 지키세요. SVG·코드 그림은 거절돼요. 물체는 iso(+td), 바닥은 texture, 인물은 iso/td + 선택 걷기 시트(sheetTd/sheetIso). 올린 에셋은 '에셋 모음'에 공개되고 'u:…' id 로 moa_apply_ops 에 쓸 수 있어요.",
    inputSchema: {
      name: z.string().min(1).max(30), kind: z.enum(["object", "tile", "character"]),
      category: z.enum(["terrain", "nature", "building", "furniture", "interactive", "decor", "character"]),
      tags: z.array(z.string().min(1).max(12)).min(1).max(8),
      footprint: z.object({ w: z.number().int().min(1).max(6), d: z.number().int().min(1).max(6) }).optional(),
      height: z.number().min(0).max(5).optional(), passable: z.boolean().optional(),
      td: ImageInput.optional(), iso: ImageInput.optional(), texture: ImageInput.optional(),
      sheetTd: ImageInput.optional(), sheetIso: ImageInput.optional(),
    },
    annotations: WRITE,
    // ChatGPT: 대화의 그림 파일(만든 것·올린 것)을 이 칸들로 넘길 수 있게
    _meta: { "openai/fileParams": ["td", "iso", "texture", "sheetTd", "sheetIso"] },
  }, async (a) => {
    try {
      const id = `ast_${randomBytes(8).toString("base64url")}`, gen = `gen_${randomBytes(8).toString("base64url")}`;
      const dir = `cls/_moa_${ctx.uid}/gen/${gen}`, bucket = getStorage().bucket();
      const put = (name: string, data: Buffer) => bucket.file(`jamworld/${dir}/${name}`).save(data, { contentType: "image/webp", resumable: false }).then(() => `${dir}/${name}`);
      let appearance: LibraryManifest["appearance"];
      if (a.kind === "tile") {
        if (!a.texture && !a.td) throw new Error("바닥은 texture 그림이 필요해요.");
        appearance = { kind: "texture", texture: await put("texture.webp", await texture(await readImage((a.texture ?? a.td)!, 256))) };
      } else {
        const tdSrc = a.td ?? a.iso, isoSrc = a.iso ?? a.td;
        if (!tdSrc || !isoSrc) throw new Error("td 나 iso 그림 중 하나는 있어야 해요.");
        const td = await put("td.webp", await objectSprite(await readImage(tdSrc)));
        const iso = tdSrc === isoSrc ? td : await put("iso.webp", await objectSprite(await readImage(isoSrc)));
        let sprites: Extract<LibraryManifest["appearance"], { kind: "views" }>["sprites"];
        if (a.kind === "character" && a.sheetTd && a.sheetIso) {
          const st = await sheet(await readImage(a.sheetTd, 512), "td"), si = await sheet(await readImage(a.sheetIso, 512), "iso");
          sprites = {
            td: { image: await put("sheet-td.webp", st.data), columns: st.columns, rows: 4, frameWidth: 128, frameHeight: 160, directions: ["s", "w", "n", "e"] },
            iso: { image: await put("sheet-iso.webp", si.data), columns: si.columns, rows: 8, frameWidth: 128, frameHeight: 160, directions: ["s", "sw", "w", "nw", "n", "ne", "e", "se"] },
          };
        }
        appearance = { kind: "views", td, iso, ...(sprites ? { sprites } : {}) };
      }
      const tile = a.kind === "tile", person = a.kind === "character";
      const manifest: LibraryManifest = {
        schema: 1, id, name: a.name, category: tile ? "terrain" : person ? "character" : a.category, tags: a.tags, appearance,
        behavior: {
          footprint: tile || person ? { w: 1, d: 1 } : (a.footprint ?? { w: 1, d: 1 }),
          blocking: tile ? false : person ? false : !(a.passable ?? false),
          height: tile ? 0 : Math.max(0.2, a.height ?? 1),
          ...(person ? { character: appearance.kind === "views" && appearance.sprites ? "sprite" as const : "static" as const } : {}),
          actions: [],
        },
        provenance: { requestId: "", approvedVersion: 0, generationId: gen, model: "mcp-upload", createdBy: `teacher:${ctx.uid}` },
      };
      await getFirestore().collection("jamworldLibrary").doc(id).create({
        id, classId: `_moa_${ctx.uid}`, ownerStudentId: "", requestId: "", generationId: gen, manifest: JSON.stringify(manifest), shared: 1, createdAt: Date.now(), removedAt: null,
      });
      bustCatalog();
      return json({ assetId: `u:${id}`, name: a.name, footprint: manifest.behavior.footprint, next: "moa_apply_ops 의 place{assetId,x,y} 로 놓으세요(바닥은 paint{tileId}). 에셋 모음에 바로 보여요." });
    } catch (e) { return fail(e); }
  });
}
