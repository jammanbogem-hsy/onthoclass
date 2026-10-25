import { handle, need } from "../../../../../lib/server/workshop/http";
import { noStore, teacherFrom } from "../../../../../lib/server/workshop/runtime";

export const dynamic = "force-dynamic";

/** 수업 끝 — 이 학급 학생을 모두 내보낸다(열린 화면은 다음 요청에서 로그인 화면으로) */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, async (ws) => {
    const t = need(await teacherFrom(req, ws), "교사 로그인이 필요해요");
    const { id } = await ctx.params;
    await ws.endClassSessions(t, id);
    return Response.json({ ok: true }, { headers: noStore });
  });
}
