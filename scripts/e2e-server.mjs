import { resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createServer as createVite } from 'vite';
import { createProvider } from '../apps/provider/src/app.js';
import { createGateway } from '../apps/gateway/src/app.js';
import { createStore } from '../apps/gateway/src/store.js';
import { mongoBinary } from './mongo-config.mjs';

const mongo = await MongoMemoryServer.create({ binary: mongoBinary() });
const store = await createStore(mongo.getUri('phoenix_e2e'), 'e2e-data-fixture-secret');
const provider = createProvider({ token: 'e2e-provider-admin-token', origins: ['http://127.0.0.1:8001', 'http://127.0.0.1:5173'] });
const providerServer = await new Promise(done => { const server = provider.app.listen(8001, '127.0.0.1', () => done(server)); });
const gateway = createGateway({ store, providerUrl: 'http://127.0.0.1:8001', token: 'e2e-gateway-admin-token', repairDelayMs: 600 });
const dashboard = await createVite({ root: resolve('apps/console'), server: { host: '127.0.0.1', port: 5173, strictPort: true } });
const shopflow = await createVite({ root: resolve('apps/shopflow'), server: { host: '127.0.0.1', port: 5174, strictPort: true } });
await dashboard.listen(); await shopflow.listen();
await new Promise(done => gateway.server.listen(8000, '127.0.0.1', done));
console.log('E2E services ready at :8000, :8001, :5173, :5174');
const stop = async () => {
  await Promise.all([dashboard.close(), shopflow.close()]);
  await gateway.close();
  await new Promise(done => providerServer.close(done));
  await store.close(); await mongo.stop(); process.exit(0);
};
process.on('SIGINT', stop); process.on('SIGTERM', stop);
