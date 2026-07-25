"""Configuration manager for parad CLI."""

import json
import os
from pathlib import Path
from typing import Optional

CONFIG_DIR = Path.home() / ".parad"
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULT_API_URL = "https://nexuss-bash.onrender.com"


def ensure_config_dir() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def load_config() -> dict:
    if not CONFIG_FILE.exists():
        return {"api_url": DEFAULT_API_URL, "token": None, "last_run_id": None}
    try:
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {"api_url": DEFAULT_API_URL, "token": None, "last_run_id": None}


def save_config(config: dict) -> None:
    ensure_config_dir()
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)


def get_token() -> Optional[str]:
    config = load_config()
    return config.get("token")


def get_api_url() -> str:
    config = load_config()
    return config.get("api_url", DEFAULT_API_URL)


def set_token(token: str) -> None:
    config = load_config()
    config["token"] = token
    save_config(config)


def set_api_url(url: str) -> None:
    config = load_config()
    config["api_url"] = url.rstrip("/")
    save_config(config)


def set_last_run_id(run_id: str) -> None:
    config = load_config()
    config["last_run_id"] = run_id
    save_config(config)


def get_last_run_id() -> Optional[str]:
    config = load_config()
    return config.get("last_run_id")


def remove_token() -> None:
    config = load_config()
    config["token"] = None
    save_config(config)


def clear_config() -> None:
    if CONFIG_FILE.exists():
        CONFIG_FILE.unlink()
