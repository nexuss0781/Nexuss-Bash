"""API client for Nexuss Bash."""

import json
from typing import Optional, Any

import requests
from requests.exceptions import ConnectionError, HTTPError, RequestException, Timeout

from nexinal.config import get_api_url, get_token


class APIError(Exception):
    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class AuthError(APIError):
    pass


class ConnectionError_(APIError):
    pass


def _build_headers() -> dict:
    headers = {"Content-Type": "application/json"}
    token = get_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _build_url(path: str) -> str:
    base = get_api_url().rstrip("/")
    path = path.lstrip("/")
    return f"{base}/{path}"


def api_get(path: str) -> dict:
    url = _build_url(path)
    try:
        resp = requests.get(url, headers=_build_headers(), timeout=30)
        resp.raise_for_status()
        return resp.json()
    except HTTPError as e:
        status = e.response.status_code if e.response is not None else None
        if status == 401:
            raise AuthError("Authentication failed. Run: nexinal auth <token>", status)
        if status == 404:
            raise APIError(f"Not found: {path}", status)
        raise APIError(f"HTTP {status}: {e}", status)
    except ConnectionError:
        raise ConnectionError_(f"Cannot connect to {url}. Check your network and API URL.")
    except Timeout:
        raise APIError(f"Request timed out: {url}")
    except RequestException as e:
        raise APIError(f"Request failed: {e}")
    except json.JSONDecodeError:
        raise APIError("Invalid JSON response from server")


def api_post(path: str, data: Optional[dict] = None) -> dict:
    url = _build_url(path)
    try:
        resp = requests.post(url, headers=_build_headers(), json=data or {}, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except HTTPError as e:
        status = e.response.status_code if e.response is not None else None
        if status == 401:
            raise AuthError("Authentication failed. Run: nexinal auth <token>", status)
        if status == 404:
            raise APIError(f"Not found: {path}", status)
        body = ""
        if e.response is not None:
            try:
                body = e.response.json().get("detail", e.response.text)
            except Exception:
                body = e.response.text
        raise APIError(f"HTTP {status}: {body}", status)
    except ConnectionError:
        raise ConnectionError_(f"Cannot connect to {url}. Check your network and API URL.")
    except Timeout:
        raise APIError(f"Request timed out: {url}")
    except RequestException as e:
        raise APIError(f"Request failed: {e}")
    except json.JSONDecodeError:
        raise APIError("Invalid JSON response from server")


def api_post_file(path: str, file_path: str) -> dict:
    url = _build_url(path)
    token = get_token()
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        with open(file_path, "rb") as f:
            files = {"file": (file_path.split("/")[-1], f)}
            resp = requests.post(url, headers=headers, files=files, timeout=60)
        resp.raise_for_status()
        return resp.json()
    except HTTPError as e:
        status = e.response.status_code if e.response is not None else None
        if status == 401:
            raise AuthError("Authentication failed. Run: nexinal auth <token>", status)
        raise APIError(f"HTTP {status}: {e}", status)
    except ConnectionError:
        raise ConnectionError_(f"Cannot connect to {url}. Check your network and API URL.")
    except Timeout:
        raise APIError(f"Request timed out: {url}")
    except RequestException as e:
        raise APIError(f"Request failed: {e}")
    except FileNotFoundError:
        raise APIError(f"File not found: {file_path}")
    except json.JSONDecodeError:
        raise APIError("Invalid JSON response from server")


def api_delete(path: str) -> dict:
    url = _build_url(path)
    try:
        resp = requests.delete(url, headers=_build_headers(), timeout=30)
        resp.raise_for_status()
        return resp.json()
    except HTTPError as e:
        status = e.response.status_code if e.response is not None else None
        if status == 401:
            raise AuthError("Authentication failed. Run: nexinal auth <token>", status)
        raise APIError(f"HTTP {status}: {e}", status)
    except ConnectionError:
        raise ConnectionError_(f"Cannot connect to {url}. Check your network and API URL.")
    except Timeout:
        raise APIError(f"Request timed out: {url}")
    except RequestException as e:
        raise APIError(f"Request failed: {e}")
    except json.JSONDecodeError:
        raise APIError("Invalid JSON response from server")


def test_connection() -> bool:
    try:
        url = _build_url("/health")
        resp = requests.get(url, timeout=10)
        return resp.status_code == 200
    except Exception:
        return False
