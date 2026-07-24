# Nexuss Bash - Task List

**Source:** Architecture.md, Phase.md, Test.md
**Format:** Checkbox tasks with IDs, dependencies, and test gates

---

## Phase 0: Scaffolding

- [x] **T0.1** Create `package.json` with name "nexuss-bash", express dependency
- [x] **T0.2** Create `Dockerfile` (ubuntu:24.04, apt packages, node 20, runner user, workspace dirs, entrypoint)
- [x] **T0.3** Create `server.js` with Express app, bind to `$PORT`, GET `/health` returning `{ status: "ok" }`
- [x] **T0.4** Create `src/config.js` stub (full in Phase 1, placeholder now)
- [x] **T0.5** Create directory scaffolding in Dockerfile (`/workspace/sessions`, `/workspace/jobs`, `/workspace/logs`, chown runner)
- [x] **T0.6** Create `.gitignore` (node_modules, workspace, data/packages.json)
- [x] **T0.7** Create `src/` directory structure empty placeholder files
- [x] **T0.8** Create `data/` directory with empty `packages.json` (`{"packages":[]}`)
- [ ] **T0.9** Docker build smoke test
- [ ] **T0.10** Container start + `/health` returns 200
- [ ] **T0.11** Verify runner user exists (uid 1000)
- [ ] **T0.12** Verify `/workspace/` dirs exist and writable by runner

**Gate:** G0 passes (23 tests)

---

## Phase 1: Core Utilities

- [ ] **T1.1** Create `src/config.js` - load all env vars with defaults, freeze object, validate API_KEY required
- [ ] **T1.2** Create `src/utils/logger.js` - `log(level, category, message)` outputs JSON to stdout
- [ ] **T1.3** Create `src/utils/logger.js` - `audit(action, resourceId, details)` appends to `/app/data/audit.log`
- [ ] **T1.4** Create `src/utils/id.js` - `generateSessionId()` returns `sess_` + 8 hex chars
- [ ] **T1.5** Create `src/utils/id.js` - `generateJobId()` returns `job_` + 8 hex chars
- [ ] **T1.6** Unit test: config loads all 14 env vars with correct defaults
- [ ] **T1.7** Unit test: config throws when API_KEY unset
- [ ] **T1.8** Unit test: config is frozen (cannot add properties)
- [ ] **T1.9** Unit test: logger produces valid JSON lines
- [ ] **T1.10** Unit test: audit appends to file (not overwrite)
- [ ] **T1.11** Unit test: 1000 generated session IDs are unique
- [ ] **T1.12** Unit test: 1000 generated job IDs are unique
- [ ] **T1.13** Unit test: IDs match regex patterns (`/^sess_[0-9a-f]{8}$/`, `/^job_[0-9a-f]{8}$/`)

**Gate:** G1 passes (37 tests)

---

## Phase 2: ProcessLauncher

- [ ] **T2.1** Create `src/sandbox/isolation.js` - cgroup v2 directory create at `/sys/fs/cgroup/nexuss-{id}`
- [ ] **T2.2** Create `src/sandbox/isolation.js` - write `memory.max` and `cpu.max` to cgroup
- [ ] **T2.3** Create `src/sandbox/isolation.js` - assign PID to cgroup via `cgroup.procs`
- [ ] **T2.4** Create `src/sandbox/isolation.js` - cgroup directory cleanup (rmdir after exit)
- [ ] **T2.5** Create `src/sandbox/processLauncher.js` - `spawn({ command, cwd, env, timeout_ms, limits })`
- [ ] **T2.6** Create `src/sandbox/processLauncher.js` - fork/exec with uid 1000, gid 1000, detached
- [ ] **T2.7** Create `src/sandbox/processLauncher.js` - stdout/stderr stream capture
- [ ] **T2.8** Create `src/sandbox/processLauncher.js` - hard timeout: SIGTERM then SIGKILL after 5s
- [ ] **T2.9** Create `src/sandbox/processLauncher.js` - return `{ exit_code, stdout, stderr, duration_ms }`
- [ ] **T2.10** Add ulimit fallback: `RLIMIT_AS` for memory, `RLIMIT_FSIZE` for disk
- [ ] **T2.11** Integration test: spawn `echo hello`, verify exit_code=0, stdout="hello\n"
- [ ] **T2.12** Integration test: spawn `id -u`, verify stdout="1000"
- [ ] **T2.13** Integration test: spawn `sleep 60` with 2s timeout, verify killed in ~2s
- [ ] **T2.14** Integration test: verify cgroup created during execution, gone after
- [ ] **T2.15** Integration test: verify spawned process cannot access `/app`
- [ ] **T2.16** Integration test: verify custom env vars passed to spawned process

