'use strict';

const express = require('express');
const router = express.Router();
const jobExecutor = require('../core/jobExecutor');
const resourceManager = require('../core/resourceManager');

// POST /jobs - Submit a job
router.post('/', (req, res) => {
  if (resourceManager.isThrottled()) {
    return res.status(503).json({
      error: 'throttled',
      message: 'Resource usage too high, try again later',
      retry_after_sec: 60,
    });
  }

  const { language, code, timeout_sec, limits } = req.body;

  if (!language) {
    return res.status(400).json({ error: 'bad_request', message: 'Missing language' });
  }

  if (!code) {
    return res.status(400).json({ error: 'bad_request', message: 'Missing code' });
  }

  if (timeout_sec !== undefined && (typeof timeout_sec !== 'number' || timeout_sec <= 0)) {
    return res.status(400).json({ error: 'bad_request', message: 'Invalid timeout_sec' });
  }

  try {
    const job = jobExecutor.submit({ language, code, timeout_sec, limits });
    res.status(202).json(job);
  } catch (err) {
    if (err.message.includes('Unsupported language')) {
      return res.status(400).json({ error: 'bad_request', message: err.message });
    }
    if (err.message.includes('Code cannot be empty')) {
      return res.status(400).json({ error: 'bad_request', message: err.message });
    }
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// GET /jobs/:id - Get job status
router.get('/:id', (req, res) => {
  const job = jobExecutor.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'not_found', message: 'Job not found' });
  }
  res.json(job);
});

module.exports = router;
