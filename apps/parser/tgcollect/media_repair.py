"""Prepare source-faithful repair evidence for existing Telegram opportunities.

This module never edits opportunities. The input is an explicit DB export, and
every returned asset remains subject to a separate guarded DB reconciliation.
"""
from __future__ import annotations

import asyncio
import hmac
import json
import os
import re
import tempfile
from hashlib import sha256
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit

from parser.ingest import post_media

from .client import download_media_preview, fetch_edited_post
from .config import Channel
from .media_spool import MediaSpool


SOURCE_RE = re.compile(r"^https://t\.me/([A-Za-z0-9_]{1,32})/([1-9][0-9]*)$")
SHA_RE = re.compile(r"^[a-f0-9]{64}$")


def validate_job(raw: dict[str, Any]) -> dict[str, Any]:
    """Require DB row identity and its original checksum for reconciliation."""
    if not isinstance(raw, dict) or not isinstance(raw.get("opportunityId"), str) or not raw["opportunityId"]:
        raise ValueError("opportunityId is required")
    source = raw.get("sourceUrl")
    match = SOURCE_RE.fullmatch(source) if isinstance(source, str) else None
    if not match or match.group(1).casefold().startswith("c_"):
        raise ValueError("public Telegram sourceUrl is required")
    media = raw.get("media")
    if not isinstance(media, list) or not 1 <= len(media) <= 10:
        raise ValueError("1-10 original media rows are required")
    positions: set[int] = set()
    identities: set[str] = set()
    row_ids: set[str] = set()
    for item in media:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not item["id"]:
            raise ValueError("media row id is required")
        identity = item.get("platformMediaId")
        position = item.get("position")
        checksum = item.get("checksum")
        if identity is not None and (not isinstance(identity, str) or not identity):
            raise ValueError("invalid original platformMediaId")
        if not isinstance(position, int) or isinstance(position, bool) or position < 0:
            raise ValueError("original media position is required")
        if not isinstance(checksum, str) or not SHA_RE.fullmatch(checksum):
            raise ValueError("original SHA-256 checksum is required")
        if item["id"] in row_ids or position in positions or (identity is not None and identity in identities):
            raise ValueError("duplicate media identity")
        row_ids.add(item["id"])
        positions.add(position)
        if identity is not None:
            identities.add(identity)
    if positions != set(range(len(media))):
        raise ValueError("media positions must be contiguous from zero")
    return {"opportunityId": raw["opportunityId"], "sourceUrl": source,
            "channel": match.group(1), "postId": int(match.group(2)),
            "media": sorted(media, key=lambda item: item["position"])}


async def prepare_repair(
    raw: dict[str, Any], *, client: Any = None, spool: MediaSpool | None = None,
    upload: bool = False, upload_media: Callable[..., dict[str, Any]] = post_media,
) -> dict[str, Any]:
    """Verify exact media IDs and bytes, then optionally write immutable assets."""
    job = validate_job(raw)
    result: dict[str, Any] = {"opportunityId": job["opportunityId"], "sourceUrl": job["sourceUrl"],
                              "status": "unavailable", "media": []}
    expected = job["media"]
    found: list[tuple[str, int, bytes, str]] = []
    staged = None
    if spool is not None:
        try:
            staged = await asyncio.to_thread(spool.load, spool.key_for(job["channel"], job["postId"]))
        except FileNotFoundError:
            pass
    if staged is not None and staged.complete and staged.candidate.get("sourceUrl") == job["sourceUrl"]:
        found = [(m.platform_media_id, m.position, m.content, m.mime_type) for m in staged.media]
        result["source"] = "verified_spool"
    elif client is not None:
        channel = Channel(job["channel"])
        posts = await fetch_edited_post(client, channel, job["postId"], 36500)
        matching = [post for post in posts if post["url"] == job["sourceUrl"]]
        if len(matching) != 1:
            result["reason"] = "exact source post or album unavailable"
            return result
        descriptors = matching[0].get("media", [])
        if len(descriptors) != len(expected):
            result["reason"] = "source media count changed"
            return result
        for position, descriptor in enumerate(descriptors):
            if expected[position].get("platformMediaId") is not None and str(descriptor.get("platform_media_id")) != expected[position]["platformMediaId"]:
                result["reason"] = "source media identity changed"
                return result
            downloaded = await download_media_preview(client, channel, descriptor)
            if downloaded is None:
                result["reason"] = f"original source media unavailable at position {position}"
                return result
            found.append((str(descriptor["platform_media_id"]), position, *downloaded))
        result["source"] = "telegram_original"
    else:
        result["reason"] = "complete spool unavailable; Telegram session required"
        return result

    if len(found) != len(expected):
        result["reason"] = "source media count mismatch"
        return result
    for (identity, position, content, mime), item in zip(sorted(found, key=lambda entry: entry[1]), expected):
        checksum = sha256(content).hexdigest()
        if (item.get("platformMediaId") is not None and identity != item["platformMediaId"]) or position != item["position"]:
            result["reason"] = "source media identity mismatch"
            return result
        if item.get("checksum") and checksum != item["checksum"]:
            result["reason"] = "source media checksum mismatch"
            return result
        result["media"].append({"id": item["id"], "platformMediaId": identity,
                                "position": position, "checksum": checksum,
                                "expectedChecksum": item.get("checksum"),
                                "expectedPlatformMediaId": item.get("platformMediaId"),
                                "mimeType": mime, "sizeBytes": len(content)})
    if upload:
        for item, (_, _, content, mime) in zip(result["media"], sorted(found, key=lambda entry: entry[1])):
            uploaded = await asyncio.to_thread(upload_media, job["channel"], job["postId"], item["platformMediaId"], item["position"], content, mime)
            url = uploaded.get("url")
            parsed_url = urlsplit(url) if isinstance(url, str) else None
            if (uploaded.get("checksum") != item["checksum"]
                    or uploaded.get("platformMediaId") != item["platformMediaId"]
                    or uploaded.get("storageKey") != f"railway-volume:{item['checksum']}"
                    or parsed_url is None or parsed_url.scheme != "https"
                    or parsed_url.path != f"/api/source-media/{item['checksum']}"
                    or parsed_url.query or parsed_url.fragment):
                raise ValueError("uploaded asset identity mismatch")
            item.update({"url": uploaded["url"], "storageKey": uploaded["storageKey"]})
    result["status"] = "uploaded" if upload else "verified"
    return result


