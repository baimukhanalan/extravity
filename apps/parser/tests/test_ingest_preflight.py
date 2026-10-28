import httpx
import pytest
from fastapi import HTTPException

import server
from parser import ingest
from tgcollect import live
from tgcollect.client import TelegramUnavailable


def test_preflight_rejects_missing_secret_without_network(monkeypatch):
    monkeypatch.setattr(ingest, "INGEST_SECRET", "")
    monkeypatch.setattr(ingest.httpx, "get", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("network")))

    assert ingest.preflight_ingest_target() == {"ready": False, "reason": "PARSER_INGEST_SECRET is not set"}


def test_preflight_rejects_remote_plain_http_without_network(monkeypatch):
    monkeypatch.setattr(ingest, "INGEST_SECRET", "test-secret")
    monkeypatch.setattr(ingest, "APP_URL", "http://example.org")
    monkeypatch.setattr(ingest.httpx, "get", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("network")))

    assert ingest.preflight_ingest_target()["reason"] == "APP_URL must be HTTPS or local loopback"


def test_preflight_verifies_authenticated_media_capable_target_without_writes(monkeypatch):
    monkeypatch.setattr(ingest, "INGEST_SECRET", "test-secret")
    monkeypatch.setattr(ingest, "APP_URL", "https://extravity.example")
    calls = []

    def fake_get(url, **kwargs):
        calls.append((url, kwargs))
        return httpx.Response(200, json={"ok": True, "ingest": True, "mediaConfigured": True, "maxBatchSize": 200})

    monkeypatch.setattr(ingest.httpx, "get", fake_get)

    assert ingest.preflight_ingest_target() == {"ready": True, "reason": "verified", "max_batch_size": 200}
    assert calls[0][0] == "https://extravity.example/api/parser/ingest"
    assert calls[0][1]["follow_redirects"] is False
    assert calls[0][1]["headers"]["Authorization"] == "Bearer test-secret"


def test_preflight_rejects_unauthorized_or_media_unconfigured_target(monkeypatch):
    monkeypatch.setattr(ingest, "INGEST_SECRET", "test-secret")
    monkeypatch.setattr(ingest, "APP_URL", "https://extravity.example")
    monkeypatch.setattr(ingest.httpx, "get", lambda *_args, **_kwargs: httpx.Response(401))
    assert ingest.preflight_ingest_target()["reason"] == "ingest target returned HTTP 401"

    monkeypatch.setattr(ingest.httpx, "get", lambda *_args, **_kwargs: httpx.Response(
        200, json={"ok": True, "ingest": True, "mediaConfigured": False},
    ))
    assert ingest.preflight_ingest_target()["reason"] == "ingest target has no media storage"


def test_volume_preflight_requires_matching_site_capability(monkeypatch, tmp_path):
    monkeypatch.setenv("MEDIA_STORAGE_BACKEND", "railway_volume")
    monkeypatch.setenv("SOURCE_MEDIA_ROOT", str(tmp_path / "source-media"))
    monkeypatch.setattr(ingest, "INGEST_SECRET", "test-secret")
    monkeypatch.setattr(ingest, "APP_URL", "https://extravity.example")
    monkeypatch.setattr(ingest.httpx, "get", lambda *_args, **_kwargs: httpx.Response(
        200, json={"ok": True, "ingest": True, "mediaConfigured": True, "mediaBackend": "vercel_blob"},
    ))
    assert ingest.preflight_ingest_target()["reason"] == "ingest target does not support Railway source media"
    monkeypatch.setattr(ingest.httpx, "get", lambda *_args, **_kwargs: httpx.Response(
        200, json={"ok": True, "ingest": True, "mediaConfigured": True, "mediaBackend": "railway_volume"},
    ))
    assert ingest.preflight_ingest_target()["ready"] is True


def test_telegram_archive_preflight_requires_matching_site_capability(monkeypatch):
    monkeypatch.setenv("MEDIA_STORAGE_BACKEND", "telegram_archive")
    monkeypatch.setattr(ingest, "INGEST_SECRET", "test-secret")
    monkeypatch.setattr(ingest, "APP_URL", "https://extravity.example")
    monkeypatch.setattr(ingest, "storage_readiness", lambda *_args, **_kwargs: {
        "backend": "telegram_archive", "ready": True, "reason": "ready",
    })
    monkeypatch.setattr(ingest.httpx, "get", lambda *_args, **_kwargs: httpx.Response(
        200, json={"ok": True, "ingest": True, "mediaConfigured": True, "mediaBackend": "vercel_blob"},
    ))
    assert ingest.preflight_ingest_target()["reason"] == "ingest target does not support Telegram media archive"
    monkeypatch.setattr(ingest.httpx, "get", lambda *_args, **_kwargs: httpx.Response(
        200, json={"ok": True, "ingest": True, "mediaConfigured": True, "mediaBackend": "telegram_archive"},
    ))
    assert ingest.preflight_ingest_target()["ready"] is True


def test_parser_preflight_endpoint_requires_admin_token(monkeypatch):
    monkeypatch.setattr(server, "ADMIN_TOKEN", "admin-test-token")
    monkeypatch.setattr(ingest, "preflight_ingest_target", lambda: {"ready": True, "reason": "verified"})

    with pytest.raises(HTTPException) as error:
        server.preflight_ingest(x_admin_token="wrong")
    assert error.value.status_code == 401
    response = server.preflight_ingest(x_admin_token="admin-test-token")
    assert response.status_code == 200
    assert response.body == b'{"ready":true,"reason":"verified"}'


def test_scheduled_collectors_skip_source_reads_when_ingest_is_unavailable(monkeypatch):
    monkeypatch.setattr(ingest, "preflight_ingest_target", lambda: {"ready": False, "reason": "offline"})

    def unexpected(*_args, **_kwargs):
        raise AssertionError("collector must not read sources")

    monkeypatch.setattr(server, "run_web_all", unexpected)
    monkeypatch.setattr("igcollect.pipeline.run_all", unexpected)
    monkeypatch.setattr("wacollect.pipeline.run_all", unexpected)

    server._scheduled_run()
    server._scheduled_instagram_run()
    server._scheduled_whatsapp_run()


def test_live_telegram_checks_ingest_before_opening_account(monkeypatch):
    monkeypatch.setattr(ingest, "preflight_ingest_target", lambda: {"ready": False, "reason": "offline"})
    monkeypatch.setattr(live, "build_client", lambda: (_ for _ in ()).throw(AssertionError("account opened")))

    import asyncio

    with pytest.raises(TelegramUnavailable, match="Ingest target is not ready: offline"):
        asyncio.run(live._connected())
