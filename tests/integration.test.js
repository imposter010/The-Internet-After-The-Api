import { describe, beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createServer } from 'node:http';
import { io as clientIo } from 'socket.io-client';
import { createProvider } from '../apps/provider/src/app.js';
import { createGateway } from '../apps/gateway/src/app.js';
import { createStore } from '../apps/gateway/src/store.js';
import { ENDPOINTS } from '@phoenix/shared';
import { mongoBinary } from '../scripts/mongo-config.mjs';
import { DriftAnalyst } from '../apps/gateway/src/llm.js';

const providerToken = 'integration-provider-token-0001';
const gatewayToken = 'integration-gateway-token-0002';
let mongo, store, provider, providerServer, gateway;
const authProvider = () => request(provider.app);
const authGateway = () => request(gateway.app);
const scenario = async (endpointId, scenarioName) => authProvider().post('/admin/scenario').set('Authorization', `Bearer ${providerToken}`).send({ endpointId, scenario: scenarioName }).expect(200);
const gatewayGet = endpoint => authGateway().get(ENDPOINTS[endpoint].path);
const snapshot = () => authGateway().get('/admin/snapshot').set('Authorization', `Bearer ${gatewayToken}`).expect(200);
const warm = async () => { for (let i = 0; i < 3; i++) for (const endpoint of Object.keys(ENDPOINTS)) await gatewayGet(endpoint).expect(200); };

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ binary: mongoBinary() });
  store = await createStore(mongo.getUri('phoenix_test'), 'encrypted-test-fixture-key');
  provider = createProvider({ token: providerToken });
  providerServer = await new Promise(done => { const server = provider.app.listen(0, '127.0.0.1', () => done(server)); });
  gateway = createGateway({ store, token: gatewayToken, providerUrl: `http://127.0.0.1:${providerServer.address().port}`, repairDelayMs: 0, timeoutMs: 1000 });
  await new Promise(done => gateway.server.listen(0, '127.0.0.1', done));
});
beforeEach(async () => { await gateway.engine.waitForIdle(); await authProvider().post('/admin/reset').set('Authorization', `Bearer ${providerToken}`).send({}); await store.reset(); });
afterAll(async () => { if (gateway) await gateway.close(); if (providerServer) await new Promise(done => providerServer.close(done)); if (store) await store.close(); if (mongo) await mongo.stop(); });

