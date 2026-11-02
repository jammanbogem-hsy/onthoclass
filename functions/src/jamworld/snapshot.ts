// 교사 전용: 링크를 headless Chromium(Playwright)으로 열어 화면 캡처 + 본문 글을 돌려준다.
// 맵 도우미에 '참고 자료'로 붙이는 용도. 내부망·메타데이터 주소는 모든 요청 단계에서 막는다.
import { onRequest } from "firebase-functions/v2/https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { accessFrom, assertSameOrigin, errorResponse, getWorkshop } from "./lib/server/workshop/runtime";
import { rateLimit } from "./lib/server/workshop/rate-limit";

const VIEW_W = 1280, VIEW_H = 800, MAX_SHOTS = 3, MAX_TEXT = 12_000;

function privateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
}
export function privateIp(ip: string): boolean {
  if (isIP(ip) === 4) return privateV4(ip);
  const v = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return privateV4(mapped[1]);
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff") || v.startsWith("64:ff9b:");
}

/** 같은 요청 안에서는 DNS 결과를 재사용한다 */
function hostGuard() {
  const cache = new Map<string, Promise<boolean>>();
  return (host: string) => {
    const h = host.replace(/^\[|\]$/g, "").toLowerCase();
    if (!cache.has(h)) cache.set(h, (async () => {
      if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
      if (isIP(h)) return !privateIp(h);
      try {
        const all = await lookup(h, { all: true, verbatim: true });
        return all.length > 0 && all.every(r => !privateIp(r.address));
      } catch { return false; }
    })());
    return cache.get(h)!;
  };
}

function normalizeUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) return null;
    if (u.port && !["80", "443"].includes(u.port)) return null;
    return u;
  } catch { return null; }
}

// ESM 전용 패키지를 CommonJS 빌드에서 진짜 import 로 불러온다 (다른 함수의 시작 시간에 영향 없게 지연 로드)
const importEsm = new Function("s", "return import(s)") as <T>(s: string) => Promise<T>;

async function launch() {
  const { chromium } = await import("playwright-core");
  // 로컬 검사용: SNAPSHOT_CHROME=/path/to/chrome (운영에서는 쓰지 않음)
  if (process.env.SNAPSHOT_CHROME && !process.env.K_SERVICE) return chromium.launch({ executablePath: process.env.SNAPSHOT_CHROME, headless: true });
  const Chromium = (await importEsm<{ default: { args: string[]; executablePath(): Promise<string>; setGraphicsMode: boolean } }>("@sparticuz/chromium")).default;
  Chromium.setGraphicsMode = false;
  const executablePath = await Chromium.executablePath();
  // 한국어 페이지가 □ 로 깨지지 않도록 번들 글꼴을 fontconfig 폴더에 둔다
  const fontDir = process.env.FONTCONFIG_PATH || join(tmpdir(), "fonts");
  const target = join(fontDir, "NotoSansKR.ttf");
  if (!existsSync(target)) {
    await mkdir(fontDir, { recursive: true });
    await copyFile(join(__dirname, "..", "..", "assets", "fonts", "NotoSansKR.ttf"), target).catch(e => console.warn("snapshot font", e));
  }
  return chromium.launch({ executablePath, args: Chromium.args, headless: true });
}

