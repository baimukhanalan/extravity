from datetime import datetime, timezone
from pathlib import Path

import server
from wacollect.config import linked_session_status, readiness


def test_whatsapp_scheduler_requires_all_absolute_persistent_paths(monkeypatch, tmp_path):
    for name in ("WA_SESSION_PATH", "WA_STATE_PATH", "WA_LOCK_PATH", "WA_BRIDGE_LOCK_PATH"):
        monkeypatch.delenv(name, raising=False)
    ready, reason = server._whatsapp_storage_ready()
    assert ready is False
    assert "WA_BRIDGE_LOCK_PATH" in reason

    monkeypatch.setenv("WA_SESSION_PATH", str(tmp_path / "session"))
    monkeypatch.setenv("WA_STATE_PATH", str(tmp_path / "state.json"))
    monkeypatch.setenv("WA_LOCK_PATH", str(tmp_path / "run.lock"))
    monkeypatch.setenv("WA_BRIDGE_LOCK_PATH", str(tmp_path / "bridge.lock"))
    assert server._whatsapp_storage_ready() == (True, "configured")


def test_whatsapp_linked_session_requires_success_marker(monkeypatch, tmp_path):
    session = tmp_path / "session"
    session.mkdir()
    monkeypatch.setenv("WA_SESSION_PATH", str(session))
    assert server._whatsapp_linked_session_ready() is False
    Path(session, ".ready.json").write_text('{"status":"failed","verifiedAt":null}\n')
    assert server._whatsapp_linked_session_ready() is False
    Path(session, ".ready.json").write_text('{not-json}\n')
    assert server._whatsapp_linked_session_ready() is False
    Path(session, ".ready.json").write_text('{"status":"ready"}\n')
    assert server._whatsapp_linked_session_ready() is False
    Path(session, ".ready.json").write_text('{"status":"ready","verifiedAt":"2026-09-26T00:00:00Z","sourceChatCount":1}\n')
    monkeypatch.setattr(
        "wacollect.config.SESSION_MAX_VERIFICATION_AGE_HOURS", 24 * 365 * 10
    )
    assert server._whatsapp_linked_session_ready() is True


def test_whatsapp_linked_session_fails_closed_when_verification_is_stale(tmp_path, monkeypatch):
    session = tmp_path / "session"
    session.mkdir()
    Path(session, ".ready.json").write_text(
        '{"status":"ready","verifiedAt":"2026-09-24T00:00:00Z"}\n', encoding="utf-8"
    )
    monkeypatch.setattr("wacollect.config.SESSION_MAX_VERIFICATION_AGE_HOURS", 24)
    report = linked_session_status(
        str(session), now=datetime(2026, 9, 26, tzinfo=timezone.utc)
    )
    assert report["ready"] is False
    assert report["status"] == "stale"
    assert "probe" in report["reason"]


def test_whatsapp_readiness_requires_an_enabled_source(tmp_path):
    config = tmp_path / "whatsapp.yaml"
    config.write_text("chats: []\n", encoding="utf-8")
    report = readiness(str(config))
    assert report == {
        "ready": False,
        "enabled_sources": 0,
        "linked_sources": 0,
        "export_sources": 0,
        "reasons": ["enable at least one allowlisted WhatsApp source"],
    }


def test_whatsapp_readiness_fails_closed_on_invalid_config(tmp_path):
    config = tmp_path / "whatsapp.yaml"
    config.write_text("- not-a-mapping\n", encoding="utf-8")
    report = readiness(str(config))
    assert report["ready"] is False
    assert report["reasons"] == ["invalid WhatsApp source config (ValueError)"]


def test_whatsapp_linked_readiness_requires_completed_pairing(monkeypatch, tmp_path):
    config = tmp_path / "whatsapp.yaml"
    snapshot = tmp_path / "chat.jsonl"
    config.write_text(
        "\n".join([
            "chats:",
            "  - key: school",
            "    title: School",
            "    transport: linked_device",
            "    chat_id: 123@g.us",
            f"    path: {snapshot}",
            "    source_url: https://school.example/opportunities",
            "    enabled: true",
        ]) + "\n",
        encoding="utf-8",
    )
    session = tmp_path / "session"
    session.mkdir()
    monkeypatch.setenv("WA_SESSION_PATH", str(session))
    report = readiness(str(config))
    assert report["ready"] is False
    assert report["linked_sources"] == 1
    assert report["reasons"] == ["linked-device session has not completed pairing or probe"]

    Path(session, ".ready.json").write_text('{"status":"ready","verifiedAt":"2026-09-26T00:00:00Z","sourceChatCount":1}\n')
    monkeypatch.setattr(
        "wacollect.config.SESSION_MAX_VERIFICATION_AGE_HOURS", 24 * 365 * 10
    )
    assert readiness(str(config))["ready"] is True

    Path(session, ".ready.json").write_text('{"status":"ready","verifiedAt":"2026-09-26T00:00:00Z","sourceChatCount":0}\n')
    assert readiness(str(config))["reasons"] == ["linked-device probe found no group or channel sources"]


def test_whatsapp_scheduler_rejects_enabled_placeholder_source(monkeypatch, tmp_path):
    config = tmp_path / "whatsapp.yaml"
    config.write_text(
        "\n".join([
            "chats:",
            "  - key: example_opportunities",
            "    transport: linked_device",
            "    chat_id: 000000000000000000@g.us",
            f"    path: {tmp_path / 'snapshot.jsonl'}",
            "    source_url: https://example.kz/opportunities",
            "    enabled: true",
        ]) + "\n",
        encoding="utf-8",
    )
    session = tmp_path / "session"
    session.mkdir()
    Path(session, ".ready.json").write_text('{"status":"ready","verifiedAt":"2026-09-26T00:00:00Z","sourceChatCount":1}\n')
    monkeypatch.setenv("WA_SESSION_PATH", str(session))
    monkeypatch.setattr("wacollect.config.SESSION_MAX_VERIFICATION_AGE_HOURS", 24 * 365 * 10)
    assert readiness(str(config))["reasons"] == ["replace placeholder WhatsApp source before scheduling"]


def test_whatsapp_linked_source_rejects_direct_chat_id(tmp_path):
    config = tmp_path / "whatsapp.yaml"
    config.write_text(
        "\n".join([
            "chats:",
            "  - key: private_chat",
            "    title: Private chat",
            "    transport: linked_device",
            "    chat_id: 77000000000@c.us",
            f"    path: {tmp_path / 'chat.jsonl'}",
            "    source_url: https://school.example/opportunities",
            "    enabled: true",
        ]) + "\n",
        encoding="utf-8",
    )
    report = readiness(str(config))
    assert report["ready"] is False
    assert report["reasons"] == ["invalid WhatsApp source config (ValueError)"]


def test_whatsapp_export_source_does_not_require_linked_session(tmp_path):
    config = tmp_path / "whatsapp.yaml"
    export = tmp_path / "chat.txt"
    config.write_text(
        "\n".join([
            "chats:",
            "  - key: school",
            "    title: School",
            "    transport: export",
            f"    path: {export}",
            "    source_url: https://school.example/opportunities",
            "    enabled: true",
        ]) + "\n",
        encoding="utf-8",
    )
    report = readiness(str(config))
    assert report["ready"] is True
    assert report["export_sources"] == 1
