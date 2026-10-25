const requireFunction = require("node:module").createRequire(require("node:path").resolve(__dirname, "../../functions/package.json"));
// Local-only integration test server; a demo project prevents access to real data.
process.env.GCLOUD_PROJECT = 'demo-jamworld';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FUNCTIONS_EMULATOR = 'true';
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
if (process.env.JAMWORLD_TEST_IMAGES === '1') {
  process.env.OPENAI_API_KEY = 'emulator-test-no-network';
  require('../../functions/lib/jamworld/lib/server/workshop/image-provider').OpenAIImages.prototype.create = async () => { throw new Error('Local tests must run their explicit fake image provider'); };
}
const { initializeApp } = requireFunction('firebase-admin/app');
initializeApp({ projectId: 'demo-jamworld', storageBucket: 'demo-jamworld.appspot.com' });
const express = requireFunction('express');
const { jamworldApi } = require('../../functions/lib/jamworld');
const app = express();
// CLI bridge tests use the real read-only MCP handler against the demo database.
const { mcp } = require('../../functions/lib/mcp');
const mcpJson = express.json({ limit: '5mb' });
app.use((req, res, next) => {
  if (!/^\/(mcp(?:\/|$)|oauth\/|\.well-known\/)/.test(req.path)) return next();
  return mcpJson(req, res, () => mcp(req, res));
});
app.use('/api/jamworld', express.raw({ type: () => true, limit: '5mb' }), (req, res) => { req.rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0); return jamworldApi(req, res); });
app.use(express.static(require('path').resolve(__dirname, '../../out')));
app.listen(5000, '127.0.0.1', () => console.log('Jamworld emulator preview: http://127.0.0.1:5000/jamworldmake/'));
