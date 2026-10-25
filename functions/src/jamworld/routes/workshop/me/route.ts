import { resolveAvatar } from "../../../lib/server/workshop/catalog";
import { getAuth } from "firebase-admin/auth";
import { accessFrom, firebaseIdentity, workshopStatus, noStore, sessionCookie } from "../../../lib/server/workshop/runtime";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { handle } from "../../../lib/server/workshop/http";
export async function GET(req: Request) {
  return handle(req, async ws => {
    const a = await accessFrom(req, ws);
    if (a.kind === "student") {
      const s = a.student;
      // 러닝크루로 로그인한 학생이면 두 계정을 잇는다 — 러닝크루에서 내 모아 월드 에셋을 쓸 수 있게(한 번만 쓴다)
      const lms = await firebaseIdentity(req);
      if (lms && !lms.firebase?.sign_in_provider?.includes("anonymous") && (s as unknown as { lmsUid?: string }).lmsUid !== lms.uid) {
        const db = getFirestore();
        await Promise.all([
          db.doc(`jamworldStudents/${s.id}`).set({ lmsUid: lms.uid }, { merge: true }),
          db.doc(`jamworldLinks/${lms.uid}`).set({ studentIds: FieldValue.arrayUnion(s.id), updatedAt: Date.now() }, { merge: true }),
        ]).catch(e => console.error("jamworld link", e));
      }
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
