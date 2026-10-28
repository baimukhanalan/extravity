"""Transport/state regressions for safe Telegram collection."""
from __future__ import annotations

import asyncio
from contextlib import contextmanager, nullcontext
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from tgcollect import live, pipeline, state as state_store
from tgcollect.client import TelegramUnavailable, download_media_preview, fetch_edited_post, fetch_posts, message_text
from tgcollect.config import Channel
from tgcollect.media_spool import MediaSpool
from tgcollect.media_circuit import MediaUploadCircuit
from tgcollect.pipeline import run_channel

FUTURE_DEADLINE = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%d.%m.%Y")


@pytest.fixture(autouse=True)
def isolated_media_spool(monkeypatch, tmp_path):
    monkeypatch.setenv("TG_MEDIA_SPOOL_PATH", str(tmp_path / "telegram-media-spool"))


def cursor_state(state):
    return {key: value for key, value in state.items() if not key.startswith("__revision__:")}


class FakeClient:
    def __init__(self, messages: list[SimpleNamespace]):
        self.messages = messages
        self.iter_kwargs: dict = {}

    async def get_entity(self, username: str):
        return SimpleNamespace(title=username)

    def iter_messages(self, entity, **kwargs):
        self.iter_kwargs = kwargs
        selected = self.messages
        if "min_id" in kwargs:
            selected = [item for item in selected if item.id > kwargs["min_id"]]
        if "offset_id" in kwargs:
            selected = [item for item in selected if item.id < kwargs["offset_id"]]
        selected = sorted(selected, key=lambda item: item.id, reverse=not kwargs.get("reverse", False))[:kwargs["limit"]]
        self.last_selected = selected

        async def generate():
            for item in selected:
                yield item

        return generate()


class PagedClient(FakeClient):
    def __init__(self, count: int):
        super().__init__([message(post_id, "other") for post_id in range(1, count + 1)])
        self.scanned_ids = []

    def iter_messages(self, entity, **kwargs):
        result = super().iter_messages(entity, **kwargs)
        self.scanned_ids.extend(item.id for item in self.last_selected)
        return result


def message(post_id: int, text: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=post_id,
        message=text,
        date=datetime.now(timezone.utc),
        grouped_id=None,
        entities=None,
        reply_markup=None,
    )


def test_hidden_link_keeps_application_context_across_utf16_offsets():
    text = "🎯 Регистрация по ссылке тут"
    label_start = text.index("тут")
    entity = SimpleNamespace(
        offset=len(text[:label_start].encode("utf-16-le")) // 2,
        length=len("тут".encode("utf-16-le")) // 2,
        url="https://example.kz/program",
    )
    linked = message(1, text)
    linked.entities = [entity]

    enriched = message_text(linked)

    assert "Регистрация по ссылке тут: https://example.kz/program" in enriched
    assert pipeline.baseline(
        "Открыта регистрация на олимпиаду для школьников. Дедлайн 20 сентября 2026. " + enriched,
        "https://t.me/official/1", "Official", "olympiad",
    )["applicationUrl"] == "https://example.kz/program"


def test_application_button_label_keeps_its_url():
    linked = message(1, "Открыта регистрация на олимпиаду для школьников. Дедлайн 20 сентября 2026.")
    linked.reply_markup = SimpleNamespace(rows=[SimpleNamespace(buttons=[
        SimpleNamespace(text="Подать заявку", url="https://example.kz/olympiad"),
    ])])

    enriched = message_text(linked)

    assert "Подать заявку: https://example.kz/olympiad" in enriched
    assert pipeline.baseline(enriched, "https://t.me/official/1", "Official", "olympiad")["applicationUrl"] == "https://example.kz/olympiad"


def test_first_run_reads_newest_batch_then_returns_chronological_posts():
    client = FakeClient([message(103, "new"), message(102, "middle"), message(101, "old")])

    posts = asyncio.run(fetch_posts(client, Channel("official"), 0, 20, 30))

    assert client.iter_kwargs == {"limit": 20}
    assert [post["id"] for post in posts] == [101, 102, 103]


def test_private_channel_uses_subscribed_peer_without_public_username():
    class PrivateClient(FakeClient):
        async def get_entity(self, username: str):
            raise AssertionError("private channel must not be resolved by username")

    peer = SimpleNamespace(id=123, broadcast=True, title="Private activities")
    client = PrivateClient([message(42, "Олимпиада для школьников. Дедлайн 20 сентября 2026.")])
    channel = Channel("c_123", private_id=123, peer=peer)

    posts = asyncio.run(fetch_posts(client, channel, 0, 20, 30))

    assert posts[0]["url"] == "https://t.me/c/123/42"
    assert channel.source_url == "https://t.me/c/123"


def test_edited_album_keeps_original_permalink_and_all_media():
    album = [message(post_id, "") for post_id in (40, 41, 42)]
    for item in album:
        item.grouped_id = 777
        item.photo = SimpleNamespace(id=item.id)
        item.edit_date = datetime.now(timezone.utc)
    album[1].message = "Открыта регистрация на олимпиаду. Дедлайн 1 октября 2026."

    class Client:
        async def get_messages(self, _entity, ids):
            if isinstance(ids, int):
                return album[1]
            return [item for item in album if item.id in ids]

    peer = SimpleNamespace(id=123, broadcast=True, title="Activities")
    channel = Channel("c_123", private_id=123, peer=peer)
    posts = asyncio.run(fetch_edited_post(Client(), channel, 41, 30))

    assert len(posts) == 1
    assert posts[0]["id"] == 40
    assert posts[0]["url"] == "https://t.me/c/123/40"
    assert len(posts[0]["media"]) == 3


