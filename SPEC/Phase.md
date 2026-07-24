# Nexuss Bash - Phase Contracts

**Source:** Architecture.md
**Scope:** End-to-end build plan with dependency graph

---

## Dependency Graph

```
Phase 0: Scaffolding
    |
    v
Phase 1: Core Utilities
    |
    v
Phase 2: ProcessLauncher
    |
    +------------------+------------------+
    |                                     |
    v                                     v
Phase 3: Session Manager          Phase 4: Job Executor
    |                                     |
    +------------------+------------------+
    |                                     |
    v                                     v
Phase 5: Resource Manager          Phase 6: Package Manager
    |                                     |
    +------------------+------------------+
    |
    v
Phase 7: API Routes
    |
    v
Phase 8: Error Handling + Shutdown
    |
    v
Phase 9: Security Hardening
    |
    v
Phase 10: Deployment
```

**Parallelizable groups:**
- Group A (Phase 3 + 4): Session Manager and Job Executor are independent of each other, both depend only on Phase 2
- Group B (Phase 5 + 6): Resource Manager and Package Manager are independent of each other, both depend on Phase 2

---

## Phase 0: Scaffolding

**Goal:** Empty project that builds, starts, and responds to HTTP.

**Features:**
- Dockerfile that builds successfully
- Node.js project with package.json
- Express server that binds to $PORT
- GET /health returns 200
- Basic directory structure created

**Input:**
- Architecture.md file structure (Section 16)

**Output:**
- Container starts, `curl localhost:$PORT/health` returns `{"status":"ok"}`
- All directories exist (/workspace/sessions, /workspace/jobs, /workspace/logs)
- runner user exists in container

**Tasks:**

| # | Task | Depends | Parallel Group |
|---|---|---|---|
| 0.1 | Create package.json with express dependency | None | solo |
| 0.2 | Create Dockerfile | None | solo |
| 0.3 | Create server.js with Express + /health endpoint | 0.1 | solo |
| 0.4 | Create directory structure in Dockerfile (mkdir workspace dirs, chown runner) | 0.2 | solo |
| 0.5 | Create .gitignore (node_modules, workspace, data/packages.json) | None | solo |
| 0.6 | Docker build + smoke test | 0.1, 0.2, 0.3, 0.4, 0.5 | solo |

**Acceptance criteria:**
- `docker build -t nexuss-bash .` succeeds
- Container starts and /health returns 200
- runner user can write to /workspace/

---

## Phase 1: Core Utilities

**Goal:** Shared libraries used by every subsequent phase.

**Features:**
- Config loader from env vars with defaults
- Structured logger (console JSON + audit file writer)
- ID generator (sess_ / job_ prefixed hex IDs)

**Input:**
- Environment variables (Architecture.md Section 14)

**Output:**
- `src/config.js` - exports frozen config object
- `src/utils/logger.js` - log(), audit() functions
- `src/utils/id.js` - generateSessionId(), generateJobId()

**Tasks:**

| # | Task | Depends | Parallel Group |
|---|---|---|---|
| 1.1 | Create src/config.js - load env vars, apply defaults, validate required (API_KEY) | 0.3 | A |
| 1.2 | Create src/utils/logger.js - structured console output + append to /app/data/audit.log | 0.3 | A |
| 1.3 | Create src/utils/id.js - sess_/job_ + 8-char random hex | 0.3 | A |
| 1.4 | Unit test config, logger, id | 1.1, 1.2, 1.3 | solo |

**Acceptance criteria:**
- config.js exports all env vars with correct defaults
- logger writes JSON lines to stdout and audit file
- id.js generates unique IDs with correct prefix

---

## Phase 2: ProcessLauncher

**Goal:** The shared isolation layer that spawns processes as runner with resource limits.

**Features:**
- Fork/exec process as runner (uid 1000)
- cgroup v2 creation and assignment (memory.max, cpu.max)
- ulimit fallback (RLIMIT_AS, RLIMIT_FSIZE)
- stdout/stderr capture
- Hard timeout with SIGTERM then SIGKILL
- cgroup cleanup after exit

**Input:**
- Spawn request: { command, cwd, env, timeout_ms, limits: { memory_mb, cpu_pct } }

