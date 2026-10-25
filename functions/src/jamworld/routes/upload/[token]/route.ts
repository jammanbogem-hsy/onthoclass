import { getFirestore } from "firebase-admin/firestore";
import { handle } from "../../../lib/server/workshop/http";
import { noStore } from "../../../lib/server/workshop/runtime";
import { WorkshopError } from "../../../lib/server/workshop/service";
import { rateLimit } from "../../../lib/server/workshop/rate-limit";
import { cleanSpec, createUploadedAsset, TOKEN_RE, type AssetImages } from "../../../lib/server/asset-upload";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };

async function load(token: string) {
  if (!TOKEN_RE.test(token)) throw new WorkshopError("upload", "링크가 올바르지 않아요", 404);
  const ref = getFirestore().doc(`jamworldUploads/${token}`);
  const d = (await ref.get()).data();
  if (!d) throw new WorkshopError("upload", "링크를 찾지 못했어요", 404);
  return { ref, d };
}

/** 업로드 링크 정보(무엇을 올릴지) — 링크가 곧 권한(로그인 없음) */
export async function GET(req: Request, ctx: Ctx) {
  return handle(req, async () => {
    const { d } = await load((await ctx.params).token);
    return Response.json({ spec: d.spec, status: d.status, assetId: d.assetId ?? null, expired: Date.now() > d.expiresAt }, { headers: noStore });
  });
}

/** 그림 올리기(multipart) — 한 번만 */
export async function POST(req: Request, ctx: Ctx) {
  return handle(req, async () => {
    const token = (await ctx.params).token;
    await rateLimit(`upload:${token}`, 6, 10 * 60_000);
    const { ref, d } = await load(token);
    if (d.status === "done") throw new WorkshopError("upload", "이미 올렸어요", 409);
    if (Date.now() > d.expiresAt) throw new WorkshopError("upload", "링크가 만료됐어요. AI 에게 새 링크를 부탁하세요", 410);
    if (Number(req.headers.get("content-length") ?? 0) > 30 * 1024 * 1024) throw new WorkshopError("size", "파일이 너무 커요", 413);
    const form = await req.formData();
    const img: AssetImages = {};
    for (const key of ["td", "iso", "texture", "sheetTd", "sheetIso"] as const) {
      const f = form.get(key);
      if (f && typeof f !== "string" && f.size) img[key] = Buffer.from(await f.arrayBuffer());
    }
    // 동시에 두 번 올리지 않게 먼저 표시
    const claimed = await getFirestore().runTransaction(async tx => {
      const cur = (await tx.get(ref)).data();
      if (!cur || cur.status !== "waiting") return false;
      tx.update(ref, { status: "working" });
      return true;
    });
    if (!claimed) throw new WorkshopError("upload", "이미 올리는 중이에요", 409);
    try {
      const r = await createUploadedAsset(String(d.uid), cleanSpec(d.spec), img, "link-upload");
      await ref.update({ status: "done", assetId: r.assetId, doneAt: Date.now() });
      return Response.json(r, { headers: noStore });
    } catch (e) {
      await ref.update({ status: "waiting" });
      throw new WorkshopError("upload", e instanceof Error ? e.message : "올리지 못했어요", 400);
    }
  });
}