def test_edited_album_preserves_original_publication_date():
    album = [message(post_id, "") for post_id in (40, 41)]
    for item in album:
        item.grouped_id = 777
        item.date = datetime.now(timezone.utc) - timedelta(days=100)
    album[1].message = "Открыта регистрация на олимпиаду. Дедлайн 1 декабря."
    album[1].edit_date = datetime.now(timezone.utc)

    class Client:
        async def get_messages(self, _entity, ids):
            return album[1] if isinstance(ids, int) else album

    channel = Channel("official", peer=SimpleNamespace(id=123, broadcast=True))
    posts = asyncio.run(fetch_edited_post(Client(), channel, 41, 30))

    assert len(posts) == 1
    assert posts[0]["date"] == album[0].date.isoformat()
    assert posts[0]["edit_date"] == album[1].edit_date.isoformat()


def test_revision_fingerprints_are_bounded_and_persisted(monkeypatch, tmp_path):
    monkeypatch.setattr(state_store, "STATE_PATH", str(tmp_path / "telegram.json"))
    state = {"official": 100}
    state_store.remember_posts(state, "official", [
        {"id": post_id, "text": f"Post {post_id}", "media": []} for post_id in range(1, 101)
    ])
    state_store.save(state)
    restored = state_store.load()

    assert restored == state
    assert state_store.known_fingerprint(restored, "official", 36) is None
    assert state_store.known_fingerprint(restored, "official", 37) is not None
    assert state_store.known_fingerprint(restored, "official", 100) is not None


def test_edited_post_is_ingested_without_moving_channel_offsets(monkeypatch):
    channel = Channel("official", category="olympiad")
    state = {"official": 500, "__backfill__:official": 200}
    captured = []

    async def fake_title(_client, _channel):
        return "Official"

    async def fake_edit(_client, _channel, post_id, _max_age_days):
        assert post_id == 41
        return [{
            "id": 41,
            "text": "Открыта регистрация на олимпиаду для учеников. Дедлайн 1 января 2020. https://example.kz/apply",
            "url": "https://t.me/official/41",
            "date": datetime.now(timezone.utc).isoformat(),
            "media": [],
        }]

    def fake_ingest(**kwargs):
        captured.extend(kwargs["items"])
        return {"created": 0, "duplicate": 1, "failed": 0}

    monkeypatch.setattr(pipeline, "resolve_title", fake_title)
    monkeypatch.setattr(pipeline, "fetch_edited_post", fake_edit)
    monkeypatch.setattr(pipeline, "post_candidates", fake_ingest)

    result = asyncio.run(run_channel(object(), channel, state, dry_run=False, edited_post_id=41))

    assert result["edited"] is True
    assert captured[0]["sourceUrl"] == "https://t.me/official/41"
    assert cursor_state(state) == {"official": 500, "__backfill__:official": 200}


def test_incremental_run_walks_forward_from_saved_offset():
    client = FakeClient([message(102, "middle"), message(103, "new")])

    posts = asyncio.run(fetch_posts(client, Channel("official"), 101, 20, 30))

    assert client.iter_kwargs == {"limit": 20, "min_id": 101, "reverse": True}
    assert [post["id"] for post in posts] == [102, 103]


def test_backfill_reads_older_batch_in_chronological_order():
    client = FakeClient([message(100, "newer"), message(99, "middle"), message(98, "older")])

    posts = asyncio.run(fetch_posts(client, Channel("official"), 103, 3, 30, before_id=101))

    assert client.iter_kwargs == {"limit": 3, "offset_id": 101}
    assert [post["id"] for post in posts] == [98, 99, 100]
    assert posts.oldest_seen_id == 98


def test_bootstrap_completes_album_split_at_older_batch_boundary():
    client = PagedClient(22)
    for item in client.messages:
        if 1 <= item.id <= 5:
            item.grouped_id = 777
            item.photo = SimpleNamespace(id=item.id)
            item.message = "Олимпиада с фото" if item.id == 1 else ""

    posts = asyncio.run(fetch_posts(client, Channel("official"), 0, 20, 30))

    album = next(post for post in posts if post["id"] == 1)
    assert posts.scanned_count == 22
    assert posts.oldest_seen_id == 1
    assert len(album["media"]) == 5
    assert album["text"] == "Олимпиада с фото"


def test_forward_batch_completes_album_split_at_newer_boundary():
    client = PagedClient(25)
    for item in client.messages:
        if 19 <= item.id <= 23:
            item.grouped_id = 888
            item.photo = SimpleNamespace(id=item.id)
            item.message = "Конкурс с фото" if item.id == 19 else ""

    posts = asyncio.run(fetch_posts(client, Channel("official"), 1, 20, 30))

    album = next(post for post in posts if post["id"] == 19)
    assert posts.scanned_count == 22
    assert posts.last_seen_id == 23
    assert len(album["media"]) == 5
    assert album["text"] == "Конкурс с фото"


def test_backfill_completes_album_split_at_older_batch_boundary():
    client = PagedClient(45)
    for item in client.messages:
        if 20 <= item.id <= 25:
            item.grouped_id = 999
            item.photo = SimpleNamespace(id=item.id)
            item.message = "Стажировка с фото" if item.id == 20 else ""

    posts = asyncio.run(fetch_posts(client, Channel("official"), 45, 20, 30, before_id=43))

    album = next(post for post in posts if post["id"] == 20)
    assert posts.scanned_count == 23
    assert posts.oldest_seen_id == 20
    assert len(album["media"]) == 6
    assert album["text"] == "Стажировка с фото"


def test_first_run_and_backfill_advance_separate_cursors(monkeypatch):
    client = FakeClient([message(103, "not an opportunity"), message(102, "other"), message(101, "other")])
    channel = Channel("official", max_posts=3)
    state = {}

    async def fake_title(_client, _channel):
        return "Official"

    monkeypatch.setattr(pipeline, "resolve_title", fake_title)

    asyncio.run(run_channel(client, channel, state, dry_run=False))
    assert cursor_state(state) == {"official": 103, "__backfill__:official": 101}

    client.messages = [message(100, "other"), message(99, "other"), message(98, "other")]
    asyncio.run(run_channel(client, channel, state, dry_run=False, before_id=101))
    assert cursor_state(state) == {"official": 103, "__backfill__:official": 98}

    client.messages = [message(97, "other")]
    asyncio.run(run_channel(client, channel, state, dry_run=False, before_id=98))
    assert cursor_state(state) == {"official": 103, "__backfill__:official": 0}


