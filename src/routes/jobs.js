'use strict';

const express = require('express');
const router = express.Router();
const jobExecutor = require('../core/jobExecutor');
const resourceManager = require('../core/resourceManager');

// GET /jobs - List all jobs with pagination and optional status filter
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const statusFilter = req.query.status || null;

  let allJobs = jobExecutor.list();

  if (statusFilter) {
    allJobs = allJobs.filter((j) => j.status === statusFilter);
  }

  const total = allJobs.length;
  const data = allJobs.slice(offset, offset + limit);
  res.json({ data, total });
});

// POST /jobs - Submit a job
router.post('/', (req, res) => {
  if (resourceManager.isThrottled()) {
    return res.status(503).json({
      error: {
        code: 'throttled',
        message: 'Resource usage too high, try again later',
        details: { retry_after_sec: 60 },
      },
    });
  }

  const { language, code, timeout_sec, limits } = req.body;

  if (!language) {
    return res.status(400).json({
      error: {
        code: 'bad_request',
        message: 'Missing language',
        details: { field: 'language' },
      },
    });
  }

  if (!code) {
    return res.status(400).json({
      error: {
        code: 'bad_request',
        message: 'Missing code',
        details: { field: 'code' },
      },
    });
  }

  if (timeout_sec !== undefined && (typeof timeout_sec !== 'number' || timeout_sec <= 0)) {
    return res.status(400).json({
      error: {
        code: 'bad_request',
        message: 'Invalid timeout_sec',
        details: { field: 'timeout_sec' },
      },
    });
  }

  try {
    const job = jobExecutor.submit({ language, code, timeout_sec, limits });
    res.status(202).json({ data: job });
  } catch (err) {
    if (err.message.includes('Unsupported language')) {
      return res.status(400).json({
        error: { code: 'bad_request', message: err.message, details: { field: 'language' } },
      });
    }
    if (err.message.includes('Code cannot be empty')) {
      return res.status(400).json({
        error: { code: 'bad_request', message: err.message, details: { field: 'code' } },
      });
    }
    res.status(500).json({
      error: { code: 'internal_error', message: err.message, details: {} },
    });
  }
});

// GET /jobs/:id - Get job status
router.get('/:id', (req, res) => {
  const job = jobExecutor.get(req.params.id);
  if (!job) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'Job not found', details: {} },
    });
  }
  res.json({ data: job });
});

module.exports = router;
