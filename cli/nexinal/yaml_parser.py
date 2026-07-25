"""YAML file parser for nexinal CLI."""

from pathlib import Path
from typing import List, Union, Optional
from dataclasses import dataclass

import yaml


@dataclass
class CommandEntry:
    name: Optional[str]
    command: str
    timeout: Optional[int] = None
    stop_on_fail: bool = False


class YAMLError(Exception):
    pass


def parse_yaml_file(path: str) -> List[Union[str, CommandEntry]]:
    file_path = Path(path)
    if not file_path.exists():
        raise YAMLError(f"File not found: {path}")
    if not file_path.suffix in (".yaml", ".yml"):
        raise YAMLError(f"Not a YAML file: {path}")

    try:
        with open(file_path, "r") as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        raise YAMLError(f"Invalid YAML syntax in {path}: {e}")
    except IOError as e:
        raise YAMLError(f"Cannot read file {path}: {e}")

    if data is None:
        raise YAMLError(f"Empty YAML file: {path}")
    if not isinstance(data, dict):
        raise YAMLError(f"YAML must be a mapping with a 'commands' key: {path}")

    commands_raw = data.get("commands")
    if commands_raw is None:
        raise YAMLError(f"No 'commands' key found in {path}")
    if not isinstance(commands_raw, list):
        raise YAMLError(f"'commands' must be a list: {path}")
    if len(commands_raw) == 0:
        raise YAMLError(f"'commands' list is empty in {path}")

    parsed: List[Union[str, CommandEntry]] = []
    for i, entry in enumerate(commands_raw):
        if isinstance(entry, str):
            if not entry.strip():
                raise YAMLError(f"Empty command at index {i}")
            parsed.append(entry.strip())
        elif isinstance(entry, dict):
            cmd = entry.get("command")
            if not cmd or not isinstance(cmd, str) or not cmd.strip():
                raise YAMLError(f"Command at index {i} must have a non-empty 'command' field")
            timeout = entry.get("timeout")
            if timeout is not None:
                try:
                    timeout = int(timeout)
                    if timeout <= 0:
                        raise ValueError
                except (TypeError, ValueError):
                    raise YAMLError(f"Invalid timeout at index {i}: must be a positive integer")
            name = entry.get("name")
            stop_on_fail = bool(entry.get("stop_on_fail", False))
            parsed.append(CommandEntry(
                name=name.strip() if isinstance(name, str) else None,
                command=cmd.strip(),
                timeout=timeout,
                stop_on_fail=stop_on_fail,
            ))
        else:
            raise YAMLError(f"Invalid command entry at index {i}: must be a string or mapping")

    return parsed