def test_channel_empty_at_first_check_can_initialize_backfill_later(monkeypatch):
    client = FakeClient([])
    channel = Channel("official", max_posts=3)
    state = {}

    async def fake_title(_client, _channel):
        return "Official"

    monkeypatch.setattr(pipeline, "resolve_title", fake_title)

    asyncio.run(run_channel(client, channel, state, dry_run=False))
    assert state == {"__backfill__:official": 0}

    client.messages = [message(3, "other"), message(2, "other"), message(1, "other")]
    asyncio.run(run_channel(client, channel, state, dry_run=False))
    assert cursor_state(state) == {"official": 3, "__backfill__:official": 1}


def test_backfill_failure_preserves_cursor_for_safe_retry(monkeypatch):
    text = (
        "Открыта регистрация на олимпиаду для учеников 9 класса. "
        f"Приём заявок, дедлайн {FUTURE_DEADLINE}. https://example.kz/apply"
    )
    client = FakeClient([message(99, text)])
    channel = Channel("official", category="olympiad", max_posts=3)
    state = {"official": 103, "__backfill__:official": 100}

    async def fake_title(_client, _channel):
        return "Official"

    monkeypatch.setattr(pipeline, "resolve_title", fake_title)
    monkeypatch.setattr(pipeline, "post_candidates", lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("ingest unavailable")))

    import pytest

    with pytest.raises(RuntimeError, match="ingest unavailable"):
        asyncio.run(run_channel(client, channel, state, dry_run=False, before_id=100))
    assert state == {"official": 103, "__backfill__:official": 100}


def test_backfilled_opportunity_reaches_ingest_without_moving_live_offset(monkeypatch):
    text = (
        "Открыта регистрация на олимпиаду для учеников 9 класса. "
        f"Приём заявок, дедлайн {FUTURE_DEADLINE}. https://example.kz/apply"
    )
    client = FakeClient([message(99, text)])
    channel = Channel("official", category="olympiad", max_posts=3)
    state = {"official": 103, "__backfill__:official": 100}
    ingested = []

    async def fake_title(_client, _channel):
        return "Official"

    def capture(**kwargs):
        ingested.extend(kwargs["items"])
        return {"created": len(kwargs["items"]), "duplicate": 0, "failed": 0}

    monkeypatch.setattr(pipeline, "resolve_title", fake_title)
    monkeypatch.setattr(pipeline, "post_candidates", capture)

    result = asyncio.run(run_channel(client, channel, state, dry_run=False, before_id=100))

    assert result["backfill"] is True
    assert result["ingest"]["created"] == 1
    assert ingested[0]["sourceUrl"] == "https://t.me/official/99"
    assert cursor_state(state) == {"official": 103, "__backfill__:official": 0}


def test_live_collector_backfills_every_recent_post_across_paginated_batches(monkeypatch):
    async def no_wait(_seconds):
        return None

    monkeypatch.setattr(live.state_store, "save", lambda _state: None)
    monkeypatch.setattr(live.asyncio, "sleep", no_wait)
    client = PagedClient(65)
    state = {}

    backlog = asyncio.run(live._collect_channel(client, Channel("official", max_posts=20), state))

    assert backlog is False
    assert cursor_state(state) == {"official": 65, "__backfill__:official": 0}
    assert set(client.scanned_ids) == set(range(1, 66))
    assert len(client.scanned_ids) == 65


def test_large_backfill_requeues_until_all_recent_posts_are_scanned(monkeypatch):
    async def no_wait(_seconds):
        return None

    monkeypatch.setattr(live.state_store, "save", lambda _state: None)
    monkeypatch.setattr(live.asyncio, "sleep", no_wait)
    client = PagedClient(401)
    state = {}

    async def drain():
        for _ in range(10):
            if not await live._collect_channel(client, Channel("official", max_posts=20), state):
                return
        raise AssertionError("backfill did not complete")

    asyncio.run(drain())

    assert cursor_state(state) == {"official": 401, "__backfill__:official": 0}
    assert set(client.scanned_ids) == set(range(1, 402))
    assert len(client.scanned_ids) == 401


def test_stale_incremental_batch_advances_offset_without_extracting_old_text(monkeypatch):
    old = [message(post_id, "Открыта регистрация на олимпиаду. Дедлайн 20 сентября 2026.") for post_id in range(101, 121)]
    for item in old:
        item.date = datetime.now(timezone.utc) - timedelta(days=45)
    client = FakeClient(old)
    channel = Channel("official", category="olympiad", max_posts=20)

    async def fake_title(_client, _channel):
        return "Official"

    monkeypatch.setattr(pipeline, "resolve_title", fake_title)
    monkeypatch.setattr(pipeline, "MAX_POST_AGE_DAYS", 30)
    monkeypatch.setattr(pipeline, "post_candidates", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("stale content ingested")))
    state = {"official": 100}

    result = asyncio.run(run_channel(client, channel, state, dry_run=False))

    assert client.iter_kwargs == {"limit": 20, "min_id": 100, "reverse": True}
    assert result["posts"] == 20
    assert result["too_old"] == 20
    assert result["candidates"] == 0
    assert state["official"] == 120


def test_album_offset_uses_last_scanned_message_not_first_album_photo(monkeypatch):
    text = (
        "Открыта регистрация на олимпиаду для учеников 9 класса. "
        f"Приём заявок, дедлайн {FUTURE_DEADLINE}. https://example.kz/apply"
    )
    first = message(101, text)
    second = message(102, "")
    third = message(103, "")
    for item in (first, second, third):
        item.grouped_id = 999
    client = FakeClient([first, second, third])
    channel = Channel("official", category="olympiad", max_posts=3)

    async def fake_title(_client, _channel):
        return "Official"

    monkeypatch.setattr(pipeline, "resolve_title", fake_title)
    monkeypatch.setattr(pipeline, "post_candidates", lambda **_kwargs: {"created": 1, "duplicate": 0, "failed": 0})
    state = {"official": 100}

    result = asyncio.run(run_channel(client, channel, state, dry_run=False))

    assert result["posts"] == 1
    assert result["scanned"] == 3
    assert state["official"] == 103