describe('real distributed repair loop', () => {
  it('learns persisted baselines from real HTTP, masks PII, and stores encrypted fixtures', async () => {
    await warm();
    const { body } = await snapshot();
    expect(body.metrics.observations).toBe(9);
    expect(body.baselines).toHaveLength(3);
    expect(body.baselines.every(b => b.samples === 3)).toBe(true);
    expect(JSON.stringify(body)).not.toContain('rahul.sharma@example.com');
    expect(JSON.stringify(body)).not.toContain('Rahul Sharma');
    expect(JSON.stringify(body)).not.toContain('encryptedFixtures');
    const baseline = await store.models.EndpointBaseline.findOne({ endpointId: 'customer' }).lean();
    expect(baseline.encryptedFixtures[0]).not.toContain('Rahul');
    expect(store.decrypt(baseline.encryptedFixtures[0]).name).toBe('Rahul Sharma');
  });

  it('detects customer rename, validates a real adapter, and restores checkout', async () => {
    await warm();
    await scenario('customer', 'rename');
    const broken = await gatewayGet('customer').expect(503);
    expect(broken.body._phoenix.safe).toBe(false);
    await gateway.engine.waitForIdle();
    const restored = await gatewayGet('customer').expect(200);
    expect(restored.body.name).toBe('Rahul Sharma');
    expect(restored.body.display_name).toBeUndefined();
    expect(restored.body._phoenix.adapted).toBe(true);
    const { body } = await snapshot();
    expect(body.passports[0].decision).toBe('activated');
    expect(body.passports[0].tests.every(t => t.passed)).toBe(true);
    expect(body.metrics.observations).toBeGreaterThan(13);
    const checkout = await authGateway().post('/api/checkout').send({ quantity: 1 }).expect(200);
    expect(checkout.body.preview.total).toBe(942.82);
  });

  it('proves hours-to-days equivalence with fresh probes before conversion', async () => {
    await warm(); await scenario('shipping', 'unit');
    await gatewayGet('shipping').expect(503);
    await gateway.engine.waitForIdle();
    const recovered = await gatewayGet('shipping').expect(200);
    expect(recovered.body.eta_days).toBe(3);
    expect(recovered.body.eta_hours).toBeUndefined();
    const { body } = await snapshot();
    expect(body.adapters[0].definition.divisor).toBe(24);
    expect(body.passports[0].tests.find(t => t.name.includes('Semantic')).detail).toContain('observed hours');
  });

  it('honors HTTP 429 Retry-After and activates only a bounded GET retry', async () => {
    await warm(); await scenario('pricing', 'rate_limit');
    await gatewayGet('pricing').expect(429);
    await gateway.engine.waitForIdle();
    const { body } = await snapshot();
    const adapter = body.adapters.find(a => a.endpointId === 'pricing');
    expect(adapter.definition).toEqual({ type: 'retry', methods: ['GET'], maxAttempts: 3, maxDelayMs: 3000 });
    // Reset the provider counter so the next gateway GET encounters a new 429.
    await scenario('pricing', 'rate_limit');
    const started = Date.now();
    const recovered = await gatewayGet('pricing').expect(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(950);
    expect(recovered.body._phoenix.adapted).toBe(true);
  });

  it('blocks same-schema price semantics and refuses approval or checkout bypass', async () => {
    await warm(); await scenario('pricing', 'semantic');
    const blocked = await gatewayGet('pricing').expect(409);
    expect(blocked.body.error).toBe('semantic_price');
    expect(blocked.body.amount).toBeUndefined();
    await authGateway().post('/api/checkout').send({ quantity: 1 }).expect(409);
    await authGateway().post(`/admin/incidents/${blocked.body.incidentId}/approve`).set('Authorization', `Bearer ${gatewayToken}`).send({}).expect(422);
    const { body } = await snapshot();
    expect(body.adapters).toHaveLength(0);
    expect(body.passports[0].decision).toBe('blocked');
    expect(body.incidents).toHaveLength(1);
    expect(body.incidents[0].impactedWorkflows.map(w => w.id)).toContain('checkout');
    await scenario('pricing', 'normal');
    await gatewayGet('pricing').expect(200);
    expect((await snapshot()).body.incidents[0].status).toBe('recovered');
  });

  it('rolls back and suppresses automatic redeployment until explicit revalidation', async () => {
    await warm(); await scenario('customer', 'rename'); await gatewayGet('customer');
    await gateway.engine.waitForIdle();
    const { body } = await snapshot();
    await authGateway().post(`/admin/adapters/${body.adapters[0].id}/rollback`).set('Authorization', `Bearer ${gatewayToken}`).send({}).expect(200);
    await gatewayGet('customer').expect(503);
    expect(gateway.engine.jobs.size).toBe(0);
    await authGateway().post(`/admin/incidents/${body.incidents[0].id}/approve`).set('Authorization', `Bearer ${gatewayToken}`).send({}).expect(202);
    await gateway.engine.waitForIdle();
    await gatewayGet('customer').expect(200);
  });

  it('refuses activation when a dependent workflow is unsafe', async () => {
    await warm(); await scenario('pricing', 'semantic'); await scenario('customer', 'rename');
    await gatewayGet('customer'); await gateway.engine.waitForIdle();
    const { body } = await snapshot();
    expect(body.adapters).toHaveLength(0);
    expect(body.passports[0].decision).toBe('blocked');
    expect(body.passports[0].tests.find(t => t.name.includes('workflows')).passed).toBe(false);
  });

  it('coordinates simultaneous supported drifts without weakening workflow checks', async () => {
    await warm(); await scenario('customer', 'rename'); await scenario('shipping', 'unit');
    await Promise.all([gatewayGet('customer'), gatewayGet('shipping')]);
    await gateway.engine.waitForIdle();
    await gatewayGet('customer').expect(200); await gatewayGet('shipping').expect(200);
    const { body } = await snapshot();
    expect(body.adapters.filter(a => a.status === 'active')).toHaveLength(2);
    expect(body.passports.every(p => p.tests.every(t => t.passed))).toBe(true);
  });

  it('never activates an adapter if its evidence passport cannot be persisted', async () => {
    await warm(); await scenario('customer', 'rename');
    const failingPassport = vi.spyOn(store.models.RepairPassport, 'create').mockRejectedValueOnce(new Error('Injected passport persistence failure'));
    try { await gatewayGet('customer'); await gateway.engine.waitForIdle(); }
    finally { failingPassport.mockRestore(); }
    await gatewayGet('customer').expect(503);
    expect((await snapshot()).body.adapters.filter(a => a.status === 'active')).toHaveLength(0);
  });

  it('enforces one active adapter per endpoint in MongoDB', async () => {
    await warm(); await scenario('customer', 'rename'); await gatewayGet('customer'); await gateway.engine.waitForIdle();
    await expect(store.models.CompatibilityAdapter.create({ id: 'duplicate-active', endpointId: 'customer', incidentId: 'other', status: 'active', definition: { type: 'alias', source: 'display_name', target: 'name' } })).rejects.toMatchObject({ code: 11000 });
  });

  it('does not redeploy a rolled-back retry policy when volatile header evidence changes', async () => {
    await warm(); await scenario('pricing', 'rate_limit'); await gatewayGet('pricing'); await gateway.engine.waitForIdle();
    const adapter = (await snapshot()).body.adapters.find(a => a.endpointId === 'pricing');
    await gateway.engine.rollback(adapter.id);
    const baseline = await gateway.engine.baseline('pricing');
    const originalCapture = gateway.engine.capture.bind(gateway.engine);
    gateway.engine.capture = async endpointId => endpointId === 'pricing' ? { status: 429, body: { error: 'rate_limit' }, headers: { 'retry-after': '2' }, latencyMs: 1 } : originalCapture(endpointId);
    try { await gatewayGet('pricing').expect(429); expect(gateway.engine.jobs.size).toBe(0); }
    finally { gateway.engine.capture = originalCapture; }
    expect((await snapshot()).body.adapters.filter(a => a.status === 'active')).toHaveLength(0);
    expect((await snapshot()).body.incidents.some(i => i.status === 'rolled_back')).toBe(true);
    expect(baseline.body.amount).toBe(799);
  });

  it('normalizes a verified single-item pagination wrapper', async () => {
    await warm(); await scenario('customer', 'pagination'); await gatewayGet('customer');
    await gateway.engine.waitForIdle();
    const restored = await gatewayGet('customer').expect(200);
    expect(restored.body.id).toBe('cust_rahul');
    expect(restored.body.data).toBeUndefined();
  });

  it('leaves a long Retry-After untouched instead of retrying before upstream permits it', async () => {
    let calls = 0;
    const upstream = createServer((req, res) => { calls++; res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '8' }); res.end(JSON.stringify({ error: 'rate_limit' })); });
    await new Promise(done => upstream.listen(0, '127.0.0.1', done));
    const original = gateway.engine.providerUrl;
    gateway.engine.providerUrl = `http://127.0.0.1:${upstream.address().port}`;
    try {
      const result = await gateway.engine.boundedRequest('pricing', { type: 'retry', methods: ['GET'], maxAttempts: 3, maxDelayMs: 3000 });
      expect(result.status).toBe(429);
      expect(calls).toBe(1);
    } finally { gateway.engine.providerUrl = original; await new Promise(done => upstream.close(done)); }
  });

  it('fails closed on timeouts and network disconnects without deploying an adapter', async () => {
    await warm();
    const upstream = createServer((req, res) => { res.on('close', () => {}); });
    await new Promise(done => upstream.listen(0, '127.0.0.1', done));
    const original = gateway.engine.providerUrl;
    gateway.engine.providerUrl = `http://127.0.0.1:${upstream.address().port}`;
    const originalTimeout = gateway.engine.timeoutMs;
    gateway.engine.timeoutMs = 100;
    try {
      const timedOut = await gatewayGet('pricing').expect(503);
      expect(timedOut.body.error).toBe('upstream_timeout');
      upstream.closeAllConnections();
      await new Promise(done => upstream.close(done));
      const disconnected = await gatewayGet('pricing').expect(503);
      expect(disconnected.body.error).toBe('upstream_unreachable');
      expect((await snapshot()).body.adapters).toHaveLength(0);
    } finally { gateway.engine.providerUrl = original; gateway.engine.timeoutMs = originalTimeout; if (upstream.listening) { upstream.closeAllConnections(); await new Promise(done => upstream.close(done)); } }
  });

  it.each([['customer', 'remove'], ['customer', 'type'], ['customer', 'default'], ['pricing', 'malformed'], ['shipping', 'type']])('holds unsupported %s/%s changes', async (endpointId, changed) => {
    await warm(); await scenario(endpointId, changed);
    const result = await gatewayGet(endpointId);
    expect(result.status).not.toBe(200);
    expect(result.body._phoenix.safe).toBe(false);
    expect((await snapshot()).body.adapters).toHaveLength(0);
  });
});

