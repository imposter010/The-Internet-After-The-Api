import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { ENDPOINTS, mask } from '@phoenix/shared';
import { corsFor, requireToken, errors } from '@phoenix/shared/http';

const scenario = (endpointId, id, label, description, safety, change, expected) => ({ endpointId, id, label, description, safety, change, expected });

export const SCENARIOS = [
  scenario('customer', 'normal', 'Healthy response', 'Original customer contract.', 'safe', 'No contract change', 'No repair needed'),
  scenario('customer', 'rename', 'Rename name field', 'name becomes display_name.', 'repairable', 'One field renamed', 'Alias adapter'),
  scenario('customer', 'rename_email', 'Rename email field', 'email becomes email_address.', 'repairable', 'One field renamed', 'Alias adapter'),
  scenario('customer', 'rename_tier', 'Rename membership field', 'tier becomes membership_tier.', 'repairable', 'One field renamed', 'Alias adapter'),
  scenario('customer', 'pagination', 'Add response wrapper', 'The customer moves inside a one-item data array.', 'repairable', 'Response wrapped', 'Unwrap adapter'),
  scenario('customer', 'rate_limit', 'Temporary rate limit', 'Every fourth cycle starts with a real HTTP 429.', 'repairable', 'HTTP behavior changed', 'Bounded retry'),
  scenario('customer', 'remove', 'Remove required email', 'Email is removed from the response.', 'blocked', 'Required field removed', 'Manual review'),
  scenario('customer', 'type', 'Change name type', 'name becomes a structured object.', 'blocked', 'JSON type changed', 'Manual review'),
  scenario('customer', 'default', 'Change membership meaning', 'Gold membership silently becomes standard.', 'review', 'Business meaning changed', 'Manual review'),
  scenario('customer', 'http_error', 'Provider unavailable', 'Customer API returns a real HTTP 503.', 'blocked', 'HTTP failure', 'Manual recovery'),

  scenario('pricing', 'normal', 'Healthy response', 'Original price in INR and rupees.', 'safe', 'No contract change', 'No repair needed'),
  scenario('pricing', 'rename_product', 'Rename product name', 'product_name becomes display_name.', 'repairable', 'One field renamed', 'Alias adapter'),
  scenario('pricing', 'rename_tax', 'Rename tax field', 'tax_percent becomes tax_rate_percent.', 'repairable', 'One field renamed', 'Alias adapter'),
  scenario('pricing', 'pagination', 'Add response wrapper', 'The price moves inside a one-item data array.', 'repairable', 'Response wrapped', 'Unwrap adapter'),
  scenario('pricing', 'rate_limit', 'Temporary rate limit', 'Every fourth cycle starts with a real HTTP 429.', 'repairable', 'HTTP behavior changed', 'Bounded retry'),
  scenario('pricing', 'semantic', 'Change price meaning', 'amount becomes 100 times larger with the same JSON shape.', 'unsafe', 'Business value changed', 'Manual review'),
  scenario('pricing', 'http_error', 'Provider unavailable', 'Pricing API returns a real HTTP 502.', 'blocked', 'HTTP failure', 'Manual recovery'),
  scenario('pricing', 'malformed', 'Break JSON response', 'Pricing returns an invalid JSON document.', 'blocked', 'Invalid JSON', 'Manual recovery'),

  scenario('shipping', 'normal', 'Healthy response', 'Original delivery contract expressed in days.', 'safe', 'No contract change', 'No repair needed'),
  scenario('shipping', 'rename', 'Rename delivery estimate', 'eta_days becomes delivery_days.', 'repairable', 'One field renamed', 'Alias adapter'),
  scenario('shipping', 'rename_carrier', 'Rename carrier field', 'carrier becomes carrier_name.', 'repairable', 'One field renamed', 'Alias adapter'),
  scenario('shipping', 'rename_destination', 'Rename destination field', 'destination becomes delivery_destination.', 'repairable', 'One field renamed', 'Alias adapter'),
  scenario('shipping', 'unit', 'Convert days to hours', 'eta_days: 3 becomes eta_hours: 72.', 'repairable', 'Unit and field changed', 'Unit adapter'),
  scenario('shipping', 'pagination', 'Add response wrapper', 'Shipping moves inside a one-item data array.', 'repairable', 'Response wrapped', 'Unwrap adapter'),
  scenario('shipping', 'rate_limit', 'Temporary rate limit', 'Every fourth cycle starts with a real HTTP 429.', 'repairable', 'HTTP behavior changed', 'Bounded retry'),
  scenario('shipping', 'type', 'Change estimate type', 'eta_days becomes a string.', 'blocked', 'JSON type changed', 'Manual review'),
];