**Gate:** G2 passes (20 tests)

---

## Phase 3: Session Manager

- [ ] **T3.1** Create `src/core/sessionManager.js` - in-memory `Map<id, session>` structure
- [ ] **T3.2** Create `src/core/sessionManager.js` - `create()` - generate ID, mkdir workspace, spawn bash pty
- [ ] **T3.3** Create `src/core/sessionManager.js` - `create()` - pipe pty data to log file `/workspace/logs/{id}.log`
- [ ] **T3.4** Create `src/core/sessionManager.js` - `create()` - register session in map with status "active"
- [ ] **T3.5** Create `src/core/sessionManager.js` - `list()` - return all sessions as array
- [ ] **T3.6** Create `src/core/sessionManager.js` - `get(id)` - return session or null
- [ ] **T3.7** Create `src/core/sessionManager.js` - `exec(id, command)` - validate command, write to pty stdin
- [ ] **T3.8** Create `src/core/sessionManager.js` - `exec(id, command)` - buffer output with prompt detection or timeout
- [ ] **T3.9** Create `src/core/sessionManager.js` - `exec(id, command)` - truncate output at `MAX_OUTPUT_BYTES`
- [ ] **T3.10** Create `src/core/sessionManager.js` - `exec(id, command)` - update `last_active_at`
- [ ] **T3.11** Create `src/core/sessionManager.js` - `exec(id, command)` - reject if status != "active"
- [ ] **T3.12** Create `src/core/sessionManager.js` - `exec(id, command)` - reject empty or >64KB command
- [ ] **T3.13** Create `src/core/sessionManager.js` - `getLogs(id, tail?)` - read log file, optionally tail N lines
- [ ] **T3.14** Create `src/core/sessionManager.js` - `close(id)` - kill pty, set status "killed"
- [ ] **T3.15** Create `src/core/sessionManager.js` - `close(id)` - idempotent (no error on second call)
- [ ] **T3.16** Create `src/core/sessionManager.js` - idle expiry sweep: `setInterval(60s)`, kill sessions past timeout
- [ ] **T3.17** Create `src/core/sessionManager.js` - idle expiry: SIGTERM then SIGKILL, log audit entry
- [ ] **T3.18** Create `src/core/sessionManager.js` - state validation: reject exec on non-existent session
- [ ] **T3.19** Create `src/core/sessionManager.js` - state validation: reject exec on killed session
- [ ] **T3.20** Integration test: create session, exec `echo hi`, verify stdout
- [ ] **T3.21** Integration test: exec multi-line command, verify full output
- [ ] **T3.22** Integration test: getLogs returns exec output
- [ ] **T3.23** Integration test: tail=10 returns last 10 lines
- [ ] **T3.24** Integration test: close kills pty process
- [ ] **T3.25** Integration test: exec on killed session returns error
- [ ] **T3.26** Integration test: idle timeout kills session after configured minutes

**Gate:** G3 passes (39 tests)

---

## Phase 4: Job Executor

