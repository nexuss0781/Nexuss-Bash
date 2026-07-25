# Command Runner

The command runner is the primary interface. Send a list of commands, get results for each.

## Endpoint

```
POST /run
```

## JSON Request

```bash
curl -X POST http://localhost:3000/run \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      "echo Hello",
      "python3 -c \"print(2+2)\"",
      "ls -la /workspace"
    ]
  }'
```

## YAML File Upload

```bash
curl -X POST http://localhost:3000/run \
  -H "Authorization: Bearer your-key" \
  -F "file=@commands.yaml"
```

## YAML Format

```yaml
commands:
  - "apt-get update -qq && apt-get install -y git"
  - "git clone https://github.com/user/repo.git /workspace/repo"
  - "node /workspace/repo/index.js"
```

## Command Options

Each command can be a string or an object:

```yaml
commands:
  # Simple string
  - "echo Hello"

  # Object with options
  - name: install_deps
    command: "apt-get update -qq && apt-get install -y git"
    timeout: 120
    stop_on_fail: true

  - name: clone
    command: "git clone https://github.com/user/repo.git"
    retry: 2
```

## Response

```json
{
  "data": {
    "run_id": "abc123",
    "status": "completed",
    "started_at": "2024-01-01T00:00:00Z",
    "completed_at": "2024-01-01T00:00:05Z",
    "results": [
      {
        "index": 0,
        "name": "echo Hello",
        "status": "PASS",
        "stdout": "Hello",
        "stderr": "",
        "exit_code": 0,
        "duration_ms": 12
      }
    ]
  }
}
```

## Status Codes

- **PASS** — Command succeeded (exit code 0)
- **FAIL** — Command failed (non-zero exit code)
- **SKIP** — Skipped due to previous failure (stop_on_fail)
- **TIMEOUT** — Command exceeded timeout

## Query Past Runs

```bash
# List all runs
GET /run

# Get specific run
GET /run/:run_id
```
