import os
import time
from hashlib import sha256

import httpx
import pytest
from fastapi.testclient import TestClient

import server
from parser import ingest
from parser.source_media import SourceMediaStore, asset_id_for, fetch_referenced_ids, root_path, signature_for, storage_readiness, valid_signature


JPEG = b"\xff\xd8\xff" + b"image-data" * 30
VIDEO = b"\x00\x00\x00\x18ftypisom" + b"video-data" * 40


def test_immutable_idempotent_store_and_quota(tmp_path):
    store = SourceMediaStore(tmp_path / "approved", secret="example-secret", quota_bytes=100 * 1024 * 1024)
    first = store.put(JPEG, "image/jpeg")
    assert first["assetId"] == asset_id_for(sha256(JPEG).hexdigest()) == sha256(JPEG).hexdigest()
    assert store.put(JPEG, "image/jpeg") == first
    path, metadata = store.get(first["assetId"])
    assert path.read_bytes() == JPEG
    assert metadata == first
    assert os.stat(store.root).st_mode & 0o777 == 0o700
    assert os.stat(path).st_mode & 0o777 == 0o600
    assert len(list(store.root.glob("*.bin"))) == 1
    with pytest.raises(ValueError, match="Invalid source-media content"):
        store.put(JPEG, "image/png")
    with pytest.raises(ValueError, match="Invalid source-media content"):
        store.put(b"not a jpeg", "image/jpeg")
    with pytest.raises(FileNotFoundError):
        store.get("../telegram/media-spool")
    path.write_bytes(b"x" * len(JPEG))
    with pytest.raises(FileNotFoundError):
        store.get(first["assetId"])


def test_store_quota_and_spool_separation(tmp_path, monkeypatch):
    spool = tmp_path / "telegram" / "media-spool"
    monkeypatch.setenv("TG_MEDIA_SPOOL_PATH", str(spool))
    monkeypatch.setenv("SOURCE_MEDIA_ROOT", str(spool / "public"))
    with pytest.raises(RuntimeError, match="separate"):
        root_path()
    monkeypatch.setenv("SOURCE_MEDIA_ROOT", str(tmp_path / "approved"))
    assert root_path() == tmp_path / "approved"
    monkeypatch.setenv("IG_STATE_PATH", str(tmp_path / "approved" / "instagram.json"))
    with pytest.raises(RuntimeError, match="account state"):
        root_path()
    monkeypatch.delenv("IG_STATE_PATH")
    monkeypatch.setenv("IG_LOCK_PATH", str(tmp_path / "approved" / "instagram.lock"))
    with pytest.raises(RuntimeError, match="account state"):
        root_path()
    monkeypatch.delenv("IG_LOCK_PATH")
    store = SourceMediaStore(tmp_path / "approved", secret="s", quota_bytes=100 * 1024 * 1024)
    store.put(JPEG, "image/jpeg")
    store.quota_bytes = len(JPEG)
    with pytest.raises(RuntimeError, match="quota exceeded"):
        store.put(VIDEO, "video/mp4")


def test_signed_get_head_range_and_expiry(tmp_path, monkeypatch):
    monkeypatch.setenv("MEDIA_STORAGE_BACKEND", "railway_volume")
    monkeypatch.setenv("SOURCE_MEDIA_ROOT", str(tmp_path / "approved"))
    monkeypatch.setattr("parser.config.INGEST_SECRET", "example-secret")
    stored = SourceMediaStore(secret="example-secret").put(VIDEO, "video/mp4")
    asset_id = stored["assetId"]
    expires = int(time.time()) + 30
    sig = signature_for(asset_id, expires, "example-secret")
    url = f"/source-media/{asset_id}?expires={expires}&sig={sig}"
    client = TestClient(server.app)
    assert client.get(f"/source-media/{asset_id}").status_code == 404
    assert client.get(url.replace(sig, "0" * 64)).status_code == 404
    assert client.get(url, headers={"Range": "bytes=0-11"}).content == VIDEO[:12]
    partial = client.get(url, headers={"Range": "bytes=0-11"})
    assert partial.status_code == 206
    assert partial.headers["content-range"] == f"bytes 0-11/{len(VIDEO)}"
    assert partial.headers["accept-ranges"] == "bytes"
    assert partial.headers["cache-control"] == "private, no-store"
    assert client.head(url).headers["content-length"] == str(len(VIDEO))
    assert client.get(url, headers={"Range": "bytes=99999-"}).status_code == 416
    assert client.get(url, headers={"Range": "bytes=0-1,3-4"}).status_code == 416
    assert client.get(url, headers={"Range": "bytes=-5"}).content == VIDEO[-5:]
    assert not valid_signature(asset_id, str(expires), sig, "example-secret", now=expires + 1)
    assert not valid_signature(asset_id, str(expires), sig, "example-secret", now=expires - 61)


