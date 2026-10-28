from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

from tgcollect import pipeline
from tgcollect import live
from tgcollect.config import Channel
from tgcollect.extract import KZ_TZ


def test_replay_targets_are_exact_public_allowlisted_posts():
    channel = Channel("school_news")
    assert pipeline._selected_public_post_ids(channel, ["https://t.me/school_news/42"], 25) == [42]
    for url in ("https://t.me/c/123/42", "https://t.me/other/42", "https://t.me/school_news/42?x=1"):
        with pytest.raises(ValueError):
            pipeline._selected_public_post_ids(channel, [url], 25)


def test_replay_sends_deadline_only_without_media_or_cursor_changes(monkeypatch, tmp_path):
    channel = Channel("school_news")
    deadline = (datetime.now(KZ_TZ) + timedelta(days=14)).isoformat()
    post = {"id": 42, "url": channel.post_url(42), "text": "test", "media": [{"platform_media_id": "m1"}]}
    posted = []

    async def title(*_args):
        return "School News"

    async def fetched(*_args):
        return [post]

    async def no_media(*_args):
        raise AssertionError("deadline replay must not download media")

    monkeypatch.setattr(pipeline, "MediaSpool", lambda: SimpleNamespace(root=tmp_path))
    monkeypatch.setattr(pipeline, "MediaUploadCircuit", lambda *_args: SimpleNamespace(check=lambda: None))
    monkeypatch.setattr(pipeline, "resolve_title", title)
    monkeypatch.setattr(pipeline, "fetch_edited_post", fetched)
    monkeypatch.setattr(pipeline, "download_media_preview", no_media)
    monkeypatch.setattr(pipeline, "posts_to_candidates", lambda *_args: ([{
        "sourceUrl": post["url"], "applicationDeadline": deadline,
        "_telegramMedia": post["media"], "_expired": False,
    }], {"posts": 1, "candidates": 1, "too_old": 0, "not_opportunity": 0, "adult_audience": 0}))
    monkeypatch.setattr(pipeline, "post_candidates", lambda **kwargs: posted.extend(kwargs["items"]) or {"failed": 0, "duplicate": 1})
    monkeypatch.setattr(pipeline.state_store, "remember_posts", lambda *_args: None)
    state = {}
    result = asyncio.run(pipeline.run_channel(object(), channel, state, dry_run=False, edited_post_id=42,
                                              replay_only_future_deadline=True))

    assert result["deadline_replay"] is True
    assert state == {}
    assert posted == [{"sourceUrl": post["url"], "applicationDeadline": deadline,
                       "refreshExistingPendingOnly": True, "media": []}]


def test_live_recheck_uses_single_client_and_acknowledges_only_success(monkeypatch):
    urls = ["https://t.me/school_news/42", "https://t.me/school_news/43"]
    client = object()
    calls = []
    acknowledgements = []

    async def run(received_client, channel, state, **kwargs):
        assert received_client is client
        assert channel.username == "school_news"
        assert kwargs["replay_only_future_deadline"] is True
        calls.append(kwargs["edited_post_id"])
        if kwargs["edited_post_id"] == 43:
            return {"offset_advanced": False}
        return {"deadline_replay": True, "ingest": {"duplicate": 1}}

    async def no_wait(_seconds):
        return None

    monkeypatch.setattr(live, "fetch_targets", lambda: urls)
    monkeypatch.setattr(live, "mark_checked", lambda checked: acknowledgements.extend(checked) or len(checked))
    monkeypatch.setattr(live, "run_channel", run)
    monkeypatch.setattr(live.asyncio, "sleep", no_wait)
    asyncio.run(live._recheck_missing_deadlines(client, [Channel("school_news")], {}))

    assert calls == [42, 43]
    assert acknowledgements == [urls[0]]
