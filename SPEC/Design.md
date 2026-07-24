# Nexuss Bash — Design Document

**Version:** 1.0
**Type:** Containerized remote execution / dev-sandbox service
**Target platform:** Render (Docker Web Service)

---

## 1. Overview

Nexuss Bash is a self-hosted, container-based remote execution service. It ships as a single Docker image deployed on Render, boots an Ubuntu environment with a minimal developer toolchain, and exposes an HTTP API that lets a remote client:

- create and manage long-lived **sessions** (interactive shells with history/logs),
- submit one-off **jobs** ("packages") to execute and get results back,
- install extra tooling on demand,
- monitor and cap resource usage,
- automatically clean up anything non-essential when it's stale or resources run low.

Because Render does not give a container access to the host's Docker daemon (no Docker-in-Docker, no privileged mode on standard plans), "sessions" are **not** nested containers. They are OS-level isolated processes (pty-backed shells) running inside the one deployed container, isolated from each other with Linux primitives (unprivileged user, cgroups v2, ulimits, and optionally bubblewrap/firejail for filesystem/network isolation). This is called out explicitly because it changes the security model — see §6.

---

## 2. High-Level Architecture

```
                         ┌───────────────────────────────┐
                         │        External Keepalive      │
                         │  (GitHub Action / cron-job.org)│
                         │   hits GET /health every 14m   │
                         └───────────────┬─────────────────┘
                                         │
 Remote Client ───HTTPS/API Key──────────▼───────────────────────────────┐
                                                                          │
                    ┌─────────────────────────────────────────────────┐  │
                    │              Nexuss Bash Container               │  │
                    │  (single Render Docker Web Service)               │  │
                    │                                                    │
                    │  ┌───────────────┐   ┌────────────────────────┐   │
                    │  │  API Gateway  │──▶│   Auth / Rate Limiter  │   │
                    │  └───────┬───────┘   └────────────────────────┘   │
                    │          │                                        │
                    │  ┌───────▼────────┐  ┌────────────────────────┐   │
                    │  │ Session Manager│  │      Job Executor      │   │
                    │  │ (pty per       │  │ (stateless script /    │   │
                    │  │  session)      │  │  archive execution)    │   │
                    │  └───────┬────────┘  └───────────┬────────────┘   │
                    │          │                        │                │
                    │  ┌───────▼────────────────────────▼────────────┐  │
                    │  │           Sandbox / Isolation Layer          │  │
                    │  │  non-root user, cgroups v2, ulimits, bwrap   │  │
                    │  └───────┬───────────────────────────────────────┘  │
                    │          │                                        │
                    │  ┌───────▼───────┐  ┌───────────────┐  ┌────────┐ │
                    │  │ Package Mgr   │  │ Resource Mgr  │  │  Log/  │ │
                    │  │ + Cleanup Job │  │ (RAM/disk/CPU)│  │ Store  │ │
                    │  └───────────────┘  └───────────────┘  └────────┘ │
                    └─────────────────────────────────────────────────┘
```

---

## 3. Base Image & Bootstrap

**Base:** `ubuntu:24.04`

**Installed at build time (baseline / "built-in" — never auto-removed):**
- `curl`, `wget`, `git`, `ca-certificates`, `unzip`, `tar`, `gnupg`
- `build-essential` (minimal compiler toolchain)
- `python3`, `python3-pip`, `python3-venv`
- `nodejs` + `npm` (LTS, via nodesource)
- `php-cli` (minimal, no extensions bundle beyond core)
- A non-root user `runner` (uid 1000) that all sessions/jobs execute as
- `nexuss-agent` — the API server binary/entrypoint itself

Everything else (extra apt packages, pip/npm/composer packages, extra language runtimes) is installed **at runtime**, tracked in a manifest, and subject to cleanup.

**Dockerfile skeleton:**

```dockerfile
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget git ca-certificates unzip tar gnupg build-essential \
    python3 python3-pip python3-venv php-cli \
    && curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash runner
WORKDIR /app
COPY . /app
RUN npm install --omit=dev

USER root
ENTRYPOINT ["node", "server.js"]
```

(Entrypoint stays root only to manage cgroups/process supervision; actual command execution always drops privileges to `runner`.)

---

## 4. Core Components

### 4.1 API Server

Recommended stack: **Node.js + Express + `node-pty`** (best pty/session ergonomics, single language for API + process management). A FastAPI/Python equivalent is architecturally identical if preferred — swap `node-pty` for Python's `pty` module + `psutil` for resource stats.

