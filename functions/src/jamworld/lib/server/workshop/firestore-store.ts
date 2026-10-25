import { getFirestore, type DocumentData } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import type {
  Store,
  TeacherRow,
  ClassRow,
  StudentRow,
  SessionRow,
  RequestRow,
  GenerationRow,
  LibraryRow,
} from "./store";
import type { RequestStatus } from "./types";
import { touchWorkshop } from "./updates";

const key = (s: string) => createHash("sha256").update(s).digest("hex");
/** Admin-only collections. All authorization is checked in Workshop/runtime. */
export class FirestoreStore implements Store {
  private col(name: string) {
    return getFirestore().collection(`jamworld${name}`);
  }
  private async get<T>(name: string, id: string): Promise<T | null> {
    if (!id || id.includes("/")) return null;
    const s = await this.col(name).doc(id).get();
    return s.exists ? (s.data() as T) : null;
  }
  private async find<T>(
    name: string,
    field: string,
    value: unknown,
  ): Promise<T[]> {
    return (await this.col(name).where(field, "==", value).get()).docs.map(
      (d) => d.data() as T,
    );
  }
  private async put(name: string, id: string, data: object) {
    await this.col(name).doc(id).create(data);
  }
  async teacherBySiwc(id: string) {
    return (
      (await this.find<TeacherRow>("Teachers", "siwcUserId", id))[0] ?? null
    );
  }
  async insertTeacher(t: TeacherRow) {
    await this.put("Teachers", t.id, t);
  }
  teacherById(id: string) {
    return this.get<TeacherRow>("Teachers", id);
  }
  async setTeacherEmail(id: string, email: string) {
    await this.col("Teachers").doc(id).update({ email });
  }
  async setTeacherAvatar(id: string, avatar: string) {
    await this.col("Teachers").doc(id).update({ avatar });
  }
  async insertClass(c: ClassRow) {
    await this.put("Classes", c.id, c);
  }
  getClass(id: string) {
    return this.get<ClassRow>("Classes", id);
  }
  async classByInviteHash(hash: string) {
    return (
      (await this.find<ClassRow>("Classes", "inviteHash", hash))[0] ?? null
    );
  }
  classesByTeacher(id: string) {
    return this.find<ClassRow>("Classes", "teacherId", id);
  }
  async setInvite(id: string, inviteHash: string, inviteActive: number) {
    await this.col("Classes").doc(id).update({ inviteHash, inviteActive });
  }
  async endSessions(id: string, at: number) {
    await this.col("Classes").doc(id).update({ sessionsEndedAt: at });
  }
  async insertStudent(s: StudentRow) {
    return getFirestore().runTransaction(async (tx) => {
      const unique = this.col("Nicknames").doc(
        key(`${s.classId}:${s.nickname}`),
      );
      if ((await tx.get(unique)).exists) return false;
      tx.create(unique, { studentId: s.id });
      tx.create(this.col("Students").doc(s.id), s);
      touchWorkshop(tx, s.classId);
      return true;
    });
  }
  getStudent(id: string) {
    return this.get<StudentRow>("Students", id);
  }
  async studentByNickname(classId: string, nickname: string) {
    const n = await this.get<{ studentId: string }>(
      "Nicknames",
      key(`${classId}:${nickname}`),
    );
    return n ? this.getStudent(n.studentId) : null;
  }
  studentsInClass(id: string) {
    return this.find<StudentRow>("Students", "classId", id);
  }
  async setStudentAuth(
    id: string,
    failedAttempts: number,
    lockedUntil: number,
  ) {
    await this.col("Students").doc(id).update({ failedAttempts, lockedUntil });
  }
  async setStudentAvatar(id: string, avatar: string | null) {
    await this.col("Students").doc(id).update({ avatar });
  }
  async insertSession(s: SessionRow) {
    await this.put("Sessions", s.tokenHash, s);
  }
  getSession(id: string) {
    return this.get<SessionRow>("Sessions", id);
  }
  async deleteSession(id: string) {
    await this.col("Sessions").doc(id).delete();
  }
  async insertRequest(r: RequestRow) {
    const batch = getFirestore().batch();
    batch.create(this.col("Requests").doc(r.id), r);
    touchWorkshop(batch, r.classId, r.studentId);
    await batch.commit();
  }
  getRequest(id: string) {
    return this.get<RequestRow>("Requests", id);
  }
  requestsByStudent(id: string) {
    return this.find<RequestRow>("Requests", "studentId", id);
  }
  requestsByClass(id: string) {
    return this.find<RequestRow>("Requests", "classId", id);
  }
  async casRequest(
    id: string,
    rev: number,
    from: RequestStatus[],
    patch: Partial<RequestRow>,
  ) {
    return getFirestore().runTransaction(async (tx) => {
      const ref = this.col("Requests").doc(id);
      const r = (await tx.get(ref)).data() as RequestRow | undefined;
      if (!r || r.rev !== rev || !from.includes(r.status)) return false;
      tx.update(ref, { ...patch, rev: rev + 1 });
      touchWorkshop(tx, r.classId, r.studentId);
      return true;
    });
  }
  async beginGeneration(
    id: string,
    rev: number,
    from: RequestStatus[],
    patch: Partial<RequestRow>,
    g: GenerationRow,
  ) {
    return getFirestore().runTransaction(async (tx) => {
      const request = this.col("Requests").doc(id),
        unique = this.col("GenerationKeys").doc(key(g.idempotencyKey));
      const [rSnap, kSnap] = await Promise.all([
        tx.get(request),
        tx.get(unique),
      ]);
      if (kSnap.exists) {
        const existing = (
          await tx.get(this.col("Generations").doc(kSnap.data()!.id))
        ).data() as GenerationRow;
        return { ok: false as const, reason: "duplicate" as const, existing };
      }
      const r = rSnap.data() as RequestRow | undefined;
      if (!r || r.rev !== rev || !from.includes(r.status))
        return { ok: false as const, reason: "conflict" as const };
      tx.update(request, { ...patch, generationId: g.id, rev: rev + 1 });
      tx.create(unique, { id: g.id });
      tx.create(this.col("Generations").doc(g.id), {
        ...g,
        classId: r.classId,
        studentId: r.studentId,
      });
      touchWorkshop(tx, r.classId, r.studentId);
      return { ok: true as const };
    });
  }
  async generationByKey(k: string) {
    const u = await this.get<{ id: string }>("GenerationKeys", key(k));
    return u ? this.getGeneration(u.id) : null;
  }
  getGeneration(id: string) {
    return this.get<GenerationRow>("Generations", id);
  }
  async latestGeneration(id: string) {
    return (
      (await this.find<GenerationRow>("Generations", "requestId", id)).sort(
        (a, b) => b.attempt - a.attempt,
      )[0] ?? null
    );
  }
  async setGenerationUsage(id: string, usage: string) {
    const g = await this.getGeneration(id);
    const r = g && !g.classId ? await this.getRequest(g.requestId) : null;
    const batch = getFirestore().batch();
    batch.update(this.col("Generations").doc(id), { usage });
    if (g?.classId || r)
      touchWorkshop(
        batch,
        g?.classId || r!.classId,
        g?.studentId || r?.studentId,
      );
    await batch.commit();
  }
  async claimGeneration(id: string, at: number) {
    return getFirestore().runTransaction(async (tx) => {
      const ref = this.col("Generations").doc(id),
        g = (await tx.get(ref)).data();
      if (g?.status !== "queued") return false;
      const r = !g.classId
        ? (await tx.get(this.col("Requests").doc(g.requestId))).data()
        : null;
      tx.update(ref, { status: "running", startedAt: at });
      if (g.classId || r)
        touchWorkshop(tx, g.classId || r!.classId, g.studentId || r?.studentId);
      return true;
    });
  }
  async completeGeneration(
    id: string,
    patch: Pick<
      GenerationRow,
      "status" | "outputs" | "error" | "finishedAt" | "usage"
    >,
    requestId: string,
    status: RequestStatus,
    at: number,
  ) {
    await getFirestore().runTransaction(async (tx) => {
      const ref = this.col("Requests").doc(requestId),
        gen = this.col("Generations").doc(id);
      const [rs, gs] = await Promise.all([tx.get(ref), tx.get(gen)]);
      const r = rs.data();
      const g = gs.data();
      if (!g || !["queued", "running"].includes(g.status)) return;
      tx.update(gen, patch as DocumentData);
      if (r?.status === "generating" && r.attempts === g.attempt)
        tx.update(ref, { status, updatedAt: at, rev: r.rev + 1 });
      if (r) touchWorkshop(tx, r.classId, r.studentId);
    });
  }
  async saveLibrary(id: string, rev: number, a: LibraryRow, at: number) {
    return getFirestore().runTransaction(async (tx) => {
      const ref = this.col("Requests").doc(id);
      const r = (await tx.get(ref)).data();
      if (!r || r.rev !== rev || r.status !== "generated") return false;
      tx.update(ref, { status: "saved", rev: rev + 1, updatedAt: at });
      tx.create(this.col("Library").doc(a.id), { ...a, removedAt: null });
      touchWorkshop(tx, r.classId, r.studentId);
      return true;
    });
  }
  async libraryForStudent(studentId: string, classId: string) {
    return (await this.libraryForClass(classId)).filter(
      (a) => a.ownerStudentId === studentId || a.shared === 1,
    );
  }
  async libraryForClass(id: string) {
    return (await this.find<LibraryRow>("Library", "classId", id)).filter(
      (a) => !a.removedAt,
    );
  }
  getLibrary(id: string) {
    return this.get<LibraryRow>("Library", id);
  }
  async insertEvent(e: {
    id: string;
    requestId: string;
    actor: string;
    type: string;
    data: string | null;
    createdAt: number;
  }) {
    await this.put("Events", e.id, e);
  }
}
