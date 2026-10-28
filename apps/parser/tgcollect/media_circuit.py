"""Persistent, fail-closed backoff for the Telegram media storage endpoint."""
from __future__ import annotations

import json
import math
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Callable

import httpx
from vercel.blob import (
    BlobAccessError,
    BlobServiceNotAvailable,
    BlobServiceRateLimited,
    BlobStoreSuspendedError,
    BlobUnknownError,
)


BASE_DELAY_SECONDS = 60
MAX_DELAY_SECONDS = 3600


class MediaCircuitOpen(RuntimeError):
    def __init__(self, remaining_seconds: int, reason: str):
        self.remaining_seconds = remaining_seconds
        self.reason = reason
        super().__init__(f"media upload paused for {remaining_seconds}s after {reason}")


def retryable_storage_error(error: Exception) -> str | None:
    response = getattr(error, "response", None)
    status = getattr(response, "status_code", None)
    if status is None:
        status = getattr(error, "status_code", None)
    if isinstance(status, int) and (status == 403 or status == 429 or status >= 500):
        return f"HTTP {status}"
    if isinstance(error, BlobStoreSuspendedError):
        return "Blob store suspended"
    if isinstance(error, BlobAccessError):
        return "Blob access denied"
    if isinstance(error, BlobServiceRateLimited):
        return "Blob rate limited"
    if isinstance(error, (BlobServiceNotAvailable, BlobUnknownError)):
        return "Blob unavailable"
    if isinstance(error, (httpx.TransportError, httpx.TimeoutException)):
        return "media transport unavailable"
    return None


class MediaUploadCircuit:
    def __init__(self, root: Path | str, clock: Callable[[], float] = time.time):
        self.root = Path(root)
        self.path = self.root / ".media-upload-circuit.json"
        self.clock = clock

    def status(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"version": 1, "failures": 0, "next_retry_at": 0.0, "last_reason": ""}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if data.get("version") != 1 or not isinstance(data.get("failures"), int) or data["failures"] < 0:
                raise ValueError("invalid failure count")
            if not isinstance(data.get("next_retry_at"), (int, float)) or not math.isfinite(data["next_retry_at"]):
                raise ValueError("invalid retry time")
            if not isinstance(data.get("last_reason"), str):
                raise ValueError("invalid reason")
            return data
        except (OSError, ValueError, TypeError, KeyError) as error:
            raise RuntimeError("persistent media circuit state is unreadable") from error

    def check(self) -> None:
        state = self.status()
        remaining = math.ceil(state["next_retry_at"] - self.clock())
        if remaining > 0:
            raise MediaCircuitOpen(remaining, state["last_reason"])

    def call(self, upload: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        self.check()
        try:
            result = upload(*args, **kwargs)
        except Exception as error:
            reason = retryable_storage_error(error)
            if reason is not None:
                self._record_failure(reason, error)
            raise
        self._record_success()
        return result

    def _record_failure(self, reason: str, error: Exception) -> None:
        previous = self.status()
        failures = min(previous["failures"] + 1, 32)
        delay = min(MAX_DELAY_SECONDS, BASE_DELAY_SECONDS * (2 ** min(failures - 1, 6)))
        requested = getattr(error, "retry_after", 0)
        if isinstance(requested, (int, float)) and math.isfinite(requested):
            delay = max(delay, min(MAX_DELAY_SECONDS, max(0, requested)))
        self._save({"version": 1, "failures": failures, "next_retry_at": self.clock() + delay, "last_reason": reason})

    def _record_success(self) -> None:
        if self.status()["failures"]:
            self._save({"version": 1, "failures": 0, "next_retry_at": 0.0, "last_reason": ""})

    def _save(self, data: dict[str, Any]) -> None:
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(self.root, 0o700)
        descriptor, temp_name = tempfile.mkstemp(prefix=".circuit-", dir=self.root)
        try:
            os.chmod(temp_name, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                json.dump(data, output, sort_keys=True)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temp_name, self.path)
            directory = os.open(self.root, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)
