'use strict';

const { config } = require('@nexuss/shared/config');
const { log } = require('@nexuss/shared/utils');
const { cleanup } = require('@nexuss/shared/persistence');

const CLEANUP_INTERVAL_MS = config.CLEANUP_INTERVAL_MIN * 60 * 1000;
const CLEANUP_TTL_MS = config.CLEANUP_TTL_HOURS * 60 * 60 * 1000;

let cleanupInterval = null;

function runCleanup() {
  log('info', 'scheduler', 'Running package cleanup...');
  try {
    const removed = cleanup();
    if (removed > 0) {
      log('info', 'scheduler', `Cleanup removed ${removed} packages`);
    }
  } catch (err) {
    log('error', 'scheduler', `Cleanup failed: ${err.message}`);
  }
}

function start() {
  if (cleanupInterval) return;
  
  // Run immediately on startup
  runCleanup();
  
  // Schedule periodic cleanup
  cleanupInterval = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  log('info', 'scheduler', `Cleanup cron started (interval: ${CLEANUP_INTERVAL_MS}ms)`);
}

function stop() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    log('info', 'scheduler', 'Cleanup cron stopped');
  }
}

// Handle cron trigger (for Render cron job)
if (require.main === module) {
  runCleanup().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { start, stop, runCleanup };