All endpoints except `/health` require a bearer token (`Authorization: Bearer <API_KEY>`), configured via Render environment variable.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/sessions` | Create a new session, returns `session_id` |
| `GET` | `/sessions` | List active sessions |
| `GET` | `/sessions/:id` | Session metadata/status |
| `GET` | `/sessions/:id/logs` | Fetch full or tailed log (`?tail=200`) |
| `POST` | `/sessions/:id/exec` | Send a command into the session's shell |
| `DELETE` | `/sessions/:id` | Kill/close a session |
| `POST` | `/jobs` | Submit a one-off script/archive ("package") to run |
| `GET` | `/jobs/:id` | Poll job status + result |
| `POST` | `/packages/install` | Install an apt/pip/npm/composer package at runtime |
| `GET` | `/packages` | List runtime-installed (non-built-in) packages |
| `DELETE` | `/packages/:name` | Manually remove a runtime package |
| `GET` | `/resources` | Current RAM/disk/CPU usage + limits |
| `GET` | `/health` | Lightweight liveness + summary status |

### 4.2 Session Manager

- A session = one `bash` process spawned in a pty (`node-pty`), with its own working directory `/workspace/sessions/{id}`, its own env, and a persistent append-only log file `/workspace/logs/{id}.log`.
- `POST /sessions/:id/exec` writes the command to the pty's stdin; stdout/stderr is captured, appended to the log, and returned in the response (buffered up to a configurable timeout, since a pty session is interactive/stateful rather than one-shot).
- Session states: `creating → active → idle → killed | expired`.
- Idle sessions (no `exec` calls for a configurable window, e.g. 30 min) are automatically closed to free resources — this is independent from Render's platform-level 15-minute spin-down.
- Logs are fetchable at any time, even after the session ends, until log retention expires.

**Example:**

```http
POST /sessions
→ { "session_id": "sess_8f2a", "status": "active", "created_at": "..." }

POST /sessions/sess_8f2a/exec
{ "command": "python3 script.py" }
→ { "stdout": "...", "stderr": "", "exit_code": 0 }

GET /sessions/sess_8f2a/logs?tail=50
→ { "log": "...last 50 lines..." }
```

### 4.3 Job Executor ("packages" submitted for one-shot execution)

Distinct from sessions: a **job** is stateless — the remote caller sends code/an archive, it runs once in an isolated temp sandbox, and the result is handed back (either synchronously if fast, or via polling/webhook if long-running).

```http
POST /jobs
{
  "language": "python3",
  "code": "print('hello')",
  "timeout_sec": 30,
  "limits": { "memory_mb": 256, "cpu_pct": 50 }
}
→ { "job_id": "job_113a", "status": "queued" }

GET /jobs/job_113a
→ {
    "status": "completed",
    "exit_code": 0,
    "stdout": "hello\n",
    "stderr": "",
    "duration_ms": 42
  }
```

Job lifecycle: `queued → running → completed | failed | timed_out`. Each job runs in a throwaway directory under `/workspace/jobs/{job_id}` that is deleted immediately after completion (only logs/result metadata persist).

### 4.4 Resource Manager

- Polls `/proc/meminfo`, `df` on `/workspace`, and load average on an interval (e.g. every 5s), cached and exposed via `GET /resources`.
- Enforces three thresholds:
  - **Soft (≈70%)** — new sessions/jobs still accepted, warning flag returned in responses.
  - **Throttle (≈85%)** — new session/job creation queued or rejected with `503 Retry-After`.
  - **Hard (≈95%)** — active cleanup triggered immediately (see 4.5), non-essential sessions may be force-closed oldest-idle-first.
- Per-session/job caps enforced via cgroups v2 (`memory.max`, `cpu.max`) where the container runtime allows it, falling back to `ulimit`/`setrlimit` if cgroups aren't delegated to the container.

### 4.5 Package Manager & Cleanup

- A manifest file `/app/data/packages.json` tracks every runtime-installed package: `{ name, manager, installed_at, size_kb, protected }`. Baseline/Dockerfile packages are marked `protected: true` and are never touched.
- `POST /packages/install` supports `apt`, `pip`, `npm`, and `composer`, runs the install as `runner` (with `sudo` restricted to only the apt-install command via a locked-down sudoers entry), and records the manifest entry.
- **Cleanup job** runs on a schedule (e.g. every hour) and:
  - removes any non-protected package unused for longer than a configurable TTL (default 6h),
  - runs immediately, out-of-cycle, if the Resource Manager reports the hard threshold.
- Cleanup never touches session workspaces that belong to a currently `active` session.

### 4.6 Health Check & Keep-Alive

- `GET /health` is intentionally cheap: process-alive check + last-cached resource snapshot (no live disk/RAM scan on every call).
- Response: `{ "status": "ok", "uptime_sec": 12345, "sessions_active": 3, "mem_pct": 42 }`
- **External keepalive:** since Render's free/starter instances spin down after 15 minutes of inactivity, a scheduled job *outside* the Render service (GitHub Actions scheduled workflow, or a free pinger like cron-job.org) calls `GET /health` every **14 minutes**.

Example GitHub Actions workflow:

```yaml
name: keepalive
on:
  schedule:
    - cron: "*/14 * * * *"
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -f https://<your-app>.onrender.com/health
```

---

## 5. Data Models

```
Session {
  id, status, created_at, last_active_at,
  cwd, env: {...}, pid
}

