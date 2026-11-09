// 메인 사이트 배포 전에 전국 강태공 대결(games/fishing)을 out/fishing/ 으로 복사한다(공유용, 나의 /fish 와 따로).
// 물고기·아바타·효과음 그림/모델은 games/fish/assets 를 그대로 같이 복사(저장소에는 한 벌만, 호스팅은 같은 파일이라 다시 올리지 않음).
// 카카오 지도 키(학교 검색)는 .env.local 의 NEXT_PUBLIC_KAKAO_MAP_KEY 로 kakao-key.js 를 만든다(공개 키, 저장소엔 안 올림).
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), out = path.join(root, "out");
if (!fs.existsSync(out)) { console.error("out/ 이 없어요. 먼저 next build"); process.exit(1); }
const dst = path.join(out, "fishing");
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(path.join(root, "games/fishing"), dst, { recursive: true, filter: (p) => !path.basename(p).startsWith(".") });
fs.cpSync(path.join(root, "games/fish/assets"), path.join(dst, "assets"), { recursive: true, filter: (p) => !path.basename(p).startsWith(".") });
let key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY || "";
if (!key) { try { key = (fs.readFileSync(path.join(root, ".env.local"), "utf8").match(/^NEXT_PUBLIC_KAKAO_MAP_KEY=(.*)$/m) || [])[1] || ""; } catch {} }
key = key.trim().replace(/^["']|["']$/g, "");
fs.writeFileSync(path.join(dst, "kakao-key.js"), `export const KAKAO_KEY = ${JSON.stringify(key)};\n`);
console.log(`전국 강태공 대결 → out/fishing 복사 완료${key ? "" : " (⚠️ 카카오 키 없음: 학교 검색 대신 직접 쓰기)"}`);
