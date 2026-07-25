"""Main Click CLI for nexinal."""

import sys
from typing import List

import click

from nexinal import __version__
from nexinal.config import (
    load_config, save_config, get_token, get_api_url,
    set_token, set_api_url, remove_token, get_last_run_id,
)
from nexinal.api import api_get, api_post, APIError, AuthError, ConnectionError_, test_connection
from nexinal.runner import run_commands
from nexinal.yaml_parser import parse_yaml_file, YAMLError, CommandEntry
from nexinal.display import (
    console, print_banner, print_result, print_error,
    print_success, print_warning, print_info, print_status,
    create_results_table,
)


@click.group()
@click.version_option(version=__version__, prog_name="nexinal")
def main():
    """nexinal - CLI client for Nexuss Bash remote execution API."""
    pass


@main.command()
@click.argument("token")
def auth(token: str):
    """Save authentication token and verify it."""
    print_info("Verifying connection...")

    old_token = get_token()
    set_token(token)

    try:
        resp = api_get("/health")
        server_name = resp.get("name", resp.get("server_name", "Nexuss Bash"))
        print_success(f"Connected to {server_name}")
        print_success(f"Token saved to ~/.nexinal/config.json")
    except ConnectionError_ as e:
        set_token(old_token or "")
        if old_token is None:
            remove_token()
        print_error(f"Cannot reach server: {e}")
        sys.exit(1)
    except APIError as e:
        set_token(old_token or "")
        if old_token is None:
            remove_token()
        print_error(f"Connection check failed: {e}")
        sys.exit(1)
    except AuthError as e:
        set_token(old_token or "")
        if old_token is None:
            remove_token()
        print_error(f"Auth failed: {e}")
        sys.exit(1)
    except Exception as e:
        set_token(old_token or "")
        if old_token is None:
            remove_token()
        print_error(f"Unexpected error: {e}")
        sys.exit(1)


@main.command()
@click.argument("commands", nargs=-1, required=True)
@click.option("--stop-on-fail", is_flag=True, help="Stop on first failed command")
def run(commands: tuple, stop_on_fail: bool):
    """Run commands sequentially on the remote server.

    Each argument is a separate command to execute.

    Example: nexinal run "echo hello" "whoami" "ls /workspace"
    """
    if not commands:
        print_error("No commands provided")
        sys.exit(1)

    result = run_commands(list(commands), stop_on_fail=stop_on_fail)
    if not result.success:
        sys.exit(1)


@main.command()
@click.argument("yaml_file")
@click.option("--stop-on-fail", is_flag=True, help="Stop on first failed command")
def execute(yaml_file: str, stop_on_fail: bool):
    """Execute commands from a YAML file.

    Supports both simple (list of strings) and detailed (objects) formats.
    """
    try:
        commands = parse_yaml_file(yaml_file)
    except YAMLError as e:
        print_error(str(e))
        sys.exit(1)

    print_info(f"Loaded {len(commands)} command(s) from {yaml_file}")
    result = run_commands(commands, stop_on_fail=stop_on_fail)
    if not result.success:
        sys.exit(1)


@main.command()
def status():
    """Show connection status and configuration info."""
    token = get_token()
    api_url = get_api_url()
    last_run_id = get_last_run_id()

    connected = test_connection()

    authenticated = False
    if token and connected:
        try:
            api_get("/health")
            authenticated = True
        except AuthError:
            authenticated = False
        except Exception:
            authenticated = False

    print_status({
        "connected": connected,
        "api_url": api_url,
        "token": token,
        "authenticated": authenticated,
        "last_run_id": last_run_id,
    })


@main.command()
def history():
    """List past runs."""
    if not get_token():
        print_error("Not authenticated. Run: nexinal auth <token>")
        sys.exit(1)

    try:
        resp = api_get("/run")
    except APIError as e:
        print_error(str(e))
        sys.exit(1)
    except ConnectionError_ as e:
        print_error(str(e))
        sys.exit(1)

    runs = resp if isinstance(resp, list) else resp.get("runs", resp.get("data", []))

    if not runs:
        print_info("No runs found")
        return

    from rich.table import Table
    from rich import box

    table = Table(title="Run History", box=box.ROUNDED, show_lines=True)
    table.add_column("Run ID", style="bold cyan", max_width=12)
    table.add_column("Status", justify="center", width=10)
    table.add_column("Commands", justify="center", width=10)
    table.add_column("Created", style="dim")

    for run_entry in runs:
        run_id = str(run_entry.get("id", run_entry.get("run_id", "-")))
        if len(run_id) > 12:
            run_id = run_id[:9] + "..."
        run_status = run_entry.get("status", "unknown")
        num_commands = run_entry.get("num_commands", len(run_entry.get("commands", [])))
        created = run_entry.get("created_at", run_entry.get("timestamp", "-"))

        if run_status in ("completed", "success", "passed"):
            status_display = Text("✓ " + run_status, style="green")
        elif run_status in ("failed", "error"):
            status_display = Text("✗ " + run_status, style="red")
        else:
            status_display = Text(run_status, style="yellow")

        table.add_row(run_id, status_display, str(num_commands), str(created))

    console.print(table)


