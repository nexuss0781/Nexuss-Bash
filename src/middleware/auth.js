'use strict';

const config = require('../config');

function authMiddleware(req, res, next) {
  if (req.path === '/health' || req.path.startsWith('/app') || req.path === '/') {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { code: 'unauthorized', message: 'Missing or invalid Authorization header', details: {} },
    });
  }

  const token = authHeader.slice(7);

  const crypto = require('crypto');
  const expectedKey = config.API_KEY;

  if (token.length !== expectedKey.length) {
    return res.status(401).json({
      error: { code: 'unauthorized', message: 'Invalid API key', details: {} },
    });
  }

  const a = Buffer.from(token);
  const b = Buffer.from(expectedKey);

  if (!crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({
      error: { code: 'unauthorized', message: 'Invalid API key', details: {} },
    });
  }

  next();
}

module.exports = authMiddleware;
