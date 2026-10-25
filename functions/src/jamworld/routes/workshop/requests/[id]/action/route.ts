import {
  handle,
  jsonBody,
  need,
} from "../../../../../lib/server/workshop/http";
import {
  noStore,
  accessFrom,
  studentFrom,
  teacherFrom,
} from "../../../../../lib/server/workshop/runtime";
import { WorkshopError } from "../../../../../lib/server/workshop/service";
import { requestView } from "../../../../../lib/server/workshop/view";

export const dynamic = "force-dynamic";

const STUDENT_ACTIONS = new Set(["submit", "withdraw", "save", "discard"]);
const TEACHER_ACTIONS = new Set(["approve", "reject"]);

/** 상태 전이. 어떤 행동이 가능한지는 서버의 역할·소유권·현재 상태(CAS rev)로 판정 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(req, async (ws) => {
    const { id } = await ctx.params;
    const b = await jsonBody<{
      action?: string;
      rev?: number;
      reason?: string;
    }>(req);
    const action = String(b.action ?? "");
    const rev = Number(b.rev);
    if (action === "save") {
      const a = await accessFrom(req, ws);
      if (a.kind === "teacher") {
        const r = await ws.requestForTeacher(a.teacher, id);
        need(r.creatorRole === "teacher" && r.studentId === a.teacher.id ? r : null, "직접 요청한 에셋만 저장할 수 있어요", 403);
        const asset = await ws.save({ id: a.teacher.id }, id, rev);
        return Response.json({ request: requestView(await ws.requestForTeacher(a.teacher, id), await ws.store.latestGeneration(id)), assetId: asset.id }, { headers: noStore });
      }
    }
    if (STUDENT_ACTIONS.has(action)) {
      const s = need(await studentFrom(req, ws), "학생만 할 수 있어요", 403);
      let assetId: string | undefined;
      if (action === "submit") await ws.submit(s, id, rev);
      else if (action === "withdraw") await ws.withdraw(s, id, rev);
      else if (action === "save") assetId = (await ws.save(s, id, rev)).id;
      else await ws.discard(s, id, rev);
      const r = await ws.ownRequest(s, id);
      return Response.json(
        { request: requestView(r, await ws.store.latestGeneration(id)), ...(assetId ? { assetId } : {}) },
        { headers: noStore },
      );
    }
    if (TEACHER_ACTIONS.has(action)) {
      const t = need(await teacherFrom(req, ws), "교사만 할 수 있어요", 403);
      if (action === "approve") await ws.approve(t, id, rev);
      else await ws.reject(t, id, rev, String(b.reason ?? ""));
      const r = await ws.requestForTeacher(t, id);
      return Response.json(
        { request: requestView(r, await ws.store.latestGeneration(id)) },
        { headers: noStore },
      );
    }
    throw new WorkshopError("action", "알 수 없는 요청입니다");
  });
}
