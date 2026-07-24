# Nexuss Bash - Engineering Architecture

**Version:** 1.0
**Companion to:** Design.md
**Scope:** End-to-end implementation architecture

---

## 1. System Boundary

```
┌──────────────────────────────────────────────────────────────────┐
│                   Render Docker Web Service                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   nexuss-agent (root)                      │  │
│  │  Node.js + Express HTTP server on $PORT (Render-assigned)  │  │
│  │                                                            │  │
│  │  ┌────────┐  ┌────────┐  ┌──────────┐  ┌──────────────┐  │  │
│  │  │  Auth  │─▶│ Router │─▶│ Rate     │─▶│  Controller  │  │  │
│  │  │ (mware)│  │(express)│  │ Limiter  │  │  (per-route) │  │  │
│  │  └────────┘  └────────┘  └──────────┘  └──────┬───────┘  │  │
│  │                                                 │          │  │
│  │  ┌──────────────────────────────────────────────▼───────┐  │  │
│  │  │                Core Services                         │  │  │
│  │  │                                                      │  │  │
│  │  │  ┌────────────────┐     ┌────────────────┐           │  │  │
│  │  │  │ SessionManager │     │  JobExecutor   │           │  │  │
│  │  │  │  - pty spawn   │     │  - code exec   │           │  │  │
│  │  │  │  - cmd routing │     │  - timeout     │           │  │  │
│  │  │  │  - log tail    │     │  - result grab │           │  │  │
│  │  │  │  - idle expiry │     │                │           │  │  │
│  │  │  └───────┬────────┘     └───────┬────────┘           │  │  │
│  │  │          │                      │                    │  │  │
│  │  │  ┌───────▼──────────────────────▼─────────────────┐  │  │  │
│  │  │  │          ProcessLauncher (shared)               │  │  │  │
│  │  │  │  - fork/exec as runner (uid 1000)              │  │  │  │
│  │  │  │  - cgroup assignment (memory.max, cpu.max)     │  │  │  │
│  │  │  │  - ulimit enforcement                          │  │  │  │
│  │  │  │  - namespace isolation (bwrap optional)        │  │  │  │
│  │  │  │  - stdout/stderr capture                       │  │  │  │
│  │  │  └──────────────────────┬─────────────────────────┘  │  │  │
│  │  │                         │                             │  │  │
│  │  │  ┌──────────────────────▼─────────────────────────┐  │  │  │
│  │  │  │              Linux Kernel                       │  │  │  │
│  │  │  │  - pty devices (/dev/pts/*)                     │  │  │  │
│  │  │  │  - cgroups v2 (/sys/fs/cgroup/)                 │  │  │  │
│  │  │  │  - process isolation                            │  │  │  │
│  │  │  └────────────────────────────────────────────────┘  │  │  │
│  │  │                                                      │  │  │
│  │  │  ┌─────────────────┐     ┌────────────────┐         │  │  │
│  │  │  │ ResourceManager │     │ PackageManager │         │  │  │
│  │  │  │  - /proc poll   │     │  - manifest    │         │  │  │
│  │  │  │  - threshold    │     │  - sudo apt    │         │  │  │
│  │  │  │  - cleanup trig │     │  - cleanup job │         │  │  │
│  │  │  └─────────────────┘     └────────────────┘         │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                  Filesystem Layout                          │  │
│  │  /app/             API server code (root-owned)             │  │
│  │  /app/data/        packages.json manifest                   │  │
│  │  /workspace/       all runtime data (runner-owned)          │  │
│  │    sessions/{id}/  per-session cwd                          │  │
│  │    jobs/{id}/      per-job scratch dir (deleted after)      │  │
│  │    logs/{id}.log   per-session append-only log              │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 20 LTS | Single language, async I/O, node-pty is mature |
| HTTP framework | Express 4.x | Minimal, no magic, wide ecosystem |
| PTY management | node-pty | Only viable Node library for real pty control |
| Process isolation | Linux cgroups v2 + setrlimit | Native kernel primitives, no extra daemons |
| Optional sandbox | bubblewrap (bwrap) | Unprivileged namespace sandbox, Ubuntu 24.04 |
| Package install | sudo + locked-down sudoers | Runner can only run apt-get install |
| Process monitor | Parent Node process | PID tracking, SIGTERM handling, cleanup |
| Config | Environment variables | Render env vars, .env for local dev |

---

## 3. Boot Sequence

```
Container Start (docker run / Render deploy)
|
|-- 1. ENTRYPOINT: node server.js (as root)
|
|-- 2. server.js initializes:
|     |-- Load config from env vars
|     |-- Validate API_KEY exists
|     |-- Ensure /workspace dirs exist (mkdir -p)
|     |-- Ensure runner user exists (id runner)
|     |-- Load package manifest from /app/data/packages.json
|     |-- Start ResourceManager (begin polling /proc every 5s)
|     |-- Start PackageManager cleanup cron (every 60min)
|     |-- Register SIGTERM/SIGINT handlers (graceful shutdown)
|     +-- Bind Express to 0.0.0.0:$PORT
|
|-- 3. Express starts listening
|     +-- GET /health returns 200
|
+-- 4. Ready for traffic
```

---

## 4. Authentication and Rate Limiting

### 4.1 Auth Middleware

```
Request --> Extract "Authorization: Bearer <token>" header
          --> Compare against process.env.API_KEY (constant-time)
          --> If /health: skip auth, pass through
          --> If no header or mismatch: 401 { "error": "unauthorized" }
          --> If match: attach key identity to req, pass through
