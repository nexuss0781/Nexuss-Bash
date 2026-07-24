'use strict';

const config = require('../config');

function authMiddleware(req, res, next) {
  // Skip auth for /health
  if (req.path === '/health') {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);

  // Constant-time comparison
  const crypto = require('crypto');
  const expectedKey = config.API_KEY;

  if (token.length !== expectedKey.length) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid API key' });
  }

  const a = Buffer.from(token);
  const b = Buffer.from(expectedKey);

  if (!crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid API key' });
  }

  next();
}

module.exports = authMiddleware;