- [ ] **T4.1** Create `src/core/jobExecutor.js` - in-memory `Map<id, job>` structure
- [ ] **T4.2** Create `src/core/jobExecutor.js` - `submit({ language, code, timeout_sec, limits })` - generate ID, create scratch dir
- [ ] **T4.3** Create `src/core/jobExecutor.js` - `submit()` - write script file by language (`.py`, `.js`, `.sh`, `.php`)
- [ ] **T4.4** Create `src/core/jobExecutor.js` - `submit()` - register job, set status "queued"
- [ ] **T4.5** Create `src/core/jobExecutor.js` - async runner: dequeue, set "running", spawn via ProcessLauncher
- [ ] **T4.6** Create `src/core/jobExecutor.js` - async runner: determine command by language
- [ ] **T4.7** Create `src/core/jobExecutor.js` - async runner: capture result, set "completed"/"failed"/"timed_out"
- [ ] **T4.8** Create `src/core/jobExecutor.js` - async runner: cleanup scratch dir after completion
- [ ] **T4.9** Create `src/core/jobExecutor.js` - `get(id)` - return job or null
- [ ] **T4.10** Create `src/core/jobExecutor.js` - `get(id)` - hide stdout/stderr for queued/running jobs
- [ ] **T4.11** Create `src/core/jobExecutor.js` - validate language (only python3, node, bash, php)
- [ ] **T4.12** Create `src/core/jobExecutor.js` - validate code non-empty, timeout_sec > 0
- [ ] **T4.13** Create `src/core/jobExecutor.js` - record `started_at`, `finished_at`, `duration_ms`
- [ ] **T4.14** Integration test: submit python3 `print('hello')`, verify stdout="hello\n"
- [ ] **T4.15** Integration test: submit node `console.log('hi')`, verify stdout
- [ ] **T4.16** Integration test: submit bash `echo test`, verify stdout
- [ ] **T4.17** Integration test: submit php `echo 'php'`, verify stdout
- [ ] **T4.18** Integration test: submit invalid code, verify "failed" + stderr
- [ ] **T4.19** Integration test: submit sleep(60) with 2s timeout, verify "timed_out"
- [ ] **T4.20** Integration test: verify scratch dir deleted after completion

**Gate:** G4 passes (23 tests)

---

## Phase 5: Resource Manager

- [ ] **T5.1** Create `src/core/resourceManager.js` - `start()` begins polling loop every 5s
- [ ] **T5.2** Create `src/core/resourceManager.js` - `getSnapshot()` returns cached data
- [ ] **T5.3** Create `src/core/resourceManager.js` - parse `/proc/meminfo` (MemTotal, MemAvailable)
- [ ] **T5.4** Create `src/core/resourceManager.js` - read disk usage (`df /workspace`)
- [ ] **T5.5** Create `src/core/resourceManager.js` - read load average (`os.loadavg()`)
- [ ] **T5.6** Create `src/core/resourceManager.js` - threshold evaluator: 70% soft, 85% throttle, 95% hard
- [ ] **T5.7** Create `src/core/resourceManager.js` - `getThresholdStatus()` returns "ok"/"soft"/"throttle"/"hard"
- [ ] **T5.8** Create `src/core/resourceManager.js` - `isThrottled()` returns boolean
- [ ] **T5.9** Create `src/core/resourceManager.js` - hard threshold callback registration
- [ ] **T5.10** Create `src/core/resourceManager.js` - hard threshold: trigger cleanup + kill oldest idle sessions
- [ ] **T5.11** Unit test: threshold at exact boundaries (70.0, 85.0, 95.0)
- [ ] **T5.12** Unit test: hard threshold kills sessions oldest-first
- [ ] **T5.13** Unit test: hard threshold stops killing when below throttle

**Gate:** G5 passes (14 tests)

---

## Phase 6: Package Manager