def test_captionless_album_still_advances_scanned_offset(monkeypatch):
    first = message(101, "")
    second = message(102, "")
    first.grouped_id = second.grouped_id = 999
    client = FakeClient([first, second])

    async def fake_title(_client, _channel):
        return "Official"

    monkeypatch.setattr(pipeline, "resolve_title", fake_title)
    monkeypatch.setattr(pipeline, "post_candidates", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("captionless album ingested")))
    state = {"official": 100}

    result = asyncio.run(run_channel(client, Channel("official", max_posts=2), state, dry_run=False))

    assert result["posts"] == 0
    assert result["scanned"] == 2
    assert state["official"] == 102


def test_small_mp4_is_uploaded_as_video_instead_of_thumbnail():
    video = b"\x00\x00\x00\x18ftypisom" + b"video-bytes"

    class Client:
        def __init__(self):
            self.downloads = []

        async def get_entity(self, _username):
            return object()

        async def get_messages(self, _entity, ids):
            assert ids == 101
            return SimpleNamespace(document=SimpleNamespace(mime_type="video/mp4", size=len(video)))

        async def download_media(self, _message, *, file, **kwargs):
            self.downloads.append((file, kwargs))
            return video

    client = Client()
    result = asyncio.run(download_media_preview(client, Channel("official"), {"kind": "VIDEO", "message_id": 101}))

    assert result == (video, "video/mp4")
    assert client.downloads == [(bytes, {})]


def test_large_video_downloads_original_video():
    video = b"\x00\x00\x00\x18ftypisom" + b"v" * (5 * 1024 * 1024)

    class Client:
        def __init__(self):
            self.downloads = []

        async def get_entity(self, _username):
            return object()

        async def get_messages(self, _entity, ids):
            assert ids == 101
            return SimpleNamespace(document=SimpleNamespace(mime_type="video/mp4", size=10 * 1024 * 1024))

        async def download_media(self, _message, *, file, **kwargs):
            self.downloads.append((file, kwargs))
            return video

    client = Client()
    result = asyncio.run(download_media_preview(client, Channel("official"), {"kind": "VIDEO", "message_id": 101}))

    assert result == (video, "video/mp4")
    assert client.downloads == [(bytes, {})]


def test_video_between_old_and_volume_limits_keeps_original(monkeypatch):
    monkeypatch.setenv("MEDIA_STORAGE_BACKEND", "railway_volume")
    video = b"\x00\x00\x00\x18ftypisomvideo"

    class Client:
        async def get_entity(self, _username):
            return object()

        async def get_messages(self, _entity, ids):
            assert ids == 101
            return SimpleNamespace(document=SimpleNamespace(mime_type="video/mp4", size=80 * 1024 * 1024))

        async def download_media(self, _message, *, file):
            assert file is bytes
            return video

    assert asyncio.run(download_media_preview(Client(), Channel("official"), {"kind": "VIDEO", "message_id": 101})) == (video, "video/mp4")


@pytest.mark.parametrize("backend,accepted", [("railway_volume", True), ("vercel_blob", False)])
def test_original_photo_over_blob_limit_uses_volume_only(monkeypatch, backend, accepted):
    monkeypatch.setenv("MEDIA_STORAGE_BACKEND", backend)
    photo = b"\xff\xd8\xff" + b"p" * (5 * 1024 * 1024)

    class Client:
        async def get_entity(self, _username):
            return object()

        async def get_messages(self, _entity, ids):
            assert ids == 101
            return SimpleNamespace(photo=SimpleNamespace(id=42))

        async def download_media(self, _message, *, file, **kwargs):
            assert file is bytes
            return photo

    result = asyncio.run(download_media_preview(Client(), Channel("official"), {"kind": "IMAGE", "message_id": 101}))
    assert result == ((photo, "image/jpeg") if accepted else None)


def test_video_media_reaches_candidate_ingest_as_video(monkeypatch):
    channel = Channel("official", category="olympiad")
    posts = [{
        "id": 102,
        "text": (
            "Открыта регистрация на олимпиаду для учеников 9 класса. "
            f"Приём заявок, дедлайн {FUTURE_DEADLINE}. https://example.kz/apply"
        ),
        "url": "https://t.me/official/102",
        "date": datetime.now(timezone.utc).isoformat(),
        "media": [{"message_id": 102, "platform_media_id": "video-102", "kind": "VIDEO"}],
    }]
    uploaded = []
    ingested = []

    async def fake_title(_client, _channel):
        return "Official"

    async def fake_fetch(*_args, **_kwargs):
        return posts

    async def fake_download(*_args):
        return b"\x00\x00\x00\x18ftypisomvideo", "video/mp4"

    def fake_media(*args):
        uploaded.append(args)
        return {"kind": "VIDEO", "url": "https://example.public.blob.vercel-storage.com/video.mp4"}

    def fake_ingest(**kwargs):
        ingested.extend(kwargs["items"])
        return {"created": 1, "duplicate": 0, "failed": 0}

    monkeypatch.setattr(pipeline, "resolve_title", fake_title)
    monkeypatch.setattr(pipeline, "fetch_posts", fake_fetch)
    monkeypatch.setattr(pipeline, "download_media_preview", fake_download)
    monkeypatch.setattr(pipeline, "post_media", fake_media)
    monkeypatch.setattr(pipeline, "post_candidates", fake_ingest)

    result = asyncio.run(run_channel(object(), channel, {}, dry_run=False))

    assert result["ingest"]["created"] == 1
    assert uploaded[0][5] == "video/mp4"
    assert ingested[0]["media"][0]["kind"] == "VIDEO"


