import { useEffect, useState } from 'react';
import { Activity, ArrowRight, Braces, Check, ChevronDown, CircleDot, Database, ExternalLink, FlaskConical, KeyRound, RefreshCw, RotateCcw, Save, Server, Settings2, ShieldAlert, Sparkles, TerminalSquare, Undo2, X } from 'lucide-react';
import { dashboardUrl, providerPage, shopflowUrl, useAdminFeed, useConnection } from './api.js';
import { Badge, Button, ConnectionForm, humanTime, JsonView, Modal, number, readable } from './components.jsx';

const endpoints = [
  { id: 'customer', label: 'Customer API', short: 'Customer', path: '/api/customer/rahul', description: 'Identity, contact, and membership data.', color: 'violet' },
  { id: 'pricing', label: 'Pricing API', short: 'Pricing', path: '/api/pricing/phoenix-pro', description: 'Product price, currency, and tax data.', color: 'amber' },
  { id: 'shipping', label: 'Shipping API', short: 'Shipping', path: '/api/shipping/phoenix-pro', description: 'Delivery estimate, carrier, and destination.', color: 'cyan' },
];

const fields = {
  customer: [['name', 'Customer name', 'text'], ['email', 'Email address', 'email'], ['tier', 'Membership tier', 'text']],
  pricing: [['product_name', 'Product name', 'text'], ['amount', 'Price amount', 'number'], ['tax_percent', 'Tax percent', 'number']],
  shipping: [['carrier', 'Carrier', 'text'], ['eta_days', 'ETA in days', 'number'], ['destination', 'Destination', 'text']],
};

function DataEditor({ endpointId, record, revision, disabled, pending, onSave }) {
  const editable = fields[endpointId];
  const build = () => Object.fromEntries(editable.map(([key]) => [key, record?.[key] ?? '']));
  const [values, setValues] = useState(build);
  useEffect(() => setValues(build()), [endpointId, revision]);
  return <form className="lab-editor" onSubmit={(event) => {
    event.preventDefault();
    const parsed = Object.fromEntries(editable.map(([key, , type]) => [key, type === 'number' ? Number(values[key]) : values[key]]));
    onSave(endpointId, parsed);
  }}>
    <div className="lab-section-title"><div><span>LIVE DATA</span><h3>Change real values</h3></div><Database size={19} /></div>
    <p className="lab-help">Edit these values, save them, then refresh ShopFlow. The provider sends the new data through a real HTTP request.</p>
    <div className="lab-fields">{editable.map(([key, label, type]) => <label key={key}>{label}<input required type={type} min={type === 'number' ? 0 : undefined} step={key === 'amount' || key === 'tax_percent' ? '0.01' : undefined} value={values[key]} disabled={disabled} onChange={(event) => setValues({ ...values, [key]: event.target.value })} /></label>)}</div>
    <Button className="lab-save" type="submit" loading={pending} disabled={disabled}><Save size={15} />Save live response</Button>
  </form>;
}

