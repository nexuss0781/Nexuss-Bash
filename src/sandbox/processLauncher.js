'use strict';

const { spawn } = require('child_process');
const { createCgroup, assignPidToCgroup, destroyCgroup, buildUlimitArgs, isCgroupV2Available } = require('./isolation');
const { log } = require('../utils/logger');

const DEFAULT_TIMEOUT_MS = 30000;
const SIGTERM_GRACE_MS = 5000;

function spawnProcess(options) {
  return new Promise((resolve) => {
    const {
      command,
      args = [],
      cwd = '/workspace/jobs',
      env = process.env,
      timeout_ms = DEFAULT_TIMEOUT_MS,
      limits = {},
    } = options;

    const startTime = Date.now();
    const id = options.id || `proc-${Date.now()}`;

    // Create cgroup
    const cgroupCreated = createCgroup(id, {
      memory_mb: limits.memory_mb,
      cpu_pct: limits.cpu_pct,
    });

    // Build ulimit wrapper command
    const ulimitArgs = buildUlimitArgs(limits);
    let spawnCommand = command;
    let spawnArgs = [...args];

    // If cgroups not available and we have limits, wrap with ulimit
    if (!cgroupCreated && ulimitArgs.length > 0) {
      spawnCommand = '/bin/bash';
      spawnArgs = ['-c', `ulimit ${ulimitArgs.join(' ')} && ${command} ${args.join(' ')}`];
      log('info', 'processLauncher', `Using ulimit wrapper for ${id}`, { ulimitArgs });
    }

    const child = spawn(spawnCommand, spawnArgs, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
      uid: 1000,
      gid: 1000,
    });

    // Assign PID to cgroup
    if (cgroupCreated) {
      assignPidToCgroup(id, child.pid);
    }

    log('info', 'processLauncher', `Spawned process ${id}`, {
      pid: child.pid,
      command: spawnCommand,
      args: spawnArgs,
      cwd,
      timeout_ms,
    });

    let stdout = '';
    let stdoutTruncated = false;
    let stderr = '';
    let stderrTruncated = false;
    const maxOutputBytes = limits.max_output_bytes || 1048576;

    child.stdout.on('data', (data) => {
      if (Buffer.byteLength(stdout) + data.length > maxOutputBytes) {
        if (!stdoutTruncated) {
          stdoutTruncated = true;
          log('warn', 'processLauncher', `stdout truncated for ${id}`);
        }
        return;
      }
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      if (Buffer.byteLength(stderr) + data.length > maxOutputBytes) {
        if (!stderrTruncated) {
          stderrTruncated = true;
          log('warn', 'processLauncher', `stderr truncated for ${id}`);
        }
        return;
      }
      stderr += data.toString();
    });

    // Set timeout
    const timer = setTimeout(() => {
      log('info', 'processLauncher', `Timeout reached for ${id}, sending SIGTERM`);
      try {
        child.kill('SIGTERM');
      } catch {
        // Process may already be dead
      }

      // Force kill after grace period
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Process may already be dead
        }
      }, SIGTERM_GRACE_MS);
    }, timeout_ms);

    child.on('error', (err) => {
      clearTimeout(timer);
      const duration_ms = Date.now() - startTime;
      log('error', 'processLauncher', `Process error for ${id}: ${err.message}`);

      destroyCgroup(id);
      resolve({
        exit_code: -1,
        stdout,
        stderr: stderr + '\n' + err.message,
        duration_ms,
        signal: null,
      });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const duration_ms = Date.now() - startTime;

      destroyCgroup(id);

      log('info', 'processLauncher', `Process ${id} exited`, {
        exit_code: code,
        signal,
        duration_ms,
      });

      resolve({
        exit_code: code,
        stdout,
        stderr,
        duration_ms,
        signal,
      });
    });
  });
}

module.exports = { spawnProcess };
