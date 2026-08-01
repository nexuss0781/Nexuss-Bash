'use strict';

const express = require('express');
const router = express.Router();
const eventBus = require('../core/eventBus');

// GET /events - Server-sent events for run/job/pipeline lifecycle.
// Replays recent events (unless Last-Event-ID is supplied), then streams live
// events. Bearer auth required (browser consumers must proxy).
router.get('/', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const lastEventId = Number(req.headers['last-event-id'] || 0) || 0;

  for (const event of eventBus.recent(lastEventId)) {
    res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  const unsubscribe = eventBus.subscribe((event) => {
    res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

module.exports = router;
