"""Command execution engine for nexinal CLI."""

import time
from typing import List, Union, Optional
from dataclasses import dataclass, field

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from nexinal.api import api_post, APIError, AuthError, ConnectionError_
from nexinal.config import set_last_run_id, get_token
from nexinal.display import print_result, print_error, print_run_summary, console
from nexinal.yaml_parser import CommandEntry


@dataclass
class RunResult:
    run_id: Optional[str] = None
    results: List[dict] = field(default_factory=list)
    success: bool = True
    error: Optional[str] = None


def run_commands(
    commands: List[Union[str, CommandEntry]],
    stop_on_fail: bool = False,
) -> RunResult:
    if not get_token():
        print_error("Not authenticated. Run: nexinal auth <token>")
        return RunResult(success=False, error="Not authenticated")

    command_strings: List[str] = []
    entry_map: dict = {}
    for i, cmd in enumerate(commands):
        if isinstance(cmd, CommandEntry):
            command_strings.append(cmd.command)
            entry_map[i] = cmd
        else:
            command_strings.append(cmd)

    total = len(command_strings)
    result = RunResult()

    try:
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
            transient=True,
        ) as progress:
            task = progress.add_task(f"Running {total} command(s)...", total=total)

            for i, cmd_str in enumerate(command_strings):
                entry = entry_map.get(i)
                label = entry.name if entry and entry.name else cmd_str
                if len(label) > 60:
                    label = label[:57] + "..."
                progress.update(task, description=f"[{i+1}/{total}] {label}")

                try:
                    start = time.time()
                    response = api_post("/run", {"commands": [cmd_str]})
                    data = response.get("data", response)
                    duration = round(time.time() - start, 3)

                    run_id = data.get("id")
                    if run_id:
                        result.run_id = run_id
                        set_last_run_id(run_id)

                    cmd_results = data.get("results", [])
                    if cmd_results:
                        for cr in cmd_results:
                            cr.setdefault("command", cmd_str)
                            result.results.append(cr)

                        first = cmd_results[0]
                        status = first.get("status", "unknown")
                        if status in ("failed", "error") and stop_on_fail:
                            print_result(first)
                            result.success = False
                            result.error = f"Command failed: {cmd_str}"
                            console.print(f"[bold yellow]Stopped: stop_on_fail is enabled[/]")
                            break
                        print_result(first)
                    else:
                        entry_result = {
                            "command": cmd_str,
                            "status": data.get("status", "completed"),
                            "stdout": data.get("stdout", data.get("output", data.get("detail", ""))),
                            "exit_code": data.get("exit_code", 0),
                            "duration_ms": data.get("total_duration_ms", duration * 1000),
                        }
                        result.results.append(entry_result)
                        print_result(entry_result)

                except AuthError as e:
                    print_error(str(e))
                    result.success = False
                    result.error = str(e)
                    break
                except ConnectionError_ as e:
                    print_error(str(e))
                    result.success = False
                    result.error = str(e)
                    break
                except APIError as e:
                    entry_result = {
                        "command": cmd_str,
                        "status": "error",
                        "output": str(e),
                        "exit_code": None,
                        "duration": None,
                    }
                    result.results.append(entry_result)
                    print_result(entry_result)
                    if stop_on_fail:
                        result.success = False
                        result.error = str(e)
                        break

                progress.advance(task)

    except KeyboardInterrupt:
        console.print("\n[bold yellow]Interrupted by user[/]")
        result.success = False
        result.error = "Interrupted"
        return result

    print_run_summary(result.results, result.run_id)
    return result


def run_single_command(command: str, stop_on_fail: bool = False) -> RunResult:
    return run_commands([command], stop_on_fail=stop_on_fail)
