"""Send normalized candidates to the app's ingest endpoint."""
from __future__ import annotations

import logging
import time
from hashlib import sha256
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit

import httpx

from .config import APP_URL, INGEST_SECRET, USER_AGENT
from .source_media import SourceMediaStore, backend, storage_readiness

log = logging.getLogger("parser.ingest")
RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}


def preflight_ingest_target() -> dict:
    if not INGEST_SECRET:
        return {"ready": False, "reason": "PARSER_INGEST_SECRET is not set"}
    local_media = storage_readiness(INGEST_SECRET)
    if not local_media["ready"]:
        return {"ready": False, "reason": local_media["reason"]}
    parsed = urlsplit(APP_URL)
    if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}):
        return {"ready": False, "reason": "APP_URL must be HTTPS or local loopback"}
    try:
        response = httpx.get(
            f"{APP_URL}/api/parser/ingest",
            headers={"Authorization": f"Bearer {INGEST_SECRET}", "User-Agent": USER_AGENT},
            timeout=10.0,
            follow_redirects=False,
        )
    except httpx.HTTPError:
        return {"ready": False, "reason": "ingest target is unreachable"}
    if response.status_code != 200:
        return {"ready": False, "reason": f"ingest target returned HTTP {response.status_code}"}
    try:
        body = response.json()
    except ValueError:
        return {"ready": False, "reason": "ingest target returned invalid JSON"}
    if not isinstance(body, dict) or body.get("ok") is not True or body.get("ingest") is not True:
        return {"ready": False, "reason": "ingest target did not confirm readiness"}
    if body.get("mediaConfigured") is not True:
        return {"ready": False, "reason": "ingest target has no media storage"}
    if backend() == "telegram_archive" and body.get("mediaBackend") != "telegram_archive":
        return {"ready": False, "reason": "ingest target does not support Telegram media archive"}
    if backend() == "railway_volume" and body.get("mediaBackend") != "railway_volume":
        return {"ready": False, "reason": "ingest target does not support Railway source media"}
    return {"ready": True, "reason": "verified", "max_batch_size": body.get("maxBatchSize")}


def require_ingest_target() -> None:
    readiness = preflight_ingest_target()
    if not readiness["ready"]:
        raise RuntimeError(f"Ingest target is not ready: {readiness['reason']}")


def _retry_delay(response: httpx.Response | None, attempt: int) -> float:
    base = 20.0 if response is not None and response.status_code == 429 else float(2 ** attempt)
    if response is None:
        return base
    header = response.headers.get("retry-after", "").strip()
    if not header:
        return base
    try:
        requested = float(header)
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(header)
            requested = (retry_at - datetime.now(timezone.utc)).total_seconds()
        except (TypeError, ValueError, OverflowError):
            return base
    return min(60.0, max(base, requested))


def _post_with_retry(url: str, *, max_attempts: int = 4, **kwargs) -> httpx.Response:
    for attempt in range(max_attempts):
        try:
            response = httpx.post(url, **kwargs)
        except httpx.TransportError:
            if attempt == max_attempts - 1:
                raise
            time.sleep(_retry_delay(None, attempt))
            continue
        if response.status_code not in RETRYABLE_STATUS or attempt == max_attempts - 1:
            return response
        time.sleep(_retry_delay(response, attempt))
    raise RuntimeError("Ingest retry budget exhausted")


def post_candidates(source_name: str, source_type: str, source_url: str, items: list[dict]) -> dict:
    if not INGEST_SECRET:
        raise RuntimeError("PARSER_INGEST_SECRET is not set")
    if not items:
        return {"ok": True, "created": 0, "duplicate": 0, "found": 0, "note": "no items"}

    payload = {
        "connector": {"name": source_name, "type": source_type, "url": source_url},
        "items": items,
    }
    resp = _post_with_retry(
        f"{APP_URL}/api/parser/ingest",
        json=payload,
        headers={"Authorization": f"Bearer {INGEST_SECRET}", "User-Agent": USER_AGENT},
        timeout=60.0,
    )
    if resp.status_code >= 300:
        log.error("Ingest failed %s: %s", resp.status_code, resp.text[:500])
        resp.raise_for_status()
    try:
        result = resp.json()
    except ValueError as error:
        raise RuntimeError("Ingest target returned invalid JSON") from error
    if not isinstance(result, dict) or result.get("ok") is not True:
        raise RuntimeError("Ingest target did not acknowledge the batch")
    for field in ("created", "duplicate", "failed"):
        if not isinstance(result.get(field), int) or isinstance(result.get(field), bool):
            raise RuntimeError(f"Ingest target omitted integer metric: {field}")
    result.setdefault("expired", 0)
    result.setdefault("quarantined", 0)
    if not isinstance(result["expired"], int) or not isinstance(result["quarantined"], int):
        raise RuntimeError("Ingest target returned invalid outcome metrics")
    result.setdefault(
        "outcome",
        "partial_failure" if result["quarantined"] else "failed" if result["failed"] else "completed",
    )
    return result


