"""Atomic per-chat set of WhatsApp export message fingerprints."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from .config import STATE_PATH

log = logging.getLogger("wacollect.state")
MAX_SEEN_PER_CHAT = 20_000


def _path() -> Path:
    return Path(STATE_PATH)


def load() -> dict[str, list[str]]:
    path = _path()
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return {
            str(key): [str(value) for value in values][-MAX_SEEN_PER_CHAT:]
            for key, values in raw.items()
            if isinstance(values, list)
        }
    except (json.JSONDecodeError, OSError, TypeError) as error:
        log.warning("WhatsApp state unreadable (%s) — starting without offsets", error)
        return {}


def save(state: dict[str, list[str]]) -> None:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
    os.chmod(tmp, 0o600)
    tmp.replace(path)
    os.chmod(path, 0o600)


def unseen(state: dict[str, list[str]], chat_key: str, messages: list[dict]) -> list[dict]:
    seen = set(state.get(chat_key, []))
    return [message for message in messages if message["id"] not in seen]


def mark_seen(state: dict[str, list[str]], chat_key: str, messages: list[dict]) -> None:
    prior = state.get(chat_key, [])
    combined = list(dict.fromkeys([*prior, *(message["id"] for message in messages)]))
    state[chat_key] = combined[-MAX_SEEN_PER_CHAT:]
