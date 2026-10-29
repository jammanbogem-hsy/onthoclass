// 잼만보 낚시터 배경 음악(긴 곡)을 일레븐랩스 Music API로 만든다. 유료 요금제가 필요하다.
// 사용: node scripts/fish/make-music.mjs [이름...]   → games/fish/assets/bgm/<이름>.mp3 + bgm.json
// 30초 루프 곡(make-bgm.mjs)과 같은 목록에 들어가서, 게임이 같은 낚시터·날씨 곡끼리 번갈아 튼다.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const out = path.join(root, "games/fish/assets/bgm");
let key = process.env.ELEVENLABS_API_KEY;
if (!key) try { key = fs.readFileSync(path.join(root, ".env.elevenlabs"), "utf8").match(/ELEVENLABS_API_KEY\s*=\s*(\S+)/)?.[1]; } catch {}
if (!key) { console.error("ELEVENLABS_API_KEY 가 없어요 (.env.elevenlabs 에 ELEVENLABS_API_KEY=... )"); process.exit(1); }

const STYLE = "Cozy, peaceful instrumental background music for a cute fishing life-simulation video game. Gentle and relaxing, warm and charming, slow easygoing tempo, light and uncluttered so it sits quietly under gameplay. No vocals.";
const MUSIC = {
  "title-m":        [60, "Title screen of a fishing village game: cheerful acoustic guitar, glockenspiel and a whistled melody, morning sunshine, inviting and happy."],
  "fresh-sunny-m":  [90, "Sunny afternoon at a countryside pond: bouncy acoustic guitar, soft marimba, ukulele and light brushed jazz drums with walking upright bass, carefree and happy."],
  "fresh-rain-m":   [90, "Rainy day at a quiet pond: soft solo piano with gentle Rhodes chords and a little music box, calm, cozy and slightly wistful, lo-fi jazz feel."],
  "fresh-sunset-m": [90, "Golden sunset by the lake: warm fingerpicked acoustic guitar with a soft flute melody and mellow upright bass, nostalgic and tender."],
  "sea-sunny-m":    [90, "Sunny tropical beach: breezy bossa nova with nylon guitar, ukulele, steel drum accents, soft shaker and vibraphone, bright and relaxed."],
  "sea-rain-m":     [90, "Rainy harbor by the sea: gentle jazz guitar and electric piano with soft pads and brushed drums, quiet, calm and reflective."],
  "sea-sunset-m":   [90, "Sunset over the ocean: warm Hawaiian slide guitar, ukulele and smooth vibraphone with upright bass, slow, dreamy and peaceful."],
};

const only = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const manifestPath = path.join(out, "bgm.json");
for (const [name, [sec, text]] of Object.entries(MUSIC)) {
  if (only.length && !only.includes(name)) continue;
  const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_64", {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ prompt: `${STYLE} ${text}`, music_length_ms: sec * 1000, force_instrumental: true }),
  });
  if (!res.ok) { console.error(name, res.status, (await res.text()).slice(0, 300)); continue; }
  const file = `${name}.mp3`;
  fs.writeFileSync(path.join(out, file), Buffer.from(await res.arrayBuffer()));
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
  manifest[name] = `${file}?v=${Date.now().toString(36)}`;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("ok", name, sec + "s");
}