def test_expired_source_deadline_reaches_ingest_without_uploading_media(monkeypatch):
    channel = Channel("official", category="olympiad")
    posts = [{
        "id": 103,
        "text": (
            "Открыта регистрация на олимпиаду для учеников 9 класса. "
            "Приём заявок, дедлайн 1 января 2020. https://example.kz/apply"
        ),
        "url": "https://t.me/official/103",
        "date": datetime.now(timezone.utc).isoformat(),
        "media": [{"message_id": 103, "platform_media_id": "photo-103", "kind": "IMAGE"}],
    }]
    ingested = []

    async def fake_title(_client, _channel):
        return "Official"

    async def fake_fetch(*_args, **_kwargs):
        return posts

    async def forbidden_download(*_args):
        raise AssertionError("expired candidate must not upload media")

    def fake_ingest(**kwargs):
        ingested.extend(kwargs["items"])
        return {"created": 0, "duplicate": 1, "expired": 0, "failed": 0}

    monkeypatch.setattr(pipeline, "resolve_title", fake_title)
    monkeypatch.setattr(pipeline, "fetch_posts", fake_fetch)
    monkeypatch.setattr(pipeline, "download_media_preview", forbidden_download)
    monkeypatch.setattr(pipeline, "post_candidates", fake_ingest)

    state = {}
    result = asyncio.run(run_channel(object(), channel, state, dry_run=False))

    assert result["ingest"]["duplicate"] == 1
    assert ingested[0]["applicationDeadline"].startswith("2020-01-01")
    assert ingested[0]["media"] == []
    assert "_expired" not in ingested[0]
    assert state["official"] == 103


def test_private_channel_candidate_does_not_upload_members_only_media(monkeypatch):
    channel = Channel("c_123", category="olympiad", private_id=123, peer=object())
    posts = [{
        "id": 42,
        "text": (
            "Открыта регистрация на олимпиаду для учеников 9 класса. "
            f"Приём заявок, дедлайн {FUTURE_DEADLINE}. https://example.kz/apply"
        ),
        "url": channel.post_url(42),
        "date": datetime.now(timezone.utc).isoformat(),
        "media": [{"message_id": 42, "platform_media_id": "private-photo", "kind": "IMAGE"}],
    }]
    ingested = []

    async def fake_fetch(*_args, **_kwargs):
        return posts

    async def forbidden_download(*_args):
        raise AssertionError("members-only media must not be downloaded")

    def fake_ingest(**kwargs):
        ingested.extend(kwargs["items"])
        return {"created": 1, "duplicate": 0, "failed": 0}

    monkeypatch.setattr(pipeline, "fetch_posts", fake_fetch)
    monkeypatch.setattr(pipeline, "download_media_preview", forbidden_download)
    monkeypatch.setattr(pipeline, "post_candidates", fake_ingest)

    result = asyncio.run(run_channel(object(), channel, {}, dry_run=False))

    assert result["private_media_held"] == 1
    assert ingested[0]["media"] == []
    assert ingested[0]["sourceUrl"] == "https://t.me/c/123/42"


def test_partial_ingest_failure_keeps_offset_for_retry(monkeypatch):
    channel = Channel("official", category="olympiad")
    posts = [
        {
            "id": 102,
            "text": (
                "Открыта регистрация на олимпиаду для учеников 9 класса. "
                f"Приём заявок, дедлайн {FUTURE_DEADLINE}. https://example.kz/apply"
            ),
            "url": "https://t.me/official/102",
            "date": datetime.now(timezone.utc).isoformat(),
        }
    ]

    async def fake_title(client, configured_channel):
        return "Official"

    async def fake_fetch(*args, **kwargs):
        return posts

    monkeypatch.setattr("tgcollect.pipeline.resolve_title", fake_title)
    monkeypatch.setattr("tgcollect.pipeline.fetch_posts", fake_fetch)
    monkeypatch.setattr(
        "tgcollect.pipeline.post_candidates",
        lambda **kwargs: {"created": 0, "duplicate": 0, "failed": 1},
    )
    state = {"official": 101}

    result = asyncio.run(run_channel(object(), channel, state, dry_run=False))

    assert state["official"] == 101
    assert result["offset_advanced"] is False


def test_quarantined_ingest_advances_offset_after_bounded_retry(monkeypatch):
    channel = Channel("official", category="olympiad")
    posts = [{
        "id": 102,
        "text": (
            "Открыта регистрация на олимпиаду для учеников 9 класса. "
            f"Приём заявок, дедлайн {FUTURE_DEADLINE}. https://example.kz/apply"
        ),
        "url": "https://t.me/official/102",
        "date": datetime.now(timezone.utc).isoformat(),
    }]

    async def fake_title(client, configured_channel):
        return "Official"

    async def fake_fetch(*args, **kwargs):
        return posts

    monkeypatch.setattr("tgcollect.pipeline.resolve_title", fake_title)
    monkeypatch.setattr("tgcollect.pipeline.fetch_posts", fake_fetch)
    monkeypatch.setattr(
        "tgcollect.pipeline.post_candidates",
        lambda **kwargs: {
            "outcome": "partial_failure", "created": 0, "duplicate": 0,
            "failed": 0, "quarantined": 1,
        },
    )
    state = {"official": 101}

    result = asyncio.run(run_channel(object(), channel, state, dry_run=False))

    assert state["official"] == 102
    assert result.get("offset_advanced") is not False
    assert result["ingest"]["quarantined"] == 1


