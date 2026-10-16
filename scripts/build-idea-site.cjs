// 아이디어 섬 별도 사이트(jambrain.web.app) — next build 결과(out/)에서 /idea 에 필요한 파일만 골라 out-idea/ 로 복사한다.
// 러닝크루 화면은 들어가지 않는다(루트 / 는 firebase.json 에서 /idea/ 로 넘긴다). firebase deploy 의 predeploy 로 실행된다.
const fs = require("fs");
const path = require("path");
const src = path.resolve(__dirname, "..", "out");
const dst = path.resolve(__dirname, "..", "out-idea");
if (!fs.existsSync(path.join(src, "idea", "index.html"))) {
  console.error("out/idea 가 없어요. 먼저 next build 를 실행하세요.");
  process.exit(1);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
const keep = ["_next", "idea", "brainstorm", "avatar", "404.html", "favicon.ico", "icon.png", "apple-icon.png"];
for (const name of keep) {
  const from = path.join(src, name);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(dst, name), { recursive: true });
}
// 루트 레이아웃 조각(클라이언트 라우터가 읽는 __next.*.txt)
for (const f of fs.readdirSync(src)) if (f.startsWith("__next")) fs.cpSync(path.join(src, f), path.join(dst, f));
console.log("out-idea ready:", fs.readdirSync(dst).join(", "));
