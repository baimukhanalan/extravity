from fastapi.responses import JSONResponse

import server
from parser import runtime_health


def test_runtime_health_records_completed_and_failed_jobs():
    runtime_health.reset()
    runtime_health.registered("collect-web")
    runtime_health.started("collect-web")
    runtime_health.finished("collect-web", [{"created": 2}, {"error": "source unavailable"}])

    status = runtime_health.snapshot()["collect-web"]
    assert status["status"] == "degraded"
    assert status["runs"] == 1
    assert status["result_count"] == 2
    assert status["errors"] == ["source unavailable"]

    runtime_health.started("collect-web")
    runtime_health.failed("collect-web", RuntimeError("secret-bearing message must not leak"))
    status = runtime_health.snapshot()["collect-web"]
    assert status["status"] == "failed"
    assert status["error"] == "RuntimeError"
    assert "secret-bearing" not in str(status)
    runtime_health.reset()


def test_automation_readiness_requires_requested_jobs_and_live_telegram(monkeypatch):
    monkeypatch.setenv("WEB_SCHEDULE_ENABLED", "true")
    monkeypatch.setenv("NEWS_SCHEDULE_ENABLED", "false")
    monkeypatch.setenv("INSTAGRAM_SCHEDULE_ENABLED", "false")
    monkeypatch.setenv("WHATSAPP_SCHEDULE_ENABLED", "false")
    monkeypatch.setenv("TELEGRAM_LIVE_ENABLED", "true")
    payload = {
        "scheduled_jobs": ["collect-web"],
        "scheduled_runs": {"collect-web": {"status": "ok"}},
        "telegram_live": {"state": "connected"},
        "telegram_storage": {"ready": True, "reason": "configured"},
    }

    assert server._automation_readiness(payload) == {"ready": True, "reasons": [], "health": payload}

    payload["scheduled_runs"]["collect-web"]["status"] = "skipped"
    payload["telegram_live"]["state"] = "retrying"
    result = server._automation_readiness(payload)
    assert result["ready"] is False
    assert result["reasons"] == [
        "collect-web last run is skipped",
        "Telegram live collector is retrying",
    ]


def test_ready_endpoint_uses_503_for_degraded_requested_automation(monkeypatch):
    monkeypatch.setattr(server, "health", lambda: {
        "scheduled_jobs": [],
        "scheduled_runs": {},
        "telegram_live": {"state": "stopped"},
        "telegram_storage": {"ready": False, "reason": "missing paths"},
    })
    monkeypatch.setenv("WEB_SCHEDULE_ENABLED", "true")
    monkeypatch.setenv("NEWS_SCHEDULE_ENABLED", "false")
    monkeypatch.setenv("INSTAGRAM_SCHEDULE_ENABLED", "false")
    monkeypatch.setenv("WHATSAPP_SCHEDULE_ENABLED", "false")
    monkeypatch.setenv("TELEGRAM_LIVE_ENABLED", "false")

    response = server.ready()
    assert isinstance(response, JSONResponse)
    assert response.status_code == 503
    assert b"collect-web was requested but is not scheduled" in response.body


def test_schedule_can_defer_first_run_without_pausing_job(monkeypatch):
    seen = {}

    class Scheduler:
        def add_job(self, *_args, **kwargs):
            seen.update(kwargs)

    monkeypatch.setattr(server, "scheduler", Scheduler())
    monkeypatch.setenv("PARSER_RUN_ON_STARTUP", "false")
    runtime_health.reset()
    server._add_interval_job(lambda: None, minutes=60, job_id="collect-web")

    assert "next_run_time" not in seen
    assert runtime_health.snapshot()["collect-web"]["status"] == "pending"
    runtime_health.reset()


def test_stateless_telegram_storage_is_ready(monkeypatch):
    monkeypatch.setenv("TG_SESSION_STRING", "session-secret")
    monkeypatch.setenv("TG_STATE_URL", "https://site.example/api/parser/telegram-state")
    monkeypatch.setenv("TG_LOCK_PATH", "/tmp/telegram.lock")

    assert server._telegram_storage_ready() == (True, "configured (stateless)")


def test_stateless_telegram_storage_requires_complete_secure_configuration(monkeypatch):
    monkeypatch.setenv("TG_SESSION_STRING", "session-secret")
    monkeypatch.delenv("TG_STATE_URL", raising=False)
    monkeypatch.setenv("TG_LOCK_PATH", "/tmp/telegram.lock")
    assert server._telegram_storage_ready()[0] is False

    monkeypatch.setenv("TG_STATE_URL", "http://site.example/api/parser/telegram-state")
    assert server._telegram_storage_ready() == (False, "TG_STATE_URL must use HTTPS")
