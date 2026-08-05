'use strict';

const express = require('express');
const config = require('@nexuss/shared/config');
const { log } = require('@nexuss/shared/utils');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'webhook', uptime_sec: Math.floor(process.uptime()) });
});

// Telegram webhook endpoint
app.post('/webhook/telegram', (req, res) => {
  log('info', 'webhook', 'Received Telegram webhook', { body: req.body });
  // Process Telegram updates here
  res.json({ ok: true });
});

// Generic webhook endpoint
app.post('/webhook/:source', (req, res) => {
  const { source } = req.params;
  log('info', 'webhook', `Received webhook from ${source}`, { body: req.body });
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  log('info', 'webhook', `Webhook server listening on port ${PORT}`);
});