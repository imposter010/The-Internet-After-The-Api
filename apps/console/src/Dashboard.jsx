import { useMemo, useState } from 'react';
import { Activity, ArrowRight, CheckCheck, Clock3, Code2, FileCheck2, GitBranch, Layers3, Radar, ShieldCheck, ShieldX, Undo2, Zap } from 'lucide-react';
import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow } from '@xyflow/react';
import { Badge, Button, Diff, DownloadJson, Empty, humanTime, JsonView, Modal, number, Panel, readable, ViewAll } from './components.jsx';
import { AiAnalysis } from './AI.jsx';

const metricDefinitions = [
  { key: 'observations', label: 'API observations', icon: Activity, tone: 'muted', sub: 'Responses inspected' },
  { key: 'drifts', label: 'Drifts detected', icon: GitBranch, tone: 'orange', sub: 'Contract & behavior changes' },
  { key: 'verifiedRepairs', label: 'Verified repairs', icon: ShieldCheck, tone: 'teal', sub: 'Validated by the gateway' },
  { key: 'safetyBlocks', label: 'Safety blocks', icon: ShieldX, tone: 'red', sub: 'Unsafe behavior contained' },
  { key: 'upstreamErrors', label: 'Upstream errors', icon: Zap, tone: 'muted', sub: 'Provider error responses' },
];

export function Metrics({ data }) {
  return <div className="metric-grid">{metricDefinitions.map(({ key, label, icon: Icon, tone, sub }) => <div className={`metric metric-${tone}`} key={key}><div className="metric-top"><span>{label}</span><Icon size={17} /></div><div className="metric-value">{number(data?.metrics?.[key])}</div><div className="metric-sub">{sub}</div></div>)}</div>;
}

export function ServiceList({ data }) {
  const services = data?.services || [];
  return <Panel title="Connected services" eyebrow="UPSTREAM HEALTH" action={<span className="count-label">{data ? `${services.length} services` : 'Awaiting snapshot'}</span>}>
    {services.length ? <div className="service-list">{services.map((service) => <div className="service-row" key={service.id}><div className="service-icon"><Code2 size={18} /></div><div className="service-name"><strong>{service.name || service.id}</strong><span>Last seen {humanTime(service.lastSeen)}</span></div><div className="service-stats"><strong>{number(service.requests)}</strong><span>requests</span></div><div className="service-stats"><strong>{number(service.latencyMs)}<small> ms</small></strong><span>latency</span></div><Badge value={service.status} /></div>)}</div>
      : <Empty title="Waiting for upstream observations" detail="Run a probe or open ShopFlow to send real requests through the gateway." icon={Radar} />}
  </Panel>;
}

const nodeTypes = { endpoint: EndpointNode, workflow: WorkflowNode };

function EndpointNode({ data }) {
  return <div className="flow-node endpoint-node"><Handle type="source" position={Position.Right} /><div className="node-icon"><Code2 size={17} /></div><span className="node-eyebrow">API ENDPOINT</span><strong>{data.label}</strong><code title={data.endpointId}>{data.endpointId}</code><Badge value={data.status} />{data.incidents > 0 && <small className="node-warning">{data.incidents} open incident{data.incidents !== 1 ? 's' : ''}</small>}</div>;
}

function WorkflowNode({ data }) {
  return <div className="flow-node workflow-node"><Handle type="target" position={Position.Left} /><div className="node-icon workflow-icon"><Layers3 size={17} /></div><span className="node-eyebrow">WORKFLOW</span><strong>{data.label}</strong><span className="node-fields">{data.count} API dependenc{data.count === 1 ? 'y' : 'ies'}</span>{data.impacts.length ? <Badge value={data.impacts[0].severity || 'impacted'} tone="orange">impacted</Badge> : <span className="node-neutral">Declared dependency</span>}</div>;
}

