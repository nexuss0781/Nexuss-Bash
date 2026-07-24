'use strict';

const express = require('express');
const router = express.Router();
const pipelineExecutor = require('../core/pipelineExecutor');
const resourceManager = require('../core/resourceManager');

// POST /pipelines - Submit a new pipeline
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

  const { yaml, file_id } = req.body;

  if (!yaml && !file_id) {
    return res.status(400).json({
      error: {
        code: 'bad_request',
        message: 'Either "yaml" or "file_id" is required',
        details: {},
      },
    });
  }

  try {
    const pipeline = pipelineExecutor.submit(yaml || null, file_id || null);
    res.status(201).json({ data: pipeline });
  } catch (err) {
    res.status(400).json({
      error: { code: 'bad_request', message: err.message, details: {} },
    });
  }
});

// GET /pipelines - List all pipelines
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const statusFilter = req.query.status || null;

  let allPipelines = pipelineExecutor.list();

  if (statusFilter) {
    allPipelines = allPipelines.filter((p) => p.status === statusFilter);
  }

  const total = allPipelines.length;
  const data = allPipelines.slice(offset, offset + limit);

  res.json({ data, total });
});

// GET /pipelines/:id - Get pipeline details
router.get('/:id', (req, res) => {
  const pipeline = pipelineExecutor.get(req.params.id);
  if (!pipeline) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'Pipeline not found', details: {} },
    });
  }
  res.json({ data: pipeline });
});

// DELETE /pipelines/:id - Cancel a pipeline
router.delete('/:id', (req, res) => {
  const result = pipelineExecutor.cancel(req.params.id);

  if (!result) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'Pipeline not found', details: {} },
    });
  }

  if (result.error === 'already_finished') {
    return res.status(400).json({
      error: {
        code: 'bad_request',
        message: 'Pipeline is already completed, failed, or cancelled',
        details: {},
      },
    });
  }

  res.json({ data: result });
});

module.exports = router;
