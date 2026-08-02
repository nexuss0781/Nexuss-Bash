'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnProcess } = require('../sandbox/processLauncher');
const { generateJobId } = require('../utils/id');
const { log, audit } = require('../utils/logger');
const eventBus = require('./eventBus');
const persistence = require('../persistence');
const config = require('../config');

const jobs = new Map();
const JOB_TIMEOUT_MS = config.JOB_TIMEOUT_SEC * 1000;
const JOBS_DIR = path.join(config.WORKSPACE_BASE, 'jobs');

const LANGUAGE_COMMANDS = {
  python3: (scriptPath) => ({ command: 'python3', args: [scriptPath] }),
  node: (scriptPath) => ({ command: 'node', args: [scriptPath] }),
  bash: (scriptPath) => ({ command: 'bash', args: [scriptPath] }),
  php: (scriptPath) => ({ command: 'php', args: [scriptPath] }),
};

const LANGUAGE_EXTENSIONS = {
  python3: '.py',
  node: '.js',
  bash: '.sh',
  php: '.php',
};

function submit({ language, code, timeout_sec, limits = {} }) {
  // Validate
  if (!language || !LANGUAGE_COMMANDS[language]) {
    throw new Error(`Unsupported language: ${language}. Supported: ${Object.keys(LANGUAGE_COMMANDS).join(', ')}`);
  }

  if (!code || code.length === 0) {
    throw new Error('Code cannot be empty');
  }

  const timeoutMs = (timeout_sec || config.JOB_TIMEOUT_SEC) * 1000;

  const id = generateJobId();
  const jobDir = path.join(JOBS_DIR, id);

  // Create scratch directory
  fs.mkdirSync(jobDir, { recursive: true });

  // Write script file
  const ext = LANGUAGE_EXTENSIONS[language];
  const scriptPath = path.join(jobDir, `script${ext}`);
  fs.writeFileSync(scriptPath, code);

  const job = {
    id,
    status: 'queued',
    language,
    submitted_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    exit_code: null,
    stdout: '',
    stderr: '',
    duration_ms: null,
    jobDir,
    scriptPath,
    timeoutMs,
    limits,
  };

  jobs.set(id, job);
  persistence.saveJob(job);

  audit('job_submit', id, { language, code_length: code.length });
  log('info', 'jobExecutor', `Job submitted: ${id}`, { language });
  eventBus.emit('job_submitted', 'job', id, { language });

  // Start execution async
  executeJob(id);

  return {
    id,
    status: 'queued',
    submitted_at: job.submitted_at,
  };
}

async function executeJob(id) {
  const job = jobs.get(id);
  if (!job) return;

  job.status = 'running';
  job.started_at = new Date().toISOString();
  persistence.saveJob(job);

  log('info', 'jobExecutor', `Job running: ${id}`);
  eventBus.emit('job_running', 'job', id, { language: job.language });

  try {
    const langConfig = LANGUAGE_COMMANDS[job.language];
    const { command, args } = langConfig(job.scriptPath);

    const result = await spawnProcess({
      id: `job-${id}`,
      command,
      args,
      cwd: job.jobDir,
      timeout_ms: job.timeoutMs,
      limits: {
        memory_mb: job.limits.memory_mb,
        cpu_pct: job.limits.cpu_pct,
        disk_mb: job.limits.disk_mb || 100,
        max_output_bytes: config.MAX_OUTPUT_BYTES,
      },
    });

    job.exit_code = result.exit_code;
    job.stdout = result.stdout;
    job.stderr = result.stderr;
    job.duration_ms = result.duration_ms;
    job.status = result.exit_code === 0 ? 'completed' : 'failed';
    job.finished_at = new Date().toISOString();
    eventBus.emit(job.status === 'completed' ? 'job_completed' : 'job_failed', 'job', id, {
      status: job.status,
      exit_code: job.exit_code,
      duration_ms: job.duration_ms,
    });
    persistence.saveJob(job);
  } catch (err) {
    job.status = 'failed';
    job.stderr = err.message;
    job.finished_at = new Date().toISOString();
    job.duration_ms = Date.now() - new Date(job.started_at).getTime();
    log('error', 'jobExecutor', `Job ${id} failed: ${err.message}`);
    eventBus.emit('job_failed', 'job', id, { status: 'failed', exit_code: null, duration_ms: job.duration_ms });
    persistence.saveJob(job);
  }

  // Cleanup scratch dir
  try {
    fs.rmSync(job.jobDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }

  audit('job_complete', id, { status: job.status, exit_code: job.exit_code });
  log('info', 'jobExecutor', `Job ${id} finished: ${job.status}`);
}

function get(id) {
  const job = jobs.get(id);
  if (!job) return null;

  const result = {
    id: job.id,
    status: job.status,
    language: job.language,
    submitted_at: job.submitted_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
    exit_code: job.exit_code,
    duration_ms: job.duration_ms,
  };

  // Only include stdout/stderr for completed/failed/timed_out jobs
  if (['completed', 'failed', 'timed_out'].includes(job.status)) {
    result.stdout = job.stdout;
    result.stderr = job.stderr;
  }

  return result;
}

function list() {
  return Array.from(jobs.values()).map((j) => ({
    id: j.id,
    status: j.status,
    language: j.language,
    submitted_at: j.submitted_at,
  }));
}

function getStats() {
  const all = Array.from(jobs.values());
  return {
    running: all.filter((j) => j.status === 'running').length,
    completed: all.filter((j) => j.status === 'completed').length,
    failed: all.filter((j) => j.status === 'failed').length,
  };
}

function restore(jobRecords) {
  for (const rec of jobRecords) {
    if (!rec || !rec.id) continue;
    const job = rec;
    if (['queued', 'running'].includes(job.status)) {
      job.status = 'interrupted';
      job.finished_at = new Date().toISOString();
    }
    jobs.set(job.id, job);
  }
}

module.exports = {
  submit,
  get,
  list,
  getStats,
  restore,
  getAllJobs: () => jobs,
};
