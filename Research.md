# Research: nexinals TypeScript Library Maturity for an IDE Execution Terminal

**Date:** 2026-07-31
**Scope:** Audit the published npm TypeScript client (`nexinals@1.0.0`) for Nexuss Bash and assess its maturity as the execution engine behind the **Ethco IDE** AI terminal (live, interruptible command execution for an autonomous coding agent).

**Primary project:** Nexuss-Bash (server + SDK)
**Consumer (context only):** Ethco IDE — an agent-first IDE whose AI must execute shell commands in a sandbox, stream output live, and be interruptible from web or Telegram.

---

## 1. Executive Summary

`nexinals@1.0.0` (published 2026-07-25 to npm; also mirrored as `@nexuss0781/nexinal`) is a typed HTTP wrapper around the Nexuss Bash REST API. As a plain API client it has solid bones: full typed `.d.ts` surface, a sensible error-class hierarchy, and session CRUD. **As an IDE terminal SDK for Ethco it fails every load-bearing requirement.**

### Maturity verdict: **D− (≈ 9 / 30)**

| Category | Score |
|---|---|
| Streaming output | 0 / 3 |
| Interruptibility | 1 / 3 |
| Session lifecycle | 2 / 3 |
| Concurrency / multiplexing | 1 / 3 |
| Event / subscribe model | 0 / 3 |
| Output format fidelity | 1 / 3 |
| Error taxonomy | 1 / 3 |
| Ergonomics / DX | 1 / 3 |
| Transport robustness | 1 / 3 |
| Build / publish quality | 1 / 3 |

### The three blockers, in order

1. **The package cannot authenticate against its own server.** It sends `x-api-key: <key>`; the server only accepts `Authorization: Bearer <API_KEY>`. Every call except `health()` returns 401. (One-line fix, but it means the published package is currently dead on arrival.)
2. **There is no live, abortable command channel — in the SDK *or* the server protocol.** No SSE/WebSocket, no output streams, no per-command kill. This is the difference between "an SDK that runs commands" and "an SDK for an interactive AI terminal," and it is the strategic blocker because it requires server-side protocol work.
3. **The published README documents a different API than the shipped code** — wrong package name (`nexinal` vs `nexinals`), wrong config key (`host` vs `baseUrl`), ~24 nonexistent method names, wrong signatures, and a phantom ESM build (`dist/index.mjs` referenced but not shipped).

---

## 2. What the published package is

Tarball (`nexinals-1.0.0.tgz`, 8.6 KB) contains:

```
package/dist/index.d.ts .js .js.map
package/dist/client.d.ts .js .js.map      ← class NexussBash (~30 methods)
package/dist/errors.d.ts .js .js.map      ← NexussBashError + 9 subclasses
package/dist/types.d.ts .js .js.map       ← 28 request/response interfaces
package/README.md
package/package.json
```

- Entry: `class NexussBash { constructor({ apiKey, baseUrl?, timeout? }) }`
- Transport: native `fetch` + `AbortController` (Node 18+, all browsers)
- Response unwrap: `return json.data ?? json` (`client.js:72`)
- Error mapping: HTTP status → typed error class (`errors.js`)

---

## 3. Critical Bugs (ship-blocking)

| # | Bug | Evidence | Impact |
|---|-----|----------|--------|
| 1 | **Wrong auth header** | Client sends `{ 'x-api-key': apiKey }` (`dist/client.js:17-19`). Server reads only `req.headers.authorization`, requires `Bearer ` prefix, constant-time compare (`src/middleware/auth.js:10-36`). No `x-api-key` handling anywhere in `src/`. | Every authenticated method 401s. Only `health()` works (auth-exempt at `auth.js:6`). |
| 2 | **ESM entry missing** | `package.json` declares `"module": "dist/index.mjs"` and `exports["."].import → dist/index.mjs`, but no `.mjs` file is in the tarball (build script is plain `tsc`, which never emits `.mjs`). | ESM/bundler consumers (e.g. a Vite frontend, or `import { NexussBash } from 'nexinals'` in Node) get module-not-found. Only `require()` works. |
| 3 | **429 unmapped → wrong error** | Rate limiter returns `429 { error: { code:'rate_limited', details:{ retry_after_sec } } }` (`src/middleware/rateLimiter.js:76-82`). Client switch has no 429 case → falls to `default: ConnectionError` (`client.js:65-66`). | A rate limit surfaces as "Cannot connect to …". `ThrottledError.retryAfterSec` never populated (client reads top-level `errBody?.retry_after_sec`, server nests it under `error.details`). |

---

## 4. Contract audit (method → server route)

Assessed as if auth succeeded. ✅ = matches; ⚠️ = mismatch.

