from __future__ import annotations

import asyncio
from contextlib import nullcontext
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import server
from tgcollect import live
from tgcollect.client import TelegramAuthRequired, TelegramRetryLater
from tgcollect.config import Channel


def test_extended_history_resumes_from_first_post_older_than_previous_window(monkeypatch):
    state = {"official": 500, "__backfill__:official": 0}
    calls = []

    class Client:
        def iter_messages(self, entity, **kwargs):
            calls.append((entity, kwargs))

            async def messages():
                yield SimpleNamespace(id=201)

            return messages()

    monkeypatch.setattr(live, "MAX_POST_AGE_DAYS", 365)
    monkeypatch.setattr(live.state_store, "save", lambda _state: None)
    asyncio.run(live._extend_history_window(Client(), Channel("official", peer="entity"), state))

    assert state["__backfill__:official"] == 202
    assert state["__history_window_days__:official"] == 365
    assert calls[0][0] == "entity"
    assert calls[0][1]["limit"] == 1
    assert "offset_date" in calls[0][1]


def test_extended_history_does_not_restart_an_active_backfill(monkeypatch):
    state = {"official": 500, "__backfill__:official": 201}

    class Client:
        def iter_messages(self, *_args, **_kwargs):
            raise AssertionError("active backfill must be reused")

    monkeypatch.setattr(live, "MAX_POST_AGE_DAYS", 365)
    monkeypatch.setattr(live.state_store, "save", lambda _state: None)
    asyncio.run(live._extend_history_window(Client(), Channel("official", peer="entity"), state))

    assert state["__backfill__:official"] == 201
    assert state["__history_window_days__:official"] == 365


def test_extended_history_is_idempotent(monkeypatch):
    state = {"official": 500, "__backfill__:official": 0, "__history_window_days__:official": 365}

    class Client:
        def iter_messages(self, *_args, **_kwargs):
            raise AssertionError("completed backfill must not restart")

    monkeypatch.setattr(live, "MAX_POST_AGE_DAYS", 365)
    asyncio.run(live._extend_history_window(Client(), Channel("official", peer="entity"), state))

    assert state["__backfill__:official"] == 0


def test_live_collector_checkpoints_successful_channel(monkeypatch):
    saved = []

    async def collect(_client, channel, state, dry_run):
        assert channel.username == "official"
        assert dry_run is False
        state[channel.username] = 42

    monkeypatch.setattr(live, "run_channel", collect)
    monkeypatch.setattr(live.state_store, "save", lambda state: saved.append(dict(state)))

    asyncio.run(live._collect_channel(object(), Channel("official"), {}))

    assert saved == [{"official": 42}]


def test_live_collector_drains_full_batches_and_checkpoints_each_one(monkeypatch):
    saved = []
    calls = []

    async def collect(_client, channel, state, dry_run):
        assert dry_run is False
        calls.append(channel.username)
        state[channel.username] = len(calls) * 20
        return {"posts": 20 if len(calls) < 3 else 4}

    async def no_wait(_seconds):
        return None

    monkeypatch.setattr(live, "run_channel", collect)
    monkeypatch.setattr(live.state_store, "save", lambda state: saved.append(dict(state)))
    monkeypatch.setattr(live.asyncio, "sleep", no_wait)

    backlog = asyncio.run(live._collect_channel(object(), Channel("official", max_posts=20), {}))

    assert backlog is False
    assert calls == ["official", "official", "official"]
    assert saved == [{"official": 20}, {"official": 40}, {"official": 60}]


def test_live_collector_requeues_channel_after_bounded_full_batches(monkeypatch):
    calls = []

    async def collect(_client, channel, state, dry_run):
        assert dry_run is False
        calls.append(channel.username)
        state[channel.username] = len(calls) * 20
        return {"posts": 20}

    async def no_wait(_seconds):
        return None

    monkeypatch.setattr(live, "run_channel", collect)
    monkeypatch.setattr(live.state_store, "save", lambda _state: None)
    monkeypatch.setattr(live.asyncio, "sleep", no_wait)

    backlog = asyncio.run(live._collect_channel(object(), Channel("official", max_posts=20), {}))

    assert backlog is True
    assert len(calls) == live.MAX_BATCHES_PER_CHANNEL_PASS