- [ ] **T6.1** Create `src/core/packageManager.js` - `load()` reads `/app/data/packages.json`
- [ ] **T6.2** Create `src/core/packageManager.js` - `save()` writes to disk
- [ ] **T6.3** Create `src/core/packageManager.js` - `add(name, manager, size_kb)` - append to manifest
- [ ] **T6.4** Create `src/core/packageManager.js` - `remove(name)` - remove from manifest
- [ ] **T6.5** Create `src/core/packageManager.js` - `get(name)` - return entry or null
- [ ] **T6.6** Create `src/core/packageManager.js` - `list()` - return all entries
- [ ] **T6.7** Create `src/core/packageManager.js` - `install(name, manager)` - build command by manager
- [ ] **T6.8** Create `src/core/packageManager.js` - `install()` - execute via ProcessLauncher
- [ ] **T6.9** Create `src/core/packageManager.js` - `install()` - calculate size with `du -sk`
- [ ] **T6.10** Create `src/core/packageManager.js` - `install()` - add to manifest + save
- [ ] **T6.11** Create `src/core/packageManager.js` - `uninstall(name, manager)` - execute remove command
- [ ] **T6.12** Create `src/core/packageManager.js` - `uninstall()` - remove from manifest + save
- [ ] **T6.13** Create `src/core/packageManager.js` - protected packages: `remove()` throws for protected entries
- [ ] **T6.14** Create `src/core/packageManager.js` - `startCleanupCron(interval_ms)` - iterate manifest, remove expired
- [ ] **T6.15** Create `src/core/packageManager.js` - cleanup: check `last_used` vs `CLEANUP_TTL_HOURS`
- [ ] **T6.16** Create `src/core/packageManager.js` - `triggerCleanup()` - immediate out-of-cycle cleanup
- [ ] **T6.17** Update `Dockerfile` - add `/etc/sudoers.d/nexuss-runner` (apt-get only)
- [ ] **T6.18** Integration test: pip install, verify manifest + package available
- [ ] **T6.19** Integration test: apt install via sudo, verify it works
- [ ] **T6.20** Integration test: remove package, verify gone from manifest
- [ ] **T6.21** Integration test: mark package unused, run cleanup, verify removed
- [ ] **T6.22** Integration test: protected package not removed by cleanup

**Gate:** G6 passes (28 tests)

---

## Phase 7: API Routes

- [ ] **T7.1** Create `src/middleware/auth.js` - extract Bearer token, constant-time compare with API_KEY
- [ ] **T7.2** Create `src/middleware/auth.js` - skip auth for `/health`
- [ ] **T7.3** Create `src/middleware/rateLimiter.js` - per-key sliding window map
- [ ] **T7.4** Create `src/middleware/rateLimiter.js` - configurable limits per endpoint type
- [ ] **T7.5** Create `src/middleware/rateLimiter.js` - return 429 with `retry_after_sec`
- [ ] **T7.6** Create `src/middleware/errorHandler.js` - global Express error middleware (4-arg)
- [ ] **T7.7** Create `src/middleware/errorHandler.js` - return JSON `{ error, message, details }`
- [ ] **T7.8** Create `src/middleware/errorHandler.js` - never expose stack traces
- [ ] **T7.9** Create `src/middleware/auditLog.js` - log every request to audit file
- [ ] **T7.10** Create `src/routes/health.js` - GET `/health` returns uptime, session count, mem_pct
- [ ] **T7.11** Create `src/routes/sessions.js` - POST `/sessions` (auth, rate limit, create, return 201)
- [ ] **T7.12** Create `src/routes/sessions.js` - GET `/sessions` (auth, list all)
- [ ] **T7.13** Create `src/routes/sessions.js` - GET `/sessions/:id` (auth, get one)
- [ ] **T7.14** Create `src/routes/sessions.js` - GET `/sessions/:id/logs` (auth, tail param)
- [ ] **T7.15** Create `src/routes/sessions.js` - POST `/sessions/:id/exec` (auth, rate limit, exec command)
- [ ] **T7.16** Create `src/routes/sessions.js` - DELETE `/sessions/:id` (auth, close session)
- [ ] **T7.17** Create `src/routes/jobs.js` - POST `/jobs` (auth, rate limit, submit, return 202)
- [ ] **T7.18** Create `src/routes/jobs.js` - GET `/jobs/:id` (auth, poll status)
- [ ] **T7.19** Create `src/routes/packages.js` - POST `/packages/install` (auth, rate limit, install)
- [ ] **T7.20** Create `src/routes/packages.js` - GET `/packages` (auth, list)
- [ ] **T7.21** Create `src/routes/packages.js` - DELETE `/packages/:name` (auth, remove)
- [ ] **T7.22** Create `src/routes/resources.js` - GET `/resources` (auth, return snapshot)
- [ ] **T7.23** Wire all routes + middleware into `server.js`
- [ ] **T7.24** Add `express.json({ limit: '1mb' })` body parser
- [ ] **T7.25** Add resource status headers (`X-Resource-Mem`, `X-Resource-Disk`, `X-Resource-Status`) to all responses
- [ ] **T7.26** Integration test: POST /sessions with auth -> 201
- [ ] **T7.27** Integration test: POST /sessions without auth -> 401
- [ ] **T7.28** Integration test: POST /sessions beyond rate limit -> 429
- [ ] **T7.29** Integration test: full session flow (create -> exec -> get logs -> delete)
- [ ] **T7.30** Integration test: full job flow (submit -> poll -> get result)
- [ ] **T7.31** Integration test: full package flow (install -> list -> delete)
- [ ] **T7.32** Integration test: GET /resources returns valid JSON
- [ ] **T7.33** Integration test: error responses never contain stack traces
- [ ] **T7.34** Integration test: 401/404/400/409 responses have correct body shape
- [ ] **T7.35** Integration test: audit.log records every request

