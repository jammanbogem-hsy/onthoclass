import { handle, jsonBody, need } from "../../../lib/server/workshop/http";
import { actorFrom, noStore } from "../../../lib/server/workshop/runtime";
import { rateLimit } from "../../../lib/server/workshop/rate-limit";
import { requestView } from "../../../lib/server/workshop/view";

export async function POST(req: Request) {
  return handle(req, async ws => {
    const actor = need(await actorFrom(req, ws));
    const b = await jsonBody<{ classId?: string; draft?: unknown; key?: string }>(req, 8000);
    const id = actor.kind === "teacher" ? actor.teacher.id : actor.student.id;
    await rateLimit(`agent-assets:${id}`, 30, 60 * 60_000);
    const row = await ws.createAgentRequest(actor, String(b.classId || ""), b.draft, String(b.key || ""));
    return Response.json({ request: requestView(row, await ws.store.latestGeneration(row.id)) }, { headers: noStore });
  });
}