**Output:**
- Spawn result: { exit_code, stdout, stderr, duration_ms }
- Process runs as uid 1000
- cgroup created, assigned, destroyed

**Tasks:**

| # | Task | Depends | Parallel Group |
|---|---|---|---|
| 2.1 | Create src/sandbox/isolation.js - cgroup create/destroy, cgroup.procs write | 1.1 | A |
| 2.2 | Create src/sandbox/processLauncher.js - spawn, capture, timeout | 2.1 | B |
| 2.3 | Add ulimit fallback in processLauncher.js when cgroups unavailable | 2.2 | solo |
| 2.4 | Integration test: spawn "echo hello" as runner, verify uid + output + cgroup cleanup | 2.2 | solo |
| 2.5 | Integration test: spawn long-running process, verify timeout kills it | 2.2 | solo |
| 2.6 | Integration test: spawn with memory limit, verify OOM kill | 2.2, 2.3 | solo |

**Acceptance criteria:**
- Process runs as runner (not root)
- cgroup exists during execution, gone after
- Timeout kills process within 5s of expiry
- stdout/stderr captured correctly
- Exit code returned

---

## Phase 3: Session Manager

**Goal:** Long-lived interactive shell sessions via pty.

**Features:**
- Create session (spawn bash in pty)
- Execute command (write to pty stdin, capture output)
- Fetch logs (tail or full)
- Close session (kill pty, cleanup)
- Idle expiry sweep (auto-kill inactive sessions)
- Session state machine (creating -> active -> idle -> killed)

**Input:**
- Session creation request (no body)
- Exec request: { command: string }
- Log request: { tail: number }

**Output:**
- Session object: { id, status, created_at, last_active_at, pid }
- Exec result: { stdout, stderr, exit_code }
- Log content: { log: string }
- Log file on disk: /workspace/logs/{id}.log

**Tasks:**

| # | Task | Depends | Parallel Group |
|---|---|---|---|
| 3.1 | Create src/core/sessionManager.js - in-memory sessions Map, create/close/get | 2.2 | A |
| 3.2 | Add pty spawn logic (node-pty) inside sessionManager.create() | 3.1 | A |
| 3.3 | Add exec logic: write command to pty, buffer output, detect prompt/timeout | 3.2 | A |
| 3.4 | Add log stream: pipe pty data to /workspace/logs/{id}.log, append-only | 3.2 | A |
| 3.5 | Add idle expiry sweep: setInterval, kill sessions past IDLE_TIMEOUT_MS | 3.1 | A |
| 3.6 | Add session status transitions + state validation | 3.1 | A |
| 3.7 | Integration test: create session, exec "echo hi", verify output | 3.3 | solo |
| 3.8 | Integration test: exec multi-line command, verify full output | 3.3 | solo |
| 3.9 | Integration test: create session, wait idle timeout, verify auto-killed | 3.5 | solo |
| 3.10 | Integration test: exec on killed session returns 409 | 3.6 | solo |

**Acceptance criteria:**
- Session creates bash pty running as runner
- Exec returns stdout/stderr/exit_code
- Log file written on disk
- Idle sessions killed after timeout
- Closed sessions cannot receive exec calls

---

## Phase 4: Job Executor

**Goal:** One-shot code execution with isolation and result return.

**Features:**
- Submit job (code + language + timeout + limits)
- Execute in isolated scratch directory
- Poll for status + result
- Auto-cleanup scratch dir after completion
- Language detection (python3, node, bash, php)
- Job state machine (queued -> running -> completed | failed | timed_out)

**Input:**
- Job submit: { language, code, timeout_sec, limits }
- Job poll: job ID

**Output:**
- Job submit response: { job_id, status: "queued" }
- Job poll response: { id, status, exit_code, stdout, stderr, duration_ms }

**Tasks:**

| # | Task | Depends | Parallel Group |
|---|---|---|---|
| 4.1 | Create src/core/jobExecutor.js - in-memory jobs Map, submit/poll/close | 2.2 | B |
| 4.2 | Add scratch dir creation + script file write by language | 4.1 | B |
| 4.3 | Add execution: determine command by language, spawn via ProcessLauncher | 4.2 | B |
| 4.4 | Add async job runner: dequeue, set status, spawn, capture result, cleanup | 4.3 | B |
| 4.5 | Add cleanup: rm -rf /workspace/jobs/{id} after completion | 4.4 | B |
| 4.6 | Integration test: submit python3 job "print('hello')", verify output | 4.4 | solo |
| 4.7 | Integration test: submit node job, verify output | 4.4 | solo |
| 4.8 | Integration test: submit job with timeout, verify timed_out status | 4.4 | solo |
| 4.9 | Integration test: submit job with bad code, verify failed + stderr | 4.4 | solo |
| 4.10 | Integration test: verify scratch dir deleted after completion | 4.5 | solo |

