from hashlib import sha256
import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import pytest

from tgcollect import media_repair
from tgcollect.media_repair import prepare_repair, process_signed_queue_once, sign_manifest, validate_job, verify_manifest
from tgcollect.media_spool import MediaSpool


PHOTO = b"\xff\xd8\xfforiginal"


def job(checksum=None):
    return {"opportunityId": "existing-row", "sourceUrl": "https://t.me/example/42",
            "media": [{"id": "existing-media-row", "platformMediaId": "photo-1",
                       "position": 0, "checksum": checksum}]}


def test_repair_from_complete_spool_is_source_bound_and_does_not_acknowledge(tmp_path):
    spool = MediaSpool(tmp_path)
    key = spool.stage(channel="example", post_id=42, candidate={"sourceUrl": "https://t.me/example/42"},
                      media=[("photo-1", 0, PHOTO, "image/jpeg")], expected_media_count=1)
    calls = []

    def upload(*args):
        calls.append(args)
        return {"url": "https://site.example/api/source-media/" + sha256(PHOTO).hexdigest(),
                "storageKey": "railway-volume:" + sha256(PHOTO).hexdigest(),
                "checksum": sha256(PHOTO).hexdigest(), "platformMediaId": "photo-1"}

    result = __import__("asyncio").run(prepare_repair(job(sha256(PHOTO).hexdigest()), spool=spool,
                                                     upload=True, upload_media=upload))
    assert result["status"] == "uploaded"
    assert result["source"] == "verified_spool"
    assert result["media"][0]["id"] == "existing-media-row"
    assert result["media"][0]["expectedChecksum"] == sha256(PHOTO).hexdigest()
    assert result["media"][0]["expectedPlatformMediaId"] == "photo-1"
    assert len(calls) == 1
    assert spool.pending_keys() == [key]


def test_repair_rejects_changed_checksum_before_any_upload(tmp_path):
    spool = MediaSpool(tmp_path)
    spool.stage(channel="example", post_id=42, candidate={"sourceUrl": "https://t.me/example/42"},
                media=[("photo-1", 0, PHOTO, "image/jpeg")], expected_media_count=1)
    result = __import__("asyncio").run(prepare_repair(job("0" * 64), spool=spool, upload=True,
                                                     upload_media=lambda *_args: pytest.fail("must not upload")))
    assert result["status"] == "unavailable"
    assert result["reason"] == "source media checksum mismatch"


def test_repair_requires_exact_existing_media_identity():
    missing = job()
    missing["media"][0]["platformMediaId"] = None
    with pytest.raises(ValueError, match="SHA-256 checksum"):
        validate_job(missing)
    private = job()
    private["sourceUrl"] = "https://t.me/c/123/42"
    with pytest.raises(ValueError, match="public Telegram"):
        validate_job(private)


def test_checksum_can_identify_original_when_legacy_media_id_is_missing(tmp_path):
    spool = MediaSpool(tmp_path)
    spool.stage(channel="example", post_id=42, candidate={"sourceUrl": "https://t.me/example/42"},
                media=[("photo-1", 0, PHOTO, "image/jpeg")], expected_media_count=1)
    legacy = job(sha256(PHOTO).hexdigest())
    legacy["media"][0]["platformMediaId"] = None
    result = __import__("asyncio").run(prepare_repair(legacy, spool=spool))
    assert result["status"] == "verified"
    assert result["media"][0]["platformMediaId"] == "photo-1"
    assert result["media"][0]["expectedPlatformMediaId"] is None


def test_manifest_signature_is_stable_and_covers_results():
    first = sign_manifest({"version": 1, "results": [{"status": "verified"}]}, "secret")
    second = sign_manifest({"results": [{"status": "verified"}], "version": 1}, "secret")
    changed = sign_manifest({"version": 1, "results": [{"status": "failed"}]}, "secret")
    assert first == second
    assert first["signature"] != changed["signature"]


def _private_json(path: Path, document: dict) -> None:
    path.write_text(json.dumps(document), encoding="utf-8")
    os.chmod(path, 0o600)


