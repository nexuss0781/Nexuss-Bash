<div align="center">

# ⚡ Nexuss Bash

**Containerized Remote Execution & Dev Sandbox Service**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-24.04-blue?logo=docker)](Dockerfile)
[![Node](https://img.shields.io/badge/node-20 LTS-green?logo=node.js)](package.json)
[![PyPI](https://img.shields.io/pypi/v/nexinal.svg)](https://pypi.org/project/nexinal/)

*One-liner command execution, YAML pipelines, file uploads, and runtime package management — all through a clean REST API, web dashboard, and CLI.*

[Web Dashboard](#web-dashboard) · [CLI](#cli-nexinal) · [API](#api-reference) · [Docs](#documentation)

</div>

---

## What is Nexuss Bash?

Nexuss Bash is a **lightweight, secure remote execution platform** that runs inside a single Docker container with three ways to use it:

- **CLI** — `nexinal run "echo hello"` — no curl needed
- **Web Dashboard** — Terminal, command runner, file upload in your browser
- **REST API** — 28 endpoints for full automation

Under the hood:
- **Command Runner** — Sequential task manager monitors each command's exit, controls flow
- **YAML Pipelines** — DAG-based workflows with dependencies and parallel steps
- **PTY Sessions** — Interactive bash shells with command history and logs
- **Multi-Language Jobs** — Execute Python, Node.js, Bash, or PHP scripts
- **Package Management** — Install apt/pip/npm/composer packages at runtime
- **Resource Monitoring** — Real-time RAM/disk/CPU tracking with auto-throttling

---

## CLI (`nexinal`)

No curl. No scripts. Just commands.

### Install

```bash
pip install nexinal
```

### Authenticate

```bash
nexinal auth your-api-key
```

### Run commands

```bash
# Single command
nexinal run "echo Hello"

# Multiple commands — sequential, each waits for the previous
nexinal run "apt-get update -qq" "apt-get install -y git" "git clone https://github.com/user/repo.git"

# From a YAML file
nexinal execute pipeline.yaml
```

### All commands

| Command | Description |
|---------|-------------|
| `nexinal auth <token>` | Authenticate and save token |
| `nexinal run <commands...>` | Run commands sequentially |
| `nexinal execute <file.yaml>` | Execute commands from YAML file |
| `nexinal health` | Quick health check |
| `nexinal status` | Connection info and token status |
| `nexinal history` | List past runs |
| `nexinal sessions` | List active sessions |
| `nexinal packages list` | List installed packages |
| `nexinal packages install <name>` | Install a package |
| `nexinal config` | Show/set API URL |
| `nexinal logout` | Remove saved token |

### YAML file format

```yaml
commands:
  - name: install
    command: "apt-get update -qq && apt-get install -y git"
    timeout: 120
    stop_on_fail: true

  - name: clone
    command: "git clone https://github.com/user/repo.git /workspace/repo"

  - name: run
    command: "node /workspace/repo/index.js"
```

---

## Web Dashboard

A Next.js frontend with dark mode, terminal access, and command runner.

### Setup

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

### Pages

| Page | Description |
|------|-------------|
| **Landing** | Hero, features, how-it-works, API example |
| **Dashboard** | Command runner, YAML upload, results display, history |
| **Terminal** | Interactive PTY shell via xterm.js |
| **Settings** | Token management, connection config |
| **Docs** | Full documentation with markdown rendering |

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

### Quick example

```bash
# Send commands, get results — one call
curl -X POST https://nexuss-bash.onrender.com/run \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{"commands":["echo Hello","whoami","ls /workspace"]}'
```

### Command Runner (`POST /run`)

The primary interface. The manager runs commands sequentially, monitors each for completion, and returns all results.

```bash
# JSON — inline commands
curl -X POST http://localhost:3000/run \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{"commands":["echo Hello","whoami","python3 -c \"print(2+2)\""]}'

# YAML file upload
curl -X POST http://localhost:3000/run \
  -H "Authorization: Bearer your-key" \
  -F "file=@commands.yaml"
```

**Command options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | `step_N` | Label for results |
| `command` | string | (required) | Shell command |
| `timeout` | int (sec) | 300 | Safety net — kill if hung |
| `stop_on_fail` | bool | `false` | Halt chain on failure |

### Pipelines (`POST /pipelines/run`)

For complex workflows with dependencies, parallel steps, and multi-language support:

```yaml
name: "Deploy Pipeline"
steps:
  - id: build
    language: python3
    code: "import subprocess; subprocess.run(['pip', 'install', '--break-system-packages', 'pandas'])"

  - id: test
    language: python3
    code: "import pandas; print(pandas.__version__)"
    depends_on: build

  - id: notify
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
| `root` | bool | false | Run as root (apt, system installs) |
| `timeout` | int | 30 | Max seconds |
| `depends_on` | array | [] | Required prior steps |
| `continue_on_error` | bool | false | Don't fail pipeline on error |
| `always_run` | bool | false | Run even if prior steps failed |

---

## Documentation

Full documentation in [`Documentations/markdowns/`](Documentations/markdowns/):

| Document | Description |
|----------|-------------|
| [Getting Started](Documentations/markdowns/getting-started.md) | Installation, setup, first run |
| [Command Runner](Documentations/markdowns/command-runner.md) | `/run` endpoint, options, examples |
| [Pipelines](Documentations/markdowns/pipelines.md) | DAG workflows, dependencies, multi-language |
| [API Reference](Documentations/markdowns/api-reference.md) | All 28 endpoints, request/response formats |
| [CLI Guide](Documentations/markdowns/cli-guide.md) | nexinal installation, commands, YAML format |

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

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Nexuss Bash                            │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  CLI (nexinal) │  │ Web Dashboard│  │   REST API   │   │
│  │  pip install │  │  Next.js +   │  │  28 endpoints│   │
│  │              │  │  TypeScript  │  │              │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                  │            │
│         └─────────────────┼──────────────────┘            │
│                           │                               │
│  ┌────────────────────────▼───────────────────────────┐  │
│  │              Docker Container                       │  │
│  │                                                     │  │
│  │  Auth → Rate Limit → Audit → Router                │  │
│  │                            │                        │  │
│  │  ┌──────────┬──────────┬───┴───┬──────────┐        │  │
│  │  │ Sessions │ Jobs     │ Files │ Pipelines │        │  │
│  │  │ (PTY)    │ (exec)   │(upload)│  (YAML)  │        │  │
│  │  └────┬─────┴────┬─────┴───────┴────┬──────┘        │  │
│  │       │          │                   │               │  │
│  │  ┌────▼──────────▼───────────────────▼──────┐       │  │
│  │  │      SequentialExecutor (Task Manager)   │       │  │
│  │  │      spawn → wait exit → next command    │       │  │
│  │  ├──────────────────────────────────────────┤       │  │
│  │  │         ProcessLauncher (uid 1000)       │       │  │
│  │  │         cgroups v2 + ulimit              │       │  │
│  │  └──────────────────────────────────────────┘       │  │
│  │                                                     │  │
│  │  ResourceManager ← /proc polling (5s)              │  │
│  │  PackageManager  ← manifest + cleanup cron          │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
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
│   │   ├── run.js
│   │   ├── sessions.js
│   │   ├── jobs.js
│   │   ├── files.js
│   │   ├── pipelines.js
│   │   ├── packages.js
│   │   └── resources.js
│   ├── core/
│   │   ├── sequentialExecutor.js
│   │   ├── pipelineExecutor.js
│   │   ├── sessionManager.js
│   │   ├── jobExecutor.js
│   │   ├── resourceManager.js
│   │   └── packageManager.js
│   └── sandbox/
│       ├── isolation.js
│       └── processLauncher.js
├── cli/
│   ├── setup.py
│   ├── pyproject.toml
│   └── nexinal/
│       ├── cli.py
│       ├── api.py
│       ├── config.py
│       ├── runner.py
│       ├── display.py
│       └── yaml_parser.py
├── frontend/
│   ├── package.json
│   ├── tailwind.config.ts
│   └── src/
│       ├── app/
│       │   ├── page.tsx
│       │   ├── dashboard/page.tsx
│       │   ├── settings/page.tsx
│       │   └── docs/page.tsx
│       ├── components/
│       │   ├── Navbar.tsx
│       │   ├── AuthGuard.tsx
│       │   └── Terminal.tsx
│       └── lib/
│           ├── api.ts
│           └── auth-context.tsx
├── Documentations/
│   └── markdowns/
│       ├── getting-started.md
│       ├── command-runner.md
│       ├── pipelines.md
│       ├── api-reference.md
│       └── cli-guide.md
├── tests/
│   └── e2e.sh
└── examples/
    ├── hello-world.yaml
    └── clone-and-run.yaml
```

---

## Testing

```bash
# E2E tests against live server
API_URL=https://nexuss-bash.onrender.com API_KEY=your-key bash tests/e2e.sh
```

---

## License

MIT

---

<div align="center">

**Built with ❤️ by [Nexuss](https://github.com/nexuss0781)**

</div>
