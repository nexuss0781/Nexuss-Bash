'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexuss-persist-'));
process.env.API_KEY = 'test-key';
process.env.WORKSPACE_BASE = path.join(tmp, 'workspace');
process.env.PARADOX_HOME = path.join(tmp, 'paradox');
process.env.PARADOX_PASSPHRASE = 'test-pass';
process.env.PARADOX_OUTPUT_CAP_KB = '100';
process.env.EXEC_TIMEOUT_SEC = '30';

const config = require('@nexuss/shared/config');
const persistence = require('@nexuss/shared/persistence');
const jobExecutor = require('../services/api/src/core/jobExecutor');
const pipelineExecutor = require('../services/api/src/core/pipelineExecutor');
const sequentialExecutor = require('../services/api/src/core/sequentialExecutor');
const sessionManager = require('../services/api/src/core/sessionManager');
const eventBus = require('../services/api/src/core/eventBus');
const packageManager = require('../services/api/src/core/packageManager');

function waitFor(pred, timeoutMs = 15000, step = 100) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (pred()) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(tick, step);
    };
    tick();
  });
}

// "restart": flush the DB to disk, reconnect, hydrate.
async function restart() {
  await persistence.flush();
  await persistence.init();
  return persistence.hydrate();
}

after(async () => {
  await persistence.flush();
});

test('job: submits → persists → restores after restart', async () => {
  await persistence.init();
  assert.strictEqual(persistence.isReady(), true);

  const submitted = jobExecutor.submit({ language: 'bash', code: 'echo hello-from-job', timeout_sec: 10 });
  const finished = await waitFor(() => {
    const j = jobExecutor.get(submitted.id);
    return j && (j.status === 'completed' || j.status === 'failed');
  });
  assert.ok(finished, 'job should reach a terminal state');

  const { jobs } = await restart();
  const rec = jobs.find((j) => j.id === submitted.id);
  assert.ok(rec, 'job record restored after restart');
  assert.strictEqual(rec.status, 'completed');
  assert.ok(rec.stdout.includes('hello-from-job'));

  const outFile = path.join(config.WORKSPACE_BASE, 'results', 'job', `${submitted.id}.json`);
  assert.ok(fs.existsSync(outFile), 'full output file written');
  const full = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.ok(full.stdout.includes('hello-from-job'));
});

test('run: persists and marks in-flight records interrupted on restart', async () => {
  const fakeRun = {
    id: 'run_interrupted_test',
    status: 'running',
    submitted_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    finished_at: null,
    commands: [{ id: 1, name: 'step_1', command: 'sleep 1000', timeout_ms: 300000, stop_on_fail: false }],
    results: [],
    current_step: 'step_1',
    progress: '0/1',
  };
  persistence.saveRun(fakeRun);

  const { runs } = await restart();
  const rec = runs.find((r) => r.id === fakeRun.id);
  assert.ok(rec, 'run record restored');
  assert.strictEqual(rec.status, 'interrupted');
  assert.ok(rec.finished_at, 'interrupted record gets a finished_at');
});

test('output: DB payload is capped, result file holds the full output', async () => {
  const submitted = jobExecutor.submit({
    language: 'bash',
    code: 'yes x | head -c 200000',
    timeout_sec: 10,
  });
  const finished = await waitFor(() => {
    const j = jobExecutor.get(submitted.id);
    return j && (j.status === 'completed' || j.status === 'failed');
  });
  assert.ok(finished, 'big-output job should finish');
  assert.strictEqual(jobExecutor.get(submitted.id).stdout.length, 200000);

  const { jobs } = await restart();
  const rec = jobs.find((j) => j.id === submitted.id);
  assert.ok(rec, 'big-output job restored');
  assert.strictEqual(rec.stdout.length, 100 * 1024, 'DB payload capped at 100KB');

  const outFile = path.join(config.WORKSPACE_BASE, 'results', 'job', `${submitted.id}.json`);
  const full = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.strictEqual(full.stdout.length, 200000, 'result file keeps full output');
});

test('events: persisted and replayed after restart', async () => {
  const { events } = await restart();
  const jobEvents = events.filter((e) => e.resource === 'job' && e.payload);
  assert.ok(jobEvents.length >= 2, `expected job_submitted/job_completed, got ${jobEvents.length}`);
  assert.ok(events.some((e) => e.type === 'job_submitted'));
  assert.ok(events.some((e) => e.type === 'job_completed'));

  eventBus.restore(events);
  const recent = eventBus.recent();
  assert.strictEqual(recent[recent.length - 1].id, events[events.length - 1].id, 'seq continues');
});

test('sessions: created sessions persist; active ones become interrupted ghosts', async () => {
  const created = sessionManager.create();
  assert.strictEqual(created.status, 'active');
  sessionManager.close(created.id);

  const fakeActive = {
    id: 'sess_active_fake',
    status: 'active',
    created_at: new Date().toISOString(),
    last_active_at: new Date().toISOString(),
    cwd: path.join(config.WORKSPACE_BASE, 'sessions', 'sess_active_fake'),
    logPath: '',
  };
  persistence.saveSession(fakeActive);

  const { sessions } = await restart();
  const closedRec = sessions.find((s) => s.id === created.id);
  assert.ok(closedRec, 'closed session record restored');
  assert.strictEqual(closedRec.status, 'killed');

  const interruptedRec = sessions.find((s) => s.id === fakeActive.id);
  assert.ok(interruptedRec, 'active session restored');
  assert.strictEqual(interruptedRec.status, 'interrupted', 'active session marked interrupted on boot');

  sessionManager.restore(sessions);
  const ghost = sessionManager.get(fakeActive.id);
  assert.ok(ghost);
  assert.strictEqual(ghost.status, 'interrupted');
  assert.strictEqual(ghost.pid, null);
});

test('packages: mirror into the DB and restore when manifest is empty', async () => {
  packageManager.restore([]);
  assert.strictEqual(packageManager.list().length, 0);

  const pkg = packageManager.add('echo-test-pkg', 'pip', 12);
  assert.strictEqual(packageManager.list().length, 1);

  const { packages } = await restart();
  const rec = packages.find((p) => p.name === 'echo-test-pkg');
  assert.ok(rec, 'package mirrored to DB');
  assert.strictEqual(rec.manager, 'pip');

  packageManager.restore([]); // wipe manifest, then restore from DB
  packageManager.restore(packages);
  assert.strictEqual(packageManager.list().length, 1);
  assert.strictEqual(packageManager.list()[0].name, 'echo-test-pkg');
});
