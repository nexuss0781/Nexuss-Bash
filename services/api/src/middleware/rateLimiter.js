'use strict';

const config = require('@nexuss/shared/config');

const rateLimits = new Map();

function getRateLimit(key, type) {
  const now = Date.now();
  const windowMs = 60000;

  if (!rateLimits.has(key)) {
    rateLimits.set(key, {});
  }

  const limits = rateLimits.get(key);

  if (!limits[type]) {
    limits[type] = { count: 0, windowStart: now };
  }

  const entry = limits[type];

  if (now - entry.windowStart > windowMs) {
    entry.count = 0;
    entry.windowStart = now;
  }

  return entry;
}

function checkRateLimit(key, type, maxRequests) {
  const entry = getRateLimit(key, type);

  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((60000 - (Date.now() - entry.windowStart)) / 1000);
    return { allowed: false, retry_after_sec: retryAfter };
  }

  entry.count++;
  return { allowed: true };
}

function rateLimiter(req, res, next) {
  if (req.path === '/health') {
    return next();
  }

  const authHeader = req.headers.authorization || '';
  const key = authHeader.slice(7) || 'anonymous';

  let type;
  let maxRequests;

  if (req.method === 'POST' && req.path === '/sessions') {
    type = 'sessionCreate';
    maxRequests = config.SESSION_CREATE_RATE;
  } else if (req.method === 'POST' && req.path === '/jobs') {
    type = 'jobSubmit';
    maxRequests = config.JOB_SUBMIT_RATE;
  } else if (req.method === 'POST' && req.path.match(/\/sessions\/.*\/exec/)) {
    type = 'exec';
    maxRequests = config.EXEC_RATE;
  } else if (req.method === 'POST' && req.path === '/packages/install') {
    type = 'packageInstall';
    maxRequests = config.PACKAGE_INSTALL_RATE;
  } else if (req.method === 'POST' && req.path === '/pipelines') {
    type = 'jobSubmit';
    maxRequests = config.JOB_SUBMIT_RATE;
  } else {
    return next();
  }

  const result = checkRateLimit(key, type, maxRequests);

  if (!result.allowed) {
    return res.status(429).json({
      error: {
        code: 'rate_limited',
        message: 'Too many requests',
        details: { retry_after_sec: result.retry_after_sec },
      },
    });
  }

  next();
}

module.exports = rateLimiter;
