import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const fallbackGateway = `http://${window.location.hostname || 'localhost'}:8000`;
export const defaultGateway = import.meta.env.VITE_GATEWAY_URL || fallbackGateway;
export const defaultProvider = window.location.port === '8001'
  ? window.location.origin : `http://${window.location.hostname || 'localhost'}:8001`;

export function stored(storage, key, fallback = '') {
  try { return storage.getItem(key) || fallback; } catch { return fallback; }
}

export function save(storage, key, value) {
  try { value ? storage.setItem(key, value) : storage.removeItem(key); } catch { /* Storage may be disabled. */ }
}

export function normalizeUrl(value) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Enter an HTTP or HTTPS URL without credentials, a query, or a fragment.');
  }
  return url.href.replace(/\/+$/, '');
}

export function useConnection(kind) {
  const isProvider = kind === 'provider';
  const key = `phoenix.${kind}`;
  const [connection, setConnection] = useState(() => ({
    url: isProvider && window.location.port === '8001' ? window.location.origin
      : stored(window.localStorage, `${key}.url`, isProvider ? defaultProvider : defaultGateway),
    token: stored(window.sessionStorage, `${key}.token`),
  }));
  const configure = useCallback(({ url, token }) => {
    const normalized = isProvider && window.location.port === '8001' ? window.location.origin : normalizeUrl(url);
    save(window.localStorage, `${key}.url`, normalized);
    save(window.sessionStorage, `${key}.token`, token.trim());
    setConnection({ url: normalized, token: token.trim() });
  }, [isProvider, key]);
  return [connection, configure];
}

export async function requestJson(base, path, token, options = {}) {
  const { timeout = 12000, signal, ...rest } = options;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = window.setTimeout(cancel, timeout);
  try {
    const response = await fetch(`${base}${path}`, {
      ...rest,
      cache: 'no-store',
      signal: controller.signal,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(rest.body ? { 'Content-Type': 'application/json' } : {}), ...rest.headers },
    });
    let body;
    try { body = await response.json(); } catch { throw new Error(`The server returned a non-JSON response (HTTP ${response.status}).`); }
    if (!response.ok) {
      const error = new Error(typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : `Request failed (HTTP ${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return body;
  } catch (error) {
    if (error.name === 'AbortError' && !signal?.aborted) throw new Error('The server did not respond in time. Check the endpoint and LAN connection.');
    if (error instanceof TypeError) throw new Error('Cannot reach the server. Check its URL, LAN connection, and allowed origins.');
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export function useAdminFeed(connection, kind = 'gateway') {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const refreshRef = useRef(async () => {});
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    let active = true;
    let fetching = false;
    let queued = false;
    let socket;
    const controller = new AbortController();
    const path = kind === 'provider' ? '/admin/state' : '/admin/snapshot';
    setData(null); setError(''); setLive(false); setUpdatedAt(null); setBusy(false);
    const refresh = async () => {
      if (!active || !connection.token) return;
      if (fetching) { queued = true; return; }
      fetching = true;
      setBusy(true);
      try {
        const next = await requestJson(connection.url, path, connection.token, { signal: controller.signal });
        if (!next || typeof next !== 'object' || (kind === 'provider' ? !next.active : !next.metrics)) throw new Error('Unexpected server response. Check that this URL points to the correct service.');
        if (active) { setData(next); setUpdatedAt(new Date()); setError(''); }
      } catch (err) {
        if (active && err.name !== 'AbortError') setError(err.message);
      } finally {
        fetching = false;
        if (active) setBusy(false);
        if (queued && active) { queued = false; void refresh(); }
      }
    };
    refreshRef.current = refresh;
    void refresh();
    if (kind === 'gateway' && connection.token) {
      socket = io(connection.url, { auth: { token: connection.token }, reconnection: true, timeout: 8000 });
      socket.on('connect', () => { if (active) setLive(true); void refresh(); });
      socket.on('disconnect', () => { if (active) setLive(false); });
      socket.on('connect_error', () => { if (active) setLive(false); });
      socket.on('snapshot', refresh);
      socket.on('phoenix:event', refresh);
    }
    const timer = window.setInterval(refresh, kind === 'provider' ? 3000 : 15000);
    return () => { active = false; controller.abort(); socket?.disconnect(); window.clearInterval(timer); if (generation.current === current) refreshRef.current = async () => {}; };
  }, [connection.url, connection.token, kind]);

  const refresh = useCallback(() => refreshRef.current(), []);
  const mutate = useCallback(async (path, body) => {
    if (!connection.token) throw new Error('Enter an administration token first.');
    const result = await requestJson(connection.url, path, connection.token, { method: 'POST', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    await refreshRef.current();
    return result;
  }, [connection.url, connection.token]);
  return { data, error, busy, live, updatedAt, refresh, mutate };
}
