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
Consequence: browser `EventSource` cannot hit SSE directly; browser consumers MUST go through the Ethco backend proxy. CORS middleware is added only for regular REST calls (fetch can send `Authorization`; works with preflight). SSE is proxy-only.### ✅ ALL THREE GAPS DONE (2026-08-01)
- **A. Event channel**: `src/core/eventBus.js` (bounded replay 200, `Last-Event-ID` resume); emitters in `sequentialExecutor` (`run_started/step/completed`), `jobExecutor` (`job_submitted/running/completed/failed`), `pipelineExecutor` (`pipeline_submitted/started/step/completed/cancelled`); `GET /events` SSE route (Bearer auth, 401 verified). SDK `client.events()` → `EventStream` (async-iterable + EventEmitter), `events({lastEventId})` resume, types (`EventType`, `NexussEvent`, event payloads).
- **B. stderr**: `sessionManager.exec()` now runs `source <script> 2> >(tee -a <errfile> >&2)` in the session shell — stderr is captured cleanly into the result *and* stays live on the pty/SSE; preserves cwd/env state; kill/timeout paths include stderr; files cleaned up. `ExecResult.stderr` populated (test: `echo to-stderr 1>&2`).
- **C. CORS**: `src/middleware/cors.js` before auth (OPTIONS → 204 no-auth; `Allow-Origin` from `CORS_ORIGINS` default `*`; `Allow-Headers: Authorization, Content-Type`). Verified preflight + authenticated GET headers.
- **SDK → 1.1.0** (events(), EventStream, stderr). README updated (events section, stderr note, browser/CORS note).
- **Verification**: 13/13 SDK tests pass (incl. new stderr + events tests); curl confirmed `/events` replays + live job & pipeline events; CORS preflight; published tarball smoke (live `job_completed` via events()) and registry install.
- **Published `nexinals@1.1.0`** — `latest` tag; registry install verified (`events()` present).

### Remaining (future, non-blocking)
- Persistence (sessions/runs survive redeploy) — deferred by user.
- Nothing else outstanding.

## PERSISTENCE PHASE — `parad` as persistence layer (2026-08-02)
### Proposal: `PROPOSAL.md` — **v2.0 SQLite-on-WASM (`sql.js`), zero native deps**
Direction (user): keep **full SQL** for parad users (losing it = huge difficulty),
**drop `better-sqlite3` completely** (native install hang), and **stay Node 18**
(`node:sqlite` needs 22 — rejected). => `sql.js` (SQLite → WASM):
- Full SQL preserved (`execute` keeps everything); real SQLite bytes → Python
  twin byte-compat intact; no native build, Node >= 18, vitest bundles fine.
- Plaintext in WASM memory only — decrypted temp file GONE.
- Breaking: `ClientEngine.open()` becomes **async** (connect/CLI already async).
  `changes`→`getRowsModified()`; `lastInsertRowid`→`SELECT last_insert_rowid()`.
- Existing v1.x encrypted files open unchanged (same sqlite format) — no migration.
- Deps: `sql.js` only; `engines >=18` restored. → **`parad@2.0.0`**.

### What persists / what stays on disk
- DB tables: `runs`, `jobs`, `pipelines`, `sessions`, `events`, `packages`,
  (`audit` optional).
- Disk (retained): `<WORKSPACE_BASE>/sessions/<id>/`, logs, uploads, NEW
  `<WORKSPACE_BASE>/results/{run,job,pipeline}/<id>.json` (full stdout/stderr),
  `data/audit.log`.
- Output strategy: DB stores **capped** first ~100 KB; full output → result
  file on disk, DB stores `output_path`. Protects the 50 MB push cap.
- In-flight records on boot → marked `interrupted` (live pty can't be
  resurrected; the record is never lost).

### Config (env-driven, optional; local-only if unset)
`PARADOX_GATEWAY` (default onrender /v1), `PARADOX_TOKEN`, `PARADOX_PASSPHRASE`,
`PARADOX_PROJECT` (nexuss), `PARADOX_DB` (nexuss-bash), `PARADOX_AUTO_SYNC` (true).

