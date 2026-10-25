// Explicit opt-in: two paid image calls, no classroom/database writes and no secret output.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { OpenAIImages } = require('../../functions/lib/jamworld/lib/server/workshop/image-provider');
const { prepareCharacterSheet } = require('../../functions/lib/jamworld/lib/server/workshop/character-images');
const { characterPrompt, IMAGE_MODEL } = require('../../functions/lib/jamworld/lib/server/workshop/prompts');
(async () => {
  if (process.env.JAMWORLD_LIVE_CHARACTER !== '1') throw new Error('Set JAMWORLD_LIVE_CHARACTER=1 to explicitly run two paid image calls');
  let key = process.env.OPENAI_API_KEY;
  if (!key && process.argv.includes('--project-secret')) key = require('node:child_process').execFileSync(path.resolve(__dirname, '../../node_modules/.bin/firebase'), ['functions:secrets:access', 'OPENAI_API_KEY', '--project', 'jammanboeng'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (!key) throw new Error('A server API key is required');
  const provider = new OpenAIImages(key, IMAGE_MODEL), dir = '/tmp/jamworld-live-character'; fs.mkdirSync(dir, { recursive: true });
  const snapshot = { version: 1, draft: { name: '별빛 토끼 탐험가', description: '푸른 옷과 노란 가방을 멘 작은 흰 토끼 탐험가, 귀여운 두 발 캐릭터', category: 'character', tags: [], footprint: { w: 1, d: 1 }, passable: true, height: 1 }, uploadKey: null, uploadSha256: null, outputs: ['td', 'iso'] };
  let td;
  for (const view of ['td', 'iso']) {
    if (view === 'td' && process.env.JAMWORLD_LIVE_CHARACTER_RESUME === '1') { td = { bytes: fs.readFileSync(path.join(dir, 'td-preview.webp')), contentType: 'image/webp' }; continue; }
    console.log('Generating character directions:', view);
    const img = await provider.create({ prompt: characterPrompt(snapshot, view, !!td), background: 'transparent', format: 'png', ...(td ? { references: [td] } : {}) });
    fs.writeFileSync(path.join(dir, view + '-raw.png'), img.bytes);
    const out = await prepareCharacterSheet(img.bytes, view, view + '-sprite.png', 5, 'canonical');
    fs.writeFileSync(path.join(dir, view + '-sprite.png'), out.bytes); fs.writeFileSync(path.join(dir, view + '-preview.webp'), out.preview);
    assert.ok(out.bytes.length > 1000); console.log('Validated all directional poses:', view, out.sheet.rows * out.sheet.columns, 'frames');
    if (view === 'td') td = { bytes: out.preview, contentType: 'image/webp' };
  }
  console.log('Live character sheets passed:', dir);
})().catch(e => { console.error('Live character test failed:', e.status || e.name, String(e.message).replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 300)); process.exitCode = 1; });
