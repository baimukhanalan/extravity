"""Conservative enrollment for allowlisted Telegram groups in the source registry.

This module only resolves invite metadata and membership. It never fetches messages.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import yaml

from .client import is_auth_error


SECTION = "## Публичные invite-группы: отдельная очередь на ручную проверку"
LINK = re.compile(r"\[([^\]]+)\]\((https://t\.me/[^)]+)\)")
USERNAME = re.compile(r"[A-Za-z][A-Za-z0-9_]{4,31}\Z")
INVITE = re.compile(r"[A-Za-z0-9_-]{10,}\Z")


@dataclass(frozen=True)
class GroupSource:
    number: int
    label: str
    value: str
    private_invite: bool


@dataclass(frozen=True)
class GroupResult:
    number: int
    status: str
    group: bool | None = None
    members: int | None = None
    retry_after_seconds: int | None = None


def registry_groups(path: Path) -> list[GroupSource]:
    if path.suffix.lower() in {".yaml", ".yml"}:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        rows = [(str(item["label"]), str(item["url"])) for item in data.get("groups", [])]
    else:
        raw = path.read_text(encoding="utf-8")
        if SECTION not in raw:
            raise ValueError("Telegram invite-group section missing")
        section = raw.split(SECTION, 1)[1].split("\n## ", 1)[0]
        rows = []
        for line in section.splitlines():
            if not line.startswith("| Telegram |"):
                continue
            match = LINK.search(line)
            if match is None:
                raise ValueError("Malformed Telegram group row")
            rows.append((match.group(1), match.group(2)))
    out: list[GroupSource] = []
    for label, url in rows:
        parsed = urlparse(url)
        if parsed.hostname != "t.me" or parsed.query or parsed.fragment:
            raise ValueError("Unexpected Telegram group URL")
        segments = [part for part in parsed.path.split("/") if part]
        if len(segments) != 1:
            raise ValueError("Unexpected Telegram group path")
        value = segments[0]
        private = value.startswith("+")
        if private:
            value = value[1:]
            if not INVITE.fullmatch(value):
                raise ValueError("Invalid invite format")
        elif not USERNAME.fullmatch(value):
            raise ValueError("Invalid public group username")
        out.append(GroupSource(len(out) + 1, label, value, private))
    if not out:
        raise ValueError("Expected at least one allowlisted Telegram group")
    identities = {(source.value.casefold(), source.private_invite) for source in out}
    if len(identities) != len(out):
        raise ValueError("Telegram group registry contains duplicates")
    return out


def is_group(entity: object) -> bool:
    if getattr(entity, "broadcast", False):
        return False
    if getattr(entity, "megagroup", False):
        return True
    return type(entity).__name__ == "Chat"


def invite_is_group(info: object) -> bool:
    if type(info).__name__ == "ChatInviteAlready":
        return is_group(getattr(info, "chat", None))
    if getattr(info, "broadcast", False):
        return False
    return bool(getattr(info, "megagroup", False)) or not bool(getattr(info, "channel", True))


async def process_group(client, source: GroupSource, *, join: bool, request_types) -> GroupResult:
    """Preview one source; join only when explicitly called with join=True."""
    try:
        if source.private_invite:
            info = await client(request_types.CheckChatInviteRequest(source.value))
            if not invite_is_group(info):
                return GroupResult(source.number, "not_group", False)
            if type(info).__name__ == "ChatInviteAlready":
                return GroupResult(source.number, "already_joined", True)
            if not join:
                return GroupResult(source.number, "available", True, getattr(info, "participants_count", None))
            await client(request_types.ImportChatInviteRequest(source.value))
            return GroupResult(source.number, "joined", True)
        entity = await client.get_entity(source.value)
        if not is_group(entity):
            return GroupResult(source.number, "not_group", False)
        if not join:
            return GroupResult(source.number, "available", True, getattr(entity, "participants_count", None))
        await client(request_types.JoinChannelRequest(entity))
        return GroupResult(source.number, "joined", True)
    except Exception as error:
        if is_auth_error(error):
            raise
        wait = int(getattr(error, "seconds", 0) or 0)
        if wait > 0:
            return GroupResult(source.number, "rate_limited", retry_after_seconds=wait)
        name = type(error).__name__
        if name == "UserAlreadyParticipantError":
            return GroupResult(source.number, "already_joined", True)
        if name in {"InviteHashExpiredError", "InviteHashInvalidError", "UsernameInvalidError", "UsernameNotOccupiedError", "ChannelPrivateError"}:
            return GroupResult(source.number, "unavailable")
        if name in {"InviteRequestSentError", "ChatJoinRequestSentError"}:
            return GroupResult(source.number, "approval_pending", True)
        return GroupResult(source.number, "error")
