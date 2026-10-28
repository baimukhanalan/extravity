from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock

_lock = Lock()
_last_run: dict = {"status": "never_run"}
_credentials: dict = {"status": "never_checked"}
_preflight: dict = {"status": "never_run"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def start(*, dry_run: bool, source_count: int) -> None:
    with _lock:
        _last_run.clear()
        _last_run.update({
            "status": "running",
            "started_at": _now(),
            "dry_run": dry_run,
            "source_count": source_count,
        })


def finish(results: list[dict]) -> None:
    errors = [str(result["error"]) for result in results if result.get("error")]
    with _lock:
        _last_run.update({
            "status": "degraded" if errors else "ok",
            "completed_at": _now(),
            "errors": errors[:10],
            "posts": sum(int(result.get("posts", 0) or 0) for result in results),
            "candidates": sum(int(result.get("candidates", 0) or 0) for result in results),
            "media_failed": sum(int(result.get("media_failed", 0) or 0) for result in results),
            "retryable_sources": [
                result.get("hashtag") or result.get("profile") or "tagged"
                for result in results
                if result.get("retryable") is True
            ][:30],
        })


def fail(error: Exception) -> None:
    with _lock:
        _last_run.update({
            "status": "failed",
            "completed_at": _now(),
            "errors": [str(error)],
        })


def credentials_valid(identity: dict) -> None:
    with _lock:
        _credentials.clear()
        _credentials.update({
            "status": "valid",
            "checked_at": _now(),
            "account_id_matches": bool(identity.get("id")),
            "account_type": identity.get("account_type") or None,
            "token_verified": bool(identity.get("token_verified")),
            "granted_scopes": list(identity.get("token_scopes") or []),
            "token_expires_at": identity.get("token_expires_at"),
            "data_access_expires_at": identity.get("data_access_expires_at"),
            "token_expires_in_days": identity.get("token_expires_in_days"),
            "data_access_expires_in_days": identity.get("data_access_expires_in_days"),
        })


def credentials_invalid(error: Exception) -> None:
    with _lock:
        _credentials.clear()
        _credentials.update({
            "status": "invalid",
            "checked_at": _now(),
            "error": str(error)[:300],
        })


def preflight_finished(report: dict) -> None:
    with _lock:
        _preflight.clear()
        _preflight.update({
            "status": "valid" if report.get("ready") else "invalid",
            "checked_at": _now(),
            "source_count": int(report.get("source_count", 0) or 0),
            "failed_sources": [
                source.get("source", "unknown")
                for source in report.get("sources", [])
                if not source.get("ok")
            ][:30],
        })


def preflight_failed(error: Exception) -> None:
    with _lock:
        _preflight.clear()
        _preflight.update({
            "status": "invalid",
            "checked_at": _now(),
            "error": str(error)[:300],
        })


def snapshot() -> dict:
    with _lock:
        return {
            **_last_run,
            "credentials": dict(_credentials),
            "preflight": dict(_preflight),
        }
