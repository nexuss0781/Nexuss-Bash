'use strict';

const express = require('express');
const router = express.Router();
const sessionManager = require('../core/sessionManager');
const resourceManager = require('../core/resourceManager');

// POST /sessions - Create new session
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

  try {
    const session = sessionManager.create();
    res.status(201).json({ data: session });
  } catch (err) {
    res.status(500).json({
      error: { code: 'internal_error', message: err.message, details: {} },
    });
  }
});

// GET /sessions - List all sessions with pagination
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const allSessions = sessionManager.list();
  const total = allSessions.length;
  const data = allSessions.slice(offset, offset + limit);
  res.json({ data, total });
});

// GET /sessions/:id - Get session details
router.get('/:id', (req, res) => {
  const session = sessionManager.get(req.params.id);
  if (!session) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'Session not found', details: {} },
    });
  }
  res.json({ data: session });
});

// GET /sessions/:id/logs - Get session logs
router.get('/:id/logs', (req, res) => {
  try {
    const tail = req.query.tail ? parseInt(req.query.tail, 10) : undefined;
    const logs = sessionManager.getLogs(req.params.id, tail);
    res.json({ data: logs });
  } catch (err) {
    res.status(404).json({
      error: { code: 'not_found', message: err.message, details: {} },
    });
  }
});

// POST /sessions/:id/exec - Execute command in session
router.post('/:id/exec', (req, res) => {
  if (resourceManager.isThrottled()) {
    return res.status(503).json({
      error: {
        code: 'throttled',
        message: 'Resource usage too high, try again later',
        details: { retry_after_sec: 60 },
      },
    });
  }

  const { command } = req.body;

  if (!command) {
    return res.status(400).json({
      error: {
        code: 'bad_request',
        message: 'Missing command in request body',
        details: { field: 'command' },
      },
    });
  }

  sessionManager
    .exec(req.params.id, command)
    .then((result) => {
      res.json({ data: result });
    })
    .catch((err) => {
      if (err.message === 'Session not found') {
        return res.status(404).json({
          error: { code: 'not_found', message: err.message, details: {} },
        });
      }
      if (err.message === 'Session is not active') {
        return res.status(409).json({
          error: { code: 'conflict', message: err.message, details: {} },
        });
      }
      res.status(400).json({
        error: { code: 'bad_request', message: err.message, details: {} },
      });
    });
});

// DELETE /sessions/:id - Close session
router.delete('/:id', (req, res) => {
  try {
    sessionManager.close(req.params.id);
    res.json({ data: { status: 'killed' } });
  } catch (err) {
    res.status(404).json({
      error: { code: 'not_found', message: err.message, details: {} },
    });
  }
});

module.exports = router;
