'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const pty = require('node-pty');
const { generateSessionId } = require('../utils/id');
const { log, audit } = require('../utils/logger');
const config = require('../config');

const sessions = new Map();
const IDLE_TIMEOUT_MS = config.IDLE_SESSION_TIMEOUT_MIN * 60 * 1000;
const EXEC_TIMEOUT_MS = config.EXEC_TIMEOUT_SEC * 1000;
const KILL_GRACE_MS = 500;
const MAX_OUTPUT_BYTES = config.MAX_OUTPUT_BYTES;

const WORKSPACE_BASE = config.WORKSPACE_BASE;
const SESSIONS_DIR = path.join(WORKSPACE_BASE, 'sessions');
const LOGS_DIR = path.join(WORKSPACE_BASE, 'logs');

fs.mkdirSync(SESSIONS_DIR, { recursive: true });
fs.mkdirSync(LOGS_DIR, { recursive: true });

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shellQuote(str) {
  return "'" + String(str).replace(/'/g, "'\\''") + "'";
}

function readStderr(execState) {
  if (!execState.errFile) return '';
  try {
    return fs.readFileSync(execState.errFile, 'utf8').replace(/\s+$/, '');
  } catch {
    return '';
  }
}

function cleanupExecFiles(execState) {
  for (const file of [execState.scriptFile, execState.errFile]) {
    if (file) {
      try {
        fs.unlinkSync(file);
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
}

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

  const session = {
    id,
    status: 'active',
    created_at: new Date().toISOString(),
    last_active_at: new Date().toISOString(),
    cwd,
    logPath,
    logStream,
    logBytes: 0,
    ptyProcess,
    activeExec: null,
    subscribers: new Set(),
  };

  // Pipe pty output to log, SSE subscribers, and the active exec capture
  ptyProcess.onData((data) => {
    logStream.write(data);
    session.logBytes += Buffer.byteLength(data);

    for (const sub of session.subscribers) {
      try {
        sub.onEvent('stdout', data);
      } catch (e) {
        log('warn', 'sessionManager', `Subscriber error: ${e.message}`);
      }
    }

    const execState = session.activeExec;
    if (execState && !execState.finished && !execState.truncated) {
      const newLen = Buffer.byteLength(execState.buffer) + Buffer.byteLength(data);
      if (newLen > MAX_OUTPUT_BYTES) {
        execState.truncated = true;
        execState.buffer += `\n[output truncated at ${MAX_OUTPUT_BYTES} bytes]\n`;
      } else {
        execState.buffer += data;
      }
    }
  });

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

function emit(session, event, payload) {
  for (const sub of session.subscribers) {
    try {
      sub.onEvent(event, payload);
    } catch (e) {
      log('warn', 'sessionManager', `Subscriber error: ${e.message}`);
    }
  }
}

function subscribe(id, handler) {
  const session = sessions.get(id);
  if (!session) {
    throw new Error('Session not found');
  }
  const entry = { onEvent: handler };
  session.subscribers.add(entry);
  return () => session.subscribers.delete(entry);
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

    if (session.activeExec) {
      return reject(new Error('Session is busy with another command'));
    }

    const ts = Date.now();
    const beginMarker = `__NEXUSS_BEGIN_${ts}__`;
    const endMarker = `__NEXUSS_EXIT_${ts}__`;
    const beginCmd = `echo ${beginMarker}`;
    const endCmd = `echo ${endMarker}$?`;

    // Per-exec scratch files: the command is run via `source` in the session
    // shell (preserving cwd/env state) with stderr teed into a file so
    // `ExecResult.stderr` is clean, while still appearing live on the pty.
    const execDir = path.join(os.tmpdir(), 'nexuss-exec', id);
    fs.mkdirSync(execDir, { recursive: true });
    const scriptFile = path.join(execDir, `${ts}.sh`);
    const errFile = path.join(execDir, `${ts}.err`);
    fs.writeFileSync(scriptFile, command + '\n');

    const execState = {
      command,
      buffer: '',
      truncated: false,
      startTime: ts,
      killRequested: false,
      killed: false,
      finished: false,
      pollTimer: null,
      timeoutFiredAt: null,
      scriptFile,
      errFile,
    };
    session.activeExec = execState;

    const finish = (result) => {
      if (execState.finished) return;
      execState.finished = true;
      session.activeExec = null;
      if (execState.pollTimer) clearTimeout(execState.pollTimer);
      session.last_active_at = new Date().toISOString();
      result.stderr = readStderr(execState) || result.stderr;
      setTimeout(() => cleanupExecFiles(execState), 1000);
      audit('session_exec', id, {
        command,
        exit_code: result.exit_code,
        timed_out: !!result.timed_out,
        killed: !!result.killed,
      });
      emit(session, 'exec_end', {
        command,
        exit_code: result.exit_code,
        timed_out: !!result.timed_out,
        killed: !!result.killed,
        duration_ms: result.duration_ms,
      });
      resolve(result);
    };
    execState.finish = finish;

    // Extract the command's output as the clean window between the begin
    // marker output line and the end marker output line.
    //
    // The end marker must be followed by digits (`__NEXUSS_EXIT_<ts>__0`).
    // The echoed input of the wrapper line ends in `__NEXUSS_EXIT_<ts>__$?`,
    // which is NOT a valid match, so a premature resolve on echoed input is
    // impossible even if local echo was still enabled.
    const endMarkerRe = new RegExp(escapeRegExp(endMarker) + '\\s*(\\d+)');
    const extractOutput = (buffer) => {
      const beginIdx = buffer.indexOf(beginMarker);
      if (beginIdx === -1) return null;

      const afterBegin = buffer.slice(beginIdx + beginMarker.length);
      const beginNl = afterBegin.indexOf('\n');
      const windowStart = beginIdx + beginMarker.length + (beginNl !== -1 ? beginNl + 1 : afterBegin.length);

      const afterStart = buffer.slice(windowStart);
      const endMatch = afterStart.match(endMarkerRe);
      if (!endMatch) return null;

      const endIdx = windowStart + endMatch.index;
      const exitCode = parseInt(endMatch[1], 10);

      const output = buffer.slice(windowStart, endIdx).replace(/\s+$/, '');
      return { output, exitCode };
    };

    const poll = () => {
      if (execState.finished) return;

      const elapsed = Date.now() - execState.startTime;

      if (elapsed > EXEC_TIMEOUT_MS && !execState.killRequested) {
        execState.killRequested = true;
        try {
          session.ptyProcess.write('\x03');
        } catch (e) {
          log('warn', 'sessionManager', `Failed to interrupt command: ${e.message}`);
        }
        execState.timeoutFiredAt = Date.now();
      }

      if (execState.timeoutFiredAt && Date.now() - execState.timeoutFiredAt > KILL_GRACE_MS) {
        const extracted = extractOutput(execState.buffer);
        return finish({
          stdout: extracted ? extracted.output : execState.buffer,
          stderr: '',
          exit_code: 124,
          timed_out: true,
          killed: false,
          truncated: execState.truncated,
          duration_ms: Date.now() - execState.startTime,
        });
      }

      const extracted = extractOutput(execState.buffer);
      if (extracted) {
        return finish({
          stdout: extracted.output,
          stderr: '',
          exit_code: extracted.exitCode,
          timed_out: false,
          killed: execState.killed,
          truncated: execState.truncated,
          duration_ms: Date.now() - execState.startTime,
        });
      }

      execState.pollTimer = setTimeout(poll, 50);
    };

    execState.pollTimer = setTimeout(poll, 50);

    emit(session, 'exec_start', { command });

    // Disable local echo + prompt, run the wrapper, then restore. The stty
    // command is allowed to take effect before the wrapper is written so the
    // typed wrapper is not echoed back into the capture buffer. stderr is
    // teed into a file (captured for the result) while still reaching the pty.
    const wrapperCmd =
      `source ${shellQuote(scriptFile)} 2> >(tee -a ${shellQuote(errFile)} >&2)`;
    session.ptyProcess.write("PS1='' && stty -echo" + '\n');
    setTimeout(() => {
      session.ptyProcess.write(beginCmd + '\n' + wrapperCmd + '\n' + endCmd + '\n' + "stty echo && PS1='\\$ '" + '\n');
    }, 100);
    session.last_active_at = new Date().toISOString();
  });
}

function killExec(id) {
  const session = sessions.get(id);
  if (!session) {
    throw new Error('Session not found');
  }

  const execState = session.activeExec;
  if (!execState || execState.finished) {
    return null;
  }

  execState.killed = true;
  execState.killRequested = true;
  try {
    session.ptyProcess.write('\x03');
  } catch (e) {
    log('warn', 'sessionManager', `Failed to interrupt command: ${e.message}`);
  }

  execState.finish({
    stdout: execState.buffer,
    stderr: '',
    exit_code: 130,
    timed_out: false,
    killed: true,
    truncated: execState.truncated,
    duration_ms: Date.now() - execState.startTime,
  });

  return { status: 'killed' };
}

function getLogs(id, options = {}) {
  const session = sessions.get(id);
  if (!session) {
    throw new Error('Session not found');
  }

  const logPath = session.logPath;

  if (!fs.existsSync(logPath)) {
    return { log: '', offset: 0 };
  }

  const content = fs.readFileSync(logPath, 'utf8');
  const totalBytes = Buffer.byteLength(content, 'utf8');

  const tail = options.tail;
  if (tail && tail > 0) {
    const lines = content.split('\n');
    return { log: lines.slice(-tail).join('\n'), offset: totalBytes };
  }

  const since = options.since;
  if (since !== undefined && since > 0) {
    const offset = Math.min(since, totalBytes);
    const bytes = Buffer.from(content, 'utf8').slice(offset);
    return { log: bytes.toString('utf8'), offset: totalBytes };
  }

  return { log: content, offset: totalBytes };
}

function close(id) {
  const session = sessions.get(id);

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status === 'killed') {
    return; // Already closed
  }

  // Resolve any in-flight exec as killed
  const execState = session.activeExec;
  if (execState && !execState.finished) {
    execState.killed = true;
    execState.killRequested = true;
    execState.finish({
      stdout: execState.buffer,
      stderr: '',
      exit_code: 143,
      timed_out: false,
      killed: true,
      truncated: execState.truncated,
      duration_ms: Date.now() - execState.startTime,
    });
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

  emit(session, 'close', { status: 'killed' });
  session.subscribers.clear();

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
  killExec,
  subscribe,
  getLogs,
  close,
  startSweep,
  stopSweep,
  getStats,
  getAllSessions,
};