function ScenarioControl({ endpoint, data, apply, pending, disabled }) {
  const scenarios = (data?.scenarios || []).filter(item => item.endpointId === endpoint.id);
  const active = data?.active?.[endpoint.id] || '';
  const [choice, setChoice] = useState(active);
  useEffect(() => setChoice(active), [active]);
  const selected = scenarios.find(item => item.id === choice);
  const groups = [
    ['Minor / auto-fix candidate', scenarios.filter(item => item.safety === 'repairable')],
    ['Major / manual decision', scenarios.filter(item => ['blocked', 'unsafe', 'review'].includes(item.safety))],
    ['Healthy', scenarios.filter(item => item.safety === 'safe')],
  ];
  return <section className="scenario-card lab-scenario">
    <div className="lab-section-title"><div><span>CHANGE INJECTOR</span><h2>{endpoint.label}</h2></div><FlaskConical size={20} /></div>
    <p>{endpoint.description}</p>
    <code className="lab-route"><b>GET</b>{endpoint.path}</code>
    <label className="scenario-label" htmlFor={`scenario-${endpoint.id}`}>Choose behavior</label>
    <div className="scenario-select lab-select"><select id={`scenario-${endpoint.id}`} value={choice} disabled={disabled || !scenarios.length} onChange={event => setChoice(event.target.value)}>{groups.map(([label, items]) => items.length > 0 && <optgroup label={label} key={label}>{items.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</optgroup>)}</select><ChevronDown size={15} /></div>
    {selected && <div className="lab-change-card"><div><Badge value={selected.safety}>{selected.safety === 'repairable' ? 'minor / repairable' : selected.safety}</Badge><span>{selected.change}</span></div><strong>{selected.description}</strong><small>Expected Phoenix action: {selected.expected}</small></div>}
    <Button className="lab-apply" disabled={disabled || !selected || choice === active} loading={pending} onClick={() => apply(endpoint.id, choice)}><Sparkles size={15} />Apply scenario<ArrowRight size={15} /></Button>
    <p className="lab-truth"><ShieldAlert size={14} />This changes server runtime state. Phoenix sees it only after the gateway makes the next API call.</p>
  </section>;
}

function ResponsePreview({ endpoint, data }) {
  const preview = data?.previews?.[endpoint.id];
  const active = data?.active?.[endpoint.id];
  return <section className="lab-response">
    <div className="lab-response-bar"><div><CircleDot size={15} /><span>Next real response</span></div><div className={`lab-http ${preview?.status >= 400 ? 'bad' : ''}`}>HTTP {preview?.status ?? '---'}</div></div>
    <div className="lab-response-meta"><span>runtime revision <b>#{data?.revision ?? '-'}</b></span><span>request <b>#{preview?.nextRequest ?? '-'}</b></span><span>scenario <b>{active || '-'}</b></span></div>
    <div className="lab-code"><div className="lab-code-head"><span><i className="dot red" /><i className="dot yellow" /><i className="dot green" /></span><code>response.json</code><span>{preview?.raw ? 'RAW / INVALID' : 'JSON'}</span></div><pre>{preview ? (typeof preview.body === 'string' ? preview.body : JSON.stringify(preview.body, null, 2)) : '// Connect to load the generated response'}</pre></div>
    <div className="lab-proof"><Check size={16} /><div><strong>Same generator, no mock preview</strong><p>The JSON shown here is created by the same backend function used by <code>{endpoint.path}</code>.</p></div></div>
  </section>;
}

function ActivityLog({ logs, onInspect }) {
  return <section className="lab-activity"><div className="lab-panel-head"><div><span>SERVER EVIDENCE</span><h2>Actual request activity</h2></div><span>{logs.length} events</span></div>
    <div className="lab-log-head"><span>TIME</span><span>EVENT</span><span>ENDPOINT</span><span>RESULT</span><span /></div>
    {logs.length ? logs.slice(0, 12).map((entry, index) => <div className="lab-log-row" key={`${entry.at}-${index}`}><time>{humanTime(entry.at)}</time><span><i className={entry.type === 'request' ? 'live' : ''} />{readable(entry.type)}</span><code>{entry.endpointId || 'all'}</code><span>{entry.status ? <b className={entry.status >= 400 ? 'bad' : ''}>HTTP {entry.status}</b> : readable(entry.scenario || entry.message)}</span><button onClick={() => onInspect(entry)}>Inspect</button></div>) : <div className="lab-empty"><Activity size={25} /><strong>No traffic yet</strong><p>Open ShopFlow or run a gateway probe. Real server requests will appear here.</p></div>}
  </section>;
}

export default function Provider() {
  const [connection, configure] = useConnection('provider');
  const feed = useAdminFeed(connection, 'provider');
  const [endpointId, setEndpointId] = useState('customer');
  const [showConnection, setShowConnection] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const endpoint = endpoints.find(item => item.id === endpointId);
  const run = async (key, path, body, message) => {
    setPending(key); setNotice(null);
    try { await feed.mutate(path, body); setNotice({ type: 'success', message }); setShowReset(false); }
    catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setPending(''); }
  };
  const apply = (id, scenario) => run(`scenario:${id}`, '/admin/scenario', { endpointId: id, scenario }, `${id} scenario updated. The next real API request will use this behavior.`);
  const save = (id, values) => run(`data:${id}`, '/admin/data', { endpointId: id, values }, `${id} live data updated. This is now the provider's real response data.`);
  const logs = feed.data?.log || [];

  return <div className="provider-lab">
    <header className="lab-nav"><a className="lab-brand" href="/provider"><span><TerminalSquare size={19} /></span><div><strong>UPSTREAM</strong><small>API CHANGE LAB</small></div></a><div className="lab-nav-center"><span className={feed.data && !feed.error ? 'online' : ''}><i />{feed.data && !feed.error ? 'Provider online' : 'Provider disconnected'}</span><code>{connection.url}</code></div><nav><a href={dashboardUrl}>Phoenix dashboard<ExternalLink size={14} /></a><a href={shopflowUrl} target="_blank" rel="noreferrer">ShopFlow<ExternalLink size={14} /></a><button aria-label="Provider connection" onClick={() => setShowConnection(true)}><Settings2 size={17} /></button></nav></header>
    <main className="lab-main">
      <section className="lab-hero"><div><span className="lab-kicker"><FlaskConical size={14} />LIVE PROVIDER SANDBOX</span><h1>Break the API.<br /><em>Watch Phoenix respond.</em></h1><p>Edit live data or inject a contract change. Every result below comes from the independent Express provider server.</p></div><div className="lab-stats"><div><span>RUNTIME REVISION</span><strong>#{feed.data?.revision ?? '-'}</strong><small>{feed.data?.updatedAt ? `changed ${humanTime(feed.data.updatedAt)}` : 'waiting for provider'}</small></div><div><span>REAL API REQUESTS</span><strong>{number(feed.data?.requests)}</strong><small>server-side calls received</small></div><div><span>ACTIVE CHANGES</span><strong>{feed.data ? Object.values(feed.data.active).filter(value => value !== 'normal').length : '-'}</strong><small>across 3 endpoints</small></div></div></section>

      {!connection.token && <div className="lab-alert"><KeyRound size={20} /><div><strong>Provider token required</strong><p>Connect once to control runtime data and see server evidence.</p></div><button onClick={() => setShowConnection(true)}>Connect provider<ArrowRight size={15} /></button></div>}
      {feed.error && <div className="lab-notice error" role="alert"><ShieldAlert size={17} />{feed.error}</div>}
      {notice && <div className={`lab-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}><Check size={17} />{notice.message}<button aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={15} /></button></div>}

      <div className="lab-toolbar"><div className="lab-tabs" role="tablist" aria-label="Provider endpoints">{endpoints.map(item => <button key={item.id} role="tab" aria-selected={item.id === endpointId} className={item.id === endpointId ? 'active' : ''} onClick={() => setEndpointId(item.id)}><span className={`lab-endpoint-icon ${item.color}`}><Braces size={17} /></span><span><b>{item.short}</b><small>{item.path}</small></span><Badge value={feed.data?.active?.[item.id] === 'normal' ? 'normal' : 'drift'}>{feed.data?.active?.[item.id] || 'offline'}</Badge></button>)}</div><div className="lab-actions"><button onClick={feed.refresh} disabled={!connection.token || feed.busy}><RefreshCw size={15} className={feed.busy ? 'spin' : ''} />Refresh</button><button onClick={() => setShowReset(true)} disabled={!feed.data || !!pending}><Undo2 size={15} />Reset lab</button></div></div>

      <div className="lab-workspace">
        <ScenarioControl endpoint={endpoint} data={feed.data} apply={apply} pending={pending === `scenario:${endpoint.id}`} disabled={!feed.data || !!feed.error || !!pending} />
        <ResponsePreview endpoint={endpoint} data={feed.data} />
        <DataEditor endpointId={endpoint.id} record={feed.data?.records?.[endpoint.id]} revision={feed.data?.revision} disabled={!feed.data || !!feed.error || !!pending} pending={pending === `data:${endpoint.id}`} onSave={save} />
      </div>

      <div className="lab-flow"><span><Server size={17} />Provider runtime</span><ArrowRight size={16} /><span><Activity size={17} />Real HTTP call</span><ArrowRight size={16} /><span><Sparkles size={17} />LLM reviews evidence</span><ArrowRight size={16} /><span><Check size={17} />Tests decide repair</span></div>
      <ActivityLog logs={logs} onInspect={setSelectedLog} />
    </main>
    <footer className="lab-footer"><span>Independent upstream simulation</span><span>API Phoenix demo environment</span><span>{feed.data?.lastChange?.message || 'No runtime change recorded'}</span></footer>

    {showConnection && <Modal title="Provider connection" onClose={() => setShowConnection(false)}><ConnectionForm connection={connection} configure={configure} label="Provider" sameOrigin={providerPage} onDone={() => setShowConnection(false)} /></Modal>}
    {showReset && <Modal title="Reset the API Change Lab?" onClose={() => setShowReset(false)}><p className="detail-summary">This restores all scenarios and editable provider values. Phoenix incident history is kept separately.</p><div className="form-actions"><Button className="button-primary" loading={pending === 'reset'} onClick={() => run('reset', '/admin/reset', undefined, 'Provider scenarios and live data restored to defaults.')}><RotateCcw size={15} />Reset provider</Button><Button onClick={() => setShowReset(false)}>Cancel</Button></div></Modal>}
    {selectedLog && <Modal title="Server evidence" onClose={() => setSelectedLog(null)} wide><JsonView value={selectedLog} label="Recorded by the provider backend" /></Modal>}
  </div>;
}
