"""Conservative, one-session enrollment for public Telegram broadcasts."""
from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

import yaml

from .client import is_auth_error
from .config import PAUSE_BETWEEN_CHANNELS_S


PUBLIC_LINK = re.compile(r"https?://(?:www\.)?t\.me/[^\s)\]>]+", re.I)
USERNAME = re.compile(r"[A-Za-z][A-Za-z0-9_]{4,31}\Z")


def registry_public_handles(path: Path) -> list[str]:
    if path.suffix.lower() in {".yaml", ".yml"}:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        handles: dict[str, str] = {}
        for item in raw.get("sources", []):
            handle = str(item.get("username", "") or "").lstrip("@")
            if USERNAME.fullmatch(handle):
                handles.setdefault(handle.casefold(), handle)
        return list(handles.values())
    text = path.read_text(encoding="utf-8")
    handles: dict[str, str] = {}
    for match in PUBLIC_LINK.finditer(text):
        parsed = urlparse(match.group(0))
        segments = [segment for segment in parsed.path.split("/") if segment]
        if not segments:
            continue
        first = segments[0]
        if first.lower() == "s" and len(segments) > 1:
            first = segments[1]
        if first.startswith("+") or first.lower() in {"c", "joinchat", "addstickers", "share"}:
            continue
        if not USERNAME.fullmatch(first):
            continue
        handles.setdefault(first.casefold(), first)
    return list(handles.values())


@dataclass
class JoinReport:
    examined: int = 0
    already_joined: list[str] = field(default_factory=list)
    joined: list[str] = field(default_factory=list)
    non_broadcast: list[str] = field(default_factory=list)
    unavailable: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)
    remaining: int = 0
    stopped: str | None = None
    retry_after_seconds: int | None = None


async def join_public_broadcasts(
    client,
    handles: list[str],
    request_factory,
    *,
    max_joins: int = 5,
    pause_seconds: float = PAUSE_BETWEEN_CHANNELS_S,
) -> JoinReport:
    if not 1 <= max_joins <= 20:
        raise ValueError("max_joins must be between 1 and 20")
    if pause_seconds < 3:
        raise ValueError("pause_seconds must be at least 3")
    report = JoinReport()
    subscribed: set[str] = set()
    consecutive_failures = 0
    async for dialog in client.iter_dialogs():
        entity = getattr(dialog, "entity", None)
        if not getattr(entity, "broadcast", False):
            continue
        name = str(getattr(entity, "username", "") or "").casefold()
        if name:
            subscribed.add(name)

    for index, handle in enumerate(handles):
        if len(report.joined) >= max_joins:
            report.remaining = len(handles) - index
            report.stopped = "batch_limit"
            break
        report.examined += 1
        if handle.casefold() in subscribed:
            report.already_joined.append(handle)
            consecutive_failures = 0
            continue
        try:
            entity = await client.get_entity(handle)
        except Exception as error:
            wait = int(getattr(error, "seconds", 0) or 0)
            if wait > 0:
                report.stopped = "telegram_rate_limit"
                report.retry_after_seconds = wait
                report.remaining = len(handles) - index
                break
            if is_auth_error(error):
                raise
            if type(error).__name__ in {"UsernameInvalidError", "UsernameNotOccupiedError", "ChannelPrivateError"}:
                report.unavailable.append(handle)
                consecutive_failures = 0
                continue
            report.failed.append(handle)
            consecutive_failures += 1
            if consecutive_failures >= 3:
                report.stopped = "repeated_source_errors"
                report.remaining = len(handles) - index - 1
                break
            continue
        if not getattr(entity, "broadcast", False) or not getattr(entity, "username", None):
            report.non_broadcast.append(handle)
            consecutive_failures = 0
            continue
        try:
            await client(request_factory(entity))
        except Exception as error:
            wait = int(getattr(error, "seconds", 0) or 0)
            if wait > 0:
                report.stopped = "telegram_rate_limit"
                report.retry_after_seconds = wait
                report.remaining = len(handles) - index
                break
            if is_auth_error(error):
                raise
            if type(error).__name__ == "UserAlreadyParticipantError":
                report.already_joined.append(handle)
                subscribed.add(handle.casefold())
                consecutive_failures = 0
                continue
            report.failed.append(handle)
            consecutive_failures += 1
            if consecutive_failures >= 3:
                report.stopped = "repeated_source_errors"
                report.remaining = len(handles) - index - 1
                break
            continue
        report.joined.append(handle)
        subscribed.add(handle.casefold())
        consecutive_failures = 0
        if index < len(handles) - 1:
            await asyncio.sleep(pause_seconds)
    return report
