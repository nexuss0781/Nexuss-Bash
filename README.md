<div align="center">

# ⚡ Nexuss Bash

**Containerized Remote Execution & Dev Sandbox Service**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-24.04-blue?logo=docker)](Dockerfile)
[![Node](https://img.shields.io/badge/node-20 LTS-green?logo=node.js)](package.json)

*One-liner command execution, YAML pipelines, file uploads, and runtime package management — all through a clean REST API.*

[Getting Started](#-quick-start) · [API Reference](#-api-reference) · [Architecture](#-architecture)

</div>

---

## What is Nexuss Bash?

Nexuss Bash is a **lightweight, secure remote execution platform** that runs inside a single Docker container:

- **Command Runner** — Send a list of commands, get results back. Manager handles everything.
- **YAML Pipelines** — Define multi-step workflows with dependencies and parallel steps
- **PTY Sessions** — Interactive bash shells with command history and logs
- **Multi-Language Jobs** — Execute Python, Node.js, Bash, or PHP scripts
- **File Upload** — Upload files and execute them remotely
- **Package Management** — Install apt/pip/npm/composer packages at runtime
- **Resource Monitoring** — Real-time RAM/disk/CPU tracking with auto-throttling
- **Secure Isolation** — Unprivileged user, cgroup limits, constant-time auth

---

## Quick Start

```bash
# Build and run
docker build -t nexuss-bash .
docker run -d -p 3000:3000 -e API_KEY="your-key" nexuss-bash

# Send commands, get results — one call
curl -X POST http://localhost:3000/run \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{"commands":["echo Hello","whoami","ls /workspace"]}'
```

---

## API Reference

**Base URL:** `https://nexuss-bash.onrender.com`

**Auth:** `Authorization: Bearer <API_KEY>`

**Response Envelope:**
- Success: `{ "data": { ... } }` or `{ "data": [...], "total": N }`
- Error: `{ "error": { "code": "...", "message": "...", "details": {} } }`

### Endpoints (28)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (no auth) |
| `GET` | `/system` | Full system state |
| **`POST`** | **`/run`** | **Send commands → execute → get results** |
| `GET` | `/run` | List past runs |
| `GET` | `/run/:id` | Get run details |
| `POST` | `/sessions` | Create shell session |
| `GET` | `/sessions` | List sessions |
| `GET` | `/sessions/:id` | Get session details |
| `GET` | `/sessions/:id/logs` | Get session logs |
| `POST` | `/sessions/:id/exec` | Execute command |
| `DELETE` | `/sessions/:id` | Kill session |
| `POST` | `/jobs` | Submit code job |
| `GET` | `/jobs` | List jobs |
| `GET` | `/jobs/:id` | Get job status |
| `POST` | `/files/upload` | Upload file |
| `GET` | `/files` | List files |
| `GET` | `/files/:id` | Get file metadata |
| `GET` | `/files/:id/download` | Download file |
| `DELETE` | `/files/:id` | Delete file |
| `POST` | `/pipelines/run` | Upload YAML pipeline → execute → results |
| `POST` | `/pipelines` | Submit pipeline (async) |
| `GET` | `/pipelines` | List pipelines |
| `GET` | `/pipelines/:id` | Get pipeline status |
| `DELETE` | `/pipelines/:id` | Cancel pipeline |
| `POST` | `/packages/install` | Install package |
| `GET` | `/packages` | List packages |
| `DELETE` | `/packages/:name` | Remove package |
| `GET` | `/resources` | Resource usage |

---

## Command Runner (`POST /run`)

The primary interface. Send a list of commands, the manager runs them one by one, monitors each for completion, and returns all results.

### How It Works

```
Your commands → Manager spawns process → waits for exit → records result → next command
                                                              ↑
                                                     timeout is safety net only
```

Each command runs to completion. The manager doesn't guess time — it **listens** for the process to finish.

### JSON — inline commands

```bash
curl -X POST http://localhost:3000/run \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{"commands":["echo Hello","whoami","python3 -c \"print(2+2)\""]}'
```

### YAML file upload

```bash
curl -X POST http://localhost:3000/run \
  -H "Authorization: Bearer your-key" \
  -F "file=@commands.yaml"
```

### YAML format

```yaml
commands:
  - "apt-get update -qq && apt-get install -y git"
  - "git clone https://github.com/user/repo.git /workspace/repo"
  - "node /workspace/repo/index.js"
```

### Command options

Each command can be a string or an object with options:

```yaml
commands:
  # Simple string — runs as-is
  - "echo Hello"

  # Object — full control
  - name: install_deps
    command: "apt-get update -qq && apt-get install -y git"
    timeout: 120
    stop_on_fail: true

  - name: clone
    command: "git clone https://github.com/user/repo.git /workspace/repo"

  - name: run
    command: "node /workspace/repo/index.js"
```

### Command options table

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | `step_N` | Label for this command (shown in results) |
| `command` | string | (required) | Shell command to execute |
| `timeout` | int (sec) | 300 | Safety net — kill if hung (commands normally exit on their own) |
| `stop_on_fail` | bool | `false` | If `true`, halt the chain when this command fails. Remaining commands are skipped. |

### Stop on fail

By default, the manager continues to the next command even if one fails. Set `stop_on_fail: true` to halt the chain:

```yaml
commands:
  - name: build
    command: "make build"
    stop_on_fail: true

  - name: test
    command: "make test"
    stop_on_fail: true

  - name: deploy
    command: "make deploy"
```

If `build` fails → `test` and `deploy` are skipped. If `build` passes but `test` fails → `deploy` is skipped.

### Response format

```json
{
  "data": {
    "id": "run_1784973527967_7u7raa",
    "status": "completed",
    "submitted_at": "2026-07-25T04:08:15.793Z",
    "started_at": "2026-07-25T04:08:15.793Z",
    "finished_at": "2026-07-25T04:08:16.408Z",
    "total_duration_ms": 615,
    "progress": "3/3",
    "results": [
      {
        "id": 1,
        "name": "step_1",
        "command": "echo Hello",
        "status": "completed",
        "exit_code": 0,
        "duration_ms": 51,
        "stdout": "Hello\n",
        "stderr": "",
        "timed_out": false
      },
      {
        "id": 2,
        "name": "step_2",
        "command": "exit 1",
        "status": "failed",
        "exit_code": 1,
        "duration_ms": 7,
        "stdout": "",
        "stderr": "",
        "timed_out": false
      },
      {
        "id": 3,
        "name": "step_3",
        "command": "echo done",
        "status": "skipped",
        "exit_code": null,
        "duration_ms": 0,
        "stdout": "",
        "stderr": "Skipped: previous step failed (stop_on_fail)",
        "timed_out": false
      }
    ]
  }
}
```

---

## Pipelines (`POST /pipelines/run`)

For complex workflows with dependencies, parallel steps, and multi-language support:

```yaml
name: "Deploy Pipeline"
steps:
  - id: build
    language: python3
    code: |
      import subprocess
      subprocess.run(["pip", "install", "--break-system-packages", "pandas"])

  - id: test
    language: python3
    code: "import pandas; print(pandas.__version__)"
    depends_on: build

  - id: notify
    language: bash
    command: "echo 'Pipeline complete'"
    always_run: true
```

**Step options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | string | (required) | Unique step identifier |
| `command` | string | null | Shell command |
| `code` | string | null | Code for language runtime |
| `language` | string | `bash` | `bash`, `python3`, `node`, `php` |
| `root` | bool | false | Run as root (for apt, system installs) |
| `timeout` | int | 30 | Max seconds |
| `depends_on` | array | [] | Required prior steps |
| `continue_on_error` | bool | false | Don't fail pipeline on error |
| `always_run` | bool | false | Run even if prior steps failed |

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `API_KEY` | **(required)** | Auth token |
| `PORT` | `3000` | Listen port |
| `IDLE_SESSION_TIMEOUT_MIN` | `30` | Session idle timeout |
| `EXEC_TIMEOUT_SEC` | `30` | Command timeout |
| `JOB_TIMEOUT_SEC` | `300` | Job timeout |
| `MAX_OUTPUT_BYTES` | `1048576` | Max output (1MB) |
| `MAX_UPLOAD_MB` | `10` | Max upload size |
| `MAX_PIPELINE_STEPS` | `20` | Max pipeline steps |
| `SESSION_CREATE_RATE` | `10` | Creates/min |
| `JOB_SUBMIT_RATE` | `20` | Submits/min |
| `PACKAGE_INSTALL_RATE` | `5` | Installs/min |
| `MEMORY_LIMIT_MB` | `440` | Memory limit |
| `CPU_LIMIT_PCT` | `80` | CPU limit |
| `ENABLE_BWRAP` | `false` | Bubblewrap isolation |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Nexuss Bash (Docker)                │
│                                                  │
│  Auth → Rate Limit → Audit → Router             │
│                            │                     │
│  ┌──────────┬──────────┬───┴───┬──────────┐     │
│  │ Sessions │ Jobs     │ Files │ Pipelines │     │
│  │ (PTY)    │ (exec)   │(upload)│  (YAML)  │     │
│  └────┬─────┴────┬─────┴───────┴────┬──────┘     │
│       │          │                   │            │
│  ┌────▼──────────▼───────────────────▼──────┐    │
│  │      SequentialExecutor (Task Manager)   │    │
│  │      spawn → wait exit → next command    │    │
│  ├──────────────────────────────────────────┤    │
│  │         ProcessLauncher (uid 1000)       │    │
│  │         cgroups v2 + ulimit              │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ResourceManager ← /proc polling (5s)           │
│  PackageManager  ← manifest + cleanup cron       │
└─────────────────────────────────────────────────┘
```

### Core Components

| Component | Purpose |
|-----------|---------|
| **SequentialExecutor** | Command chain manager — monitors process exit, controls flow |
| **PipelineExecutor** | DAG-based pipeline orchestration with dependencies |
| **SessionManager** | PTY shell lifecycle, idle sweep |
| **JobExecutor** | Multi-language code execution |
| **ResourceManager** | RAM/disk/CPU monitoring |
| **PackageManager** | Runtime package installs |
| **ProcessLauncher** | Isolated process spawning |

---

## Project Structure

```
nexuss-bash/
├ Dockerfile
├ server.js
├ package.json
├ src/
│  ├── config.js
│  ├── utils/
│  │  ├── logger.js
│  │  └── id.js
│  ├── middleware/
│  │  ├── auth.js
│  │  ├── rateLimiter.js
│  │  ├── errorHandler.js
│  │  └── auditLog.js
│  ├── routes/
│  │  ├── health.js
│  │  ├── system.js
│  │  ├── run.js              # POST /run — command runner
│  │  ├── sessions.js
│  │  ├── jobs.js
│  │  ├── files.js
│  │  ├── pipelines.js
│  │  ├── packages.js
│  │  └── resources.js
│  ├── core/
│  │  ├── sequentialExecutor.js  # Task manager
│  │  ├── pipelineExecutor.js
│  │  ├── sessionManager.js
│  │  ├── jobExecutor.js
│  │  ├── resourceManager.js
│  │  └── packageManager.js
│  └── sandbox/
│     ├── isolation.js
│     └── processLauncher.js
├ tests/
│  └── e2e.sh
├ examples/
│  ├── hello-world.yaml
│  └── clone-and-run.yaml
└ .github/workflows/
   └── e2e.yml
```

---

## Testing

```bash
# Run E2E tests against live server
API_URL=http://localhost:3000 API_KEY=your-key bash tests/e2e.sh
```

---

## License

MIT

---

<div align="center">

**Built with ❤️ by [Nexuss](https://github.com/nexuss0781)**

</div>
