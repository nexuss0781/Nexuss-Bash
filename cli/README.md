# parad

CLI client for the **Nexuss Bash** remote execution API. Run shell commands on a remote server directly from your terminal.

## Installation

```bash
pip install parad
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
parad auth YOUR_API_TOKEN

# Run commands
parad run "echo hello" "whoami" "ls /workspace"

# Execute a YAML file
parad execute runbook.yaml

# Check status
parad status
```

## Commands

| Command | Description |
|---------|-------------|
| `parad auth <token>` | Save authentication token |
| `parad run <commands...>` | Run shell commands sequentially |
| `parad execute <yaml_file>` | Execute commands from a YAML file |
| `parad status` | Show connection and token info |
| `parad history` | List past runs |
| `parad health` | Quick health check |
| `parad sessions` | List active sessions |
| `parad packages list` | List installed packages |
| `parad packages install <name>` | Install a package |
| `parad config` | Show or set API URL |
| `parad logout` | Remove saved token |

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

Config is stored at `~/.parad/config.json`.

```bash
# Set custom API URL
parad config set https://my-server.example.com

# Show current config
parad config
```

## Environment

- Python 3.8+
- Works on Linux, macOS, Windows

## License

MIT
