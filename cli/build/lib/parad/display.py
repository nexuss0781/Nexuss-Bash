"""Rich display utilities for parad CLI."""

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich.columns import Columns
from rich import box

console = Console()

BANNER = r"""
                    _           _
                   (_)         | |
  _ __  _ __  _ __  _  ___  __| |
 | '__|| '__|| '_ \| |/ __|/ _` |
 | |   | |   | |_) | | (__| (_| |
 |_|   |_|   | .__/|_|\___|\__,_|
             | |
             |_|  v1.0.0
"""


def print_banner() -> None:
    text = Text(BANNER, style="bold cyan")
    console.print(text)


def print_result(result: dict) -> None:
    command = result.get("command", "unknown")
    status = result.get("status", "unknown")
    output = result.get("stdout", result.get("output", ""))
    exit_code = result.get("exit_code", None)
    duration_ms = result.get("duration_ms", result.get("duration", None))
    duration_s = round(duration_ms / 1000, 2) if isinstance(duration_ms, (int, float)) and duration_ms > 100 else duration_ms

    if status == "passed" or status == "success" or status == "completed":
        status_icon = Text("✓ PASS", style="bold green")
    elif status == "failed" or status == "error":
        status_icon = Text("✗ FAIL", style="bold red")
    elif status == "skipped":
        status_icon = Text("⊘ SKIP", style="bold yellow")
    else:
        status_icon = Text(f"? {status.upper()}", style="bold yellow")

    title = Text()
    title.append("  ")
    title.append(command, style="bold white")
    title.append("  ")
    title.append_text(status_icon)

    meta_parts = []
    if exit_code is not None:
        meta_parts.append(f"exit={exit_code}")
    if duration_s is not None:
        meta_parts.append(f"time={duration_s}s")

    footer = Text()
    if meta_parts:
        footer.append(" | ".join(meta_parts), style="dim")

    content = Text()
    if output:
        output_str = output.rstrip()
        if len(output_str) > 2000:
            output_str = output_str[:2000] + "\n... (truncated)"
        content.append(output_str)
    else:
        content.append("(no output)", style="dim italic")

    border_style = "green" if "pass" in status or "success" in status or "completed" in status else "red" if "fail" in status or "error" in status else "yellow"

    panel = Panel(
        content,
        title=title,
        subtitle=footer if meta_parts else None,
        border_style=border_style,
        box=box.ROUNDED,
        padding=(0, 1),
    )
    console.print(panel)


def print_error(message: str) -> None:
    text = Text()
    text.append("✗ Error: ", style="bold red")
    text.append(message, style="red")
    console.print(text)


def print_success(message: str) -> None:
    text = Text()
    text.append("✓ ", style="bold green")
    text.append(message, style="green")
    console.print(text)


def print_warning(message: str) -> None:
    text = Text()
    text.append("⚠ ", style="bold yellow")
    text.append(message, style="yellow")
    console.print(text)


def print_info(message: str) -> None:
    text = Text()
    text.append("ℹ ", style="bold blue")
    text.append(message, style="blue")
    console.print(text)


def print_status(status: dict) -> None:
    table = Table(title="Connection Status", box=box.SIMPLE_HEAVY, show_header=False)
    table.add_column("Key", style="bold cyan", width=16)
    table.add_column("Value")

    connected = status.get("connected", False)
    api_url = status.get("api_url", "N/A")
    token = status.get("token", None)
    token_display = f"{token[:8]}...{token[-4:]}" if token and len(token) > 12 else (token if token else "Not set")
    authenticated = status.get("authenticated", False)
    last_run = status.get("last_run_id", "None")

    table.add_row("Connected", Text("Yes ✓" if connected else "No ✗", style="green" if connected else "red"))
    table.add_row("API URL", api_url)
    table.add_row("Token", token_display)
    table.add_row("Authenticated", Text("Yes" if authenticated else "No", style="green" if authenticated else "red"))
    table.add_row("Last Run ID", str(last_run) if last_run else "None")

    console.print(table)


def create_results_table(results: list) -> Table:
    table = Table(title="Run Results", box=box.ROUNDED, show_lines=True)
    table.add_column("#", style="dim", width=4)
    table.add_column("Command", style="bold", ratio=3)
    table.add_column("Status", width=10, justify="center")
    table.add_column("Exit Code", width=10, justify="center")
    table.add_column("Duration", width=10, justify="center")

    for i, result in enumerate(results, 1):
        command = result.get("command", "unknown")
        status = result.get("status", "unknown")
        exit_code = result.get("exit_code", "-")
        duration_ms = result.get("duration_ms", result.get("duration", "-"))
        duration = round(duration_ms / 1000, 2) if isinstance(duration_ms, (int, float)) and duration_ms > 100 else duration_ms

        if status in ("passed", "success", "completed"):
            status_display = Text("✓ PASS", style="bold green")
        elif status in ("failed", "error"):
            status_display = Text("✗ FAIL", style="bold red")
        elif status == "skipped":
            status_display = Text("⊘ SKIP", style="bold yellow")
        else:
            status_display = Text(f"? {status}", style="bold yellow")

        if exit_code is not None:
            exit_display = Text(str(exit_code), style="green" if exit_code == 0 else "red")
        else:
            exit_display = Text("-", style="dim")

        duration_display = Text(f"{duration}s" if duration != "-" and duration is not None else "-", style="dim")

        table.add_row(str(i), command, status_display, exit_display, duration_display)

    return table


def print_run_summary(results: list, run_id: str = None) -> None:
    total = len(results)
    passed = sum(1 for r in results if r.get("status") in ("passed", "success", "completed"))
    failed = sum(1 for r in results if r.get("status") in ("failed", "error"))
    skipped = sum(1 for r in results if r.get("status") == "skipped")

    console.print()
    summary = Text()
    summary.append("Summary: ", style="bold")
    summary.append(f"{total} total, ", style="white")
    summary.append(f"{passed} passed", style="green")
    if failed > 0:
        summary.append(f", {failed} failed", style="red")
    if skipped > 0:
        summary.append(f", {skipped} skipped", style="yellow")
    if run_id:
        summary.append(f"  [run: {run_id}]", style="dim")

    console.print(summary)
