'use strict';

const express = require('express');
const router = express.Router();
const sessionManager = require('../core/sessionManager');
const resourceManager = require('../core/resourceManager');

// POST /sessions - Create new session
router.post('/', (req, res) => {
  if (resourceManager.isThrottled()) {
    return res.status(503).json({
      error: 'throttled',
      message: 'Resource usage too high, try again later',
      retry_after_sec: 60,
    });
  }

  try {
    const session = sessionManager.create();
    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// GET /sessions - List all sessions
router.get('/', (req, res) => {
  const sessions = sessionManager.list();
  res.json(sessions);
});

// GET /sessions/:id - Get session details
router.get('/:id', (req, res) => {
  const session = sessionManager.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'not_found', message: 'Session not found' });
  }
  res.json(session);
});

// GET /sessions/:id/logs - Get session logs
router.get('/:id/logs', (req, res) => {
  try {
    const tail = req.query.tail ? parseInt(req.query.tail, 10) : undefined;
    const logs = sessionManager.getLogs(req.params.id, tail);
    res.json(logs);
  } catch (err) {
    res.status(404).json({ error: 'not_found', message: err.message });
  }
});

// POST /sessions/:id/exec - Execute command in session
router.post('/:id/exec', (req, res) => {
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'bad_request', message: 'Missing command in request body' });
  }

  sessionManager
    .exec(req.params.id, command)
    .then((result) => {
      res.json(result);
    })
    .catch((err) => {
      if (err.message === 'Session not found') {
        return res.status(404).json({ error: 'not_found', message: err.message });
      }
      if (err.message === 'Session is not active') {
        return res.status(409).json({ error: 'conflict', message: err.message });
      }
      res.status(400).json({ error: 'bad_request', message: err.message });
    });
});

// DELETE /sessions/:id - Close session
router.delete('/:id', (req, res) => {
  try {
    sessionManager.close(req.params.id);
    res.json({ status: 'killed' });
  } catch (err) {
    res.status(404).json({ error: 'not_found', message: err.message });
  }
});

module.exports = router;