**Acceptance criteria:**
- Job runs in isolated /workspace/jobs/{id}/
- stdout/stderr/exit_code captured
- Scratch dir cleaned up after completion
- Timeout produces timed_out status
- Invalid code produces failed status with stderr

---

## Phase 5: Resource Manager

**Goal:** Monitor system resources, enforce thresholds, trigger cleanup.

**Features:**
- Poll /proc/meminfo, df, load average every 5s
- Three threshold levels: soft (70%), throttle (85%), hard (95%)
- Expose resource snapshot via in-memory cache
- Trigger cleanup on hard threshold
- Force-close oldest idle sessions on hard threshold
- Return resource status in response headers

**Input:**
- System state (read-only): /proc/meminfo, /workspace disk usage, os.loadavg()

**Output:**
- Cached resource snapshot: { mem_pct, disk_pct, load_avg, timestamp }
- Threshold flags: SOFT, THROTTLE, HARD
- Hard threshold actions: cleanup + session kill

**Tasks:**

| # | Task | Depends | Parallel Group |
|---|---|---|---|
| 5.1 | Create src/core/resourceManager.js - polling loop, cache snapshot | 1.1 | A |
| 5.2 | Add /proc/meminfo parser (total, available, pct) | 5.1 | A |
| 5.3 | Add disk usage reader (df on /workspace) | 5.1 | A |
| 5.4 | Add threshold evaluator (soft/throttle/hard logic) | 5.2, 5.3 | A |
| 5.5 | Add hard threshold action hook (callback to session manager + package manager) | 5.4 | solo |
| 5.6 | Unit test threshold logic with mocked /proc values | 5.4 | solo |

**Acceptance criteria:**
- Resource snapshot updates every 5s
- Correct threshold flags at 70/85/95%
- Hard threshold triggers cleanup callback
- No /proc read on every HTTP request (cached)

---

## Phase 6: Package Manager

**Goal:** Runtime package install, manifest tracking, auto-cleanup.

**Features:**
- Install packages via apt/pip/npm/composer (as runner)
- Manifest CRUD (read/write /app/data/packages.json)
- Protected packages (never removed)
- Cleanup cron (remove unused non-protected packages after TTL)
- Immediate cleanup trigger from Resource Manager
- Sudoers integration for apt installs

**Input:**
- Install request: { name, manager }
- Cleanup trigger: TTL hours

**Output:**
- Updated manifest file on disk
- Package available to sessions/jobs
- Stale packages removed

**Tasks:**

| # | Task | Depends | Parallel Group |
|---|---|---|---|
| 6.1 | Create src/core/packageManager.js - manifest load/save/CRUD | 1.1 | B |
| 6.2 | Add install logic by manager (apt/pip/npm/composer command builder) | 6.1, 2.2 | B |
| 6.3 | Add size calculation after install (du -sk) | 6.2 | B |
| 6.4 | Add cleanup cron: setInterval, iterate manifest, remove expired | 6.1 | B |
| 6.5 | Add remove logic by manager (apt-get remove / pip uninstall / npm uninstall) | 6.2 | B |
| 6.6 | Add hard threshold immediate cleanup trigger | 6.4, 5.5 | solo |
| 6.7 | Create /etc/sudoers.d/nexuss-runner in Dockerfile | 0.2 | solo |
| 6.8 | Integration test: install pip package, verify manifest + availability | 6.3 | solo |
| 6.9 | Integration test: install apt package via sudo, verify it works | 6.2, 6.7 | solo |
| 6.10 | Integration test: mark package unused, run cleanup, verify removed | 6.4, 6.5 | solo |

**Acceptance criteria:**
- Package installed and usable by runner
- Manifest on disk reflects installed packages
- Protected packages not removed by cleanup
- Stale packages removed after TTL
- apt installs work via sudo without password prompt

