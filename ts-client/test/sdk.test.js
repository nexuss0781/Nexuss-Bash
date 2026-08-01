'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { NexussBash, AuthError } = require('../dist/index.js');

const API_KEY = process.env.NEXUSS_API_KEY;
const BASE_URL = process.env.NEXUSS_BASE_URL;

const config = {
  apiKey: API_KEY || 'test-only',
  baseUrl: BASE_URL || 'http://127.0.0.1:3000',
  timeout: 30_000,
};

const client = new NexussBash(config);
const noNetwork = !BASE_URL && !API_KEY;

const skip = {
  skip: noNetwork ? 'set NEXUSS_API_KEY and/or NEXUSS_BASE_URL to run integration tests' : false,
};

let sessionId = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  if (noNetwork) return;
  const health = await client.health();
  assert.equal(health.status, 'ok');
});

test('health() returns ok', skip, async () => {
  const health = await client.health();
  assert.equal(health.status, 'ok');
  assert.equal(typeof health.version, 'string');
});

test('wrong api key throws AuthError', skip, async () => {
  const bad = new NexussBash({ ...config, apiKey: 'definitely-not-the-key' });
  await assert.rejects(() => bad.system(), AuthError);
});

test('run() executes commands sequentially', skip, async () => {
  const result = await client.run(['echo hello-from-sdk', 'echo world']);
  assert.equal(result.status, 'completed');
  assert.equal(result.results.length, 2);
  assert.match(result.results[0].stdout, /hello-from-sdk/);
  assert.equal(result.results[0].exit_code, 0);
});

test('run() failure is reported with a non-zero exit code', skip, async () => {
  const result = await client.run(['exit 3']);
  assert.equal(result.status, 'failed');
  assert.equal(result.results[0].exit_code, 3);
});

test('runYaml() accepts YAML command specs', skip, async () => {
  const result = await client.runYaml('commands:\n  - echo yaml-ok');
  assert.equal(result.results[0].exit_code, 0);
  assert.match(result.results[0].stdout, /yaml-ok/);
});

test('listRuns() returns { data, total } envelope', skip, async () => {
  const list = await client.listRuns({ limit: 5 });
  assert.ok(Array.isArray(list.data));
  assert.equal(typeof list.total, 'number');
});

test('session lifecycle: create, exec, logs, kill', skip, async () => {
  const created = await client.createSession();
  assert.ok(created.id);
  sessionId = created.id;

  const exec = await client.execInSession(sessionId, 'echo session-exec');
  assert.equal(exec.exit_code, 0);
  assert.equal(exec.timed_out, false);
  assert.equal(exec.killed, false);
  assert.match(exec.stdout, /session-exec/);

  const logs = await client.getSessionLogs(sessionId, { tail: 20 });
  assert.match(logs.log, /session-exec/);
  assert.equal(typeof logs.offset, 'number');

  const killed = await client.killSession(sessionId);
  assert.equal(killed.status, 'killed');
});

test('killSessionExec() interrupts a running command', skip, async () => {
  const created = await client.createSession();

  const execPromise = client.execInSession(created.id, 'sleep 60');
  await sleep(400);
  const killed = await client.killSessionExec(created.id);
  assert.equal(killed.status, 'killed');

  const exec = await execPromise;
  assert.equal(exec.killed, true);
  assert.equal(exec.exit_code, 130);
  assert.equal(exec.timed_out, false);

  await client.killSession(created.id);
});

test('killSessionExec() with nothing running returns conflict', skip, async () => {
  const created = await client.createSession();
  await client.execInSession(created.id, 'true');
  await assert.rejects(() => client.killSessionExec(created.id), /conflict|No command/i);
  await client.killSession(created.id);
});

test('streamSession() emits stdout and exec_end', skip, async () => {
  const created = await client.createSession();
  const stream = client.streamSession(created.id);

  const stdoutChunks = [];
  const execEnds = [];
  stream.on('stdout', (c) => stdoutChunks.push(c));
  stream.on('exec_end', (e) => execEnds.push(e));

  const exec = await client.execInSession(created.id, 'echo stream-payload');
  assert.equal(exec.exit_code, 0);

  await sleep(500); // let SSE chunks flush

  const transcript = stdoutChunks.join('');
  assert.match(transcript, /stream-payload/);
  assert.ok(execEnds.length >= 1);
  assert.equal(execEnds[0].exit_code, 0);

  stream.close();
  await client.killSession(created.id);
});

test('streamSession() async iteration', skip, async () => {
  const created = await client.createSession();
  const stream = client.streamSession(created.id);

  const collect = (async () => {
    let sawStart = false;
    for await (const ev of stream) {
      if (ev.event === 'exec_start') sawStart = true;
      if (ev.event === 'exec_end') break;
    }
    return sawStart;
  })();

  await client.execInSession(created.id, 'echo iter-ok');
  const sawStart = await collect;

  assert.equal(sawStart, true);
  await client.killSession(created.id);
});

test('execInSession() captures stderr separately', skip, async () => {
  const created = await client.createSession();
  const exec = await client.execInSession(created.id, 'echo to-stderr 1>&2; echo to-stdout');
  assert.equal(exec.exit_code, 0);
  assert.match(exec.stdout, /to-stdout/);
  assert.match(exec.stderr, /to-stderr/);
  await client.killSession(created.id);
});

test('events() receives run lifecycle events', skip, async () => {
  const stream = client.events({ timeout: 20_000 });

  const saw = { started: false, completed: false };
  const collect = (async () => {
    for await (const ev of stream) {
      if (ev.event === 'run_started') saw.started = true;
      if (ev.event === 'run_completed') {
        saw.completed = true;
        assert.ok(ev.payload.id);
        break;
      }
    }
  })();

  await sleep(300); // ensure SSE subscription is established
  await client.run(['echo events-channel-ok']);
  await collect;

  assert.equal(saw.started, true);
  assert.equal(saw.completed, true);
  stream.close();
});
