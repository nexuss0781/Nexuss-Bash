# API Reference

Complete reference for all Nexuss Bash endpoints.

## Base URL

```
https://nexuss-bash.onrender.com
```

## Authentication

```
Authorization: Bearer <API_KEY>
```

## Response Envelope

**Success:**
```json
{ "data": { ... } }
{ "data": [...], "total": N }
```

**Error:**
```json
{
  "error": {
    "code": "error_code",
    "message": "Human readable message",
    "details": {}
  }
}
```

---

## Health

### GET /health

Health check (no auth required).

**Response:**
```json
{
  "data": {
    "status": "ok",
    "version": "1.1.0",
    "uptime_sec": 12345,
    "checks": {
      "resources": "ok",
      "session_manager": "ok"
    },
    "mem_pct": 45.2,
    "disk_pct": 23.1
  }
}
```

---

## Command Runner

### POST /run

Execute commands and get results.

| Parameter | Type | Description |
|-----------|------|-------------|
| commands | string[] | List of shell commands |
| yaml | string | YAML command definition |
| file | File | Upload .yaml/.yml/.json file |
| timeout | number | Max execution time in ms |

### GET /run

List past runs.

### GET /run/:id

Get run details.

---

## Sessions

### POST /sessions

Create a new PTY session.

```json
{ "data": { "session_id": "...", "status": "active", "created_at": "..." } }
```

### GET /sessions

List sessions with pagination (`?limit=20&offset=0`).

### GET /sessions/:id

Get session details.

### GET /sessions/:id/logs

Get session command logs. Use `?tail=N` for last N entries.

### POST /sessions/:id/exec

Execute a command in a session.

```json
{ "command": "ls -la" }
```

### DELETE /sessions/:id

Kill a session.

---

## Jobs

### POST /jobs

Submit a code job.

```json
{
  "language": "python",
  "code": "print('hello')",
  "timeout": 30
}
```

### GET /jobs

List jobs.

### GET /jobs/:id

Get job status and output.

---

## Files

### POST /files/upload

Upload a file (multipart/form-data).

### GET /files

List uploaded files.

### GET /files/:id

Get file metadata.

### GET /files/:id/download

Download file content.

### DELETE /files/:id

Delete a file.

---

## Pipelines

### POST /pipelines/run

Upload and run a YAML pipeline.

### POST /pipelines

Submit a pipeline definition (async).

### GET /pipelines

List all pipelines.

### GET /pipelines/:id

Get pipeline status.

### DELETE /pipelines/:id

Cancel a running pipeline.

---

## Packages

### POST /packages/install

Install a package.

```json
{ "name": "git", "manager": "apt" }
```

Supported managers: `apt`, `pip`, `npm`, `composer`

### GET /packages

List installed packages.

### DELETE /packages/:name

Remove a package.

---

## Resources

### GET /resources

Current resource usage.

```json
{
  "data": {
    "mem_pct": 45.2,
    "disk_pct": 23.1,
    "threshold_status": "ok"
  }
}
```

---

## System

### GET /system

Full system state including resources, sessions, jobs, pipelines, packages, and files.
