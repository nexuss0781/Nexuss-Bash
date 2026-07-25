"""Basic tests for parad CLI."""

import json
import os
import tempfile
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

from parad.config import (
    load_config, save_config, get_token, get_api_url,
    set_token, set_api_url, remove_token, CONFIG_FILE, DEFAULT_API_URL,
)
from parad.yaml_parser import parse_yaml_file, YAMLError, CommandEntry


@pytest.fixture(autouse=True)
def temp_config(tmp_path, monkeypatch):
    """Use a temp config file for each test."""
    monkeypatch.setattr("parad.config.CONFIG_DIR", tmp_path / ".parad")
    monkeypatch.setattr("parad.config.CONFIG_FILE", tmp_path / ".parad" / "config.json")
    (tmp_path / ".parad").mkdir(exist_ok=True)
    yield tmp_path


class TestConfig:
    def test_default_config(self):
        config = load_config()
        assert config["api_url"] == DEFAULT_API_URL
        assert config["token"] is None
        assert config["last_run_id"] is None

    def test_save_and_load(self, temp_config):
        config = {"api_url": "https://test.example.com", "token": "test123", "last_run_id": "run-1"}
        save_config(config)
        loaded = load_config()
        assert loaded["api_url"] == "https://test.example.com"
        assert loaded["token"] == "test123"
        assert loaded["last_run_id"] == "run-1"

    def test_set_token(self):
        set_token("mytoken")
        assert get_token() == "mytoken"

    def test_set_api_url(self):
        set_api_url("https://custom.example.com/")
        assert get_api_url() == "https://custom.example.com"

    def test_remove_token(self):
        set_token("mytoken")
        remove_token()
        assert get_token() is None

    def test_missing_config(self, temp_config, monkeypatch):
        monkeypatch.setattr("parad.config.CONFIG_FILE", temp_config / "nonexistent" / "config.json")
        config = load_config()
        assert config["api_url"] == DEFAULT_API_URL
        assert config["token"] is None

    def test_corrupt_config(self, temp_config, monkeypatch):
        config_path = temp_config / ".parad" / "config.json"
        config_path.write_text("NOT JSON {{{")
        monkeypatch.setattr("parad.config.CONFIG_FILE", config_path)
        config = load_config()
        assert config["api_url"] == DEFAULT_API_URL


class TestYAMLParser:
    def test_simple_list(self, tmp_path):
        yaml_file = tmp_path / "test.yaml"
        yaml_file.write_text('commands:\n  - "echo hello"\n  - "whoami"\n')
        result = parse_yaml_file(str(yaml_file))
        assert len(result) == 2
        assert result[0] == "echo hello"
        assert result[1] == "whoami"

    def test_detailed_list(self, tmp_path):
        yaml_file = tmp_path / "test.yaml"
        yaml_file.write_text("""
commands:
  - name: "Say hello"
    command: "echo hello"
    timeout: 30
    stop_on_fail: true
  - name: "List files"
    command: "ls -la"
    timeout: 15
""")
        result = parse_yaml_file(str(yaml_file))
        assert len(result) == 2
        assert isinstance(result[0], CommandEntry)
        assert result[0].name == "Say hello"
        assert result[0].command == "echo hello"
        assert result[0].timeout == 30
        assert result[0].stop_on_fail is True
        assert result[1].timeout == 15
        assert result[1].stop_on_fail is False

    def test_mixed_list(self, tmp_path):
        yaml_file = tmp_path / "test.yaml"
        yaml_file.write_text("""
commands:
  - "echo simple"
  - name: "Complex"
    command: "echo complex"
    timeout: 10
""")
        result = parse_yaml_file(str(yaml_file))
        assert len(result) == 2
        assert result[0] == "echo simple"
        assert isinstance(result[1], CommandEntry)
        assert result[1].command == "echo complex"

    def test_file_not_found(self):
        with pytest.raises(YAMLError, match="not found"):
            parse_yaml_file("/nonexistent/file.yaml")

    def test_not_yaml_extension(self, tmp_path):
        txt_file = tmp_path / "test.txt"
        txt_file.write_text("hello")
        with pytest.raises(YAMLError, match="Not a YAML file"):
            parse_yaml_file(str(txt_file))

    def test_empty_yaml(self, tmp_path):
        yaml_file = tmp_path / "empty.yaml"
        yaml_file.write_text("")
        with pytest.raises(YAMLError, match="Empty YAML"):
            parse_yaml_file(str(yaml_file))

    def test_no_commands_key(self, tmp_path):
        yaml_file = tmp_path / "nokey.yaml"
        yaml_file.write_text("other_key:\n  - thing\n")
        with pytest.raises(YAMLError, match="No 'commands' key"):
            parse_yaml_file(str(yaml_file))

    def test_empty_commands(self, tmp_path):
        yaml_file = tmp_path / "empty.yaml"
        yaml_file.write_text("commands: []\n")
        with pytest.raises(YAMLError, match="empty"):
            parse_yaml_file(str(yaml_file))

    def test_invalid_command_entry(self, tmp_path):
        yaml_file = tmp_path / "bad.yaml"
        yaml_file.write_text("commands:\n  - 12345\n")
        with pytest.raises(YAMLError, match="Invalid command"):
            parse_yaml_file(str(yaml_file))

    def test_empty_command_string(self, tmp_path):
        yaml_file = tmp_path / "bad.yaml"
        yaml_file.write_text('commands:\n  - ""\n')
        with pytest.raises(YAMLError, match="Empty command"):
            parse_yaml_file(str(yaml_file))


class TestCLIHelp:
    def test_main_help(self):
        from click.testing import CliRunner
        from parad.cli import main
        runner = CliRunner()
        result = runner.invoke(main, ["--help"])
        assert result.exit_code == 0
        assert "parad" in result.output.lower() or "Nexuss" in result.output

    def test_version(self):
        from click.testing import CliRunner
        from parad.cli import main
        runner = CliRunner()
        result = runner.invoke(main, ["--version"])
        assert result.exit_code == 0
        assert "1.0.0" in result.output
