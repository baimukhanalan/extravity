"""Cross-process single-worker lock for one Telethon session/state pair."""
from __future__ import annotations

import fcntl
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, TextIO

from .config import LOCK_PATH


class TelegramRunLocked(RuntimeError):
    """Another process already owns the Telegram collector session."""


@contextmanager
def acquire() -> Iterator[None]:
    path = Path(LOCK_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    handle: TextIO = path.open("a+", encoding="utf-8")
    os.chmod(path, 0o600)
    try:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise TelegramRunLocked("another Telegram collector run is active") from exc
        handle.seek(0)
        handle.truncate()
        handle.write(str(os.getpid()))
        handle.flush()
        yield
    finally:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()