def post_media(
    source_account: str,
    source_post_id: int | str,
    platform_media_id: str,
    position: int,
    content: bytes,
    mime_type: str,
) -> dict:
    if not INGEST_SECRET:
        raise RuntimeError("PARSER_INGEST_SECRET is not set")
    if backend() == "telegram_archive":
        from .telegram_media_archive import upload

        return upload(source_account, source_post_id, platform_media_id, position, content, mime_type)
    if backend() == "railway_volume":
        stored = SourceMediaStore(secret=INGEST_SECRET).put(content, mime_type)
        asset_id = stored["assetId"]
        return {
            "kind": "VIDEO" if mime_type == "video/mp4" else "IMAGE",
            "url": f"{APP_URL}/api/source-media/{asset_id}",
            "storageKey": f"railway-volume:{asset_id}",
            "mimeType": mime_type,
            "sizeBytes": len(content),
            "position": position,
            "checksum": stored["checksum"],
            "platformMediaId": platform_media_id,
        }
    extension = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "video/mp4": "mp4",
    }[mime_type]
    if mime_type == "video/mp4" and len(content) > 4 * 1024 * 1024:
        if len(content) > 64 * 1024 * 1024:
            raise ValueError("Source video exceeds direct upload limit")
        from vercel.blob import BlobClient

        checksum = sha256(content).hexdigest()
        response = _post_with_retry(
            f"{APP_URL}/api/parser/media/token",
            max_attempts=1,
            json={
                "sourceAccount": source_account,
                "sourcePostId": str(source_post_id),
                "platformMediaId": platform_media_id,
                "checksum": checksum,
                "sizeBytes": len(content),
            },
            headers={"Authorization": f"Bearer {INGEST_SECRET}", "User-Agent": USER_AGENT},
            timeout=30.0,
        )
        response.raise_for_status()
        grant = response.json()
        pathname = grant["pathname"]
        expected_pathname = f"opportunity-media/{source_account}/{source_post_id}/{platform_media_id}-{checksum[:12]}.mp4"
        if pathname != expected_pathname:
            raise ValueError("Blob upload grant path mismatch")
        with BlobClient(token=grant["token"]) as blob_client:
            blob = blob_client.put(
                pathname,
                content,
                access="public",
                content_type="video/mp4",
                add_random_suffix=False,
                overwrite=True,
                multipart=True,
            )
        if blob.pathname != pathname:
            raise ValueError("Blob upload path mismatch")
        return {
            "kind": "VIDEO",
            "url": blob.url,
            "storageKey": blob.pathname,
            "mimeType": mime_type,
            "sizeBytes": len(content),
            "position": position,
            "checksum": checksum,
            "platformMediaId": platform_media_id,
        }
    resp = _post_with_retry(
        f"{APP_URL}/api/parser/media",
        max_attempts=1,
        data={
            "sourceAccount": source_account,
            "sourcePostId": str(source_post_id),
            "platformMediaId": platform_media_id,
            "position": str(position),
        },
        files={"file": (f"media.{extension}", content, mime_type)},
        headers={"Authorization": f"Bearer {INGEST_SECRET}", "User-Agent": USER_AGENT},
        timeout=90.0,
    )
    if resp.status_code >= 300:
        log.error("Media ingest failed %s: %s", resp.status_code, resp.text[:500])
        resp.raise_for_status()
    return resp.json()["media"]
