from __future__ import annotations

import hashlib
import hmac
import logging
import os
from datetime import datetime, timezone

import httpx

from parser.config import APP_URL
from parser.ingest import post_candidates, post_media
from tgcollect.extract import baseline, content_hash, reference_date

log = logging.getLogger("wameta.webhook")

APP_SECRET = os.getenv("WA_META_APP_SECRET", "")
VERIFY_TOKEN = os.getenv("WA_META_VERIFY_TOKEN", "")
ACCESS_TOKEN = os.getenv("WA_META_ACCESS_TOKEN", "")
GRAPH_VERSION = os.getenv("WA_META_GRAPH_VERSION", "v25.0")
SOURCE_NAME = os.getenv("WA_META_SOURCE_NAME", "WhatsApp Extravity")
SOURCE_URL = os.getenv("WA_META_SOURCE_URL", f"{APP_URL.rstrip('/')}/contact")
MAX_MEDIA_BYTES = 4 * 1024 * 1024


def configured() -> bool:
    return bool(APP_SECRET and VERIFY_TOKEN and ACCESS_TOKEN)


def valid_signature(raw: bytes, signature: str | None) -> bool:
    if not APP_SECRET or not signature or not signature.startswith("sha256="):
        return False
    expected = hmac.new(APP_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature[7:], expected)


def extract_messages(payload: dict) -> list[dict]:
    messages: list[dict] = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            contacts = value.get("contacts") or []
            contact_name = ((contacts[0].get("profile") or {}).get("name") if contacts else None)
            for message in value.get("messages") or []:
                kind = str(message.get("type") or "")
                block = message.get(kind) or {}
                text = ""
                if kind == "text":
                    text = str(block.get("body") or "")
                elif kind in {"image", "video", "document"}:
                    text = str(block.get("caption") or "")
                if not text.strip():
                    continue
                timestamp = datetime.fromtimestamp(int(message.get("timestamp") or 0), tz=timezone.utc).isoformat()
                messages.append({
                    "id": str(message.get("id") or ""),
                    "sender": contact_name or "WhatsApp submission",
                    "text": text.strip(),
                    "date": timestamp,
                    "media_id": str(block.get("id") or "") if kind in {"image", "video"} else "",
                    "media_kind": kind,
                })
    return messages


def download_media(media_id: str) -> tuple[bytes, str] | None:
    if not ACCESS_TOKEN or not media_id:
        return None
    headers = {"Authorization": f"Bearer {ACCESS_TOKEN}"}
    metadata = httpx.get(
        f"https://graph.facebook.com/{GRAPH_VERSION}/{media_id}",
        headers=headers,
        timeout=30.0,
    )
    if metadata.status_code >= 300:
        return None
    url = (metadata.json() or {}).get("url")
    if not url:
        return None
    with httpx.stream("GET", url, headers=headers, timeout=45.0, follow_redirects=True) as response:
        if response.status_code >= 300:
            return None
        mime_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
        if mime_type not in {"image/jpeg", "image/png", "image/webp", "video/mp4"}:
            return None
        chunks: list[bytes] = []
        size = 0
        for chunk in response.iter_bytes():
            size += len(chunk)
            if size > MAX_MEDIA_BYTES:
                return None
            chunks.append(chunk)
    content = b"".join(chunks)
    return (content, mime_type) if content else None


def process_payload(payload: dict) -> dict:
    created = 0
    found = 0
    for message in extract_messages(payload):
        candidate = baseline(
            text=message["text"],
            post_url=f"{SOURCE_URL}?wa_message={message['id'][:24]}",
            channel_title=SOURCE_NAME,
            default_category="forum",
            today=reference_date(message["date"]),
        )
        if candidate is None:
            continue
        found += 1
        candidate["contentHash"] = content_hash("whatsapp-cloud", message["id"], message["text"])
        candidate["media"] = []
        downloaded = download_media(message["media_id"]) if message["media_id"] else None
        if downloaded:
            content, mime_type = downloaded
            try:
                candidate["media"].append(post_media(
                    "whatsapp-cloud",
                    message["id"],
                    message["media_id"],
                    0,
                    content,
                    mime_type,
                ))
            except Exception as error:
                log.warning("WhatsApp media skipped: %s", error)
        result = post_candidates(
            source_name=SOURCE_NAME,
            source_type="whatsapp_cloud",
            source_url=SOURCE_URL,
            items=[candidate],
        )
        created += int(result.get("created", 0) or 0)
    return {"found": found, "created": created}