def sign_manifest(payload: dict[str, Any], secret: str) -> dict[str, Any]:
    if not secret:
        raise ValueError("manifest signing secret is required")
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    return {**payload, "signature": hmac.digest(secret.encode(), canonical, "sha256").hex()}


def verify_manifest(document: dict[str, Any], secret: str) -> dict[str, Any]:
    if not isinstance(document, dict) or not isinstance(document.get("signature"), str) or not secret:
        raise ValueError("signed repair manifest required")
    payload = {key: value for key, value in document.items() if key != "signature"}
    expected = sign_manifest(payload, secret)["signature"]
    if not hmac.compare_digest(document["signature"], expected):
        raise ValueError("repair manifest signature mismatch")
    return payload


def _read_private(path: Path) -> dict[str, Any]:
    if not path.is_absolute() or path.is_symlink():
        raise ValueError("repair manifest path must be an absolute regular file")
    stat = path.stat()
    if not path.is_file() or stat.st_mode & 0o077 or stat.st_size > 512 * 1024:
        raise ValueError("repair manifest must be private and below 512 KiB")
    return json.loads(path.read_text(encoding="utf-8"))


def _save_private(path: Path, document: dict[str, Any]) -> None:
    if not path.is_absolute() or path.is_symlink() or not path.parent.is_dir():
        raise ValueError("repair result path must be on an existing absolute directory")
    if path.parent.stat().st_mode & 0o077:
        raise ValueError("repair result directory must be private")
    descriptor, temporary = tempfile.mkstemp(prefix=".repair-result-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            os.fchmod(output.fileno(), 0o600)
            json.dump(document, output, ensure_ascii=False, sort_keys=True)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


async def process_signed_queue_once(
    *, client: Any, spool: MediaSpool, request_path: Path, result_path: Path,
    secret: str, allowed_channels: set[str], allow_upload: bool = False,
) -> str:
    """Run at most one reviewed repair using the live collector's locked session."""
    if request_path == result_path:
        raise ValueError("repair request and result paths must differ")
    request = verify_manifest(_read_private(request_path), secret)
    if request.get("version") != 1 or request.get("mode") not in ("verify", "upload"):
        raise ValueError("invalid repair request version or mode")
    if request["mode"] == "upload" and not allow_upload:
        raise ValueError("repair upload is not enabled")
    raw_jobs = request.get("jobs")
    if not isinstance(raw_jobs, list) or not 1 <= len(raw_jobs) <= 100:
        raise ValueError("repair request must contain 1-100 jobs")
    jobs = [validate_job(raw) for raw in raw_jobs]
    if (len({job["opportunityId"] for job in jobs}) != len(jobs)
            or len({job["sourceUrl"] for job in jobs}) != len(jobs)):
        raise ValueError("duplicate repair opportunity or post")
    if any(job["channel"].casefold() not in allowed_channels for job in jobs):
        raise ValueError("repair source is not an enabled subscribed channel")
    request_digest = sha256(json.dumps(request, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    results: list[dict[str, Any]] = []
    generated_at = datetime.now(timezone.utc).isoformat()
    if result_path.exists():
        existing = verify_manifest(_read_private(result_path), secret)
        if existing.get("requestDigest") != request_digest or existing.get("mode") != request["mode"]:
            raise ValueError("repair result belongs to a different request")
        generated_at = existing.get("generatedAt")
        try:
            parsed_at = datetime.fromisoformat(generated_at) if isinstance(generated_at, str) else None
        except ValueError:
            parsed_at = None
        if parsed_at is None or parsed_at.tzinfo is None:
            raise ValueError("repair result timestamp is invalid")
        if not isinstance(existing.get("results"), list) or len(existing["results"]) > len(jobs):
            raise ValueError("invalid repair result progress")
        results = existing["results"]
        for previous, job in zip(results, jobs):
            if previous.get("opportunityId") != job["opportunityId"] or previous.get("sourceUrl") != job["sourceUrl"]:
                raise ValueError("repair result order or identity mismatch")
    if len(results) == len(jobs):
        return "complete"
    job = jobs[len(results)]
    result = await prepare_repair(job, client=client, spool=spool, upload=request["mode"] == "upload")
    results.append(result)
    _save_private(result_path, sign_manifest({"version": 1, "mode": request["mode"],
                                              "generatedAt": generated_at,
                                              "requestDigest": request_digest, "results": results}, secret))
    return "complete" if len(results) == len(jobs) else "progress"
