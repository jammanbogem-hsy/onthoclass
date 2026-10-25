import { getFirestore } from "firebase-admin/firestore";
import { firebaseIdentity } from "./runtime";
import { fileUrl, libraryLike } from "./view";
import { WorkshopError } from "./service";
import type { LibraryRow, Store } from "./store";
import type { LibraryManifest } from "./types";
import type { AvatarLook } from "./avatar";
import { isCharacterSheet } from "./character-sprite";

export const ADMIN_EMAIL = "jammanbogem@gmail.com";
export async function catalogAdmin(req: Request) {
  const identity = await firebaseIdentity(req);
  return identity?.email?.toLowerCase() === ADMIN_EMAIL &&
    identity.email_verified === true
    ? identity
    : null;
}
export function activeManifest(row: LibraryRow | null): LibraryManifest | null {
  return row && !row.removedAt
    ? (JSON.parse(row.manifest) as LibraryManifest)
    : null;
}
/** Only saved, approved outputs become public world assets. Uploads/drafts remain private.
 *  편집기가 자주 부르므로 인스턴스에서 60초 기억한다(Firestore 읽기 절약). 바뀌면 bustCatalog(). */
let catalogMemo: { at: number; value: Promise<ReturnType<typeof libraryLike>[]> } | null = null;
export function bustCatalog() { catalogMemo = null; }
export function publishedAssets() {
  if (catalogMemo && Date.now() - catalogMemo.at < 60_000) return catalogMemo.value;
  const value = loadPublished();
  catalogMemo = { at: Date.now(), value };
  value.catch(() => { if (catalogMemo?.value === value) catalogMemo = null; });
  return value;
}
async function loadPublished() {
  const snap = await getFirestore().collection("jamworldLibrary").get();
  return snap.docs
    .map((doc) => doc.data() as LibraryRow)
    .filter((row) => !row.removedAt)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((row) => libraryLike(JSON.parse(row.manifest) as LibraryManifest));
}
export async function publishedFile(
  key: string,
): Promise<"public" | "removed" | "private"> {
  const generationId = /^cls\/[^/]+\/gen\/([^/]+)\//.exec(key)?.[1];
  if (!generationId) return "private";
  const rows = await getFirestore()
    .collection("jamworldLibrary")
    .where("generationId", "==", generationId)
    .get();
  for (const doc of rows.docs) {
    const row = doc.data() as LibraryRow,
      manifest = JSON.parse(row.manifest) as LibraryManifest;
    const files =
      manifest.appearance.kind === "texture"
        ? [manifest.appearance.texture]
        : [
            manifest.appearance.td,
            manifest.appearance.iso,
            ...Object.values(manifest.appearance.sprites ?? {}).map(
              (s) => s.image,
            ),
          ];
    if (files.includes(key)) return row.removedAt ? "removed" : "public";
  }
  return "private";
}
export async function resolveAvatar(
  raw: string | null | undefined,
  store: Store,
): Promise<AvatarLook | null> {
  if (!raw) return null;
  const look = JSON.parse(raw) as AvatarLook;
  if (!look.assetId) return look;
  const manifest = activeManifest(await store.getLibrary(look.assetId));
  if (
    !manifest ||
    manifest.category !== "character" ||
    manifest.appearance.kind !== "views"
  ) {
    delete look.assetId;
    delete look.asset;
    delete look.assetColors;
    return look;
  }
  const sprites = manifest.appearance.sprites;
  return {
    ...look,
    asset: {
      name: manifest.name,
      td: fileUrl(manifest.appearance.td)!,
      iso: fileUrl(manifest.appearance.iso)!,
      ...(sprites &&
      isCharacterSheet(sprites.td, "td") &&
      isCharacterSheet(sprites.iso, "iso")
        ? {
            sprites: {
              td: { ...sprites.td, image: fileUrl(sprites.td.image)! },
              iso: { ...sprites.iso, image: fileUrl(sprites.iso.image)! },
            },
          }
        : {}),
    },
  };
}
export async function removeAsset(req: Request, id: string) {
  const admin = await catalogAdmin(req);
  if (!admin)
    throw new WorkshopError(
      "forbidden",
      "관리자만 에셋을 삭제할 수 있어요",
      403,
    );
  if (!/^ast_[A-Za-z0-9_-]{1,64}$/.test(id))
    throw new WorkshopError("not_found", "에셋을 찾을 수 없어요", 404);
  const db = getFirestore(),
    ref = db.doc(`jamworldLibrary/${id}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists)
      throw new WorkshopError("not_found", "에셋을 찾을 수 없어요", 404);
    if (snap.data()?.removedAt) return;
    tx.update(ref, { removedAt: Date.now(), removedBy: admin.uid });
    tx.create(db.collection("jamworldModeration").doc(), {
      assetId: id,
      action: "remove",
      by: admin.uid,
      at: Date.now(),
    });
  });
}
