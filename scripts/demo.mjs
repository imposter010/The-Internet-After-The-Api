import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const provider = process.env.PROVIDER_URL || 'http://127.0.0.1:8001';
const gateway = process.env.GATEWAY_URL || 'http://127.0.0.1:8000';
let secrets = {};
try { secrets = JSON.parse(await readFile('.cache/dev-secrets.json', 'utf8')); } catch {}
const providerToken = process.env.PROVIDER_ADMIN_TOKEN || secrets.providerToken;
const gatewayToken = process.env.GATEWAY_ADMIN_TOKEN || secrets.gatewayToken;
if (!providerToken || !gatewayToken) throw new Error('Set PROVIDER_ADMIN_TOKEN and GATEWAY_ADMIN_TOKEN, or run npm run dev first.');
async function call(base, path, token, body) {
  const response = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
const change = (endpointId, scenario) => call(provider, '/admin/scenario', providerToken, { endpointId, scenario });
const request = endpointId => call(gateway, `/api/${endpointId}/${endpointId === 'customer' ? 'rahul' : 'phoenix-pro'}`);
const snapshot = async () => (await call(gateway, '/admin/snapshot', gatewayToken)).body;
const wait = async predicate => { const until = Date.now() + 30000; while (Date.now() < until) { const data = await snapshot(); if (predicate(data)) return data; await delay(300); } throw new Error('Demo timed out waiting for validated repair.'); };
const assert = (value, message) => { if (!value) throw new Error(message); };
try {
  await call(provider, '/admin/reset', providerToken, {});
  const reset = await call(gateway, '/admin/reset', gatewayToken, { confirm: 'RESET' });
  assert(reset.status === 200, 'Gateway reset failed; wait for any running validation.');
  await call(gateway, '/admin/probe', gatewayToken, {});
  console.log('Baseline: nine real HTTP observations captured.');
  for (const [endpointId, scenario] of [['customer', 'rename'], ['shipping', 'unit'], ['pricing', 'rate_limit']]) {
    await change(endpointId, scenario);
    const broken = await request(endpointId);
    assert(broken.status !== 200, `${scenario} did not produce a detected change.`);
    await wait(s => s.adapters.some(a => a.endpointId === endpointId && a.status === 'active'));
    const recovered = await request(endpointId);
    assert(recovered.status === 200 && recovered.body._phoenix.safe, `${scenario} did not recover.`);
    console.log(`${scenario}: drift observed, actual regressions passed, adapter activated, client contract restored.`);
  }
  await change('pricing', 'semantic');
  const blocked = await request('pricing');
  assert(blocked.status === 409, 'Unsafe price was not blocked.');
  const checkout = await call(gateway, '/api/checkout', null, { quantity: 1 });
  assert(checkout.status === 409, 'Unsafe checkout was not blocked.');
  const approval = await call(gateway, `/admin/incidents/${blocked.body.incidentId}/approve`, gatewayToken, {});
  assert(approval.status === 422, 'Unsafe approval bypassed semantic evidence.');
  console.log('semantic price: HTTP 409, checkout held, unverified conversion rejected.');
  const state = await snapshot();
  console.log(JSON.stringify({ metrics: state.metrics, passports: state.passports.map(p => ({ id: p.id, decision: p.decision, tests: p.tests.map(t => ({ name: t.name, passed: t.passed })) })) }, null, 2));
} finally {
  await call(provider, '/admin/reset', providerToken, {});
  await Promise.all(['customer', 'pricing', 'shipping'].map(request));
}
