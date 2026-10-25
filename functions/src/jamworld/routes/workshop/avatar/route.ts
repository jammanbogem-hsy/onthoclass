import { handle, jsonBody, need } from "../../../lib/server/workshop/http";
import { noStore, accessFrom } from "../../../lib/server/workshop/runtime";
import { resolveAvatar } from "../../../lib/server/workshop/catalog";

export const dynamic = "force-dynamic";

/** 인증된 학생·교사의 개인 기본 아바타. 저장된 인물만 서버에서 해석한다. */
export async function PUT(req: Request) {
  return handle(req, async (ws) => {
    const a = await accessFrom(req, ws);
    need(a.kind, "공방에 로그인한 뒤 아바타를 설정해 주세요");
    const b = await jsonBody<{ look?: unknown }>(req, 2048);
    const look = a.kind === "teacher"
      ? await ws.setTeacherAvatar(a.teacher, b.look)
      : await ws.setAvatar(need(a.kind === "student" ? a.student : null), b.look);
    return Response.json({ look: await resolveAvatar(JSON.stringify(look), ws.store) }, { headers: noStore });
  });
}