---

## Phase 7: API Routes

**Goal:** Express routes wiring HTTP to core services.

**Features:**
- All routes from Architecture.md Section 10.1
- Auth middleware on mutating endpoints
- Rate limiting middleware
- Request validation (body shape, required fields)
- Resource status headers on all responses
- JSON error responses

**Input:**
- HTTP requests matching the route table

**Output:**
- HTTP responses with correct status codes and body shapes
- 401 on bad auth, 429 on rate limit, 400 on bad request

**Tasks:**

| # | Task | Depends | Parallel Group |
|---|---|---|---|
| 7.1 | Create src/middleware/auth.js - Bearer token extraction + constant-time compare | 1.1 | A |
| 7.2 | Create src/middleware/rateLimiter.js - per-key sliding window | 1.1 | A |
| 7.3 | Create src/middleware/errorHandler.js - global Express error handler | 1.2 | A |
| 7.4 | Create src/middleware/auditLog.js - log every request to audit file | 1.2 | A |
| 7.5 | Create src/routes/health.js - GET /health (no auth) | 5.1 | A |
| 7.6 | Create src/routes/sessions.js - all session endpoints | 3.1, 7.1, 7.2 | B |
| 7.7 | Create src/routes/jobs.js - all job endpoints | 4.1, 7.1, 7.2 | B |
| 7.8 | Create src/routes/packages.js - all package endpoints | 6.1, 7.1, 7.2 | B |
| 7.9 | Create src/routes/resources.js - GET /resources | 5.1, 7.1 | B |
| 7.10 | Wire all routes + middleware into server.js | 7.5, 7.6, 7.7, 7.8, 7.9 | solo |
| 7.11 | Integration test: POST /sessions with auth, verify 201 | 7.10 | solo |
| 7.12 | Integration test: POST /sessions without auth, verify 401 | 7.10 | solo |
| 7.13 | Integration test: POST /sessions beyond rate limit, verify 429 | 7.10 | solo |
| 7.14 | Integration test: full flow create session -> exec -> get logs -> delete | 7.10 | solo |
| 7.15 | Integration test: full flow submit job -> poll -> get result | 7.10 | solo |
| 7.16 | Integration test: install package -> list -> delete | 7.10 | solo |

**Acceptance criteria:**
- All endpoints respond with correct status codes
- Auth blocks unauthorized requests
- Rate limiter enforces per-key limits
- Audit log records every request
- Response headers include resource status

---

## Phase 8: Error Handling + Graceful Shutdown

**Goal:** Robust failure modes and clean container termination.

**Features:**
- Global error handler (catch-all Express middleware)
- Structured error responses (error code + message + details)
- SIGTERM handler: drain connections, kill sessions, kill jobs, flush logs, exit 0
- SIGINT handler: same as SIGTERM
- Unhandled rejection/exception handlers

**Input:**
- SIGTERM signal from container runtime
- Unhandled errors in any route/service

**Output:**
- Clean exit with code 0
- All pty processes killed
- All job processes killed
- Audit log flushed
- Error responses always JSON, never stack traces

**Tasks:**

| # | Task | Depends | Parallel Group |
|---|---|---|---|
| 8.1 | Add global Express error handler (4-arg middleware) | 7.3 | solo |
| 8.2 | Add SIGTERM handler in server.js (server.close + session cleanup + job cleanup) | 7.10, 3.1, 4.1 | solo |
| 8.3 | Add SIGINT handler (reuse SIGTERM logic) | 8.2 | solo |
| 8.4 | Add process.on('unhandledRejection') + process.on('uncaughtException') | 1.2 | solo |
| 8.5 | Integration test: kill container mid-session, verify clean exit (no zombie processes) | 8.2 | solo |
| 8.6 | Integration test: trigger unhandled error, verify 500 JSON response | 8.1 | solo |

**Acceptance criteria:**
- SIGTERM kills all sessions + jobs within 10s
- No orphaned processes after shutdown
- All errors return JSON, never HTML stack traces
- Audit log is flushed before exit

---

## Phase 9: Security Hardening

**Goal:** Lock down the container for production use.

**Features:**
- Filesystem permissions verified (/app root-only, /workspace runner-only)
- Sudoers locked to apt-get only
- Body size limit on Express (1MB max)
- Command size validation (64KB max)
- Optional bwrap network isolation
- Constant-time auth (already done in Phase 7.1, verify)

