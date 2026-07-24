<div align="center">

# ⚡ Nexuss Bash

**Containerized Remote Execution & Dev Sandbox Service**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-24.04-blue?logo=docker)](Dockerfile)
[![Node](https://img.shields.io/badge/node-20 LTS-green?logo=node.js)](package.json)

*Interactive shell sessions, one-shot code execution, file uploads, YAML pipelines, and runtime package management — all through a clean REST API.*

[Getting Started](#-quick-start) · [API Reference](#-api-reference) · [Architecture](#-architecture)

</div>

---

## What is Nexuss Bash?

Nexuss Bash is a **lightweight, secure remote execution platform** that runs inside a single Docker container:

- **PTY Sessions** — Interactive bash shells with command history and logs
- **Multi-Language Jobs** — Execute Python, Node.js, Bash, or PHP scripts
- **File Upload** — Upload files and execute them remotely
- **YAML Pipelines** — Define multi-step workflows in YAML, execute end-to-end
- **Package Management** — Install apt/pip/npm/composer packages at runtime
- **Resource Monitoring** — Real-time RAM/disk/CPU tracking with auto-throttling
- **Secure Isolation** — Unprivileged user, cgroup limits, constant-time auth

---

## Quick Start

```bash
# Build and run
docker build -t nexuss-bash .
docker run -d -p 3000:3000 -e API_KEY="your-key" nexuss-bash

# Health check
curl http://localhost:3000/health

# Submit a job
curl -X POST http://localhost:3000/jobs \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{"language":"python3","code":"print(2+2)"}'
```

---

## API Reference

**Base URL:** `https://nexuss-bash.onrender.com`

**Auth:** `Authorization: Bearer <API_KEY>`

**Response Envelope:**
- Success: `{ "data": { ... } }` or `{ "data": [...], "total": N }`
- Error: `{ "error": { "code": "...", "message": "...", "details": {} } }`

### Endpoints (24)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (no auth) |
| `GET` | `/system` | Full system state |
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
| `POST` | `/pipelines` | Submit YAML pipeline |
| `GET` | `/pipelines` | List pipelines |
| `GET` | `/pipelines/:id` | Get pipeline status |
| `DELETE` | `/pipelines/:id` | Cancel pipeline |
| `POST` | `/packages/install` | Install package |
| `GET` | `/packages` | List packages |
| `DELETE` | `/packages/:name` | Remove package |
| `GET` | `/resources` | Resource usage |

### Pipelines

Submit a YAML pipeline with ordered steps:

```yaml
name: "My Pipeline"
steps:
  - id: setup
    language: bash
    command: "pip install --break-system-packages pandas"
    timeout: 120

  - id: run
    language: python3
    code: "import pandas; print(pandas.__version__)"
    depends_on: setup

  - id: cleanup
    language: bash
    command: "echo done"
    always_run: true
```

```bash
curl -X POST http://localhost:3000/pipelines \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{"yaml": "name: test\nsteps:\n  - id: s1\n    command: echo hello"}'
```

### File Upload

```bash
curl -X POST http://localhost:3000/files/upload \
  -H "Authorization: Bearer your-key" \
  -F "file=@script.py"
```

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
│  │ (PTY)    │ (exec)   │ (upload)│ (YAML)  │     │
│  └────┬─────┴────┬─────┴───────┴────┬──────┘     │
│       │          │                   │            │
│  ┌────▼──────────▼───────────────────▼──────┐    │
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
| **SessionManager** | PTY shell lifecycle, idle sweep |
| **JobExecutor** | Multi-language code execution |
| **PipelineExecutor** | YAML pipeline orchestration |
| **ResourceManager** | RAM/disk/CPU monitoring |
| **PackageManager** | Runtime package installs |
| **ProcessLauncher** | Isolated process spawning |

---

## Project Structure

```
nexuss-bash/
├── Dockerfile
├── server.js
├── package.json
├── src/
│   ├── config.js
│   ├── utils/
│   │   ├── logger.js
│   │   └── id.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── rateLimiter.js
│   │   ├── errorHandler.js
│   │   └── auditLog.js
│   ├── routes/
│   │   ├── health.js
│   │   ├── system.js
│   │   ├── sessions.js
│   │   ├── jobs.js
│   │   ├── files.js
│   │   ├── pipelines.js
│   │   ├── packages.js
│   │   └── resources.js
│   ├── core/
│   │   ├── sessionManager.js
│   │   ├── jobExecutor.js
│   │   ├── pipelineExecutor.js
│   │   ├── resourceManager.js
│   │   └── packageManager.js
│   └── sandbox/
│       ├── isolation.js
│       └── processLauncher.js
├── tests/
│   └── e2e.sh              # 82 E2E tests
├── .github/workflows/
│   └── e2e.yml             # CI pipeline
└── SPEC/                   # Design docs
```

---

## Testing

```bash
# Run E2E tests against live server
API_URL=http://localhost:3000 API_KEY=your-key bash tests/e2e.sh
```

82 tests covering: health, sessions, jobs, files, pipelines, packages, resources, error formats, pagination.

---

## License

MIT

---

<div align="center">

**Built with ❤️ by [Nexuss](https://github.com/nexuss0781)**

</div>
