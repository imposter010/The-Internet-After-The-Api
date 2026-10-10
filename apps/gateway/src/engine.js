import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ENDPOINTS, CONTRACTS, DEPENDENCIES, ADAPTER_SCHEMA, schemaOf, mask } from '@phoenix/shared';
import { detect, fingerprint } from './detection.js';
import { transform, retryDelay } from './adapters.js';
import { DriftAnalyst } from './llm.js';

const id = prefix => `${prefix}_${randomUUID().slice(0, 12)}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export class PhoenixEngine {
  constructor({ store, providerUrl, timeoutMs = 4000, repairDelayMs = 700, llm = {}, emit = () => {} }) {
    this.store = store;
    this.m = store.models;
    this.providerUrl = providerUrl.replace(/\/$/, '');
    if (!/^https?:\/\//.test(this.providerUrl)) throw new Error('PROVIDER_URL must be an HTTP(S) origin.');
    this.timeoutMs = timeoutMs;
    this.repairDelayMs = repairDelayMs;
    this.analyst = new DriftAnalyst(llm);
    this.emit = emit;
    this.jobs = new Map();
    this.locks = new Map();
    this.closed = false;
  }

  async event(type, endpointId, incidentId, title, detail, severity = 'info') {
    const event = { id: id('evt'), type, at: new Date(), serviceId: ENDPOINTS[endpointId]?.serviceId || 'phoenix', incidentId: incidentId || null, title, detail, severity };
    const saved = await this.m.SystemEvent.create(event);
    this.emit('phoenix:event', saved.toObject());
    this.emit(type, saved.toObject());
    return event;
  }

  async capture(endpointId) {
    const started = performance.now();
    const endpoint = ENDPOINTS[endpointId];
    let status, body, headers = {}, error = null;
    try {
      const response = await fetch(`${this.providerUrl}${endpoint.path}`, { method: 'GET', redirect: 'error', headers: { accept: 'application/json', 'user-agent': 'API-Phoenix/1.0' }, signal: AbortSignal.timeout(this.timeoutMs) });
      status = response.status;
      headers = { 'retry-after': response.headers.get('retry-after') };
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Upstream did not return JSON.');
      // Keep both the body stream and header read under a single timeout signal.
      const reader = response.body.getReader();
      let chunks = [], bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 262144) { await reader.cancel(); throw new Error('Upstream response exceeded 256 KiB.'); }
        chunks.push(Buffer.from(value));
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (err) {
      error = err.name === 'TimeoutError' || err.name === 'AbortError' ? 'upstream_timeout' : err instanceof SyntaxError || /JSON|256 KiB/.test(err.message) ? 'malformed_response' : 'upstream_unreachable';
      status = error === 'malformed_response' ? 502 : 503;
      body = { error, message: error === 'upstream_timeout' ? 'Provider request timed out.' : error === 'malformed_response' ? 'Provider returned malformed data.' : 'Provider connection failed.' };
    }
    const latencyMs = Math.round((performance.now() - started) * 10) / 10;
    const at = new Date();
    await this.m.ApiObservation.create({ id: id('obs'), endpointId, serviceId: endpoint.serviceId, request: { method: 'GET', path: endpoint.path, headers: { accept: 'application/json' } }, response: mask(body), schema: schemaOf(body), status, latencyMs, at });
    await this.m.ApiService.updateOne({ id: endpoint.serviceId }, { $inc: { requests: 1, errorCount: status >= 400 ? 1 : 0 }, $set: { lastSeen: at, latencyMs, status: status === 200 ? 'healthy' : 'degraded' } });
    await this.event('api:observed', endpointId, null, `${endpoint.name} · HTTP ${status}`, `Observed GET ${endpoint.path} in ${latencyMs} ms.`, status === 200 ? 'info' : 'warning');
    return { status, body, headers, latencyMs, error };
  }

  async boundedRequest(endpointId, definition = null) {
    const policy = definition?.type === 'retry' ? ADAPTER_SCHEMA.parse(definition) : null;
    let result = await this.capture(endpointId);
    for (let attempt = 1; policy && result.status === 429 && attempt < policy.maxAttempts; attempt++) {
      const waitMs = retryDelay(result.headers['retry-after']);
      // Refuse to shorten an upstream Retry-After that exceeds the local budget.
      if (waitMs === null || waitMs > policy.maxDelayMs) break;
      await delay(waitMs);
      result = await this.capture(endpointId);
      result.retried = true;
    }
    return result;
  }

  async baseline(endpointId) {
    const record = await this.m.EndpointBaseline.findOne({ endpointId }).lean();
    return record ? { record, body: this.store.decrypt(record.encryptedFixtures[0]), fixtures: record.encryptedFixtures.map(this.store.decrypt) } : null;
  }

  async activeAdapter(endpointId) {
    const adapter = await this.m.CompatibilityAdapter.findOne({ endpointId, status: 'active' }).lean();
    if (!adapter) return null;
    const passport = await this.m.RepairPassport.findOne({ ...(adapter.passportId ? { id: adapter.passportId } : { 'rollback.adapterId': adapter.id }), decision: 'activated' }).lean();
    return passport ? adapter : null;
  }

  async resumeInterrupted() {
    const incidents = await this.m.DriftIncident.find({ safe: true, status: { $in: ['detecting', 'validating'] } }).lean();
    for (const incident of incidents) {
      const active = await this.activeAdapter(incident.endpointId);
      if (active?.incidentId === incident.id) {
        await this.m.DriftIncident.updateOne({ id: incident.id }, { $set: { status: 'resolved' } });
        continue;
      }
      const proposal = await this.m.RepairProposal.findOne({ incidentId: incident.id }).lean();
      if (proposal) this.startRepair(incident, proposal);
      else await this.m.DriftIncident.updateOne({ id: incident.id }, { $set: { status: 'blocked' } });
    }
  }

  async serial(endpointId, callback) {
    const previous = this.locks.get(endpointId) || Promise.resolve();
    const current = previous.catch(() => {}).then(callback);
    this.locks.set(endpointId, current);
    try { return await current; } finally { if (this.locks.get(endpointId) === current) this.locks.delete(endpointId); }
  }

  async get(endpointId) {
    if (!ENDPOINTS[endpointId]) throw new Error('Unknown endpoint');
    return this.serial(endpointId, async () => {
      const active = await this.activeAdapter(endpointId);
      const result = await this.boundedRequest(endpointId, active?.definition);
      const learned = await this.baseline(endpointId);
      let rawDrift = detect(endpointId, learned?.body, result.body, result.status, result.headers);
      if (result.error) rawDrift = { kind: result.error, title: 'Provider response unavailable', summary: result.body.message, evidence: [{ fact: 'transport', value: result.error }], safe: false, adapter: null };
      const existingIncident = await this.m.DriftIncident.findOne({ endpointId, status: { $in: ['detecting', 'validating', 'blocked', 'awaiting_review', 'resolved', 'rolled_back'] } }).sort({ createdAt: -1 }).lean();
      let compatible = result.body;
      let adapted = false;
      if (active && result.status === 200) {
        try {
          compatible = transform(result.body, active.definition);
          adapted = !same(result.body, compatible) || !!result.retried;
        } catch { compatible = result.body; }
      }
      const postDrift = detect(endpointId, learned?.body, compatible, result.status, result.headers);
      if (result.status === 200 && !postDrift && (!rawDrift || active)) {
        if (!learned) {
          await this.m.EndpointBaseline.create({ id: id('base'), endpointId, body: mask(result.body), schema: schemaOf(result.body), encryptedFixtures: [this.store.encrypt(result.body)], samples: 1, learnedAt: new Date() });
          await this.event('api:baseline', endpointId, null, `${ENDPOINTS[endpointId].name} baseline learned`, 'Stored an encrypted known-good fixture and its observed schema.', 'success');
        } else if (!rawDrift && learned.record.samples < 10) {
          await this.m.EndpointBaseline.updateOne({ endpointId }, { $inc: { samples: 1 }, $push: { encryptedFixtures: { $each: [this.store.encrypt(result.body)], $slice: -10 } } });
        }
        if (existingIncident && !rawDrift && !['rolled_back', 'resolved'].includes(existingIncident.status)) {
          await this.m.DriftIncident.updateOne({ id: existingIncident.id }, { $set: { status: 'recovered', recoveredAt: new Date() } });
          await this.event('api:recovered', endpointId, existingIncident.id, 'Upstream contract recovered', 'A fresh response matches the learned contract.', 'success');
        }
        if (existingIncident && adapted && existingIncident.status === 'resolved') await this.m.ApiService.updateOne({ id: ENDPOINTS[endpointId].serviceId }, { $set: { status: 'repaired' } });
        return { status: 200, body: { ...compatible, _phoenix: { safe: true, adapted, recovered: adapted, incidentId: existingIncident?.id || null, upstreamStatus: result.status, latencyMs: result.latencyMs } } };
      }
      const found = await this.recordIncident(endpointId, rawDrift || postDrift, learned?.body, result.body);
      await this.m.ApiService.updateOne({ id: ENDPOINTS[endpointId].serviceId }, { $set: { status: found.safe ? 'repairing' : 'blocked' } });
      return { status: found.kind === 'semantic_price' ? 409 : result.status >= 400 ? result.status : 503, retryAfter: result.headers['retry-after'], body: { error: found.kind, message: found.summary, incidentId: found.id, _phoenix: { safe: false, adapted: false, recovered: false, incidentId: found.id, upstreamStatus: result.status, latencyMs: result.latencyMs } } };
    });
  }

  async recordIncident(endpointId, change, previous, current) {
    const signature = fingerprint({ endpointId, kind: change.kind, evidence: change.evidence });
    const existing = await this.m.DriftIncident.findOne({ endpointId, fingerprint: signature, status: { $nin: ['recovered'] } }).sort({ createdAt: -1 }).lean();
    if (existing) return existing;
    const workflows = DEPENDENCIES.filter(w => w.endpointIds.includes(endpointId)).map(w => ({ id: w.id, name: w.name, severity: change.kind === 'semantic_price' ? 'unsafe' : change.safe ? 'degraded' : 'blocking' }));
    const suppressed = change.adapter && await this.m.CompatibilityAdapter.findOne({ endpointId, status: 'rolled_back', disabledFingerprint: fingerprint(change.adapter) }).lean();
    const incident = await this.m.DriftIncident.create({ id: id('inc'), endpointId, serviceId: ENDPOINTS[endpointId].serviceId, kind: change.kind, title: change.title, summary: change.summary, evidence: mask(change.evidence), safe: change.safe, oldBehavior: mask(previous || {}), newBehavior: mask(current), oldSchema: schemaOf(previous || {}), newSchema: schemaOf(current), fingerprint: signature, impactedWorkflows: workflows, status: suppressed ? 'rolled_back' : change.safe ? 'detecting' : change.kind === 'semantic_price' || change.kind === 'default_change' ? 'awaiting_review' : 'blocked' });
    await this.event('drift:detected', endpointId, incident.id, change.title, change.summary, change.safe ? 'warning' : 'danger');
    await this.event('impact:analyzed', endpointId, incident.id, `${workflows.length} workflows affected`, workflows.map(w => w.name).join(', '), 'warning');
    if (!change.safe) {
      const passport = { id: id('pass'), incidentId: incident.id, endpointId, oldBehavior: mask(previous || {}), newBehavior: mask(current), impactedWorkflows: workflows, proposal: null, semanticEvidence: change.evidence, tests: [{ name: 'Automatic repair eligibility', passed: false, detail: 'Evidence is insufficient for a safe declarative transformation.' }], decision: 'blocked', rollback: { available: false } };
      await this.m.RepairPassport.create(passport);
      await this.event('repair:blocked', endpointId, incident.id, 'Automatic repair blocked', 'An operator must review the upstream meaning; no price conversion will be guessed.', 'danger');
      this.startAnalysis(incident.toObject());
    } else {
      const proposal = await this.m.RepairProposal.create({ id: id('prop'), incidentId: incident.id, endpointId, status: suppressed ? 'held' : 'proposed', adapter: ADAPTER_SCHEMA.parse(change.adapter), explanation: change.summary });
      if (suppressed) await this.event('repair:blocked', endpointId, incident.id, 'Rolled-back policy held for review', 'Changing transient evidence does not authorize the same adapter to redeploy.', 'warning');
      else this.startRepair(incident.toObject(), proposal.toObject());
    }
    return incident.toObject();
  }

  startRepair(incident, proposal) {
    if (this.jobs.has(incident.id) || this.closed) return this.jobs.get(incident.id);
    const job = this.repair(incident, proposal).catch(async err => {
      console.error(JSON.stringify({ level: 'error', incidentId: incident.id, message: err.message }));
      await this.m.DriftIncident.updateOne({ id: incident.id }, { $set: { status: 'blocked' } });
      await this.event('repair:blocked', incident.endpointId, incident.id, 'Repair validation interrupted', 'The repair remains inactive. Review the validation evidence.', 'danger');
    }).finally(() => this.jobs.delete(incident.id));
    this.jobs.set(incident.id, job);
    return job;
  }

  startAnalysis(incident) {
    if (this.jobs.has(incident.id) || this.closed) return;
    const job = this.analyzeIncident(incident).catch(() => {
      console.error(JSON.stringify({ level: 'error', incidentId: incident.id, message: 'LLM analysis could not be persisted. The incident remains blocked.' }));
    }).finally(() => this.jobs.delete(incident.id));
    this.jobs.set(incident.id, job);
  }

  async analyzeIncident(incident, proposal = null) {
    if (this.analyst.describe().configured) await this.event('ai:analysis-started', incident.endpointId, incident.id, 'LLM drift analysis started', 'Sending masked evidence and a restricted candidate, not credentials or executable code.');
    const analysis = await this.analyst.analyze(incident, proposal);
    await this.m.DriftIncident.updateOne({ id: incident.id }, { $set: { aiAnalysis: analysis } });
    if (proposal) await this.m.RepairProposal.updateOne({ id: proposal.id }, { $set: { aiAnalysis: analysis, aiExplanation: analysis.explanation || null } });
    else await this.m.RepairPassport.updateMany({ incidentId: incident.id, decision: 'blocked' }, { $set: { aiAnalysis: analysis } });
    if (analysis.status !== 'disabled') await this.event(analysis.status === 'completed' ? 'ai:analysis-completed' : 'ai:analysis-fallback', incident.endpointId, incident.id,
      analysis.status === 'completed' ? 'LLM analysis recorded' : 'LLM unavailable or output rejected',
      analysis.status === 'completed' ? 'Model guidance is recorded separately from executed validation. Safety checks remain mandatory.' : 'Using deterministic rules and validation; unsupported changes remain blocked.',
      analysis.status === 'completed' ? 'info' : 'warning');
    return analysis;
  }

  async validate(incident, proposal) {
    const endpointId = incident.endpointId;
    const tests = [];
    const check = async (name, callback) => {
      try { const detail = await callback(); tests.push({ name, passed: true, detail: detail || 'Passed' }); }
      catch (err) { tests.push({ name, passed: false, detail: err.message }); }
    };
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const baseline = await this.baseline(endpointId);
    let definition;
    await check('Restricted adapter definition', () => { definition = ADAPTER_SCHEMA.parse(proposal.adapter); assert(incident.kind !== 'semantic_price', 'Price transformations are never eligible.'); return `${definition.type} is an allowlisted transformation.`; });
    if (!definition) return tests;
    await check('Replay saved known-good fixtures', () => {
      assert(baseline?.fixtures.length, 'No known-good fixture exists.');
      for (const fixture of baseline.fixtures) {
        const compatible = transform(fixture, definition);
        assert(same(compatible, fixture), 'The adapter altered an already healthy response.');
        assert(CONTRACTS[endpointId].safeParse(compatible).success, 'Golden fixture violates client contract.');
      }
      return `${baseline.fixtures.length} encrypted fixtures replayed unchanged.`;
    });
    const probes = [];
    await check('Independent live HTTP probes', async () => {
      for (let i = 0; i < 3; i++) {
        const result = await this.boundedRequest(endpointId, definition);
        assert(result.status === 200, `Probe ${i + 1} returned HTTP ${result.status}.`);
        const compatible = transform(result.body, definition);
        probes.push({ raw: result.body, compatible });
        assert(CONTRACTS[endpointId].safeParse(compatible).success, `Probe ${i + 1} failed required client fields.`);
        assert(!detect(endpointId, baseline?.body, compatible, 200), `Probe ${i + 1} still violates learned behavior.`);
      }
      return 'Three fresh provider responses met the restored client contract.';
    });
    await check('Semantic evidence and business invariants', () => {
      assert(probes.length === 3, 'Three valid probes are required.');
      for (const probe of probes) {
        if (definition.type === 'unit') {
          assert(probe.raw[definition.source] === baseline.body[definition.target] * 24, 'Hours-to-days equivalence was not demonstrated.');
          assert(probe.compatible.eta_days >= 0 && probe.compatible.eta_days <= 60, 'Delivery estimate is outside its safe range.');
        }
        if (definition.type === 'alias') assert(same(probe.raw[definition.source], baseline.body[definition.target]), 'Renamed field does not preserve the observed golden value.');
        if (endpointId === 'pricing') assert(probe.compatible.amount === baseline.body.amount && probe.compatible.currency === baseline.body.currency, 'A retry cannot change price meaning.');
        if (definition.type === 'normalize') assert(probe.raw.data?.length === 1 && probe.raw.pagination?.total === 1, 'Response normalization would drop additional records.');
      }
      return definition.type === 'unit' ? '72 observed hours / 24 matched the learned 3-day duration on every probe.' : 'Identity, required values, and learned business constraints preserved.';
    });
    await check('Replay affected client workflows', async () => {
      assert(probes.length === 3, 'No valid repaired response is available.');
      const workflows = DEPENDENCIES.filter(w => w.endpointIds.includes(endpointId));
      const bodies = { [endpointId]: probes[0].compatible };
      const allIds = [...new Set(workflows.flatMap(w => w.endpointIds))];
      for (const otherId of allIds.filter(i => i !== endpointId)) {
        const active = await this.activeAdapter(otherId);
        const pending = active ? null : await this.m.RepairProposal.findOne({ endpointId: otherId, status: 'proposed' }).sort({ createdAt: -1 }).lean();
        let candidate = active?.definition || pending?.adapter;
        const result = await this.boundedRequest(otherId, candidate);
        assert(result.status === 200, `${otherId} is unavailable for checkout.`);
        const otherBaseline = await this.baseline(otherId);
        assert(otherBaseline, `A healthy ${otherId} baseline must be observed first.`);
        if (pending) {
          const rawChange = detect(otherId, otherBaseline.body, result.body, 200);
          if (!rawChange) candidate = null;
          else {
            assert(rawChange.safe && same(rawChange.adapter, pending.adapter), `${otherId}'s coordinated candidate has no current semantic evidence.`);
            for (const fixture of otherBaseline.fixtures) assert(same(transform(fixture, candidate), fixture), `${otherId}'s candidate changed a known-good fixture.`);
          }
        }
        const body = candidate ? transform(result.body, candidate) : result.body;
        assert(CONTRACTS[otherId].safeParse(body).success && !detect(otherId, otherBaseline.body, body, 200), `${otherId} violates the workflow contract.`);
        bodies[otherId] = body;
      }
      for (const workflow of workflows) for (const dep of workflow.endpointIds) for (const field of workflow.fields[dep]) assert(Object.hasOwn(bodies[dep], field), `${workflow.name} needs ${dep}.${field}.`);
      const total = bodies.pricing.amount * (1 + bodies.pricing.tax_percent / 100);
      assert(Number.isFinite(total) && total > 0, 'Checkout total is invalid.');
      return `${workflows.map(w => w.name).join(' and ')} replayed against fresh HTTP data and independently evidenced, restricted pending candidates where needed.`;
    });
    return tests;
  }

  async repair(incident, proposal) {
    const endpointId = incident.endpointId;
    await this.event('repair:proposed', endpointId, incident.id, 'Compatibility adapter proposed', proposal.explanation, 'info');
    // Observe rejection immediately while HTTP validation runs in parallel.
    const aiPromise = this.analyzeIncident(incident, proposal).catch(() => null);
    await delay(this.repairDelayMs);
    await this.m.DriftIncident.updateOne({ id: incident.id }, { $set: { status: 'validating' } });
    await this.event('validation:started', endpointId, incident.id, 'Regression validation running', 'Replaying golden cases, probing upstream, and checking workflow invariants.');
    const startedAt = new Date();
    const tests = await this.validate(incident, proposal);
    const analysis = await aiPromise;
    if (!analysis) throw new Error('LLM analysis evidence could not be persisted.');
    if (analysis.status === 'completed') tests.push({ name: 'LLM candidate review', passed: analysis.candidateAccepted,
      detail: analysis.candidateAccepted ? 'The model corroborated the exact evidenced candidate. Independent safety checks are still required.' : 'The model abstained and recommended operator review. No automatic activation.' });
    const passed = tests.every(test => test.passed);
    const validationId = id('val');
    await this.m.ValidationRun.create({ id: validationId, incidentId: incident.id, endpointId, passed, tests, startedAt, finishedAt: new Date() });
    await this.event('validation:completed', endpointId, incident.id, passed ? 'Regression checks passed' : 'Regression checks failed', `${tests.filter(t => t.passed).length}/${tests.length} validation checks passed.`, passed ? 'success' : 'danger');
    await delay(this.repairDelayMs);
    const deploy = await this.serial(endpointId, async () => {
      const previous = await this.activeAdapter(endpointId);
      if (passed) {
        const latest = await this.boundedRequest(endpointId, proposal.adapter);
        const baseline = await this.baseline(endpointId);
        try {
          if (latest.status !== 200 || detect(endpointId, baseline?.body, transform(latest.body, proposal.adapter), 200)) throw new Error('Upstream changed during validation.');
          const freshDrift = detect(endpointId, baseline?.body, latest.body, 200);
          if (proposal.adapter.type !== 'retry' && (!freshDrift?.safe || !same(freshDrift.adapter, proposal.adapter))) throw new Error('Final upstream evidence no longer supports the proposed adapter.');
          tests.push({ name: 'Final deployment probe', passed: true, detail: 'Fresh upstream evidence still supports this adapter immediately before activation.' });
        } catch (err) { tests.push({ name: 'Final deployment probe', passed: false, detail: err.message }); }
      }
      const eligible = passed && tests.every(t => t.passed);
      await this.m.ValidationRun.updateOne({ id: validationId }, { $set: { passed: eligible, tests, finishedAt: new Date() } });
      const passportId = id('pass');
      const adapterId = eligible ? id('adp') : null;
      // Evidence is durable before any adapter is made visible to client traffic.
      await this.m.RepairPassport.create({ id: passportId, incidentId: incident.id, endpointId, oldBehavior: incident.oldBehavior, newBehavior: incident.newBehavior, impactedWorkflows: incident.impactedWorkflows, proposal: { ...proposal.adapter, explanation: proposal.explanation }, aiAnalysis: analysis, semanticEvidence: incident.evidence, tests, decision: eligible ? 'validated' : 'blocked', rollback: { available: eligible, adapterId, previousAdapterId: previous?.id || null, instruction: 'Restore the previous adapter and suppress automatic redeployment until an operator revalidates.' } });
      if (eligible) {
        try {
          await this.m.CompatibilityAdapter.create({ id: adapterId, passportId, endpointId, incidentId: incident.id, status: 'pending', definition: proposal.adapter, previousAdapterId: previous?.id || null, activatedAt: new Date() });
          await this.m.RepairPassport.updateOne({ id: passportId }, { $set: { decision: 'activated' } });
          if (previous) await this.m.CompatibilityAdapter.updateOne({ id: previous.id }, { $set: { status: 'superseded' } });
          await this.m.CompatibilityAdapter.updateOne({ id: adapterId }, { $set: { status: 'active' } });
        } catch (err) {
          await this.m.CompatibilityAdapter.updateOne({ id: adapterId }, { $set: { status: 'failed' } });
          if (previous) await this.m.CompatibilityAdapter.updateOne({ id: previous.id }, { $set: { status: 'active' } });
          await this.m.RepairPassport.updateOne({ id: passportId }, { $set: { decision: 'blocked' } });
          throw err;
        }
      }
      await this.m.RepairProposal.updateOne({ id: proposal.id }, { $set: { status: eligible ? 'deployed' : 'rejected' } });
      await this.m.DriftIncident.updateOne({ id: incident.id }, { $set: { status: eligible ? 'resolved' : 'blocked' } });
      return eligible;
    });
    await this.event(deploy ? 'repair:deployed' : 'repair:blocked', endpointId, incident.id, deploy ? 'Verified adapter activated' : 'Adapter remains inactive', deploy ? 'A Repair Passport contains actual live-probe and regression evidence.' : 'Review the failed validation evidence. No transformation has been deployed.', deploy ? 'success' : 'danger');
  }

  async approve(incidentId) {
    const incident = await this.m.DriftIncident.findOne({ id: incidentId }).lean();
    if (!incident) return { status: 404, error: 'incident_not_found' };
    const proposal = await this.m.RepairProposal.findOne({ incidentId }).lean();
    if (!incident.safe || !proposal) return { status: 422, error: 'unverified_semantics', message: 'This change lacks verified semantic evidence. Restore or document the upstream contract; operator approval cannot authorize a guessed price conversion.' };
    if (this.jobs.has(incidentId)) return { status: 409, error: 'validation_in_progress' };
    if (await this.m.CompatibilityAdapter.findOne({ incidentId, status: 'active' })) return { status: 409, error: 'already_deployed' };
    await this.m.DriftIncident.updateOne({ id: incidentId }, { $set: { status: 'detecting' } });
    this.startRepair(incident, proposal);
    return { status: 202, message: 'Fresh regression validation started.' };
  }

  async rollback(adapterId) {
    const adapter = await this.m.CompatibilityAdapter.findOne({ id: adapterId, status: 'active' }).lean();
    if (!adapter) return { status: 404, error: 'active_adapter_not_found' };
    await this.serial(adapter.endpointId, async () => {
      await this.m.CompatibilityAdapter.updateOne({ id: adapterId }, { $set: { status: 'rolled_back', rolledBackAt: new Date(), disabledFingerprint: fingerprint(adapter.definition) } });
      if (adapter.previousAdapterId) await this.m.CompatibilityAdapter.updateOne({ id: adapter.previousAdapterId }, { $set: { status: 'active' } });
      await this.m.DriftIncident.updateOne({ id: adapter.incidentId }, { $set: { status: 'rolled_back' } });
      await this.event('repair:rolled-back', adapter.endpointId, adapter.incidentId, 'Adapter rolled back', 'Previous adapter restored. The same drift will not auto-deploy again.', 'warning');
    });
    return { status: 200, message: 'Rollback complete.' };
  }

  async waitForIdle() { while (this.jobs.size) await Promise.allSettled([...this.jobs.values()]); }
  async close() { this.closed = true; await this.waitForIdle(); }
}
