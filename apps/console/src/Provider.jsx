import { useState } from 'react';
import { ArrowRight, Braces, Check, ChevronDown, Database, PlugZap, RefreshCw, SlidersHorizontal, Undo2 } from 'lucide-react';
import { useAdminFeed, useConnection } from './api.js';
import { Badge, Button, ConnectionForm, Empty, humanTime, JsonView, Modal, number, Panel, readable } from './components.jsx';
import { Shell } from './App.jsx';

const endpoints = [
  { id: 'customer', label: 'Customer API', path: '/api/customer/rahul', description: 'Identity, contact details, and membership.' },
  { id: 'pricing', label: 'Pricing API', path: '/api/pricing/phoenix-pro', description: 'Product price, currency, and tax behavior.' },
  { id: 'shipping', label: 'Shipping API', path: '/api/shipping/phoenix-pro', description: 'Delivery estimate, carrier, and destination.' },
];

function ScenarioCard({ endpoint, data, apply, pending, disabled }) {
  const [choice, setChoice] = useState('');
  const scenarios = (data?.scenarios || []).filter((scenario) => scenario.endpointId === endpoint.id);
  const active = data?.active?.[endpoint.id];
  const value = scenarios.some((scenario) => scenario.id === choice) ? choice : active || '';
  const selected = scenarios.find((scenario) => scenario.id === value);
  const activeScenario = scenarios.find((scenario) => scenario.id === active);
  return <section className="scenario-card"><div className="scenario-card-top"><div className="scenario-icon"><Braces size={23} /></div><Badge value={active === 'normal' ? 'normal' : activeScenario?.safety || 'unknown'}>{active || 'unobserved'}</Badge></div><h2>{endpoint.label}</h2><p>{endpoint.description}</p><code className="scenario-route">GET {endpoint.path}</code><div className="scenario-current"><span>Current scenario</span><strong>{activeScenario?.label || 'Awaiting provider state'}</strong></div><label className="scenario-label" htmlFor={`scenario-${endpoint.id}`}>Choose behavior</label><div className="scenario-select"><select id={`scenario-${endpoint.id}`} value={value} disabled={disabled || !scenarios.length} onChange={(event) => setChoice(event.target.value)}>{!scenarios.length && <option value="">Connect to load scenarios</option>}{scenarios.map((scenario) => <option value={scenario.id} key={scenario.id}>{scenario.label}</option>)}</select><ChevronDown size={15} /></div><div className="scenario-description">{selected?.description || 'Available scenarios come from the provider API.'}</div>{selected && <div className="scenario-safety"><span>Expected safety classification</span><Badge value={selected.safety} /></div>}<Button className="button-primary scenario-apply" disabled={disabled || !selected || value === active} loading={pending} onClick={() => apply(endpoint.id, value)}><SlidersHorizontal size={15} />Apply scenario<ArrowRight size={15} /></Button></section>;
}

export default function Provider() {
  const [connection, configure] = useConnection('provider');
  const feed = useAdminFeed(connection, 'provider');
  const [showConnection, setShowConnection] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const run = async (key, path, body, message) => {
    setPending(key); setNotice(null);
    try { await feed.mutate(path, body); setNotice({ type: 'success', message }); setShowReset(false); }
    catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setPending(''); }
  };
  const apply = (endpointId, scenario) => run(endpointId, '/admin/scenario', { endpointId, scenario }, `${endpointId} scenario updated. The provider will use this behavior on subsequent requests.`);
  const logs = feed.data?.log || [];
  return <Shell provider page="provider" connection={connection} feed={feed} onConnect={() => setShowConnection(true)}>
    <div className="page-heading"><div><div className="eyebrow"><span className="small-orange-dot" />INDEPENDENT UPSTREAM</div><h1>Provider console<span className="heading-dot">.</span></h1><p>Change the API. Watch the downstream story unfold.</p></div><div className="heading-actions"><Button disabled={!connection.token} loading={feed.busy} onClick={feed.refresh}><RefreshCw size={15} />Refresh</Button><Button disabled={!feed.data || !!pending} onClick={() => setShowReset(true)}><Undo2 size={15} />Restore normal</Button></div></div>
    {!connection.token && <div className="connect-banner"><PlugZap size={22} /><div><strong>Connect to your provider</strong><p>Enter its administration token to load live scenarios and request history.</p></div><Button className="button-primary" onClick={() => setShowConnection(true)}>Configure connection<ArrowRight size={15} /></Button></div>}
    {feed.error && <div className="notice notice-error" role="alert">{feed.error}{feed.data && ' Displaying the last fetched provider state; controls are paused.'}</div>}
    {notice && <div className={`notice notice-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.message}</div>}
    <div className="provider-summary"><div><Database size={18} /><span>Provider requests</span><strong>{number(feed.data?.requests)}</strong></div><div><Check size={18} /><span>Configured endpoint APIs</span><strong>{feed.data ? Object.keys(feed.data.active).length : '—'}</strong></div><div><RefreshCw size={18} /><span>Last state fetch</span><strong>{feed.updatedAt ? humanTime(feed.updatedAt) : '—'}</strong></div></div>
    <div className="provider-note"><span className="outline-chip">Provider → HTTP → Gateway</span><p>Each change affects only this upstream server. Phoenix discovers it through ordinary API requests.</p></div>
    <div className="scenario-grid">{endpoints.map((endpoint) => <ScenarioCard key={endpoint.id} endpoint={endpoint} data={feed.data} apply={apply} pending={pending === endpoint.id} disabled={!feed.data || !!feed.error || !!pending} />)}</div>
    <Panel title="Provider request log" eyebrow="DIRECT FROM THE UPSTREAM" action={<span className="count-label">{logs.length} recent entries</span>}>
      {logs.length ? <div className="table-scroll"><table><thead><tr><th>Time</th><th>Type</th><th>Endpoint</th><th>Scenario / HTTP status</th><th><span className="sr-only">Response</span></th></tr></thead><tbody>{logs.map((entry, index) => <tr key={`${entry.at}-${index}`}><td>{humanTime(entry.at)}</td><td>{readable(entry.type)}</td><td><code>{entry.endpointId || 'all endpoints'}</code></td><td>{entry.status ? <Badge tone={entry.status >= 400 ? 'red' : 'teal'}>HTTP {entry.status}</Badge> : readable(entry.scenario)}</td><td><button className="text-button" onClick={() => setSelectedLog(entry)}>Inspect<ArrowRight size={14} /></button></td></tr>)}</tbody></table></div>
        : <Empty title="No provider requests recorded" detail="Requests and scenario changes will appear here as they reach the upstream server." icon={Database} />}
    </Panel>
    {showConnection && <Modal title="Provider connection" onClose={() => setShowConnection(false)}><ConnectionForm connection={connection} configure={configure} label="Provider" sameOrigin={window.location.port === '8001'} onDone={() => setShowConnection(false)} /></Modal>}
    {showReset && <Modal title="Restore normal API behavior?" onClose={() => setShowReset(false)}><p className="detail-summary">All three provider APIs will return their original contracts. This does not reset Phoenix’s incident history or adapters.</p><div className="form-actions"><Button className="button-primary" loading={pending === 'reset'} onClick={() => run('reset', '/admin/reset', undefined, 'All provider APIs restored to normal behavior.')}><Undo2 size={15} />Restore all APIs</Button><Button onClick={() => setShowReset(false)}>Cancel</Button></div></Modal>}
    {selectedLog && <Modal title="Provider log entry" onClose={() => setSelectedLog(null)} wide><JsonView value={selectedLog} label="Request / change record" /></Modal>}
  </Shell>;
}
