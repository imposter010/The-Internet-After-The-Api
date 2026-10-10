import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parse } from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createServer as createVite } from 'vite';
import { createProvider } from '../apps/provider/src/app.js';
import { createGateway } from '../apps/gateway/src/app.js';
import { createStore } from '../apps/gateway/src/store.js';
import { mongoBinary } from './mongo-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const cache = resolve(root, '.cache');
await mkdir(cache, { recursive: true });
const loadEnv = async path => { try { return parse(await readFile(resolve(root, path))); } catch { return {}; } };
const providerEnv = { ...await loadEnv('apps/provider/.env'), ...process.env };
const gatewayEnv = { ...await loadEnv('apps/gateway/.env'), ...process.env };
const secretFile = resolve(cache, 'dev-secrets.json');
let secrets;
try { secrets = JSON.parse(await readFile(secretFile, 'utf8')); }
catch { secrets = { providerToken: randomBytes(24).toString('hex'), gatewayToken: randomBytes(24).toString('hex'), dataKey: randomBytes(32).toString('hex') }; await writeFile(secretFile, JSON.stringify(secrets, null, 2), { mode: 0o600 }); }
const providerToken = providerEnv.PROVIDER_ADMIN_TOKEN || secrets.providerToken;
const gatewayToken = gatewayEnv.GATEWAY_ADMIN_TOKEN || secrets.gatewayToken;
// npm is bundled next to node, including the portable Windows runtime.
const npmCli = process.env.npm_execpath || resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const runBuild = () => new Promise((done, reject) => {
  const child = spawn(process.execPath, [npmCli, 'run', 'build'], { cwd: root, stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? done() : reject(new Error('Run npm run build before starting the local demo.')));
});
try { await access(resolve(root, 'apps/console/dist/index.html')); }
catch { await runBuild(); }

let mongo;
let uri = gatewayEnv.MONGODB_URI;
if (!uri) {
  const dbPath = resolve(cache, 'mongo-data');
  await mkdir(dbPath, { recursive: true });
  mongo = await MongoMemoryServer.create({ binary: mongoBinary(), instance: { port: 27017, dbPath, storageEngine: 'wiredTiger', dbName: 'api_phoenix' } });
  uri = mongo.getUri('api_phoenix');
  console.log('Development MongoDB is running with persistent storage at .cache/mongo-data.');
}
const host = process.env.HOST || '127.0.0.1';
const store = await createStore(uri, gatewayEnv.GATEWAY_DATA_KEY || secrets.dataKey);
const provider = createProvider({ token: providerToken, origins: (providerEnv.PROVIDER_CONSOLE_ORIGINS || 'http://localhost:8001,http://127.0.0.1:8001,http://localhost:5173,http://127.0.0.1:5173').split(',') });
const providerServer = await new Promise(done => { const server = provider.app.listen(8001, host, () => done(server)); });
const gateway = createGateway({ store, token: gatewayToken, providerUrl: gatewayEnv.PROVIDER_URL || 'http://127.0.0.1:8001', dashboardOrigins: (gatewayEnv.DASHBOARD_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(','), clientOrigins: (gatewayEnv.CLIENT_ORIGINS || 'http://localhost:5174,http://127.0.0.1:5174').split(','), llm: { url: gatewayEnv.LLM_URL, key: gatewayEnv.LLM_API_KEY, model: gatewayEnv.LLM_MODEL } });
await new Promise(done => gateway.server.listen(8000, host, done));
const dashboard = await createVite({ root: resolve(root, 'apps/console'), server: { host, port: 5173, strictPort: true } });
const shopflow = await createVite({ root: resolve(root, 'apps/shopflow'), server: { host, port: 5174, strictPort: true } });
await dashboard.listen();
await shopflow.listen();
console.log('\nAPI Phoenix is ready.\nProvider:  http://localhost:8001/provider\nDashboard: http://localhost:5173\nShopFlow:  http://localhost:5174\nOperator tokens are in .cache/dev-secrets.json (or your configured service .env).\n');
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await Promise.all([dashboard.close(), shopflow.close()]);
  await gateway.close();
  await new Promise(done => providerServer.close(done));
  await store.close();
  if (mongo) await mongo.stop({ doCleanup: false });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
