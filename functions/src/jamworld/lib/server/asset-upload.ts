// 직접 만든 그림 → 모아 월드 에셋(서버 이미지 생성 없음). MCP 도구(moa_upload_asset)와 업로드 링크 페이지가 함께 쓴다.
// 그림은 이미지 생성 모델이 그린 래스터만 받는다 — SVG·코드 그림은 아이콘처럼 납작해 모아 월드 스타일과 맞지 않는다.
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { bustCatalog } from "./workshop/catalog";
import type { LibraryManifest } from "./workshop/types";

export type AssetKind = "object" | "tile" | "character";
export const CATEGORIES = ["terrain", "nature", "building", "furniture", "interactive", "decor", "character"] as const;
export interface AssetSpec {
  name: string; kind: AssetKind; category: (typeof CATEGORIES)[number]; tags: string[];
  footprint?: { w: number; d: number }; height?: number; passable?: boolean;
}
export type AssetImages = Partial<Record<"td" | "iso" | "texture" | "sheetTd" | "sheetIso", Buffer>>;

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
  if (buf.length > 8 * 1024 * 1024) throw new Error("그림이 너무 커요(8MB 이하).");
  const m = await sharp(buf).metadata().catch(() => null);
  if (!m || m.format === "svg" || !["png", "webp", "jpeg"].includes(String(m.format))) throw new Error("SVG·코드로 그린 그림은 받지 않아요. 이미지 생성 모델이 그린 PNG/WebP 를 주세요.");
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
  if (m.height !== rows * 160 || (m.width !== 640 && m.width !== 512)) throw new Error(`${view} 걷기 시트는 640×${rows * 160}px(5열×${rows}행, 칸 128×160)이어야 해요.`);
  return { data: await sharp(buf).webp({ lossless: true }).toBuffer(), columns: (m.width === 640 ? 5 : 4) as 4 | 5 };
}

/** 그림을 다듬어 저장하고 '에셋 모음'에 공개 에셋으로 넣는다 */
export async function createUploadedAsset(uid: string, spec: AssetSpec, img: AssetImages, via: "mcp-upload" | "link-upload") {
  const id = `ast_${randomBytes(8).toString("base64url")}`, gen = `gen_${randomBytes(8).toString("base64url")}`;
  const dir = `cls/_moa_${uid}/gen/${gen}`, bucket = getStorage().bucket();
  const put = (name: string, data: Buffer) => bucket.file(`jamworld/${dir}/${name}`).save(data, { contentType: "image/webp", resumable: false }).then(() => `${dir}/${name}`);
  let appearance: LibraryManifest["appearance"];
  if (spec.kind === "tile") {
    const src = img.texture ?? img.td ?? img.iso;
    if (!src) throw new Error("바닥은 texture 그림이 필요해요.");
    appearance = { kind: "texture", texture: await put("texture.webp", await texture(await checkImage(src, 256))) };
  } else {
    const tdSrc = img.td ?? img.iso, isoSrc = img.iso ?? img.td;
    if (!tdSrc || !isoSrc) throw new Error("iso(입체) 나 td(위에서) 그림 중 하나는 있어야 해요.");
    const td = await put("td.webp", await objectSprite(await checkImage(tdSrc)));
    const iso = tdSrc === isoSrc ? td : await put("iso.webp", await objectSprite(await checkImage(isoSrc)));
    let sprites: Extract<LibraryManifest["appearance"], { kind: "views" }>["sprites"];
    if (spec.kind === "character" && img.sheetTd && img.sheetIso) {
      const st = await sheet(await checkImage(img.sheetTd, 512), "td"), si = await sheet(await checkImage(img.sheetIso, 512), "iso");
      sprites = {
        td: { image: await put("sheet-td.webp", st.data), columns: st.columns, rows: 4, frameWidth: 128, frameHeight: 160, directions: ["s", "w", "n", "e"] },
        iso: { image: await put("sheet-iso.webp", si.data), columns: si.columns, rows: 8, frameWidth: 128, frameHeight: 160, directions: ["s", "sw", "w", "nw", "n", "ne", "e", "se"] },
      };
    }
    appearance = { kind: "views", td, iso, ...(sprites ? { sprites } : {}) };
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
  await getFirestore().collection("jamworldLibrary").doc(id).create({
    id, classId: `_moa_${uid}`, ownerStudentId: "", requestId: "", generationId: gen, manifest: JSON.stringify(manifest), shared: 1, createdAt: Date.now(), removedAt: null,
  });
  bustCatalog();
  return { assetId: `u:${id}`, name: spec.name, footprint: manifest.behavior.footprint };
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
