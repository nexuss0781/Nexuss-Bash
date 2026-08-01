# nexinals

TypeScript/JavaScript client for the [Nexuss Bash](https://github.com/nexuss0781/Nexuss-Bash) remote execution API. Run shell commands, manage interactive sessions, stream output live, and interrupt running commands — from Node.js or the browser.

## Install

```bash
npm install nexinals
```

Requires Node.js >= 18 (or a modern browser). Ships both ESM and CommonJS builds.

## Quick start

```ts
import { NexussBash } from 'nexinals';

const nx = new NexussBash({
  apiKey: process.env.NEXUSS_API_KEY!,
  // baseUrl: 'https://nexuss-bash.onrender.com', // default
});

const health = await nx.health();
console.log(health.status); // "ok"

const result = await nx.run(['echo hello', 'ls -la']);
console.log(result.results[0].stdout);
```

## Authentication

The client sends `Authorization: Bearer <API_KEY>`. Set the `API_KEY` environment variable on the Nexuss Bash server and pass the same key to the client. Only `health()` is unauthenticated.

## Configuration

| Option        | Type      | Default                          | Description                                    |
| ------------- | --------- | -------------------------------- | ---------------------------------------------- |
| `apiKey`      | `string`  | — (required)                     | Server API key                                 |
| `baseUrl`     | `string`  | `https://nexuss-bash.onrender.com` | Server root URL                             |
| `timeout`     | `number`  | `60000`                          | Default per-request timeout (ms)               |
| `maxRetries`  | `number`  | `2`                              | Retries on `429`/`503` rate-limit responses    |

## Sessions — the interactive terminal

Sessions run a persistent bash PTY in the sandbox. This is the building block for a live, interruptible terminal.

```ts
const session = await nx.createSession();
console.log(session.id);

// 1. Run a command (blocking, buffered result)
const exec = await nx.execInSession(session.id, 'npm test');
console.log(exec.stdout, exec.exit_code, exec.timed_out);
```

### Stream output live (SSE)

```ts
const stream = nx.streamSession(session.id);

stream.on('stdout', (chunk) => {
  process.stdout.write(chunk); // raw PTY transcript
});
stream.on('exec_start', ({ command }) => console.log('$', command));
stream.on('exec_end', ({ exit_code, timed_out }) => console.log('exit', exit_code));

await nx.execInSession(session.id, 'make build'); // run while streaming
```

Or consume events with `for await`:

```ts
for await (const ev of nx.streamSession(session.id)) {
  if (ev.event === 'stdout') process.stdout.write(ev.payload);
}
```

### Listen to run / job / pipeline events (SSE)

The server-wide `/events` channel broadcasts lifecycle events for runs, jobs, and pipelines (`run_started`, `run_step`, `run_completed`, `job_submitted`, `job_running`, `job_completed`, `job_failed`, `pipeline_submitted`, `pipeline_started`, `pipeline_step`, `pipeline_completed`, `pipeline_cancelled`). This is how a long-lived agent loop learns a job finished without polling.

```ts
const events = nx.events();

events.on('job_completed', (ev) => {
  console.log(`job ${ev.resource_id} → ${ev.payload.status}`);
});

// or async iteration
for await (const ev of nx.events()) {
  if (ev.event === 'run_completed') console.log(ev.payload.status);
}

// resume from a previous event sequence number
const resumed = nx.events({ lastEventId: 42 });
```

### Interrupt a running command

`killSessionExec` sends SIGINT (Ctrl-C) to the foreground process in the session and resolves the in-flight exec with `exit_code: 130` and `killed: true`.

```ts
const execPromise = nx.execInSession(session.id, 'sleep 100');
await nx.killSessionExec(session.id);
const exec = await execPromise;
console.log(exec.killed, exec.exit_code); // true 130
```

### Resuming / catching up

Sessions write a persistent transcript log. `getSessionLogs` returns a byte-offset cursor so you can reattach and pull only what you missed:

```ts
const { log, offset } = await nx.getSessionLogs(session.id);
const next = await nx.getSessionLogs(session.id, { since: offset }); // just the new bytes
```

### Timeouts and termination

- The server aborts a command at its exec timeout and reports `timed_out: true` with `exit_code: 124` (never a false success).
- Output beyond the server cap is reported with `truncated: true`.
- `killSession(id)` tears down the whole PTY.
- Pass an `AbortSignal` to cancel the *client request* (the server keeps running; use `killSessionExec` to stop it server-side).

### Session stream events

| Event         | Payload                                                        |
| ------------- | -------------------------------------------------------------- |
| `session`     | Initial `Session` state                                        |
| `stdout`      | Raw PTY chunk (merged stdout/stderr transcript)                |
| `exec_start`  | `{ command }`                                                  |
| `exec_end`    | `{ command, exit_code, timed_out, killed, duration_ms }`       |
| `close`       | `{ status: 'killed' }` — session was closed                    |
| `error`       | `{ message }`                                                  |

## Command runner (one-shot)

Run a list of commands in a fresh sandbox and get all results back in one response.

```ts
const result = await nx.run(['echo one', 'pwd'], { timeout: 120_000 });
```

- `run(commands: string[], opts?)` — sequential execution with step results.
- `runYaml(yaml: string, opts?)` — same, but the command spec is YAML.
- `listRuns({ limit, offset })` — paginated history (`{ data, total }`).
- `getRun(id)` — a single run's details.

> Run timeout is a *server-side* limit applied to the whole chain. The client request timeout is automatically set to cover it.

## API reference

### Health & system

| Method                    | Returns             |
| ------------------------- | ------------------- |
| `health()`                | `HealthResponse`    |
| `system()`                | `SystemResponse`    |
| `resources()`             | `ResourceResponse`  |

### Command runner

| Method                                     | Returns                       |
| ------------------------------------------ | ----------------------------- |
| `run(commands, opts?)`                     | `RunResult`                   |
| `runYaml(yaml, opts?)`                     | `RunResult`                   |
| `listRuns({ limit, offset }?)`             | `ListResponse<RunListItem>`   |
| `getRun(id)`                               | `RunResult`                   |

### Sessions

| Method                                        | Returns                        |
| --------------------------------------------- | ------------------------------ |
| `createSession()`                             | `SessionCreate`                |
| `listSessions({ limit, offset }?)`            | `ListResponse<Session>`        |
| `getSession(id)`                              | `Session`                      |
| `getSessionLogs(id, { tail, since }?)`        | `SessionLogs` (includes `offset` cursor) |
| `execInSession(id, command, opts?)`           | `ExecResult` (with `timed_out`, `killed`, `truncated`, `duration_ms`, and `stderr` captured separately) |
| `killSessionExec(id)`                         | `{ status: 'killed' }`         |
| `killSession(id)`                             | `{ status: 'killed' }`         |
| `streamSession(id, opts?)`                    | `SessionStream` (EventEmitter + async-iterable) |
| `events(opts?)`                               | `EventStream` of run/job/pipeline lifecycle events (async-iterable; `lastEventId` resume) |

### Jobs (async language runners)

| Method                                   | Returns                |
| ---------------------------------------- | ---------------------- |
| `submitJob({ language, code, ... })`     | `JobRef`               |
| `listJobs({ limit, offset, status }?)`   | `ListResponse<JobRef>` |
| `getJob(id)`                             | `JobDetail`            |

### Files

| Method                                            | Returns                 |
| ------------------------------------------------- | ----------------------- |
| `uploadFile(file, name, path?)`                   | `FileRecord`            |
| `listFiles({ limit, offset }?)`                   | `ListResponse<FileRecord>` |
| `getFile(id)`                                     | `FileRecord`            |
| `downloadFile(id)`                                | `Response` (stream / `arrayBuffer` / `text`) |
| `deleteFile(id)`                                  | `{ id, name }`          |

### Pipelines

| Method                                           | Returns                        |
| ------------------------------------------------ | ------------------------------ |
| `runPipeline(yaml, opts?)`                       | `PipelineDetail` (synchronous) |
| `submitPipeline(yaml)`                           | `PipelineRef` (async, poll with `getPipeline`) |
| `listPipelines({ limit, offset, status }?)`      | `ListResponse<PipelineRef>`    |
| `getPipeline(id)`                                | `PipelineDetail`               |
| `cancelPipeline(id)`                             | `{ id, status }`               |

### Packages

| Method                                    | Returns                          |
| ----------------------------------------- | -------------------------------- |
| `installPackage(name, manager)`           | `PackageInstallResult`           |
| `listPackages({ limit, offset }?)`        | `ListResponse<PackageRecord>`    |
| `removePackage(name)`                     | `{ name, manager }`              |

## Errors

Every error extends `NexussBashError` with `code`, `status`, and `details`:

| Class                  | Status | When                                  |
| ---------------------- | ------ | ------------------------------------- |
| `BadRequestError`      | 400    | Malformed request                     |
| `AuthError`            | 401    | Missing/invalid `API_KEY`             |
| `ForbiddenError`       | 403    | Operation not permitted               |
| `NotFoundError`        | 404    | Resource missing                      |
| `ConflictError`        | 409    | Session busy, already closed, etc.    |
| `PayloadTooLargeError` | 413    | Upload exceeds server limit           |
| `ThrottledError`       | 429/503| Rate-limited; has `retryAfterSec`     |
| `InternalError`        | 500    | Server failure                        |
| `ConnectionError`      | —      | Network failure                       |
| `TimeoutError`         | —      | Request exceeded its timeout          |

Rate-limit responses (`429`, `503`) are retried automatically up to `maxRetries`, honoring the server's `retry_after_sec`.

```ts
import { ThrottledError } from 'nexinals';

try {
  await nx.run(['heavy-cmd']);
} catch (err) {
  if (err instanceof ThrottledError) {
    console.log(`throttled, retry in ${err.retryAfterSec}s`);
  }
}
```

## Browser usage

The client is dependency-free and works in the browser. REST calls (`fetch`) send the `Authorization` header and the server emits CORS headers (`CORS_ORIGINS`, default `*`), so browser apps can call them directly. Streaming (`streamSession`, `events`) also uses `fetch` + `ReadableStream` (not `EventSource`), so it can carry the `Authorization` header too — but keep in mind the API key is visible to the browser, so for a real app you should proxy requests through your own backend.

## Development

```bash
npm run build       # dual CJS + ESM build
npm run typecheck   # type check only
npm test            # integration tests (require NEXUSS_API_KEY + NEXUSS_BASE_URL)
```

## Links

- [Server API reference](../Documentations/markdowns/api-reference.md)
- [Ethco IDE integration map](../Research.md)