def test_live_collector_drains_backfill_without_moving_live_offset(monkeypatch):
    calls = []
    state = {"official": 300, "__backfill__:official": 200}

    async def collect(_client, _channel, current, dry_run, before_id=None):
        assert dry_run is False
        calls.append(before_id)
        if before_id is None:
            return {"scanned": 0}
        current["__backfill__:official"] = before_id - 20
        return {"scanned": 20}

    async def no_wait(_seconds):
        return None

    monkeypatch.setattr(live, "run_channel", collect)
    monkeypatch.setattr(live.state_store, "save", lambda _state: None)
    monkeypatch.setattr(live.asyncio, "sleep", no_wait)

    backlog = asyncio.run(live._collect_channel(object(), Channel("official", max_posts=20), state))

    assert backlog is True
    assert calls == [None, 200, 180, 160, 140, 120]
    assert state == {"official": 300, "__backfill__:official": 100}


def test_live_event_processes_new_posts_without_waiting_for_backfill(monkeypatch):
    calls = []
    state = {"official": 300, "__backfill__:official": 200}

    async def collect(_client, _channel, _state, dry_run, before_id=None):
        assert dry_run is False
        calls.append(before_id)
        return {"scanned": 1}

    monkeypatch.setattr(live, "run_channel", collect)
    monkeypatch.setattr(live.state_store, "save", lambda _state: None)

    backlog = asyncio.run(live._collect_channel(object(), Channel("official", max_posts=20), state, include_backfill=False))

    assert backlog is False
    assert calls == [None]
    assert state["__backfill__:official"] == 200


def test_live_collector_uses_scanned_count_for_album_heavy_batches(monkeypatch):
    calls = []

    async def collect(_client, channel, state, dry_run):
        assert dry_run is False
        calls.append(channel.username)
        state[channel.username] = len(calls) * 20
        return {"posts": 1, "scanned": 20 if len(calls) == 1 else 1}

    async def no_wait(_seconds):
        return None

    monkeypatch.setattr(live, "run_channel", collect)
    monkeypatch.setattr(live.state_store, "save", lambda _state: None)
    monkeypatch.setattr(live.asyncio, "sleep", no_wait)

    backlog = asyncio.run(live._collect_channel(object(), Channel("official", max_posts=20), {}))

    assert backlog is False
    assert calls == ["official", "official"]


def test_live_collector_keeps_offset_on_channel_failure(monkeypatch):
    saved = []

    async def fail(_client, _channel, _state, _dry_run):
        raise RuntimeError("temporary")

    monkeypatch.setattr(live, "run_channel", fail)
    monkeypatch.setattr(live.state_store, "save", lambda state: saved.append(dict(state)))
    state = {"official": 41}

    asyncio.run(live._collect_channel(object(), Channel("official"), state))

    assert saved == [{"official": 41}]


def test_live_collector_propagates_revoked_authorization(monkeypatch):
    async def fail(_client, _channel, _state, dry_run):
        assert dry_run is False
        raise TelegramAuthRequired("revoked")

    monkeypatch.setattr(live, "run_channel", fail)
    monkeypatch.setattr(live.state_store, "save", lambda _state: None)

    with pytest.raises(TelegramAuthRequired):
        asyncio.run(live._collect_channel(object(), Channel("official"), {}))


def test_edited_post_failure_is_retryable_without_advancing_offset(monkeypatch):
    state = {"official": 100}

    async def failed_ingest(_client, _channel, _state, dry_run, edited_post_id):
        assert dry_run is False
        assert edited_post_id == 42
        return {"edited": True, "offset_advanced": False}

    monkeypatch.setattr(live, "run_channel", failed_ingest)

    assert asyncio.run(live._collect_edited_post(object(), Channel("official"), state, 42)) is False
    assert state == {"official": 100}


def test_edited_post_retries_back_off_after_repeated_failures():
    assert [live.edited_retry_delay(attempt) for attempt in (1, 2, 3, 9)] == [30, 60, 120, 3600]


