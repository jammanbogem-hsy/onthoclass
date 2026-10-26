// 직접 만든 그림 → 모아 월드 에셋(서버 이미지 생성 없음). MCP 도구(moa_upload_asset)와 업로드 링크 페이지가 함께 쓴다.
// 그림은 이미지 생성 모델이 그린 래스터만 받는다 — SVG·코드 그림은 아이콘처럼 납작해 모아 월드 스타일과 맞지 않는다.
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { bustCatalog } from "./workshop/catalog";
import { prepareCharacterSheet } from "./workshop/character-images";
import type { LibraryManifest } from "./workshop/types";

export type AssetKind = "object" | "tile" | "character";
export const CATEGORIES = ["terrain", "nature", "building", "furniture", "interactive", "decor", "character"] as const;
export interface AssetSpec {
  name: string; kind: AssetKind; category: (typeof CATEGORIES)[number]; tags: string[];
  footprint?: { w: number; d: number }; height?: number; passable?: boolean;
}
export type AssetImages = Partial<Record<"td" | "iso" | "texture" | "sheetTd" | "sheetIso", Buffer>>;
/** 걷기 시트 원본의 행 방향(기본: 앱 순서 td s·e·n / iso s·se·e·ne·n) */
export type SheetRows = Partial<Record<"td" | "iso", string[]>>;

/** 스펙 검사(링크 페이지는 사람이 아니라 저장된 스펙을 쓰지만 같은 규칙으로) */
export function cleanSpec(raw: unknown): AssetSpec {
  const o = (raw ?? {}) as Record<string, unknown>;
  const name = String(o.name ?? "").trim().slice(0, 30);
  const kind = (["object", "tile", "character"] as const).find(k => k === o.kind);
  const category = CATEGORIES.find(c => c === o.category) ?? (kind === "tile" ? "terrain" : kind === "character" ? "character" : "decor");
  const tags = (Array.isArray(o.tags) ? o.tags : []).map(t => String(t).trim().slice(0, 12)).filter(Boolean).slice(0, 8);
  if (!name || !kind) throw new Error("이름과 종류(object·tile·character)를 정해 주세요.");
  const fp = o.footprint as { w?: unknown; d?: unknown } | undefined;
  const cell = (v: unknown) => Math.max(1, Math.min(6, Math.round(Number(v)) || 1));
  return {
    name, kind, category, tags: tags.length ? tags : [name.slice(0, 12)],
    ...(fp ? { footprint: { w: cell(fp.w), d: cell(fp.d) } } : {}),
    ...(o.height !== undefined ? { height: Math.max(0, Math.min(5, Number(o.height) || 1)) } : {}),
    ...(typeof o.passable === "boolean" ? { passable: o.passable } : {}),
  };
}

/** 래스터 그림인지·충분히 큰지 */
export async function checkImage(buf: Buffer, minSide = 384): Promise<Buffer> {
  if (buf.length > 12 * 1024 * 1024) throw new Error("그림이 너무 커요(12MB 이하).");
  const m = await sharp(buf).metadata().catch(() => null);
  if (!m || m.format === "svg" || !["png", "webp", "jpeg"].includes(String(m.format))) throw new Error("SVG·코드로 그린 그림은 받지 않아요. 이미지 생성 모델이 그린 PNG/WebP 를 주세요.");
  if ((m.width ?? 0) < minSide || (m.height ?? 0) < minSide) throw new Error(`그림이 너무 작아요(${minSide}px 이상). 이미지 생성 모델이 그린 원본 크기 그대로 주세요.`);
  return buf;
}

/**
 * 배경이 칠해진 그림(흰 배경·회색 체크무늬 등)이면 가장자리에서 이어진 배경색만 지워 투명하게 만든다.
 * 앱 생성은 처음부터 투명이지만, 채팅 AI 의 그림은 배경이 칠해져 오는 일이 많다. 이미 투명하면 그대로.
 */