def test_post_media_volume_branch_returns_site_proxy_url(tmp_path, monkeypatch):
    monkeypatch.setenv("MEDIA_STORAGE_BACKEND", "railway_volume")
    monkeypatch.setenv("SOURCE_MEDIA_ROOT", str(tmp_path / "approved"))
    monkeypatch.setattr(ingest, "INGEST_SECRET", "example-secret")
    monkeypatch.setattr(ingest, "APP_URL", "https://site.example")
    result = ingest.post_media("channel", 42, "telegram-photo-1", 0, JPEG, "image/jpeg")
    asset_id = asset_id_for(sha256(JPEG).hexdigest())
    assert result == {
        "kind": "IMAGE",
        "url": f"https://site.example/api/source-media/{asset_id}",
        "storageKey": f"railway-volume:{asset_id}",
        "mimeType": "image/jpeg",
        "sizeBytes": len(JPEG),
        "position": 0,
        "checksum": sha256(JPEG).hexdigest(),
        "platformMediaId": "telegram-photo-1",
    }
    video = ingest.post_media("channel", 42, "telegram-video-1", 1, VIDEO, "video/mp4")
    assert video["kind"] == "VIDEO"
    assert video["url"].startswith("https://site.example/api/source-media/")
    assert video["sizeBytes"] == len(VIDEO)


def test_post_media_telegram_archive_branch(monkeypatch):
    monkeypatch.setenv("MEDIA_STORAGE_BACKEND", "telegram_archive")
    monkeypatch.setenv("APP_URL", "https://site.example")
    monkeypatch.setenv("PARSER_INGEST_SECRET", "example-secret")
    monkeypatch.setattr(ingest, "INGEST_SECRET", "example-secret")
    checksum = sha256(JPEG).hexdigest()
    monkeypatch.setattr("parser.telegram_media_archive.httpx.post", lambda *_args, **_kwargs: httpx.Response(200, json={
        "ok": True,
        "media": {
            "kind": "IMAGE",
            "url": f"https://site.example/api/telegram-media/{checksum}",
            "storageKey": f"telegram-archive:v1:-1001234567890:42:{'B' * 40}",
            "mimeType": "image/jpeg",
            "sizeBytes": len(JPEG),
            "position": 0,
            "checksum": checksum,
            "platformMediaId": "telegram-photo-1",
        },
    }))
    result = ingest.post_media("channel", 42, "telegram-photo-1", 0, JPEG, "image/jpeg")
    assert result == {
        "kind": "IMAGE",
        "url": f"https://site.example/api/telegram-media/{checksum}",
        "storageKey": f"telegram-archive:v1:-1001234567890:42:{'B' * 40}",
        "mimeType": "image/jpeg",
        "sizeBytes": len(JPEG),
        "position": 0,
        "checksum": checksum,
        "platformMediaId": "telegram-photo-1",
    }


def test_storage_readiness_checks_local_write_and_quota(tmp_path, monkeypatch):
    monkeypatch.setenv("MEDIA_STORAGE_BACKEND", "railway_volume")
    monkeypatch.setenv("SOURCE_MEDIA_ROOT", str(tmp_path / "approved"))
    report = storage_readiness("example-secret")
    assert report["ready"] is True
    assert report["filesystemFreeBytes"] > 0
    assert report["quotaRemainingBytes"] > 0
    assert not list((tmp_path / "approved").glob(".probe-*"))
    monkeypatch.setenv("SOURCE_MEDIA_MAX_BYTES", "1")
    assert storage_readiness("example-secret")["ready"] is False


def test_authenticated_references_and_gc_fail_closed(tmp_path, monkeypatch):
    store = SourceMediaStore(tmp_path / "approved", secret="example-secret", quota_bytes=100 * 1024 * 1024)
    first = store.put(JPEG, "image/jpeg")["assetId"]
    second = store.put(VIDEO, "video/mp4")["assetId"]
    old = time.time() - 8 * 86400
    for asset_id in (first, second):
        os.utime(store.root / f"{asset_id}.bin", (old, old))
        os.utime(store.root / f"{asset_id}.json", (old, old))
    with pytest.raises(ValueError, match="Authenticated DB"):
        store.prune_unreferenced({first})
    monkeypatch.setattr("parser.source_media.httpx.get", lambda *_args, **_kwargs: httpx.Response(
        200, json={"ok": True, "assetIds": [first]},
    ))
    references = fetch_referenced_ids("https://site.example", "example-secret")
    preview = store.prune_unreferenced(references)
    assert preview["eligible"] == 1 and preview["deleted"] == 0 and preview["assetIds"] == [second]
    assert store.get(second)[1]["assetId"] == second
    result = store.prune_unreferenced(references, dry_run=False)
    assert result["deleted"] == 1
    assert store.prune_unreferenced(references, dry_run=False)["deleted"] == 0
    assert store.get(first)[1]["assetId"] == first
    with pytest.raises(FileNotFoundError):
        store.get(second)


@pytest.mark.parametrize("response", [
    httpx.Response(503),
    httpx.Response(200, text="not-json"),
    httpx.Response(200, json={"ok": True, "assetIds": []}),
    httpx.Response(200, json={"ok": True, "assetIds": ["bad"]}),
    httpx.Response(200, json={"ok": True, "assetIds": ["a" * 64, "a" * 64]}),
])
def test_reference_fetch_rejects_partial_or_invalid_response(monkeypatch, response):
    monkeypatch.setattr("parser.source_media.httpx.get", lambda *_args, **_kwargs: response)
    with pytest.raises(RuntimeError, match="reference list"):
        fetch_referenced_ids("https://site.example", "example-secret")
