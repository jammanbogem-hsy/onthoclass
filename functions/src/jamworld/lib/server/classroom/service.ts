import { getFirestore, type DocumentSnapshot } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { parseBundle, serializeProject } from "../../world/bundle";
import { accessFrom, getWorkshop, noStore } from "../workshop/runtime";
import { jsonBody } from "../workshop/http";
import { WorkshopError } from "../workshop/service";
import { scriptSyntaxError } from "../map-script";
import { rateLimit } from "../workshop/rate-limit";

interface Controls {
  paused: boolean;
  blackout: boolean;
  muted: boolean;
  /** 이름표 가리기(익명 참여) — 수업 끝까지 유지, '모두 풀기'로도 안 풀림 */
  hideNames?: boolean;
}
interface Message {
  id: string;
  senderId: string;
  senderName: string;
  role: "teacher" | "student";
  recipientId: string | null;
  text: string;
  at: number;
}
interface Room {
  rev: number;
  controls: Controls;
  individual: Record<string, Partial<Controls>>;
  messages: Message[];
  world: { revision: string; name: string; publishedAt: number } | null;
}
const defaults = (): Room => ({
  rev: 0,
  controls: { paused: false, blackout: false, muted: false },
  individual: {},
  messages: [],
  world: null,
});
const fields = ["paused", "blackout", "muted", "hideNames"] as const;
const roomRef = (id: string) =>
  getFirestore().collection("jamworldClassrooms").doc(id);
const read = (snap: DocumentSnapshot): Room =>
  snap.exists ? (snap.data() as Room) : defaults();

async function access(req: Request, classId: string) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(classId))
    throw new WorkshopError("class", "공방 주소가 올바르지 않아요", 400);
  const ws = getWorkshop(),
    actor = await accessFrom(req, ws),
    cls = await ws.store.getClass(classId);
  if (!actor.kind)
    throw new WorkshopError("auth", "공방에 로그인해 주세요", 401);
  if (
    !cls ||
    (actor.kind === "teacher"
      ? cls.teacherId !== actor.teacher.id
      : actor.student.classId !== classId)
  )
    throw new WorkshopError("class", "이 공방의 수업에 들어갈 수 없어요", 403);
  return {
    ws,
    cls,
    actor,
    id: actor.kind === "teacher" ? actor.teacher.id : actor.student.id,
    name:
      actor.kind === "teacher"
        ? actor.teacher.displayName
        : actor.student.nickname,
    role: actor.kind,
  };
}
type Access = Awaited<ReturnType<typeof access>>;
function effective(room: Room, studentId: string): Controls {
  return { ...room.controls, ...room.individual[studentId] };
}
async function snapshot(a: Access, state?: Room) {
  const room = state ?? read(await roomRef(a.cls.id).get());
  // Students need their filtered messages and own controls, not a full class roster.
  const roster = a.role === "teacher" ? await a.ws.store.studentsInClass(a.cls.id) : [];
  const presence = a.role === "teacher" ? await getFirestore()
    .collection("jamworldClassrooms")
    .doc(a.cls.id)
    .collection("presence")
    .get() : null;
  const times = new Map(
    presence?.docs.map((d) => [d.id, Number(d.data().at) || 0]) ?? [],
  );
  const now = Date.now();
  return {
    classId: a.cls.id,
    className: a.cls.name,
    teacherId: a.cls.teacherId,
    selfId: a.id,
    role: a.role,
    rev: room.rev,
    world: room.world,
    controls: a.role === "teacher" ? room.controls : effective(room, a.id),
    students: roster.map((s) => ({
      id: s.id,
      name: s.nickname,
      online: now - (times.get(s.id) ?? 0) < 110000,
      ...(a.role === "teacher" ? { controls: effective(room, s.id) } : {}),
    })),
    messages: room.messages.filter(
      (m) => !m.recipientId || m.senderId === a.id || m.recipientId === a.id,
    ),
    serverTime: now,
  };
}

/** One bounded long poll per browser. Firestore wakes it immediately on chat/control updates. */
async function waitForChange(
  classId: string,
  after: number,
  signal: AbortSignal,
) {
  await new Promise<void>((resolve, reject) => {
    let unsubscribe: () => void = () => {};
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish();
    const timer = setTimeout(finish, 20000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      finish();
      return;
    }
    unsubscribe = roomRef(classId).onSnapshot(
      (snap) => {
        if (read(snap).rev !== after) finish();
      },
      (error) => finish(error),
    );
    if (settled) unsubscribe();
  });
}

export async function classroomGet(req: Request, classId: string) {
  let current = await access(req, classId);
  const url = new URL(req.url);
  if (url.searchParams.get("world") === "1") {
    const snap = await getFirestore()
      .collection("jamworldClassroomWorlds")
      .doc(classId)
      .get();
    if (!snap.exists)
      throw new WorkshopError("world", "아직 공유된 수업 월드가 없어요", 404);
    return Response.json({ ...snap.data() }, { headers: noStore });
  }
  const after = Number(url.searchParams.get("after"));
  if (
    url.searchParams.get("wait") === "1" &&
    Number.isSafeInteger(after) &&
    after >= 0
  ) {
    await waitForChange(classId, after, req.signal);
    if (req.signal.aborted) return new Response(null, { status: 204, headers: noStore });
    // Never cache authorization across a wait: role/session revocation must still take effect.
    current = await access(req, classId);
  }
  const room = read(await roomRef(classId).get());
  if (url.searchParams.get("compact") === "1" && Number.isSafeInteger(after) && after >= 0 && room.rev === after && url.searchParams.get("roster") !== "1")
    return Response.json({ unchanged: true, rev: room.rev }, { headers: noStore });
  return Response.json(await snapshot(current, room), { headers: noStore });
}