@main.command()
def health():
    """Quick health check against the API server."""
    api_url = get_api_url()
    print_info(f"Checking {api_url}...")

    if test_connection():
        try:
            resp = api_get("/health")
            server_name = resp.get("name", resp.get("server_name", "Nexuss Bash"))
            version = resp.get("version", "unknown")
            print_success(f"{server_name} is healthy (v{version})")
        except Exception:
            print_success(f"Server at {api_url} is reachable")
    else:
        print_error(f"Server at {api_url} is not reachable")
        sys.exit(1)


@main.command()
def sessions():
    """List active sessions."""
    if not get_token():
        print_error("Not authenticated. Run: nexinal auth <token>")
        sys.exit(1)

    try:
        resp = api_get("/sessions")
    except APIError as e:
        print_error(str(e))
        sys.exit(1)
    except ConnectionError_ as e:
        print_error(str(e))
        sys.exit(1)

    session_list = resp if isinstance(resp, list) else resp.get("sessions", resp.get("data", []))

    if not session_list:
        print_info("No active sessions")
        return

    from rich.table import Table
    from rich import box

    table = Table(title="Active Sessions", box=box.ROUNDED, show_lines=True)
    table.add_column("Session ID", style="bold cyan", max_width=16)
    table.add_column("Status", justify="center", width=10)
    table.add_column("Created", style="dim")

    for sess in session_list:
        sess_id = str(sess.get("id", sess.get("session_id", "-")))
        if len(sess_id) > 16:
            sess_id = sess_id[:13] + "..."
        sess_status = sess.get("status", "active")
        created = sess.get("created_at", "-")

        table.add_row(sess_id, sess_status, str(created))

    console.print(table)


@main.group()
def packages():
    """Manage installed packages."""
    pass


@packages.command("list")
def packages_list():
    """List installed packages."""
    if not get_token():
        print_error("Not authenticated. Run: nexinal auth <token>")
        sys.exit(1)

    try:
        resp = api_get("/packages")
    except APIError as e:
        print_error(str(e))
        sys.exit(1)
    except ConnectionError_ as e:
        print_error(str(e))
        sys.exit(1)

    pkgs = resp if isinstance(resp, list) else resp.get("packages", resp.get("data", []))

    if not pkgs:
        print_info("No packages installed")
        return

    from rich.table import Table
    from rich import box

    table = Table(title="Installed Packages", box=box.ROUNDED, show_lines=True)
    table.add_column("Name", style="bold", ratio=2)
    table.add_column("Version", style="dim", ratio=1)
    table.add_column("Manager", justify="center", width=10)

    for pkg in pkgs:
        name = pkg.get("name", "?")
        version = pkg.get("version", "-")
        manager = pkg.get("manager", pkg.get("package_manager", "-"))
        table.add_row(str(name), str(version), str(manager))

    console.print(table)


@packages.command("install")
@click.argument("name")
@click.option("--manager", type=click.Choice(["apt", "pip", "npm"]), required=True, help="Package manager to use")
def packages_install(name: str, manager: str):
    """Install a package on the remote server."""
    if not get_token():
        print_error("Not authenticated. Run: nexinal auth <token>")
        sys.exit(1)

    print_info(f"Installing {name} via {manager}...")

    try:
        resp = api_post("/packages/install", {"name": name, "manager": manager})
        output = resp.get("output", resp.get("detail", ""))
        if output:
            console.print(output)
        print_success(f"Installed {name} via {manager}")
    except APIError as e:
        print_error(str(e))
        sys.exit(1)
    except ConnectionError_ as e:
        print_error(str(e))
        sys.exit(1)


@main.command()
@click.option("--set", "set_url", help="Set a new API URL")
@click.option("--show", "show_url", is_flag=True, help="Show current API URL")
def config(set_url: str, show_url: bool):
    """Show or set API URL configuration."""
    if set_url:
        set_api_url(set_url)
        print_success(f"API URL set to {set_url}")
        return

    api_url = get_api_url()
    token = get_token()
    token_display = f"{token[:8]}...{token[-4:]}" if token and len(token) > 12 else (token if token else "Not set")

    from rich.table import Table
    from rich import box

    table = Table(title="Configuration", box=box.SIMPLE_HEAVY, show_header=False)
    table.add_column("Key", style="bold cyan", width=16)
    table.add_column("Value")
    table.add_row("API URL", api_url)
    table.add_row("Token", token_display)
    table.add_row("Config File", str(load_config.__module__))

    console.print(table)


@main.command()
def logout():
    """Remove saved authentication token."""
    token = get_token()
    if not token:
        print_warning("No token is currently saved")
        return

    remove_token()
    print_success("Token removed. You have been logged out.")


if __name__ == "__main__":
    main()
