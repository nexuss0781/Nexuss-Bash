'use strict';

const express = require('express');
const router = express.Router();
const packageManager = require('../core/packageManager');
const resourceManager = require('../core/resourceManager');

// POST /packages/install - Install a package
router.post('/install', (req, res) => {
  if (resourceManager.isThrottled()) {
    return res.status(503).json({
      error: 'throttled',
      message: 'Resource usage too high, try again later',
      retry_after_sec: 60,
    });
  }

  const { name, manager } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'bad_request', message: 'Missing package name' });
  }

  if (!manager) {
    return res.status(400).json({ error: 'bad_request', message: 'Missing manager (apt, pip, npm, composer)' });
  }

  packageManager
    .install(name, manager)
    .then((result) => {
      res.json(result);
    })
    .catch((err) => {
      if (err.message.includes('Unsupported manager') || err.message.includes('cannot be empty')) {
        return res.status(400).json({ error: 'bad_request', message: err.message });
      }
      res.status(500).json({ error: 'internal_error', message: err.message });
    });
});

// GET /packages - List all packages
router.get('/', (req, res) => {
  const packages = packageManager.list();
  res.json(packages);
});

// DELETE /packages/:name - Remove a package
router.delete('/:name', (req, res) => {
  try {
    const removed = packageManager.uninstall(req.params.name);
    res.json(removed);
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: 'not_found', message: err.message });
    }
    if (err.message.includes('protected')) {
      return res.status(403).json({ error: 'forbidden', message: err.message });
    }
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

module.exports = router;
