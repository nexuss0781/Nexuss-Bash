'use strict';

const { audit } = require('../utils/logger');

function auditLog(req, res, next) {
  // Skip audit for /health
  if (req.path === '/health') {
    return next();
  }

  const authHeader = req.headers.authorization || '';
  const key = authHeader.slice(7) || 'anonymous';

  // Log request
  audit('http_request', req.path, {
    method: req.method,
    key: key.slice(0, 8) + '***',
    ip: req.ip,
  });

  next();
}

module.exports = auditLog;
