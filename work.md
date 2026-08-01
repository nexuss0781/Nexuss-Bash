# Work Log — nexinals v1.0.1 (SDK + server protocol fixes)

## Status
- **Phase 1 — Server protocol (Nexuss-Bash `src/`): DONE**
  - `sessionManager.js`: per-exec buffers, honest timeout (`exit_code: 124`, `timed_out: true`), output truncation (`truncated`), SSE subscriber list, `killExec`, cursor logs (`offset`), configurable `WORKSPACE_BASE`.
  - `routes/sessions.js`: `POST /:id/kill`, `GET /:id/stream` (SSE), `logs?since=`, busy→409.
  - `routes/run.js`: real pagination + `{data,total}`.
- **Phase 2 — SDK rewrite (`ts-client/`): DONE**
  - `src/errors.ts` (+`TimeoutError`, 429/503→`ThrottledError`), `src/types.ts`, `src/client.ts` (Bearer auth, AbortSignal, list envelopes, `killSessionExec`, `streamSession`, cursor logs), `src/stream.ts`, `src/index.ts`.
  - Dual CJS+ESM build (tsc ×2 + postbuild), README rewritten, LICENSE, tests.
- **Phase 3 — Verification: IN PROGRESS**
  - Local server boots via `/tmp/start-nexuss.sh` (API_KEY=test-key-123, WORKSPACE_BASE=/tmp/nexuss-workspace, PORT=3000).
  - SDK test suite: 9/11 passed (both SSE tests green). 2 failures traced to bash bulk-echo of typed input → fixed `sessionManager.exec()` with `stty -echo` wrapper (markers now appear once, as real output).

## Root causes found & fixed (Phase 3)
- Exec capture broke because interactive bash ECHOES typed input: the wrapper's markers appeared in the echoed input **instantly** (before the command ran), so exec resolved early with empty/junk stdout and the kill test saw "no command running". Fixed in `sessionManager.js`:
  1. Exit marker is only matched when followed by digits (`__NEXUSS_EXIT_<ts>__0`); the echoed input shows `__NEXUSS_EXIT_<ts>__$?` (never digits) → premature resolve impossible.
  2. `stty -echo` is written, then a 100ms pause before the wrapper so the wrapper line isn't echoed into the capture.
- `getSessionLogs` returned `''` because `LOGS_DIR` (`<WORKSPACE_BASE>/logs`) was never created → the session log stream threw ENOENT on first write. Fixed with `fs.mkdirSync(SESSIONS_DIR/LOGS_DIR, {recursive:true})` at module load.
- **SDK test suite: 11/11 PASS** (includes both SSE tests, kill, timeout-correctness).

## Next steps
1. ✅ Re-run server `node --check` on all touched files — all 10 pass.
2. ✅ `npm pack` + tarball smoke test — 45 files (`dist/` CJS+ESM+types+maps, LICENSE, README, no `src/`); `require` + `import` + live `health()` against local server all work. `nexuss0781` is already `npm login`'d.
3. ✅ Research.md updated with §11 v1.0.1 status (each roadmap item marked done/pending + remaining gaps).
4. ✅ **Published `nexinals@1.0.1` to npm** — `latest` tag; registry shasum `fc575be…` matches local build; `npm install nexinals@1.0.1` + `require` verified from the registry.

## NEXT PHASE — close remaining gaps (except persistence)
### Security decision (user): SSE stays **Bearer-auth only** — NO `?api_key=`/token-in-URL.
Consequence: browser `EventSource` cannot hit SSE directly; browser consumers MUST go through the Ethco backend proxy. CORS middleware is added only for regular REST calls (fetch can send `Authorization`; works with preflight). SSE is proxy-only.

### ✅ ALL THREE GAPS DONE (2026-08-01)
- **A. Event channel**: `src/core/eventBus.js` (bounded replay 200, `Last-Event-ID` resume); emitters in `sequentialExecutor` (`run_started/step/completed`), `jobExecutor` (`job_submitted/running/completed/failed`), `pipelineExecutor` (`pipeline_submitted/started/step/completed/cancelled`); `GET /events` SSE route (Bearer auth, 401 verified). SDK `client.events()` → `EventStream` (async-iterable + EventEmitter), `events({lastEventId})` resume, types (`EventType`, `NexussEvent`, event payloads).
- **B. stderr**: `sessionManager.exec()` now runs `source <script> 2> >(tee -a <errfile> >&2)` in the session shell — stderr is captured cleanly into the result *and* stays live on the pty/SSE; preserves cwd/env state; kill/timeout paths include stderr; files cleaned up. `ExecResult.stderr` populated (test: `echo to-stderr 1>&2`).
- **C. CORS**: `src/middleware/cors.js` before auth (OPTIONS → 204 no-auth; `Allow-Origin` from `CORS_ORIGINS` default `*`; `Allow-Headers: Authorization, Content-Type`). Verified preflight + authenticated GET headers.
- **SDK → 1.1.0** (events(), EventStream, stderr). README updated (events section, stderr note, browser/CORS note).
- **Verification**: 13/13 SDK tests pass (incl. new stderr + events tests); curl confirmed `/events` replays + live job & pipeline events; CORS preflight; published tarball smoke (live `job_completed` via events()) and registry install.
- **Published `nexinals@1.1.0`** — `latest` tag; registry install verified (`events()` present).

### Remaining (future, non-blocking)
- Persistence (sessions/runs survive redeploy) — deferred by user.
- Nothing else outstanding.

## Environment notes
- `/workspace` is NOT writable and sudo password was rejected → made `WORKSPACE_BASE` configurable via env (default `/workspace`).
- Local server must be started detached (tool kills background jobs at command end). Use `/tmp/start-nexuss.sh` via `setsid nohup ... &`.
- Kill server by port: `kill $(lsof -t -i tcp:3000)` (never `pkill -f "node server.js"` — it self-matches the tool shell).
