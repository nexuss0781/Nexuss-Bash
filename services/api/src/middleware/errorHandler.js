'use strict';

const { log } = require('@nexuss/shared/utils');

function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const code = err.error || err.code || 'internal_error';
  const message = err.message || 'An unexpected error occurred';
  const details = err.details || {};

  log('error', 'errorHandler', message, {
    status,
    code,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(status).json({
    error: { code, message, details },
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'not_found',
      message: `Route not found: ${req.method} ${req.path}`,
      details: {},
    },
  });
}

module.exports = { errorHandler, notFoundHandler };
