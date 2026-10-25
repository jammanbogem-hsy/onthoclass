import sharp from "sharp";
import { handle } from "../../../../../lib/server/workshop/http";
import { noStore } from "../../../../../lib/server/workshop/runtime";
import { activeManifest } from "../../../../../lib/server/workshop/catalog";
import { WorkshopError } from "../../../../../lib/server/workshop/service";
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(req, async (ws) => {
    const { id } = await ctx.params;
    const asset = activeManifest(await ws.store.getLibrary(id));
    if (!asset)
      throw new WorkshopError(
        "not_found",
        "삭제됐거나 찾을 수 없는 에셋이에요",
        404,
      );
    const view =
      new URL(req.url).searchParams.get("view") ||
      (asset.appearance.kind === "texture" ? "texture" : "td");
    const source =
      asset.appearance.kind === "texture"
        ? view === "texture"
          ? asset.appearance.texture
          : null
        : view === "td"
          ? asset.appearance.td
          : view === "iso"
            ? asset.appearance.iso
            : view === "td-sprite"
              ? asset.appearance.sprites?.td.image
              : view === "iso-sprite"
                ? asset.appearance.sprites?.iso.image
                : null;
    if (!source)
      throw new WorkshopError("view", "다운로드할 시점을 확인해 주세요");
    const cacheKey = `downloads/${id}/${view}.png`;
    let png = await ws.files.get(cacheKey);
    if (!png) {
      const file = await ws.files.get(source);
      if (!file)
        throw new WorkshopError("not_found", "그림 파일을 찾을 수 없어요", 404);
      const bytes = await sharp(file.bytes, { limitInputPixels: 16_777_216 })
        .png()
        .toBuffer();
      await ws.files.put(cacheKey, bytes, "image/png");
      png = { bytes, contentType: "image/png" };
    }
    return new Response(png.bytes as unknown as BodyInit, {
      headers: {
        ...noStore,
        "content-type": "image/png",
        "x-content-type-options": "nosniff",
        "content-disposition": `attachment; filename="${id}-${view}.png"; filename*=UTF-8''${encodeURIComponent(`${asset.name}-${view}.png`)}`,
      },
    });
  });
}