**Gate:** G7 passes (53 tests)

---

## Phase 8: Error Handling + Graceful Shutdown

- [ ] **T8.1** Add global Express error handler: catch-all 4-arg middleware
- [ ] **T8.2** Add 500 response: `{ error: "internal_error", message: "..." }` (no stack trace)
- [ ] **T8.3** Add unknown route handler: 404 JSON for any unmatched route
- [ ] **T8.4** Add SIGTERM handler in `server.js`: `server.close()` + session cleanup + job cleanup
- [ ] **T8.5** Add SIGTERM handler: kill all active pty processes (SIGTERM then SIGKILL after 5s)
- [ ] **T8.6** Add SIGTERM handler: kill all running job processes
- [ ] **T8.7** Add SIGTERM handler: flush audit log, write final entry
- [ ] **T8.8** Add SIGTERM handler: exit with code 0
- [ ] **T8.9** Add SIGINT handler (reuse SIGTERM logic)
- [ ] **T8.10** Add `process.on('unhandledRejection')` handler with logging
- [ ] **T8.11** Add `process.on('uncaughtException')` handler with logging
- [ ] **T8.12** Integration test: docker stop mid-session, verify clean exit (no orphans)
- [ ] **T8.13** Integration test: docker stop completes within 15s
- [ ] **T8.14** Integration test: audit log has entries after shutdown
- [ ] **T8.15** Integration test: unhandled rejection logged, server stays alive

**Gate:** G8 passes (13 tests)

---

## Phase 9: Security Hardening

