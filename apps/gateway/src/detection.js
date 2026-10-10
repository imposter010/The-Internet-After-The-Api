import { createHash } from 'node:crypto';
import { CONTRACTS, schemaOf } from '@phoenix/shared';

export function fingerprint(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24); }
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const drift = (kind, title, summary, evidence, safe = false, adapter = null) => ({ kind, title, summary, evidence, safe, adapter });
const ALLOWED_ALIASES = {
  customer: new Set(['display_name:name', 'email_address:email', 'membership_tier:tier']),
  pricing: new Set(['display_name:product_name', 'tax_rate_percent:tax_percent']),
  shipping: new Set(['delivery_days:eta_days', 'carrier_name:carrier', 'delivery_destination:destination']),
};

function renamedBody(current, source, target) {
  const compatible = { ...current, [target]: current[source] };
  delete compatible[source];
  return compatible;
}

export function detect(endpointId, baseline, current, status, headers = {}) {
  if (status === 429) return drift('rate_limit', 'New upstream rate limit', 'The provider returned HTTP 429 for a previously healthy request.', [{ fact: 'status', old: 200, new: 429 }, { fact: 'retry-after', value: headers['retry-after'] || 'absent' }], true, { type: 'retry', methods: ['GET'], maxAttempts: 3, maxDelayMs: 3000 });
  if (status !== 200) return drift('http_error', 'Upstream HTTP behavior changed', `Upstream returned HTTP ${status}.`, [{ fact: 'status', old: 200, new: status }]);
  if (!current || typeof current !== 'object' || Array.isArray(current)) return drift('malformed', 'Malformed upstream response', 'A JSON object is required at this boundary.', [{ fact: 'response_type', value: typeof current }]);
  if (!baseline) return CONTRACTS[endpointId].safeParse(current).success ? null : drift('unlearned_contract', 'No compatible baseline', 'The first observed response violates the client contract. Restore a healthy provider to learn safely.', [{ fact: 'contract', value: 'invalid' }]);
  const identity = { customer: 'id', pricing: 'product_id', shipping: 'order_id' }[endpointId];
  if (identity in current && current[identity] !== baseline[identity]) return drift('identity_change', 'Response identity changed', `The fixed endpoint returned a different ${identity}.`, [{ fact: identity, old: baseline[identity], new: current[identity] }]);
  if (Array.isArray(current.data) && current.data.length === 1 && current.pagination?.total === 1 && CONTRACTS[endpointId].safeParse(current.data[0]).success) {
    const residual = detect(endpointId, baseline, current.data[0], 200);
    if (!residual) return drift('pagination', 'Single response moved into a page', 'One valid API object is now inside a data page; its identity and business checks still match.', [{ fact: 'item_count', value: 1 }, { fact: 'inner_contract', value: 'valid' }, { fact: 'business_checks', value: 'passed' }], true, { type: 'normalize', source: 'data', target: 'root' });
  }
  const missing = Object.keys(baseline).filter(key => !(key in current));
  const added = Object.keys(current).filter(key => !(key in baseline));
  if (missing.length === 1 && added.length === 1) {
    const [target] = missing, [source] = added;
    const restUnchanged = Object.keys(baseline).filter(k => k !== target).every(k => equal(current[k], baseline[k]));
    if (endpointId === 'shipping' && target === 'eta_days' && source === 'eta_hours' && typeof current[source] === 'number' && Number.isFinite(current[source]) && current[source] % 24 === 0) {
      const compatible = renamedBody(current, source, target);
      compatible[target] = current[source] / 24;
      const residual = detect(endpointId, baseline, compatible, 200);
      if (!residual && compatible[target] >= 0 && compatible[target] <= 60) {
        return drift('unit_change', 'Delivery units changed', 'eta_days disappeared; eta_hours preserves a valid delivery duration using the approved 24-hour conversion.', [{ fact: 'field_units', old: 'days', new: 'hours' }, { fact: 'ratio', value: 24 }, { fact: 'business_checks', value: 'passed' }], true, { type: 'unit', source, target, from: 'hours', to: 'days', divisor: 24 });
      }
    }
    const sameObservedValue = typeof current[source] === typeof baseline[target] && equal(current[source], baseline[target]) && restUnchanged;
    const approvedMapping = ALLOWED_ALIASES[endpointId]?.has(`${source}:${target}`) && typeof current[source] === typeof baseline[target];
    if (sameObservedValue || approvedMapping) {
      const compatible = renamedBody(current, source, target);
      const residual = detect(endpointId, baseline, compatible, 200);
      if (!residual) return drift('field_alias', 'Response field renamed', `${target} disappeared and ${source} is a contract-compatible approved alias.`, [{ fact: 'field', old: target, new: source }, { fact: 'value_equality', value: sameObservedValue }, { fact: 'approved_mapping', value: !!approvedMapping }, { fact: 'business_checks', value: 'passed' }], true, { type: 'alias', source, target });
      return residual;
    }
  }
  if (missing.length || added.length) return drift('structural', 'Response shape changed', `Missing: ${missing.join(', ') || 'none'}. Added: ${added.join(', ') || 'none'}.`, [{ fact: 'missing', value: missing }, { fact: 'added', value: added }]);
  if (!equal(schemaOf(current), schemaOf(baseline))) return drift('type_change', 'Response field type changed', 'At least one field changed its JSON type.', [{ fact: 'schema', old: schemaOf(baseline), new: schemaOf(current) }]);
  if (endpointId === 'pricing' && (current.amount > baseline.amount * 2 || current.amount < baseline.amount / 2 || current.currency !== baseline.currency || current.unit !== baseline.unit)) {
    return drift('semantic_price', 'Price meaning needs review', `Price changed from ${baseline.amount} to ${current.amount} ${current.currency} without verified unit evidence. Checkout is blocked.`, [{ fact: 'amount', old: baseline.amount, new: current.amount }, { fact: 'ratio', value: current.amount / baseline.amount }, { fact: 'schema', value: 'unchanged' }, { fact: 'automatic_conversion', value: 'not permitted' }]);
  }
  if (endpointId === 'customer' && current.tier !== baseline.tier) return drift('default_change', 'Membership behavior changed', 'The learned membership tier changed without a migration contract.', [{ fact: 'tier', old: baseline.tier, new: current.tier }]);
  if (!CONTRACTS[endpointId].safeParse(current).success) return drift('contract', 'Client contract violation', 'The response no longer meets required client fields and value constraints.', [{ fact: 'contract', value: 'invalid' }]);
  return null;
}