def test_revision_scan_reprocesses_new_and_changed_posts_only(monkeypatch):
    post = {"id": 41, "text": "Олимпиада", "media": [{"platform_media_id": "photo-a"}]}
    state = {"official": 100}
    refreshed = []

    async def recent(_client, _channel, since_id, max_posts, max_age_days):
        assert since_id == 0
        assert max_posts == live.REVISION_SCAN_POSTS
        assert max_age_days == live.MAX_POST_AGE_DAYS
        return [dict(post)]

    async def collect(_client, channel, current, post_id):
        refreshed.append(post_id)
        live.state_store.remember_posts(current, channel.username, [dict(post)])
        return True

    monkeypatch.setattr(live, "fetch_posts", recent)
    monkeypatch.setattr(live, "_collect_edited_post", collect)

    asyncio.run(live._reconcile_recent_edits(object(), [Channel("official")], state))
    asyncio.run(live._reconcile_recent_edits(object(), [Channel("official")], state))
    post["media"] = [{"platform_media_id": "photo-b"}]
    asyncio.run(live._reconcile_recent_edits(object(), [Channel("official")], state))

    assert refreshed == [41, 41]
    assert state["official"] == 100


def test_failed_revision_is_retried_without_remembering_it(monkeypatch):
    post = {"id": 41, "text": "Олимпиада", "media": []}
    state = {"official": 100}
    attempts = []

    async def recent(_client, _channel, **_kwargs):
        return [post]

    async def collect(_client, _channel, _state, post_id):
        attempts.append(post_id)
        return False

    monkeypatch.setattr(live, "fetch_posts", recent)
    monkeypatch.setattr(live, "_collect_edited_post", collect)

    asyncio.run(live._reconcile_recent_edits(object(), [Channel("official")], state))
    asyncio.run(live._reconcile_recent_edits(object(), [Channel("official")], state))

    assert attempts == [41, 41]
    assert live.state_store.known_fingerprint(state, "official", 41) is None


def test_live_collector_respects_a_long_telegram_flood_wait(monkeypatch):
    async def fail(_client, _channel, _state, dry_run):
        assert dry_run is False
        raise TelegramRetryLater(3600, "reading channel")

    monkeypatch.setattr(live, "run_channel", fail)
    with pytest.raises(TelegramRetryLater):
        asyncio.run(live._collect_channel(object(), Channel("official"), {}))


def test_live_connection_waits_for_telegram_retry_delay(monkeypatch):
    attempts = 0
    waited = []

    async def connect():
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise TelegramRetryLater(3600, "dialog discovery")
        raise asyncio.CancelledError()

    async def sleep(seconds):
        waited.append(seconds)

    monkeypatch.setattr(live, "_connected", connect)
    monkeypatch.setattr(live.asyncio, "sleep", sleep)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(live.run_forever())

    assert waited == [3601]


def test_live_collector_waits_for_repaired_session_after_auth_failure(monkeypatch):
    attempts = 0
    observed = []
    stamps = iter([(1, 1, 1), (1, 1, 1), (2, 2, 2)])

    async def connect():
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise TelegramAuthRequired("revoked")
        raise asyncio.CancelledError()

    async def sleep(seconds):
        observed.append((seconds, live.status()["state"]))

    monkeypatch.setattr(live, "_connected", connect)
    monkeypatch.setattr(live, "_session_stamp", lambda: next(stamps))
    monkeypatch.setattr(live.asyncio, "sleep", sleep)
    monkeypatch.setitem(live._status, "state", "stopped")

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(live.run_forever())

    assert attempts == 2
    assert observed == [(10, "auth_required")]
    assert live.status()["last_error"] == "TelegramAuthRequired"


def test_session_stamp_detects_replacement_and_edit(monkeypatch, tmp_path):
    path = tmp_path / "account"
    monkeypatch.setattr(live, "SESSION_PATH", str(path))
    assert live._session_stamp() is None

    session = tmp_path / "account.session"
    session.write_bytes(b"first")
    first = live._session_stamp()
    session.write_bytes(b"second-content")
    assert live._session_stamp() != first


def test_live_catchup_checks_each_channel(monkeypatch):
    checked = []

    async def collect(_client, channel, _state):
        checked.append(channel.username)

    async def no_wait(_seconds):
        return None

    monkeypatch.setattr(live, "_collect_channel", collect)
    monkeypatch.setattr(live.asyncio, "sleep", no_wait)

    asyncio.run(live._catch_up(object(), [Channel("one"), Channel("two")], {}))

    assert checked == ["one", "two"]
    assert live.status()["last_catchup_at"] is not None


