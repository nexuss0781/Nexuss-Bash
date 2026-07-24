<div align="center">

# ⚡ Nexuss Bash

**Containerized Remote Execution & Dev Sandbox Service**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-24.04-blue?logo=docker)](Dockerfile)
[![Node](https://img.shields.io/badge/node-20 LTS-green?logo=node.js)](package.json)
[![Render](https://img.shields.io/badge/render-deploy-purple?logo=render)](render.yaml)

*A self-hosted, container-based remote execution service that gives you interactive shell sessions, one-off code execution, and runtime package management — all through a clean REST API.*

[Getting Started](#-quick-start) · [API Reference](#-api-reference) · [Architecture](#-architecture)

</div>

---

## 🔥 What is Nexuss Bash?

Nexuss Bash is a **lightweight, secure remote execution platform** that runs inside a single Docker container. It provides:

- 🖥️ **Interactive Shell Sessions** — Long-lived bash sessions via PTY with command history and logs
- ⚡ **One-Shot Code Execution** — Submit Python, Node.js, Bash, or PHP scripts and get results instantly
- 📦 **Runtime Package Management** — Install apt/pip/npm/composer packages on demand with auto-cleanup
- 📊 **Resource Monitoring** — Real-time RAM, disk, and CPU tracking with automatic throttling
- 🔒 **Secure Isolation** — Every process runs as an unprivileged user with cgroup limits

**Perfect for:** Remote development environments, CI/CD runners, code playgrounds, educational platforms, and API-powered automation.

---

## 📋 Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Architecture](#-architecture)
- [API Reference](#-api-reference)
- [Configuration](#-configuration)
- [Security](#-security)
- [Development](#-development)
- [License](#-license)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🖥️ **PTY Sessions** | Interactive bash shells with xterm-256color support, persistent logs, and idle auto-expiry |
| ⚡ **Multi-Language Jobs** | Execute Python 3, Node.js, Bash, or PHP scripts with timeout and resource limits |
| 📦 **Package Manager** | Install/remove packages at runtime via apt, pip, npm, or composer |
| 📊 **Resource Manager** | Real-time monitoring with soft/throttle/hard thresholds and automatic cleanup |
| 🔒 **Security** | Unprivileged execution, cgroup isolation, constant-time auth, rate limiting |
| 📝 **Audit Logging** | Every action logged with timestamps for compliance and debugging |
| 🔄 **Auto-Cleanup** | Stale packages and idle sessions automatically removed |
| 🐳 **One Container** | Single Docker image, zero external dependencies |

---

## 🚀 Quick Start

### Prerequisites

- Docker installed locally (for testing)
- A Render account (for deployment)
- An API key (you'll set this as an environment variable)

### 1. Build & Run Locally

```bash
# Clone the repository
git clone https://github.com/nexuss0781/Nexuss-Bash.git
cd Nexuss-Bash

# Build the Docker image
docker build -t nexuss-bash .

# Run the container
docker run -d \
  -p 3000:3000 \
  -e API_KEY="your-secret-api-key" \
  --name nexuss-bash \
  nexuss-bash
```

### 2. Test the API

```bash
# Health check (no auth needed)
curl http://localhost:3000/health

# Create a session
curl -X POST http://localhost:3000/sessions \
  -H "Authorization: Bearer your-secret-api-key"

# Execute a command
curl -X POST http://localhost:3000/sessions/SESSION_ID/exec \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{"command": "echo Hello from Nexuss Bash!"}'

# Submit a Python job
curl -X POST http://localhost:3000/jobs \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "language": "python3",
    "code": "import sys; print(f\"Python {sys.version}\")"
  }'
```

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                   Render Docker Web Service                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   nexuss-agent (root)                      │  │
│  │                                                            │  │
│  │  ┌────────┐  ┌────────┐  ┌──────────┐  ┌──────────────┐  │  │
│  │  │  Auth  │─▶│ Router │─▶│ Rate     │─▶│  Controller  │  │  │
│  │  │ (mware)│  │(express)│  │ Limiter  │  │  (per-route) │  │  │
│  │  └────────┘  └────────┘  └──────────┘  └──────┬───────┘  │  │
│  │                                                 │          │  │
│  │  ┌──────────────────────────────────────────────▼───────┐  │  │
│  │  │                Core Services                         │  │  │
│  │  │  ┌────────────────┐     ┌────────────────┐           │  │  │
│  │  │  │ SessionManager │     │  JobExecutor   │           │  │  │
│  │  │  │  • pty spawn   │     │  - code exec   │           │  │  │
│  │  │  │  • cmd routing │     │  - timeout     │           │  │  │
│  │  │  │  • log tail    │     │  - result grab │           │  │  │
│  │  │  │  • idle expiry │     │                │           │  │  │
│  │  │  └───────┬────────┘     └───────┬────────┘           │  │  │
│  │  │          │                      │                    │  │  │
│  │  │  ┌───────▼──────────────────────▼─────────────────┐  │  │  │
│  │  │  │          ProcessLauncher (shared)               │  │  │  │
│  │  │  │  - fork/exec as runner (uid 1000)              │  │  │  │
│  │  │  │  - cgroup assignment (memory.max, cpu.max)     │  │  │  │
│  │  │  │  - namespace isolation (bwrap optional)        │  │  │  │
│  │  │  └────────────────────────────────────────────────┘  │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Core Components

| Component | Purpose |
|-----------|---------|
| **ProcessLauncher** | Spawns processes as unprivileged user with cgroup isolation |
| **SessionManager** | Manages interactive PTY bash sessions with logs |
| **JobExecutor** | Runs one-shot code submissions in isolated sandboxes |
| **ResourceManager** | Monitors RAM/disk/CPU and enforces thresholds |
| **PackageManager** | Handles runtime package installs with auto-cleanup |

---

## 📡 API Reference

### Authentication

All endpoints (except `/health`) require a Bearer token:

```
Authorization: Bearer <your-api-key>
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (no auth required) |
| `POST` | `/sessions` | Create a new shell session |
| `GET` | `/sessions` | List all active sessions |
| `GET` | `/sessions/:id` | Get session details |
| `GET` | `/sessions/:id/logs` | Fetch session logs (`?tail=50`) |
| `POST` | `/sessions/:id/exec` | Execute a command in session |
| `DELETE` | `/sessions/:id` | Close/kill a session |
| `POST` | `/jobs` | Submit a code execution job |
| `GET` | `/jobs/:id` | Poll job status and results |
| `POST` | `/packages/install` | Install a runtime package |
| `GET` | `/packages` | List installed packages |
| `DELETE` | `/packages/:name` | Remove a package |
| `GET` | `/resources` | Current resource usage |

### Examples

<details>
<summary><strong>🖥️ Create Session</strong></summary>

```bash
POST /sessions
Authorization: Bearer <key>

Response (201):
{
  "session_id": "sess_a1b2c3d4",
  "status": "active",
  "created_at": "2026-07-24T12:00:00Z"
}
```
</details>

<details>
<summary><strong>⚡ Execute Command</strong></summary>

```bash
POST /sessions/sess_a1b2c3d4/exec
Authorization: Bearer <key>
Content-Type: application/json

{
  "command": "python3 -c 'print(2+2)'"
}

Response (200):
{
  "stdout": "4\n",
  "stderr": "",
  "exit_code": 0
}
```
</details>

<details>
<summary><strong>🚀 Submit Job</strong></summary>

```bash
POST /jobs
Authorization: Bearer <key>
Content-Type: application/json

{
  "language": "python3",
  "code": "import sys; print(f'Python {sys.version}')",
  "timeout_sec": 30,
  "limits": { "memory_mb": 256 }
}

Response (202):
{
  "job_id": "job_x9y8z7w6",
  "status": "queued"
}

GET /jobs/job_x9y8z7w6
Response (200):
{
  "id": "job_x9y8z7w6",
  "status": "completed",
  "exit_code": 0,
  "stdout": "Python 3.12.0\n",
  "duration_ms": 1247
}
```
</details>

<details>
<summary><strong>📦 Install Package</strong></summary>

```bash
POST /packages/install
Authorization: Bearer <key>
Content-Type: application/json

{
  "name": "pandas",
  "manager": "pip"
}

Response (200):
{
  "name": "pandas",
  "manager": "pip",
  "installed_at": "2026-07-24T12:05:00Z",
  "size_kb": 45000
}
```
</details>

<details>
<summary><strong>📊 Resource Monitoring</strong></summary>

```bash
GET /resources
Authorization: Bearer <key>

Response (200):
{
  "memory": { "total_mb": 512, "used_mb": 216, "pct": 42.3 },
  "disk": { "total_mb": 10240, "used_mb": 1600, "pct": 15.6 },
  "load_avg": [0.42, 0.38, 0.35],
  "status": "ok",
  "sessions_active": 3,
  "jobs_running": 1
}
```
</details>

---

## ⚙️ Configuration

All configuration is done via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `API_KEY` | **(required)** | Bearer token for authentication |
| `PORT` | `3000` | HTTP listen port |
| `IDLE_SESSION_TIMEOUT_MIN` | `30` | Minutes before idle session is killed |
| `EXEC_TIMEOUT_SEC` | `30` | Max seconds per command execution |
| `JOB_TIMEOUT_SEC` | `300` | Max seconds per job |
| `MAX_OUTPUT_BYTES` | `1048576` | Max output bytes (1MB) |
| `CLEANUP_INTERVAL_MIN` | `60` | Minutes between package cleanup runs |
| `CLEANUP_TTL_HOURS` | `6` | Hours before unused package is removed |
| `SESSION_CREATE_RATE` | `10` | Max session creates per minute |
| `JOB_SUBMIT_RATE` | `20` | Max job submits per minute |
| `MEMORY_LIMIT_MB` | `440` | Container memory limit |
| `CPU_LIMIT_PCT` | `80` | CPU quota percentage |
| `ENABLE_BWRAP` | `false` | Enable bubblewrap network isolation |

---

## 🔒 Security

Nexuss Bash executes arbitrary remote commands — it's designed with security as a first-class concern:

| Layer | Mechanism |
|-------|-----------|
| **Authentication** | Constant-time Bearer token comparison via `crypto.timingSafeEqual` |
| **Isolation** | All processes run as unprivileged `runner` user (uid 1000) |
| **Resource Limits** | cgroups v2 (memory.max, cpu.max) with ulimit fallback |
| **Rate Limiting** | Per-key sliding window limits on all mutating endpoints |
| **Filesystem** | Sessions and jobs confined to own directories, no cross-access |
| **Sudoers** | Runner can only run `apt-get` commands via sudo |
| **Audit** | Every action logged with timestamp and API key identity |
| **Network** | Optional bubblewrap network isolation (`ENABLE_BWRAP=true`) |

### ⚠️ Security Considerations

- Set a strong, random `API_KEY`
- Rotate your API key periodically
- Never expose the service publicly without HTTPS
- Monitor audit logs regularly
- Use `ENABLE_BWRAP=true` for untrusted code execution

---

## 🛠️ Development

### Local Development

```bash
# Install dependencies
npm install

# Run with hot reload (requires Docker for isolation)
API_KEY=test node server.js
```

### Project Structure

```
nexuss-bash/
├── Dockerfile              # Ubuntu 24.04 + Node 20 + runner user
├── render.yaml             # Render deployment config
├── server.js               # Express entrypoint + graceful shutdown
├── src/
│   ├── config.js           # Environment variable loader
│   ├── utils/
│   │   ├── logger.js       # Structured JSON + audit logging
│   │   └── id.js           # Secure ID generation
│   ├── middleware/
│   │   ├── auth.js         # Bearer token validation
│   │   ├── rateLimiter.js  # Per-key rate limiting
│   │   ├── errorHandler.js # Global error handler
│   │   └── auditLog.js     # Request audit trail
│   ├── routes/
│   │   ├── health.js       # GET /health
│   │   ├── sessions.js     # Session CRUD + exec
│   │   ├── jobs.js         # Job submit + poll
│   │   ├── packages.js     # Package install/remove
│   │   └── resources.js    # Resource monitoring
│   ├── core/
│   │   ├── sessionManager.js   # PTY session lifecycle
│   │   ├── jobExecutor.js      # Multi-language runner
│   │   ├── resourceManager.js  # /proc monitoring
│   │   └── packageManager.js   # Manifest + cleanup
│   └── sandbox/
│       ├── isolation.js        # cgroups + ulimit
│       └── processLauncher.js  # Process spawning
└── SPEC/                   # Design documents
    ├── Design.md           # High-level design
    ├── Architecture.md     # Engineering architecture
    ├── Phase.md            # Implementation phases
    ├── Test.md             # QA gate tests (300 tests)
    └── Todo.md             # Task breakdown (219 tasks)
```

### Running Tests

The project includes 300 QA gate tests defined in `SPEC/Test.md`. Tests are verified at each phase gate before proceeding.

---

## 📊 Supported Languages

| Language | Command | Example |
|----------|---------|---------|
| **Python 3** | `python3 script.py` | `print("Hello")` |
| **Node.js** | `node script.js` | `console.log("Hello")` |
| **Bash** | `bash script.sh` | `echo "Hello"` |
| **PHP** | `php script.php` | `echo "Hello";` |

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with [Express.js](https://expressjs.com/)
- PTY management via [node-pty](https://github.com/nicknisi/node-pty)
- Deployed on [Render](https://render.com/)
- Designed with security-first principles

---

<div align="center">

**Built with ❤️ by [Nexuss](https://github.com/nexuss0781)**

[⬆ Back to Top](#-nexuss-bash)

</div>