Job {
  id, status, language, submitted_at, started_at, finished_at,
  exit_code, stdout, stderr, duration_ms
}

PackageManifestEntry {
  name, manager, installed_at, size_kb, protected: bool
}
```

---

## 6. Security Model (read before deploying)

This service executes arbitrary remote commands — treat it with the same caution as any code-execution sandbox:

- **Auth:** every state-changing endpoint requires a bearer API key; rotate it periodically; never log it.
- **Rate limiting:** per-key limits on session creation and job submission to prevent resource exhaustion.
- **Privilege drop:** all commands/jobs run as the unprivileged `runner` user, never root. No passwordless `sudo` except a narrowly scoped entry for package installs if you choose to allow that.
- **No nested containers:** don't attempt Docker-in-Docker — Render doesn't expose the host socket, and even if it did, it would defeat the isolation model. Isolation here comes from cgroups/ulimits/bubblewrap, not nested containers.
- **Timeouts everywhere:** every session command and every job has a hard wall-clock timeout to prevent runaway processes.
- **Filesystem scoping:** sessions and jobs are confined to their own subdirectory; no access to `/app` (the API server's own code) or other sessions' directories.
- **Network egress:** decide explicitly whether sandboxed code may reach the internet. If not required, restrict egress (e.g., via `iptables`/network namespace rules or a proxy allow-list).
- **Audit logging:** every command, job, and package install is logged with timestamp and (if applicable) API key identity, independent of the session/job's own log.

---

## 7. Deployment on Render

- **Service type:** Docker Web Service (not a Background Worker, since it needs an HTTP endpoint).
- **render.yaml** highlights:

```yaml
services:
  - type: web
    name: nexuss-bash
    env: docker
    plan: starter
    healthCheckPath: /health
    envVars:
      - key: API_KEY
        sync: false
      - key: IDLE_SESSION_TIMEOUT_MIN
        value: "30"
      - key: CLEANUP_INTERVAL_MIN
        value: "60"
```

- **Persistent disk:** Render's default disk is ephemeral across deploys/restarts. If session logs/workspaces must survive restarts, attach a Render Persistent Disk, or ship logs to external storage (S3-compatible bucket) on session close.
- **Keepalive:** configure the external cron described in §4.6 pointing at your Render URL.

---

## 8. Suggested Repo Structure

```
nexuss-bash/
├── Dockerfile
├── render.yaml
├── server.js                 # API entrypoint
├── src/
│   ├── routes/
│   │   ├── sessions.js
│   │   ├── jobs.js
│   │   ├── packages.js
│   │   └── health.js
│   ├── core/
│   │   ├── sessionManager.js
│   │   ├── jobExecutor.js
│   │   ├── resourceManager.js
│   │   └── packageManager.js
│   ├── sandbox/
│   │   └── isolation.js      # cgroups/ulimit/bwrap helpers
│   └── auth/
│       └── apiKey.js
├── data/
│   └── packages.json         # runtime package manifest (gitignored)
└── workspace/                # sessions/ and jobs/ live here at runtime
```

---

## 9. Roadmap / Future Enhancements

- Webhook callbacks on job completion (avoid polling).
- Per-API-key quotas (separate from global resource limits) for multi-tenant use.
- Optional persistent object storage integration for logs (S3/R2) to survive ephemeral disk resets.
- WebSocket-based `/sessions/:id/stream` for true real-time interactive shells instead of buffered `exec`.
- Language-runtime presets (e.g. a `POST /packages/preset` that installs a common bundle like "python-datascience" in one call).