**Input:**
- Dockerfile + runtime configuration

**Output:**
- Container running with minimal attack surface
- Runner cannot write to /app
- Runner cannot sudo arbitrary commands
- Large payloads rejected

**Tasks:**

| # | Task | Depends | Parallel Group |
|---|---|---|---|
| 9.1 | Verify Dockerfile chown: /app root-owned, /workspace runner-owned | 0.4 | A |
| 9.2 | Verify sudoers: runner can only apt-get install/remove/update | 6.7 | A |
| 9.3 | Add express.json({ limit: '1mb' }) body parser | 7.10 | A |
| 9.4 | Add command size validation in session exec route (64KB max) | 7.6 | A |
| 9.5 | Add optional bwrap network isolation flag (ENABLE_BWRAP env) | 2.2 | B |
| 9.6 | Integration test: runner cannot write to /app (write attempt fails) | 9.1 | solo |
| 9.7 | Integration test: runner cannot sudo apt-get install arbitrary package (only whitelisted) | 9.2 | solo |
| 9.8 | Integration test: POST with 2MB body, verify 413 rejected | 9.3 | solo |
| 9.9 | Integration test: exec with 100KB command, verify 400 rejected | 9.4 | solo |

**Acceptance criteria:**
- /app is read-only to runner
- Sudo only works for apt-get
- Large payloads rejected at middleware level
- Network isolation works when enabled

---

## Phase 10: Deployment

**Goal:** Production-ready Render deployment with keepalive.

**Features:**
- render.yaml with correct service config
- External keepalive (GitHub Actions cron every 14min)
- Environment variables documented
- README with deployment instructions
- Health check endpoint verified

**Input:**
- All previous phases complete

**Output:**
- render.yaml in repo root
- .github/workflows/keepalive.yml
- Container deployed on Render, responds to /health
- Keepalive prevents spin-down

**Tasks:**

| # | Task | Depends | Parallel Group |
|---|---|---|---|
| 10.1 | Create render.yaml (Architecture.md Section 15.2) | 7.10 | A |
| 10.2 | Create .github/workflows/keepalive.yml | 10.1 | A |
| 10.3 | Push to GitHub, deploy on Render | 10.1, 10.2 | solo |
| 10.4 | Verify /health returns 200 on Render URL | 10.3 | solo |
| 10.5 | Verify keepalive pings every 14min | 10.4 | solo |
| 10.6 | End-to-end test: create session on Render, exec command, get output | 10.4 | solo |

**Acceptance criteria:**
- App live on Render URL
- /health returns 200
- Keepalive workflow runs every 14min
- Full session flow works over HTTPS

---

## Summary Table

| Phase | Name | Depends On | Parallel Group | Tasks | Critical Path |
|---|---|---|---|---|---|
| 0 | Scaffolding | None | solo | 6 | Yes |
| 1 | Core Utilities | 0 | solo | 4 | Yes |
| 2 | ProcessLauncher | 1 | solo | 6 | Yes |
| 3 | Session Manager | 2 | A | 10 | Yes |
| 4 | Job Executor | 2 | B | 10 | No (parallel with 3) |
| 5 | Resource Manager | 1 | A (within B group) | 6 | No (parallel with 6) |
| 6 | Package Manager | 1 | B (within A group) | 10 | No (parallel with 5) |
| 7 | API Routes | 3,4,5,6 | solo | 16 | Yes |
| 8 | Error + Shutdown | 7 | solo | 6 | Yes |
| 9 | Security | 7 | solo | 9 | Yes |
| 10 | Deployment | 8,9 | solo | 6 | Yes |

**Critical path:** 0 -> 1 -> 2 -> 3 -> 7 -> 8/9 -> 10

**Total tasks:** 89

**Fastest build order:**
1. Phase 0 (scaffolding)
2. Phase 1 (utilities)
3. Phase 2 (ProcessLauncher)
4. **Phase 3 + 4 in parallel** (session + job)
5. **Phase 5 + 6 in parallel** (resources + packages)
6. Phase 7 (wire routes)
7. Phase 8 + 9 in parallel (shutdown + security)
8. Phase 10 (deploy)
