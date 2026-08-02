'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { log } = require('./utils/logger');

const OUTPUT_CAP_BYTES = config.PARADOX_OUTPUT_CAP_KB * 1024;
const MAX_EVENTS = 1000;
const RESULTS_DIR = path.join(config.WORKSPACE_BASE, 'results');

let conn = null;
let enabled = false;
let ready = false;
let eventCounter = 0;
let dirty = false;
let flushTimer = null;
const FLUSH_INTERVAL_MS = config.PARADOX_FLUSH_INTERVAL_SEC * 1000;

function markDirty() {
  dirty = true;
}

function startFlushTimer() {
  if (flushTimer) return;
  // Local-only mode has no gateway snapshots, so periodically close/reopen the
  // engine to write the encrypted file to disk (crash-safe local persistence).
  flushTimer = setInterval(async () => {
    if (!ready || !dirty || !conn || config.PARADOX_GATEWAY) return;
    dirty = false;
    try {
      await conn.engine.close();
      await conn.engine.open(true);
    } catch (err) {
      log('warn', 'persistence', `periodic flush failed: ${err.message}`);
    }
  }, FLUSH_INTERVAL_MS);
}

function stopFlushTimer() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
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
    autoSync: false,
  };
  if (config.PARADOX_GATEWAY) {
    opts.project = config.PARADOX_PROJECT;
    opts.gatewayUrl = config.PARADOX_GATEWAY;
    opts.apiKey = config.PARADOX_TOKEN || undefined;
    opts.autoSync = config.PARADOX_AUTO_SYNC;
    opts.pullOnStartup = config.PARADOX_PULL_ON_STARTUP;
  }
  enabled = true;
  try {
    conn = await connect(opts);
  } catch (err) {
    log('error', 'persistence', `parad connect failed (${err.message}); persistence disabled`);
    enabled = false;
    conn = null;
    return;
  }
  await ensureSchema();
  ready = true;
  startFlushTimer();
  log('info', 'persistence', `persistence ready (${config.PARADOX_DB}, sync=${opts.autoSync ? 'on' : 'off'})`);
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
    markDirty();
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
    markDirty();
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
    markDirty();
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
    markDirty();
  } catch (err) {
    log('warn', 'persistence', `savePackage(${pkg.name}) failed: ${err.message}`);
  }
}

function removePackage(name) {
  if (!ready) return;
  try {
    db().delete('packages', { name });
    markDirty();
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
    stopFlushTimer();
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
};
