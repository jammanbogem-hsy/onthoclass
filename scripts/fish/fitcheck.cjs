// 꾸미기 착장 검증: 남녀 몸에 아이템을 하나씩 입혀
//  1) 숫자 검사 — 아이템에서 가장 가까운 입은 몸(맨몸+옷) 겉면까지 거리(뜬 정도), 안경 렌즈 가운데와 잰 눈 높이 차이
//  2) 사진 — 실제 게임 장면의 낚시꾼을 정면·옆·3/4·뒤에서 찍은 묶음(out/<id>.png)
// 쓰기: node scripts/fish/fitcheck.cjs [out 폴더] [아이템 id …]   (없으면 전부)
// 기준을 넘으면 FAIL 을 찍고 종료 코드 1. 크롬은 playwright 헤드리스 셸(CHROME 환경변수로 바꿀 수 있음)
const { chromium } = require("playwright-core");
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "../../games/fish"), OUT = path.resolve(process.argv[2] || "fitcheck-out"), ONLY = process.argv.slice(3);
const GAP_MAX = .012, EYE_MAX = .015; // 키 비율(키 1.35m 기준 약 1.6cm, 2cm)
const CHROME = process.env.CHROME || (() => { const d = path.join(os.homedir(), "Library/Caches/ms-playwright"); const h = fs.existsSync(d) && fs.readdirSync(d).filter((n) => n.startsWith("chromium_headless_shell")).sort().pop(); return h ? path.join(d, h, "chrome-headless-shell-mac-arm64/chrome-headless-shell") : undefined; })();
const SLOT = { head: "head", pin: "head", face: "face", mouth: "face", back: "back", wings: "back", pole: "back", cape: "body" };
const types = { ".js": "text/javascript", ".html": "text/html", ".json": "application/json", ".glb": "model/gltf-binary", ".webp": "image/webp", ".png": "image/png", ".mp3": "audio/mpeg", ".css": "text/css" };
fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(q.url.split("?")[0])); fs.readFile(p.endsWith("/") ? p + "index.html" : p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); r.end(d); }); }).listen(0);
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }), pg = await b.newPage({ viewport: { width: 800, height: 600 } });
  const errs = []; pg.on("pageerror", (e) => errs.push(e.message));
  await pg.goto(`http://localhost:${srv.address().port}/index.html`);
  await pg.waitForFunction(() => window.__fish && window.__fish.AVA.S, null, { timeout: 90000 });
  const fit = await pg.evaluate(() => Object.fromEntries(Object.entries(window.__fish.ITEM_FIT).map(([k, v]) => [k, v.at])));
  const sets = [...Object.entries(fit).filter(([, at]) => SLOT[at]).map(([id, at]) => [id, { [SLOT[at]]: id }]), ["scarf", { body: "scarf" }], ["vest", { body: "vest" }], ["lifevest", { body: "lifevest" }]].filter(([id]) => !ONLY.length || ONLY.includes(id));
  let fail = 0; const rows = [];
  for (const [id, wear] of sets) {
    const shots = [];
    for (const base of [0, 1]) {
      await pg.evaluate((b) => window.__fish.applyGear({ look: { base: b }, wear: {} }), base);
      await pg.waitForFunction((b) => window.__fish.AVA.base === b && window.__fish.AVA.face, base, { timeout: 90000 });
      for (let r = 0; r < 2; r++) { await pg.evaluate((w) => window.__fish.applyGear({ look: { base: window.__fish.AVA.base }, wear: w }), wear); await pg.waitForTimeout(r ? 300 : 1500); }
      const rep = await pg.evaluate(() => window.__fish.fitReport());
      const mine = Object.entries(rep).filter(([k]) => k === id || k.startsWith(id + "_"));
      for (const [k, m] of mine) {
        const bad = m.gap > GAP_MAX || (m.lensVsEye != null && Math.abs(m.lensVsEye) > EYE_MAX);
        if (bad) fail++; rows.push(`${bad ? "FAIL" : "ok  "} ${["boy ", "girl"][base]} ${k.padEnd(14)} gap ${m.gap.toFixed(4)}${m.lensVsEye != null ? `  lens-eye ${m.lensVsEye.toFixed(4)}` : ""}`);
      }
      const at = fit[id], opt = at === "back" || at === "wings" || at === "pole" || at === "cape" || ["vest", "lifevest"].includes(id) ? { zoom: .36, yk: .6 } : id === "scarf" ? { zoom: .22, yk: .72 } : { zoom: .17, yk: .88 };
      for (const [v, a] of [0, -Math.PI / 2, -Math.PI / 4, Math.PI].entries()) { const f = path.join(OUT, `.${id}_${base}_${v}.png`); fs.writeFileSync(f, Buffer.from((await pg.evaluate(([a, o]) => window.__fish.headShot({ ...o, a, px: 320 }), [a, opt])).split(",")[1], "base64")); shots.push(f); }
    }
    try { execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...shots.flatMap((f) => ["-i", f]), "-filter_complex", `xstack=inputs=8:layout=${shots.map((_, k) => `${(k % 4) * 320}_${Math.floor(k / 4) * 320}`).join("|")}`, "-frames:v", "1", path.join(OUT, `${id}.png`)]); shots.forEach((f) => fs.unlinkSync(f)); } catch { /* ffmpeg 없으면 낱장 그대로 */ }
  }
  console.log(rows.join("\n"));
  if (errs.length) { console.log("페이지 오류:", errs.join(" | ")); fail++; }
  console.log(fail ? `\n${fail}건 기준 초과(뜬 거리 > ${GAP_MAX}H 또는 렌즈-눈 > ${EYE_MAX}H). 사진: ${OUT}` : `\n모두 통과. 사진: ${OUT}`);
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