const defaultRecords = () => ({
  customer: { id: 'cust_rahul', name: 'Rahul Sharma', email: 'rahul.sharma@example.com', tier: 'gold' },
  pricing: { product_id: 'phoenix-pro', product_name: 'Arc One wireless headphones', amount: 799, currency: 'INR', unit: 'rupees', tax_percent: 18 },
  shipping: { order_id: 'demo-order', carrier: 'Nimbus Express', eta_days: 3, destination: 'Bengaluru' },
});

const dataSchemas = {
  customer: z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email().max(120), tier: z.string().trim().min(2).max(30) }).strict(),
  pricing: z.object({ product_name: z.string().trim().min(2).max(100), amount: z.number().positive().max(1_000_000), tax_percent: z.number().min(0).max(100) }).strict(),
  shipping: z.object({ carrier: z.string().trim().min(2).max(80), eta_days: z.number().int().positive().max(365), destination: z.string().trim().min(2).max(80) }).strict(),
};

const clone = value => structuredClone(value);
const rename = (body, source, target) => { body[target] = body[source]; delete body[source]; };

export function renderProviderResponse(endpointId, scenarioId, record, requestNumber = 1) {
  let body = clone(record);
  let status = 200;
  const headers = {};
  let raw = false;

  if (scenarioId === 'rename') rename(body, endpointId === 'shipping' ? 'eta_days' : 'name', endpointId === 'shipping' ? 'delivery_days' : 'display_name');
  if (scenarioId === 'rename_email') rename(body, 'email', 'email_address');
  if (scenarioId === 'rename_tier') rename(body, 'tier', 'membership_tier');
  if (scenarioId === 'rename_product') rename(body, 'product_name', 'display_name');
  if (scenarioId === 'rename_tax') rename(body, 'tax_percent', 'tax_rate_percent');
  if (scenarioId === 'rename_carrier') rename(body, 'carrier', 'carrier_name');
  if (scenarioId === 'rename_destination') rename(body, 'destination', 'delivery_destination');
  if (scenarioId === 'pagination') body = { data: [body], pagination: { page: 1, total: 1 } };
  if (scenarioId === 'unit') { body.eta_hours = body.eta_days * 24; delete body.eta_days; }
  if (scenarioId === 'remove') delete body.email;
  if (scenarioId === 'type') {
    if (endpointId === 'customer') body.name = { first: body.name.split(' ')[0], last: body.name.split(' ').slice(1).join(' ') };
    if (endpointId === 'shipping') body.eta_days = String(body.eta_days);
  }
  if (scenarioId === 'default') body.tier = 'standard';
  if (scenarioId === 'semantic') body.amount *= 100;
  if (scenarioId === 'http_error') {
    status = endpointId === 'pricing' ? 502 : 503;
    body = { error: 'temporarily_unavailable', message: 'The upstream API cannot serve this request.' };
  }
  if (scenarioId === 'rate_limit' && requestNumber % 4 === 1) {
    status = 429;
    headers['Retry-After'] = '1';
    body = { error: 'rate_limit_exceeded', message: 'Rate limit reached. Retry after one second.' };
  }
  if (scenarioId === 'malformed') { body = '{"amount":'; raw = true; }
  return { status, headers, body, raw };
}

