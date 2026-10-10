import { ADAPTER_SCHEMA } from '@phoenix/shared';

export function transform(input, definition) {
  const adapter = ADAPTER_SCHEMA.parse(definition);
  if (adapter.type === 'retry') return structuredClone(input);
  if (adapter.type === 'normalize') {
    // A previously healthy object passes through unchanged on provider rollback.
    if (!('data' in input)) return structuredClone(input);
    if (!Array.isArray(input.data) || input.data.length !== 1 || input.pagination?.total !== 1) throw new Error('Normalization requires an observed single-item page.');
    return structuredClone(input.data[0]);
  }
  const output = structuredClone(input);
  if (Object.hasOwn(output, adapter.target) && Object.hasOwn(output, adapter.source)) throw new Error('Ambiguous alias: both old and new fields exist.');
  if (!Object.hasOwn(output, adapter.source)) return output;
  if (adapter.type === 'unit' && (typeof output[adapter.source] !== 'number' || !Number.isFinite(output[adapter.source]))) throw new Error('A finite numeric delivery duration is required.');
  output[adapter.target] = adapter.type === 'unit' ? output[adapter.source] / adapter.divisor : output[adapter.source];
  delete output[adapter.source];
  return output;
}

export function retryDelay(header, now = Date.now()) {
  if (!header) return 250;
  const seconds = Number(header);
  const millis = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isFinite(millis) ? Math.max(0, millis) : null;
}
