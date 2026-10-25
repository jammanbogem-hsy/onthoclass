import {
  handle,
  need,
  jsonBody,
} from "../../../../../lib/server/workshop/http";
import {
  teacherFrom,
  noStore,
} from "../../../../../lib/server/workshop/runtime";
import { WorkshopError } from "../../../../../lib/server/workshop/service";
// Durable Firestore queue: execution survives closing the browser and Hosting's request timeout.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, async ws => {
    const teacher = need(await teacherFrom(req, ws), "교사만 생성 비용을 승인할 수 있어요", 403);
    return Response.json({ quote: await ws.generationQuote(teacher, (await ctx.params).id) }, { headers: noStore });
  });
}
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(req, async (ws) => {
    const teacher = need(
      await teacherFrom(req, ws),
      "교사만 생성할 수 있어요",
      403,
    );
    const { id } = await ctx.params;
    const body = await jsonBody<{ approveRev?: unknown; quoteId?: unknown }>(req);
    if (
      body.approveRev !== undefined &&
      (!Number.isSafeInteger(body.approveRev) || Number(body.approveRev) < 0)
    )
      throw new WorkshopError("approval", "승인할 요청 버전을 확인해 주세요");
    const idempotencyKey = req.headers.get("idempotency-key") ?? "";
    // An exact transport retry returns the already accepted job; it cannot create another charge.
    const owned = await ws.requestForTeacher(teacher, id);
    const existing = await ws.store.generationByKey(`${owned.id}:${idempotencyKey}`);
    if (existing) return Response.json({ generationId: existing.id, started: false, status: existing.status }, { status: 202, headers: noStore });
    const quote = await ws.generationQuote(teacher, id);
    if (typeof body.quoteId !== "string" || body.quoteId !== quote.id || quote.lowUsd === null)
      throw new WorkshopError("quote", "생성 전에 현재 예상 비용을 확인하고 승인해 주세요", 409);
    const result = await ws.startGeneration(
      teacher,
      id,
      idempotencyKey,
      body.approveRev === undefined
        ? undefined
        : { rev: Number(body.approveRev) },
      quote,
    );
    return Response.json(
      {
        generationId: result.generation.id,
        started: result.started,
        status: result.generation.status,
      },
      { status: 202, headers: noStore },
    );
  });
}