### Implementation (in order)
1. **`parad` v2.0 sql.js** (Paradox-DB repo): replace `better-sqlite3` with
   `sql.js` in `client/src/engine.ts` — async `open()` (initSqlJs once), DB in
   WASM memory (no temp file), `changes` via `getRowsModified()`, `lastInsertRowid`
   via `SELECT last_insert_rowid()`, BEGIN/COMMIT/ROLLBACK via `db.run()`,
   SELECT via prepare/step/getAsObject. Update all `open()` callers
   (connection.ts, cli.ts, tests) to await. Update docs + `engines >=18`.
   Vitest bundles sql.js normally. Publish **`parad@2.0.0`**.
2. Nexuss-Bash: `npm install parad@2.0.0` + add `PARADOX_*` keys to
   `src/config.js`.
3. `src/persistence.js` — singleton: `init()`, `connect()` (+pullOnStartup),
   `hydrate()` maps, `markInterrupted()`, store helpers
   (`saveRun/saveJob/savePipeline/saveSession/saveEvent`). Uses `parad@2.0.0`
   `insert`/`upsert`/`insertMany`.
4. Write-through hooks in `jobExecutor`, `pipelineExecutor`,
   `sequentialExecutor`, `sessionManager`, `eventBus`, `packageManager`
   (fire-and-forget, errors swallowed, never in request path).
5. Boot hook in `server.js`: hydrate → mark interrupted → sync daemon auto.
6. Tests `tests/persistence.test.js`: submit → simulate restart (fresh engine)
   → hydrate → verify record + output; capped vs full output; offline→reconnect
   push; verify a push yields a version with Telegram `message_id`.
7. Update README; mark this phase DONE in `work.md`.

### BLOCKED → UNBLOCKED DIRECTION (2026-08-02)
Old `node:sqlite` port is ABANDONED (Node 22 requirement + vitest 2/vite 5 can't
externalize it). The uncommitted `engine.ts`/`package.json`/docs changes in
`Paradox-DB/client` get superseded: revert the `node:sqlite` edits, then apply
the `sql.js` rewrite. No blocker: vitest bundles `sql.js` like any package.

## PERSISTENCE PHASE — DONE (2026-08-02)
- **`parad@2.0.0` published** (sql.js engine, async `open()`, zero native deps,
  Node >= 18, v1.x encrypted files open unchanged). Commit `114d568`.
- **Nexuss-Bash persistence shipped**:
  - `src/persistence.js`: `init/connect` (local-only guard when no gateway),
    schema (`runs/jobs/pipelines/sessions/events/packages`), capped-payload
    persist + `output_path`, `hydrate`, `markInterrupted`, `flush`.
  - Write-through hooks in jobExecutor, pipelineExecutor, sequentialExecutor,
    sessionManager (incl. `phantom pty` guard), eventBus, packageManager.
  - Async boot/shutdown in `server.js` (init → hydrate → restore; flush on exit).
  - **Crash-safe local mode**: encrypted DB written to disk every
    `PARADOX_FLUSH_INTERVAL_SEC` (default 30) in local-only mode, verified via
    SIGKILL + restart (job survived, `completed`, stdout intact).
- **Tests `tests/persistence.test.js`: 6/6 PASS** (job restart, interrupted runs,
  capped vs full output, event replay + seq continuity, session ghosts,
  package mirror/restore).
- README updated (Persistence section + `PARADOX_*` env table); committed+pushen.

## Environment notes
- `/workspace` is NOT writable and sudo password was rejected → made `WORKSPACE_BASE` configurable via env (default `/workspace`).
- Local server must be started detached (tool kills background jobs at command end). Use `/tmp/start-nexuss.sh` via `setsid nohup ... &`.
- Kill server by port: `kill $(lsof -t -i tcp:3000)` (never `pkill -f "node server.js"` — it self-matches the tool shell).
