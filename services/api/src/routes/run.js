'use strict';

const express = require('express');
const multer = require('multer');
const router = express.Router();
const sequentialExecutor = require('../core/sequentialExecutor');
const resourceManager = require('../core/resourceManager');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/x-yaml' || file.mimetype === 'text/yaml' ||
        file.mimetype === 'application/json' || file.mimetype === 'text/plain' ||
        file.originalname.endsWith('.yaml') || file.originalname.endsWith('.yml') ||
        file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only .yaml, .yml, or .json files accepted'));
    }
  },
});

// POST / — execute commands, return results
router.post('/', upload.single('file'), async (req, res) => {
  try {
    let content = null;

    if (req.file) {
      content = req.file.buffer.toString('utf8');
    } else if (req.body && (req.body.commands || req.body.yaml)) {
      content = req.body.commands ? JSON.stringify({ commands: req.body.commands }) : req.body.yaml;
    }

    if (!content) {
      return res.status(400).json({
        error: { code: 'bad_request', message: 'Provide commands or YAML', details: {} },
      });
    }

    if (resourceManager.isThrottled()) {
      return res.status(503).json({
        error: { code: 'throttled', message: 'Resource usage too high', details: { retry_after_sec: 60 } },
      });
    }

    if (!content) {
      return res.status(400).json({
        error: {
          code: 'bad_request',
          message: 'Upload a file or provide {"commands": [...]} or {"yaml": "..."}',
          details: {},
        },
      });
    }

    const timeout = Math.min(parseInt(req.body && req.body.timeout, 10) || 600000, 3600000);
    const result = await sequentialExecutor.run(content, timeout);
    res.status(200).json({ data: result });
  } catch (err) {
    res.status(400).json({
      error: { code: 'bad_request', message: err.message, details: {} },
    });
  }
});

// GET / — list past runs
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const allRuns = sequentialExecutor.list();
  const total = allRuns.length;
  const data = allRuns.slice(offset, offset + limit);
  res.json({ data, total });
});

// GET /:id — get run details
router.get('/:id', (req, res) => {
  const run = sequentialExecutor.get(req.params.id);
  if (!run) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'Run not found', details: {} },
    });
  }
  res.json({ data: run });
});

module.exports = router;
