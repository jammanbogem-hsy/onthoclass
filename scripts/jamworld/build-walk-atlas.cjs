// The default explorer uses the same five-column normalization as new workshop characters.
const fs = require('node:fs');
const path = require('node:path');
const { prepareCharacterSheet } = require('../../functions/lib/jamworld/lib/server/workshop/character-images');
const { characterFrame } = require('../../functions/lib/jamworld/lib/server/workshop/character-sprite');
(async () => {
  const root = path.resolve(__dirname, '../..'), design = path.join(root, 'design/jamworld'), atlas = path.join(root, 'public/jamworld/assets/atlas');
  const source = fs.readFileSync(path.join(design, 'iso-avatar-walk-v2-source.png'));
  const prepared = await prepareCharacterSheet(source, 'iso', 'iso-avatar-walk-v2.png');
  // The front row's source has the opposite contact in column 2; put its passing pose between contacts.
  const order = { s: [0, 1, 3, 2, 4] };
  const frames = Object.fromEntries(prepared.sheet.directions.flatMap(d => Array.from({ length: 5 }, (_, i) => [`${d}${i}`, { ...characterFrame(prepared.sheet, d, order[d]?.[i] ?? i), ax: 0.5, ay: 1 }])));
  const meta = { image: 'iso-avatar-walk-v2.png', width: 640, height: 1280, source: 'codex-imagegen', slicing: 'directional-v2', animation: { idle: 0, cycle: [1, 2, 3, 4], contacts: [1, 3], passing: [2, 4] }, frames };
  const metadataPath = path.join(atlas, 'iso-avatar.json');
  if (!fs.existsSync(path.join(design, 'iso-avatar-v1.json'))) fs.copyFileSync(metadataPath, path.join(design, 'iso-avatar-v1.json'));
  fs.writeFileSync(path.join(atlas, meta.image), prepared.bytes);
  fs.writeFileSync(metadataPath, JSON.stringify(meta, null, 2) + '\n');
  console.log('Default explorer atlas:', Object.keys(frames).length, 'poses, 640×1280; old image and metadata preserved.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
