import mongoose from 'mongoose';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ENDPOINTS, DEPENDENCIES } from '@phoenix/shared';
import { createModels } from './models.js';

export async function createStore(uri, secret, ttlDays = 7) {
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const models = createModels(connection, ttlDays);
  await Promise.all(Object.values(models).map(model => model.init()));
  const key = createHash('sha256').update(secret).digest();
  const encrypt = body => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(body)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  };
  const decrypt = text => {
    const buffer = Buffer.from(text, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', key, buffer.subarray(0, 12));
    cipher.setAuthTag(buffer.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(buffer.subarray(28)), cipher.final()]).toString());
  };
  const seed = async () => {
    for (const e of Object.values(ENDPOINTS)) {
      await models.ApiService.updateOne({ id: e.serviceId }, { $setOnInsert: { id: e.serviceId, name: e.name, endpointId: e.id, status: 'unknown', requests: 0, latencyMs: 0 } }, { upsert: true });
      await models.BehavioralInvariant.updateOne({ id: `invariant-${e.id}` }, { $setOnInsert: { id: `invariant-${e.id}`, endpointId: e.id, rules: e.id === 'pricing' ? { maximumMagnitudeRatio: 2, currency: 'INR', unit: 'rupees' } : { preserveIdentity: true, contractRequired: true } } }, { upsert: true });
    }
    for (const dependency of DEPENDENCIES) await models.WorkflowDependency.updateOne({ id: dependency.id }, { $set: dependency }, { upsert: true });
  };
  await seed();
  const list = (name, limit = 100, filter = {}) => models[name].find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  const snapshot = async () => {
    const [services, baselines, observations, incidents, proposals, adapters, validations, passports, events, dependencies] = await Promise.all([
      list('ApiService'), list('EndpointBaseline'), models.ApiObservation.find().sort({ at: -1 }).limit(60).lean(), list('DriftIncident'), list('RepairProposal'), list('CompatibilityAdapter'), list('ValidationRun'), list('RepairPassport'), models.SystemEvent.find().sort({ at: -1 }).limit(60).lean(), list('WorkflowDependency'),
    ]);
    for (const baseline of baselines) delete baseline.encryptedFixtures;
    return {
      persistence: 'mongodb', services, baselines, observations, incidents, proposals, adapters, validations, passports, events, dependencies,
      metrics: {
        observations: services.reduce((sum, s) => sum + s.requests, 0),
        drifts: await models.DriftIncident.countDocuments(),
        verifiedRepairs: await models.RepairPassport.countDocuments({ decision: 'activated' }),
        safetyBlocks: await models.DriftIncident.countDocuments({ status: { $in: ['blocked', 'awaiting_review'] } }),
        upstreamErrors: services.reduce((sum, s) => sum + (s.errorCount || 0), 0),
      },
    };
  };
  const reset = async () => { await Promise.all(Object.values(models).map(m => m.deleteMany({}))); await seed(); };
  return { connection, models, encrypt, decrypt, snapshot, reset, close: () => connection.close() };
}
