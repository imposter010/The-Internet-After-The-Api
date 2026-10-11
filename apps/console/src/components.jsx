import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDownToLine, Check, ChevronRight, CircleHelp, Eye, EyeOff, Link2, LoaderCircle, PlugZap, X } from 'lucide-react';

export function Badge({ value, children, tone }) {
  const label = String(children ?? value ?? 'unknown');
  const status = String(value ?? label).toLowerCase();
  const derived = /^(healthy|normal|active|safe|verified|approved|repaired|resolved|passed|connected|ok|success|adapted|recovered)$/.test(status) ? 'teal'
    : /(block|unsafe|error|fail|critical|reject|offline)/.test(status) ? 'red'
      : /(pending|drift|review|warn|degrad|propos|stale|rollback|rolled_back|detecting|validating)/.test(status) ? 'orange' : 'muted';
  return <span className={`badge badge-${tone || derived}`}><span className="badge-dot" />{label.replace(/_/g, ' ')}</span>;
}

export function Empty({ title = 'Nothing here yet', detail, icon: Icon = CircleHelp }) {
  return <div className="empty"><div className="empty-icon"><Icon size={23} /></div><strong>{title}</strong>{detail && <p>{detail}</p>}</div>;
}

export function Panel({ title, eyebrow, action, className = '', children }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</div>{children}</section>;
}

export function Button({ children, loading, className = '', ...props }) {
  return <button className={`button ${className}`} {...props} disabled={props.disabled || loading}>{loading && <LoaderCircle size={15} className="spin" />}{children}</button>;
}

export function Modal({ title, children, onClose, wide = false }) {
  const titleId = useId();
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus?.(); };
  }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-heading"><h2 id={titleId}>{title}</h2><button autoFocus className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{children}
  </dialog>;
}

export function ConnectionForm({ connection, configure, label = 'Gateway', sameOrigin = false, onDone }) {
  const [url, setUrl] = useState(connection.url);
  const [token, setToken] = useState(connection.token);
  const [remember, setRemember] = useState(connection.remember ?? false);
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState('');
  return <form className="connection-form" onSubmit={(event) => {
    event.preventDefault();
    try { configure({ url, token, remember }); setError(''); onDone?.(); } catch (err) { setError(err.message); }
  }}><div className="connection-explainer"><PlugZap size={23} /><p>Connect to your {label.toLowerCase()} on this computer or another device on your LAN.</p></div>
    <label>{label} URL<div className="input-icon"><Link2 size={16} /><input required type="url" value={url} disabled={sameOrigin} onChange={(event) => setUrl(event.target.value)} placeholder="http://192.168.1.20:8000" spellCheck={false} /></div></label>
    {sameOrigin && <p className="form-hint">This provider console uses the server that served this page.</p>}
    <label>Administration token<div className="input-icon"><input type={reveal ? 'text' : 'password'} value={token} onChange={(event) => setToken(event.target.value)} placeholder="Enter your admin token" autoComplete="off" spellCheck={false} /><button className="icon-button" type="button" onClick={() => setReveal(!reveal)} aria-label={reveal ? 'Hide token' : 'Show token'}>{reveal ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
    <label className="connection-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Remember token on this trusted device</span></label>
    <p className="form-hint">The URL is saved on this device. A remembered token stays only in this browser and is sent only to the configured server. Never enable this on a shared device.</p>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    <div className="form-actions"><Button type="submit" className="button-primary"><Check size={16} />Save connection</Button>{connection.token && <Button type="button" onClick={() => { configure({ url, token: '', remember: false }); setToken(''); setRemember(false); onDone?.(); }}>Clear token</Button>}</div>
  </form>;
}

export function JsonView({ value, label }) {
  return <div className="json-block">{label && <div className="json-label">{label}</div>}<pre>{value === undefined || value === null ? 'No data recorded' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre></div>;
}

export function Diff({ before, after }) {
  const a = serialize(before).split('\n');
  const b = serialize(after).split('\n');
  const beforeLines = new Set(a);
  const afterLines = new Set(b);
  return <div className="diff-grid"><div className="json-block"><div className="json-label"><span className="diff-dot red" />Baseline / previous behavior</div><pre>{a.map((line, index) => <span className={`diff-line ${afterLines.has(line) ? '' : 'diff-removed'}`} key={index}><i>{index + 1}</i>{line || ' '}{'\n'}</span>)}</pre></div><div className="json-block"><div className="json-label"><span className="diff-dot teal" />Observed / new behavior</div><pre>{b.map((line, index) => <span className={`diff-line ${beforeLines.has(line) ? '' : 'diff-added'}`} key={index}><i>{index + 1}</i>{line || ' '}{'\n'}</span>)}</pre></div></div>;
}

function serialize(value) { return value === undefined || value === null ? 'No behavior recorded' : typeof value === 'string' ? value : JSON.stringify(value, null, 2); }

export function humanTime(value) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function readable(value, fallback = '—') { return value == null ? fallback : typeof value === 'object' ? JSON.stringify(value) : String(value); }
export function number(value) { return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—'; }

export function DownloadJson({ value, filename, children = 'Export JSON' }) {
  return <Button onClick={() => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }}><ArrowDownToLine size={15} />{children}</Button>;
}

export function ViewAll({ onClick }) { return <button className="text-button" onClick={onClick}>View all<ChevronRight size={14} /></button>; }