describe('authentication, isolation, and live synchronization', () => {
  it('requires distinct admin tokens and refuses ShopFlow provider access', async () => {
    await authProvider().post('/admin/scenario').send({ endpointId: 'customer', scenario: 'rename' }).expect(401);
    await authGateway().get('/admin/snapshot').expect(401);
    await authProvider().get('/admin/state').set('Authorization', `Bearer ${gatewayToken}`).expect(401);
    await authProvider().post('/admin/scenario').set('Origin', 'http://localhost:5174').set('Authorization', `Bearer ${providerToken}`).send({ endpointId: 'customer', scenario: 'rename' }).expect(403);
    await authProvider().get(ENDPOINTS.customer.path).set('Origin', 'http://localhost:5174').expect(403);
    await authGateway().get('/api/customer/rahul').set('Origin', 'https://untrusted.example').expect(403);
  });

  it('returns persisted data to a reconnected Socket.IO operator', async () => {
    await warm();
    const url = `http://127.0.0.1:${gateway.server.address().port}`;
    const socket = clientIo(url, { auth: { token: gatewayToken }, transports: ['websocket'], forceNew: true });
    try {
      const data = await new Promise((done, reject) => { socket.once('snapshot', done); socket.once('connect_error', reject); });
      expect(data.metrics.observations).toBe(9);
      expect(data.baselines).toHaveLength(3);
      const observed = new Promise(done => socket.once('api:observed', done));
      await gatewayGet('customer');
      expect((await observed).serviceId).toBe('customer-api');
    } finally { socket.disconnect(); }
  });

  it('retains baselines, active repairs, and passports across gateway restart', async () => {
    await warm(); await scenario('customer', 'rename'); await gatewayGet('customer'); await gateway.engine.waitForIdle();
    await gateway.close();
    gateway = createGateway({ store, token: gatewayToken, providerUrl: `http://127.0.0.1:${providerServer.address().port}`, repairDelayMs: 0 });
    await new Promise(done => gateway.server.listen(0, '127.0.0.1', done));
    await gatewayGet('customer').expect(200);
    expect((await snapshot()).body.passports[0].decision).toBe('activated');
  });

  it('resumes a persisted interrupted proposal by rerunning real validation', async () => {
    await warm(); await scenario('customer', 'rename');
    const start = vi.spyOn(gateway.engine, 'startRepair').mockImplementation(() => undefined);
    await gatewayGet('customer').expect(503);
    start.mockRestore();
    await gateway.close();
    gateway = createGateway({ store, token: gatewayToken, providerUrl: `http://127.0.0.1:${providerServer.address().port}`, repairDelayMs: 0 });
    await gateway.ready;
    await new Promise(done => gateway.server.listen(0, '127.0.0.1', done));
    await gateway.engine.waitForIdle();
    await gatewayGet('customer').expect(200);
    expect((await snapshot()).body.passports[0].decision).toBe('activated');
  });
});

