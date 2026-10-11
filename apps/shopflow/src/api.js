import { useCallback, useEffect, useRef, useState } from 'react';

export const ENDPOINTS = [
  { id: 'customer', label: 'Customer', path: '/api/customer/rahul' },
  { id: 'pricing', label: 'Pricing', path: '/api/pricing/phoenix-pro' },
  { id: 'shipping', label: 'Shipping', path: '/api/shipping/phoenix-pro' },
];
const hostedShopFlow = window.location.hostname === 'the-internet-after-the-api.onrender.com';
const defaultUrl = import.meta.env.VITE_GATEWAY_URL || (hostedShopFlow ? 'https://phoenix-gateway.onrender.com' : `http://${window.location.hostname || 'localhost'}:8000`);
const blank = () => Object.fromEntries(ENDPOINTS.map((endpoint) => [endpoint.id, { status: 'loading', data: null, metadata: null, error: '', httpStatus: null, checkedAt: null, goodAt: null }]));

export function useGatewayUrl() {
  const [url, setUrl] = useState(() => { try { return window.localStorage.getItem('shopflow.gateway.url') || defaultUrl; } catch { return defaultUrl; } });
  const configure = (value) => {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Enter an HTTP or HTTPS gateway URL without credentials, a query, or a fragment.');
    const normalized = parsed.href.replace(/\/+$/, '');
    try { window.localStorage.setItem('shopflow.gateway.url', normalized); } catch { /* Browser storage can be disabled. */ }
    setUrl(normalized);
  };
  return [url, configure];
}

export async function gatewayRequest(url, path, options = {}) {
  const { signal, ...rest } = options;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = window.setTimeout(abort, 10000);
  try {
    const response = await fetch(`${url}${path}`, { ...rest, cache: 'no-store', signal: controller.signal, headers: { ...(rest.body ? { 'Content-Type': 'application/json' } : {}), ...rest.headers } });
    let body;
    try { body = await response.json(); } catch { throw new Error(`The gateway returned an invalid response (HTTP ${response.status}).`); }
    if (!response.ok) {
      const error = new Error(typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error.replace(/_/g, ' ') : `Request failed (HTTP ${response.status}).`);
      error.status = response.status; error.metadata = body._phoenix; error.incidentId = body.incidentId;
      throw error;
    }
    return body;
  } catch (error) {
    if (error.name === 'AbortError' && !signal?.aborted) throw new Error('The gateway did not respond in time.');
    if (error instanceof TypeError) throw new Error('Gateway unavailable. Check the URL and your LAN connection.');
    throw error;
  } finally { window.clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

function validBody(id, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const text = (key) => typeof body[key] === 'string' && body[key].length > 0;
  const numeric = (key) => typeof body[key] === 'number' && Number.isFinite(body[key]);
  if (id === 'customer') return ['id', 'name', 'email', 'tier'].every(text);
  if (id === 'pricing') return ['product_id', 'product_name', 'currency', 'unit'].every(text) && /^[A-Z]{3}$/.test(body.currency) && numeric('amount') && body.amount > 0 && numeric('tax_percent') && body.tax_percent >= 0;
  return ['order_id', 'carrier', 'destination'].every(text) && numeric('eta_days') && body.eta_days >= 0;
}

export function useShopData(url) {
  const [endpoints, setEndpoints] = useState(blank);
  const [refreshing, setRefreshing] = useState(false);
  const [lastPoll, setLastPoll] = useState(null);
  const refreshRef = useRef(async () => {});
  useEffect(() => {
    let active = true;
    let running = false;
    const controller = new AbortController();
    setEndpoints(blank()); setLastPoll(null); setRefreshing(false);
    const refresh = async () => {
      if (running || !active) return;
      running = true;
      setRefreshing(true);
      const results = await Promise.allSettled(ENDPOINTS.map(async (endpoint) => {
        const body = await gatewayRequest(url, endpoint.path, { signal: controller.signal });
        if (body?._phoenix?.safe !== true) {
          const error = new Error('Phoenix has not confirmed this response is safe.');
          error.metadata = body?._phoenix; error.incidentId = body?._phoenix?.incidentId; error.status = 409;
          throw error;
        }
        if (!validBody(endpoint.id, body)) throw new Error('The response does not match the required contract. Checkout is paused.');
        return body;
      }));
      if (active) {
        const checkedAt = new Date();
        setEndpoints((previous) => Object.fromEntries(ENDPOINTS.map((endpoint, index) => {
          const result = results[index];
          if (result.status === 'fulfilled') return [endpoint.id, { data: result.value, metadata: result.value._phoenix, status: 'healthy', error: '', httpStatus: 200, checkedAt, goodAt: checkedAt, incidentId: result.value._phoenix.incidentId }];
          const error = result.reason;
          return [endpoint.id, { ...previous[endpoint.id], status: error.status === 409 ? 'blocked' : 'error', error: error.message, httpStatus: error.status || null, metadata: error.metadata || null, incidentId: error.incidentId || null, checkedAt }];
        })));
        setLastPoll(checkedAt); setRefreshing(false);
      }
      running = false;
    };
    refreshRef.current = refresh;
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible);
    return () => { active = false; controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); refreshRef.current = async () => {}; };
  }, [url]);
  const refresh = useCallback(() => refreshRef.current(), []);
  const healthy = ENDPOINTS.every((endpoint) => endpoints[endpoint.id].status === 'healthy');
  return { endpoints, refreshing, lastPoll, healthy, refresh };
}

export function money(amount, currency) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || !currency) return '—';
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount); } catch { return `${amount.toFixed(2)} ${currency}`; }
}

export function time(value) { return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'; }