```

- No token storage on disk, env var only.
- Constant-time comparison via crypto.timingSafeEqual.
- Key identity logged with every state-changing request for audit trail.

### 4.2 Rate Limiter

```
Per-key in-memory map:
  { apiKey: { sessionCreates: N, jobSubmits: N, windowStart: ts } }

Limits (configurable via env):
  SESSION_CREATE_RATE:  10 / minute
  JOB_SUBMIT_RATE:     20 / minute
  EXEC_RATE:           100 / minute (per-session)

On violation: 429 { "error": "rate_limited", "retry_after_sec": N }
```

- In-memory only (resets on container restart, acceptable).
- Sliding window per key.

---

## 5. Session Lifecycle

### 5.1 State Machine

```
                  POST /sessions
                       |
                       v
                 +-----------+
                 | creating  |
                 +-----+-----+
                       | pty spawned, bash ready
                       v
                 +-----------+
          +------|  active   |------+
          |      +-----+-----+      |
          |           |             |
   exec call    idle timeout  DELETE /sessions/:id
   resets timer   (30 min)          |
          |           |             |
          |           v             v
          |      +----------+  +--------+
          +----->|   idle   |  | killed |
                 +----+-----+  +--------+
                       |
                  DELETE /sessions/:id
                       |
                       v
                  +--------+
                  | killed |
                  +--------+
