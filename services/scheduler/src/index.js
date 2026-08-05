'use strict';

const config = require('@nexuss/shared/config');
const { log } = require('@nexuss/shared/utils');

// Keepalive pinger. Run by Render as a cron service (default: every 5 min) to
// prevent the Paradox gateway (and optionally the API) from idle-sleeping.
// Package cleanup runs in the API process itself (packageManager cron).

function healthUrl(raw) {
  if (!raw) return null;
  return raw.replace(/\/+$/, '').replace(/\/v1$/, '') + '/health';
}

async function ping(url) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timeout);
    log('info', 'scheduler', `keepalive ${url} -> ${res.status}`);
    return res.status;
  } catch (err) {
    clearTimeout(timeout);
    log('warn', 'scheduler', `keepalive ${url} failed: ${err.message}`);
    return null;
  }
}

async function run() {
  const targets = [];
  const gateway = healthUrl(config.PARADOX_GATEWAY);
  if (gateway) targets.push(gateway);
  if (config.KEEPALIVE_URL) targets.push(config.KEEPALIVE_URL);
  if (targets.length === 0) {
    log('warn', 'scheduler', 'No keepalive targets configured (PARADOX_GATEWAY / KEEPALIVE_URL)');
    return;
  }
  await Promise.all(targets.map(ping));
}

function start() {
  run();
  setInterval(run, (config.KEEPALIVE_INTERVAL_MIN || 5) * 60 * 1000);
}

function stop() {
  // long-lived loop only runs via start(); cron invocation exits after run()
}

// Render cron trigger
if (require.main === module) {
  run().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { start, stop, run };