| Client method | Server route | Body/Query | Verdict |
|---|---|---|---|
| `health()` | GET /health | – | ✅ auth-exempt, works |
| `system()` | GET /system | – | ✅ |
| `resources()` | GET /resources | – | ✅ |
| `run(commands[], {timeout})` | POST /run `{commands, timeout}` | matches | ✅ |
| `runYaml(yaml, {timeout})` | POST /run `{yaml, timeout}` | matches | ✅ |
| `listRuns({limit,offset})` | GET /run | **query ignored** (`run.js:62-65`) | ⚠️ pagination no-ops; unwrap drops `total` |
| `getRun(id)` | GET /run/:id | – | ✅ |
| `createSession()` | POST /sessions | – | ⚠️ type over-declares (server returns only `{id,status,created_at}`) |
| `listSessions` | GET /sessions | limit/offset supported | ⚠️ unwrap drops `total` |
| `getSession` / `getSessionLogs` | GET /sessions/:id, /logs?tail= | – | ✅ |
| `execInSession(id, cmd)` | POST /sessions/:id/exec | matches | ✅ contract; ⚠️ timeout reports `exit_code: 0` (see §6) |
| `killSession(id)` | DELETE /sessions/:id | – | ⚠️ typed `void`, server returns `{status:'killed'}` |
| `submitJob` / `getJob` | POST /jobs, GET /jobs/:id | matches | ✅ |
| `listJobs` | GET /jobs | limit/offset/status supported | ⚠️ unwrap drops `total` |
| `uploadFile` | POST /files/upload | multer field `'file'` + `path` — **matches** | ✅ |
| `listFiles` / `getFile` | GET /files, GET /files/:id | – | ✅ / ⚠️ unwrap drops `total` |
| `downloadFile` | GET /files/:id/download | raw stream | ⚠️ non-OK → `ConnectionError` (should be `NotFoundError`) |
| `deleteFile` | DELETE /files/:id | – | ⚠️ typed `void`, returns `{id,name}` |
| `runPipeline(yaml, {timeout})` | POST /pipelines/run `{yaml,timeout}` | matches | ✅ |
| `submitPipeline(yaml)` | POST /pipelines `{yaml}` | matches | ✅ |
| `listPipelines` | GET /pipelines | limit/offset/status supported | ⚠️ unwrap drops `total` |
| `getPipeline` / `cancelPipeline` | GET/DELETE /pipelines/:id | – | ✅ / ⚠️ typed `void` |
| `installPackage` | POST /packages/install | matches | ⚠️ type over-declares (`protected`/`last_used` absent on install response) |
| `listPackages` | GET /packages | limit/offset supported | ⚠️ unwrap drops `total` |
| `removePackage` | DELETE /packages/:name | – | ⚠️ typed `void` |

**Systemic issue:** the `json.data ?? json` unwrap turns every `{data:[...], total: N}` list envelope into a bare array, silently discarding `total`. All six `*ListResponse { data, total }` types are therefore **declared differently from what the methods actually return**.

---

## 5. README vs reality (documentation gap)

The published README documents a *different product* than the shipped class:

