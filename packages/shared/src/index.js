import { z } from 'zod';

export const ENDPOINTS = {
  customer: { id: 'customer', serviceId: 'customer-api', name: 'Customer API', path: '/api/customer/rahul' },
  pricing: { id: 'pricing', serviceId: 'pricing-api', name: 'Pricing API', path: '/api/pricing/phoenix-pro' },
  shipping: { id: 'shipping', serviceId: 'shipping-api', name: 'Shipping API', path: '/api/shipping/phoenix-pro' },
};

export const CONTRACTS = {
  customer: z.object({ id: z.string().min(1), name: z.string().min(1), email: z.string().email(), tier: z.enum(['gold', 'standard']) }).passthrough(),
  pricing: z.object({ product_id: z.string(), product_name: z.string(), amount: z.number().finite().positive(), currency: z.literal('INR'), unit: z.literal('rupees'), tax_percent: z.number().min(0).max(30) }).passthrough(),
  shipping: z.object({ order_id: z.string(), carrier: z.string().min(1), eta_days: z.number().min(0).max(60), destination: z.string().min(1) }).passthrough(),
};

export const DEPENDENCIES = [
  { id: 'profile', name: 'Customer profile', endpointIds: ['customer'], fields: { customer: ['id', 'name', 'email', 'tier'] } },
  { id: 'product', name: 'Product pricing', endpointIds: ['pricing'], fields: { pricing: ['amount', 'currency', 'unit'] } },
  { id: 'delivery', name: 'Delivery estimate', endpointIds: ['shipping'], fields: { shipping: ['eta_days', 'destination'] } },
  { id: 'checkout', name: 'Checkout preview', endpointIds: ['customer', 'pricing', 'shipping'], fields: { customer: ['id', 'name'], pricing: ['amount', 'tax_percent', 'currency'], shipping: ['eta_days'] } },
];

const safeField = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/).refine(value => !['__proto__', 'constructor', 'prototype'].includes(value));
export const ADAPTER_SCHEMA = z.discriminatedUnion('type', [
  z.object({ type: z.literal('alias'), source: safeField, target: safeField }).strict(),
  z.object({ type: z.literal('unit'), source: safeField, target: safeField, from: z.literal('hours'), to: z.literal('days'), divisor: z.literal(24) }).strict(),
  z.object({ type: z.literal('normalize'), source: z.literal('data'), target: z.literal('root') }).strict(),
  z.object({ type: z.literal('retry'), methods: z.tuple([z.literal('GET')]), maxAttempts: z.number().int().min(2).max(3), maxDelayMs: z.number().int().min(0).max(3000) }).strict(),
]);

export const EVENT_TYPES = ['api:observed', 'api:baseline', 'drift:detected', 'impact:analyzed', 'repair:proposed', 'validation:started', 'validation:completed', 'repair:deployed', 'repair:blocked', 'repair:rolled-back', 'api:recovered'];
export const EVENT_SCHEMA = z.object({ id: z.string(), type: z.string(), at: z.string(), serviceId: z.string(), incidentId: z.string().nullable(), title: z.string(), detail: z.string(), severity: z.enum(['info', 'success', 'warning', 'danger']) });

export function schemaOf(value) {
  if (Array.isArray(value)) return { type: 'array', items: value.length ? schemaOf(value[0]) : null };
  if (value === null) return 'null';
  if (typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, schemaOf(value[key])]));
  return typeof value;
}

export function mask(value) {
  if (Array.isArray(value)) return value.map(mask);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /authorization|cookie|token|secret|password|api.?key|email|^name$|display_name|phone|address/i.test(key) ? '[REDACTED]' : mask(item),
  ]));
}
