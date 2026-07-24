'use strict';

const express = require('express');
const router = express.Router();
const resourceManager = require('../core/resourceManager');
const sessionManager = require('../core/sessionManager');
const jobExecutor = require('../core/jobExecutor');

router.get('/', (req, res) => {
  const snapshot = resourceManager.getSnapshot();
  const sessions = sessionManager.list();
  const jobs = jobExecutor.list();
  const thresholdStatus = resourceManager.getThresholdStatus();

  let status;
  if (thresholdStatus === 'ok' || thresholdStatus === 'soft') {
    status = 'ok';
  } else if (thresholdStatus === 'throttle') {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  res.json({
    data: {
      status,
      version: '1.0.0',
      uptime_sec: Math.floor(process.uptime()),
      sessions_active: sessions.filter((s) => s.status === 'active').length,
      sessions_total_created: sessions.length,
      jobs_running: jobs.filter((j) => j.status === 'running').length,
      jobs_total_completed: jobs.filter((j) => j.status === 'completed').length,
      mem_pct: snapshot.mem_pct,
      disk_pct: snapshot.disk_pct,
    },
  });
});

module.exports = router;
