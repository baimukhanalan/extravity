from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime

from wacollect.config import ChatExport
from wacollect.demo import SAMPLE_EXPORT, run_demo
from wacollect.export import parse_export_text
from wacollect.export import read_linked_snapshot
from wacollect.pipeline import messages_to_candidates, run_chat
from wacollect.pipeline import WhatsAppUnavailable, run_all
from wacollect import pipeline, run_lock
import pytest


def chat(path: str = "unused.txt") -> ChatExport:
    return ChatExport(
        key="school_club",
        title="School Club",
        path=path,
        source_url="https://school.example/opportunities",
        category="olympiad",
        transport="export",
    )


def test_android_export_keeps_multiline_message_and_ignores_system_event():
    messages = parse_export_text(SAMPLE_EXPORT, chat_key="school_club")
    assert len(messages) == 2
    assert "Дедлайн подачи заявок" in messages[0]["text"]
    assert messages[0]["sender"] == "Организатор"


def test_ios_brackets_and_mdy_are_supported():
    text = "[9/26/26, 2:15:01 PM] Admin: First line\nSecond line"
    messages = parse_export_text(text, chat_key="club", date_order="mdy")
    assert messages[0]["date"] == "2026-09-26T14:15:01"
    assert messages[0]["text"] == "First line\nSecond line"


def test_message_fingerprint_is_stable_and_chat_scoped():
    one = parse_export_text(SAMPLE_EXPORT, chat_key="one")[0]["id"]
    again = parse_export_text(SAMPLE_EXPORT, chat_key="one")[0]["id"]
    other = parse_export_text(SAMPLE_EXPORT, chat_key="two")[0]["id"]
    assert one == again
    assert one != other


def test_demo_finds_one_candidate():
    result = run_demo()
    assert result["messages"] == 2
    assert result["candidates"] == 1
    assert result["not_opportunity"] == 1
    assert result["preview"][0]["sourceUrl"].startswith("https://example.kz/opportunities?wa_message=")


def test_candidates_share_existing_local_extractor():
    messages = parse_export_text(SAMPLE_EXPORT, chat_key="school_club")
    candidates, stats = messages_to_candidates(messages, chat())
    assert stats == {"messages": 2, "not_opportunity": 1, "candidates": 1}
    assert candidates[0]["categorySlug"] == "olympiad"
    assert candidates[0]["applicationUrl"] == "https://example.kz/apply"
    assert candidates[0]["contentHash"]


def test_whatsapp_expired_deadline_is_flagged_before_ingest():
    messages = [{
        "id": "old-message", "date": "2020-09-20T09:00:00+00:00",
        "text": "Youth Science Olympiad registration is open for school students. "
                "Deadline: September 30, 2020. Apply now: https://example.kz/apply",
        "media": [],
    }]
    candidates, stats = messages_to_candidates(messages, chat())
    assert stats["candidates"] == 1
    assert candidates[0]["_expired"] is True


def test_partial_ingest_failure_does_not_mark_messages_seen(tmp_path, monkeypatch):
    export = tmp_path / "chat.txt"
    export.write_text(SAMPLE_EXPORT, encoding="utf-8")
    configured = chat(str(export))
    monkeypatch.setattr("wacollect.pipeline.MAX_MESSAGE_AGE_DAYS", 10_000)
    monkeypatch.setattr(
        "wacollect.pipeline.post_candidates",
        lambda **kwargs: {"created": 0, "duplicate": 0, "failed": 1},
    )
    state: dict[str, list[str]] = {}
    result = run_chat(configured, state, dry_run=False)
    assert state == {}
    assert result["offset_advanced"] is False


def test_private_export_is_held_without_advancing_offset(tmp_path, monkeypatch):
    export = tmp_path / "chat.txt"
    export.write_text("26.09.2026, 10:00 - User: Просто короткая новость", encoding="utf-8")
    configured = chat(str(export))
    monkeypatch.setattr("wacollect.pipeline.MAX_MESSAGE_AGE_DAYS", 10_000)
    state: dict[str, list[str]] = {}
    result = run_chat(configured, state, dry_run=False)
    assert result["candidates"] == 0
    assert result["source_held"] == "public_channel_provenance_unverified"
    assert state == {}


