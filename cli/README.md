# nexinal

CLI client for the **Nexuss Bash** remote execution API. Run shell commands on a remote server directly from your terminal.

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

## Quick Start

```bash
# Authenticate
nexinal auth YOUR_API_TOKEN

# Run commands
nexinal run "echo hello" "whoami" "ls /workspace"

# Execute a YAML file
nexinal execute runbook.yaml

# Check status
nexinal status
```

## Commands

| Command | Description |
|---------|-------------|
| `nexinal auth <token>` | Save authentication token |
| `nexinal run <commands...>` | Run shell commands sequentially |
| `nexinal execute <yaml_file>` | Execute commands from a YAML file |
| `nexinal status` | Show connection and token info |
| `nexinal history` | List past runs |
| `nexinal health` | Quick health check |
| `nexinal sessions` | List active sessions |
| `nexinal packages list` | List installed packages |
| `nexinal packages install <name>` | Install a package |
| `nexinal config` | Show or set API URL |
| `nexinal logout` | Remove saved token |

## YAML File Format

### Simple format

```yaml
commands:
  - "echo hello"
  - "whoami"
  - "ls -la /workspace"
```

### Detailed format

```yaml
commands:
  - name: "Print hello"
    command: "echo hello"
    timeout: 30
    stop_on_fail: true
  - name: "List files"
    command: "ls -la"
    timeout: 15
```

## Configuration

Config is stored at `~/.nexinal/config.json`.

```bash
# Set custom API URL
nexinal config set https://my-server.example.com

# Show current config
nexinal config
```

## Environment

- Python 3.8+
- Works on Linux, macOS, Windows

## License

MIT
