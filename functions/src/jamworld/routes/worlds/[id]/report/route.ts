import { FieldPath, getFirestore } from "firebase-admin/firestore";
import { handle, jsonBody, need } from "../../../../lib/server/workshop/http";
import { accessFrom, noStore } from "../../../../lib/server/workshop/runtime";
import { WorkshopError } from "../../../../lib/server/workshop/service";
import { getWorldMeta } from "../../../../lib/server/worlds";
import { ownerOf } from "../../route";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * 플레이 결과 보고 — 주인이 플레이할 때 맵 코드가 돌았는지·어디서 멈췄는지를 남겨, MCP 의 AI 가 moa_play_report 로 읽고 고친다.
 * 맵마다 최신 한 건만(클라이언트가 같은 코드·같은 결과는 한 번만 보냄).
 */
export async function POST(req: Request, ctx: Ctx) {
  return handle(req, async (ws) => {
    const owner = need(ownerOf(await accessFrom(req, ws)));
    const { id } = await ctx.params;
    const b = await jsonBody<{ mapId?: unknown; ok?: unknown; message?: unknown; hash?: unknown; hud?: unknown }>(req, 4000);
    const mapId = String(b.mapId ?? "");
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(mapId) || typeof b.ok !== "boolean") throw new WorkshopError("report", "보고 형식이 올바르지 않아요");
    const meta = await getWorldMeta(owner, id);
    if (!meta || !meta.mapIds.includes(mapId)) throw new WorkshopError("not_found", "스페이스를 찾지 못했어요", 404);
    const report = {
      ok: b.ok, at: Date.now(), rev: meta.rev,
      hash: String(b.hash ?? "").slice(0, 16),
      ...(typeof b.message === "string" && b.message ? { message: b.message.slice(0, 400) } : {}),
      ...(typeof b.hud === "string" && b.hud ? { hud: b.hud.slice(0, 600) } : {}),
    };
    await getFirestore().doc(`jamworldWorlds/${id}`).update(new FieldPath("playReports", mapId), report);
    return Response.json({ ok: true }, { headers: noStore });
  });
}
