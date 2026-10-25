import * as classroom from "./routes/classroom/[id]/route";
import { rateLimit } from "./lib/server/workshop/rate-limit";
import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { getWorkshop, assertSameOrigin, errorResponse } from "./lib/server/workshop/runtime";
import * as catalog from "./routes/workshop/catalog/route";
import * as catalogItem from "./routes/workshop/catalog/[id]/route";
import * as download from "./routes/workshop/catalog/[id]/download/route";
import * as route0 from "./routes/agent/route";
import * as agentEstimate from "./routes/agent/estimate/route";
import * as agentAssets from "./routes/agent/assets/route";
import * as route1 from "./routes/agent/status/route";
import * as route2 from "./routes/workshop/assist/route";
import * as route3 from "./routes/workshop/avatar/route";
import * as route4 from "./routes/workshop/classes/[id]/invite/route";
import * as endSessions from "./routes/workshop/classes/[id]/sessions/route";
import * as route5 from "./routes/workshop/classes/route";
import * as route6 from "./routes/workshop/files/[...key]/route";
import * as route7 from "./routes/workshop/join/route";
import * as route8 from "./routes/workshop/library/route";
import * as route9 from "./routes/workshop/login/route";
import * as route10 from "./routes/workshop/logout/route";
import * as route11 from "./routes/workshop/me/route";
import * as route12 from "./routes/workshop/requests/[id]/action/route";
import * as route13 from "./routes/workshop/requests/[id]/generate/route";
import * as route14 from "./routes/workshop/requests/[id]/route";
import * as route15 from "./routes/workshop/requests/[id]/upload/route";
import * as route16 from "./routes/workshop/requests/route";
import * as worlds from "./routes/worlds/route";
import * as worldItem from "./routes/worlds/[id]/route";
import * as uploadLink from "./routes/upload/[token]/route";
const secrets = [defineSecret("OPENAI_API_KEY"), defineSecret("ANTHROPIC_API_KEY")];
type Handler = (req: Request, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>;
const routes: Array<[string, object]> = [
  ["classroom/[id]", classroom],
  ["workshop/catalog", catalog],
  ["workshop/catalog/[id]", catalogItem],
  ["workshop/catalog/[id]/download", download],
  ["agent", route0],
  ["agent/estimate", agentEstimate],
  ["agent/assets", agentAssets],
  ["agent/status", route1],
  ["workshop/assist", route2],
  ["workshop/avatar", route3],
  ["workshop/classes/[id]/invite", route4],
  ["workshop/classes/[id]/sessions", endSessions],
  ["workshop/classes", route5],
  ["workshop/files/[...key]", route6],
  ["workshop/join", route7],
  ["workshop/library", route8],
  ["workshop/login", route9],
  ["workshop/logout", route10],
  ["workshop/me", route11],
  ["workshop/requests/[id]/action", route12],
  ["workshop/requests/[id]/generate", route13],
  ["workshop/requests/[id]", route14],
  ["workshop/requests/[id]/upload", route15],
  ["workshop/requests", route16],
  ["worlds", worlds],
  ["worlds/[id]", worldItem],
  ["upload/[token]", uploadLink],
];
export const jamworldApi = onRequest({ region: "asia-northeast3", secrets, timeoutSeconds: 120, memory: "512MiB", maxInstances: 10 }, async (req, res) => {
  try {
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    const abort = new AbortController();
    res.on("close", () => abort.abort());
    const request = new Request(`https://${req.headers.host}${req.originalUrl}`, { method: req.method, headers, signal: abort.signal, ...(!["GET", "HEAD"].includes(req.method) ? { body: new Uint8Array(req.rawBody) } : {}) });
    assertSameOrigin(request);
    const path = new URL(request.url).pathname.replace(/^\/api\/jamworld\//, "").replace(/\/$/, "");
    if (req.method === "POST" && /workshop\/(join|login)$/.test(path)) await rateLimit(`entry:${req.ip}`, 40, 5 * 60_000);
    let response: Response | undefined;
    for (const [pattern, module] of routes) {
      const names: string[] = [];
      const regex = pattern.replace(/\[\.\.\.(\w+)\]/g, (_, name) => { names.push(name); return "(.+)"; }).replace(/\[(\w+)\]/g, (_, name) => { names.push(name); return "([^/]+)"; });
      const match = new RegExp(`^${regex}$`).exec(path); if (!match) continue;
      const params: Record<string, string | string[]> = {}; names.forEach((name, i) => { params[name] = name === "key" ? match[i + 1].split("/").map(decodeURIComponent) : decodeURIComponent(match[i + 1]); });
      const handler = (module as Record<string, Handler>)[req.method];
      response = handler ? await handler(request, { params: Promise.resolve(params) }) : Response.json({ error: "허용되지 않은 요청입니다" }, { status: 405 }); break;
    }
    response ??= Response.json({ error: "경로를 찾을 수 없어요" }, { status: 404 });
    if (abort.signal.aborted) return;
    res.status(response.status); if (!response.headers.has("cache-control")) res.setHeader("cache-control", "private, no-store"); response.headers.forEach((value, name) => res.setHeader(name, value)); res.send(Buffer.from(await response.arrayBuffer()));
  } catch (e) { const r = errorResponse(e); res.status(r.status).set("cache-control", "private, no-store").json(await r.json()); }
});
export const jamworldGenerate = onDocumentCreated({ document: "jamworldGenerations/{generationId}", region: "asia-northeast3", secrets: [defineSecret("OPENAI_API_KEY")], timeoutSeconds: 540, memory: "512MiB", maxInstances: 3, retry: false }, async event => {
  if (event.data?.data().status !== "queued") return;
  await getWorkshop().runGeneration(event.params.generationId);
});
