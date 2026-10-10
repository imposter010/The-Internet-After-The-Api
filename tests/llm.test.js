import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { DriftAnalyst, llmFromEnv } from '../apps/gateway/src/llm.js';

const adapter = { type: 'alias', source: 'display_name', target: 'name' };
const incident = {
  endpointId: 'customer', kind: 'field_alias', safe: true, summary: 'One renamed field; equal observed value.',
  oldBehavior: { id: 'cust_rahul', name: 'Rahul Sharma', email: 'rahul@example.com', tier: 'gold' },
  newBehavior: { id: 'cust_rahul', display_name: 'Rahul Sharma', email: 'rahul@example.com', tier: 'gold' },
  evidence: [{ fact: 'value_equality', value: true }], impactedWorkflows: [{ id: 'checkout', name: 'Checkout preview' }],
};
const proposal = { adapter };
const analysis = (overrides = {}) => ({ classification: 'minor',
  detectedChanges: ['name was replaced by display_name.'], likelyEffects: ['The customer view can lose the name field.'],
  explanation: 'A field rename preserves the observed value.',
  hinglishExplanation: 'Field ka naam badla hai; observed value same hai.', recommendedAction: 'apply_candidate',
  risk: 'low', adapter, verificationNotes: ['Confirm three fresh responses and checkout requirements.'], ...overrides });
const completion = (content, overrides = {}) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) }, ...overrides }] }), { headers: { 'content-type': 'application/json' } });
const analyst = (overrides = {}) => new DriftAnalyst({ url: 'https://api.openai.com/v1/chat/completions', key: 'unit-private-key', model: 'gpt-4o-mini', ...overrides });
afterEach(() => vi.restoreAllMocks());