def test_live_catchup_initializes_backfill_for_legacy_forward_offsets(monkeypatch):
    observed = []
    state = {"official": 55}

    async def collect(_client, _channel, current):
        observed.append(dict(current))
        return False

    monkeypatch.setattr(live, "_collect_channel", collect)
    monkeypatch.setattr(live.state_store, "save", lambda _state: None)

    asyncio.run(live._catch_up(object(), [Channel("official")], state))

    assert observed == [{"official": 55, "__backfill__:official": 55, "__history_window_days__:official": 365}]


def test_live_only_reads_explicitly_allowlisted_public_channels_and_groups():
    class Client:
        async def iter_dialogs(self):
            for channel_id, name, broadcast, megagroup, username in [
                (1, "Opportunity channel", True, False, "opportunities_kz"),
                (2, "Disabled channel", True, False, "disabled_kz"),
                (123, "Private channel", True, False, None),
                (4, "Group", False, True, "public_group_kz"),
                (5, "Personal chat", False, False, None),
            ]:
                yield SimpleNamespace(name=name, entity=SimpleNamespace(
                    id=channel_id, broadcast=broadcast, megagroup=megagroup, username=username,
                ))

    subscriptions = asyncio.run(live._subscribed_channels(Client(), [
        Channel("opportunities_kz", category="olympiad", max_posts=12),
        Channel("public_group_kz", category="debate", max_posts=15),
        Channel("disabled_kz", enabled=False),
        Channel("unsubscribed_kz"),
    ]))

    assert len(subscriptions) == 2
    channel, entity = subscriptions[0]
    assert channel.username == "opportunities_kz"
    assert channel.category == "olympiad"
    assert channel.max_posts == 12
    assert channel.trusted is False
    assert entity.username == "opportunities_kz"
    assert channel.private_id is None
    group, group_entity = subscriptions[1]
    assert group.username == "public_group_kz"
    assert group.category == "debate"
    assert group.max_posts == 15
    assert group_entity.megagroup is True


def test_live_does_not_discover_unapproved_new_public_channels():
    class Client:
        async def iter_dialogs(self):
            yield SimpleNamespace(name="New activities", entity=SimpleNamespace(broadcast=True, username="new_activities"))

    subscriptions = asyncio.run(live._subscribed_channels(Client(), []))

    assert subscriptions == []


def test_live_connects_without_interactive_login(monkeypatch):
    calls = []

    monkeypatch.setattr("parser.ingest.preflight_ingest_target", lambda: {"ready": True, "reason": "verified"})

    class Client:
        async def connect(self):
            calls.append("connect")

        async def is_user_authorized(self):
            calls.append("authorized")
            return False

        async def disconnect(self):
            calls.append("disconnect")

        async def __aenter__(self):
            raise AssertionError("interactive Telethon start must not run")

    monkeypatch.setattr(live, "build_client", Client)
    monkeypatch.setattr(live, "acquire_run_lock", nullcontext)

    with pytest.raises(TelegramAuthRequired):
        asyncio.run(live._connected())

    assert calls == ["connect", "authorized", "disconnect"]


def test_manual_run_cannot_open_live_account_session(monkeypatch):
    class RunningTask:
        def done(self):
            return False

    monkeypatch.setattr(server, "ADMIN_TOKEN", "test-token")
    monkeypatch.setattr(server, "telegram_live_task", RunningTask())

    with pytest.raises(HTTPException) as caught:
        asyncio.run(server.run_telegram(x_admin_token="test-token"))

    assert caught.value.status_code == 409


def test_telegram_live_requires_absolute_persistent_lock(monkeypatch, tmp_path):
    monkeypatch.setenv("TG_SESSION_PATH", str(tmp_path / "account"))
    monkeypatch.setenv("TG_STATE_PATH", str(tmp_path / "state.json"))
    monkeypatch.delenv("TG_LOCK_PATH", raising=False)
    assert server._telegram_storage_ready()[0] is False

    monkeypatch.setenv("TG_LOCK_PATH", "relative.lock")
    assert server._telegram_storage_ready()[0] is False

    monkeypatch.setenv("TG_LOCK_PATH", str(tmp_path / "run.lock"))
    assert server._telegram_storage_ready() == (True, "configured")


