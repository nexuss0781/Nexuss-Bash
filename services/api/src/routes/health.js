'use strict';

const express = require('express');
const router = express.Router();
const resourceManager = require('../core/resourceManager');
const sessionManager = require('../core/sessionManager');
const jobExecutor = require('../core/jobExecutor');
const packageManager = require('../core/packageManager');
const pipelineExecutor = require('../core/pipelineExecutor');

router.get('/', (req, res) => {
  const snapshot = resourceManager.getSnapshot();
  const sessions = sessionManager.list();
  const jobs = jobExecutor.list();
  const thresholdStatus = resourceManager.getThresholdStatus();
  const packages = packageManager.list();
  const pipelines = pipelineExecutor.list();

  let status;
  if (thresholdStatus === 'ok' || thresholdStatus === 'soft') {
    status = 'ok';
  } else if (thresholdStatus === 'throttle') {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  const checks = {
    resources: status,
    session_manager: typeof sessionManager.list === 'function' ? 'ok' : 'error',
    job_executor: typeof jobExecutor.list === 'function' ? 'ok' : 'error',
    package_manager: typeof packageManager.list === 'function' ? 'ok' : 'error',
    pipeline_executor: typeof pipelineExecutor.list === 'function' ? 'ok' : 'error',
  };

  const allOk = Object.values(checks).every((v) => v === 'ok');
  const overallStatus = allOk ? status : 'degraded';

  res.json({
    data: {
      status: overallStatus,
      version: '1.1.0',
      uptime_sec: Math.floor(process.uptime()),
      checks,
      sessions_active: sessions.filter((s) => s.status === 'active').length,
      sessions_total_created: sessions.length,
      jobs_running: jobs.filter((j) => j.status === 'running').length,
      jobs_total_completed: jobs.filter((j) => j.status === 'completed').length,
      packages_installed: packages.length,
      pipelines_total: pipelines.length,
      mem_pct: snapshot.mem_pct,
      disk_pct: snapshot.disk_pct,
    },
  });
});

module.exports = router;
