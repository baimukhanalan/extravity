"""Thin Telethon wrapper.

Telethon is imported lazily so the extractor and its tests run without the
dependency installed — useful in CI and when demonstrating the pipeline offline.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from parser.source_media import backend as media_backend

from .albums import merge_albums
from .config import API_HASH, API_ID, MAX_INLINE_FLOOD_WAIT_S, SESSION_PATH, SESSION_STRING, Channel

log = logging.getLogger("tgcollect.client")


class TelegramUnavailable(RuntimeError):
    """Telethon missing, credentials absent, or the account not authorised."""


class TelegramAuthRequired(TelegramUnavailable):
    pass


class TelegramRetryLater(TelegramUnavailable):
    """Telegram asked the collector to retry later than one job should wait."""

    def __init__(self, seconds: int, context: str):
        self.seconds = int(seconds)
        super().__init__(f"{context}: retry after {self.seconds}s (FloodWait)")


class FetchedPosts(list[dict]):
    def __init__(self, posts: list[dict], scanned_count: int, last_seen_id: int, oldest_seen_id: int = 0):
        super().__init__(posts)
        self.scanned_count = scanned_count
        self.last_seen_id = last_seen_id
        self.oldest_seen_id = oldest_seen_id


def is_auth_error(error: Exception) -> bool:
    if isinstance(error, TelegramAuthRequired):
        return True
    try:
        from telethon.errors import (
            AuthKeyDuplicatedError,
            AuthKeyUnregisteredError,
            SessionExpiredError,
            SessionRevokedError,
        )
    except ImportError:
        return False
    return isinstance(error, (
        AuthKeyDuplicatedError,
        AuthKeyUnregisteredError,
        SessionExpiredError,
        SessionRevokedError,
    ))


async def _respect_flood_wait(error: Exception, context: str) -> None:
    seconds = int(getattr(error, "seconds", 0) or 0)
    if seconds > MAX_INLINE_FLOOD_WAIT_S:
        raise TelegramRetryLater(seconds, context) from error
    log.warning("FloodWait %ss %s — waiting", seconds, context)
    await asyncio.sleep(seconds + 1)


def build_client(session_path: str | None = None) -> Any:
    try:
        from telethon import TelegramClient
        from telethon.sessions import StringSession
    except ImportError as e:  # pragma: no cover - depends on the environment
        raise TelegramUnavailable(
            "Telethon is not installed. Run: pip install -r requirements.txt"
        ) from e

    if not API_ID or not API_HASH:
        raise TelegramUnavailable(
            "TG_API_ID / TG_API_HASH are not set. Get them at https://my.telegram.org"
        )

    if session_path is None and SESSION_STRING:
        return TelegramClient(StringSession(SESSION_STRING), API_ID, API_HASH)

    path = session_path or SESSION_PATH
    session_dir = Path(path).parent
    session_dir.mkdir(parents=True, exist_ok=True)
    session_dir.chmod(0o700)
    return TelegramClient(path, API_ID, API_HASH)


@asynccontextmanager
async def connected_client(client: Any):
    await client.connect()
    try:
        yield client
    finally:
        await client.disconnect()


def _entity_links(message: Any) -> list[tuple[str, str]]:
    links: list[tuple[str, str]] = []
    text = getattr(message, "message", None) or ""
    utf16 = text.encode("utf-16-le")
    for entity in getattr(message, "entities", None) or []:
        url = getattr(entity, "url", None)
        if url:
            start = max(0, int(getattr(entity, "offset", 0) or 0)) * 2
            end = start + max(0, int(getattr(entity, "length", 0) or 0)) * 2
            before = utf16[:start].decode("utf-16-le", errors="ignore")
            label = utf16[start:end].decode("utf-16-le", errors="ignore")
            context = f"{before.rsplit(chr(10), 1)[-1][-120:]}{label}".strip()
            links.append((context, url))
    markup = getattr(message, "reply_markup", None)
    for row in getattr(markup, "rows", None) or []:
        for button in getattr(row, "buttons", None) or []:
            url = getattr(button, "url", None)
            if url:
                links.append((str(getattr(button, "text", "") or "").strip(), url))
    return links


def message_text(message: Any) -> str:
    """Visible text plus labeled URLs hidden in entities and buttons."""
    text = (getattr(message, "message", None) or "").strip()
    extra = [f"{label}: {url}" if label else url for label, url in _entity_links(message) if url not in text]
    return f"{text}\n{chr(10).join(extra)}".strip() if extra else text


def media_descriptor(message: Any) -> dict | None:
    photo = getattr(message, "photo", None)
    if photo is not None:
        return {
            "message_id": int(message.id),
            "platform_media_id": str(photo.id),
            "kind": "IMAGE",
        }
    document = getattr(message, "document", None)
    mime = str(getattr(document, "mime_type", "") or "") if document is not None else ""
    if mime.startswith("video/"):
        return {
            "message_id": int(message.id),
            "platform_media_id": str(document.id),
            "kind": "VIDEO",
        }
    return None


async def fetch_posts(
    client: Any,
    channel: Channel,
    since_id: int,
    max_posts: int,
    max_age_days: int,
    before_id: int | None = None,
) -> FetchedPosts:
    """New posts of one subscribed channel, oldest first.

    Raises TelegramUnavailable for a channel we cannot read; the caller keeps
    going with the rest of the list.
    """
    from telethon.errors import (
        ChannelPrivateError,
        FloodWaitError,
        UsernameInvalidError,
        UsernameNotOccupiedError,
    )

    try:
        entity = channel.peer or await client.get_entity(channel.username)
    except (UsernameNotOccupiedError, UsernameInvalidError) as e:
        raise TelegramUnavailable(f"{channel.display}: no such channel") from e
    except ChannelPrivateError as e:
        raise TelegramUnavailable(f"{channel.display}: channel is no longer accessible") from e
    except FloodWaitError as e:
        await _respect_flood_wait(e, f"while resolving @{channel.username}")
        entity = channel.peer or await client.get_entity(channel.username)

    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    raw: list[dict] = []
    stale: list[dict] = []

    def _append_message(message: Any) -> None:
        if message.date and message.date < cutoff:
            stale.append({
                "id": int(message.id),
                "text": "",
                "date": message.date.isoformat(),
                "media": [],
                "_skip_reason": "too_old",
            })
            return
        descriptor = media_descriptor(message)
        raw.append(
            {
                "id": int(message.id),
                "text": message_text(message),
                "date": message.date.isoformat() if message.date else None,
                "grouped_id": getattr(message, "grouped_id", None),
                "media": [descriptor] if descriptor else [],
            }
        )

    async def _collect() -> None:
        raw.clear()
        stale.clear()
        # First run must read the newest bounded batch. Starting with
        # reverse=True at min_id=0 walks from a channel's oldest history and an
        # established channel can look permanently empty after the age filter.
        kwargs = {"limit": max_posts}
        if before_id is not None:
            kwargs["offset_id"] = before_id
        elif since_id > 0:
            kwargs.update({"min_id": since_id, "reverse": True})

        last_message = None
        initial_count = 0
        async for message in client.iter_messages(entity, **kwargs):
            _append_message(message)
            last_message = message
            initial_count += 1

        if initial_count < max_posts or last_message is None:
            return
        grouped_id = getattr(last_message, "grouped_id", None)
        if grouped_id is None or (last_message.date and last_message.date < cutoff):
            return

        for _ in range(5):
            adjacent = {"limit": 20}
            if before_id is None and since_id > 0:
                adjacent.update({"min_id": int(last_message.id), "reverse": True})
            else:
                adjacent["offset_id"] = int(last_message.id)
            added = 0
            async for message in client.iter_messages(entity, **adjacent):
                if getattr(message, "grouped_id", None) != grouped_id:
                    return
                _append_message(message)
                last_message = message
                added += 1
            if added < 20:
                return
        raise TelegramUnavailable(f"@{channel.username}: media group exceeds safe batch limit")

    try:
        await _collect()
    except FloodWaitError as e:
        # Short waits are honoured in-process. Long waits return control to the
        # scheduler so a worker is never held for hours.
        await _respect_flood_wait(e, f"while reading @{channel.username}")
        await _collect()

    if since_id == 0 or before_id is not None:
        raw.reverse()

    # Collapse albums into one post each, then attach permalinks.
    posts = merge_albums(raw)
    posts.extend(stale)
    posts.sort(key=lambda post: int(post["id"]))
    for p in posts:
        p["url"] = channel.post_url(int(p["id"]))
    scanned = [*raw, *stale]
    return FetchedPosts(
        posts,
        scanned_count=len(scanned),
        last_seen_id=max((int(message["id"]) for message in scanned), default=since_id),
        oldest_seen_id=min((int(message["id"]) for message in scanned), default=0),
    )


async def fetch_edited_post(client: Any, channel: Channel, post_id: int, max_age_days: int) -> FetchedPosts:
    from telethon.errors import FloodWaitError

    entity = channel.peer or await client.get_entity(channel.username)

    async def read():
        target = await client.get_messages(entity, ids=post_id)
        if not target:
            return [], None
        changed_at = getattr(target, "edit_date", None) or getattr(target, "date", None)
        if changed_at and changed_at < datetime.now(timezone.utc) - timedelta(days=max_age_days):
            return [], changed_at
        grouped_id = getattr(target, "grouped_id", None)
        if grouped_id is None:
            return [target], changed_at
        nearby = await client.get_messages(entity, ids=list(range(max(1, post_id - 10), post_id + 11)))
        messages = sorted(
            (message for message in nearby if message and getattr(message, "grouped_id", None) == grouped_id),
            key=lambda message: int(message.id),
        )
        return messages, changed_at

    try:
        messages, changed_at = await read()
    except FloodWaitError as error:
        await _respect_flood_wait(error, f"while reading edited @{channel.username}")
        messages, changed_at = await read()

    raw = []
    for message in messages:
        descriptor = media_descriptor(message)
        raw.append({
            "id": int(message.id),
            "text": message_text(message),
            "date": message.date.isoformat() if getattr(message, "date", None) else None,
            "edit_date": message.edit_date.isoformat() if getattr(message, "edit_date", None) else None,
            "grouped_id": getattr(message, "grouped_id", None),
            "media": [descriptor] if descriptor else [],
        })
    posts = merge_albums(raw)
    for post in posts:
        post["url"] = channel.post_url(int(post["id"]))
    return FetchedPosts(posts, len(raw), post_id, min((int(message["id"]) for message in raw), default=0))


async def download_media_preview(client: Any, channel: Channel, descriptor: dict) -> tuple[bytes, str] | None:
    entity = channel.peer or await client.get_entity(channel.username)
    message = await client.get_messages(entity, ids=int(descriptor["message_id"]))
    if not message:
        return None
    if descriptor.get("kind") == "VIDEO":
        document = getattr(message, "document", None)
        video_limit = (100 if media_backend() == "railway_volume" else 64) * 1024 * 1024
        if (
            getattr(document, "mime_type", None) == "video/mp4"
            and 0 < int(getattr(document, "size", 0) or 0) <= video_limit
        ):
            video = await client.download_media(message, file=bytes)
            if isinstance(video, bytes) and len(video) <= video_limit and b"ftyp" in video[4:12]:
                return video, "video/mp4"
        return None
    else:
        data = await client.download_media(message, file=bytes)
    image_limit = 32 * 1024 * 1024 if media_backend() == "railway_volume" else 4 * 1024 * 1024
    if not isinstance(data, bytes) or not data or len(data) > image_limit:
        return None
    if data.startswith(b"\xff\xd8\xff"):
        return data, "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return data, "image/png"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return data, "image/webp"
    return None


async def resolve_title(client: Any, channel: Channel) -> str:
    """Channel's own title, so the catalog shows a real organizer name."""
    try:
        entity = channel.peer or await client.get_entity(channel.username)
        return (getattr(entity, "title", None) or channel.display)[:200]
    except Exception:  # noqa: BLE001 — cosmetic only
        return channel.display