export function DependencyGraph({ data, compact = false }) {
  const [selection, setSelection] = useState(null);
  const { nodes, edges } = useMemo(() => {
    const dependencies = data?.dependencies || [];
    const endpointIds = [...new Set(dependencies.flatMap((workflow) => workflow.endpointIds || []))];
    const incidents = (data?.incidents || []).filter((incident) => !['resolved', 'repaired', 'closed', 'recovered'].includes(incident.status));
    const endpoints = endpointIds.map((endpointId, index) => {
      const service = (data?.services || []).find((item) => item.endpointId === endpointId);
      const observed = (data?.observations || []).some((item) => item.endpointId === endpointId);
      return { id: `endpoint:${endpointId}`, type: 'endpoint', position: { x: 30, y: index * 180 + 20 }, data: { label: service?.name || endpointId, endpointId, status: service?.status || (observed ? 'observed' : 'unobserved'), incidents: incidents.filter((item) => item.endpointId === endpointId).length } };
    });
    const workflows = dependencies.map((workflow, index) => ({ id: `workflow:${workflow.id}`, type: 'workflow', position: { x: 450, y: index * 180 + 20 }, data: { label: workflow.name || workflow.id, count: workflow.endpointIds?.length || 0, workflow, impacts: incidents.flatMap((item) => item.impactedWorkflows || []).filter((item) => item.id === workflow.id) } }));
    const connections = dependencies.flatMap((workflow) => (workflow.endpointIds || []).map((endpointId) => {
      const impacted = incidents.some((item) => item.endpointId === endpointId && (item.impactedWorkflows || []).some((impact) => impact.id === workflow.id));
      return { id: `${endpointId}:${workflow.id}`, source: `endpoint:${endpointId}`, target: `workflow:${workflow.id}`, type: 'smoothstep', animated: impacted, style: { stroke: impacted ? '#f48b56' : '#4a7770', strokeWidth: impacted ? 2 : 1.5 } };
    }));
    return { nodes: [...endpoints, ...workflows], edges: connections };
  }, [data]);
  return <Panel title="Workflow dependency map" eyebrow="THE CONNECTED PICTURE" className={compact ? 'graph-panel graph-compact' : 'graph-panel'} action={<div className="graph-legend"><span><i className="teal" />dependency</span><span><i className="orange" />impacted</span></div>}>
    {nodes.length ? <><div className="graph-canvas" role="region" aria-label="Live API workflow dependency graph"><ReactFlow key={nodes.map((node) => node.id).join('|')} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.25, maxZoom: compact ? 0.75 : 1 }} minZoom={0.3} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, node) => setSelection(node.data)} colorMode="dark" proOptions={{ hideAttribution: true }}><Background color="#303234" gap={22} variant={BackgroundVariant.Dots} /><Controls showInteractive={false} /></ReactFlow></div>{selection && <div className="graph-inspector"><strong>{selection.label}</strong>{selection.workflow ? <><p>Consumes {(selection.workflow.endpointIds || []).join(', ')}</p><JsonView value={selection.workflow.fields} label="Declared fields" /></> : <p><code>{selection.endpointId}</code> · status: {selection.status}</p>}</div>}<div className="graph-footer"><GitBranch size={14} />Edges come from the gateway’s declared workflow dependencies. Select a node to inspect.</div></>
      : <Empty title="No dependency graph yet" detail="The graph appears when the gateway returns workflow definitions. No connections are assumed." icon={GitBranch} />}
  </Panel>;
}

