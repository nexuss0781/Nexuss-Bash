# Getting Started

Nexuss Bash is a containerized remote execution platform. Send commands via a REST API, get structured results back.

## Quick Setup

```bash
# Build the container
docker build -t nexuss-bash .

# Run with your API key
docker run -d -p 3000:3000 -e API_KEY="your-secret-key" nexuss-bash
```

## Your First Request

```bash
curl -X POST http://localhost:3000/run \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"commands":["echo Hello World","whoami","ls /workspace"]}'
```

## Response Format

All responses use a standard envelope:

```json
{
  "data": {
    "run_id": "a1b2c3d4",
    "status": "completed",
    "results": [...]
  }
}
```

Errors follow this shape:

```json
{
  "error": {
    "code": "bad_request",
    "message": "Missing commands array",
    "details": {}
  }
}
```

## Authentication

Every request requires an `Authorization: Bearer <API_KEY>` header. The key is set via the `API_KEY` environment variable when starting the server.

## Base URL

- Local: `http://localhost:3000`
- Cloud: `https://nexuss-bash.onrender.com`

## What You Can Do

- **Run commands** — Send a list of shell commands, get results for each
- **Upload files** — Push files to the workspace and execute them
- **Manage packages** — Install apt/pip/npm/composer packages at runtime
- **Monitor resources** — Track RAM, disk, and CPU usage in real time
- **Create sessions** — Open interactive bash shells
- **Build pipelines** — Define multi-step YAML workflows
