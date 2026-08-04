'use strict';

const crypto = require('crypto');
const { config } = require('@nexuss/shared/config');
const { hashApiKey } = require('@nexuss/shared/utils');
const { init, hydrate, flush, isReady, isEnabled, saveRun, saveJob, savePipeline, saveSession, saveEvent, savePackage, removePackage, pruneEvents, upsertUser, getUserByApiKeyHash, getUserByEmail, getUserById } = require('@nexuss/shared/persistence');

const PUBLIC = ['/health', '/app', '/', '/favicon.ico', '/auth/register', '/auth/login'];

function isPublic(path) {
  return PUBLIC.some((p) => path === p || path.startsWith(p + '/'));
}

function isAdminKey(token) {
  if (!config.API_KEY || !token || token.length !== config.API_KEY.length) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(config.API_KEY);
  return crypto.timingSafeEqual(a, b);
}

function authMiddleware(req, res, next) {
  if (isPublic(req.path)) return next();

  const authHeader = req.headers.authorization;
  const key = req.headers['x-api-key'] || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '');

  if (!key) {
    return res.status(401).json({
      error: { code: 'unauthorized', message: 'Missing API key (X-API-Key or Authorization: Bearer)', details: {} },
    });
  }

  if (isAdminKey(key)) {
    req.user = { id: 'admin', email: 'admin@nexuss.local', username: 'admin', role: 'admin', api_key_hash: null };
    return next();
  }

  const user = getUserByApiKeyHash(hashApiKey(key));
  if (!user) {
    return res.status(401).json({
      error: { code: 'unauthorized', message: 'Invalid API key', details: {} },
    });
  }

  req.user = {
    id: user.id,
    email: user.email,
    username: user.username,
    role: 'user',
    api_key_hash: user.api_key_hash,
  };
  next();
}

module.exports = authMiddleware;
