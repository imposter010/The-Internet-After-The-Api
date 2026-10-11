import { useEffect, useState } from 'react';
import { Activity, ArrowRight, ChevronRight, CircleDot, ExternalLink, FileCheck2, Flame, GitBranch, LayoutDashboard, Menu, PlugZap, Radio, RefreshCw, SearchCheck, Settings2, ShieldCheck, SlidersHorizontal, Terminal, Trash2, Undo2, X } from 'lucide-react';
import { dashboardUrl, shopflowUrl, useAdminFeed, useConnection } from './api.js';
import { Adapters, Baselines, DependencyGraph, Events, IncidentDetail, IncidentList, LatencyChart, Metrics, Observations, PassportDetail, Passports, ServiceList } from './Dashboard.jsx';
import { Badge, Button, ConnectionForm, humanTime, Modal, Panel } from './components.jsx';
import Provider from './Provider.jsx';
import { LlmSettings } from './AI.jsx';

const navigation = [
  ['overview', 'Overview', LayoutDashboard],
  ['dependencies', 'Dependency map', GitBranch],
  ['incidents', 'Drift incidents', SearchCheck],
  ['repairs', 'Repairs & passports', FileCheck2],
  ['observations', 'Observations', Activity],
  ['activity', 'Activity stream', Radio],
  ['settings', 'Settings', Settings2],
];
const pageCopy = {
  overview: ['Your APIs, in focus', 'See the change. Understand the impact. Verify the repair.'],
  dependencies: ['Every connection matters', 'Trace API changes to the workflows that depend on them.'],
  incidents: ['Turn drift into clarity', 'Inspect behavior changes, evidence, and affected workflows.'],
  repairs: ['Repairs you can trust', 'Verified adapters. Recorded decisions. A way back.'],
  observations: ['The source of truth', 'Real API responses and the contracts learned from them.'],
  activity: ['Follow the signal', 'Every observation, drift, and repair event from the gateway.'],
  settings: ['Make the connection', 'Point this console at your gateway on the local network.'],
};

export function Shell({ children, provider = false, page, onNavigate, connection, feed, onConnect }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const connectionLabel = !connection.token ? 'Token required' : feed.error ? 'Connection issue' : !feed.data ? 'Awaiting snapshot' : provider ? 'Provider connected' : feed.live ? 'Live updates' : 'Polling updates';
  return <div className="app-shell"><aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}><a className="brand" href={dashboardUrl}><span className="brand-mark"><Flame size={24} fill="currentColor" /></span><span>API <strong>Phoenix</strong><small>RESILIENT BY DESIGN</small></span></a><button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setMobileMenu(false)}><X size={20} /></button><div className="workspace-label">WORKSPACE<span>LOCAL</span></div><nav aria-label="Console navigation">{navigation.map(([key, label, Icon]) => <a key={key} href={`${dashboardUrl === '/' ? '/' : dashboardUrl}#${key}`} className={`nav-item ${!provider && page === key ? 'active' : ''}`} onClick={(event) => { if (!provider) { event.preventDefault(); onNavigate(key); setMobileMenu(false); } }}><Icon size={18} /><span>{label}</span>{key === 'incidents' && feed.data?.incidents?.length > 0 && !provider && <span className="nav-count">{feed.data.incidents.length}</span>}{!provider && page === key && <ChevronRight size={13} className="nav-chevron" />}</a>)}</nav><div className="nav-divider" /><div className="workspace-label">DEMO ENVIRONMENT</div><a href="/provider" className={`nav-item ${provider ? 'active' : ''}`}><SlidersHorizontal size={18} /><span>Provider console</span>{provider && <ChevronRight size={13} />}</a><a href={shopflowUrl} className="nav-item" target="_blank" rel="noreferrer"><ExternalLink size={18} /><span>Open ShopFlow</span><ExternalLink size={12} className="nav-chevron" /></a><div className="sidebar-bottom"><div className="local-card"><span className="local-card-icon"><Terminal size={17} /></span><div><strong>Local network</strong><p>One system. Three viewpoints.</p></div></div><button className="connection-link" onClick={onConnect}><span className={`connection-dot ${feed.data && !feed.error ? 'teal' : 'orange'}`} /><span>{provider ? 'Provider' : 'Gateway'} connection</span><Settings2 size={14} /></button><span className="sidebar-version">API Phoenix / MERN</span></div></aside>
    {mobileMenu && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={() => setMobileMenu(true)} aria-label="Open navigation"><Menu size={20} /></button><span>Workspace</span><ChevronRight size={13} /><strong>{provider ? 'Provider console' : navigation.find(([key]) => key === page)?.[1]}</strong></div><div className="topbar-right"><Badge tone={feed.data && !feed.error ? 'teal' : 'muted'}>{connectionLabel}</Badge><button className="icon-button" aria-label="Configure connection" onClick={onConnect}><Settings2 size={18} /></button><span className="avatar" aria-label="Local administrator">LA</span></div></header><main className="main-content" id="main-content">{children}</main><footer className="app-footer"><span><Flame size={13} />Observe. Adapt. Continue.</span><span>{provider ? 'Independent upstream' : `${feed.data?.persistence || 'Persistence not connected'} · ${feed.data?.aiMode || 'AI mode not reported'}`}</span><span>{feed.updatedAt ? `Updated ${humanTime(feed.updatedAt)}` : 'Awaiting live data'}</span></footer></div></div>;
}