describe('OpenAI-compatible drift analyst', () => {
  it('loads server-side defaults, key aliases, opt-out, and timeout', () => {
    expect(llmFromEnv({ GROQ_API_KEY: 'groq-private' })).toMatchObject({ key: 'groq-private', model: 'openai/gpt-oss-20b', url: 'https://api.groq.com/openai/v1/chat/completions', timeoutMs: 8000 });
    expect(llmFromEnv({ OPENAI_API_KEY: 'private' })).toMatchObject({ key: 'private', model: 'gpt-4o-mini', url: 'https://api.openai.com/v1/chat/completions', timeoutMs: 8000 });
    expect(llmFromEnv({ OPENAI_API_KEY: 'one', LLM_API_KEY: 'two', LLM_ENABLED: 'false', LLM_TIMEOUT_MS: '1000' })).toMatchObject({ key: 'two', enabled: false, timeoutMs: 1000 });
  });

  it('does not call a model without credentials or when disabled', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect((await new DriftAnalyst().analyze(incident, proposal)).status).toBe('disabled');
    expect((await analyst({ enabled: false }).analyze(incident, proposal)).status).toBe('disabled');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses Groq-compatible request options without unsupported storage', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(completion(analysis()));
    const client = new DriftAnalyst({ url: 'https://api.groq.com/openai/v1/chat/completions', key: 'groq-private', model: 'openai/gpt-oss-20b' });
    expect(await client.analyze(incident, proposal)).toMatchObject({ status: 'completed', provider: 'groq', classification: 'minor' });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ model: 'openai/gpt-oss-20b', reasoning_effort: 'low', max_completion_tokens: 1500 });
    expect(body).not.toHaveProperty('store');
  });

  it.each(['http://api.openai.com/v1/chat/completions', 'https://user:secret@example.com/chat', 'https://example.com/chat?key=secret', 'file:///tmp/chat'])('refuses an insecure or credential-bearing endpoint %s', async url => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect((await analyst({ url }).analyze(incident, proposal)).reason).toBe('invalid_endpoint');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends masked context with a strict candidate-constrained JSON schema and bounded output', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(completion(analysis()));
    const client = analyst();
    const result = await client.analyze(incident, proposal);
    expect(result).toMatchObject({ status: 'completed', provider: 'openai', candidateAccepted: true, fallbackUsed: false, adapter });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(options.headers.authorization).toBe('Bearer unit-private-key');
    expect(options.redirect).toBe('error');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ store: false, max_completion_tokens: 1500, response_format: { type: 'json_schema', json_schema: { strict: true } } });
    const context = JSON.parse(body.messages[1].content);
    expect(context.evidencedCandidate).toEqual(adapter);
    expect(context.oldSchema.name).toBe('string');
    expect(context.oldBehavior.name).toBe('[REDACTED]');
    expect(body.messages[1].content).not.toMatch(/Rahul Sharma|rahul@example.com|unit-private-key/);
    expect(JSON.stringify(client.describe())).not.toContain('unit-private-key');
  });

  it('accepts different JSON key ordering, not different adapter meaning', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(completion(analysis({ adapter: { target: 'name', source: 'display_name', type: 'alias' } })));
    expect((await analyst().analyze(incident, proposal)).candidateAccepted).toBe(true);
  });

  it('preserves original type-change schemas even when masking replaces an object with a string', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(completion(analysis({ classification: 'major', recommendedAction: 'manual_review', risk: 'high', adapter: null })));
    const changed = { ...incident, safe: false, kind: 'type_change',
      oldBehavior: { name: '[REDACTED]' }, newBehavior: { name: '[REDACTED]' },
      oldSchema: { name: 'string' }, newSchema: { name: { first: 'string' } } };
    expect((await analyst().analyze(changed)).status).toBe('completed');
    const context = JSON.parse(JSON.parse(fetch.mock.calls[0][1].body).messages[1].content);
    expect(context.newSchema.name).toEqual({ first: 'string' });
    expect(context.automaticRepairEligible).toBe(false);
  });

  it.each([
    ['arbitrary code', { adapter: { type: 'script', code: 'process.exit()' } }],
    ['unsupported fields', { adapter: { type: 'alias', source: 'email', target: 'name' } }],
    ['price arithmetic', { adapter: { type: 'unit', source: 'amount', target: 'amount', from: 'paise', to: 'rupees', divisor: 100 } }],
    ['unsafe retry', { adapter: { type: 'retry', methods: ['POST'], maxAttempts: 3, maxDelayMs: 3000 } }],
    ['high-risk activation', { risk: 'high' }],
    ['fake execution result', { testsPassed: true }],
    ['empty explanation', { explanation: '' }],
  ])('rejects %s output and records explicit fallback', async (_, overrides) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(completion(analysis(overrides)));
    expect(await analyst().analyze(incident, proposal)).toMatchObject({ status: 'rejected', fallbackUsed: true });
  });

  it('allows a valid abstention, so the engine can hold an eligible candidate', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(completion(analysis({ recommendedAction: 'manual_review', risk: 'unknown', adapter: null })));
    expect(await analyst().analyze(incident, proposal)).toMatchObject({ status: 'completed', candidateAccepted: false, adapter: null });
  });

  it('analyzes unsafe drift without allowing a model to promote it to a safe repair', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(completion(analysis()));
    const result = await analyst().analyze({ ...incident, safe: false, kind: 'structural' }, proposal);
    expect(result).toMatchObject({ status: 'rejected', reason: 'unsupported_proposal' });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.response_format.json_schema.schema.properties.adapter).toEqual({ type: 'null' });
  });

  it.each([
    ['refusal', () => completion({}, { message: { refusal: 'Refused' } }), 'unavailable'],
    ['truncation', () => completion(analysis(), { finish_reason: 'length' }), 'rejected'],
    ['malformed JSON', () => new Response('{bad-json'), 'rejected'],
    ['authentication error', () => new Response('unit-private-key provider-debug-body', { status: 401 }), 'unavailable'],
    ['rate limit', () => new Response('provider-debug-body', { status: 429 }), 'unavailable'],
    ['oversized output', () => new Response('x'.repeat(65537)), 'rejected'],
  ])('handles %s without saving raw provider errors', async (_, makeResponse, status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse());
    const result = await analyst().analyze(incident, proposal);
    expect(result.status).toBe(status);
    expect(JSON.stringify(result)).not.toMatch(/unit-private-key|provider-debug-body/);
  });

  it('times out a real hanging HTTP endpoint', async () => {
    const server = createServer(() => {});
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    try {
      const result = await analyst({ url: `http://127.0.0.1:${server.address().port}/v1/chat/completions`, timeoutMs: 100 }).analyze(incident, proposal);
      expect(result).toMatchObject({ status: 'unavailable', reason: 'timeout', fallbackUsed: true });
    } finally { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  });
});
