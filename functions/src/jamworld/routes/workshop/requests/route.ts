import { handle, jsonBody, need } from "../../../lib/server/workshop/http";
import {
  accessFrom,
  noStore,
  studentFrom,
} from "../../../lib/server/workshop/runtime";
import { requestView } from "../../../lib/server/workshop/view";
import {
  waitForWorkshopChange,
  workshopRevision,
  type WorkshopScope,
} from "../../../lib/server/workshop/updates";
import type { Workshop } from "../../../lib/server/workshop/service";

async function authorized(req: Request, ws: Workshop) {
  const a = await accessFrom(req, ws);
  if (a.kind === "student")
    return {
      scope: { kind: "student", id: a.student.id } as WorkshopScope,
      classId: a.student.classId,
      student: a.student,
    };
  const t = need(a.kind === "teacher" ? a.teacher : null);
  const classId = new URL(req.url).searchParams.get("classId") ?? "";
  await ws.ownClass(t, classId);
  return {
    scope: { kind: "class", id: classId } as WorkshopScope,
    classId,
    student: null,
  };
}

/** Scoped change notifications, with no fixed 8/10-second refresh delay. */
export async function GET(req: Request) {
  return handle(req, async (ws) => {
    let access = await authorized(req, ws);
    const url = new URL(req.url),
      after = Number(url.searchParams.get("after"));
    const wait =
      url.searchParams.get("wait") === "1" &&
      Number.isSafeInteger(after) &&
      after >= 0;
    if (wait) {
      await waitForWorkshopChange(access.scope, after, req.signal);
      if (req.signal.aborted)
        return new Response(null, { status: 204, headers: noStore });
      access = await authorized(req, ws);
    }
    // Read the revision BEFORE the rows: a concurrent mutation is caught by the next wait, never lost.
    const rev = await workshopRevision(access.scope);
    if (url.searchParams.has("after") && Number.isSafeInteger(after) && after >= 0 && rev === after)
      return Response.json({ unchanged: true, rev }, { headers: noStore });
    // Clients request a fresh full snapshot at least once a minute to recover stale jobs.
    const getRows = () =>
      access.student
        ? ws.store.requestsByStudent(access.student.id)
        : ws.store.requestsByClass(access.classId);
    let rows = await getRows();
    const recovered = await Promise.all(
      rows
        .filter((r) => r.status === "generating")
        .map((r) => ws.recoverIfStale(r.id, r)),
    );
    if (recovered.some(Boolean)) rows = await getRows();
    const students = access.student
      ? []
      : (await ws.store.studentsInClass(access.classId)).map((s) => ({
          id: s.id,
          nickname: s.nickname,
        }));
    const nicknames = new Map(students.map((s) => [s.id, s.nickname]));
    const requests = await Promise.all(
      rows.map(async (r) =>
        requestView(
          r,
          r.generationId
            ? await ws.store.getGeneration(r.generationId)
            : r.attempts
              ? await ws.store.latestGeneration(r.id)
              : null,
          nicknames.get(r.studentId),
          !access.student,
        ),
      ),
    );
    return Response.json(
      { requests, rev, ...(access.student ? {} : { students }) },
      { headers: noStore },
    );
  });
}

export async function POST(req: Request) {
  return handle(req, async (ws) => {
    const s = need(
      await studentFrom(req, ws),
      "학급에 들어간 학생만 요청할 수 있어요",
    );
    const b = await jsonBody<{ draft?: unknown; sourceAssetId?: unknown }>(req);
    const r =
      typeof b.sourceAssetId === "string"
        ? await ws.remakeCharacter(s, b.sourceAssetId)
        : await ws.createRequest(s, b.draft);
    return Response.json(
      { request: requestView(r, null) },
      { status: 201, headers: noStore },
    );
  });
}