export function LatencyChart({ data }) {
  const samples = useMemo(() => (data?.observations || []).filter((item) => typeof item.latencyMs === 'number' && Number.isFinite(item.latencyMs)).sort((a, b) => new Date(a.at) - new Date(b.at)).slice(-40), [data]);
  const width = 600; const height = 120; const pad = 9;
  const maximum = Math.max(1, ...samples.map((item) => item.latencyMs));
  const points = samples.map((item, index) => `${samples.length === 1 ? width / 2 : pad + (index / (samples.length - 1)) * (width - pad * 2)},${height - pad - (Math.max(0, item.latencyMs) / maximum) * (height - pad * 2)}`).join(' ');
  const average = samples.length ? Math.round(samples.reduce((sum, item) => sum + item.latencyMs, 0) / samples.length) : null;
  return <Panel title="Response latency" eyebrow="REAL OBSERVATIONS" action={<span className="count-label">{samples.length} samples</span>}>
    {samples.length ? <div className="latency-content"><div className="latency-summary"><strong>{average}<span> ms</span></strong><span>average of displayed observations</span></div><div className="latency-chart"><span className="chart-max">{Math.round(maximum)} ms</span><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Latency from ${samples.length} real API observations, averaging ${average} milliseconds`} preserveAspectRatio="none"><defs><linearGradient id="latency-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#77cbbb" stopOpacity="0.18" /><stop offset="100%" stopColor="#77cbbb" stopOpacity="0" /></linearGradient></defs>{[0.25, 0.5, 0.75].map((value) => <line key={value} x1="0" x2={width} y1={height * value} y2={height * value} stroke="#2a2c30" strokeDasharray="3 5" />)}{samples.length > 1 && <polygon points={`${pad},${height} ${points} ${width - pad},${height}`} fill="url(#latency-fill)" />}<polyline points={points} fill="none" stroke="#79cfbc" strokeWidth="2" vectorEffect="non-scaling-stroke" />{samples.length === 1 && <circle cx={width / 2} cy={height - pad - samples[0].latencyMs / maximum * (height - pad * 2)} r="3" fill="#79cfbc" />}</svg><div className="chart-labels"><span>{humanTime(samples[0].at)}</span><span>0 ms · oldest → newest</span><span>{humanTime(samples.at(-1).at)}</span></div></div></div>
      : <Empty title="No latency samples" detail="Response times are plotted only after real requests are observed." icon={Activity} />}
  </Panel>;
}

export function IncidentList({ data, onSelect, limit, onViewAll }) {
  const all = [...(data?.incidents || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const incidents = limit ? all.slice(0, limit) : all;
  return <Panel title={limit ? 'Recent incidents' : 'Drift incidents'} eyebrow="DETECT · EXPLAIN · REPAIR" action={onViewAll ? <ViewAll onClick={onViewAll} /> : <span className="count-label">{all.length} recorded</span>}>
    {incidents.length ? <div className="incident-list">{incidents.map((incident) => <button key={incident.id} className="incident-row" onClick={() => onSelect(incident.id)}><div className={`incident-symbol ${/(block|unsafe)/.test(incident.status) ? 'red' : 'orange'}`}><GitBranch size={17} /></div><div className="incident-copy"><div className="incident-title"><strong>{incident.title || readable(incident.kind, 'API drift')}</strong><Badge value={incident.status} /></div><p>{incident.summary || incident.endpointId}</p><div className="incident-meta"><code>{incident.endpointId}</code><span>{humanTime(incident.createdAt)}</span><span>{(incident.impactedWorkflows || []).length} impacted workflows</span></div></div><ArrowRight size={16} className="row-arrow" /></button>)}</div>
      : <Empty title="No incidents recorded" detail="Changes detected by the gateway will appear here with evidence and impacted workflows." icon={ShieldCheck} />}
  </Panel>;
}

export function Events({ data, limit }) {
  const events = [...(data?.events || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
  const displayed = limit ? events.slice(0, limit) : events;
  return <Panel title="Activity stream" eyebrow="LIVE FROM THE GATEWAY" action={<span className="count-label">{events.length} events</span>}>
    {displayed.length ? <div className="event-list">{displayed.map((event) => <div className="event-row" key={event.id}><div className={`event-point ${/(error|critical|danger)/.test(event.severity) ? 'red' : /(warn)/.test(event.severity) ? 'orange' : 'teal'}`} /><div><strong>{event.title || event.type}</strong>{event.detail && <p>{readable(event.detail)}</p>}<div className="event-meta"><code>{event.type}</code>{event.serviceId && <span>{event.serviceId}</span>}{event.incidentId && <span>{event.incidentId}</span>}</div></div><time>{humanTime(event.at)}</time></div>)}</div>
      : <Empty title="The stream is quiet" detail="Socket.IO updates will appear as the gateway observes API activity." icon={Activity} />}
  </Panel>;
}

export function Observations({ data }) {
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const all = [...(data?.observations || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
  const endpointIds = [...new Set(all.map((item) => item.endpointId))];
  const observations = filter === 'all' ? all : all.filter((item) => item.endpointId === filter);
  const observation = all.find((item) => item.id === selected);
  return <><Panel title="API observations" eyebrow="THE RESPONSE RECORD" action={<select className="select-compact" aria-label="Filter observations by endpoint" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All endpoints</option>{endpointIds.map((id) => <option key={id} value={id}>{id}</option>)}</select>}>
    {observations.length ? <div className="table-scroll"><table><thead><tr><th>Endpoint</th><th>HTTP status</th><th>Latency</th><th>Observed at</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{observations.map((item) => <tr key={item.id}><td><code>{item.endpointId}</code></td><td><Badge tone={Number(item.status) >= 400 ? 'red' : Number(item.status) >= 200 && Number(item.status) < 300 ? 'teal' : 'muted'}>{readable(item.status)}</Badge></td><td>{number(item.latencyMs)} ms</td><td>{humanTime(item.at)}</td><td><button className="text-button" onClick={() => setSelected(item.id)}>Inspect<ArrowRight size={14} /></button></td></tr>)}</tbody></table></div>
      : <Empty title="No observations to show" detail="Probe the upstream APIs to start recording status codes, latency, and response bodies." icon={Radar} />}
  </Panel>{observation && <Modal title="Response observation" onClose={() => setSelected(null)} wide><div className="detail-meta"><code>{observation.endpointId}</code><span>HTTP {readable(observation.status)}</span><span>{number(observation.latencyMs)} ms</span><span>{humanTime(observation.at)}</span></div><JsonView value={observation.response} label="Observed response" /></Modal>}</>;
}

export function Baselines({ data }) {
  const baselines = data?.baselines || [];
  const [selected, setSelected] = useState(null);
  const baseline = baselines.find((item) => item.endpointId === selected);
  return <><Panel title="Learned baselines" eyebrow="CONTRACT MEMORY" action={<span className="count-label">{baselines.length} baselines</span>}>
    {baselines.length ? <div className="baseline-grid">{baselines.map((item) => <button className="baseline-card" key={item.endpointId} onClick={() => setSelected(item.endpointId)}><Code2 size={20} /><strong>{item.endpointId}</strong><span>{number(Array.isArray(item.samples) ? item.samples.length : item.samples)} samples</span><span className="text-button">Inspect baseline<ArrowRight size={14} /></span></button>)}</div>
      : <Empty title="Learning starts with a real response" detail="There are no baseline contracts yet. Run a probe while the provider is in normal operation." icon={Code2} />}
  </Panel>{baseline && <Modal title="Baseline contract" onClose={() => setSelected(null)} wide><div className="detail-meta"><code>{baseline.endpointId}</code><span>{number(Array.isArray(baseline.samples) ? baseline.samples.length : baseline.samples)} samples</span></div><Diff before={baseline.body} after={baseline.schema} /><p className="form-hint">Left: recorded body. Right: learned schema.</p></Modal>}</>;
}

export function Adapters({ data, onRollback }) {
  const adapters = data?.adapters || [];
  return <Panel title="Repair adapters" eyebrow="VERIFIED COMPATIBILITY" action={<span className="count-label">{adapters.length} adapters</span>}>
    {adapters.length ? <div className="adapter-list">{adapters.map((adapter) => <div key={adapter.id} className="adapter-card"><div className="adapter-heading"><div><strong>{adapter.endpointId}</strong><code>{adapter.id}</code></div><Badge value={adapter.status} /></div><JsonView value={adapter.definition} label="Adapter definition" /><Button disabled={adapter.status !== 'active'} onClick={() => onRollback(adapter)}><Undo2 size={14} />Roll back adapter</Button></div>)}</div>
      : <Empty title="No adapters installed" detail="Only repairs verified by the gateway appear here. Each adapter can be rolled back." icon={CheckCheck} />}
  </Panel>;
}

export function Passports({ data, onSelect }) {
  const passports = [...(data?.passports || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return <Panel title="Repair passports" eyebrow="EVERY DECISION HAS A RECORD" action={<span className="count-label">{passports.length} passports</span>}>
    {passports.length ? <div className="passport-grid">{passports.map((passport) => <button key={passport.id} className="passport-card" onClick={() => onSelect(passport.id)}><div className="passport-top"><FileCheck2 size={25} /><Badge value={typeof passport.decision === 'string' ? passport.decision : passport.decision?.status || 'recorded'} /></div><span className="eyebrow">REPAIR PASSPORT</span><h3>{passport.endpointId}</h3><code>{passport.id}</code><div className="passport-footer"><span><Clock3 size={13} />{humanTime(passport.createdAt)}</span><ArrowRight size={16} /></div></button>)}</div>
      : <Empty title="No repair passports yet" detail="Detection, semantic evidence, test results, and rollback information will be recorded for each repair decision." icon={FileCheck2} />}
  </Panel>;
}

export function IncidentDetail({ incident, data, onClose, onApprove, pending }) {
  const [tab, setTab] = useState('diff');
  const proposals = (data?.proposals || []).filter((item) => item.incidentId === incident.id);
  const validations = (data?.validations || []).filter((item) => item.incidentId === incident.id);
  return <Modal title={incident.title || 'Drift incident'} onClose={onClose} wide><div className="detail-meta"><Badge value={incident.status} /><code>{incident.endpointId}</code><span>{humanTime(incident.createdAt)}</span></div><p className="detail-summary">{incident.summary}</p>
    <div className="impact-list">{(incident.impactedWorkflows || []).map((workflow) => <span key={workflow.id}><Layers3 size={14} />{workflow.name || workflow.id}<Badge value={workflow.severity} /></span>)}</div>
    <div className="tabs" role="tablist" aria-label="Incident details">{[['diff', 'Behavior diff'], ['evidence', 'Evidence'], ['ai', 'LLM analysis'], ['proposal', 'Repair proposal'], ['tests', 'Validation']].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
    <div className="detail-tab" role="tabpanel">{tab === 'ai' && <AiAnalysis analysis={incident.aiAnalysis} />}{tab === 'diff' && <Diff before={incident.oldBehavior} after={incident.newBehavior} />}{tab === 'evidence' && <JsonView value={incident.evidence} label="Detection evidence" />}{tab === 'proposal' && (proposals.length ? proposals.map((proposal) => <div className="proposal-detail" key={proposal.id}><div className="detail-meta"><Badge value={proposal.status} /><code>{proposal.id}</code></div><p>{readable(proposal.explanation)}</p><JsonView value={proposal.adapter} label="Proposed adapter" /></div>) : <Empty title="No repair proposed" detail="This incident has no gateway-generated proposal." />)}{tab === 'tests' && (validations.length ? validations.map((validation) => <div key={validation.id} className="validation-group"><Badge value={validation.passed ? 'passed' : 'failed'} />{(validation.tests || []).map((test, index) => <div className="test-row" key={index}>{test.passed ? <ShieldCheck size={16} className="teal" /> : <ShieldX size={16} className="red" />}<div><strong>{test.name}</strong><p>{readable(test.detail)}</p></div></div>)}</div>) : <Empty title="No validation recorded" detail="Validation results appear after a proposal is tested." />)}</div>
    <div className="detail-footer"><p>{!proposals.length ? 'No safe repair proposal is available. Restore the original behavior in the provider console and send another request. Approval cannot synthesize a missing field or a trusted price.' : 'Approval asks the gateway to revalidate the proposal. Unsafe price changes are rejected by its safety checks.'}</p><Button className="button-primary" disabled={!proposals.length || ['resolved', 'repaired', 'closed', 'recovered'].includes(incident.status)} loading={pending} onClick={() => onApprove(incident.id)}><ShieldCheck size={16} />Revalidate & approve</Button></div>
  </Modal>;
}

export function PassportDetail({ passport, onClose }) {
  return <Modal title="Repair passport" onClose={onClose} wide><div className="detail-meta"><FileCheck2 size={18} /><code>{passport.id}</code><span>{humanTime(passport.createdAt)}</span></div><h3 className="detail-endpoint">{passport.endpointId}</h3><Diff before={passport.oldBehavior} after={passport.newBehavior} /><AiAnalysis analysis={passport.aiAnalysis} /><div className="passport-details"><JsonView value={passport.impactedWorkflows} label="Impacted workflows" /><JsonView value={passport.proposal} label="Repair proposal" /><JsonView value={passport.semanticEvidence} label="Semantic evidence" /><JsonView value={passport.tests} label="Validation tests" /><JsonView value={passport.decision} label="Decision" /><JsonView value={passport.rollback} label="Rollback record" /></div><div className="form-actions"><DownloadJson value={passport} filename={`phoenix-passport-${String(passport.id).replace(/[^a-zA-Z0-9_-]/g, '')}.json`} /></div></Modal>;
}