def test_failed_media_upload_does_not_ingest_incomplete_candidate(monkeypatch):
    channel = Channel("official", category="olympiad")
    posts = [
        {
            "id": 102,
            "text": (
                "Открыта регистрация на олимпиаду для учеников 9 класса. "
                f"Приём заявок, дедлайн {FUTURE_DEADLINE}. https://example.kz/apply"
            ),
            "url": "https://t.me/official/102",
            "date": datetime.now(timezone.utc).isoformat(),
            "media": [{"message_id": 102, "platform_media_id": "photo-102", "kind": "IMAGE"}],
        }
    ]

    async def fake_title(_client, _channel):
        return "Official"

    async def fake_fetch(*_args, **_kwargs):
        return posts

    async def fake_download(*_args):
        return b"\xff\xd8\xffphoto", "image/jpeg"

    def failed_upload(*_args):
        raise RuntimeError("temporary storage failure")

    monkeypatch.setattr(pipeline, "resolve_title", fake_title)
    monkeypatch.setattr(pipeline, "fetch_posts", fake_fetch)
    monkeypatch.setattr(pipeline, "download_media_preview", fake_download)
    monkeypatch.setattr(pipeline, "post_media", failed_upload)
    monkeypatch.setattr(pipeline, "post_candidates", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("incomplete candidate ingested")))
    state = {"official": 101}

    result = asyncio.run(run_channel(object(), channel, state, dry_run=False))

    assert result["media_upload_failed"] == 1
    assert result["offset_advanced"] is False
    assert state["official"] == 101


def test_blob_403_spools_original_and_replays_after_source_disappears(monkeypatch):
    channel = Channel("official", category="olympiad")
    posts = [{
        "id": 102,
        "text": f"Олимпиада для учеников 9 класса, дедлайн {FUTURE_DEADLINE}. https://example.kz/apply",
        "url": "https://t.me/official/102",
        "date": datetime.now(timezone.utc).isoformat(),
        "media": [{"message_id": 102, "platform_media_id": "video-102", "kind": "VIDEO"}],
    }]

    async def fake_title(_client, _channel):
        return "Official"

    async def fake_fetch(*_args, **_kwargs):
        return posts

    async def fake_download(*_args):
        return b"original-video", "video/mp4"

    def denied(*_args):
        raise PermissionError("Blob 403")

    monkeypatch.setattr(pipeline, "resolve_title", fake_title)
    monkeypatch.setattr(pipeline, "fetch_posts", fake_fetch)
    monkeypatch.setattr(pipeline, "download_media_preview", fake_download)
    monkeypatch.setattr(pipeline, "post_media", denied)
    monkeypatch.setattr(pipeline, "post_candidates", lambda **_kwargs: pytest.fail("must not ingest without media"))
    state = {"official": 101}

    result = asyncio.run(run_channel(object(), channel, state, dry_run=False))

    assert result["offset_advanced"] is False
    assert state["official"] == 101
    spool = MediaSpool()
    assert len(spool.pending_keys()) == 1
    assert spool.load(spool.pending_keys()[0]).media[0].content == b"original-video"

    posts.clear()
    ingested = []

    def restored_media(*_args):
        return {"kind": "VIDEO", "url": "https://blob.example/original.mp4"}

    def ingest(**kwargs):
        ingested.extend(kwargs["items"])
        return {"created": 1, "duplicate": 0, "failed": 0}

    monkeypatch.setattr(pipeline, "post_media", restored_media)
    monkeypatch.setattr(pipeline, "post_candidates", ingest)
    asyncio.run(run_channel(object(), channel, state, dry_run=False))
    assert len(ingested) == 1
    assert ingested[0]["media"][0]["kind"] == "VIDEO"
    assert spool.pending_keys() == []
    asyncio.run(run_channel(object(), channel, state, dry_run=False))
    assert len(ingested) == 1


def test_suspended_blob_opens_persistent_circuit_without_repeated_uploads(monkeypatch):
    import httpx

    channel = Channel("official", category="olympiad")
    posts = [{
        "id": 103,
        "text": f"Олимпиада для учеников 9 класса, дедлайн {FUTURE_DEADLINE}. https://example.kz/apply",
        "url": "https://t.me/official/103",
        "date": datetime.now(timezone.utc).isoformat(),
        "media": [{"message_id": 103, "platform_media_id": "video-103", "kind": "VIDEO"}],
    }]
    now = [1000.0]
    calls = []

    async def fake_title(*_args):
        return "Official"

    async def fake_fetch(*_args, **_kwargs):
        return posts

    async def fake_download(*_args):
        return b"original-video", "video/mp4"

    def suspended(*_args):
        calls.append("HTTP")
        request = httpx.Request("POST", "https://example.invalid/api/parser/media")
        response = httpx.Response(500, request=request)
        raise httpx.HTTPStatusError("suspended", request=request, response=response)

    monkeypatch.setattr(pipeline, "MediaUploadCircuit", lambda root: MediaUploadCircuit(root, clock=lambda: now[0]))
    monkeypatch.setattr(pipeline, "resolve_title", fake_title)
    monkeypatch.setattr(pipeline, "fetch_posts", fake_fetch)
    monkeypatch.setattr(pipeline, "download_media_preview", fake_download)
    monkeypatch.setattr(pipeline, "post_media", suspended)
    monkeypatch.setattr(pipeline, "post_candidates", lambda **_kwargs: pytest.fail("must not ingest without media"))
    state = {"official": 102}

    first = asyncio.run(run_channel(object(), channel, state, dry_run=False))
    second = asyncio.run(run_channel(object(), channel, state, dry_run=False))
    assert first["media_circuit_open"] is True
    assert second["media_circuit_open"] is True
    assert second["media_retry_after_s"] == 60
    assert calls == ["HTTP"]
    assert state["official"] == 102
    assert len(MediaSpool().pending_keys()) == 1

    posts.clear()
    now[0] = 1060.0
    monkeypatch.setattr(pipeline, "post_media", lambda *_args: {"kind": "VIDEO", "url": "https://blob.example/original.mp4"})
    ingested = []
    monkeypatch.setattr(pipeline, "post_candidates", lambda **kwargs: ingested.extend(kwargs["items"]) or {"created": 1, "failed": 0})
    asyncio.run(run_channel(object(), channel, state, dry_run=False))
    assert len(ingested) == 1
    assert MediaSpool().pending_keys() == []
    assert ingested[0]["media"][0]["kind"] == "VIDEO"
    asyncio.run(run_channel(object(), channel, state, dry_run=False))
    assert len(ingested) == 1