function Console() {
  const initialPage = window.location.hash.slice(1);
  const [page, setPage] = useState(navigation.some(([key]) => key === initialPage) ? initialPage : 'overview');
  const [connection, configure] = useConnection('gateway');
  const feed = useAdminFeed(connection);
  const [showConnection, setShowConnection] = useState(false);
  const [notice, setNotice] = useState(null);
  const [pending, setPending] = useState('');
  const [incidentId, setIncidentId] = useState(null);
  const [passportId, setPassportId] = useState(null);
  const [rollback, setRollback] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  useEffect(() => {
    const sync = () => { const key = window.location.hash.slice(1); if (navigation.some(([id]) => id === key)) setPage(key); };
    window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync);
  }, []);
  const navigate = (key) => { window.location.hash = key; setPage(key); window.scrollTo({ top: 0 }); };
  const run = async (key, path, body, message) => {
    setPending(key); setNotice(null);
    try {
      const result = await feed.mutate(path, body);
      setNotice({ type: 'success', message: typeof result?.message === 'string' ? result.message : message });
      setRollback(null); setResetOpen(false); setConfirmation('');
    } catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setPending(''); }
  };
  const incident = (feed.data?.incidents || []).find((item) => item.id === incidentId);
  const passport = (feed.data?.passports || []).find((item) => item.id === passportId);
  const [title, description] = pageCopy[page];
  return <Shell page={page} onNavigate={navigate} connection={connection} feed={feed} onConnect={() => setShowConnection(true)}><div className="page-heading"><div><div className="eyebrow"><span className="small-orange-dot" />API RESILIENCE CONTROL ROOM</div><h1>{title}<span className="heading-dot">.</span></h1><p>{description}</p></div><div className="heading-actions"><Button onClick={feed.refresh} loading={feed.busy} disabled={!connection.token}><RefreshCw size={15} />Refresh</Button><Button className="button-primary" onClick={() => run('probe', '/admin/probe', undefined, 'Probe completed. The console has fetched the latest gateway snapshot.')} loading={pending === 'probe'} disabled={!connection.token || !!pending}><Activity size={15} />Run probe</Button></div></div>
    {!connection.token && page !== 'settings' && <div className="connect-banner"><PlugZap size={23} /><div><strong>Bring your APIs into view</strong><p>Connect the gateway and enter an administration token to load real observations.</p></div><Button className="button-primary" onClick={() => setShowConnection(true)}>Connect gateway<ArrowRight size={15} /></Button></div>}
    {feed.error && <div className="notice notice-error" role="alert">{feed.error}{feed.data && ' Displaying the last fetched snapshot; it may be stale.'}</div>}
    {notice && <div className={`notice notice-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}><span>{notice.message}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={16} /></button></div>}
    {page === 'overview' && <><Metrics data={feed.data} /><div className="section-caption"><CircleDot size={14} /><span>Operational overview</span><span className="caption-line" /><span className="caption-live">{feed.live && !feed.error ? 'Live via Socket.IO' : feed.data ? 'Latest API snapshot' : 'Waiting for gateway'}</span></div><div className="overview-top"><ServiceList data={feed.data} /><LatencyChart data={feed.data} /></div><div className="overview-middle"><DependencyGraph data={feed.data} compact /><IncidentList data={feed.data} onSelect={setIncidentId} limit={3} onViewAll={() => navigate('incidents')} /></div><Events data={feed.data} limit={6} /></>}
    {page === 'dependencies' && <><DependencyGraph data={feed.data} /><Baselines data={feed.data} /></>}
    {page === 'incidents' && <><Metrics data={feed.data} /><IncidentList data={feed.data} onSelect={setIncidentId} /></>}
    {page === 'repairs' && <><Passports data={feed.data} onSelect={setPassportId} /><Adapters data={feed.data} onRollback={setRollback} /></>}
    {page === 'observations' && <><LatencyChart data={feed.data} /><Observations data={feed.data} /><Baselines data={feed.data} /></>}
    {page === 'activity' && <Events data={feed.data} />}
    {page === 'settings' && <div className="settings-layout"><Panel title="Gateway connection" eyebrow="YOUR LOCAL NETWORK"><ConnectionForm key={`${connection.url}:${!!connection.token}`} connection={connection} configure={configure} label="Gateway" /></Panel><LlmSettings data={feed.data} /><Panel title="Reset gateway state" eyebrow="ADMINISTRATION"><div className="settings-reset"><div className="reset-icon"><Trash2 size={24} /></div><h3>Start a new observation session</h3><p>Remove the gateway’s learned baselines, incidents, adapters, events, and repair history. Provider scenarios are controlled separately.</p><Button className="button-danger" disabled={!connection.token || !!pending} onClick={() => setResetOpen(true)}><Trash2 size={15} />Reset gateway</Button></div></Panel></div>}
    {showConnection && <Modal title="Gateway connection" onClose={() => setShowConnection(false)}><ConnectionForm connection={connection} configure={configure} label="Gateway" onDone={() => setShowConnection(false)} /></Modal>}
    {incident && <IncidentDetail incident={incident} data={feed.data} onClose={() => setIncidentId(null)} pending={pending === incident.id} decisionPending={pending.startsWith(`${incident.id}:`) ? pending.slice(incident.id.length + 1) : ''} onApprove={(id) => run(id, `/admin/incidents/${encodeURIComponent(id)}/approve`, undefined, 'The gateway revalidated the repair proposal. See the incident and validation results for its decision.')} onDecision={(id, decision) => run(`${id}:${decision}`, `/admin/incidents/${encodeURIComponent(id)}/decision`, { decision }, decision === 'accept_for_manual_work' ? 'Major change recorded for manual implementation; no unsafe adapter was deployed.' : 'Provider change rejected; restore the original provider contract.')} />}
    {passport && <PassportDetail passport={passport} onClose={() => setPassportId(null)} />}
    {rollback && <Modal title="Roll back this adapter?" onClose={() => setRollback(null)}><p className="detail-summary">Remove adapter <code>{rollback.id}</code> from <strong>{rollback.endpointId}</strong>. Future responses will be checked against the gateway’s original contract.</p><div className="form-actions"><Button className="button-danger" loading={pending === rollback.id} onClick={() => run(rollback.id, `/admin/adapters/${encodeURIComponent(rollback.id)}/rollback`, undefined, 'Adapter rolled back by the gateway.')}><Undo2 size={15} />Roll back adapter</Button><Button onClick={() => setRollback(null)}>Cancel</Button></div></Modal>}
    {resetOpen && <Modal title="Reset gateway state" onClose={() => setResetOpen(false)}><p className="detail-summary">This clears the gateway’s stored session data, baselines, and repairs. Type <strong>RESET</strong> to confirm.</p><form className="connection-form" onSubmit={(event) => { event.preventDefault(); if (confirmation === 'RESET') void run('reset', '/admin/reset', { confirm: 'RESET' }, 'Gateway state reset. Waiting for new baseline observations.'); }}><label>Confirmation<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="RESET" autoComplete="off" /></label><div className="form-actions"><Button className="button-danger" type="submit" disabled={confirmation !== 'RESET'} loading={pending === 'reset'}><Trash2 size={15} />Reset state</Button><Button type="button" onClick={() => setResetOpen(false)}>Cancel</Button></div></form></Modal>}
  </Shell>;
}

export default function App() {
  return window.location.port === '8001' || /^\/provider(?:\/|$)/.test(window.location.pathname) ? <Provider /> : <Console />;
}
