'use strict';

const express = require('express');
const multer = require('multer');
const yaml = require('js-yaml');
const router = express.Router();
const pipelineExecutor = require('../core/pipelineExecutor');
const resourceManager = require('../core/resourceManager');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/x-yaml' || file.mimetype === 'text/yaml' ||
        file.originalname.endsWith('.yaml') || file.originalname.endsWith('.yml')) {
      cb(null, true);
    } else {
      cb(new Error('Only .yaml or .yml files accepted'));
    }
  },
});

// POST /pipelines/run — Upload YAML, execute, return results in one call
router.post('/run', upload.single('file'), async (req, res) => {
  try {
    let yamlContent = null;

    if (req.file) {
      yamlContent = req.file.buffer.toString('utf8');
    } else if (req.body && req.body.yaml) {
      yamlContent = req.body.yaml;
    } else {
      return res.status(400).json({
        error: { code: 'bad_request', message: 'Upload a .yaml file or provide "yaml" in JSON body', details: {} },
      });
    }

    // Validate YAML parses before submitting
    try {
      yaml.load(yamlContent);
    } catch (e) {
      return res.status(400).json({
        error: { code: 'bad_request', message: `Invalid YAML: ${e.message}`, details: {} },
      });
    }

    if (resourceManager.isThrottled()) {
      return res.status(503).json({
        error: { code: 'throttled', message: 'Resource usage too high', details: { retry_after_sec: 60 } },
      });
    }

    const timeoutMs = Math.min(parseInt(req.body && req.body.timeout, 10) || 120000, 300000);
    const result = await pipelineExecutor.submitSync(yamlContent, null, timeoutMs);

    res.status(200).json({ data: result });
  } catch (err) {
    res.status(400).json({
      error: { code: 'bad_request', message: err.message, details: {} },
    });
  }
});

// POST /pipelines — Submit async (fire and forget, poll with GET /pipelines/:id)
router.post('/', upload.single('file'), (req, res) => {
  let yamlContent = null;
  let fileId = null;

  if (req.file) {
    yamlContent = req.file.buffer.toString('utf8');
  } else if (req.body) {
    yamlContent = req.body.yaml || null;
    fileId = req.body.file_id || null;
  }

  if (!yamlContent && !fileId) {
    return res.status(400).json({
      error: { code: 'bad_request', message: 'Provide "yaml", "file_id", or upload a file', details: {} },
    });
  }

  if (resourceManager.isThrottled()) {
    return res.status(503).json({
      error: { code: 'throttled', message: 'Resource usage too high', details: { retry_after_sec: 60 } },
    });
  }

  try {
    const pipeline = pipelineExecutor.submit(yamlContent, fileId);
    res.status(201).json({ data: pipeline });
  } catch (err) {
    res.status(400).json({
      error: { code: 'bad_request', message: err.message, details: {} },
    });
  }
});

// GET /pipelines — List all
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

// GET /pipelines/:id — Get details
router.get('/:id', (req, res) => {
  const pipeline = pipelineExecutor.get(req.params.id);
  if (!pipeline) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'Pipeline not found', details: {} },
    });
  }
  res.json({ data: pipeline });
});

// DELETE /pipelines/:id — Cancel
router.delete('/:id', (req, res) => {
  const result = pipelineExecutor.cancel(req.params.id);

  if (!result) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'Pipeline not found', details: {} },
    });
  }

  if (result.error === 'already_finished') {
    return res.status(400).json({
      error: { code: 'bad_request', message: 'Pipeline already finished', details: {} },
    });
  }

  res.json({ data: result });
});

module.exports = router;
