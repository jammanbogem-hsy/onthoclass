// Repack an explicitly supplied corrected canonical sheet. No image/model calls.
// Without --apply this only prepares local files and a reviewable manifest.
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const req = require('node:module').createRequire(path.join(root, 'functions/package.json'));
const sharp = req('sharp');
const { prepareCharacterSheet } = require('../../functions/lib/jamworld/lib/server/workshop/character-images');

(async () => {
  const { values: v } = parseArgs({ options: { project: { type: 'string' }, asset: { type: 'string' }, source: { type: 'string' }, output: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  if (!v.project || !/^[a-z0-9-]+$/.test(v.project) || !/^ast_[A-Za-z0-9_-]+$/.test(v.asset || '') || !v.source || !v.output) throw Error('Use --project ID --asset ID --source canonical-5-rows.png --output DIR [--apply]');
  const response = await fetch(`https://${v.project}.web.app/api/jamworld/workshop/catalog`);
  if (!response.ok) throw Error('Cannot read the published catalog');
  const asset = (await response.json()).assets.find(a => a.id === v.asset);
  if (asset?.category !== 'character' || asset.appearance.kind !== 'views') throw Error('Select a published character asset');
  const original = fs.readFileSync(v.source), hash = createHash('sha256').update(original).digest('hex').slice(0, 12);
  const base = path.posix.dirname(asset.appearance.iso), version = `direction-v3-${hash}`;
  if (!/^cls\/[^/]+\/gen\/[^/]+$/.test(base)) throw Error('Unexpected saved asset path');
  const output = path.resolve(v.output); fs.mkdirSync(output, { recursive: true });
  const iso = await prepareCharacterSheet(original, 'iso', `${base}/${version}-iso-sprite.png`, 5, 'canonical');
  // Both views use the same corrected front/profile/back identity. Select cardinal source rows.
  const meta = await sharp(original).metadata(), rh = Math.floor(meta.height / 5);
  const cardinal = await Promise.all([0, 2, 4].map(async (row, index) => ({ input: await sharp(original).extract({ left: 0, top: row * rh, width: meta.width, height: rh }).png().toBuffer(), left: 0, top: index * rh })));
  const tdSource = await sharp({ create: { width: meta.width, height: rh * 3, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(cardinal).png().toBuffer();
  const td = await prepareCharacterSheet(tdSource, 'td', `${base}/${version}-td-sprite.png`, 5, 'canonical');
  const appearance = { kind: 'views', td: `${base}/${version}-td.webp`, iso: `${base}/${version}-iso.webp`, sprites: { td: td.sheet, iso: iso.sheet } };
  const manifest = { ...asset, appearance }; delete manifest.urls;
  const files = [
    { key: td.sheet.image, bytes: td.bytes, type: 'image/png', local: 'td-sprite.png' },
    { key: iso.sheet.image, bytes: iso.bytes, type: 'image/png', local: 'iso-sprite.png' },
    { key: appearance.td, bytes: td.preview, type: 'image/webp', local: 'td.webp' },
    { key: appearance.iso, bytes: iso.preview, type: 'image/webp', local: 'iso.webp' },
  ];
  for (const file of files) fs.writeFileSync(path.join(output, file.local), file.bytes);
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ prepared: true, asset: v.asset, output, version, apply: v.apply }));
  if (!v.apply) return;
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw Error('Do not mix production repair with emulator state');
  const auth = require('firebase-tools/lib/auth'), { requireAuth } = require('firebase-tools/lib/requireAuth');
  const options = { project: v.project, nonInteractive: true };
  auth.setActiveAccount(options, auth.getProjectDefaultAccount(root)); await requireAuth(options);
  const env = fs.readFileSync(path.join(root, '.env.local'), 'utf8');
  const bucket = /^NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=["']?([^\s"']+)/m.exec(env)?.[1];
  if (!bucket || !bucket.startsWith(v.project + '.')) throw Error('Storage project mismatch');
  const { Client } = require('firebase-tools/lib/apiv2');
  const db = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1', auth: true });
  const ref = `projects/${v.project}/databases/(default)/documents/jamworldLibrary/${v.asset}`;
  const before = (await db.get(ref, { skipLog: { resBody: true } })).body;
  if (before.fields?.removedAt?.integerValue) throw Error('Asset is no longer published');
  const old = before.fields?.manifest?.stringValue, saved = JSON.parse(old);
  if (JSON.stringify(saved.appearance) !== JSON.stringify(asset.appearance)) throw Error('Published appearance changed concurrently; prepare again');
  try { fs.writeFileSync(path.join(output, 'original-manifest.json'), old, { mode: 0o600, flag: 'wx' }); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
  const storage = new Client({ urlPrefix: 'https://storage.googleapis.com', auth: true });
  for (const file of files) {
    const object = 'jamworld/' + file.key;
    try { await storage.request({ method: 'POST', path: `/upload/storage/v1/b/${bucket}/o`, queryParams: { uploadType: 'media', name: object, ifGenerationMatch: 0 }, body: require('node:stream').Readable.from([file.bytes]), headers: { 'Content-Type': file.type }, skipLog: { body: true, resBody: true }, retries: 0 }); }
    catch (e) {
      if (e.status !== 412) throw e;
      const info = (await storage.get(`/storage/v1/b/${bucket}/o/${encodeURIComponent(object)}`, { skipLog: { resBody: true } })).body;
      if (info.md5Hash !== createHash('md5').update(file.bytes).digest('base64')) throw Error('An immutable repair output already exists with different bytes');
    }
  }
  await db.patch(ref, { fields: { manifest: { stringValue: JSON.stringify({ ...saved, appearance }) } } }, { queryParams: { 'updateMask.fieldPaths': 'manifest', 'currentDocument.updateTime': before.updateTime }, skipLog: { body: true, resBody: true } });
  console.log(JSON.stringify({ published: true, asset: v.asset, originalPreserved: true, newImageCalls: 0 }));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
