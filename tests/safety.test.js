import { describe, it, expect } from 'vitest';
import { ADAPTER_SCHEMA, mask } from '@phoenix/shared';
import { transform, retryDelay } from '../apps/gateway/src/adapters.js';
import { detect } from '../apps/gateway/src/detection.js';
import { SCENARIOS, renderProviderResponse } from '../apps/provider/src/app.js';

describe('adapter safety boundaries', () => {
  it('rejects code, pollution keys, arbitrary price arithmetic, and expanded retry policies', () => {
    for (const candidate of [{ type: 'script', code: 'process.exit()' }, { type: 'alias', source: '__proto__', target: 'name' }, { type: 'unit', source: 'amount', target: 'amount', divisor: 100, from: 'paise', to: 'rupees' }, { type: 'retry', methods: ['POST'], maxAttempts: 99, maxDelayMs: 99999 }]) expect(ADAPTER_SCHEMA.safeParse(candidate).success).toBe(false);
  });
  it('rejects ambiguous aliases and normalization that would lose records', () => {
    expect(() => transform({ name: 'A', display_name: 'B' }, { type: 'alias', source: 'display_name', target: 'name' })).toThrow('Ambiguous');
    expect(() => transform({ data: [{ id: 1 }, { id: 2 }], pagination: { total: 2 } }, { type: 'normalize', source: 'data', target: 'root' })).toThrow();
  });
  it('does not guess a conversion from changed values alone', () => {
    expect(detect('shipping', { eta_days: 3, carrier: 'X' }, { eta_hours: 70, carrier: 'X' }, 200).safe).toBe(false);
    expect(detect('customer', { name: 'A', id: '1' }, { display_name: 'B', id: '1' }, 200).safe).toBe(false);
  });
  it('accepts approved aliases when ordinary data changed but contract and business checks still pass', () => {
    const baseline = { id: 'cust_rahul', name: 'Rahul Sharma', email: 'rahul@example.com', tier: 'gold' };
    const current = { id: 'cust_rahul', name: 'Rahul Sharma', email: 'new@example.com', membership_tier: 'gold' };
    expect(detect('customer', baseline, current, 200)).toMatchObject({ kind: 'field_alias', safe: true, adapter: { type: 'alias', source: 'membership_tier', target: 'tier' } });
  });
  it('blocks an approved alias when a simultaneous business-risk change remains', () => {
    const baseline = { product_id: 'phoenix-pro', product_name: 'Headphones', amount: 799, currency: 'INR', unit: 'rupees', tax_percent: 18 };
    const current = { product_id: 'phoenix-pro', product_name: 'Headphones', amount: 79900, currency: 'INR', unit: 'rupees', tax_rate_percent: 18 };
    expect(detect('pricing', baseline, current, 200)).toMatchObject({ kind: 'semantic_price', safe: false });
  });
  it('recognizes every provider scenario labelled repairable as an automatic candidate', () => {
    const baselines = {
      customer: { id: 'cust_rahul', name: 'Rahul Sharma', email: 'rahul@example.com', tier: 'gold' },
      pricing: { product_id: 'phoenix-pro', product_name: 'Headphones', amount: 799, currency: 'INR', unit: 'rupees', tax_percent: 18 },
      shipping: { order_id: 'demo-order', carrier: 'Nimbus Express', eta_days: 3, destination: 'Bengaluru' },
    };
    const dynamic = {
      customer: { ...baselines.customer, name: 'Aarav Mehta', email: 'aarav@example.com' },
      pricing: { ...baselines.pricing, product_name: 'Headphones Plus', amount: 899 },
      shipping: { ...baselines.shipping, carrier: 'Orbit Courier', eta_days: 5, destination: 'Jaipur' },
    };
    for (const item of SCENARIOS.filter(candidate => candidate.safety === 'repairable')) {
      const rendered = renderProviderResponse(item.endpointId, item.id, dynamic[item.endpointId], 1);
      const headers = Object.fromEntries(Object.entries(rendered.headers).map(([key, value]) => [key.toLowerCase(), value]));
      const change = detect(item.endpointId, baselines[item.endpointId], rendered.body, rendered.status, headers);
      expect(change, `${item.endpointId}/${item.id}`).toMatchObject({ safe: true });
      expect(change.adapter, `${item.endpointId}/${item.id}`).toBeTruthy();
    }
  });
  it.each([['customer', 'id'], ['pricing', 'product_id'], ['shipping', 'order_id']])('preserves %s response identity', (endpointId, field) => {
    const change = detect(endpointId, { [field]: 'original' }, { [field]: 'different' }, 200);
    expect(change.kind).toBe('identity_change');
    expect(change.safe).toBe(false);
  });
  it('parses Retry-After dates without reducing an upstream limit', () => {
    expect(retryDelay('8')).toBe(8000);
    expect(retryDelay('Thu, 01 Jan 1970 00:00:08 GMT', 0)).toBe(8000);
    expect(retryDelay('nonsense')).toBeNull();
  });
  it('masks nested credentials and personal data', () => {
    const masked = mask({ headers: { authorization: 'secret', cookie: 'secret', 'x-api-key': 'secret' }, response: { name: 'Rahul', email: 'rahul@example.com', price: 799 } });
    expect(JSON.stringify(masked)).not.toContain('secret');
    expect(masked.response.price).toBe(799);
    expect(masked.response.email).toBe('[REDACTED]');
  });
});
