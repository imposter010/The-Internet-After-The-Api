import { timingSafeEqual } from 'node:crypto';
import cors from 'cors';

export function requireToken(token) {
  if (!token || token.length < 16) throw new Error('An administration token of at least 16 characters is required. Configure the service .env.');
  return (req, res, next) => {
    const provided = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
    const expected = Buffer.from(token);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return res.status(401).json({ error: 'unauthorized', message: 'A valid operator token is required.' });
    next();
  };
}

export function allowOrigins(origins) {
  return (origin, callback) => {
    if (!origin || origins.includes(origin)) return callback(null, true);
    const error = new Error('Origin is not allowed');
    error.status = 403;
    callback(error);
  };
}

function requestOrigin(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwarded || req.protocol;
  const host = req.get('host');
  return host ? `${protocol}://${host}` : '';
}

export function corsFor(origins, { allowSameOrigin = false } = {}) {
  return cors((req, callback) => {
    const allowed = origins.filter(Boolean);
    const origin = req.headers.origin;
    if (allowSameOrigin && origin && origin === requestOrigin(req)) allowed.push(origin);
    callback(null, {
      origin: allowOrigins([...new Set(allowed)]),
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Retry-After'],
    });
  });
}
export function errors(err, req, res, next) {
  console.error(JSON.stringify({ level: 'error', method: req.method, path: req.path, message: err.message }));
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.status === 403 ? 'origin_forbidden' : 'request_failed', message: err.status ? err.message : 'The service could not complete this request.' });
}
