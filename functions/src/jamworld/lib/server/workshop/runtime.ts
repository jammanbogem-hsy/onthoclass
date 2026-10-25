import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { FirestoreStore } from "./firestore-store";
import { OpenAIImages } from "./image-provider";
import { IMAGE_MODEL } from "./prompts";
import { parsePricing } from "./pricing";
import { Workshop, WorkshopError, type Actor, type Files } from "./service";
import type { TeacherRow } from "./store";

class StorageFiles implements Files {
  async put(key: string, bytes: Uint8Array, contentType: string) {
    await getStorage()
      .bucket()
      .file(`jamworld/${key}`)
      .save(Buffer.from(bytes), { contentType, resumable: false });
  }
  async get(key: string) {
    const file = getStorage().bucket().file(`jamworld/${key}`);
    if (!(await file.exists())[0]) return null;
    const [bytes] = await file.download();
    const [meta] = await file.getMetadata();
    return {
      bytes: new Uint8Array(bytes),
      contentType: meta.contentType || "application/octet-stream",
    };
  }
}
export function workshopStatus() {
  return {
    db: true,
    files: true,
    imageGeneration: !!process.env.OPENAI_API_KEY,
    imageModel: process.env.OPENAI_IMAGE_MODEL || IMAGE_MODEL,
  };
}
export function getWorkshop() {
  return new Workshop(
    new FirestoreStore(),
    new StorageFiles(),
    process.env.OPENAI_API_KEY
      ? new OpenAIImages(
          process.env.OPENAI_API_KEY,
          workshopStatus().imageModel,
        )
      : null,
    Date.now,
    parsePricing(process.env.OPENAI_IMAGE_PRICING),
  );
}
// Firebase Hosting forwards only __session. Tokens never enter localStorage or URLs.
export const SESSION_COOKIE = "__session";
function cookie(req: Request) {
  const raw = req.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return raw?.slice(SESSION_COOKIE.length + 1) ?? null;
}
export function sessionCookie(token: string, seconds: number) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; ${process.env.FUNCTIONS_EMULATOR ? "" : "Secure; "}SameSite=Lax; Max-Age=${seconds}`;
}
export function sessionToken(req: Request) {
  const t = cookie(req);
  return t?.startsWith("teacher.") ? null : t;
}
export async function firebaseIdentity(
  req: Request,
): Promise<DecodedIdToken | null> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  try {
    if (bearer) return await getAuth().verifyIdToken(bearer, true);
    const c = cookie(req);
    return c?.startsWith("teacher.")
      ? await getAuth().verifySessionCookie(c.slice(8), true)
      : null;
  } catch {
    return null;
  }
}
async function isTeacher(uid: string) {
  return (
    (await getFirestore().doc(`users/${uid}`).get()).data()?.role === "teacher"
  );
}
export async function accessFrom(req: Request, ws: Workshop) {
  const identity = await firebaseIdentity(req);
  if (identity && (await isTeacher(identity.uid))) {
    // Stable UID prevents concurrent /me calls from creating duplicate teacher identities.
    const ref = getFirestore().doc(`jamworldTeachers/${identity.uid}`);
    let snap = await ref.get();
    if (!snap.exists) {
      await getFirestore().runTransaction(async (tx) => {
        if (!(await tx.get(ref)).exists)
          tx.create(ref, {
            id: identity.uid,
            siwcUserId: identity.uid,
            displayName: identity.name || identity.email || "선생님",
            email: identity.email || null,
            createdAt: Date.now(),
          });
      });
      snap = await ref.get();
    }
    const teacher = snap.data() as TeacherRow;
    return { kind: "teacher" as const, teacher };
  }
  const sess = await ws.studentSession(sessionToken(req));
  if (sess) {
    const teacher = await ws.store.teacherById(sess.cls.teacherId);
    if (teacher && (await isTeacher(teacher.siwcUserId)))
      return { kind: "student" as const, student: sess.student };
  }
  return { kind: null };
}
export async function teacherFrom(req: Request, ws: Workshop) {
  const a = await accessFrom(req, ws);
  return a.kind === "teacher" ? a.teacher : null;
}
export async function studentFrom(req: Request, ws: Workshop) {
  const a = await accessFrom(req, ws);
  return a.kind === "student" ? a.student : null;
}
export async function actorFrom(
  req: Request,
  ws: Workshop,
): Promise<Actor | null> {
  const a = await accessFrom(req, ws);
  return a.kind === "teacher"
    ? { kind: "teacher", teacher: a.teacher }
    : a.kind === "student"
      ? { kind: "student", student: a.student }
      : null;
}
export function assertSameOrigin(req: Request) {
  if (["GET", "HEAD"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const allowed = [
    "https://jammanboeng.web.app",
    "https://jammanboeng.firebaseapp.com",
  ];
  if (process.env.FUNCTIONS_EMULATOR)
    allowed.push(
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:5000",
    );
  if (
    (origin && !allowed.includes(origin)) ||
    req.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new WorkshopError(
      "origin",
      "다른 사이트에서 온 요청은 받을 수 없어요",
      403,
    );
}
export function errorResponse(e: unknown) {
  if (e instanceof WorkshopError)
    return Response.json(
      { error: e.message, code: e.code },
      { status: e.status, headers: noStore },
    );
  console.error(
    "Jamworld request failed",
    e instanceof Error ? e.name : "unknown",
  );
  return Response.json(
    { error: "서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요." },
    { status: 500, headers: noStore },
  );
}
export const noStore = { "cache-control": "private, no-store" };
