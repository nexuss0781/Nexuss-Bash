# Pipelines

YAML-based multi-step workflows with dependencies and parallel execution.

## Run a Pipeline

```bash
curl -X POST http://localhost:3000/pipelines/run \
  -H "Authorization: Bearer your-key" \
  -F "file=@pipeline.yaml"
```

## Pipeline YAML Format

```yaml
name: deploy-app
steps:
  - name: install_deps
    command: "npm install"
    timeout: 120

  - name: build
    command: "npm run build"
    depends_on: [install_deps]

  - name: test_unit
    command: "npm test -- --unit"
    depends_on: [install_deps]
    parallel: true

  - name: test_e2e
    command: "npm test -- --e2e"
    depends_on: [install_deps]
    parallel: true

  - name: deploy
    command: "npm run deploy"
    depends_on: [test_unit, test_e2e]
```

## Step Options

| Field | Type | Description |
|-------|------|-------------|
| name | string | Unique step identifier |
| command | string | Shell command to execute |
| depends_on | string[] | Steps that must complete first |
| parallel | boolean | Run alongside other parallel steps |
| timeout | number | Max seconds before kill (default: 600) |
| stop_on_fail | boolean | Halt pipeline on failure (default: true) |
| retry | number | Retry count on failure (default: 0) |
| env | object | Environment variables for this step |

## Async Pipeline Submission

```bash
POST /pipelines
Content-Type: application/json

{
  "name": "my-pipeline",
  "yaml": "steps:\\n  - name: step1\\n    command: echo hello"
}
```

## Pipeline Management

```bash
# List all pipelines
GET /pipelines

# Get pipeline status
GET /pipelines/:id

# Cancel a running pipeline
DELETE /pipelines/:id
```

## Example: CI/CD Pipeline

```yaml
name: ci-cd
steps:
  - name: checkout
    command: "git clone https://github.com/user/app.git /workspace/app"

  - name: deps
    command: "cd /workspace/app && npm install"
    depends_on: [checkout]

  - name: lint
    command: "cd /workspace/app && npm run lint"
    depends_on: [deps]
    parallel: true

  - name: test
    command: "cd /workspace/app && npm test"
    depends_on: [deps]
    parallel: true

  - name: build
    command: "cd /workspace/app && npm run build"
    depends_on: [lint, test]

  - name: deploy
    command: "cd /workspace/app && npm run deploy --production"
    depends_on: [build]
```
