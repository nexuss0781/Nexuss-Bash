'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { log } = require('../utils/logger');

const OUTPUT_CAP_BYTES = config.PARADOX_OUTPUT_CAP_KB * 1024;
const MAX_EVENTS = 1000;
const RESULTS_DIR = path.join(config.WORKSPACE_BASE, 'results');

let conn = null;
let enabled = false;
let ready = false;
let eventCounter = 0;

const CONNECT_ATTEMPTS = 3;
const CONNECT_BACKOFF_MS = [1000, 3000, 5000];

async function connectWithRetry(connect, opts) {
  let lastErr;
  for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt++) {
    try {
      return await connect(opts);
    } catch (err) {
      lastErr = err;
      const delay = CONNECT_BACKOFF_MS[attempt] || CONNECT_BACKOFF_MS[CONNECT_BACKOFF_MS.length - 1];
      log(
        'warn',
        'persistence',
        `parad connect attempt ${attempt + 1}/${CONNECT_ATTEMPTS} failed (${err.message}); retrying in ${delay / 1000}s`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  log('error', 'persistence', `parad connect failed after ${CONNECT_ATTEMPTS} attempts (${lastErr.message}); persistence disabled`);
  return null;
}

function isEnabled() {
  return enabled;
}

function isReady() {
  return ready;
}

async function init() {
  const { connect } = await import('parad');
  const opts = {
    name: config.PARADOX_DB,
    passphrase: config.PARADOX_PASSPHRASE,
    autoSync: config.PARADOX_AUTO_SYNC !== 'false',
  };
  if (config.PARADOX_GATEWAY) {
    opts.project = config.PARADOX_PROJECT;
    opts.gatewayUrl = config.PARADOX_GATEWAY;
    opts.apiKey = config.PARADOX_TOKEN || undefined;
    opts.autoSync = config.PARADOX_AUTO_SYNC !== 'false';
    opts.pullOnStartup = config.PARADOX_PULL_ON_STARTUP === 'true';
    if (config.PARADOX_STORAGE_CHANNEL) opts.storageChannel = config.PARADOX_STORAGE_CHANNEL;
  }
  enabled = true;
  conn = await connectWithRetry(connect, opts);
  if (!conn) {
    enabled = false;
    log('error', 'persistence', 'parad connect failed after retries; persistence disabled');
    return;
  }
  await ensureSchema();
  ready = true;
  log('info', 'persistence', `persistence ready (${config.PARADOX_DB}, sync=${opts.autoSync ? 'on' : 'off'})`);

  // Periodic connection health check with auto-reconnect
  if (config.PARADOX_GATEWAY) {
    setInterval(async () => {
      if (!enabled || !conn) return;
      try {
        await conn.engine.execute('SELECT 1');
      } catch (err) {
        log('warn', 'persistence', `Health check failed (${err.message}), reconnecting...`);
        ready = false;
        conn = await connectWithRetry(connect, opts);
        if (conn) {
          await ensureSchema();
          ready = true;
          log('info', 'persistence', 'Reconnected successfully');
        } else {
          enabled = false;
          log('error', 'persistence', 'Reconnection failed; persistence disabled');
        }
      }
    }, 30000);
  }
}

function db() {
  if (!conn) throw new Error('persistence not initialized');
  return conn.engine;
}

function ensureSchema() {
  const d = db();
  d.execute(`CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    status TEXT,
    submitted_at TEXT,
    finished_at TEXT,
    output_path TEXT,
    payload TEXT
  )`);
  d.execute(`CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    status TEXT,
    language TEXT,
    submitted_at TEXT,
    finished_at TEXT,
    output_path TEXT,
    payload TEXT
  )`);
  d.execute(`CREATE TABLE IF NOT EXISTS pipelines (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT,
    submitted_at TEXT,
    finished_at TEXT,
    output_path TEXT,
    payload TEXT
  )`);
  d.execute(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    status TEXT,
    created_at TEXT,
    last_active_at TEXT,
    payload TEXT
  )`);
  d.execute(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    resource TEXT,
    resource_id TEXT,
    timestamp TEXT,
    payload TEXT
  )`);
  d.execute(`CREATE TABLE IF NOT EXISTS packages (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE,
    manager TEXT,
    installed_at TEXT,
    size_kb INTEGER,
    protected INTEGER,
    last_used TEXT,
    payload TEXT
  )`);
  d.execute(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    username TEXT,
    password_hash TEXT,
    api_key_hash TEXT UNIQUE,
    created_at TEXT
  )`);
}

// ── serialization helpers ───────────────────────────────────────

function capOutput(value) {
  if (value == null) return null;
  const s = String(value);
  return s.length > OUTPUT_CAP_BYTES ? s.slice(0, OUTPUT_CAP_BYTES) : s;
}

function capped(record) {
  if (Array.isArray(record)) return record.map(capped);
  if (record && typeof record === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(record)) {
      if (k === 'stdout' || k === 'stderr') out[k] = capOutput(v);
      else out[k] = capped(v);
    }
    return out;
  }
  return record;
}

function writeResultFile(kind, id, fullRecord) {
  try {
    const dir = path.join(RESULTS_DIR, kind);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(fullRecord, null, 2));
    return filePath;
  } catch (err) {
    log('warn', 'persistence', `writeResultFile(${kind}/${id}) failed: ${err.message}`);
    return null;
  }
}

const TERMINAL = new Set(['completed', 'failed', 'interrupted', 'cancelled', 'killed', 'skipped']);

function persist(kind, table, record, getFull, columns) {
  if (!ready) return;
  try {
    let outputPath = null;
    const row = db().get(table, { id: record.id }) || null;
    if (TERMINAL.has(record.status) && (!row || !row.output_path)) {
      outputPath = writeResultFile(kind, record.id, getFull(record));
    } else if (row && row.output_path) {
      outputPath = row.output_path;
    }
    const base = {
      id: record.id,
      status: record.status,
      submitted_at: record.submitted_at || null,
      finished_at: record.finished_at || null,
      output_path: outputPath,
      payload: JSON.stringify(capped(record)),
    };
    db().upsert(table, { ...base, ...columns }, 'id');
  } catch (err) {
    log('warn', 'persistence', `persist(${kind}/${record.id}) failed: ${err.message}`);
  }
}

// ── store helpers ───────────────────────────────────────────────

function saveRun(run) {
  persist('run', 'runs', run, (rec) => rec);
}

function saveJob(job) {
  persist('job', 'jobs', job, (rec) => rec, { language: job.language || null });
}

function savePipeline(pipeline) {
  persist('pipeline', 'pipelines', pipeline, (rec) => rec);
}

function saveSession(session) {
  if (!ready) return;
  try {
    const rec = {
      id: session.id,
      status: session.status,
      created_at: session.created_at,
      last_active_at: session.last_active_at,
      cwd: session.cwd || '',
      log_path: session.logPath || '',
    };
    db().upsert(
      'sessions',
      {
        id: rec.id,
        status: rec.status,
        created_at: rec.created_at,
        last_active_at: rec.last_active_at,
        payload: JSON.stringify(rec),
      },
      'id',
    );
  } catch (err) {
    log('warn', 'persistence', `saveSession(${session.id}) failed: ${err.message}`);
  }
}

function saveEvent(event) {
  if (!ready) return;
  try {
    db().insert('events', {
      type: event.type,
      resource: event.resource,
      resource_id: event.resource_id,
      timestamp: event.timestamp,
      payload: JSON.stringify(event),
    });
    eventCounter++;
    if (eventCounter % 50 === 0) pruneEvents();
  } catch (err) {
    log('warn', 'persistence', `saveEvent failed: ${err.message}`);
  }
}

function pruneEvents() {
  if (!ready) return;
  try {
    db().execute(`DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT ${MAX_EVENTS})`);
  } catch (err) {
    log('warn', 'persistence', `pruneEvents failed: ${err.message}`);
  }
}

function savePackage(pkg) {
  if (!ready) return;
  try {
    db().upsert(
      'packages',
      {
        id: pkg.id,
        name: pkg.name,
        manager: pkg.manager,
        installed_at: pkg.installed_at,
        size_kb: pkg.size_kb || 0,
        protected: pkg.protected ? 1 : 0,
        last_used: pkg.last_used,
        payload: JSON.stringify(pkg),
      },
      'name',
    );
  } catch (err) {
    log('warn', 'persistence', `savePackage(${pkg.name}) failed: ${err.message}`);
  }
}

function removePackage(name) {
  if (!ready) return;
  try {
    db().delete('packages', { name });
  } catch (err) {
    log('warn', 'persistence', `removePackage(${name}) failed: ${err.message}`);
  }
}

function getPayload(row) {
  if (!row) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

function loadTable(table) {
  if (!ready) return [];
  return db()
    .select(table)
    .map((row) => getPayload(row))
    .filter(Boolean);
}

// ── user store (per-user API keys, hashed at rest) ───────────────

function upsertUser(user) {
  if (!ready) return null;
  try {
    db().upsert(
      'users',
      {
        id: user.id,
        email: user.email,
        username: user.username,
        password_hash: user.password_hash || null,
        api_key_hash: user.api_key_hash || null,
        created_at: user.created_at || new Date().toISOString(),
      },
      'id',
    );
    return user;
  } catch (err) {
    log('warn', 'persistence', `upsertUser(${user.email}) failed: ${err.message}`);
    return null;
  }
}

function getUserByApiKeyHash(hash) {
  if (!ready) return null;
  try {
    return db().select('users').find((r) => r.api_key_hash === hash) || null;
  } catch (err) {
    log('warn', 'persistence', `getUserByApiKeyHash failed: ${err.message}`);
    return null;
  }
}

function getUserByEmail(email) {
  if (!ready) return null;
  try {
    return db().select('users').find((r) => String(r.email).toLowerCase() === String(email).toLowerCase()) || null;
  } catch (err) {
    log('warn', 'persistence', `getUserByEmail failed: ${err.message}`);
    return null;
  }
}

function getUserById(id) {
  if (!ready) return null;
  try {
    return db().select('users').find((r) => r.id === id) || null;
  } catch (err) {
    log('warn', 'persistence', `getUserById failed: ${err.message}`);
    return null;
  }
}

// ── boot: hydrate maps + mark interrupted ───────────────────────

function hydrate() {
  if (!ready) return { runs: [], jobs: [], pipelines: [], sessions: [], events: [], packages: [] };
  const now = new Date().toISOString();
  const mark = (rec, statuses, terminal) => {
    if (statuses.includes(rec.status)) {
      rec.status = 'interrupted';
      rec.finished_at = now;
      return true;
    }
    return false;
  };

  const runs = loadTable('runs');
  for (const rec of runs) {
    if (mark(rec, ['running'], 'interrupted')) saveRun(rec);
  }

  const jobs = loadTable('jobs');
  for (const rec of jobs) {
    if (mark(rec, ['queued', 'running'], 'interrupted')) saveJob(rec);
  }

  const pipelines = loadTable('pipelines');
  for (const rec of pipelines) {
    if (mark(rec, ['pending', 'running'], 'interrupted')) {
      for (const step of rec.steps || []) {
        if (['pending', 'running'].includes(step.status)) step.status = 'skipped';
      }
      savePipeline(rec);
    }
  }

  const sessions = loadTable('sessions');
  for (const rec of sessions) {
    if (mark(rec, ['active'], 'interrupted')) saveSession(rec);
  }

  pruneEvents();
  const events = loadTable('events').slice(-200);

  const packages = loadTable('packages');

  return { runs, jobs, pipelines, sessions, events, packages };
}

async function flush() {
  if (!conn) return;
  try {
    conn.close();
    conn = null;
    enabled = false;
    ready = false;
    log('info', 'persistence', 'persistence closed');
  } catch (err) {
    log('warn', 'persistence', `flush failed: ${err.message}`);
  }
}

module.exports = {
  init,
  hydrate,
  flush,
  isEnabled,
  isReady,
  saveRun,
  saveJob,
  savePipeline,
  saveSession,
  saveEvent,
  savePackage,
  removePackage,
  pruneEvents,
  upsertUser,
  getUserByApiKeyHash,
  getUserByEmail,
  getUserById,
};
