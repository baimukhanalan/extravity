"""Per-channel read offset.

Storing the id of the last processed post is what makes repeated runs cheap:
the next run asks Telegram only for messages newer than that id, instead of
re-reading history. It also means a crash mid-run re-processes at most one
batch — the ingest endpoint deduplicates the rest.
"""
from __future__ import annotations

import json
import logging
import os
from hashlib import sha256
from pathlib import Path

import httpx

from .config import STATE_PATH, STATE_URL

log = logging.getLogger("tgcollect.state")


def _path() -> Path:
    return Path(STATE_PATH)


def _remote_url() -> str:
    return os.getenv("TG_STATE_URL", STATE_URL).strip()


def _remote_headers() -> dict[str, str]:
    secret = os.getenv("PARSER_INGEST_SECRET", "").strip()
    if not secret:
        raise RuntimeError("PARSER_INGEST_SECRET is required for remote Telegram state")
    return {"Authorization": f"Bearer {secret}"}


def load() -> dict[str, int]:
    remote_url = _remote_url()
    if remote_url:
        try:
            response = httpx.get(remote_url, headers=_remote_headers(), timeout=15.0, follow_redirects=False)
            response.raise_for_status()
            data = response.json().get("state", {})
            if not isinstance(data, dict):
                raise ValueError("invalid state payload")
            return {str(key): int(value) for key, value in data.items()}
        except (httpx.HTTPError, TypeError, ValueError) as error:
            raise RuntimeError("Remote Telegram state is unavailable") from error

    p = _path()
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return {str(k): int(v) for k, v in data.items() if isinstance(v, (int, float, str))}
    except (json.JSONDecodeError, ValueError, OSError) as e:
        log.warning("State file unreadable (%s) — starting from scratch", e)
        return {}


def save(state: dict[str, int]) -> None:
    remote_url = _remote_url()
    if remote_url:
        try:
            response = httpx.put(
                remote_url,
                headers={**_remote_headers(), "Content-Type": "application/json"},
                json={"state": {str(key): str(int(value)) for key, value in state.items()}},
                timeout=15.0,
                follow_redirects=False,
            )
            response.raise_for_status()
            return
        except (httpx.HTTPError, TypeError, ValueError) as error:
            raise RuntimeError("Remote Telegram state could not be saved") from error

    p = _path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
    os.chmod(tmp, 0o600)
    tmp.replace(p)  # atomic: a killed process never leaves half a file
    os.chmod(p, 0o600)


def last_id(state: dict[str, int], username: str) -> int:
    return int(state.get(username, 0))


def set_last_id(state: dict[str, int], username: str, post_id: int) -> None:
    if post_id > last_id(state, username):
        state[username] = int(post_id)


def backfill_cursor(state: dict[str, int], username: str) -> int | None:
    value = state.get(f"__backfill__:{username}")
    return int(value) if value is not None else None


def set_backfill_cursor(state: dict[str, int], username: str, post_id: int) -> None:
    state[f"__backfill__:{username}"] = max(0, int(post_id))


def initialize_legacy_backfill(state: dict[str, int], username: str) -> bool:
    if backfill_cursor(state, username) is not None or last_id(state, username) <= 0:
        return False
    set_backfill_cursor(state, username, last_id(state, username))
    return True


def _fingerprint_key(username: str, post_id: int) -> str:
    return f"__revision__:{username}:{post_id}"


def post_fingerprint(post: dict) -> int:
    media = ":".join(str(item.get("platform_media_id", "")) for item in post.get("media", []))
    payload = f"{post.get('text', '')}\0{media}"
    return int.from_bytes(sha256(payload.encode("utf-8")).digest(), "big")


def known_fingerprint(state: dict[str, int], username: str, post_id: int) -> int | None:
    return state.get(_fingerprint_key(username, post_id))


def remember_posts(state: dict[str, int], username: str, posts: list[dict], limit: int = 64) -> None:
    prefix = f"__revision__:{username}:"
    for post in posts:
        if post.get("_skip_reason") or not str(post.get("text", "")).strip():
            continue
        state[_fingerprint_key(username, int(post["id"]))] = post_fingerprint(post)
    keys = [key for key in state if key.startswith(prefix)]
    keys.sort(key=lambda key: int(key.removeprefix(prefix)), reverse=True)
    for key in keys[limit:]:
        del state[key]
