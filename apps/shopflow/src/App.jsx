import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, ChevronRight, CircleCheck, CircleHelp, Flame, Headphones as HeadphonesIcon, Link2, LoaderCircle, LockKeyhole, MapPin, PackageCheck, RefreshCw, Settings2, ShieldCheck, ShoppingBag, Truck, UserRound, WifiOff, X } from 'lucide-react';
import { ENDPOINTS, gatewayRequest, money, time, useGatewayUrl, useShopData } from './api.js';
import Headphones from './Headphones.jsx';

function Status({ endpoint }) {
  const stale = endpoint.data && endpoint.status !== 'healthy';
  const label = stale ? 'Stale · last good' : endpoint.status === 'loading' ? 'Connecting' : endpoint.status === 'blocked' ? 'Blocked' : endpoint.status === 'error' ? 'Unavailable' : endpoint.metadata?.recovered ? 'Recovered' : endpoint.metadata?.adapted ? 'Adapted' : 'Healthy';
  return <span className={`status status-${stale ? 'stale' : endpoint.status}`}><i />{label}</span>;
}

function Modal({ title, children, onClose, className = '' }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => { const previous = document.activeElement; const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); previous?.focus?.(); }; }, []);
  return <dialog ref={ref} className={`shop-modal ${className}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="shop-modal-heading"><h2 id={titleId}>{title}</h2><button autoFocus className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={21} /></button></div>{children}</dialog>;
}

function Connection({ url, configure, close }) {
  const [value, setValue] = useState(url);
  const [error, setError] = useState('');
  return <Modal title="Gateway connection" onClose={close}><div className="connection-intro"><Link2 size={23} /><p>Use your API Phoenix gateway URL, including its port, on this device or another computer on your LAN.</p></div><form onSubmit={(event) => { event.preventDefault(); try { configure(value); close(); } catch (err) { setError(err.message); } }}><label className="field-label">Gateway URL<input required type="url" value={value} onChange={(event) => setValue(event.target.value)} placeholder="http://192.168.1.20:8000" spellCheck={false} /></label><p className="connection-hint">Saved on this device. ShopFlow uses the gateway’s public customer, pricing, shipping, and checkout APIs.</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="shop-button" type="submit"><Check size={17} />Save connection</button></form></Modal>;

}

function EndpointCard({ endpoint, definition, icon: Icon, children }) {
  return <section className={`endpoint-card ${endpoint.status !== 'healthy' && endpoint.data ? 'endpoint-stale' : ''}`} data-testid={`endpoint-${definition.id}`}><div className="endpoint-card-heading"><div className="endpoint-title"><Icon size={18} /><h3>{definition.label}</h3></div><Status endpoint={endpoint} /></div><div className="endpoint-data">{children}</div>{endpoint.status !== 'healthy' && endpoint.status !== 'loading' && <p className="endpoint-error">{endpoint.error}</p>}<div className="endpoint-card-footer"><code>{definition.path}</code>{endpoint.metadata?.latencyMs != null && <span>{endpoint.metadata.latencyMs} ms</span>}</div>{endpoint.status !== 'healthy' && endpoint.goodAt && <div className="last-good">Saved last good response · {time(endpoint.goodAt)}</div>}</section>;
}

function ServiceHealth({ endpoints, lastPoll, refreshing, refresh, url, onConnect }) {
  return <section className="health-section" id="service-status"><div className="health-heading"><div><span className="eyebrow">A LITTLE PEACE OF MIND</span><h2>Behind every smooth checkout.</h2><p>Live API checks keep your profile, price, and delivery in sync.</p></div><button className="subtle-button" onClick={refresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} />Refresh checks</button></div><div className="health-grid">{ENDPOINTS.map((definition) => {
    const endpoint = endpoints[definition.id];
    return <div className="health-card" key={definition.id}><div className={`health-card-icon ${endpoint.status === 'healthy' ? 'is-healthy' : ''}`}>{endpoint.status === 'healthy' ? <CircleCheck size={20} /> : endpoint.status === 'loading' ? <LoaderCircle size={20} className="spin" /> : <WifiOff size={20} />}</div><div><strong>{definition.label} API</strong><span>{endpoint.checkedAt ? `Checked ${time(endpoint.checkedAt)}` : 'Waiting for a response'}</span>{endpoint.metadata?.upstreamStatus != null && <small>Upstream HTTP {endpoint.metadata.upstreamStatus}</small>}</div><Status endpoint={endpoint} /></div>;
  })}</div><div className="health-footer"><span><i className={Object.values(endpoints).every((endpoint) => endpoint.status === 'healthy') ? 'healthy-dot' : 'neutral-dot'} />{refreshing ? 'Checking the gateway…' : lastPoll ? `Last check ${time(lastPoll)} · polls every 3 seconds` : 'Connecting to the gateway'}</span><button onClick={onConnect}><Settings2 size={12} /><span title={url}>{url}</span></button></div></section>;
}

function CheckoutPreview({ result, checkedAt, onClose }) {
  const preview = result.preview;
  const customer = typeof preview.customer === 'string' ? preview.customer : preview.customer?.name || preview.customer?.id || 'Customer validated';
  return <Modal title="Your checkout preview" onClose={onClose} className="preview-modal"><div className="preview-success"><ShieldCheck size={30} /></div><p className="preview-intro">{result.message || 'Your current API responses were validated by the gateway.'}</p><div className="preview-details"><div><span>Customer</span><strong>{customer}</strong></div><div><span>Quantity</span><strong>1</strong></div><div><span>Product amount</span><strong>{money(preview.amount, preview.currency)}</strong></div><div><span>Tax</span><strong>{money(preview.tax, preview.currency)}</strong></div><div><span>Delivery estimate</span><strong>{preview.etaDays} {preview.etaDays === 1 ? 'day' : 'days'}</strong></div><div className="preview-total"><span>Total</span><strong>{money(preview.total, preview.currency)}</strong></div></div><div className="preview-note"><LockKeyhole size={15} /><span>Preview only. No payment was collected.<br />Server validation completed at {time(checkedAt)}.</span></div><button className="shop-button" onClick={onClose}>Back to ShopFlow<ArrowRight size={16} /></button></Modal>;
}

export default function App() {
  const [url, configure] = useGatewayUrl();
  const { endpoints, refreshing, lastPoll, healthy, refresh } = useShopData(url);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [preview, setPreview] = useState(null);
  const checkoutRef = useRef(null);
  const customer = endpoints.customer.data;
  const pricing = endpoints.pricing.data;
  const shipping = endpoints.shipping.data;
  const loading = ENDPOINTS.every((endpoint) => endpoints[endpoint.id].status === 'loading');
  const ready = healthy && !refreshing && !checkoutPending;
  const stalePricing = !!pricing && endpoints.pricing.status !== 'healthy';
  const tax = pricing ? Math.round(pricing.amount * pricing.tax_percent) / 100 : null;
  const total = pricing ? Math.round((pricing.amount + tax) * 100) / 100 : null;
  const signature = JSON.stringify([customer?.id, customer?.name, customer?.tier, pricing?.amount, pricing?.tax_percent, pricing?.currency, shipping?.eta_days]);
  const signatureRef = useRef(signature);
  signatureRef.current = signature;
  const dashboardUrl = import.meta.env.VITE_DASHBOARD_URL || `http://${window.location.hostname}:5173`;

  useEffect(() => { setPreview(null); setCheckoutError(''); checkoutRef.current?.abort(); setCheckoutPending(false); }, [url]);
  useEffect(() => { if (preview && (!healthy || preview.signature !== signature)) setPreview(null); }, [healthy, signature, preview]);
  useEffect(() => () => checkoutRef.current?.abort(), []);

  const checkout = async () => {
    if (!ready) return;
    setCheckoutPending(true); setCheckoutError('');
    const controller = new AbortController(); checkoutRef.current = controller;
    const startingSignature = signature;
    try {
      const result = await gatewayRequest(url, '/api/checkout', { method: 'POST', body: JSON.stringify({ quantity: 1 }), signal: controller.signal });
      if (!result.preview || !['amount', 'tax', 'total', 'etaDays'].every((key) => typeof result.preview[key] === 'number' && Number.isFinite(result.preview[key])) || typeof result.preview.currency !== 'string') throw new Error('The gateway returned an incomplete checkout preview.');
      if (startingSignature !== signatureRef.current) throw new Error('Order details changed while validating. Refresh your preview.');
      if (!controller.signal.aborted) setPreview({ result, checkedAt: new Date(), signature: startingSignature });
    } catch (error) {
      if (!controller.signal.aborted) { setCheckoutError(error.message); void refresh(); }
    } finally { if (checkoutRef.current === controller) { setCheckoutPending(false); checkoutRef.current = null; } }
  };

  return <div className="shop-app"><div className="announcement"><span>Thoughtfully chosen. Everyday, elevated.</span><span><ShieldCheck size={13} />Connected through API Phoenix</span></div><header className="shop-header"><a className="shop-brand" href="#shop"><span><ShoppingBag size={23} strokeWidth={1.7} /></span>ShopFlow<span className="brand-period">.</span></a><nav aria-label="Shop navigation"><a href="#shop" className="shop-nav-active">The collection</a><a href="#order-details">Your order</a><a href="#service-status">Service status</a></nav><div className="shop-header-actions"><button className="icon-button" aria-label="Configure gateway connection" title="Gateway connection" onClick={() => setConnectionOpen(true)}><Settings2 size={20} /></button><a className="order-bag" href="#order-details" aria-label="View order, one item"><ShoppingBag size={20} /><span>1</span></a></div></header>
    <main className="shop-main" id="shop"><div className="shop-breadcrumb"><a href="#shop">Home</a><ChevronRight size={12} /><span>The collection</span><ChevronRight size={12} /><strong>Phoenix Pro</strong></div><div className="retail-heading"><div><span className="eyebrow">THE EVERYDAY EDIT</span><h1>Less noise.<br /><span>More you.</span></h1></div><p>Find a little space for yourself.<br />We’ll take care of the details.</p><a href="#order-details" className="round-arrow" aria-label="See your order"><ArrowDown size={22} /></a></div>
    {!healthy && <div className={`shop-notice ${loading ? 'shop-notice-loading' : 'shop-notice-blocked'}`} role={loading ? 'status' : 'alert'}>{loading ? <LoaderCircle size={20} className="spin" /> : <ShieldCheck size={20} />}<div><strong>{loading ? 'Checking your order details' : 'Checkout is paused to keep your order safe'}</strong><p>{loading ? 'Connecting to the gateway for your profile, current price, and delivery estimate.' : 'Every API must be healthy before checkout. Any saved last good data below is stale and cannot be used to check out.'}</p></div><button className="subtle-button" onClick={refresh} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'spin' : ''} />Retry now</button></div>}
    <div className="product-layout"><section className="product-gallery" aria-label="Product illustration"><div className="gallery-top"><span className="gallery-label">THE PHOENIX COLLECTION</span><span className="product-edition">01 / EVERYDAY AUDIO</span></div><div className="product-orbit orbit-one" /><div className="product-orbit orbit-two" /><span className="gallery-word">arc.</span><Headphones /><div className="gallery-bottom"><div><span className="gallery-dot" /><span>Graphite</span></div><span>Designed for your everyday.</span></div><div className="product-caption"><HeadphonesIcon size={15} /><span>Phoenix Pro · product illustration</span></div></section>
    <section className="product-info" id="order-details"><div className="product-type"><span className="eyebrow">WIRELESS HEADPHONES</span><span className="local-product-chip">PHOENIX PRO</span></div><h2>{pricing?.product_name || 'Arc One wireless headphones'}</h2><p className="product-description">Your soundtrack, your space. A considered addition to the way you move through the day.</p><div className={`product-price ${stalePricing ? 'is-stale' : ''}`}><strong>{money(pricing?.amount, pricing?.currency)}</strong><span>{pricing ? `+ ${pricing.tax_percent}% tax` : 'Waiting for current pricing'}</span><Status endpoint={endpoints.pricing} /></div>{stalePricing && <p className="price-stale-note">Saved last good price · {time(endpoints.pricing.goodAt)}. Checkout is blocked.</p>}<div className="product-choice"><div><span>Colour</span><strong>Graphite</strong></div><span className="colour-swatch" role="img" aria-label="Graphite colour"><Check size={13} /></span><div className="quantity"><span>Quantity</span><strong>01</strong></div></div>
      <div className={`order-summary ${stalePricing ? 'summary-stale' : ''}`}><div className="summary-heading"><ShoppingBag size={16} /><h3>Your order summary</h3>{stalePricing && <span>Last good price</span>}</div><div className="summary-product"><div className="mini-product"><Headphones mini /></div><div><strong>{pricing?.product_name || 'Arc One wireless headphones'}</strong><span>Graphite · Quantity 1</span></div><span>{money(pricing?.amount, pricing?.currency)}</span></div><div className="summary-line"><span>Subtotal</span><strong>{money(pricing?.amount, pricing?.currency)}</strong></div><div className="summary-line"><span>Tax{pricing ? ` (${pricing.tax_percent}%)` : ''}</span><strong>{money(tax, pricing?.currency)}</strong></div><div className="summary-line summary-total"><span>Estimated total</span><strong>{money(total, pricing?.currency)}</strong></div><p className="summary-hint">Calculated from the latest pricing response. The gateway validates your current order again for the preview.</p></div>
      {checkoutError && <div className="checkout-error" role="alert"><WifiOff size={17} /><span>{checkoutError}</span></div>}<button className="shop-button checkout-button" data-testid="checkout-button" onClick={checkout} disabled={!ready}>{checkoutPending ? <LoaderCircle size={17} className="spin" /> : !healthy ? <LockKeyhole size={17} /> : <ShoppingBag size={17} />}<span>{checkoutPending ? 'Validating preview…' : 'Preview checkout'}</span><ArrowRight size={18} /></button><div className="checkout-helper">{checkoutPending ? 'Validating current upstream responses' : loading ? 'Waiting for all three API checks' : !healthy ? 'Checkout blocked until every endpoint is healthy' : refreshing ? 'Refreshing the current order details' : 'All APIs healthy · Ready for a server-validated preview'}</div><div className="payment-note"><LockKeyhole size={13} /><span>Preview only. No payments, no charges.</span></div>
    </section></div>
    <div className="order-data-grid"><EndpointCard endpoint={endpoints.customer} definition={ENDPOINTS[0]} icon={UserRound}>{customer ? <><strong>{customer.name}</strong><p>{customer.email}</p><span className="membership">{customer.tier} member</span></> : <><strong>Customer details pending</strong><p>Your profile will appear after a healthy response.</p></>}</EndpointCard><EndpointCard endpoint={endpoints.shipping} definition={ENDPOINTS[2]} icon={Truck}>{shipping ? <><strong>{shipping.eta_days} {shipping.eta_days === 1 ? 'day' : 'days'} estimated delivery</strong><p>{shipping.carrier}</p><span className="destination"><MapPin size={12} />{shipping.destination}</span></> : <><strong>Delivery estimate pending</strong><p>Your carrier and destination will appear here.</p></>}</EndpointCard></div>
    <div className={`phoenix-strip ${healthy ? 'phoenix-strip-healthy' : ''}`}><div className="phoenix-strip-icon"><Flame size={23} /></div><div><span className="eyebrow">A SMOOTHER FLOW, BY DESIGN</span><strong>{healthy ? 'Your order details are in sync.' : 'Phoenix is watching the API boundary.'}</strong><p>{healthy ? 'The gateway marked all three responses safe. If an upstream API changes, checkout pauses until it can be trusted again.' : 'Unsafe or unavailable responses pause checkout. Validated compatibility repairs let the experience continue.'}</p></div><a href={dashboardUrl} target="_blank" rel="noreferrer">See API Phoenix<ArrowRight size={15} /></a></div>
    <ServiceHealth endpoints={endpoints} lastPoll={lastPoll} refreshing={refreshing} refresh={refresh} url={url} onConnect={() => setConnectionOpen(true)} /></main>
    <footer className="shop-footer"><a className="shop-brand" href="#shop"><ShoppingBag size={19} strokeWidth={1.7} />ShopFlow<span className="brand-period">.</span></a><span>A little more intention. A lot more flow.</span><div><span>Local demo · Checkout preview only</span><button onClick={() => setConnectionOpen(true)}><CircleHelp size={14} />Connection</button></div></footer>
    {connectionOpen && <Connection url={url} configure={configure} close={() => setConnectionOpen(false)} />}{preview && <CheckoutPreview result={preview.result} checkedAt={preview.checkedAt} onClose={() => setPreview(null)} />}
  </div>;
}
