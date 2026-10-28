// 잼만보 낚시터 효과음을 일레븐랩스(Sound Effects API)로 만든다.
// 키: 환경변수 ELEVENLABS_API_KEY 또는 저장소 루트 .env.elevenlabs (gitignore 됨)
// 사용: node scripts/fish/make-sfx.mjs [이름...]   → games/fish/assets/sfx/<이름>.mp3 + sfx.json
// 게임은 sfx.json 에 있는 소리만 쓰고, 없는 소리는 칩튠 신스로 낸다.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const out = path.join(root, "games/fish/assets/sfx");
let key = process.env.ELEVENLABS_API_KEY;
if (!key) try { key = fs.readFileSync(path.join(root, ".env.elevenlabs"), "utf8").match(/ELEVENLABS_API_KEY\s*=\s*(\S+)/)?.[1]; } catch {}
if (!key) { console.error("ELEVENLABS_API_KEY 가 없어요 (.env.elevenlabs 에 ELEVENLABS_API_KEY=... )"); process.exit(1); }

// 스네어는 몇 번 만들어 봐도 거의 무음이라 게임 신스로 낸다. 연타 소리(taiko)는 게임이 박자에 붙이고 음높이를 바꿔 쓰니 짧고 마른 한 방이어야 한다.
const SFX = {
  taiko:   { sec: 0.8, text: "Japanese taiko drum, one powerful hit, loud and close" },
  tap:     { sec: 0.5, text: "LOUD retro video game coin blip, square wave beep, immediate attack" },
  perfect: { sec: 0.6, text: "LOUD bright video game power-up chime, rising sparkle ding, immediate attack" },
  reel:    { sec: 0.7, text: "fishing reel ratchet cranking fast, quick clicking spin, short" },
  miss:    { sec: 0.6, text: "retro arcade error buzzer, short descending 8-bit fail sound" },
  splash:  { sec: 0.8, text: "LOUD big water splash, fish jumping out of water, close up" },
  snap:    { sec: 0.7, text: "fishing line snapping with a sharp twang, cartoon" },
  bite:    { sec: 0.5, text: "cartoon fishing bobber plunk underwater, bloop" },
  plop:    { sec: 0.8, text: "cartoon bloop sound of an object falling into water, loud" },
  cast:    { sec: 0.7, text: "LOUD fast whoosh swish of a stick swung through the air" },
  hook:    { sec: 0.6, text: "strong rod jerk whoosh with water splash, impact" },
  catch:   { sec: 1.8, text: "short cheerful retro 8-bit arcade victory jingle" },
  legend:  { sec: 3.0, text: "epic retro arcade jackpot fanfare with coins and sparkles, chiptune" },
};

const only = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const manifestPath = path.join(out, "sfx.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
for (const [name, { sec, text }] of Object.entries(SFX)) {
  if (only.length && !only.includes(name)) continue;
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, duration_seconds: sec, prompt_influence: 0.8 }),
  });
  if (!res.ok) { console.error(name, res.status, (await res.text()).slice(0, 200)); continue; }
  const file = `${name}.mp3`;
  fs.writeFileSync(path.join(out, file), Buffer.from(await res.arrayBuffer()));
  manifest[name] = `${file}?v=${Date.now().toString(36)}`;
  console.log("ok", name, sec + "s");
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
