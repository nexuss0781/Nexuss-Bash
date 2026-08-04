'use strict';

const express = require('express');
const router = express.Router();
const packageManager = require('../core/packageManager');
const resourceManager = require('../core/resourceManager');

// POST /packages/install - Install a package (async)
router.post('/install', (req, res) => {
  const { name, manager } = req.body;

  if (!name) {
    return res.status(400).json({
      error: {
        code: 'bad_request',
        message: 'Missing package name',
        details: { field: 'name' },
      },
    });
  }

  if (!manager) {
    return res.status(400).json({
      error: {
        code: 'bad_request',
        message: 'Missing manager (apt, pip, npm, composer)',
        details: { field: 'manager' },
      },
    });
  }

  if (resourceManager.isThrottled()) {
    return res.status(503).json({
      error: {
        code: 'throttled',
        message: 'Resource usage too high, try again later',
        details: { retry_after_sec: 60 },
      },
    });
  }

  try {
    const result = packageManager.installAsync(name, manager);
    res.status(202).json({ data: result });
  } catch (err) {
    if (err.message.includes('Unsupported manager') || err.message.includes('cannot be empty')) {
      return res.status(400).json({
        error: { code: 'bad_request', message: err.message, details: {} },
      });
    }
    res.status(500).json({
      error: { code: 'internal_error', message: err.message, details: {} },
    });
  }
});

// GET /packages/install/:id - Check install status
router.get('/install/:id', (req, res) => {
  const status = packageManager.getInstallStatus(req.params.id);
  if (status.status === 'not_found') {
    return res.status(404).json({
      error: { code: 'not_found', message: 'Install not found', details: {} },
    });
  }
  res.json({ data: status });
});

// GET /packages - List all packages with pagination
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const allPackages = packageManager.list();
  const total = allPackages.length;
  const data = allPackages.slice(offset, offset + limit);
  res.json({ data, total });
});

// DELETE /packages/:name - Remove a package
router.delete('/:name', async (req, res) => {
  try {
    const removed = await packageManager.uninstall(req.params.name);
    res.json({ data: removed });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({
        error: { code: 'not_found', message: err.message, details: {} },
      });
    }
    if (err.message.includes('protected')) {
      return res.status(403).json({
        error: { code: 'forbidden', message: err.message, details: {} },
      });
    }
    res.status(500).json({
      error: { code: 'internal_error', message: err.message, details: {} },
    });
  }
});

module.exports = router;