def test_linked_device_snapshot_is_read_without_export_header(tmp_path):
    snapshot = tmp_path / "chat.jsonl"
    snapshot.write_text(
        '{"id":"ABCD","date":"2026-09-26T09:15:00.000Z","sender":"1@g.us","text":"Announcement"}\n',
        encoding="utf-8",
    )
    messages = read_linked_snapshot(snapshot)
    assert messages == [{
        "id": "ABCD",
        "date": "2026-09-26T09:15:00+00:00",
        "sender": "1@g.us",
        "text": "Announcement",
        "media": [],
        "media_expected": False,
    }]


def test_linked_snapshot_accepts_only_private_local_supported_media(tmp_path):
    media = tmp_path / "poster.jpg"
    media.write_bytes(b"jpeg-content")
    snapshot = tmp_path / "chat.jsonl"
    snapshot.write_text(json.dumps({
        "id": "ABCD",
        "date": "2026-09-26T09:15:00.000Z",
        "sender": "1@g.us",
        "text": "Competition",
        "media": [
            {"path": str(media), "mime_type": "image/jpeg", "platform_media_id": "MID"},
            {"path": "relative.jpg", "mime_type": "image/jpeg", "platform_media_id": "BAD"},
        ],
    }) + "\n", encoding="utf-8")
    messages = read_linked_snapshot(snapshot)
    assert messages[0]["media"] == [{
        "path": str(media),
        "mime_type": "image/jpeg",
        "platform_media_id": "MID",
    }]
    assert messages[0]["media_expected"] is False
    assert messages[0]["media_incomplete"] is True


def test_invalid_snapshot_media_holds_whole_candidate(tmp_path, monkeypatch):
    media = tmp_path / "poster.jpg"
    media.write_bytes(b"jpeg-content")
    snapshot = tmp_path / "chat.jsonl"
    snapshot.write_text(json.dumps({
        "id": "ALBUM",
        "date": "2026-09-26T09:15:00.000Z",
        "sender": "1@g.us",
        "text": "Олимпиада для школьников. Дедлайн 20 ноября 2026. Регистрация https://example.org/apply",
        "media": [
            {"path": str(media), "mime_type": "image/jpeg", "platform_media_id": "FIRST"},
            {"path": "relative.jpg", "mime_type": "image/jpeg", "platform_media_id": "SECOND"},
        ],
        "media_expected": True,
    }, ensure_ascii=False) + "\n", encoding="utf-8")
    configured = ChatExport(
        key="linked", title="Linked opportunities", path=str(snapshot),
        source_url="https://www.whatsapp.com/channel/verified", transport="linked_device", chat_id="1@newsletter", public_provenance=True,
    )
    ingested = []
    monkeypatch.setattr("wacollect.pipeline.MAX_MESSAGE_AGE_DAYS", 10_000)
    monkeypatch.setattr("wacollect.pipeline.post_media", lambda *_args: {"storageKey": "media/first.jpg"})
    monkeypatch.setattr("wacollect.pipeline.post_candidates", lambda **kwargs: ingested.append(kwargs) or {"failed": 0})
    state = {}
    result = run_chat(configured, state, dry_run=False)
    assert result["media_failed"] == 1
    assert result["offset_advanced"] is False
    assert ingested == []
    assert state == {}


def test_linked_candidate_uploads_media_before_ingest(tmp_path, monkeypatch):
    media = tmp_path / "poster.jpg"
    media.write_bytes(b"jpeg-content")
    snapshot = tmp_path / "chat.jsonl"
    snapshot.write_text(json.dumps({
        "id": "ABCD",
        "date": "2026-09-26T09:15:00.000Z",
        "sender": "1@g.us",
        "text": "Олимпиада для школьников. Дедлайн 20 ноября 2026. Регистрация https://example.org/apply",
        "media": [{"path": str(media), "mime_type": "image/jpeg", "platform_media_id": "MID"}],
    }, ensure_ascii=False) + "\n", encoding="utf-8")
    configured = ChatExport(
        key="linked",
        title="Linked opportunities",
        path=str(snapshot),
        source_url="https://www.whatsapp.com/channel/verified",
        transport="linked_device",
        chat_id="1@newsletter",
        public_provenance=True,
    )
    uploaded: list[dict] = []
    ingested: list[dict] = []
    monkeypatch.setattr("wacollect.pipeline.MAX_MESSAGE_AGE_DAYS", 10_000)
    monkeypatch.setattr(
        "wacollect.pipeline.post_media",
        lambda *args: uploaded.append({"args": args}) or {"storageKey": "media/key.jpg"},
    )
    monkeypatch.setattr(
        "wacollect.pipeline.post_candidates",
        lambda **kwargs: ingested.append(kwargs) or {"created": 1, "duplicate": 0, "failed": 0},
    )
    state: dict[str, list[str]] = {}
    result = run_chat(configured, state, dry_run=False)
    assert result["candidates"] == 1
    assert len(uploaded) == 1
    assert ingested[0]["items"][0]["media"] == [{"storageKey": "media/key.jpg"}]
    assert state["linked"] == ["ABCD"]


