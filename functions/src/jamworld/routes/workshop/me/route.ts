import { resolveAvatar } from "../../../lib/server/workshop/catalog";
import { getAuth } from "firebase-admin/auth";
import { accessFrom, workshopStatus, noStore, sessionCookie } from "../../../lib/server/workshop/runtime";
import { handle } from "../../../lib/server/workshop/http";
export async function GET(req: Request) {
  return handle(req, async ws => {
    const a = await accessFrom(req, ws);
    if (a.kind === "student") {
      const s = a.student;
      const [c, avatar] = await Promise.all([
        ws.store.getClass(s.classId), resolveAvatar(s.avatar, ws.store),
      ]);
      return Response.json({ role: "student", avatar, student: { id: s.id, nickname: s.nickname, classId: s.classId, className: c?.name ?? "", avatar }, status: workshopStatus() }, { headers: noStore });
    }
    if (a.kind === "teacher") {
      const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
      const headers: Record<string, string> = { ...noStore };
      if (token) { const ttl = 5 * 24 * 60 * 60; const session = await getAuth().createSessionCookie(token, { expiresIn: ttl * 1000 }); headers["set-cookie"] = sessionCookie(`teacher.${session}`, ttl); }
      const avatar = await resolveAvatar(a.teacher.avatar, ws.store);
      return Response.json({ role: "teacher", avatar, teacher: { id: a.teacher.id, name: a.teacher.displayName }, status: workshopStatus() }, { headers });
    }
    return Response.json({ role: null, status: workshopStatus() }, { headers: noStore });
  });
}
