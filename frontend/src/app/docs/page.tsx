"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import { AuthProvider } from "@/lib/auth-context";

interface DocSection {
  id: string;
  title: string;
  content: string;
}

const docSections: DocSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    content: `# Getting Started

Nexuss Bash is a containerized remote execution platform. Send commands via a REST API, get structured results back.

## Quick Setup

\`\`\`bash
# Build the container
docker build -t nexuss-bash .

# Run with your API key
docker run -d -p 3000:3000 -e API_KEY="your-secret-key" nexuss-bash
\`\`\`

## Your First Request

\`\`\`bash
curl -X POST http://localhost:3000/run \\
  -H "Authorization: Bearer your-secret-key" \\
  -H "Content-Type: application/json" \\
  -d '{"commands":["echo Hello World","whoami","ls /workspace"]}'
\`\`\`

## Response Format

All responses use a standard envelope:

\`\`\`json
{
  "data": {
    "run_id": "a1b2c3d4",
    "status": "completed",
    "results": [...]
  }
}
\`\`\`

Errors follow this shape:

\`\`\`json
{
  "error": {
    "code": "bad_request",
    "message": "Missing commands array",
    "details": {}
  }
}
\`\`\`

## Authentication

Every request requires an \`Authorization: Bearer <API_KEY>\` header. The key is set via the \`API_KEY\` environment variable when starting the server.

## Base URL

- Local: \`http://localhost:3000\`
- Cloud: \`https://nexuss-bash.onrender.com\`
`,
  },
  {
    id: "command-runner",
    title: "Command Runner",
    content: `# Command Runner

The command runner is the primary interface. Send a list of commands, get results for each.

## Endpoint

\`\`\`
POST /run
\`\`\`

## JSON Request

\`\`\`bash
curl -X POST http://localhost:3000/run \\
  -H "Authorization: Bearer your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "commands": [
      "echo Hello",
      "python3 -c \\"print(2+2)\\"",
      "ls -la /workspace"
    ]
  }'
\`\`\`

## YAML File Upload

\`\`\`bash
curl -X POST http://localhost:3000/run \\
  -H "Authorization: Bearer your-key" \\
  -F "file=@commands.yaml"
\`\`\`

## YAML Format

\`\`\`yaml
commands:
  - "apt-get update -qq && apt-get install -y git"
  - "git clone https://github.com/user/repo.git /workspace/repo"
  - "node /workspace/repo/index.js"
\`\`\`

## Command Options

Each command can be a string or an object:

\`\`\`yaml
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
\`\`\`

## Response

\`\`\`json
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
\`\`\`

## Status Codes

- **PASS** — Command succeeded (exit code 0)
- **FAIL** — Command failed (non-zero exit code)
- **SKIP** — Skipped due to previous failure (stop_on_fail)
- **TIMEOUT** — Command exceeded timeout

## Query Past Runs

\`\`\`bash
# List all runs
GET /run

# Get specific run
GET /run/:run_id
\`\`\`
`,
  },
  {
    id: "pipelines",
    title: "Pipelines",
    content: `# Pipelines

YAML-based multi-step workflows with dependencies and parallel execution.

## Run a Pipeline

\`\`\`bash
curl -X POST http://localhost:3000/pipelines/run \\
  -H "Authorization: Bearer your-key" \\
  -F "file=@pipeline.yaml"
\`\`\`

## Pipeline YAML Format

\`\`\`yaml
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
\`\`\`

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

\`\`\`bash
POST /pipelines
Content-Type: application/json

{
  "name": "my-pipeline",
  "yaml": "steps:\\n  - name: step1\\n    command: echo hello"
}
\`\`\`

## Pipeline Management

\`\`\`bash
# List all pipelines
GET /pipelines

# Get pipeline status
GET /pipelines/:id

# Cancel a running pipeline
DELETE /pipelines/:id
\`\`\`
`,
  },
  {
    id: "api-reference",
    title: "API Reference",
    content: `# API Reference

Complete reference for all Nexuss Bash endpoints.

## Base URL

\`\`\`
https://nexuss-bash.onrender.com
\`\`\`

## Authentication

\`\`\`
Authorization: Bearer <API_KEY>
\`\`\`

## Response Envelope

**Success:**
\`\`\`json
{ "data": { ... } }
{ "data": [...], "total": N }
\`\`\`

**Error:**
\`\`\`json
{
  "error": {
    "code": "error_code",
    "message": "Human readable message",
    "details": {}
  }
}
\`\`\`

---

## Health

### GET /health

Health check (no auth required).

**Response:**
\`\`\`json
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
\`\`\`

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

\`\`\`json
{ "data": { "session_id": "...", "status": "active", "created_at": "..." } }
\`\`\`

### GET /sessions

List sessions with pagination (\`?limit=20&offset=0\`).

### GET /sessions/:id

Get session details.

### GET /sessions/:id/logs

Get session command logs. Use \`?tail=N\` for last N entries.

### POST /sessions/:id/exec

Execute a command in a session.

\`\`\`json
{ "command": "ls -la" }
\`\`\`

### DELETE /sessions/:id

Kill a session.

---

## Jobs

### POST /jobs

Submit a code job.

\`\`\`json
{
  "language": "python",
  "code": "print('hello')",
  "timeout": 30
}
\`\`\`

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

\`\`\`json
{ "name": "git", "manager": "apt" }
\`\`\`

Supported managers: \`apt\`, \`pip\`, \`npm\`, \`composer\`

### GET /packages

List installed packages.

### DELETE /packages/:name

Remove a package.

---

## Resources

### GET /resources

Current resource usage.

\`\`\`json
{
  "data": {
    "mem_pct": 45.2,
    "disk_pct": 23.1,
    "threshold_status": "ok"
  }
}
\`\`\`

---

## System

### GET /system

Full system state including resources, sessions, jobs, pipelines, packages, and files.
`,
  },
  {
    id: "cli-guide",
    title: "CLI Guide",
    content: `# CLI Guide

Install and use the Nexuss Bash CLI for quick command execution.

## Installation

\`\`\`bash
npm install -g nexuss-bash-cli
\`\`\`

Or run directly with npx:

\`\`\`bash
npx nexuss-bash-cli <command>
\`\`\`

## Configuration

Set your API key:

\`\`\`bash
nexuss config --key your-api-key --url https://nexuss-bash.onrender.com
\`\`\`

Or use environment variables:

\`\`\`bash
export NEXUSS_API_KEY="your-api-key"
export NEXUSS_API_URL="https://nexuss-bash.onrender.com"
\`\`\`

## Usage

### Run Commands

\`\`\`bash
# Single command
nexuss run "echo Hello World"

# Multiple commands
nexuss run "echo First" "echo Second" "whoami"

# From a YAML file
nexuss run --file commands.yaml
\`\`\`

### Interactive Session

\`\`\`bash
# Start an interactive session
nexuss shell

# This opens a local terminal connected to the remote session
\`\`\`

### Install Packages

\`\`\`bash
nexuss pkg install git --manager apt
nexuss pkg install requests --manager pip
nexuss pkg install express --manager npm
\`\`\`

### System Info

\`\`\`bash
nexuss status
nexuss resources
\`\`\`

### Upload Files

\`\`\`bash
nexuss upload ./myfile.txt
nexuss upload ./project/ --recursive
\`\`\`

## Commands Reference

| Command | Description |
|---------|-------------|
| \`nexuss run\` | Execute commands |
| \`nexuss shell\` | Start interactive session |
| \`nexuss pkg install\` | Install a package |
| \`nexuss pkg list\` | List packages |
| \`nexuss pkg remove\` | Remove a package |
| \`nexuss upload\` | Upload a file |
| \`nexuss files\` | List files |
| \`nexuss status\` | System status |
| \`nexuss resources\` | Resource usage |
| \`nexuss config\` | Set configuration |
| \`nexuss health\` | Health check |

## Global Flags

| Flag | Description |
|------|-------------|
| \`--json\` | Output as JSON |
| \`--quiet\` | Suppress output |
| \`--verbose\` | Verbose output |
| \`--timeout\` | Request timeout (seconds) |
`,
  },
];

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function DocsContent() {
  const [activeSection, setActiveSection] = useState("getting-started");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSections = docSections.filter(
    (section) =>
      section.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      section.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentSection = docSections.find((s) => s.id === activeSection);

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <div className="glass rounded-xl p-4">
              <div className="relative mb-4">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search docs..."
                  className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text placeholder-text-dim transition-all duration-200 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>

              <nav className="space-y-1">
                {filteredSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-all duration-200 ${
                      activeSection === section.id
                        ? "bg-primary/10 text-primary-light"
                        : "text-text-muted hover:bg-surface-hover hover:text-text"
                    }`}
                  >
                    {section.title}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <main className="min-w-0">
            <div className="glass rounded-xl p-8">
              <div className="prose-dark">
                {currentSection && (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(currentSection.content),
                    }}
                  />
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function renderMarkdown(md: string): string {
  let html = md;

  // Code blocks
  html = html.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_, lang, code) =>
      `<pre><code class="language-${lang || "text"}">${escapeHtml(code.trim())}</code></pre>`
  );

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    "<code>$1</code>"
  );

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Horizontal rules
  html = html.replace(/^---$/gm, "<hr />");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Tables
  html = html.replace(
    /(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/g,
    (_, header, _separator, body) => {
      const headers = header
        .split("|")
        .filter((c: string) => c.trim())
        .map((c: string) => `<th>${c.trim()}</th>`)
        .join("");
      const rows = body
        .trim()
        .split("\n")
        .map((row: string) => {
          const cells = row
            .split("|")
            .filter((c: string) => c.trim())
            .map((c: string) => `<td>${c.trim()}</td>`)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    }
  );

  // Unordered lists
  html = html.replace(
    /^- (.+)$/gm,
    "<li>$1</li>"
  );
  html = html.replace(/((?:<li>.+<\/li>\n?)+)/g, "<ul>$1</ul>");

  // Paragraphs
  html = html
    .split("\n\n")
    .map((block) => {
      if (
        block.startsWith("<") ||
        block.trim() === ""
      )
        return block;
      return `<p>${block.replace(/\n/g, "<br />")}</p>`;
    })
    .join("\n");

  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function DocsPage() {
  return (
    <AuthProvider>
      <DocsContent />
    </AuthProvider>
  );
}