export async function removeBackground(buf: Buffer): Promise<{ data: Buffer; removed: boolean }> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, border: number[] = [];
  for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x);
  for (let y = 1; y < H - 1; y++) border.push(y * W, y * W + W - 1);
  if (border.filter(i => data[i * 4 + 3] < 16).length > border.length * 0.5) return { data: buf, removed: false };
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (const i of border) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], k = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const o = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    o.n++; o.r += r; o.g += g; o.b += b; buckets.set(k, o);
  }
  const top = [...buckets.values()].sort((a, b) => b.n - a.n).filter(o => o.n >= border.length * 0.04).slice(0, 4);
  if (top.reduce((n, o) => n + o.n, 0) < border.length * 0.7) return { data: buf, removed: false }; // 배경이 고르지 않으면 건드리지 않는다
  const bg = top.map(o => [o.r / o.n, o.g / o.n, o.b / o.n]);
  const TOL = 26;
  const dist = (i: number) => Math.min(...bg.map(c => Math.max(Math.abs(data[i * 4] - c[0]), Math.abs(data[i * 4 + 1] - c[1]), Math.abs(data[i * 4 + 2] - c[2]))));
  const gone = new Uint8Array(W * H), queue = new Uint32Array(W * H);
  let head = 0, tail = 0;
  for (const i of border) if (!gone[i] && dist(i) <= TOL) { gone[i] = 1; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++], x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
      if (j < 0 || j >= W * H || gone[j] || dist(j) > TOL) continue;
      gone[j] = 1; queue[tail++] = j;
    }
  }
  for (let i = 0; i < W * H; i++) {
    if (gone[i]) { data[i * 4 + 3] = 0; continue; }
    // 배경과 맞닿은 가장자리는 배경색에 가까울수록 살짝 투명하게(흰 테두리 줄이기)
    const x = i % W, near = (x > 0 && gone[i - 1]) || (x < W - 1 && gone[i + 1]) || (i >= W && gone[i - W]) || (i + W < W * H && gone[i + W]);
    if (near) { const d = dist(i); if (d < TOL * 2.5) data[i * 4 + 3] = Math.min(data[i * 4 + 3], Math.round(255 * (d - TOL) / (TOL * 1.5))); }
  }
  return { data: await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer(), removed: true };
}

/** 물체 그림: 투명 여백을 자르고 512px 정사각 안에 바닥 가운데 맞춤(모아 월드 생성 그림과 같은 구도) */
async function objectSprite(raw: Buffer) {
  const buf = (await removeBackground(raw)).data;
  const trimmed = await sharp(buf).ensureAlpha().trim({ threshold: 2 }).png().toBuffer().catch(() => sharp(buf).ensureAlpha().png().toBuffer());
  const fit = await sharp(trimmed).resize({ width: 460, height: 460, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
  const left = Math.round((512 - fit.info.width) / 2), top = 512 - 26 - fit.info.height;
  return sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fit.data, left, top: Math.max(0, top) }]).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
}
const texture = (buf: Buffer) => sharp(buf).resize(256, 256, { fit: "cover" }).webp({ quality: 88 }).toBuffer();
/** 이미 게임 규격(칸 128×160)으로 맞춘 시트면 그대로, 아니면 이미지 생성 모델이 그린 원본 시트를 앱과 똑같이 다듬는다 */
async function sheet(buf: Buffer, view: "td" | "iso", key: string, rows?: string[]) {
  const m = await sharp(buf).metadata(), full = view === "td" ? 4 : 8;
  if (m.height === full * 160 && (m.width === 640 || m.width === 512)) {
    const data = await sharp(buf).png().toBuffer(), columns = (m.width === 640 ? 5 : 4) as 4 | 5;
    return { data, columns, preview: await sharp(data).extract({ left: 0, top: 0, width: 128, height: 160 }).webp({ lossless: true }).toBuffer(), sheet: null };
  }
  const clean = (await removeBackground(buf)).data;
  const r = await prepareCharacterSheet(clean, view, key, 5, "canonical", rows).catch((e: Error) => {
    throw new Error(`${view === "td" ? "위에서 본(sheetTd)" : "입체(sheetIso)"} 걷기 시트: ${e.message.replace(/^캐릭터 동작 그림을 확인해 주세요: /, "")}. moa_asset_recipe 의 프롬프트로 다시 그려(투명 배경·5열·행 순서 그대로) 원본 파일을 다시 올리거나, 그린 행 순서가 다르면 sheetRows 로 알려 주세요.`);
  });
  return { data: r.bytes, columns: 5 as const, preview: r.preview, sheet: r.sheet };
}

