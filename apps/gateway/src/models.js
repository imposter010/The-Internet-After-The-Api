import mongoose from 'mongoose';
const { Schema } = mongoose;
const mixed = Schema.Types.Mixed;

export function createModels(connection, ttlDays = 7) {
  const make = (name, definition, indexes = []) => {
    const schema = new Schema({ id: { type: String, required: true, unique: true }, ...definition }, { timestamps: true, versionKey: false });
    for (const [fields, options] of indexes) schema.index(fields, options);
    return connection.model(name, schema);
  };
  return {
    ApiService: make('ApiService', { name: String, endpointId: String, status: String, requests: { type: Number, default: 0 }, errorCount: { type: Number, default: 0 }, latencyMs: Number, lastSeen: Date }),
    EndpointBaseline: make('EndpointBaseline', { endpointId: { type: String, unique: true }, body: mixed, schema: mixed, encryptedFixtures: [String], samples: Number, learnedAt: Date }),
    ApiObservation: make('ApiObservation', { endpointId: String, serviceId: String, request: mixed, response: mixed, schema: mixed, status: Number, latencyMs: Number, at: { type: Date, default: Date.now } }, [[{ endpointId: 1, at: -1 }, {}], [{ at: 1 }, { expireAfterSeconds: ttlDays * 86400 }]]),
    BehavioralInvariant: make('BehavioralInvariant', { endpointId: String, rules: mixed }),
    WorkflowDependency: make('WorkflowDependency', { name: String, endpointIds: [String], fields: mixed }),
    DriftIncident: make('DriftIncident', { endpointId: String, serviceId: String, kind: String, title: String, summary: String, fingerprint: String, status: String, oldBehavior: mixed, newBehavior: mixed, oldSchema: mixed, newSchema: mixed, evidence: mixed, impactedWorkflows: mixed, safe: Boolean, aiAnalysis: mixed, operatorDecision: mixed, createdAt: Date, recoveredAt: Date }, [[{ endpointId: 1, status: 1 }, {}]]),
    RepairProposal: make('RepairProposal', { incidentId: String, endpointId: String, status: String, adapter: mixed, explanation: String, aiExplanation: String, aiAnalysis: mixed }),
    CompatibilityAdapter: make('CompatibilityAdapter', { endpointId: String, incidentId: String, status: String, definition: mixed, passportId: String, previousAdapterId: String, disabledFingerprint: String, activatedAt: Date, rolledBackAt: Date }, [[{ endpointId: 1, status: 1 }, {}], [{ endpointId: 1 }, { unique: true, partialFilterExpression: { status: 'active' } }]]),
    ValidationRun: make('ValidationRun', { incidentId: String, endpointId: String, passed: Boolean, tests: mixed, startedAt: Date, finishedAt: Date }),
    RepairPassport: make('RepairPassport', { incidentId: String, endpointId: String, oldBehavior: mixed, newBehavior: mixed, impactedWorkflows: mixed, proposal: mixed, aiAnalysis: mixed, operatorDecision: mixed, semanticEvidence: mixed, tests: mixed, decision: String, rollback: mixed }),
    SystemEvent: make('SystemEvent', { type: String, title: String, detail: String, severity: String, serviceId: String, incidentId: String, at: { type: Date, default: Date.now } }, [[{ at: -1 }, {}], [{ at: 1 }, { expireAfterSeconds: 30 * 86400 }]]),
  };
}