```

### 5.2 Session Creation Flow

```
POST /sessions
|
|-- 1. Rate limit check
|-- 2. ResourceManager threshold check (soft: warn, throttle: reject)
|-- 3. Generate session ID: sess_{8-char-hex}
|-- 4. Create workspace:
|     mkdir -p /workspace/sessions/{id}
|     chown runner:runner /workspace/sessions/{id}
|-- 5. Spawn pty:
|     node-pty.spawn('/bin/bash', [], {
|       name: 'xterm-256color',
|       cols: 80, rows: 24,
|       cwd: '/workspace/sessions/{id}',
|       env: { ...process.env, HOME: '/workspace/sessions/{id}' }
|     })
|-- 6. Create log stream:
|     WriteStream to /workspace/logs/{id}.log (append-only)
|-- 7. Pipe pty stdout/stderr to log file + in-memory buffer
|-- 8. Register in SessionManager map:
|     sessions.set(id, { pty, pid, logPath, cwd, status, lastActiveAt })
|-- 9. Return: { session_id, status: "active", created_at }
```

### 5.3 Command Execution Flow

```
POST /sessions/:id/exec  { "command": "ls -la" }
|
|-- 1. Lookup session by ID -> 404 if not found
|-- 2. Rate limit check (per-session exec rate)
|-- 3. Validate command string (non-empty, < 64KB)
|-- 4. Check session status -> 409 if not active
|-- 5. Write command to pty stdin:
|     pty.write(command + '\n')
|-- 6. Collect output:
|     Buffer pty data events for up to EXEC_TIMEOUT_MS (default 30s)
|     OR until prompt pattern detected (\n$ / \n# / \n>)
|-- 7. Truncate buffer if exceeds MAX_OUTPUT_BYTES (default 1MB)
|-- 8. Update lastActiveAt timestamp
|-- 9. Return: { stdout, stderr, exit_code }
```

### 5.4 Idle Expiry Sweep

```
setInterval every 60s:
|
+-- For each session where status === 'active':
      if (Date.now() - session.lastActiveAt > IDLE_TIMEOUT_MS)
        |-- session.pty.kill()  (SIGTERM then SIGKILL after 5s)
        |-- session.status = 'killed'
        |-- Audit log: "session {id} expired after idle timeout"
        +-- ResourceManager.recheck()
```

---

## 6. Job Lifecycle

### 6.1 State Machine

```
POST /jobs
     |
     v
+-----------+
|  queued   |
+-----+-----+
      | ProcessLauncher picks up
      v
+-----------+
|  running  |--- timeout --->+-----------+
+-----+-----+                | timed_out |
      |                       +-----------+
      v
+-----------+    +--------+
| completed |    | failed |
+-----------+    +--------+
```

### 6.2 Job Execution Flow

```
POST /jobs  { language, code, timeout_sec, limits }
|
|-- 1. Rate limit check
|-- 2. ResourceManager threshold check
|-- 3. Generate job ID: job_{8-char-hex}
|-- 4. Create scratch dir:
|     mkdir -p /workspace/jobs/{id}
|     chown runner:runner /workspace/jobs/{id}
|-- 5. Write code to scratch dir:
|     /workspace/jobs/{id}/script.{ext}  (ext depends on language)
|-- 6. Register job in map: status = "queued"
|-- 7. Enqueue to ProcessLauncher
|-- 8. Return immediately: { job_id, status: "queued" }
|
+-- ProcessLauncher picks up (async):
    |
    |-- 1. Set job status = "running", started_at = now
    |-- 2. Determine command by language:
    |     python3 -> python3 script.py
    |     node    -> node script.js
    |     bash    -> bash script.sh
    |     php     -> php script.php
    |-- 3. Spawn via ProcessLauncher (same isolation as sessions)
    |-- 4. Set hard timeout: setTimeout(kill, timeout_sec * 1000)
    |-- 5. Capture stdout + stderr
    |-- 6. On exit:
    |     Set status = "completed" | "failed" | "timed_out"
    |     Record exit_code, stdout, stderr, duration_ms
    |-- 7. Cleanup: rm -rf /workspace/jobs/{id}
    +-- 8. Retain only metadata + output in memory
```

### 6.3 Job Polling

```
GET /jobs/:id
|
|-- 1. Lookup job by ID -> 404 if not found
|-- 2. Return: { id, status, exit_code, stdout, stderr, duration_ms }
|     If status === "queued" or "running": omit stdout/stderr
|     If status === "completed" or "failed" or "timed_out": include full result
```

---

## 7. ProcessLauncher (Shared Isolation Layer)

The ProcessLauncher is the single point of execution for both sessions and jobs. It enforces isolation consistently.

### 7.1 Spawn Flow

```
ProcessLauncher.spawn({ command, cwd, env, timeout_ms, limits })
|
|-- 1. Determine cgroup path:
|     /sys/fs/cgroup/nexuss-{jobId_or_sessionId}
|-- 2. Create cgroup (if cgroups v2 available):
|     mkdir /sys/fs/cgroup/nexuss-{id}
|     echo {memory_mb * 1024 * 1024} > memory.max
|     echo {cpu_pct * 1000 / 100} > cpu.max  (quota/period)
|-- 3. Fork process:
|     child = child_process.spawn(command, [], {
|       cwd,
|       env,
|       stdio: ['pipe', 'pipe', 'pipe'],
|       uid: 1000,          // runner
|       gid: 1000,
|       detached: true      // for cgroup assignment
|     })
|-- 4. Assign child PID to cgroup:
|     echo {child.pid} > /sys/fs/cgroup/nexuss-{id}/cgroup.procs
|-- 5. Apply ulimits (fallback if cgroups unavailable):
|     rlimit.setrlimit(RLIMIT_AS, memory_mb * 1024 * 1024)
|     rlimit.setrlimit(RLIMIT_FSIZE, 100 * 1024 * 1024)  // 100MB disk
|-- 6. Set timeout watchdog:
|     timer = setTimeout(() => {
|       child.kill('SIGTERM')
|       setTimeout(() => child.kill('SIGKILL'), 5000)
|     }, timeout_ms)
|-- 7. Collect stdout + stderr via stream events
|-- 8. On child exit:
|     clearTimeout(timer)
|     Return { exit_code, stdout, stderr, duration_ms }
|-- 9. Cleanup cgroup:
|     rmdir /sys/fs/cgroup/nexuss-{id}
```

### 7.2 Isolation Guarantees

| Layer | Mechanism | Fallback |
|---|---|---|
| User | uid 1000 (runner) | Always available |
| Memory | cgroups v2 memory.max | setrlimit RLIMIT_AS |
| CPU | cgroups v2 cpu.max (quota/period) | None (best effort) |
| Disk | setrlimit RLIMIT_FSIZE | None |
| Filesystem | Separate cwd per session/job | None (rely on chdir) |
| Network | Optional: bwrap --unshare-net | iptables rules |
| Process | detached PID, no shared namespaces | None |

---

## 8. Resource Manager

### 8.1 Polling Loop

```
setInterval every 5s:
|
|-- 1. Read /proc/meminfo:
|     total = MemTotal
|     available = MemAvailable
|     mem_pct = (total - available) / total * 100
|
|-- 2. Read disk usage:
|     df --output=pcent /workspace | parse percentage
|     disk_pct = used percentage
|
|-- 3. Read load average:
|     os.loadavg() -> [1min, 5min, 15min]
|
|-- 4. Cache snapshot:
|     cache = { mem_pct, disk_pct, load_avg, timestamp }
|
|-- 5. Evaluate thresholds:
|     if mem_pct > 95 || disk_pct > 95:
|       trigger HARD threshold -> immediate cleanup
|     elif mem_pct > 85 || disk_pct > 85:
|       set THROTTLE flag -> reject new sessions/jobs
|     elif mem_pct > 70 || disk_pct > 70:
|       set SOFT flag -> warn in responses
|     else:
|       clear all flags
```

### 8.2 Threshold Response Headers

```
All API responses include:
  X-Resource-Mem: 42.3
  X-Resource-Disk: 15.7
  X-Resource-Status: ok | soft | throttle

On soft threshold:
  Response body includes: "warning": "resource_usage_high"

On throttle threshold:
  POST /sessions -> 503 { "error": "throttled", "retry_after_sec": 60 }
  POST /jobs     -> 503 { "error": "throttled", "retry_after_sec": 60 }
```

### 8.3 Hard Threshold Action

```
On HARD threshold (immediate):
|
|-- 1. PackageManager.runCleanup() immediately (out-of-cycle)
|-- 2. Find oldest idle sessions (sorted by lastActiveAt ASC)
|-- 3. Kill sessions one by one until below threshold:
|     for session in idleSessions:
|       if mem_pct < 85: break
|       sessionManager.close(session.id, "resource_pressure")
|-- 4. Log: "Hard threshold breached, cleaned up N sessions"
```

---

## 9. Package Manager

### 9.1 Manifest Schema

```json
{
  "packages": [
    {
      "name": "pandas",
      "manager": "pip",
      "installed_at": "2026-07-24T12:00:00Z",
      "size_kb": 45000,
      "protected": false,
      "last_used": "2026-07-24T14:30:00Z"
    },
    {
      "name": "build-essential",
      "manager": "apt",
      "installed_at": "2026-07-24T10:00:00Z",
      "size_kb": 0,
      "protected": true,
      "last_used": null
    }
  ]
}
```

### 9.2 Install Flow

```
POST /packages/install  { name, manager }
|
|-- 1. Validate manager is supported (apt, pip, npm, composer)
|-- 2. Check ResourceManager (reject if throttle)
|-- 3. Build install command by manager:
|     apt:     sudo apt-get install -y {name}
|     pip:     pip3 install {name}
|     npm:     npm install -g {name}
|     composer: composer global require {name}
|-- 4. Execute via ProcessLauncher (as runner, with timeout)
|-- 5. On success:
|     Calculate installed size (du -sk)
|     Append to manifest: { name, manager, installed_at, size_kb, protected: false }
|     Write manifest to /app/data/packages.json
|-- 6. Return: { status: "installed", name, manager, size_kb }
```

### 9.3 Cleanup Job

```
PackageManager.startCleanupCron(interval_ms = 60min):
|
+-- setInterval:
    |
    |-- 1. Load manifest
    |-- 2. For each non-protected package:
    |     if (Date.now() - package.last_used > CLEANUP_TTL_MS):
    |       Mark for removal
    |-- 3. Execute removal commands:
    |     apt:   sudo apt-get remove -y {name}
    |     pip:   pip3 uninstall -y {name}
    |     npm:   npm uninstall -g {name}
    |-- 4. Remove from manifest
    |-- 5. Write updated manifest
    |-- 6. Log: "Cleaned up N packages, freed X KB"
```

### 9.4 Sudoers Configuration

```
# /etc/sudoers.d/nexuss-runner
# Generated at build time in Dockerfile

runner ALL=(root) NOPASSWD: /usr/bin/apt-get install -y *
runner ALL=(root) NOPASSWD: /usr/bin/apt-get remove -y *
runner ALL=(root) NOPASSWD: /usr/bin/apt-get update
```

- Runner can ONLY run apt-get commands via sudo.
- pip/npm/composer installs run as runner without sudo.

---

## 10. API Route Map

### 10.1 Complete Route Table

| Method | Path | Auth | Rate Limited | Controller |
|---|---|---|---|---|
| GET | /health | No | No | health.js |
| POST | /sessions | Yes | Yes (10/min) | sessions.js |
| GET | /sessions | Yes | No | sessions.js |
| GET | /sessions/:id | Yes | No | sessions.js |
| GET | /sessions/:id/logs | Yes | No | sessions.js |
| POST | /sessions/:id/exec | Yes | Yes (100/min) | sessions.js |
| DELETE | /sessions/:id | Yes | No | sessions.js |
| POST | /jobs | Yes | Yes (20/min) | jobs.js |
| GET | /jobs/:id | Yes | No | jobs.js |
| POST | /packages/install | Yes | Yes (5/min) | packages.js |
| GET | /packages | Yes | No | packages.js |
| DELETE | /packages/:name | Yes | No | packages.js |
| GET | /resources | Yes | No | resources.js |

### 10.2 Request/Response Examples

**POST /sessions**
```http
POST /sessions HTTP/1.1
Authorization: Bearer <key>

HTTP/1.1 201 Created
{
  "session_id": "sess_a1b2c3d4",
  "status": "active",
  "created_at": "2026-07-24T12:00:00Z"
}
```

**POST /sessions/:id/exec**
```http
POST /sessions/sess_a1b2c3d4/exec HTTP/1.1
Authorization: Bearer <key>
Content-Type: application/json

{ "command": "python3 -c 'print(2+2)'" }

HTTP/1.1 200 OK
{
  "stdout": "4\n",
  "stderr": "",
  "exit_code": 0
}
```

**POST /jobs**
```http
POST /jobs HTTP/1.1
Authorization: Bearer <key>
Content-Type: application/json

{
  "language": "python3",
  "code": "import sys; print(sys.version)",
  "timeout_sec": 30,
  "limits": { "memory_mb": 256 }
}

HTTP/1.1 202 Accepted
{
  "job_id": "job_x9y8z7w6",
  "status": "queued"
}
```

**GET /jobs/:id (completed)**
```http
GET /jobs/job_x9y8z7w6 HTTP/1.1
Authorization: Bearer <key>

HTTP/1.1 200 OK
{
  "id": "job_x9y8z7w6",
  "status": "completed",
  "exit_code": 0,
  "stdout": "3.12.0\n",
  "stderr": "",
  "duration_ms": 1247
}
```

**GET /resources**
```http
GET /resources HTTP/1.1
Authorization: Bearer <key>

HTTP/1.1 200 OK
{
  "memory": { "total_mb": 512, "used_mb": 216, "pct": 42.3 },
  "disk": { "total_mb": 10240, "used_mb": 1600, "pct": 15.6 },
  "load_avg": [0.42, 0.38, 0.35],
  "status": "ok",
  "sessions_active": 3,
  "jobs_running": 1
}
```

---

## 11. Error Handling

### 11.1 Error Response Format

```json
{
  "error": "error_code",
  "message": "Human-readable description",
  "details": {}
}
```

### 11.2 Error Codes

| Code | HTTP Status | When |
|---|---|---|
| unauthorized | 401 | Missing or invalid API key |
| not_found | 404 | Session or job ID does not exist |
| conflict | 409 | Session is not active / job already running |
| rate_limited | 429 | Too many requests per window |
| throttled | 503 | Resource manager in throttle mode |
| bad_request | 400 | Invalid body, missing fields, unknown language |
| timeout | 408 | Job exceeded timeout_sec |
| internal_error | 500 | Unexpected failure (logged with stack trace) |

### 11.3 Graceful Shutdown

```
SIGTERM received:
|
|-- 1. Stop accepting new HTTP connections (server.close())
|-- 2. Wait up to 10s for in-flight requests to complete
|-- 3. For each active session:
|     Send SIGTERM to pty process
|     Wait up to 5s, then SIGKILL
|-- 4. For each running job:
|     Send SIGTERM to job process
|     Wait up to 5s, then SIGKILL
|-- 5. Flush all log streams to disk
|-- 6. Write final audit log entry
|-- 7. Exit process(0)
```

---

## 12. Security Architecture

### 12.1 Threat Model

| Threat | Mitigation |
|---|---|
| Arbitrary code execution | Bearer token auth on all mutating endpoints |
| Privilege escalation | All execution as uid 1000 (runner), no root |
| Resource exhaustion | cgroups + ulimits + ResourceManager thresholds |
| Session escape | Separate cwd, no shared namespaces, chroot optional |
| Network exfiltration | Optional bwrap --unshare-net or iptables |
| Disk fill | RLIMIT_FSIZE + disk monitoring + cleanup |
| Log injection | Append-only logs, no user-controlled log format |
| Timing attacks | Constant-time API key comparison |
| DoS via large payloads | Body size limit (1MB), command size limit (64KB) |

### 12.2 Filesystem Permissions

```
/app/                   root:root   755  (API server code, read-only to runner)
/app/data/              root:root   755
/app/data/packages.json root:root   644
/workspace/             runner:runner 755
/workspace/sessions/    runner:runner 755
/workspace/jobs/        runner:runner 755
/workspace/logs/        runner:runner 755
```

Runner CANNOT write to /app/. Sessions and jobs cannot access each other's directories.

### 12.3 Network Isolation (Optional)

```
Option A: bwrap (preferred)
  bwrap --unshare-net --dir /workspace/sessions/{id} -- /bin/bash

Option B: iptables
  iptables -A OUTPUT -m owner --uid-owner runner -d 127.0.0.0/8 -j ACCEPT
  iptables -A OUTPUT -m owner --uid-owner runner -j DROP

Option C: Allow all (default for simplicity)
  No network restrictions. Runner can reach external hosts.
```

---

## 13. Monitoring and Observability

### 13.1 Audit Log

Every state-changing action is logged to /app/data/audit.log:

```
2026-07-24T12:00:00Z INFO  session_create sess_a1b2c3d4 key=abc***123
2026-07-24T12:00:15Z INFO  session_exec sess_a1b2c3d4 cmd="ls -la" exit=0
2026-07-24T12:30:00Z INFO  session_expired sess_a1b2c3d4 reason=idle_timeout
2026-07-24T12:31:00Z INFO  package_install pandas pip size_kb=45000
2026-07-24T13:00:00Z INFO  cleanup_run removed=2 freed_kb=67000
```

### 13.2 Health Response

```json
{
  "status": "ok",
  "uptime_sec": 12345,
  "sessions_active": 3,
  "sessions_total_created": 47,
  "jobs_running": 1,
  "jobs_total_completed": 112,
  "mem_pct": 42.3,
  "disk_pct": 15.6
}
```

### 13.3 Metrics (Future)

- Prometheus endpoint at /metrics (optional, not in v1)
- Key metrics: session count, job count, p50/p95 exec latency, memory usage, cleanup frequency

---

## 14. Configuration Reference

All via Render environment variables:

| Variable | Default | Description |
|---|---|---|
| API_KEY | (required) | Bearer token for authentication |
| PORT | 3000 | HTTP listen port (Render sets automatically) |
| IDLE_SESSION_TIMEOUT_MIN | 30 | Minutes before idle session is killed |
| EXEC_TIMEOUT_SEC | 30 | Max seconds per exec command |
| JOB_TIMEOUT_SEC | 300 | Max seconds per job |
| MAX_OUTPUT_BYTES | 1048576 | Max bytes returned per exec (1MB) |
| CLEANUP_INTERVAL_MIN | 60 | Minutes between package cleanup runs |
| CLEANUP_TTL_HOURS | 6 | Hours before unused package is removed |
| SESSION_CREATE_RATE | 10 | Max session creates per minute |
| JOB_SUBMIT_RATE | 20 | Max job submits per minute |
| EXEC_RATE | 100 | Max exec calls per minute per session |
| MEMORY_LIMIT_MB | 440 | Container memory limit for cgroups |
| CPU_LIMIT_PCT | 80 | CPU quota percentage |
| DISK_LIMIT_MB | 9000 | Disk usage hard cap |
| ENABLE_BWRAP | false | Use bubblewrap for network isolation |

---

## 15. Build and Deployment

### 15.1 Dockerfile (Final)

```dockerfile
FROM ubuntu:24.04

# System packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget git ca-certificates unzip tar gnupg \
    build-essential python3 python3-pip python3-venv php-cli \
    sudo bubblewrap \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create runner user
RUN useradd -m -s /bin/bash runner

# Setup sudoers for runner (apt-get only)
RUN echo 'runner ALL=(root) NOPASSWD: /usr/bin/apt-get install -y *' > /etc/sudoers.d/nexuss-runner && \
    echo 'runner ALL=(root) NOPASSWD: /usr/bin/apt-get remove -y *' >> /etc/sudoers.d/nexuss-runner && \
    echo 'runner ALL=(root) NOPASSWD: /usr/bin/apt-get update' >> /etc/sudoers.d/nexuss-runner && \
    chmod 0440 /etc/sudoers.d/nexuss-runner

# Setup app
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

# Create workspace
RUN mkdir -p /workspace/sessions /workspace/jobs /workspace/logs && \
    chown -R runner:runner /workspace

# Runtime dirs
RUN mkdir -p /app/data && touch /app/data/packages.json && \
    chown root:root /app/data/packages.json

EXPOSE 3000

USER root
ENTRYPOINT ["node", "server.js"]
```

### 15.2 render.yaml

```yaml
services:
  - type: web
    name: nexuss-bash
    env: docker
    plan: starter
    healthCheckPath: /health
    healthCheckPolicy: soft
    envVars:
      - key: API_KEY
        sync: false
      - key: IDLE_SESSION_TIMEOUT_MIN
        value: "30"
      - key: CLEANUP_INTERVAL_MIN
        value: "60"
      - key: MEMORY_LIMIT_MB
        value: "440"
```

### 15.3 External Keepalive (GitHub Actions)

```yaml
name: keepalive
on:
  schedule:
    - cron: "*/14 * * * *"
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -sf https://nexuss-bash.onrender.com/health
```

---

## 16. File Structure

```
nexuss-bash/
|-- Dockerfile
|-- render.yaml
|-- package.json
|-- server.js                      # Express bootstrap + graceful shutdown
|-- src/
|   |-- config.js                  # Env var loading + defaults
|   |-- middleware/
|   |   |-- auth.js                # Bearer token validation
|   |   |-- rateLimiter.js         # Per-key sliding window
|   |   |-- errorHandler.js        # Global error handler
|   |   +-- auditLog.js            # Request logging middleware
|   |-- routes/
|   |   |-- sessions.js            # POST/GET/DELETE /sessions, POST /sessions/:id/exec
|   |   |-- jobs.js                # POST /jobs, GET /jobs/:id
|   |   |-- packages.js            # POST/GET/DELETE /packages
|   |   |-- resources.js           # GET /resources
|   |   +-- health.js              # GET /health
|   |-- core/
|   |   |-- sessionManager.js      # Session map, create/close/exec/idle sweep
|   |   |-- jobExecutor.js         # Job map, submit/poll/cleanup
|   |   |-- resourceManager.js     # /proc polling, threshold detection
|   |   +-- packageManager.js      # Manifest CRUD, install, cleanup cron
|   |-- sandbox/
|   |   |-- processLauncher.js     # fork + cgroup + ulimit + capture
|   |   +-- isolation.js           # cgroup create/destroy, bwrap helpers
|   +-- utils/
|       |-- id.js                  # sess_ / job_ ID generation
|       +-- logger.js              # Structured logging (console + audit file)
|-- data/
|   +-- packages.json              # Runtime package manifest (gitignored)
+-- workspace/                     # Created at boot (gitignored)
    |-- sessions/
    |-- jobs/
    +-- logs/
```
