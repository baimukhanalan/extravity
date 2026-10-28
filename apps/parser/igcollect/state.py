from __future__ import annotations

import json
import logging
import os
import threading
from contextlib import contextmanager
from pathlib import Path

import fcntl

from .config import LOCK_PATH, STATE_PATH

log = logging.getLogger("igcollect.state")
MAX_SEEN_PER_HASHTAG = 5_000
_process_lock = threading.Lock()


class InstagramRunInProgress(RuntimeError):
    pass


class InstagramStateCorrupt(RuntimeError):
    """Persistent cursors are unreadable; fail closed instead of replaying posts."""

    pass


@contextmanager
def exclusive_run():
    if not _process_lock.acquire(blocking=False):
        raise InstagramRunInProgress("another Instagram collection run is already active")
    lock_path = Path(LOCK_PATH)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = lock_path.open("a+")
    os.chmod(lock_path, 0o600)
    try:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise InstagramRunInProgress("another Instagram collection run is already active") from error
        yield
    finally:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()
            _process_lock.release()


def load() -> dict[str, list[str]]:
    path = Path(STATE_PATH)
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return {
            str(tag): [str(media_id) for media_id in media_ids][-MAX_SEEN_PER_HASHTAG:]
            for tag, media_ids in raw.items()
            if isinstance(media_ids, list)
        }
    except (json.JSONDecodeError, OSError, TypeError) as error:
        raise InstagramStateCorrupt(
            "Instagram state is unreadable; repair or restore it before collecting"
        ) from error


def save(state: dict[str, list[str]]) -> None:
    path = Path(STATE_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(path)
    os.chmod(path, 0o600)


def unseen(state: dict[str, list[str]], tag: str, media: list[dict]) -> list[dict]:
    seen = set(state.get(tag, []))
    return [item for item in media if str(item.get("id", "")) not in seen]


def mark_seen(state: dict[str, list[str]], tag: str, media: list[dict]) -> None:
    prior = state.get(tag, [])
    current = [str(item.get("id", "")) for item in media if item.get("id")]
    state[tag] = list(dict.fromkeys([*prior, *current]))[-MAX_SEEN_PER_HASHTAG:]