def test_more_than_ten_telegram_attachments_hold_candidate_and_offset(monkeypatch):
    channel = Channel("official", category="olympiad")
    posts = [{
        "id": 102,
        "text": f"Олимпиада для учеников 9 класса, дедлайн {FUTURE_DEADLINE}. https://example.kz/apply",
        "url": "https://t.me/official/102",
        "date": datetime.now(timezone.utc).isoformat(),
        "media": [{"message_id": 102 + index, "platform_media_id": f"image-{index}", "kind": "IMAGE"} for index in range(11)],
    }]

    async def fake_title(_client, _channel):
        return "Official"

    async def fake_fetch(*_args, **_kwargs):
        return posts

    monkeypatch.setattr(pipeline, "resolve_title", fake_title)
    monkeypatch.setattr(pipeline, "fetch_posts", fake_fetch)
    monkeypatch.setattr(pipeline, "download_media_preview", lambda *_args: (_ for _ in ()).throw(AssertionError("overflow must not download")))
    monkeypatch.setattr(pipeline, "post_candidates", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("overflow must not ingest")))
    state = {"official": 101}
    result = asyncio.run(run_channel(object(), channel, state, dry_run=False))
    assert result["media_upload_failed"] == 1
    assert result["offset_advanced"] is False
    assert state["official"] == 101


def test_unavailable_source_media_does_not_ingest_incomplete_candidate(monkeypatch):
    channel = Channel("official", category="olympiad")
    posts = [{
        "id": 102,
        "text": f"Олимпиада для учеников 9 класса, дедлайн {FUTURE_DEADLINE}. https://example.kz/apply",
        "url": "https://t.me/official/102",
        "date": datetime.now(timezone.utc).isoformat(),
        "media": [{"message_id": 102, "platform_media_id": "video-102", "kind": "VIDEO"}],
    }]

    async def fake_title(_client, _channel):
        return "Official"

    async def fake_fetch(*_args, **_kwargs):
        return posts

    async def unavailable(*_args):
        return None

    monkeypatch.setattr(pipeline, "resolve_title", fake_title)
    monkeypatch.setattr(pipeline, "fetch_posts", fake_fetch)
    monkeypatch.setattr(pipeline, "download_media_preview", unavailable)
    monkeypatch.setattr(pipeline, "post_candidates", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("incomplete candidate ingested")))
    state = {"official": 101}

    result = asyncio.run(run_channel(object(), channel, state, dry_run=False))

    assert result["media_upload_failed"] == 1
    assert result["offset_advanced"] is False
    assert state["official"] == 101


def test_successful_empty_candidate_batch_advances_offset(monkeypatch):
    channel = Channel("official")
    posts = [
        {
            "id": 102,
            "text": "Обычная новость без набора и дедлайна",
            "url": "https://t.me/official/102",
            "date": datetime.now(timezone.utc).isoformat(),
        }
    ]

    async def fake_title(client, configured_channel):
        return "Official"

    async def fake_fetch(*args, **kwargs):
        return posts

    monkeypatch.setattr("tgcollect.pipeline.resolve_title", fake_title)
    monkeypatch.setattr("tgcollect.pipeline.fetch_posts", fake_fetch)
    state = {"official": 101}

    asyncio.run(run_channel(object(), channel, state, dry_run=False))

    assert state["official"] == 102


def test_run_checkpoints_each_channel_before_the_next_one(monkeypatch):
    class AuthorizedClient:
        async def connect(self):
            return None

        async def disconnect(self):
            return None

        async def is_user_authorized(self):
            return True

    checkpoints = []

    async def fake_run_channel(_client, channel, state, _dry_run):
        if channel.username == "second":
            raise RuntimeError("temporary channel failure")
        state[channel.username] = 42
        return {"channel": channel.username, "posts": 1}

    monkeypatch.setattr(pipeline, "load_channels", lambda _path: [Channel("first"), Channel("second")])
    monkeypatch.setattr(pipeline.state_store, "load", lambda: {})
    monkeypatch.setattr(pipeline.state_store, "save", lambda state: checkpoints.append(dict(state)))
    monkeypatch.setattr(pipeline, "acquire_run_lock", nullcontext)
    monkeypatch.setattr(pipeline, "build_client", AuthorizedClient)
    monkeypatch.setattr(pipeline, "run_channel", fake_run_channel)
    monkeypatch.setattr(pipeline, "PAUSE_BETWEEN_CHANNELS_S", 0)

    results = asyncio.run(pipeline.run_all())

    assert checkpoints == [{"first": 42}, {"first": 42}]
    assert results[0]["channel"] == "first"
    assert results[1]["channel"] == "second"
    assert results[1]["error"] == "temporary channel failure"


def test_manual_run_refuses_interactive_login_without_a_session(monkeypatch):
    calls = []

    class UnauthorizedClient:
        async def connect(self):
            calls.append("connect")

        async def is_user_authorized(self):
            calls.append("authorized")
            return False

        async def disconnect(self):
            calls.append("disconnect")

        async def __aenter__(self):
            raise AssertionError("interactive Telethon start must not run")

    monkeypatch.setattr(pipeline, "load_channels", lambda _path: [Channel("first")])
    monkeypatch.setattr(pipeline.state_store, "load", lambda: {})
    monkeypatch.setattr(pipeline, "acquire_run_lock", nullcontext)
    monkeypatch.setattr(pipeline, "build_client", UnauthorizedClient)

    with pytest.raises(TelegramUnavailable, match="Account not authorised"):
        asyncio.run(pipeline.run_all())

    assert calls == ["connect", "authorized", "disconnect"]