export async function classroomPost(req: Request, classId: string) {
  const a = await access(req, classId),
    body = await jsonBody<Record<string, unknown>>(req, 750000);
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new WorkshopError("json", "수업 요청 형식을 확인해 주세요", 400);
  const ref = roomRef(classId),
    db = getFirestore();
  if (body.action === "presence") {
    await rateLimit(`presence:${a.id}`, 12, 60000);
    await ref.collection("presence").doc(a.id).set({ at: Date.now() });
    return Response.json({ ok: true }, { headers: noStore });
  }
  if (body.action === "chat") {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (
      !text ||
      text.length > 300 ||
      !/^[A-Za-z0-9_-]{8,80}$/.test(String(body.nonce ?? ""))
    )
      throw new WorkshopError("chat", "대화는 1~300자로 보내 주세요", 400);
    await rateLimit(`classroom-chat:${a.id}`, 20, 10000);
    let recipientId: string | null = null;
    if (body.recipientId) {
      if (a.role === "student") {
        if (body.recipientId !== a.cls.teacherId)
          throw new WorkshopError(
            "recipient",
            "선생님께만 따로 보낼 수 있어요",
            403,
          );
        recipientId = a.cls.teacherId;
      } else {
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(body.recipientId)))
          throw new WorkshopError(
            "recipient",
            "받는 사람을 확인해 주세요",
            400,
          );
        const student = await a.ws.store.getStudent(String(body.recipientId));
        if (!student || student.classId !== classId)
          throw new WorkshopError(
            "recipient",
            "우리 공방 학생을 골라 주세요",
            400,
          );
        recipientId = student.id;
      }
    }
    await db.runTransaction(async (tx) => {
      const room = read(await tx.get(ref));
      if (a.role === "student" && effective(room, a.id).muted)
        throw new WorkshopError(
          "muted",
          "지금은 선생님 설명을 듣는 시간이에요",
          403,
        );
      const id = `${a.id}:${body.nonce}`;
      if (room.messages.some((m) => m.id === id)) return;
      const message: Message = {
        id,
        senderId: a.id,
        senderName: a.name,
        role: a.role,
        recipientId,
        text,
        at: Date.now(),
      };
      tx.set(ref, {
        ...room,
        rev: room.rev + 1,
        messages: [...room.messages, message].slice(-80),
      });
    });
  } else {
    if (a.role !== "teacher")
      throw new WorkshopError("teacher", "담당 선생님만 할 수 있어요", 403);
    await rateLimit(`classroom-control:${a.id}`, 60, 60000);
    if (body.action === "publish") {
      if (
        typeof body.bundle !== "string" ||
        Buffer.byteLength(body.bundle) > 700000
      )
        throw new WorkshopError(
          "size",
          "수업 월드는 700KB 이하로 공유해 주세요",
          413,
        );
      let i = 0;
      const bundle = parseBundle(body.bundle, () => `lesson-map-${++i}`);
      if (!bundle.ok)
        throw new WorkshopError(
          "map",
          bundle.errors[0]?.message ?? "월드를 확인해 주세요",
          400,
        );
      for (const doc of Object.values(bundle.ps.docs)) {
        const error = scriptSyntaxError(doc.script);
        if (error) throw new WorkshopError("script", error, 400);
      }
      const serialized = serializeProject(
          bundle.name,
          bundle.description,
          bundle.ps,
        ),
        revision = randomUUID();
      await db.runTransaction(async (tx) => {
        const room = read(await tx.get(ref));
        tx.set(db.collection("jamworldClassroomWorlds").doc(classId), {
          revision,
          bundle: serialized,
        });
        tx.set(ref, {
          ...room,
          rev: room.rev + 1,
          world: { revision, name: bundle.name, publishedAt: Date.now() },
        });
      });
    } else if (
      body.action === "control" ||
      body.action === "reset" ||
      body.action === "clearChat"
    ) {
      const target = body.studentId ? String(body.studentId) : null;
      if (target) {
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(target))
          throw new WorkshopError("student", "학생을 확인해 주세요", 400);
        const student = await a.ws.store.getStudent(target);
        if (!student || student.classId !== classId)
          throw new WorkshopError(
            "student",
            "우리 공방 학생을 골라 주세요",
            400,
          );
      }
      const field = body.field;
      if (
        body.action === "control" &&
        (!fields.includes(field as (typeof fields)[number]) ||
          typeof body.value !== "boolean")
      )
        throw new WorkshopError("control", "제어 설정을 확인해 주세요", 400);
      await db.runTransaction(async (tx) => {
        const room = read(await tx.get(ref));
        if (body.action === "clearChat") room.messages = [];
        else if (body.action === "reset") {
          room.controls = { ...defaults().controls, ...(room.controls.hideNames ? { hideNames: true } : {}) };
          room.individual = {};
        } else {
          const key = field as (typeof fields)[number];
          if (target)
            room.individual[target] = {
              ...room.individual[target],
              [key]: body.value as boolean,
            };
          else {
            room.controls[key] = body.value as boolean;
            for (const value of Object.values(room.individual))
              delete value[key];
          }
        }
        tx.set(ref, { ...room, rev: room.rev + 1 });
        tx.create(db.collection("jamworldClassroomEvents").doc(), {
          classId,
          teacherId: a.id,
          action: body.action,
          studentId: target,
          field: typeof field === "string" ? field : null,
          value: typeof body.value === "boolean" ? body.value : null,
          at: Date.now(),
        });
      });
    } else throw new WorkshopError("action", "알 수 없는 수업 요청이에요", 400);
  }
  return Response.json(await snapshot(a), { headers: noStore });
}
