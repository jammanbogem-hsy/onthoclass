import { handle, jsonBody, need } from "../../../lib/server/workshop/http";
import { accessFrom, noStore } from "../../../lib/server/workshop/runtime";
import { WorkshopError } from "../../../lib/server/workshop/service";
import { deleteWorld, getWorld, getWorldMeta, saveWorld, type SaveInput } from "../../../lib/server/worlds";
import { serializeMap } from "../../../lib/world/io";
import { ownerOf } from "../route";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** ?meta=1 이면 메타만(1회 읽기), 아니면 맵까지 */
export async function GET(req: Request, ctx: Ctx) {
  return handle(req, async (ws) => {
    const owner = need(ownerOf(await accessFrom(req, ws)));
    const { id } = await ctx.params;
    if (new URL(req.url).searchParams.get("meta") === "1") {
      const project = await getWorldMeta(owner, id);
      return Response.json({ project }, { status: project ? 200 : 404, headers: noStore });
    }
    const w = await getWorld(owner, id);
    if (!w) return Response.json({ error: "스페이스를 찾지 못했어요" }, { status: 404, headers: noStore });
    return Response.json({ project: w.project, maps: Object.fromEntries(Object.entries(w.maps).map(([k, d]) => [k, serializeMap(d)])) }, { headers: noStore });
  });
}

/** 저장 — 바뀐 맵만 보낸다. baseRev 가 다르면 409 { rev } */
export async function PUT(req: Request, ctx: Ctx) {
  return handle(req, async (ws) => {
    const a = await accessFrom(req, ws);
    const owner = need(ownerOf(a));
    const { id } = await ctx.params;
    const body = await jsonBody<Omit<SaveInput, "by" | "version">>(req, 8 * 1024 * 1024);
    try {
      const project = await saveWorld(owner, id, { ...body, by: a.kind === "teacher" ? "교사(편집기)" : "학생(편집기)" });
      return Response.json({ project }, { headers: noStore });
    } catch (e) {
      if (e instanceof WorkshopError && e.status === 409) return Response.json({ error: e.message, code: "conflict", rev: (e as unknown as { rev: number }).rev }, { status: 409, headers: noStore });
      throw e;
    }
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return handle(req, async (ws) => {
    const owner = need(ownerOf(await accessFrom(req, ws)));
    const { id } = await ctx.params;
    await deleteWorld(owner, id);
    return Response.json({ ok: true }, { headers: noStore });
  });
}
