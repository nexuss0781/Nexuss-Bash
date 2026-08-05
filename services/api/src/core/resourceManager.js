'use strict';

const fs = require('fs');
const os = require('os');
const config = require('@nexuss/shared/config');
const { log } = require('@nexuss/shared/utils');

let snapshot = {
  mem_pct: 0,
  disk_pct: 0,
  load_avg: [0, 0, 0],
  timestamp: new Date().toISOString(),
};

let thresholdStatus = 'ok';
let pollInterval = null;

const THRESHOLDS = {
  soft: 85,
  throttle: 95,
  hard: 98,
};

let onHardThreshold = null;

function readMemoryUsage() {
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const lines = meminfo.split('\n');

    let totalKB = 0;
    let availableKB = 0;

    for (const line of lines) {
      if (line.startsWith('MemTotal:')) {
        totalKB = parseInt(line.split(/\s+/)[1], 10);
      }
      if (line.startsWith('MemAvailable:')) {
        availableKB = parseInt(line.split(/\s+/)[1], 10);
      }
    }

    if (totalKB > 0) {
      const usedKB = totalKB - availableKB;
      return Math.round((usedKB / totalKB) * 1000) / 10;
    }
  } catch {
    // Fallback: use os module
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    return Math.round(((totalMem - freeMem) / totalMem) * 1000) / 10;
  }

  return 0;
}

function readDiskUsage() {
  try {
    const { execSync } = require('child_process');
    const output = execSync(`df ${config.WORKSPACE_BASE} --output=pcent 2>/dev/null || echo "0%"`, {
      encoding: 'utf8',
      timeout: 5000,
    });
    const lines = output.trim().split('\n');
    if (lines.length > 1) {
      const pctStr = lines[1].trim().replace('%', '');
      return parseInt(pctStr, 10) || 0;
    }
  } catch {
    // Fallback
  }
  return 0;
}

function readLoadAverage() {
  const loadavg = os.loadavg();
  return [
    Math.round(loadavg[0] * 100) / 100,
    Math.round(loadavg[1] * 100) / 100,
    Math.round(loadavg[2] * 100) / 100,
  ];
}

function evaluateThreshold(memPct, diskPct) {
  const maxPct = Math.max(memPct, diskPct);

  if (maxPct >= THRESHOLDS.hard) {
    return 'hard';
  } else if (maxPct >= THRESHOLDS.throttle) {
    return 'throttle';
  } else if (maxPct >= THRESHOLDS.soft) {
    return 'soft';
  }
  return 'ok';
}

function poll() {
  const memPct = readMemoryUsage();
  const diskPct = readDiskUsage();
  const loadAvg = readLoadAverage();

  snapshot = {
    mem_pct: memPct,
    disk_pct: diskPct,
    load_avg: loadAvg,
    timestamp: new Date().toISOString(),
  };

  const newStatus = evaluateThreshold(memPct, diskPct);

  if (newStatus !== thresholdStatus) {
    log('info', 'resourceManager', `Threshold changed: ${thresholdStatus} -> ${newStatus}`, {
      mem_pct: memPct,
      disk_pct: diskPct,
    });
    thresholdStatus = newStatus;
  }

  // Trigger hard threshold action
  if (newStatus === 'hard' && onHardThreshold) {
    log('warn', 'resourceManager', 'Hard threshold breached, triggering cleanup');
    onHardThreshold();
  }
}

function start() {
  if (pollInterval) return;

  // Initial poll
  poll();

  // Poll every 5 seconds
  pollInterval = setInterval(poll, 5000);
}

function stop() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function getSnapshot() {
  return { ...snapshot };
}

function getThresholdStatus() {
  return thresholdStatus;
}

function isThrottled() {
  return thresholdStatus === 'throttle' || thresholdStatus === 'hard';
}

function isSoft() {
  return thresholdStatus === 'soft';
}

function setHardThresholdCallback(callback) {
  onHardThreshold = callback;
}

module.exports = {
  start,
  stop,
  getSnapshot,
  getThresholdStatus,
  isThrottled,
  isSoft,
  setHardThresholdCallback,
  poll,
};
