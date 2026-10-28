import os

import pytest

from tgcollect.media_spool import MediaSpool, replay_complete


def candidate():
    return {"sourceUrl": "https://t.me/example/42", "title": "Student contest", "media": []}


def test_stage_survives_restart_and_acknowledges_only_after_ingest(tmp_path):
    spool = MediaSpool(tmp_path / "spool")
    key = spool.stage(
        channel="example", post_id=42, candidate=candidate(),
        media=[("photo-1", 0, b"\xff\xd8\xffimage", "image/jpeg")], expected_media_count=1,
    )
    restarted = MediaSpool(tmp_path / "spool")
    assert restarted.pending_keys() == [key]
    staged = restarted.load(key)
    assert staged.complete
    assert staged.candidate["title"] == "Student contest"
    assert staged.media[0].content == b"\xff\xd8\xffimage"
    assert os.stat(tmp_path / "spool").st_mode & 0o777 == 0o700
    assert os.stat(tmp_path / "spool" / key / "manifest.json").st_mode & 0o777 == 0o600
    restarted.acknowledge(key)
    assert restarted.pending_keys() == []


def test_replay_normalizes_stale_title_and_audience_without_changing_source_bytes(tmp_path):
    spool = MediaSpool(tmp_path)
    old = {**candidate(), "title": "Олимпиада " + "🏆" * 300,
           "fullDescription": "Олимпиада для школьников 9–11 классов. Организатор: Freedom Bank"}
    spool.stage(channel="example", post_id=42, candidate=old,
                media=[("photo-1", 0, b"original", "image/jpeg")], expected_media_count=1)
    received = []
    result = replay_complete(spool, lambda *_args: {"url": "https://example.kz/original.jpg"},
                             lambda **kwargs: received.append(kwargs["items"][0]) or {"failed": 0})
    assert result["ingested"] == 1
    assert len(received[0]["title"].encode("utf-16-le")) // 2 <= 280
    assert received[0]["audienceStatus"] == "SCHOOL"
    assert received[0]["organizerName"] == "Freedom Bank"


def test_partial_album_remains_incomplete_and_unpublished(tmp_path):
    spool = MediaSpool(tmp_path)
    key = spool.stage(channel="example", post_id=42, candidate=candidate(),
                      media=[("photo-1", 0, b"one", "image/jpeg")], expected_media_count=2)
    assert not spool.load(key).complete
    with pytest.raises(ValueError, match="incomplete"):
        spool.acknowledge(key)
    spool.stage(channel="example", post_id=42, candidate=candidate(),
                media=[("photo-1", 0, b"one", "image/jpeg"), ("photo-2", 1, b"two", "image/jpeg")],
                expected_media_count=2)
    assert spool.load(key).complete


def test_corrupt_media_is_rejected(tmp_path):
    spool = MediaSpool(tmp_path)
    key = spool.stage(channel="example", post_id=42, candidate=candidate(),
                      media=[("video-1", 0, b"video", "video/mp4")], expected_media_count=1)
    (tmp_path / key / "0.bin").write_bytes(b"broken")
    with pytest.raises(ValueError, match="checksum mismatch"):
        spool.load(key)


def test_recovers_previous_snapshot_after_interrupted_replace(tmp_path):
    spool = MediaSpool(tmp_path)
    key = spool.stage(channel="example", post_id=42, candidate=candidate(),
                      media=[("photo-1", 0, b"original", "image/jpeg")], expected_media_count=1)
    (tmp_path / key).rename(tmp_path / f".old-{key}")
    assert MediaSpool(tmp_path).pending_keys() == [key]
    assert spool.load(key).media[0].content == b"original"


def test_rejects_oversize_and_pathlike_identity(tmp_path):
    spool = MediaSpool(tmp_path)
    with pytest.raises(ValueError, match="invalid media content"):
        spool.stage(channel="example", post_id=42, candidate=candidate(),
                    media=[("photo", 0, b"x", "text/plain")], expected_media_count=1)
    with pytest.raises(ValueError, match="invalid Telegram source identity"):
        spool.stage(channel="../../example", post_id=42, candidate=candidate(),
                    media=[], expected_media_count=0)
    assert not (tmp_path.parent / "example").exists()


def test_private_channel_is_never_spooled(tmp_path):
    spool = MediaSpool(tmp_path)
    with pytest.raises(ValueError, match="invalid Telegram source identity"):
        spool.stage(channel="c_123", post_id=42, candidate={"sourceUrl": "https://t.me/c/123/42"},
                    media=[], expected_media_count=0)
    assert not spool.pending_keys()


def test_full_spool_fails_closed_without_discarding_existing_candidate(tmp_path, monkeypatch):
    monkeypatch.setattr("tgcollect.media_spool.MAX_SPOOL_BYTES", 10)
    spool = MediaSpool(tmp_path)
    with pytest.raises(ValueError, match="spool is full"):
        spool.stage(channel="example", post_id=42, candidate=candidate(),
                    media=[("photo-1", 0, b"source media", "image/jpeg")], expected_media_count=1)
    assert not spool.pending_keys()


def test_album_total_size_cap_still_applies(tmp_path, monkeypatch):
    monkeypatch.setattr("tgcollect.media_spool.MAX_CANDIDATE_BYTES", 10)
    spool = MediaSpool(tmp_path)
    with pytest.raises(ValueError, match="spool is full"):
        spool.stage(channel="example", post_id=42, candidate=candidate(),
                    media=[("photo-1", 0, b"123456", "image/jpeg"), ("photo-2", 1, b"123456", "image/jpeg")],
                    expected_media_count=2)
    assert not spool.pending_keys()


def test_replay_keeps_403_failure_and_acknowledges_after_full_ingest(tmp_path):
    spool = MediaSpool(tmp_path)
    key = spool.stage(channel="example", post_id=42, candidate=candidate(),
                      media=[("photo-1", 0, b"source", "image/jpeg")], expected_media_count=1)

    def denied(*_args):
        raise PermissionError("403")

    def ingest(**kwargs):
        assert kwargs["items"][0]["media"] == [{"url": "https://blob.example/photo.jpg"}]
        return {"created": 1, "failed": 0}

    assert replay_complete(spool, denied, ingest) == {"pending": 1, "incomplete": 0, "ingested": 0, "failed": 1}
    assert spool.pending_keys() == [key]
    assert replay_complete(spool, lambda *_args: {"url": "https://blob.example/photo.jpg"}, ingest) == {
        "pending": 1, "incomplete": 0, "ingested": 1, "failed": 0,
    }
    assert spool.pending_keys() == []
