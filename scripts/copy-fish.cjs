// 메인 사이트(jammanboeng.web.app) 배포 전에 낚시터(games/fish)를 out/fish/ 로 복사한다.
// 학교망이 jammanbo-fish.web.app 주소를 막아도 /fish/ 로 들어갈 수 있게(같은 서버·같은 로그인).
const fs = require("fs"), path = require("path");
const src = path.join(__dirname, "../games/fish"), dst = path.join(__dirname, "../out/fish");
if (!fs.existsSync(path.join(__dirname, "../out"))) { console.error("out/ 이 없어요. 먼저 next build"); process.exit(1); }
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true, filter: (p) => !path.basename(p).startsWith(".") });
console.log("낚시터 → out/fish 복사 완료");
