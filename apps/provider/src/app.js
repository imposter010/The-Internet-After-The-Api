import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { ENDPOINTS, mask } from '@phoenix/shared';
import { corsFor, requireToken, errors } from '@phoenix/shared/http';

export const SCENARIOS = [
  ['customer', 'normal', 'Healthy customer', 'Original customer contract.', 'safe'],
  ['customer', 'rename', 'Rename customer field', 'name becomes display_name.', 'repairable'],
  ['customer', 'remove', 'Remove required email', 'Email is removed from the response.', 'blocked'],
  ['customer', 'type', 'Change customer type', 'name becomes a structured object.', 'blocked'],
  ['customer', 'default', 'Change membership default', 'Gold membership silently becomes standard.', 'review'],
  ['customer', 'pagination', 'Wrap response in pagination', 'A single customer moves inside a data array.', 'repairable'],
  ['customer', 'http_error', 'Change HTTP behavior', 'Customer API returns a 503 error.', 'blocked'],
  ['shipping', 'normal', 'Healthy shipping', 'Delivery estimate is expressed in days.', 'safe'],
  ['shipping', 'unit', 'Convert delivery units', 'eta_days: 3 becomes eta_hours: 72.', 'repairable'],
  ['shipping', 'rename', 'Rename delivery field', 'eta_days becomes delivery_days.', 'repairable'],
  ['shipping', 'type', 'Change estimate type', 'eta_days becomes a string.', 'blocked'],
  ['pricing', 'normal', 'Healthy pricing', 'Price is ₹799, expressed in rupees.', 'safe'],
  ['pricing', 'semantic', 'Undocumented price magnitude', 'amount jumps to 79,900 with the same JSON shape.', 'unsafe'],
  ['pricing', 'rate_limit', 'Introduce HTTP 429', 'Transient throttling returns Retry-After: 1.', 'repairable'],
  ['pricing', 'http_error', 'Change HTTP error', 'Pricing API returns a 502 error.', 'blocked'],
  ['pricing', 'malformed', 'Malformed response', 'Pricing returns an invalid JSON document.', 'blocked'],
].map(([endpointId, id, label, description, safety]) => ({ endpointId, id, label, description, safety }));

export function createProvider({ token, origins = ['http://localhost:8001', 'http://127.0.0.1:8001'] } = {}) {
  const app = express();
  const state = { active: { customer: 'normal', pricing: 'normal', shipping: 'normal' }, requests: 0, counts: {}, log: [] };
  const addLog = item => { state.log.unshift({ ...item, at: new Date().toISOString() }); state.log = state.log.slice(0, 60); };
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { 'connect-src': ["'self'", ...origins], 'script-src': ["'self'"], 'img-src': ["'self'", 'data:'], 'style-src': ["'self'", "'unsafe-inline'"], 'upgrade-insecure-requests': null } } }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'external-provider' }));
  app.use('/admin', corsFor(origins), requireToken(token));
  app.get('/admin/state', (req, res) => res.json({ ...state, scenarios: SCENARIOS }));
  app.post('/admin/scenario', (req, res) => {
    const parsed = z.object({ endpointId: z.enum(['customer', 'pricing', 'shipping']), scenario: z.string() }).strict().safeParse(req.body);
    if (!parsed.success || !SCENARIOS.some(s => s.endpointId === parsed.data.endpointId && s.id === parsed.data.scenario)) return res.status(400).json({ error: 'invalid_scenario' });
    state.active[parsed.data.endpointId] = parsed.data.scenario;
    state.counts[parsed.data.endpointId] = 0;
    addLog({ type: 'change', endpointId: parsed.data.endpointId, scenario: parsed.data.scenario });
    res.json({ ok: true, active: state.active });
  });
  app.post('/admin/reset', (req, res) => {
    state.active = { customer: 'normal', pricing: 'normal', shipping: 'normal' };
    state.counts = {};
    addLog({ type: 'reset' });
    res.json({ ok: true });
  });

  for (const endpoint of Object.values(ENDPOINTS)) {
    app.get(endpoint.path, (req, res) => {
      // Browser-origin requests are refused: only server-to-server gateway HTTP
      // may read these APIs. The provider console uses the authenticated admin API.
      if (req.headers.origin) return res.status(403).json({ error: 'server_access_only' });
      const id = endpoint.id;
      const scenario = state.active[id];
      state.requests++;
      state.counts[id] = (state.counts[id] || 0) + 1;
      let body;
      if (id === 'customer') body = { id: 'cust_rahul', name: 'Rahul Sharma', email: 'rahul.sharma@example.com', tier: 'gold' };
      if (id === 'pricing') body = { product_id: 'phoenix-pro', product_name: 'Arc One wireless headphones', amount: 799, currency: 'INR', unit: 'rupees', tax_percent: 18 };
      if (id === 'shipping') body = { order_id: 'demo-order', carrier: 'Nimbus Express', eta_days: 3, destination: 'Bengaluru' };
      let status = 200;
      if (id === 'customer' && scenario === 'rename') { body.display_name = body.name; delete body.name; }
      if (id === 'customer' && scenario === 'remove') delete body.email;
      if (id === 'customer' && scenario === 'type') body.name = { first: 'Rahul', last: 'Sharma' };
      if (id === 'customer' && scenario === 'default') body.tier = 'standard';
      if (id === 'customer' && scenario === 'pagination') body = { data: [body], pagination: { page: 1, total: 1 } };
      if (id === 'shipping' && scenario === 'unit') { body.eta_hours = body.eta_days * 24; delete body.eta_days; }
      if (id === 'shipping' && scenario === 'rename') { body.delivery_days = body.eta_days; delete body.eta_days; }
      if (id === 'shipping' && scenario === 'type') body.eta_days = String(body.eta_days);
      if (id === 'pricing' && scenario === 'semantic') body.amount *= 100;
      if (scenario === 'http_error') { status = id === 'pricing' ? 502 : 503; body = { error: 'temporarily_unavailable', message: 'The upstream API cannot serve this request.' }; }
      if (id === 'pricing' && scenario === 'rate_limit' && state.counts[id] % 4 === 1) {
        status = 429;
        res.set('Retry-After', '1');
        body = { error: 'rate_limit_exceeded', message: 'Rate limit reached. Retry after one second.' };
      }
      if (id === 'pricing' && scenario === 'malformed') {
        addLog({ type: 'request', endpointId: id, status: 200, response: '[invalid JSON]' });
        return res.type('application/json').send('{"amount":');
      }
      addLog({ type: 'request', endpointId: id, status, response: mask(body) });
      res.status(status).json(body);
    });
  }
  const consoleDir = fileURLToPath(new URL('../../console/dist/', import.meta.url));
  app.use(express.static(consoleDir));
  app.get(['/', '/provider'], (req, res) => res.sendFile(`${consoleDir}/index.html`));
  app.use((req, res) => res.status(404).json({ error: 'not_found' }));
  app.use(errors);
  return { app, state };
}
