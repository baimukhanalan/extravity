"""Process-local status for periodic parser jobs without source payloads or secrets."""
from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock

_lock = Lock()
_jobs: dict[str, dict] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def registered(job_id: str) -> None:
    with _lock:
        _jobs.setdefault(job_id, {"status": "pending", "registered_at": _now()})


def started(job_id: str) -> None:
    with _lock:
        prior = _jobs.get(job_id, {})
        _jobs[job_id] = {
            "status": "running",
            "registered_at": prior.get("registered_at") or _now(),
            "started_at": _now(),
            "runs": int(prior.get("runs", 0)) + 1,
        }


def finished(job_id: str, results: list[dict] | None = None) -> None:
    results = results or []
    errors = [str(result.get("error"))[:160] for result in results if result.get("error")]
    with _lock:
        prior = _jobs.get(job_id, {})
        prior.update({
            "status": "degraded" if errors else "ok",
            "completed_at": _now(),
            "errors": errors[:10],
            "result_count": len(results),
        })
        _jobs[job_id] = prior


def skipped(job_id: str, reason: str) -> None:
    with _lock:
        prior = _jobs.get(job_id, {})
        prior.update({"status": "skipped", "completed_at": _now(), "reason": reason[:300]})
        _jobs[job_id] = prior


def failed(job_id: str, error: Exception) -> None:
    with _lock:
        prior = _jobs.get(job_id, {})
        prior.update({"status": "failed", "completed_at": _now(), "error": type(error).__name__})
        _jobs[job_id] = prior


def snapshot() -> dict[str, dict]:
    with _lock:
        return {job_id: dict(status) for job_id, status in _jobs.items()}


def reset() -> None:
    with _lock:
        _jobs.clear()
