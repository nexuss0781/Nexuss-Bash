'use strict';

const fs = require('fs');
const path = require('path');
const pty = require('node-pty');
const { generateSessionId } = require('../utils/id');
const { log, audit } = require('../utils/logger');
const config = require('../config');

const sessions = new Map();
const IDLE_TIMEOUT_MS = config.IDLE_SESSION_TIMEOUT_MIN * 60 * 1000;
const EXEC_TIMEOUT_MS = config.EXEC_TIMEOUT_SEC * 1000;
const MAX_OUTPUT_BYTES = config.MAX_OUTPUT_BYTES;

const WORKSPACE_BASE = '/workspace';
const SESSIONS_DIR = path.join(WORKSPACE_BASE, 'sessions');
const LOGS_DIR = path.join(WORKSPACE_BASE, 'logs');

function create() {
  const id = generateSessionId();
  const cwd = path.join(SESSIONS_DIR, id);
  const logPath = path.join(LOGS_DIR, `${id}.log`);

  // Create workspace directory
  fs.mkdirSync(cwd, { recursive: true });

  // Spawn bash in pty
  const ptyProcess = pty.spawn('/bin/bash', [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: {
      ...process.env,
      HOME: cwd,
      TERM: 'xterm-256color',
    },
  });

  // Create log stream
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  // Pipe pty output to log
  let logBuffer = '';
  ptyProcess.onData((data) => {
    logBuffer += data;
    logStream.write(data);
  });

  const session = {
    id,
    status: 'active',
    created_at: new Date().toISOString(),
    last_active_at: new Date().toISOString(),
    cwd,
    logPath,
    logStream,
    ptyProcess,
    logBuffer,
  };

  sessions.set(id, session);

  audit('session_create', id);
  log('info', 'sessionManager', `Session created: ${id}`);

  return {
    id,
    status: 'active',
    created_at: session.created_at,
  };
}

function list() {
  return Array.from(sessions.values()).map((s) => ({
    id: s.id,
    status: s.status,
    created_at: s.created_at,
    last_active_at: s.last_active_at,
    cwd: s.cwd,
    pid: s.ptyProcess.pid,
  }));
}

function get(id) {
  const session = sessions.get(id);
  if (!session) return null;

  return {
    id: session.id,
    status: session.status,
    created_at: session.created_at,
    last_active_at: session.last_active_at,
    cwd: session.cwd,
    pid: session.ptyProcess.pid,
  };
}

function exec(id, command) {
  return new Promise((resolve, reject) => {
    const session = sessions.get(id);

    if (!session) {
      return reject(new Error('Session not found'));
    }

    if (session.status !== 'active') {
      return reject(new Error('Session is not active'));
    }

    if (!command || command.length === 0) {
      return reject(new Error('Command cannot be empty'));
    }

    if (Buffer.byteLength(command) > 65536) {
      return reject(new Error('Command exceeds 64KB limit'));
    }

    // Clear buffer
    session.logBuffer = '';

    // Track exit code via special marker
    const marker = `__NEXUSS_EXIT_$${Date.now()}__`;
    const exitCmd = `echo "${marker}$?"`;

    // Write command
    session.ptyProcess.write(command + '\n' + exitCmd + '\n');

    // Wait for output
    const startTime = Date.now();
    let output = '';

    const checkOutput = () => {
      const elapsed = Date.now() - startTime;

      if (elapsed > EXEC_TIMEOUT_MS) {
        session.last_active_at = new Date().toISOString();
        return resolve({
          stdout: output,
          stderr: '',
          exit_code: 0,
        });
      }

      // Check for marker in buffer
      const markerIdx = session.logBuffer.indexOf(marker);
      if (markerIdx !== -1) {
        // Extract exit code
        const afterMarker = session.logBuffer.slice(markerIdx + marker.length);
        const newlineIdx = afterMarker.indexOf('\n');
        const exitCodeStr = newlineIdx !== -1 ? afterMarker.slice(0, newlineIdx) : afterMarker;
        const exitCode = parseInt(exitCodeStr, 10) || 0;

        // Extract output (everything before marker, excluding the command echo)
        const beforeMarker = session.logBuffer.slice(0, markerIdx);
        const lines = beforeMarker.split('\n');
        // Remove first few lines (command echo + exit cmd echo)
        const outputLines = lines.slice(3);
        output = outputLines.join('\n');

        session.last_active_at = new Date().toISOString();
        audit('session_exec', id, { command, exit_code: exitCode });
        return resolve({
          stdout: output,
          stderr: '',
          exit_code: exitCode,
        });
      }

      // Continue waiting
      setTimeout(checkOutput, 50);
    };

    setTimeout(checkOutput, 50);
  });
}

function getLogs(id, tail) {
  const session = sessions.get(id);
  if (!session) {
    throw new Error('Session not found');
  }

  const logPath = session.logPath;

  if (!fs.existsSync(logPath)) {
    return { log: '' };
  }

  const content = fs.readFileSync(logPath, 'utf8');

  if (tail && tail > 0) {
    const lines = content.split('\n');
    const tailLines = lines.slice(-tail);
    return { log: tailLines.join('\n') };
  }

  return { log: content };
}

function close(id) {
  const session = sessions.get(id);

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status === 'killed') {
    return; // Already closed
  }

  // Kill pty process
  try {
    session.ptyProcess.kill();
  } catch {
    // Process may already be dead
  }

  // Close log stream
  try {
    session.logStream.end();
  } catch {
    // Stream may already be closed
  }

  session.status = 'killed';
  audit('session_close', id);
  log('info', 'sessionManager', `Session closed: ${id}`);
}

// Idle expiry sweep
let sweepInterval = null;

function startSweep() {
  if (sweepInterval) return;

  sweepInterval = setInterval(() => {
    const now = Date.now();

    for (const [id, session] of sessions) {
      if (session.status !== 'active') continue;

      const lastActive = new Date(session.last_active_at).getTime();
      if (now - lastActive > IDLE_TIMEOUT_MS) {
        log('info', 'sessionManager', `Session ${id} expired after idle timeout`);
        close(id);
      }
    }
  }, 60000);
}

function stopSweep() {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
}

function getStats() {
  const all = Array.from(sessions.values());
  return {
    active: all.filter((s) => s.status === 'active').length,
    total_created: all.length,
  };
}

function getAllSessions() {
  return sessions;
}

module.exports = {
  create,
  list,
  get,
  exec,
  getLogs,
  close,
  startSweep,
  stopSweep,
  getStats,
  getAllSessions,
};