def test_subscribed_run_only_collects_allowlisted_public_broadcasts(monkeypatch):
    class AuthorizedClient:
        async def connect(self):
            return None

        async def disconnect(self):
            return None

        async def is_user_authorized(self):
            return True

        async def iter_dialogs(self):
            for channel_id, username, broadcast in [
                (1, "configured_kz", True),
                (2, "new_opportunities_kz", True),
                (3, None, True),
                (4, "public_group_kz", False),
            ]:
                yield SimpleNamespace(
                    name=username or "Private broadcast",
                    entity=SimpleNamespace(id=channel_id, username=username, broadcast=broadcast),
                )

    seen = []

    async def fake_run_channel(_client, channel, _state, dry_run):
        assert dry_run is True
        seen.append(channel.username)
        return {"channel": channel.username, "posts": 0}

    monkeypatch.setattr(pipeline, "load_channels", lambda _path: [Channel("configured_kz", category="olympiad")])
    monkeypatch.setattr(pipeline.state_store, "load", lambda: {})
    monkeypatch.setattr(pipeline, "acquire_run_lock", nullcontext)
    monkeypatch.setattr(pipeline, "build_client", AuthorizedClient)
    monkeypatch.setattr(pipeline, "run_channel", fake_run_channel)
    monkeypatch.setattr(pipeline, "PAUSE_BETWEEN_CHANNELS_S", 0)

    results = asyncio.run(pipeline.run_all(dry_run=True, subscribed=True))

    assert seen == ["configured_kz"]
    assert [result["channel"] for result in results] == seen


def test_subscribed_backfill_drains_recent_history_and_checkpoints_each_batch(monkeypatch):
    calls = []
    checkpoints = []
    state = {}

    async def fake_run_channel(_client, channel, current, dry_run, before_id=None):
        assert channel.username == "opportunities_kz"
        assert dry_run is False
        calls.append(before_id)
        if len(calls) == 1:
            current[channel.username] = 100
            current[f"__backfill__:{channel.username}"] = 81
            return {"channel": channel.username, "posts": 20, "scanned": 20}
        if len(calls) == 2:
            return {"channel": channel.username, "posts": 0, "scanned": 0}
        if len(calls) == 3:
            current[f"__backfill__:{channel.username}"] = 61
            return {"channel": channel.username, "posts": 20, "scanned": 20}
        current[f"__backfill__:{channel.username}"] = 0
        return {"channel": channel.username, "posts": 4, "scanned": 4}

    monkeypatch.setattr(pipeline, "run_channel", fake_run_channel)
    monkeypatch.setattr(pipeline.state_store, "save", lambda current: checkpoints.append(dict(current)))
    monkeypatch.setattr(pipeline, "PAUSE_BETWEEN_CHANNELS_S", 0)

    results = asyncio.run(pipeline.collect_channel_backlog(
        object(), Channel("opportunities_kz", max_posts=20), state, max_batches_per_channel=10,
    ))

    assert calls == [None, None, 81, 61]
    assert len(results) == len(checkpoints) == 4
    assert state["__backfill__:opportunities_kz"] == 0
    assert all("catch_up_may_remain" not in result for result in results)


def test_subscribed_backfill_stops_after_failed_ingest_without_moving_cursor(monkeypatch):
    state = {"opportunities_kz": 100, "__backfill__:opportunities_kz": 81}
    calls = []

    async def fake_run_channel(_client, channel, current, dry_run, before_id=None):
        calls.append(before_id)
        if before_id is None:
            return {"channel": channel.username, "posts": 0, "scanned": 0}
        return {"channel": channel.username, "posts": 20, "scanned": 20, "offset_advanced": False}

    monkeypatch.setattr(pipeline, "run_channel", fake_run_channel)
    monkeypatch.setattr(pipeline.state_store, "save", lambda _current: None)
    monkeypatch.setattr(pipeline, "PAUSE_BETWEEN_CHANNELS_S", 0)

    results = asyncio.run(pipeline.collect_channel_backlog(
        object(), Channel("opportunities_kz", max_posts=20), state, max_batches_per_channel=10,
    ))

    assert calls == [None, 81]
    assert results[-1]["offset_advanced"] is False
    assert state["__backfill__:opportunities_kz"] == 81


def test_subscribed_backfill_marks_budget_boundary_for_next_run(monkeypatch):
    state = {"opportunities_kz": 100, "__backfill__:opportunities_kz": 81}
    calls = []

    async def fake_run_channel(_client, channel, current, dry_run, before_id=None):
        calls.append(before_id)
        if before_id is None:
            return {"channel": channel.username, "posts": 0, "scanned": 0}
        current[f"__backfill__:{channel.username}"] = 61
        return {"channel": channel.username, "posts": 20, "scanned": 20}

    monkeypatch.setattr(pipeline, "run_channel", fake_run_channel)
    monkeypatch.setattr(pipeline.state_store, "save", lambda _current: None)
    monkeypatch.setattr(pipeline, "PAUSE_BETWEEN_CHANNELS_S", 0)

    results = asyncio.run(pipeline.collect_channel_backlog(
        object(), Channel("opportunities_kz", max_posts=20), state, max_batches_per_channel=2,
    ))

    assert calls == [None, 81]
    assert state["__backfill__:opportunities_kz"] == 61
    assert results[-1]["catch_up_may_remain"] is True


def test_login_holds_collector_lock_and_disconnects(monkeypatch, tmp_path):
    events = []
    session_file = tmp_path / "account.session"
    session_file.write_bytes(b"session")

    @contextmanager
    def locked():
        events.append("lock")
        yield
        events.append("unlock")

    class Client:
        session = SimpleNamespace(filename=str(session_file))

        async def start(self):
            events.append("start")

        async def get_me(self):
            events.append("get_me")
            return SimpleNamespace(username="owner")

        async def disconnect(self):
            events.append("disconnect")

    monkeypatch.setattr(pipeline, "acquire_run_lock", locked)
    monkeypatch.setattr(pipeline, "build_client", Client)

    assert asyncio.run(pipeline.login()) == "@owner"
    assert events == ["lock", "start", "get_me", "disconnect", "unlock"]
    assert session_file.stat().st_mode & 0o777 == 0o600