def test_dry_run_reports_media_count_without_leaking_local_path(tmp_path, monkeypatch):
    media = tmp_path / "poster.jpg"
    media.write_bytes(b"jpeg-content")
    snapshot = tmp_path / "chat.jsonl"
    snapshot.write_text(json.dumps({
        "id": "ABCD",
        "date": "2026-09-26T09:15:00.000Z",
        "sender": "1@g.us",
        "text": "Олимпиада для школьников. Дедлайн 20 ноября 2026. Регистрация https://example.org/apply",
        "media": [{"path": str(media), "mime_type": "image/jpeg", "platform_media_id": "MID"}],
    }, ensure_ascii=False) + "\n", encoding="utf-8")
    configured = ChatExport(
        key="linked",
        title="Linked opportunities",
        path=str(snapshot),
        source_url="https://www.whatsapp.com/channel/verified",
        transport="linked_device",
        chat_id="1@newsletter",
        public_provenance=True,
    )
    monkeypatch.setattr("wacollect.pipeline.MAX_MESSAGE_AGE_DAYS", 10_000)
    result = run_chat(configured, {}, dry_run=True)
    assert result["preview"][0]["mediaCount"] == 1
    assert str(media) not in str(result["preview"])


def test_expected_media_failure_keeps_message_for_retry(tmp_path, monkeypatch):
    snapshot = tmp_path / "chat.jsonl"
    snapshot.write_text(json.dumps({
        "id": "ABCD",
        "date": "2026-09-26T09:15:00.000Z",
        "sender": "1@g.us",
        "text": "Олимпиада для школьников. Дедлайн 20 ноября 2026. Регистрация https://example.org/apply",
        "media": [],
        "media_expected": True,
    }, ensure_ascii=False) + "\n", encoding="utf-8")
    configured = ChatExport(
        key="linked",
        title="Linked opportunities",
        path=str(snapshot),
        source_url="https://www.whatsapp.com/channel/verified",
        transport="linked_device",
        chat_id="1@newsletter",
        public_provenance=True,
    )
    ingested: list[dict] = []
    monkeypatch.setattr("wacollect.pipeline.MAX_MESSAGE_AGE_DAYS", 10_000)
    monkeypatch.setattr(
        "wacollect.pipeline.post_candidates",
        lambda **kwargs: ingested.append(kwargs) or {"created": 1, "duplicate": 0, "failed": 0},
    )
    state: dict[str, list[str]] = {}
    result = run_chat(configured, state, dry_run=False)
    assert result["media_failed"] == 1
    assert result["offset_advanced"] is False
    assert ingested == []
    assert state == {}


def test_partial_media_upload_does_not_ingest_incomplete_card(tmp_path, monkeypatch):
    first = tmp_path / "first.jpg"
    second = tmp_path / "second.jpg"
    first.write_bytes(b"first-image")
    second.write_bytes(b"second-image")
    snapshot = tmp_path / "chat.jsonl"
    snapshot.write_text(json.dumps({
        "id": "ALBUM",
        "date": "2026-09-26T09:15:00.000Z",
        "sender": "1@g.us",
        "text": "Олимпиада для школьников. Дедлайн 20 ноября 2026. Регистрация https://example.org/apply",
        "media": [
            {"path": str(first), "mime_type": "image/jpeg", "platform_media_id": "FIRST"},
            {"path": str(second), "mime_type": "image/jpeg", "platform_media_id": "SECOND"},
        ],
        "media_expected": True,
    }, ensure_ascii=False) + "\n", encoding="utf-8")
    configured = ChatExport(
        key="linked",
        title="Linked opportunities",
        path=str(snapshot),
        source_url="https://www.whatsapp.com/channel/verified",
        transport="linked_device",
        chat_id="1@newsletter",
        public_provenance=True,
    )
    ingested: list[dict] = []
    monkeypatch.setattr("wacollect.pipeline.MAX_MESSAGE_AGE_DAYS", 10_000)

    def upload(*args):
        if args[2] == "SECOND":
            raise OSError("temporary media failure")
        return {"storageKey": "media/first.jpg"}

    monkeypatch.setattr("wacollect.pipeline.post_media", upload)
    monkeypatch.setattr(
        "wacollect.pipeline.post_candidates",
        lambda **kwargs: ingested.append(kwargs) or {"created": 1, "duplicate": 0, "failed": 0},
    )
    state: dict[str, list[str]] = {}
    result = run_chat(configured, state, dry_run=False)
    assert result["media_failed"] == 1
    assert result["offset_advanced"] is False
    assert ingested == []
    assert state == {}


