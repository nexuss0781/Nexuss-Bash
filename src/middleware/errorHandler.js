'use strict';

const { log } = require('../utils/logger');

function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const error = err.error || 'internal_error';
  const message = err.message || 'An unexpected error occurred';

  log('error', 'errorHandler', message, {
    status,
    error,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(status).json({
    error,
    message,
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'not_found',
    message: `Route not found: ${req.method} ${req.path}`,
  });
}

module.exports = { errorHandler, notFoundHandler };