def test_live_media_repair_is_off_without_both_explicit_paths(monkeypatch, tmp_path):
    monkeypatch.delenv("TG_MEDIA_REPAIR_REQUEST_PATH", raising=False)
    monkeypatch.delenv("TG_MEDIA_REPAIR_RESULT_PATH", raising=False)
    asyncio.run(live._repair_one_original_media(object(), [Channel("example")]))
    assert live.status()["media_repair_state"] == "disabled"
    monkeypatch.setenv("TG_MEDIA_REPAIR_REQUEST_PATH", str(tmp_path / "request.json"))
    asyncio.run(live._repair_one_original_media(object(), [Channel("example")]))
    assert live.status()["media_repair_state"] == "misconfigured"


def test_live_media_repair_uses_current_client_and_subscriptions(monkeypatch, tmp_path):
    request = tmp_path / "request.json"
    request.write_text("unused", encoding="utf-8")
    monkeypatch.setenv("TG_MEDIA_REPAIR_REQUEST_PATH", str(request))
    monkeypatch.setenv("TG_MEDIA_REPAIR_RESULT_PATH", str(tmp_path / "result.json"))
    monkeypatch.setenv("PARSER_INGEST_SECRET", "test-secret")
    monkeypatch.delenv("TG_MEDIA_REPAIR_UPLOAD_ENABLED", raising=False)
    seen = []

    async def process(**kwargs):
        seen.append(kwargs)
        return "progress"

    monkeypatch.setattr(live, "process_signed_queue_once", process)
    client = object()
    asyncio.run(live._repair_one_original_media(client, [Channel("Example")]))
    assert live.status()["media_repair_state"] == "progress"
    assert len(seen) == 1
    assert seen[0]["client"] is client
    assert seen[0]["allowed_channels"] == {"example"}
    assert seen[0]["allow_upload"] is False


def test_media_repair_pacer_runs_between_backlog_batches_at_most_once_per_minute(monkeypatch):
    now = [0.0]
    repaired_at = []
    pacer = live.RepairPacer(lambda: now[0])
    state = {}

    async def collect(_client, channel, _state, dry_run):
        assert channel.username == "official"
        assert dry_run is False
        now[0] += 30
        state["official"] = int(now[0])
        return {"scanned": 20}

    async def repair():
        repaired_at.append(now[0])

    async def after_batch():
        await pacer.tick(repair)

    async def no_wait(_seconds):
        return None

    monkeypatch.setattr(live, "run_channel", collect)
    monkeypatch.setattr(live.state_store, "save", lambda _state: None)
    monkeypatch.setattr(live.asyncio, "sleep", no_wait)

    backlog = asyncio.run(live._collect_channel(object(), Channel("official", max_posts=20), state,
                                                  include_backfill=False, after_batch=after_batch))

    assert backlog is True
    assert repaired_at == [60.0, 120.0]


def test_media_repair_flood_wait_is_not_swallowed(monkeypatch, tmp_path):
    request = tmp_path / "request.json"
    request.write_text("unused", encoding="utf-8")
    monkeypatch.setenv("TG_MEDIA_REPAIR_REQUEST_PATH", str(request))
    monkeypatch.setenv("TG_MEDIA_REPAIR_RESULT_PATH", str(tmp_path / "result.json"))
    monkeypatch.setenv("PARSER_INGEST_SECRET", "test-secret")

    async def flood(**_kwargs):
        raise TelegramRetryLater(90, "media repair")

    monkeypatch.setattr(live, "process_signed_queue_once", flood)
    with pytest.raises(TelegramRetryLater) as error:
        asyncio.run(live._repair_one_original_media(object(), [Channel("example")]))
    assert error.value.seconds == 90


def test_legacy_telegram_schedule_flag_does_not_create_a_job(monkeypatch):
    monkeypatch.setenv("WEB_SCHEDULE_ENABLED", "false")
    monkeypatch.setenv("TELEGRAM_LIVE_ENABLED", "false")
    monkeypatch.setenv("TELEGRAM_SCHEDULE_ENABLED", "true")
    monkeypatch.setenv("INSTAGRAM_SCHEDULE_ENABLED", "false")
    monkeypatch.setenv("WHATSAPP_SCHEDULE_ENABLED", "false")

    async def check() -> None:
        async with server.lifespan(server.app):
            assert [job.id for job in server.scheduler.get_jobs()] == []

    asyncio.run(check())
