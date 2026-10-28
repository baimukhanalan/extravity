"""Temporary source-media archive proxied through the Extravity app."""
from __future__ import annotations

import os
import re
from hashlib import sha256
from urllib.parse import urlsplit

import httpx

from .source_media import MIME_EXTENSIONS, _valid_magic


MAX_UPLOAD_BYTES = 4 * 1024 * 1024
FILE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{20,300}$")
STORAGE_KEY_RE = re.compile(r"^telegram-archive:v1:-?[1-9][0-9]*:[1-9][0-9]*:([A-Za-z0-9_-]{20,300})$")


def configuration() -> tuple[str, str]:
    app_url = os.getenv("APP_URL", "").strip().rstrip("/")
    secret = os.getenv("PARSER_INGEST_SECRET", "").strip()
    parsed = urlsplit(app_url)
    if not secret or not (parsed.scheme == "https" or parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}):
        raise RuntimeError("Telegram media archive proxy is not configured")
    return app_url, secret


def readiness() -> dict:
    try:
        configuration()
    except RuntimeError:
        return {"backend": "telegram_archive", "ready": False, "reason": "Telegram media archive proxy is unavailable"}
    return {"backend": "telegram_archive", "ready": True, "reason": "configured via app proxy"}


def upload(
    source_account: str,
    source_post_id: int | str,
    platform_media_id: str,
    position: int,
    content: bytes,
    mime_type: str,
) -> dict:
    app_url, secret = configuration()
    if mime_type not in MIME_EXTENSIONS or not content or len(content) > MAX_UPLOAD_BYTES or not _valid_magic(content, mime_type):
        raise ValueError("Invalid Telegram archive media")
    checksum = sha256(content).hexdigest()
    extension = MIME_EXTENSIONS[mime_type]
    response = httpx.post(
        f"{app_url}/api/parser/media",
        headers={"Authorization": f"Bearer {secret}"},
        data={
            "sourceAccount": source_account,
            "sourcePostId": str(source_post_id),
            "platformMediaId": platform_media_id,
            "position": str(position),
        },
        files={"file": (f"{checksum}.{extension}", content, mime_type)},
        timeout=120.0,
        follow_redirects=False,
    )
    if response.status_code != 200:
        raise RuntimeError("Telegram media archive proxy upload failed")
    try:
        media = response.json()["media"]
        storage_key = str(media["storageKey"])
        match = STORAGE_KEY_RE.fullmatch(storage_key)
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError("Telegram media archive proxy returned invalid metadata") from error
    expected_url = f"{app_url}/api/telegram-media/{checksum}"
    expected_kind = "VIDEO" if mime_type == "video/mp4" else "IMAGE"
    if (
        not match
        or not FILE_ID_RE.fullmatch(match.group(1))
        or media.get("kind") != expected_kind
        or media.get("url") != expected_url
        or media.get("mimeType") != mime_type
        or media.get("sizeBytes") != len(content)
        or media.get("position") != position
        or media.get("checksum") != checksum
        or media.get("platformMediaId") != platform_media_id
    ):
        raise RuntimeError("Telegram media archive proxy returned mismatched metadata")
    return media
