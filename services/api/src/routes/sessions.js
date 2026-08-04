'use strict';

const express = require('express');
const router = express.Router();
const sessionManager = require('../core/sessionManager');
const resourceManager = require('../core/resourceManager');

// POST /sessions - Create new session
router.post('/', (req, res) => {
  try {
    if (resourceManager.isThrottled()) {
      return res.status(503).json({
        error: {
          code: 'throttled',
          message: 'Resource usage too high, try again later',
          details: { retry_after_sec: 60 },
        },
      });
    }
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

// GET /sessions/:id/logs - Get session logs (tail lines or byte-offset cursor)
router.get('/:id/logs', (req, res) => {
  try {
    const options = {};
    if (req.query.tail) options.tail = parseInt(req.query.tail, 10);
    if (req.query.since !== undefined) options.since = parseInt(req.query.since, 10) || 0;
    const logs = sessionManager.getLogs(req.params.id, options);
    res.json({ data: logs });
  } catch (err) {
    res.status(404).json({
      error: { code: 'not_found', message: err.message, details: {} },
    });
  }
});

// POST /sessions/:id/exec - Execute command in session
router.post('/:id/exec', (req, res) => {
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

  if (resourceManager.isThrottled()) {
    return res.status(503).json({
      error: {
        code: 'throttled',
        message: 'Resource usage too high, try again later',
        details: { retry_after_sec: 60 },
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
      if (err.message === 'Session is not active' || err.message === 'Session is busy with another command') {
        return res.status(409).json({
          error: { code: 'conflict', message: err.message, details: {} },
        });
      }
      res.status(400).json({
        error: { code: 'bad_request', message: err.message, details: {} },
      });
    });
});

// POST /sessions/:id/kill - Interrupt the command currently running in the session
router.post('/:id/kill', (req, res) => {
  try {
    const result = sessionManager.killExec(req.params.id);
    if (!result) {
      return res.status(409).json({
        error: { code: 'conflict', message: 'No command is currently running', details: {} },
      });
    }
    res.json({ data: result });
  } catch (err) {
    res.status(404).json({
      error: { code: 'not_found', message: err.message, details: {} },
    });
  }
});

// GET /sessions/:id/stream - Server-sent events for live session output
router.get('/:id/stream', (req, res) => {
  const session = sessionManager.get(req.params.id);
  if (!session) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'Session not found', details: {} },
    });
  }
  if (session.status !== 'active') {
    return res.status(409).json({
      error: { code: 'conflict', message: 'Session is not active', details: {} },
    });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`event: session\ndata: ${JSON.stringify(session)}\n\n`);

  const unsubscribe = sessionManager.subscribe(req.params.id, (event, payload) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    const current = sessionManager.get(req.params.id);
    if (!current || current.status !== 'active') {
      clearInterval(heartbeat);
      res.end();
      return;
    }
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
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
