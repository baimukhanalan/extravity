import httpx
import pytest
from hashlib import sha256
from types import SimpleNamespace

from parser import ingest


def response(url, status, body=None, headers=None):
    return httpx.Response(
        status,
        json=body or {},
        headers=headers,
        request=httpx.Request("POST", url),
    )


def test_candidate_ingest_recovers_from_rate_limit(monkeypatch):
    monkeypatch.setattr(ingest, "INGEST_SECRET", "test-secret")
    delays = []
    calls = []

    def fake_post(url, **kwargs):
        calls.append(kwargs["json"])
        if len(calls) < 3:
            return response(url, 429)
        return response(url, 200, {"ok": True, "created": 1, "duplicate": 0, "failed": 0})

    monkeypatch.setattr(ingest.httpx, "post", fake_post)
    monkeypatch.setattr(ingest.time, "sleep", delays.append)
    result = ingest.post_candidates("Telegram", "telegram", "https://t.me/source", [{"title": "Contest"}])
    assert result["created"] == 1
    assert len(calls) == 3
    assert calls[0] == calls[1] == calls[2]
    assert delays == [20.0, 20.0]


def test_candidate_ingest_rejects_malformed_success(monkeypatch):
    monkeypatch.setattr(ingest, "INGEST_SECRET", "test-secret")
    monkeypatch.setattr(
        ingest.httpx,
        "post",
        lambda url, **kwargs: response(url, 200, {"ok": True, "created": 1}),
    )
    with pytest.raises(RuntimeError, match="omitted integer metric"):
        ingest.post_candidates("Telegram", "telegram", "https://t.me/source", [{"title": "Contest"}])


def test_media_upload_defers_after_one_server_error(monkeypatch):
    monkeypatch.setattr(ingest, "INGEST_SECRET", "test-secret")
    delays = []
    calls = []

    def fake_post(url, **kwargs):
        calls.append(kwargs)
        return response(url, 503)

    monkeypatch.setattr(ingest.httpx, "post", fake_post)
    monkeypatch.setattr(ingest.time, "sleep", delays.append)
    with pytest.raises(httpx.HTTPStatusError):
        ingest.post_media("channel", 123, "photo-1", 0, b"photo", "image/jpeg")
    assert len(calls) == 1
    assert delays == []


def test_large_video_token_defers_after_one_server_error(monkeypatch):
    monkeypatch.setattr(ingest, "INGEST_SECRET", "test-secret")
    calls = []
    delays = []
    monkeypatch.setattr(ingest.httpx, "post", lambda url, **kwargs: calls.append(url) or response(url, 503))
    monkeypatch.setattr(ingest.time, "sleep", delays.append)
    with pytest.raises(httpx.HTTPStatusError):
        ingest.post_media("channel", 123, "video-1", 0, b"x" * (5 * 1024 * 1024), "video/mp4")
    assert len(calls) == 1
    assert calls[0].endswith("/api/parser/media/token")
    assert delays == []


def test_large_video_uses_scoped_direct_upload(monkeypatch):
    from vercel import blob as vercel_blob

    monkeypatch.setattr(ingest, "INGEST_SECRET", "test-secret")
    content = b"\x00\x00\x00\x18ftypisom" + b"v" * (5 * 1024 * 1024)
    checksum = sha256(content).hexdigest()
    pathname = f"opportunity-media/channel/123/video-1-{checksum[:12]}.mp4"
    calls = []

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return response(url, 200, {"token": "scoped-token", "pathname": pathname})

    class FakeBlobClient:
        def __init__(self, token):
            assert token == "scoped-token"

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def put(self, path, body, **kwargs):
            assert path == pathname
            assert body == content
            assert kwargs["multipart"] is True
            return SimpleNamespace(pathname=path, url="https://blob.example/video.mp4")

    monkeypatch.setattr(ingest.httpx, "post", fake_post)
    monkeypatch.setattr(vercel_blob, "BlobClient", FakeBlobClient)
    media = ingest.post_media("channel", 123, "video-1", 0, content, "video/mp4")
    assert media["kind"] == "VIDEO"
    assert media["checksum"] == checksum
    assert media["url"] == "https://blob.example/video.mp4"
    assert calls[0][0].endswith("/api/parser/media/token")
    assert calls[0][1]["json"]["sizeBytes"] == len(content)


def test_transport_failure_retries_without_dropping_candidate(monkeypatch):
    monkeypatch.setattr(ingest, "INGEST_SECRET", "test-secret")
    attempts = []
    delays = []

    def fake_post(url, **kwargs):
        attempts.append(url)
        if len(attempts) == 1:
            raise httpx.ConnectError("temporary connection failure")
        return response(url, 200, {"ok": True, "created": 0, "duplicate": 1, "failed": 0})

    monkeypatch.setattr(ingest.httpx, "post", fake_post)
    monkeypatch.setattr(ingest.time, "sleep", delays.append)
    result = ingest.post_candidates("Telegram", "telegram", "https://t.me/source", [{"title": "Contest"}])
    assert result["duplicate"] == 1
    assert len(attempts) == 2
    assert delays == [1.0]


def test_permanent_validation_error_is_not_retried(monkeypatch):
    monkeypatch.setattr(ingest, "INGEST_SECRET", "test-secret")
    calls = []
    monkeypatch.setattr(ingest.httpx, "post", lambda url, **kwargs: calls.append(url) or response(url, 422))
    monkeypatch.setattr(ingest.time, "sleep", lambda delay: pytest.fail(f"unexpected delay: {delay}"))
    with pytest.raises(httpx.HTTPStatusError):
        ingest.post_candidates("Telegram", "telegram", "https://t.me/source", [{"title": "Contest"}])
    assert len(calls) == 1


def test_retry_after_is_bounded(monkeypatch):
    delays = []
    calls = []
    url = "https://extravity.example/api/parser/ingest"

    def fake_post(_url, **kwargs):
        calls.append(_url)
        if len(calls) == 1:
            return response(_url, 429, headers={"retry-after": "120"})
        return response(_url, 200)

    monkeypatch.setattr(ingest.httpx, "post", fake_post)
    monkeypatch.setattr(ingest.time, "sleep", delays.append)
    assert ingest._post_with_retry(url).status_code == 200
    assert delays == [60.0]


def test_rate_limit_exhaustion_remains_a_failure(monkeypatch):
    monkeypatch.setattr(ingest, "INGEST_SECRET", "test-secret")
    calls = []
    delays = []
    monkeypatch.setattr(ingest.httpx, "post", lambda url, **kwargs: calls.append(url) or response(url, 429))
    monkeypatch.setattr(ingest.time, "sleep", delays.append)
    with pytest.raises(httpx.HTTPStatusError):
        ingest.post_candidates("Telegram", "telegram", "https://t.me/source", [{"title": "Contest"}])
    assert len(calls) == 4
    assert delays == [20.0, 20.0, 20.0]
