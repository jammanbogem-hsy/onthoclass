// Opt-in small live-provider smoke test. No secrets are printed or saved.
const assert = require('node:assert/strict');
const { assistCard } = require('../../functions/lib/jamworld/lib/agent/assist');
const { OpenAIImages } = require('../../functions/lib/jamworld/lib/server/workshop/image-provider');
(async () => {
  if (!process.env.OPENAI_API_KEY) throw new Error('A server API key is required');
  const card = await assistCard({ OPENAI_API_KEY: process.env.OPENAI_API_KEY }, [{ role: 'user', text: '월드에 놓을 파란색 별무늬 바닥을 만들고 싶어요. 제작 카드를 제안해주세요.' }], AbortSignal.timeout(60000), 'openai');
  assert.ok(card.reply); assert.ok(card.card); console.log('Live assistant: reply + creation card passed');
  const provider = new OpenAIImages(process.env.OPENAI_API_KEY, 'gpt-image-2.5-flare');
  const image = await provider.create({ prompt: 'A single square seamless game floor texture, soft blue with small pale yellow stars. Top down orthographic, clean cartoon style, flat colors, no text, no frame.', background: 'opaque' });
  assert.ok(image.bytes.length > 100); assert.equal(image.contentType, 'image/webp');
  console.log('Live image generation: WebP bytes + usage received', image.bytes.length, 'bytes');
})().catch(e => { console.error('Live provider test failed:', e.status || e.name, e.message?.replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]')); process.exitCode = 1; });
