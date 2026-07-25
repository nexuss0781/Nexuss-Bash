# CLI Guide

Install and use the Nexuss Bash CLI (`nexinal`) for command execution and remote management.

## Installation

```bash
pip install nexinal
```

Or from source:

```bash
git clone https://github.com/nexuss0781/Nexuss-Bash
cd Nexuss-Bash/cli
pip install -e .
```

## Authentication

Save your API token:

```bash
nexinal auth YOUR_API_TOKEN
```

Token is stored at `~/.nexinal/config.json`.

## Usage

### Run Commands

```bash
# Single command
nexinal run "echo Hello World"

# Multiple commands (sequential)
nexinal run "echo First" "echo Second" "whoami"
```

### Execute YAML Pipelines

```bash
nexinal execute pipeline.yaml
nexinal execute runbook.yaml --stop-on-fail
```

YAML format:

```yaml
commands:
  - name: "Install dependencies"
    command: "apt-get update -qq && apt-get install -y git"
    timeout: 120
    stop_on_fail: true
  - name: "Clone repo"
    command: "git clone https://github.com/user/repo.git"
```

### System Info

```bash
nexinal status        # Connection status and config
nexinal health        # Quick health check
nexinal history       # List past runs
nexinal sessions      # List active sessions
```

### Package Management

```bash
nexinal packages list
nexinal packages install git --manager apt
nexinal packages install requests --manager pip
nexinal packages install express --manager npm
```

### Configuration

```bash
nexinal config                       # Show current config
nexinal config --set https://custom.example.com  # Set API URL
nexinal logout                       # Remove saved token
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `nexinal auth <token>` | Save and verify authentication token |
| `nexinal run <commands...>` | Run commands sequentially on remote server |
| `nexinal execute <yaml_file>` | Execute commands from a YAML file |
| `nexinal status` | Show connection and token info |
| `nexinal health` | Quick health check |
| `nexinal history` | List past runs |
| `nexinal sessions` | List active sessions |
| `nexinal packages list` | List installed packages |
| `nexinal packages install <name>` | Install a package |
| `nexinal config` | Show or set API URL |
| `nexinal logout` | Remove saved token |

## Global Options

| Flag | Description |
|------|-------------|
| `--stop-on-fail` | Stop execution on first failed command |
| `--help` | Show help |
| `--version` | Show version |