def test_live_repair_queue_processes_one_signed_job_per_idle_pass(monkeypatch, tmp_path):
    request_path, result_path = tmp_path / "request.json", tmp_path / "result.json"
    second = job(sha256(PHOTO).hexdigest())
    second["opportunityId"] = "second-row"
    second["sourceUrl"] = "https://t.me/example/43"
    _private_json(request_path, sign_manifest({"version": 1, "mode": "verify", "jobs": [job(sha256(PHOTO).hexdigest()), second]}, "secret"))
    seen = []

    async def fake_prepare(raw, **kwargs):
        seen.append((raw["opportunityId"], kwargs["client"]))
        return {"opportunityId": raw["opportunityId"], "sourceUrl": raw["sourceUrl"], "status": "verified", "media": []}

    monkeypatch.setattr(media_repair, "prepare_repair", fake_prepare)

    async def run_once():
        return await process_signed_queue_once(client="live-client", spool=MediaSpool(tmp_path / "spool"),
                                               request_path=request_path, result_path=result_path,
                                               secret="secret", allowed_channels={"example"})

    assert asyncio.run(run_once()) == "progress"
    first_result = verify_manifest(json.loads(result_path.read_text()), "secret")
    assert len(first_result["results"]) == 1
    assert first_result["version"] == 1
    assert first_result["mode"] == "verify"
    assert isinstance(first_result["requestDigest"], str) and len(first_result["requestDigest"]) == 64
    assert datetime.fromisoformat(first_result["generatedAt"]).tzinfo is not None
    assert result_path.stat().st_mode & 0o777 == 0o600
    assert asyncio.run(run_once()) == "complete"
    completed_result = verify_manifest(json.loads(result_path.read_text()), "secret")
    assert completed_result["generatedAt"] == first_result["generatedAt"]
    assert asyncio.run(run_once()) == "complete"
    assert seen == [("existing-row", "live-client"), ("second-row", "live-client")]


def test_live_upload_report_has_existing_reconciler_schema(monkeypatch, tmp_path):
    request_path, result_path = tmp_path / "request.json", tmp_path / "result.json"
    checksum = sha256(PHOTO).hexdigest()
    _private_json(request_path, sign_manifest({"version": 1, "mode": "upload", "jobs": [job(checksum)]}, "secret"))

    async def fake_prepare(raw, **_kwargs):
        return {"opportunityId": raw["opportunityId"], "sourceUrl": raw["sourceUrl"],
                "status": "uploaded", "source": "telegram_original", "media": [{
                    "id": raw["media"][0]["id"], "expectedPlatformMediaId": "photo-1",
                    "platformMediaId": "photo-1", "position": 0,
                    "expectedChecksum": checksum, "checksum": checksum,
                    "mimeType": "image/jpeg", "sizeBytes": len(PHOTO),
                    "storageKey": f"railway-volume:{checksum}",
                    "url": f"https://example.test/api/source-media/{checksum}"}]}

    monkeypatch.setattr(media_repair, "prepare_repair", fake_prepare)
    assert asyncio.run(process_signed_queue_once(client=object(), spool=MediaSpool(tmp_path / "spool"),
                                                 request_path=request_path, result_path=result_path,
                                                 secret="secret", allowed_channels={"example"}, allow_upload=True)) == "complete"
    report = verify_manifest(json.loads(result_path.read_text()), "secret")
    assert report["version"] == 1 and report["mode"] == "upload"
    assert datetime.fromisoformat(report["generatedAt"]).astimezone(timezone.utc).tzinfo is not None
    assert len(report["results"]) == 1
    media = report["results"][0]["media"][0]
    assert media["expectedChecksum"] == media["checksum"] == checksum
    assert media["expectedPlatformMediaId"] == media["platformMediaId"] == "photo-1"


def test_live_repair_queue_rejects_tampering_or_unsubscribed_source(monkeypatch, tmp_path):
    request_path, result_path = tmp_path / "request.json", tmp_path / "result.json"
    payload = {"version": 1, "mode": "verify", "jobs": [job(sha256(PHOTO).hexdigest())]}
    signed = sign_manifest(payload, "secret")
    signed["jobs"][0]["media"][0]["checksum"] = "0" * 64
    _private_json(request_path, signed)
    monkeypatch.setattr(media_repair, "prepare_repair", lambda *_args, **_kwargs: pytest.fail("must not download"))

    async def run_once(allowed={"example"}):
        return await process_signed_queue_once(client=object(), spool=MediaSpool(tmp_path / "spool"),
                                               request_path=request_path, result_path=result_path,
                                               secret="secret", allowed_channels=allowed)

    with pytest.raises(ValueError, match="signature mismatch"):
        asyncio.run(run_once())
    assert not result_path.exists()
    _private_json(request_path, sign_manifest(payload, "secret"))
    with pytest.raises(ValueError, match="not an enabled subscribed channel"):
        asyncio.run(run_once({"other"}))
    assert not result_path.exists()


def test_live_repair_queue_upload_requires_explicit_gate(tmp_path):
    request_path, result_path = tmp_path / "request.json", tmp_path / "result.json"
    _private_json(request_path, sign_manifest({"version": 1, "mode": "upload", "jobs": [job(sha256(PHOTO).hexdigest())]}, "secret"))
    with pytest.raises(ValueError, match="upload is not enabled"):
        asyncio.run(process_signed_queue_once(client=object(), spool=MediaSpool(tmp_path / "spool"),
                                              request_path=request_path, result_path=result_path,
                                              secret="secret", allowed_channels={"example"}))
    assert not result_path.exists()
