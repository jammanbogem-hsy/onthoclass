// /touch 뽑기 효과음을 일레븐랩스(Sound Effects API)로 만든다.
// 키: 환경변수 ELEVENLABS_API_KEY 또는 저장소 루트 .env.elevenlabs (gitignore 됨)
// 사용: node scripts/touch/make-sfx.mjs [이름...]  → public/sounds/touch/<이름>.mp3
// 페이지는 파일을 못 받으면 Web Audio 신스로 대신 낸다.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const out = path.join(root, "public/sounds/touch");
let key = process.env.ELEVENLABS_API_KEY;
if (!key) try { key = fs.readFileSync(path.join(root, ".env.elevenlabs"), "utf8").match(/ELEVENLABS_API_KEY\s*=\s*(\S+)/)?.[1]; } catch {}
if (!key) { console.error("ELEVENLABS_API_KEY 가 없어요"); process.exit(1); }

const SFX = {
  drumroll: { sec: 3.5, text: "snare drum roll building up in a steady crescendo, game show suspense, no ending hit" },
  spin:     { sec: 3.5, text: "slot machine reels spinning fast, mechanical whirring with rapid clicking, casino, steady" },
  stop:     { sec: 0.6, text: "LOUD heavy slot machine reel stopping, mechanical clunk thud, immediate attack" },
  jackpot:  { sec: 3.0, text: "LOUD slot machine jackpot win, bells ringing and lots of coins pouring out, bright and happy" },
  cheer:    { sec: 3.0, text: "classroom of excited kids cheering wow and clapping, short happy crowd reaction" },
  rimshot:  { sec: 1.2, text: "LOUD drum roll ending with a big cymbal crash, game show reveal" },
};

const only = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
for (const [name, { sec, text }] of Object.entries(SFX)) {
  if (only.length && !only.includes(name)) continue;
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_96", {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, duration_seconds: sec, prompt_influence: 0.75 }),
  });
  if (!res.ok) { console.error(name, res.status, (await res.text()).slice(0, 200)); continue; }
  fs.writeFileSync(path.join(out, `${name}.mp3`), Buffer.from(await res.arrayBuffer()));
  console.log("ok", name, sec + "s");
}
