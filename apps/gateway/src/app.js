import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Server } from 'socket.io';
import { z } from 'zod';
import { ENDPOINTS } from '@phoenix/shared';
import { corsFor, requireToken, allowOrigins, errors } from '@phoenix/shared/http';
import { PhoenixEngine } from './engine.js';

export function createGateway({ store, providerUrl, token, dashboardOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'], clientOrigins = ['http://localhost:5174', 'http://127.0.0.1:5174'], timeoutMs, repairDelayMs, llm = {} }) {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, { cors: { origin: allowOrigins(dashboardOrigins) }, connectionStateRecovery: { maxDisconnectionDuration: 120000, skipMiddlewares: false } });
  const engine = new PhoenixEngine({ store, providerUrl, timeoutMs, repairDelayMs, llm, emit: (...args) => io.emit(...args) });
  const ready = engine.resumeInterrupted();
  const auth = requireToken(token);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '16kb' }));
  app.use(async (req, res, next) => { await ready; next(); });
  app.get('/health', corsFor([...dashboardOrigins, ...clientOrigins]), (req, res) => res.status(store.connection.readyState === 1 ? 200 : 503).json({ service: 'api-phoenix', status: store.connection.readyState === 1 ? 'ok' : 'database_unavailable', persistence: 'mongodb' }));
  app.use('/admin', corsFor(dashboardOrigins), auth);
  const snapshot = async () => ({ ...await store.snapshot(), aiMode: engine.analyst.describe().configured ? 'llm-assisted' : 'deterministic', llm: engine.analyst.describe() });
  app.get('/admin/snapshot', async (req, res) => res.json(await snapshot()));
  app.post('/admin/probe', async (req, res) => {
    const results = [];
    for (let round = 0; round < 3; round++) for (const endpoint of Object.keys(ENDPOINTS)) results.push({ endpointId: endpoint, ...await engine.get(endpoint) });
    res.json({ message: 'Nine actual upstream requests observed.', results });
  });
  app.post('/admin/reset', async (req, res) => {
    if (req.body?.confirm !== 'RESET') return res.status(400).json({ error: 'reset_confirmation_required' });
    if (engine.jobs.size || engine.locks.size) return res.status(409).json({ error: 'operations_in_progress', message: 'Wait for current observation and validation operations to finish.' });
    await store.reset();
    res.json({ ok: true });
  });
  app.post('/admin/incidents/:id/approve', async (req, res) => { const result = await engine.approve(req.params.id); res.status(result.status).json(result); });
  app.post('/admin/incidents/:id/decision', async (req, res) => {
    const parsed = z.object({ decision: z.enum(['accept_for_manual_work', 'reject_provider_change']) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_review_decision' });
    const result = await engine.reviewMajor(req.params.id, parsed.data.decision);
    res.status(result.status).json(result);
  });
  app.post('/admin/adapters/:id/rollback', async (req, res) => { const result = await engine.rollback(req.params.id); res.status(result.status).json(result); });
  app.use('/api', corsFor([...clientOrigins, ...dashboardOrigins]));
  for (const endpoint of Object.values(ENDPOINTS)) app.get(endpoint.path, async (req, res) => {
    if (store.connection.readyState !== 1) return res.status(503).json({ error: 'database_unavailable', message: 'Observation evidence cannot be persisted. Please retry.', _phoenix: { safe: false } });
    const result = await engine.get(endpoint.id);
    if (result.retryAfter) res.set('Retry-After', result.retryAfter);
    res.set('Cache-Control', 'no-store').status(result.status).json(result.body);
  });
  app.post('/api/checkout', async (req, res) => {
    const parsed = z.object({ quantity: z.number().int().min(1).max(10) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_quantity' });
    const [customer, pricing, shipping] = await Promise.all(Object.keys(ENDPOINTS).map(endpointId => engine.get(endpointId)));
    if ([customer, pricing, shipping].some(r => r.status !== 200 || !r.body._phoenix?.safe)) return res.status(409).json({ error: 'checkout_blocked', message: 'Checkout is held until every dependency passes its observed contract.' });
    const amount = pricing.body.amount * parsed.data.quantity;
    const tax = Math.round(amount * pricing.body.tax_percent) / 100;
    res.json({ preview: { customer: customer.body.name, amount, tax, total: Math.round((amount + tax) * 100) / 100, currency: pricing.body.currency, etaDays: shipping.body.eta_days }, message: 'Verified preview only. No payment has been charged.' });
  });
  app.use((req, res) => res.status(404).json({ error: 'not_found' }));
  app.use(errors);
  io.use((socket, next) => {
    const provided = Buffer.from(typeof socket.handshake.auth.token === 'string' ? socket.handshake.auth.token : '');
    const expected = Buffer.from(token);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return next(new Error('unauthorized'));
    next();
  });
  io.on('connection', async socket => {
    try { socket.emit('snapshot', await snapshot()); }
    catch { socket.emit('sync:error', { message: 'Persistent records are unavailable. Reconnect to synchronize.' }); }
  });
  const close = async () => { await engine.close(); await new Promise(resolve => io.close(resolve)); if (server.listening) await new Promise(resolve => server.close(resolve)); };
  return { app, server, io, engine, ready, close };
}
