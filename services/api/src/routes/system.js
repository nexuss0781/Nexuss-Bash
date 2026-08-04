'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const router = express.Router();
const resourceManager = require('../core/resourceManager');
const sessionManager = require('../core/sessionManager');
const jobExecutor = require('../core/jobExecutor');
const pipelineExecutor = require('../core/pipelineExecutor');
const packageManager = require('../core/packageManager');
const { config } = require('@nexuss/shared/config');

const UPLOAD_DIR = path.join(config.WORKSPACE_BASE, 'uploads');
const METADATA_PATH = path.join(UPLOAD_DIR, 'metadata.json');

function getFileStats() {
  try {
    if (!fs.existsSync(METADATA_PATH)) {
      return { count: 0, total_size_mb: 0 };
    }
    const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
    const totalBytes = metadata.reduce((sum, f) => sum + (f.size_bytes || 0), 0);
    return {
      count: metadata.length,
      total_size_mb: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
    };
  } catch {
    return { count: 0, total_size_mb: 0 };
  }
}

router.get('/', (req, res) => {
  const snapshot = resourceManager.getSnapshot();
  const thresholdStatus = resourceManager.getThresholdStatus();
  const sessionStats = sessionManager.getStats();
  const jobStats = jobExecutor.getStats();
  const pipelines = pipelineExecutor.list();
  const packages = packageManager.list();
  const fileStats = getFileStats();

  const totalMemMB = Math.round(os.totalmem() / (1024 * 1024));
  const usedMemMB = Math.round((snapshot.mem_pct / 100) * totalMemMB);

  const totalDiskMB = config.DISK_LIMIT_MB;
  const usedDiskMB = Math.round((snapshot.disk_pct / 100) * totalDiskMB);

  let status;
  if (thresholdStatus === 'ok' || thresholdStatus === 'soft') {
    status = 'healthy';
  } else if (thresholdStatus === 'throttle') {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  const diskUsedMB = Math.round((packages.reduce((sum, p) => sum + (p.size_kb || 0), 0)) / 1024);

  res.json({
    data: {
      status,
      version: '1.0.0',
      uptime_sec: Math.floor(process.uptime()),
      resources: {
        memory: {
          total_mb: totalMemMB,
          used_mb: usedMemMB,
          pct: snapshot.mem_pct,
        },
        disk: {
          total_mb: totalDiskMB,
          used_mb: usedDiskMB,
          pct: snapshot.disk_pct,
        },
        load_avg: snapshot.load_avg,
        status: thresholdStatus,
      },
      sessions: sessionStats,
      jobs: jobStats,
      pipelines: {
        running: pipelines.filter((p) => p.status === 'running').length,
        total: pipelines.length,
      },
      packages: {
        installed: packages.length,
        disk_used_mb: diskUsedMB,
      },
      files: fileStats,
    },
  });
});

module.exports = router;
