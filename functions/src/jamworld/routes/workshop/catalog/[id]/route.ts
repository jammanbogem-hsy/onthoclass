import { handle } from "../../../../lib/server/workshop/http";
import { noStore } from "../../../../lib/server/workshop/runtime";
import { removeAsset } from "../../../../lib/server/workshop/catalog";
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, async () => { await removeAsset(req, (await ctx.params).id); return Response.json({ ok: true }, { headers: noStore }); });
}
