'use strict';

const { config } = require('@nexuss/shared/config');

const corsOrigins = config.CORS_ORIGINS || '*';
const ALLOWED_ORIGINS = corsOrigins.split(',').map((s) => s.trim()).filter(Boolean);
const ALLOW_ANY = ALLOWED_ORIGINS.includes('*');

// CORS middleware. Runs before auth so OPTIONS preflight requests succeed
// without an API key. Regular (non-preflight) requests still require Bearer
// auth. SSE streams (EventSource) cannot set headers and remain proxy-only.
function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    const allowed = ALLOW_ANY || ALLOWED_ORIGINS.includes(origin);
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', ALLOW_ANY ? '*' : origin);
      res.setHeader('Vary', 'Origin');
    }
  }

  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
}

module.exports = corsMiddleware;