def test_public_channel_text_without_media_is_held_and_offset_not_advanced(tmp_path, monkeypatch):
    snapshot = tmp_path / "channel.jsonl"
    snapshot.write_text(json.dumps({
        "id": "TEXT_ONLY", "date": "2026-09-26T09:15:00.000Z", "sender": "channel",
        "text": "Олимпиада для школьников. Дедлайн 20 ноября 2026. Регистрация https://example.org/apply",
        "media": [], "media_expected": False,
    }, ensure_ascii=False) + "\n", encoding="utf-8")
    configured = ChatExport(key="channel", title="Public channel", path=str(snapshot),
                            source_url="https://www.whatsapp.com/channel/verified", transport="linked_device",
                            chat_id="1@newsletter", public_provenance=True)
    monkeypatch.setattr("wacollect.pipeline.MAX_MESSAGE_AGE_DAYS", 10_000)
    monkeypatch.setattr("wacollect.pipeline.post_candidates", lambda **kwargs: (_ for _ in ()).throw(AssertionError("text-only candidate ingested")))
    state = {}
    result = run_chat(configured, state, dry_run=False)
    assert result["media_failed"] == 1
    assert result["offset_advanced"] is False
    assert state == {}


def test_public_flag_does_not_promote_private_group_or_arbitrary_url(tmp_path):
    snapshot = tmp_path / "group.jsonl"
    snapshot.write_text("", encoding="utf-8")
    for chat_id, source_url in [
        ("1@g.us", "https://www.whatsapp.com/channel/verified"),
        ("1@newsletter", "https://example.org/opportunities"),
        ("1@newsletter", "https://attacker@www.whatsapp.com/channel/verified"),
        ("1@newsletter", "https://www.whatsapp.com/channel/verified/extra"),
    ]:
        configured = ChatExport(key="source", title="Source", path=str(snapshot),
                                source_url=source_url, transport="linked_device", chat_id=chat_id,
                                public_provenance=True)
        state = {}
        result = run_chat(configured, state, dry_run=False)
        assert result["source_held"] == "public_channel_provenance_unverified"
        assert result["offset_advanced"] is False
        assert state == {}


def test_requested_chat_must_be_enabled_in_allowlist(tmp_path):
    config = tmp_path / "whatsapp.yaml"
    config.write_text("chats: []\n", encoding="utf-8")
    with pytest.raises(WhatsAppUnavailable, match="not enabled in the allowlist"):
        run_all(only="missing", chats_path=str(config), sync_linked=False)


def test_whatsapp_lock_survives_stale_file_and_blocks_overlap(tmp_path, monkeypatch):
    lock_path = tmp_path / "collector.lock"
    lock_path.write_text("old-process", encoding="utf-8")
    monkeypatch.setattr(run_lock, "LOCK_PATH", str(lock_path))
    with run_lock.acquire():
        with pytest.raises(run_lock.WhatsAppRunLocked):
            with run_lock.acquire():
                pass
    with run_lock.acquire():
        assert lock_path.exists()


def test_whatsapp_state_is_loaded_and_saved_while_run_lock_is_held(tmp_path, monkeypatch):
    configured = chat()
    held = False
    calls = []

    @contextmanager
    def lock():
        nonlocal held
        held = True
        try:
            yield
        finally:
            held = False

    def load():
        assert held
        calls.append("load")
        return {}

    def save(_state):
        assert held
        calls.append("save")

    def run(_chat, _state, _dry_run):
        assert held
        calls.append("run")
        return {"chat": configured.key}

    monkeypatch.setattr(pipeline, "load_chats", lambda _path: [configured])
    monkeypatch.setattr(pipeline, "acquire_run_lock", lock)
    monkeypatch.setattr(pipeline.state_store, "load", load)
    monkeypatch.setattr(pipeline.state_store, "save", save)
    monkeypatch.setattr(pipeline, "run_chat", run)
    assert run_all(sync_linked=False) == [{"chat": configured.key}]
    assert calls == ["load", "run", "save"]
