// 잼만보 낚시터 잔잔한 배경 음악을 일레븐랩스로 만든다.
// Music API는 무료 요금제에서 막혀 있어서(402) Sound Effects API의 loop 모드로 30초짜리 이어지는 곡을 만든다.
// 키: 환경변수 ELEVENLABS_API_KEY 또는 저장소 루트 .env.elevenlabs (gitignore 됨)
// 사용: node scripts/fish/make-bgm.mjs [이름...]   → games/fish/assets/bgm/<이름>.mp3 + bgm.json
// 이름은 <낚시터>-<날씨>-<번호> 또는 title. 게임은 낚시터·날씨에 맞는 곡을 번갈아 틀고, 없으면 칩튠으로 낸다.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const out = path.join(root, "games/fish/assets/bgm");
let key = process.env.ELEVENLABS_API_KEY;
if (!key) try { key = fs.readFileSync(path.join(root, ".env.elevenlabs"), "utf8").match(/ELEVENLABS_API_KEY\s*=\s*(\S+)/)?.[1]; } catch {}
if (!key) { console.error("ELEVENLABS_API_KEY 가 없어요 (.env.elevenlabs 에 ELEVENLABS_API_KEY=... )"); process.exit(1); }

const TAIL = ", instrumental background music, slow relaxed tempo, soft and gentle, no vocals, seamless loop";
const BGM = {
  "title":          "cheerful cozy acoustic guitar and glockenspiel with a gentle whistled melody, peaceful fishing village morning, cute life simulation video game title music",
  "fresh-sunny-1":  "cozy cheerful acoustic guitar, soft marimba and ukulele, light jazz, sunny afternoon by a countryside pond, cute life simulation video game music",
  "fresh-sunny-2":  "laid-back jazz piano trio with brushed drums and upright bass, warm and happy, cozy village video game soundtrack",
  "fresh-rain-1":   "soft calm lo-fi piano with gentle rhodes chords, quiet rainy day, cozy video game music",
  "fresh-rain-2":   "gentle music box and soft piano, dreamy and calm, rainy afternoon, cozy video game music",
  "fresh-sunset-1": "warm nostalgic acoustic guitar fingerpicking with a soft flute melody, golden evening by the lake, peaceful video game music",
  "fresh-sunset-2": "mellow jazz with soft saxophone and piano, warm sunset, relaxed and cozy",
  "sea-sunny-1":    "breezy ukulele and steel drum, light tropical bossa nova, sunny beach, cozy island video game music",
  "sea-sunny-2":    "bright bossa nova with nylon guitar, soft shaker and vibraphone, ocean breeze, cozy video game music",
  "sea-rain-1":     "calm ambient electric piano with soft warm pads, gentle rain over the ocean, peaceful",
  "sea-rain-2":     "gentle slow jazz guitar, quiet rainy harbor, cozy and reflective",
  "sea-sunset-1":   "warm hawaiian slide guitar and ukulele, golden hour on the beach, peaceful",
  "sea-sunset-2":   "smooth mellow jazz vibraphone and upright bass, sunset by the sea, relaxed lounge",
};

const only = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const manifestPath = path.join(out, "bgm.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
for (const [name, text] of Object.entries(BGM)) {
  if (only.length && !only.includes(name)) continue;
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_64", {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text: text + TAIL, duration_seconds: 30, loop: true, prompt_influence: 0.6, model_id: "eleven_text_to_sound_v2" }),
  });
  if (!res.ok) { console.error(name, res.status, (await res.text()).slice(0, 200)); continue; }
  const file = `${name}.mp3`;
  fs.writeFileSync(path.join(out, file), Buffer.from(await res.arrayBuffer()));
  manifest[name] = `${file}?v=${Date.now().toString(36)}`;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("ok", name);
}
