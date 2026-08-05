'use strict';

const express = require('express');
const router = express.Router();
const resourceManager = require('../core/resourceManager');
const sessionManager = require('../core/sessionManager');
const jobExecutor = require('../core/jobExecutor');
const config = require('@nexuss/shared/config');

router.get('/', (req, res) => {
  const snapshot = resourceManager.getSnapshot();
  const sessions = sessionManager.list();
  const jobs = jobExecutor.list();

  const totalMemMB = Math.round(require('os').totalmem() / (1024 * 1024));
  const usedMemMB = Math.round((snapshot.mem_pct / 100) * totalMemMB);

  const totalDiskMB = config.DISK_LIMIT_MB;
  const usedDiskMB = Math.round((snapshot.disk_pct / 100) * totalDiskMB);

  res.json({
    data: {
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
      status: resourceManager.getThresholdStatus(),
      sessions_active: sessions.filter((s) => s.status === 'active').length,
      jobs_running: jobs.filter((j) => j.status === 'running').length,
    },
  });
});

module.exports = router;