- [ ] **T9.1** Verify Dockerfile: `/app` owned by root:root (755)
- [ ] **T9.2** Verify runner cannot write to `/app`
- [ ] **T9.3** Verify runner can read `/app/data/packages.json`
- [ ] **T9.4** Verify runner cannot write to `/app/data/packages.json`
- [ ] **T9.5** Verify `/workspace` owned by runner:runner
- [ ] **T9.6** Verify runner can write to `/workspace/sessions`, `/workspace/jobs`, `/workspace/logs`
- [ ] **T9.7** Verify sudoers: runner can `sudo apt-get install -y`
- [ ] **T9.8** Verify sudoers: runner can `sudo apt-get remove -y`
- [ ] **T9.9** Verify sudoers: runner can `sudo apt-get update`
- [ ] **T9.10** Verify sudoers: runner CANNOT `sudo ls`
- [ ] **T9.11** Verify sudoers: runner CANNOT `sudo bash`
- [ ] **T9.12** Verify sudoers: runner CANNOT `sudo rm -rf /`
- [ ] **T9.13** Verify `/etc/sudoers.d/nexuss-runner` has mode 0440
- [ ] **T9.14** Verify POST /sessions rejects >1MB body (413)
- [ ] **T9.15** Verify POST /jobs rejects >1MB body (413)
- [ ] **T9.16** Verify POST /sessions/:id/exec rejects >64KB command (400)
- [ ] **T9.17** Verify session process cannot access `/app`
- [ ] **T9.18** Verify session A cannot read session B files
- [ ] **T9.19** Verify job cannot read session directories
- [ ] **T9.20** Verify all spawned processes run as uid 1000
- [ ] **T9.21** If ENABLE_BWRAP=true: verify outbound HTTP blocked
- [ ] **T9.22** If ENABLE_BWRAP=false: verify outbound HTTP works
- [ ] **T9.23** Verify POST /jobs with missing language -> 400
- [ ] **T9.24** Verify POST /jobs with missing code -> 400
- [ ] **T9.25** Verify POST /jobs with unknown language -> 400
- [ ] **T9.26** Verify POST /packages/install with invalid manager -> 400
- [ ] **T9.27** Code review: `crypto.timingSafeEqual` used in auth
- [ ] **T9.28** Code review: no secrets/keys logged anywhere

**Gate:** G9 passes (28 tests)

---

## Phase 10: Deployment

- [ ] **T10.1** Create `render.yaml` (type: web, env: docker, healthCheckPath: /health)
- [ ] **T10.2** Create `.github/workflows/keepalive.yml` (cron: `*/14 * * * *`, curl /health)
- [ ] **T10.3** Push repo to GitHub
- [ ] **T10.4** Connect Render to GitHub repo
- [ ] **T10.5** Deploy on Render (Docker Web Service, starter plan)
- [ ] **T10.6** Set API_KEY in Render env vars
- [ ] **T10.7** Verify GET /health returns 200 on Render URL
- [ ] **T10.8** Verify response JSON is valid
- [ ] **T10.9** Verify GitHub Actions workflow runs successfully
- [ ] **T10.10** End-to-end: POST /sessions on Render -> 201
- [ ] **T10.11** End-to-end: POST /sessions/:id/exec "echo e2e" -> stdout="e2e\n"
- [ ] **T10.12** End-to-end: GET /sessions/:id/logs -> contains "e2e"
- [ ] **T10.13** End-to-end: DELETE /sessions/:id -> 200
- [ ] **T10.14** End-to-end: POST /jobs on Render -> 202
- [ ] **T10.15** End-to-end: GET /jobs/:id -> completed with stdout
- [ ] **T10.16** End-to-end: POST /packages/install jq -> 200
- [ ] **T10.17** End-to-end: GET /packages shows jq
- [ ] **T10.18** Monitor: service stays alive 30+ minutes without manual requests
- [ ] **T10.19** Monitor: memory usage stable over 1 hour (no growth > 10%)

**Gate:** G10 passes (22 tests)

---

## Summary

| Phase | Tasks | Status |
|---|---|---|
| 0 - Scaffolding | 12 | Not started |
| 1 - Core Utilities | 13 | Not started |
| 2 - ProcessLauncher | 16 | Not started |
| 3 - Session Manager | 26 | Not started |
| 4 - Job Executor | 20 | Not started |
| 5 - Resource Manager | 13 | Not started |
| 6 - Package Manager | 22 | Not started |
| 7 - API Routes | 35 | Not started |
| 8 - Error + Shutdown | 15 | Not started |
| 9 - Security | 28 | Not started |
| 10 - Deployment | 19 | Not started |
| **Total** | **219** | **0 / 219** |