/** 그림을 다듬어 저장하고 '에셋 모음'에 공개 에셋으로 넣는다 */
export async function createUploadedAsset(uid: string, spec: AssetSpec, img: AssetImages, via: "mcp-upload" | "link-upload", sheetRows?: SheetRows, replaceId?: string) {
  const id = replaceId ?? `ast_${randomBytes(8).toString("base64url")}`, gen = `gen_${randomBytes(8).toString("base64url")}`;
  const dir = `cls/_moa_${uid}/gen/${gen}`, bucket = getStorage().bucket();
  const put = (name: string, data: Buffer, contentType = "image/webp") => bucket.file(`jamworld/${dir}/${name}`).save(data, { contentType, resumable: false }).then(() => `${dir}/${name}`);
  let appearance: LibraryManifest["appearance"];
  if (spec.kind === "tile") {
    const src = img.texture ?? img.td ?? img.iso;
    if (!src) throw new Error("바닥은 texture 그림이 필요해요.");
    appearance = { kind: "texture", texture: await put("texture.webp", await texture(await checkImage(src, 256))) };
  } else if (spec.kind === "character" && (img.sheetTd || img.sheetIso)) {
    // 앱 생성과 같은 결과물: 걷기 시트 2장 + 각 시트의 첫 칸(서 있기)을 대표 그림으로
    if (!img.sheetTd || !img.sheetIso) throw new Error("걷기 시트는 sheetTd(위에서)·sheetIso(입체) 두 장을 함께 주세요.");
    const st = await sheet(await checkImage(img.sheetTd, 512), "td", `${dir}/sheet-td.png`, sheetRows?.td);
    const si = await sheet(await checkImage(img.sheetIso, 512), "iso", `${dir}/sheet-iso.png`, sheetRows?.iso);
    const sprites = {
      td: { ...(st.sheet ?? { columns: st.columns, rows: 4 as const, frameWidth: 128 as const, frameHeight: 160 as const, directions: ["s", "w", "n", "e"] }), image: await put("sheet-td.png", st.data, "image/png") },
      iso: { ...(si.sheet ?? { columns: si.columns, rows: 8 as const, frameWidth: 128 as const, frameHeight: 160 as const, directions: ["s", "sw", "w", "nw", "n", "ne", "e", "se"] }), image: await put("sheet-iso.png", si.data, "image/png") },
    };
    appearance = { kind: "views", td: await put("td.webp", st.preview), iso: await put("iso.webp", si.preview), sprites };
  } else {
    const tdSrc = img.td ?? img.iso, isoSrc = img.iso ?? img.td;
    if (!tdSrc || !isoSrc) throw new Error("iso(입체) 나 td(위에서) 그림 중 하나는 있어야 해요.");
    const td = await put("td.webp", await objectSprite(await checkImage(tdSrc)));
    const iso = tdSrc === isoSrc ? td : await put("iso.webp", await objectSprite(await checkImage(isoSrc)));
    appearance = { kind: "views", td, iso };
  }
  const tile = spec.kind === "tile", person = spec.kind === "character";
  const manifest: LibraryManifest = {
    schema: 1, id, name: spec.name, category: tile ? "terrain" : person ? "character" : spec.category, tags: spec.tags, appearance,
    behavior: {
      footprint: tile || person ? { w: 1, d: 1 } : (spec.footprint ?? { w: 1, d: 1 }),
      blocking: tile ? false : person ? false : !(spec.passable ?? false),
      height: tile ? 0 : Math.max(0.2, spec.height ?? 1),
      ...(person ? { character: appearance.kind === "views" && appearance.sprites ? "sprite" as const : "static" as const } : {}),
      actions: [],
    },
    provenance: { requestId: "", approvedVersion: 0, generationId: gen, model: via, createdBy: `teacher:${uid}` },
  };
  const ref = getFirestore().collection("jamworldLibrary").doc(id);
  // 고치기는 같은 id 그대로(맵에 놓인 것도 새 그림으로 바뀐다). 옛 그림 파일은 열려 있는 화면을 위해 남겨 둔다
  if (replaceId) await ref.update({ generationId: gen, manifest: JSON.stringify(manifest), updatedAt: Date.now() });
  else await ref.create({
    id, classId: `_moa_${uid}`, ownerStudentId: "", requestId: "", generationId: gen, manifest: JSON.stringify(manifest), shared: 1, createdAt: Date.now(), removedAt: null,
  });
  bustCatalog();
  const file = (k: string) => `https://jammanboeng.web.app/api/jamworld/workshop/files/${k}`;
  const preview = appearance.kind === "texture" ? { texture: file(appearance.texture) }
    : { td: file(appearance.td), iso: file(appearance.iso), ...(appearance.sprites ? { sheetTd: file(appearance.sprites.td.image), sheetIso: file(appearance.sprites.iso.image) } : {}) };
  return { assetId: `u:${id}`, name: spec.name, footprint: manifest.behavior.footprint, animated: appearance.kind === "views" && !!appearance.sprites, preview };
}

/* ------------------------------------------------------------- 업로드 링크 */
// jamworldUploads/{token} = { uid, spec, createdAt, expiresAt, status: waiting|done, assetId? } — 링크를 가진 사람만(로그인 없이) 한 번 올린다.
export const UPLOAD_TTL = 2 * 60 * 60_000;
export const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
export async function startUpload(uid: string, spec: AssetSpec) {
  const token = randomBytes(24).toString("base64url");
  await getFirestore().doc(`jamworldUploads/${token}`).set({ uid, spec, createdAt: Date.now(), expiresAt: Date.now() + UPLOAD_TTL, status: "waiting" });
  return token;
}
