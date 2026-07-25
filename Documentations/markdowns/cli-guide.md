# CLI Guide

Install and use the Nexuss Bash CLI for quick command execution.

## Installation

```bash
npm install -g nexuss-bash-cli
```

Or run directly with npx:

```bash
npx nexuss-bash-cli <command>
```

## Configuration

Set your API key:

```bash
nexuss config --key your-api-key --url https://nexuss-bash.onrender.com
```

Or use environment variables:

```bash
export NEXUSS_API_KEY="your-api-key"
export NEXUSS_API_URL="https://nexuss-bash.onrender.com"
```

## Usage

### Run Commands

```bash
# Single command
nexuss run "echo Hello World"

# Multiple commands
nexuss run "echo First" "echo Second" "whoami"

# From a YAML file
nexuss run --file commands.yaml
```

### Interactive Session

```bash
# Start an interactive session
nexuss shell

# This opens a local terminal connected to the remote session
```

### Install Packages

```bash
nexuss pkg install git --manager apt
nexuss pkg install requests --manager pip
nexuss pkg install express --manager npm
```

### System Info

```bash
nexuss status
nexuss resources
```

### Upload Files

```bash
nexuss upload ./myfile.txt
nexuss upload ./project/ --recursive
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `nexuss run` | Execute commands |
| `nexuss shell` | Start interactive session |
| `nexuss pkg install` | Install a package |
| `nexuss pkg list` | List packages |
| `nexuss pkg remove` | Remove a package |
| `nexuss upload` | Upload a file |
| `nexuss files` | List files |
| `nexuss status` | System status |
| `nexuss resources` | Resource usage |
| `nexuss config` | Set configuration |
| `nexuss health` | Health check |

## Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |
| `--quiet` | Suppress output |
| `--verbose` | Verbose output |
| `--timeout` | Request timeout (seconds) |
