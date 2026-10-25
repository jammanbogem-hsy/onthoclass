import { handle, need } from "../../lib/server/workshop/http";
import { accessFrom, noStore } from "../../lib/server/workshop/runtime";
import { listWorlds } from "../../lib/server/worlds";

export const dynamic = "force-dynamic";

/** 스페이스 목록(메타만) — 학생·교사 각자 자기 것 */
export async function GET(req: Request) {
  return handle(req, async (ws) => {
    const owner = need(ownerOf(await accessFrom(req, ws)));
    return Response.json({ worlds: await listWorlds(owner) }, { headers: noStore });
  });
}

export function ownerOf(a: Awaited<ReturnType<typeof accessFrom>>): string | null {
  return a.kind === "teacher" ? `t:${a.teacher.id}` : a.kind === "student" ? `s:${a.student.id}` : null;
}