- Package name: README says `nexinal` (that's the PyPI CLI); npm package is **nexinals**.
- Config: README uses `host:`; code uses `baseUrl` (silently ignored → traffic to the render.com default).
- ~24 method names don't exist: `systemInfo`, `runList`, `sessionCreate/List/Logs/Exec/Delete`, `jobRun/Detail/List/Cancel/Log`, `fileUpload/Info/Delete/Download`, `pipelineRun/Detail/List`, `packageInstall/Uninstall` (actual: `system`, `listRuns`, `createSession`, `getSessionLogs`, `execInSession`, `killSession`, `submitJob`, `getJob`, `listJobs`, `uploadFile`, `getFile`, `deleteFile`, `downloadFile`, `runPipeline`, `getPipeline`, `listPipelines`, `installPackage`, `removePackage`).
- `jobCancel` and `jobLog` are documented but exist neither in the SDK **nor** on the server (`jobs.js` has no DELETE/log route).
- Wrong signatures in examples: `nx.run('echo …')` (string) vs `run(commands: string[])`; `fileUpload('./data.csv', …)` — a path string is never read, it becomes a garbage Blob; `packageInstall('lodash')` vs `installPackage(name, manager)` with manager required.
- Wrong return type: README claims `fileDownload → Uint8Array`; code returns `Promise<Response>`.

---

## 6. Output & execution fidelity problems

- **Session exec merges and corrupts output.** PTY stdout is echoed into one buffer and stripped with a `lines.slice(3)` heuristic (`sessionManager.js:156-159`) — multiline commands, prompts, or leading output lines get mangled. `stderr` is always `''`.
- **Session exec timeout reports success.** On timeout it resolves `{ stdout, stderr:'', exit_code: 0 }` (`sessionManager.js:136-143`); `ExecResult` has no `timed_out` field, so a hung command is indistinguishable from success.
- **`MAX_OUTPUT_BYTES` is never enforced on the session exec path** (`sessionManager.js:13` defines it; nothing truncates); no truncation signal in any type.
- **Concurrent exec on one session is broken.** The second `exec` clears the shared `logBuffer` (`sessionManager.js:120`) while the first is still polling for its exit marker, so the first falsely resolves at timeout. The SDK neither serializes nor guards this.
- **Timeout mismatch:** SDK default request timeout is 60 s (`client.js:15`); the server allows `/run` up to 3,600,000 ms (`run.js:51`). `options.timeout` is forwarded in the body but never adjusts the client abort — long agent builds are aborted client-side while the server keeps running.

---

## 7. Build & publish hygiene

- ✅ `.d.ts` + `.js.map` ship; `files: ["dist"]` is tight; `index.d.ts` re-exports everything; CJS `require()` works.
- ❌ **No `dist/index.mjs`** despite `module`/`exports.import` claims — ESM is broken.
- ❌ Sourcemaps reference `../src/*.ts` but `src/` isn't shipped — dead debugging symbols.
- ❌ No `LICENSE` file in the tarball (package declares MIT).
- ❌ No tests, no CI, no prepack, no CHANGELOG. `types.js` is an empty stub.
- ⚠️ Public `.d.ts` exposes `File | Buffer | Blob` (`uploadFile`) — `Buffer` leaks Node types into browser builds; `File` isn't a global until Node 20.

---

## 8. What an IDE terminal SDK needs vs what exists

For Ethco's AI Execution terminal (`Design.md §5.3, §8`) the SDK must eventually provide:

| Requirement | Current state |
|---|---|
| **Streaming output** (live chunks of stdout/stderr) | ❌ Buffered one-shot only. No SSE/WS anywhere in the server (`src/` uses only `fs` streams). |
| **Interruptibility** (abort an in-flight exec/run; report *terminated*) | ❌ `killSession` kills the whole PTY; a pending exec then falsely resolves `exit_code: 0`. `/run` is synchronous with no cancel. `AbortController` only cancels the client fetch, not the server process. |
| **Event/subscribe model** (stdout/stderr/exit/timeout events for web + Telegram) | ❌ None in SDK or server. |
| **Session reconnect/resume** (cursor logs, reattach, idle-expiry awareness) | ⚠️ Full CRUD exists; no cursor (`tail=N` re-downloads everything), no reconnect, no `last_active_at` monitoring. |
| **Concurrent AI + user terminal** | ❌ No multiplexing; concurrent `exec` corrupts the buffer. |
| **Typed error taxonomy** | ⚠️ Good class skeleton, wrong 429 mapping, no timeout class, 404 message dropped, no `cause`. |

**The single biggest gap for Ethco AI execution:** there is no live, abortable command-execution channel — neither streaming nor per-command interruption exists at the protocol level. The auth bug is the most immediately fatal defect, but it is a one-line fix; the streaming/abort gap is the strategic blocker.

---

## 9. Integration notes for Ethco IDE

Findings from auditing the consumer (`ethco-ide`):

- The terminal is a **static mock** today (`frontend/src/main.ts:268-292`) — hard-coded fake output, two tabs (Agent/User), an **Interrupt button rendered but never wired** (`main.ts:273`). No code feeds terminal output; no agent loop exists (chat only POSTs user/assistant messages, `state.ts:252-261`).
- **Browser-direct is a dead end:** nexuss-bash has **no CORS middleware** (`server.js:29-96`), and `EventSource` can't set auth headers. The ethco backend must **proxy** (env vars `NEXUSS_API_KEY`/`NEXUSS_BASE_URL`), reusing its existing SSE patterns (`fileWatcher.ts:22-64`, `routes/projects.ts:101-123`).
- **Sandbox vs local-FS mismatch (design-level):** ethco projects live in `backend/Projects/<name>` (disk-first, `projects-fs.ts`); Nexuss Bash executes in a remote `/workspace`. "Edit file → run → see output" needs an explicit sync/upload bridge (e.g. `nexinals.uploadFile` before runs, pull results back) before the agent loop is coherent.
- State slices to add in ethco `state.ts`: `sessions`, `runs`, `streamBuffers`, `activeRunId`, `interruptFlag`, `agentBusy`. Terminal buffers must live in module/state scope because mode switches rebuild the whole DOM (`main.ts:979-1022`).
- Runs/sessions would be volatile in-memory unless given SQLite tables — but Ethco `Design.md` requires stable `run_id`s for Telegram resumption.

---

## 10. Recommended roadmap to production maturity

1. **Fix auth** — send `Authorization: Bearer` (`client.js:17-19`); document the scheme. *Unblocks everything.*
2. **Server: SSE/WebSocket per session and per exec**; SDK exposes async-iterable/EventEmitter streams (`execInSessionStream`, `session.events`) with typed events: `stdout | stderr | exit | timeout | error`. (Mirror Ethco's existing clone-progress SSE.)
3. **Server: per-command kill** (`POST /sessions/:id/kill` or kill-on-connection-close) and stop reporting `exit_code: 0` on timeout — return a real `timed_out`/`terminated` signal (`sessionManager.js:136-143`). SDK: accept `AbortSignal` on `execInSession`/`run`.
4. **Session reconnect/resume** — cursor-based logs (`since`/`after`), reattach, auto-recreate on idle expiry, surface `last_active_at`.
5. **Transport fixes** — per-request timeout override (decouple client abort from server `timeout` body param), new `TimeoutError`, map 429 → `ThrottledError`, retry with backoff honoring `retry_after_sec`, preserve `error.code` and `cause`.
6. **Fix session-exec concurrency** — per-exec buffers (`sessionManager.js:120`) plus client-side serialization.
7. **Rewrite the README against the actual class** — one consistent method-name set, `baseUrl`, `npm install nexinals`, correct examples; drop or implement `jobCancel`/`jobLog`.
8. **Ship the ESM build** (`dist/index.mjs`) or remove the claim; add LICENSE, tests, CI.
9. **Type corrections** — `Session` for the create-path, `timed_out`/`truncated` on `ExecResult`, list-method return types (`total` preserved).
10. **Server event model for run/job completion** so Ethco's todo-cart and Telegram push can be driven from one channel.

---

## 11. Status update (2026-08-01) — nexinals v1.0.1 + server protocol

A full fix pass was completed: the SDK was rewritten from scratch in `ts-client/` (v1.0.1) and the server protocol was extended. Verification: SDK integration suite **11/11 pass** against a local server (`npm test`, includes both SSE streaming tests, per-command kill, honest timeout, cursor logs); tarball smoke-tested (CJS `require` + ESM `import` + live `health()`).

| Roadmap item | Status |
|---|---|
| 1. Fix auth (`Authorization: Bearer`) | ✅ SDK now sends `Authorization: Bearer`; constant-time server compare. |
| 2. SSE streaming | ✅ `GET /sessions/:id/stream` (SSE: `stdout`, `exec_start`, `exec_end`, `close`, 15s ping); SDK `streamSession()` → EventEmitter + async-iterable `SessionStream`. |
| 3. Per-command kill + honest timeout | ✅ `POST /sessions/:id/kill` → `{exit_code:130, killed:true}`; timeout → `{exit_code:124, timed_out:true}` (Ctrl-C + 500ms grace). SDK accepts `AbortSignal`. |
| 4. Cursor logs | ✅ `/logs?since=<bytes>` returns `{log, offset}`; byte-offset resume. Idle-expiry still in-memory only. |
| 5. Transport fixes | ✅ Per-request `timeout`, new `TimeoutError`, 429/503 → `ThrottledError` with `retryAfterSec`, retry/backoff, `error.code` + `cause` preserved. |
| 6. Exec concurrency | ✅ Server-side per-exec capture buffers + busy → 409 (no shared-buffer corruption). |
| 7. README vs reality | ✅ README rewritten against the actual class (`baseUrl`, real methods, sessions/streaming/kill examples). |
| 8. ESM build + LICENSE | ✅ Dual CJS+ESM emitted (`dist/` + `dist/esm/` via two `tsc` passes + postbuild `package.json`); `LICENSE` ships. |
| 9. Type corrections | ✅ `SessionCreate`, `timed_out`/`killed`/`truncated`/`duration_ms` on `ExecResult`, list methods return `{data,total}`. |
| 10. Unified run/job completion event channel | ⏳ Not implemented — still pending (Ethco cart + Telegram push). |

**Output fidelity fixes** (Research.md §6): exec capture no longer uses the `lines.slice(3)` heuristic. It now wraps the command in `__NEXUSS_BEGIN/EXIT__` markers with `stty -echo`; the exit marker is only matched when followed by digits (echoed input shows `__NEXUSS_EXIT_<ts>__$?`), preventing premature resolve; `MAX_OUTPUT_BYTES` truncation is enforced and reported via `truncated`. During verification two additional bugs were found and fixed: the exit marker regex would still resolve on echoed input (killed the interrupt test), and session logs returned `''` because `<WORKSPACE_BASE>/logs/` was never created (ENOENT on every session's first write).

**Remaining gaps to production maturity:** session reconnect after server restart (runs/sessions are volatile in-memory); unified completion event channel (item 10); client-side exec serialization; `stderr` capture is still empty (PTY merges streams).