export async function capture(target: URL, signal: AbortSignal) {
  const allowed = hostGuard();
  if (!(await allowed(target.hostname))) throw Object.assign(new Error("학교·내부 주소는 열 수 없어요"), { status: 400 });
  const sharp = (await import("sharp")).default;
  const browser = await launch();
  const stop = () => void browser.close().catch(() => {});
  signal.addEventListener("abort", stop);
  try {
    const ctx = await browser.newContext({
      viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: 1, acceptDownloads: false, locale: "ko-KR",
      serviceWorkers: "block", javaScriptEnabled: true, ignoreHTTPSErrors: false,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Safari/537.36 LearningCrewSnapshot/1.0",
    });
    let blocked = 0;
    await ctx.route("**/*", async route => {
      const u = new URL(route.request().url());
      if (u.protocol === "data:" || u.protocol === "blob:") return route.continue();
      if (["http:", "https:"].includes(u.protocol) && (!u.port || ["80", "443"].includes(u.port)) && await allowed(u.hostname)) return route.continue();
      blocked++;
      return route.abort("blockedbyclient");
    });
    const page = await ctx.newPage();
    ctx.on("page", p => { if (p !== page) void p.close().catch(() => {}); }); // 팝업 창은 닫기
    const res = await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 20_000 });
    if (!res) throw Object.assign(new Error("페이지를 열지 못했어요"), { status: 502 });
    if (res.status() >= 400) throw Object.assign(new Error(`페이지가 오류를 돌려줬어요 (${res.status()})`), { status: 502 });
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
    await page.waitForTimeout(700);
    const info = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"],meta[property="og:description"]')?.getAttribute("content") || "",
      text: (((document.querySelector("main,article,[role=main]") as HTMLElement | null)?.innerText || "").length > 200
        ? (document.querySelector("main,article,[role=main]") as HTMLElement).innerText : (document.body?.innerText || "")).replace(/\n{3,}/g, "\n\n").trim(),
      height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
    }));
    const height = Math.min(Math.max(info.height, VIEW_H), VIEW_H * MAX_SHOTS);
    const png = await page.screenshot({ type: "png", fullPage: true, clip: { x: 0, y: 0, width: VIEW_W, height }, timeout: 15_000 });
    const images: { mime: "image/webp"; data: string }[] = [];
    const meta = await sharp(png).metadata();
    const h = meta.height || height;
    for (let top = 0; top < h && images.length < MAX_SHOTS; top += VIEW_H) {
      const part = await sharp(png).extract({ left: 0, top, width: Math.min(VIEW_W, meta.width || VIEW_W), height: Math.min(VIEW_H, h - top) }).webp({ quality: 72 }).toBuffer();
      images.push({ mime: "image/webp", data: part.toString("base64") });
    }
    return {
      url: page.url(), title: info.title.slice(0, 200), description: info.description.slice(0, 500),
      text: info.text.slice(0, MAX_TEXT), truncated: info.text.length > MAX_TEXT, images, blocked,
    };
  } finally {
    signal.removeEventListener("abort", stop);
    await browser.close().catch(() => {});
  }
}

export const jamworldSnapshot = onRequest({ region: "asia-northeast3", memory: "2GiB", cpu: 1, concurrency: 1, timeoutSeconds: 60, maxInstances: 3 }, async (req, res) => {
  res.set("cache-control", "private, no-store");
  try {
    if (req.method !== "POST") { res.status(405).json({ error: "허용되지 않은 요청입니다" }); return; }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    const request = new Request(`https://${req.headers.host}${req.originalUrl}`, { method: "POST", headers });
    assertSameOrigin(request);
    const a = await accessFrom(request, getWorkshop());
    if (a.kind !== "teacher") { res.status(403).json({ error: "링크 읽기는 선생님만 쓸 수 있어요" }); return; }
    await rateLimit(`snapshot:${a.teacher.id}`, 40, 60 * 60_000);
    const target = normalizeUrl((req.body as { url?: unknown } | undefined)?.url);
    if (!target) { res.status(400).json({ error: "http(s) 주소를 확인해 주세요" }); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 50_000);
    res.on("close", () => ctrl.abort());
    try {
      res.json(await capture(target, ctrl.signal));
    } finally { clearTimeout(timer); }
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status && e instanceof Error && !(e as { code?: string }).code) { res.status(status).json({ error: e.message }); return; }
    if (e instanceof Error && /Timeout|timeout/.test(e.message)) { res.status(504).json({ error: "페이지가 너무 늦게 열려서 캡처하지 못했어요" }); return; }
    if (e instanceof Error && /net::ERR_/.test(e.message)) { res.status(502).json({ error: `페이지에 연결하지 못했어요 (${/net::ERR_[A-Z_]+/.exec(e.message)?.[0]})` }); return; }
    const r = errorResponse(e);
    if (r.status >= 500) console.error("snapshot", e);
    res.status(r.status).json(await r.json());
  }
});
