'use strict';

const yaml = require('js-yaml');
const { spawn } = require('child_process');
const { log, audit } = require('../utils/logger');
const eventBus = require('./eventBus');

const runs = new Map();

function parseInput(content) {
  try {
    return yaml.load(content);
  } catch (e) {
    try {
      return JSON.parse(content);
    } catch (e2) {
      throw new Error(`Invalid YAML or JSON: ${e.message}`);
    }
  }
}

function normalizeCommands(doc) {
  if (!doc) throw new Error('Empty input');
  const raw = doc.commands || doc.steps || doc;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Provide a "commands" list (array of strings or objects)');
  }
  return raw.map((item, i) => {
    if (typeof item === 'string') {
      return { id: i + 1, name: `step_${i + 1}`, command: item, timeout_ms: 300000, stop_on_fail: false };
    }
    if (item && typeof item === 'object' && item.command) {
      return {
        id: i + 1,
        name: item.name || `step_${i + 1}`,
        command: item.command,
        timeout_ms: item.timeout ? item.timeout * 1000 : 300000,
        stop_on_fail: !!item.stop_on_fail,
      };
    }
    throw new Error(`Command ${i + 1}: must be a string or {command: "..."} object`);
  });
}

function runCommand(cmd, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn('bash', ['-c', cmd.command], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        id: cmd.id,
        name: cmd.name,
        command: cmd.command,
        status: code === 0 ? 'completed' : 'failed',
        exit_code: code,
        duration_ms: Date.now() - start,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        timed_out: killed,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        id: cmd.id,
        name: cmd.name,
        command: cmd.command,
        status: 'failed',
        exit_code: 1,
        duration_ms: Date.now() - start,
        stdout: '',
        stderr: err.message,
        timed_out: false,
      });
    });
  });
}

async function run(content, timeoutMs) {
  const startTime = Date.now();
  const maxTimeout = timeoutMs || 600000;

  const doc = parseInput(content);
  const commands = normalizeCommands(doc);

  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const runRecord = {
    id: runId,
    status: 'running',
    submitted_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    finished_at: null,
    commands,
    results: [],
    current_step: null,
    progress: `0/${commands.length}`,
  };
  runs.set(runId, runRecord);

  log('info', 'sequentialExecutor', `Run started: ${runId} (${commands.length} commands)`);
  audit('run_start', runId, { count: commands.length });
  eventBus.emit('run_started', 'run', runId, { count: commands.length });

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];

    if (Date.now() - startTime > maxTimeout) {
      const skip = {
        id: cmd.id,
        name: cmd.name,
        command: cmd.command,
        status: 'skipped',
        exit_code: null,
        duration_ms: 0,
        stdout: '',
        stderr: 'Skipped: overall timeout exceeded',
        timed_out: false,
      };
      runRecord.results.push(skip);
      runRecord.current_step = cmd.name;
      runRecord.progress = `${i + 1}/${commands.length}`;
      continue;
    }

    runRecord.current_step = cmd.name;
    runRecord.progress = `${i}/${commands.length}`;

    log('info', 'sequentialExecutor', `Run ${runId}: step ${i + 1}/${commands.length} — ${cmd.name}`);

    const result = await runCommand(cmd, maxTimeout - (Date.now() - startTime));
    runRecord.results.push(result);
    runRecord.progress = `${i + 1}/${commands.length}`;
    eventBus.emit('run_step', 'run', runId, {
      step: result.id,
      name: result.name,
      status: result.status,
      exit_code: result.exit_code,
      progress: runRecord.progress,
    });

    if (result.status === 'failed') {
      log('info', 'sequentialExecutor', `Run ${runId}: step "${cmd.name}" failed (exit ${result.exit_code})`);
      if (cmd.stop_on_fail) {
        log('info', 'sequentialExecutor', `Run ${runId}: stop_on_fail triggered, halting chain`);
        for (let j = i + 1; j < commands.length; j++) {
          runRecord.results.push({
            id: commands[j].id,
            name: commands[j].name,
            command: commands[j].command,
            status: 'skipped',
            exit_code: null,
            duration_ms: 0,
            stdout: '',
            stderr: 'Skipped: previous step failed (stop_on_fail)',
            timed_out: false,
          });
        }
        runRecord.progress = `${commands.length}/${commands.length}`;
        break;
      }
    } else {
      log('info', 'sequentialExecutor', `Run ${runId}: step "${cmd.name}" done (${result.duration_ms}ms)`);
    }
  }

  const allPassed = runRecord.results.every((r) => r.status === 'completed');
  runRecord.status = allPassed ? 'completed' : 'failed';
  runRecord.finished_at = new Date().toISOString();
  runRecord.total_duration_ms = Date.now() - startTime;

  audit('run_complete', runId, {
    status: runRecord.status,
    total_ms: runRecord.total_duration_ms,
    steps: commands.length,
  });
  log('info', 'sequentialExecutor', `Run ${runId}: ${runRecord.status} (${runRecord.total_duration_ms}ms)`);
  eventBus.emit('run_completed', 'run', runId, {
    status: runRecord.status,
    total_duration_ms: runRecord.total_duration_ms,
    steps: commands.length,
    failed_steps: runRecord.results.filter((r) => r.status === 'failed').length,
    progress: runRecord.progress,
  });

  return {
    id: runRecord.id,
    status: runRecord.status,
    submitted_at: runRecord.submitted_at,
    started_at: runRecord.started_at,
    finished_at: runRecord.finished_at,
    total_duration_ms: runRecord.total_duration_ms,
    progress: runRecord.progress,
    results: runRecord.results,
  };
}

function get(runId) {
  return runs.get(runId) || null;
}

function list() {
  return Array.from(runs.values()).map((r) => ({
    id: r.id,
    status: r.status,
    submitted_at: r.submitted_at,
    finished_at: r.finished_at,
    total_duration_ms: r.total_duration_ms,
    progress: r.progress,
    current_step: r.current_step,
    result_count: r.results.length,
  }));
}

module.exports = { run, get, list };