// Real local HTTP transport with simulated completions; these are not real-model evals.
async function withAnalyst(output, callback, status = 200) {
  const calls = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const context = JSON.parse(body.messages[1].content);
    calls.push({ body, context, headers: req.headers });
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(status === 200 ? { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output(context)) } }] } : { error: 'simulated-model-outage' }));
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const original = gateway.engine.analyst;
  gateway.engine.analyst = new DriftAnalyst({ url: `http://127.0.0.1:${server.address().port}/v1/chat/completions`, model: 'simulated-model', key: 'test-llm-private-key', timeoutMs: 1000 });
  try { await callback(calls); }
  finally {
    await gateway.engine.waitForIdle();
    gateway.engine.analyst = original;
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
}
const modelAnalysis = context => ({ explanation: 'Observed evidence supports this restricted candidate; live validation is still required.',
  hinglishExplanation: 'Observed change ke liye allowed repair mila hai; activate karne se pehle tests zaroori hain.',
  recommendedAction: context.evidencedCandidate ? 'apply_candidate' : 'manual_review', risk: context.evidencedCandidate ? 'low' : 'high',
  adapter: context.evidencedCandidate, verificationNotes: ['Confirm the client contract and checkout requirements.'] });

describe('LLM-assisted repair with real local HTTP and MongoDB', () => {
  it('records model guidance and activates only after independent validation', async () => {
    await warm();
    await withAnalyst(modelAnalysis, async calls => {
      await scenario('customer', 'rename'); await gatewayGet('customer').expect(503);
      await gateway.engine.waitForIdle();
      await gatewayGet('customer').expect(200);
      const { body } = await snapshot();
      expect(body.aiMode).toBe('llm-assisted');
      expect(body.llm).toMatchObject({ configured: true, status: 'completed', model: 'simulated-model' });
      expect(body.incidents[0].aiAnalysis.candidateAccepted).toBe(true);
      expect(body.passports[0]).toMatchObject({ decision: 'activated', aiAnalysis: { status: 'completed' } });
      expect(body.passports[0].tests).toHaveLength(7);
      expect(body.passports[0].tests.every(test => test.passed)).toBe(true);
      expect(body.proposals[0].aiExplanation).toContain('Observed evidence');
      expect(calls).toHaveLength(1);
      expect(calls[0].headers.authorization).toBe('Bearer test-llm-private-key');
      expect(JSON.stringify(calls[0].context)).not.toMatch(/Rahul Sharma|rahul.sharma@example.com/);
      expect(JSON.stringify(body)).not.toContain('test-llm-private-key');
    });
  });

  it('honors a valid model abstention without deploying an otherwise eligible adapter', async () => {
    await warm();
    await withAnalyst(context => ({ ...modelAnalysis(context), recommendedAction: 'manual_review', risk: 'unknown', adapter: null }), async () => {
      await scenario('customer', 'rename'); await gatewayGet('customer'); await gateway.engine.waitForIdle();
      const { body } = await snapshot();
      expect(body.adapters).toHaveLength(0);
      expect(body.passports[0].decision).toBe('blocked');
      expect(body.passports[0].tests.find(test => test.name === 'LLM candidate review').passed).toBe(false);
      await gatewayGet('customer').expect(503);
    });
  });

  it('rejects a hallucinated adapter and uses only the evidenced deterministic fallback', async () => {
    await warm();
    await withAnalyst(context => ({ ...modelAnalysis(context), adapter: { type: 'alias', source: 'email', target: 'name' } }), async () => {
      await scenario('customer', 'rename'); await gatewayGet('customer'); await gateway.engine.waitForIdle();
      const { body } = await snapshot();
      expect(body.passports[0]).toMatchObject({ decision: 'activated', aiAnalysis: { status: 'rejected', fallbackUsed: true } });
      expect(body.adapters[0].definition).toEqual({ type: 'alias', source: 'display_name', target: 'name' });
      expect(body.passports[0].tests.every(test => test.passed)).toBe(true);
    });
  });

  it('falls back on model outages without inventing an AI explanation', async () => {
    await warm();
    await withAnalyst(modelAnalysis, async () => {
      await scenario('shipping', 'unit'); await gatewayGet('shipping'); await gateway.engine.waitForIdle();
      await gatewayGet('shipping').expect(200);
      const { body } = await snapshot();
      expect(body.llm.status).toBe('unavailable');
      expect(body.passports[0]).toMatchObject({ decision: 'activated', aiAnalysis: { status: 'unavailable', reason: 'http_503', fallbackUsed: true } });
      expect(body.proposals[0].aiExplanation).toBeNull();
    }, 503);
  });

  it('analyzes unsafe pricing once and keeps checkout and approval blocked', async () => {
    await warm();
    await withAnalyst(modelAnalysis, async calls => {
      await scenario('pricing', 'semantic');
      const blocked = await gatewayGet('pricing').expect(409); await gateway.engine.waitForIdle();
      await gatewayGet('pricing').expect(409);
      await authGateway().post('/api/checkout').send({ quantity: 1 }).expect(409);
      await authGateway().post(`/admin/incidents/${blocked.body.incidentId}/approve`).set('Authorization', `Bearer ${gatewayToken}`).send({}).expect(422);
      const { body } = await snapshot();
      expect(calls).toHaveLength(1);
      expect(calls[0].context).toMatchObject({ automaticRepairEligible: false, evidencedCandidate: null });
      expect(body.passports[0]).toMatchObject({ decision: 'blocked', aiAnalysis: { status: 'completed', adapter: null, recommendedAction: 'manual_review' } });
      expect(body.adapters).toHaveLength(0);
    });
  });

  it('never lets model corroboration override a failing dependent workflow', async () => {
    await warm();
    await withAnalyst(modelAnalysis, async () => {
      await scenario('pricing', 'semantic'); await scenario('customer', 'rename');
      await gatewayGet('customer'); await gateway.engine.waitForIdle();
      const { body } = await snapshot();
      expect(body.adapters).toHaveLength(0);
      expect(body.passports[0]).toMatchObject({ decision: 'blocked', aiAnalysis: { candidateAccepted: true } });
      expect(body.passports[0].tests.find(test => test.name.includes('workflows')).passed).toBe(false);
    });
  });
});