export function createProvider({ token, origins = ['http://localhost:8001', 'http://127.0.0.1:8001'] } = {}) {
  const app = express();
  const state = {
    active: { customer: 'normal', pricing: 'normal', shipping: 'normal' },
    records: defaultRecords(), requests: 0, counts: {}, log: [], revision: 1,
    updatedAt: new Date().toISOString(), lastChange: { type: 'startup', message: 'Provider started with healthy contracts.' },
  };
  const addLog = item => { state.log.unshift({ ...item, at: new Date().toISOString() }); state.log = state.log.slice(0, 60); };
  const markChange = change => { state.revision++; state.updatedAt = new Date().toISOString(); state.lastChange = change; addLog(change); };
  const previews = () => Object.fromEntries(Object.keys(ENDPOINTS).map(id => {
    const response = renderProviderResponse(id, state.active[id], state.records[id], (state.counts[id] || 0) + 1);
    return [id, { ...response, nextRequest: (state.counts[id] || 0) + 1 }];
  }));

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { 'connect-src': ["'self'", ...origins], 'script-src': ["'self'"], 'img-src': ["'self'", 'data:'], 'style-src': ["'self'", "'unsafe-inline'"], 'upgrade-insecure-requests': null } } }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'external-provider', revision: state.revision }));
  app.use('/admin', corsFor(origins), requireToken(token));
  app.get('/admin/state', (req, res) => res.json({ ...state, previews: previews(), scenarios: SCENARIOS }));
  app.post('/admin/scenario', (req, res) => {
    const parsed = z.object({ endpointId: z.enum(['customer', 'pricing', 'shipping']), scenario: z.string() }).strict().safeParse(req.body);
    if (!parsed.success || !SCENARIOS.some(s => s.endpointId === parsed.data.endpointId && s.id === parsed.data.scenario)) return res.status(400).json({ error: 'invalid_scenario' });
    const { endpointId, scenario: scenarioId } = parsed.data;
    state.active[endpointId] = scenarioId;
    state.counts[endpointId] = 0;
    const selected = SCENARIOS.find(item => item.endpointId === endpointId && item.id === scenarioId);
    markChange({ type: 'change', endpointId, scenario: scenarioId, message: `${selected.label} activated for ${endpointId}.` });
    res.json({ ok: true, active: state.active, preview: previews()[endpointId], revision: state.revision });
  });
  app.post('/admin/data', (req, res) => {
    const envelope = z.object({ endpointId: z.enum(['customer', 'pricing', 'shipping']), values: z.record(z.unknown()) }).strict().safeParse(req.body);
    if (!envelope.success) return res.status(400).json({ error: 'invalid_provider_data', message: 'Choose an endpoint and provide its editable values.' });
    const values = dataSchemas[envelope.data.endpointId].safeParse(envelope.data.values);
    if (!values.success) return res.status(400).json({ error: 'invalid_provider_data', message: values.error.issues[0]?.message || 'Provider data is invalid.' });
    const endpointId = envelope.data.endpointId;
    state.records[endpointId] = { ...state.records[endpointId], ...values.data };
    state.counts[endpointId] = 0;
    markChange({ type: 'data_update', endpointId, message: `Live ${endpointId} values updated.` });
    res.json({ ok: true, record: state.records[endpointId], preview: previews()[endpointId], revision: state.revision });
  });
  app.post('/admin/reset', (req, res) => {
    state.active = { customer: 'normal', pricing: 'normal', shipping: 'normal' };
    state.records = defaultRecords();
    state.counts = {};
    markChange({ type: 'reset', message: 'All provider responses restored to defaults.' });
    res.json({ ok: true, revision: state.revision });
  });

  for (const endpoint of Object.values(ENDPOINTS)) {
    app.get(endpoint.path, (req, res) => {
      if (req.headers.origin) return res.status(403).json({ error: 'server_access_only' });
      const id = endpoint.id;
      state.requests++;
      state.counts[id] = (state.counts[id] || 0) + 1;
      const response = renderProviderResponse(id, state.active[id], state.records[id], state.counts[id]);
      for (const [name, value] of Object.entries(response.headers)) res.set(name, value);
      addLog({ type: 'request', endpointId: id, scenario: state.active[id], requestNumber: state.counts[id], status: response.status, response: response.raw ? '[invalid JSON]' : mask(response.body) });
      if (response.raw) return res.status(response.status).type('application/json').send(response.body);
      res.status(response.status).json(response.body);
    });
  }
  const consoleDir = fileURLToPath(new URL('../../console/dist/', import.meta.url));
  app.use(express.static(consoleDir));
  app.get(['/', '/provider'], (req, res) => res.sendFile(`${consoleDir}/index.html`));
  app.use((req, res) => res.status(404).json({ error: 'not_found' }));
  app.use(errors);
  return { app, state };
}
