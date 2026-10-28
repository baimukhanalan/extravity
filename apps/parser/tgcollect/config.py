"""Channel list and MTProto credentials."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import yaml
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent

# From https://my.telegram.org → API development tools. These identify the
# *application*, not the account; the account is authorised interactively once.
API_ID = int(os.getenv("TG_API_ID", "0") or 0)
API_HASH = os.getenv("TG_API_HASH", "")

# Telethon stores the authorised session here. Treat it like a password:
# anyone holding this file can act as the account. It is gitignored.
SESSION_PATH = os.getenv("TG_SESSION_PATH", str(ROOT / ".session" / "eckz"))
SESSION_STRING = os.getenv("TG_SESSION_STRING", "").strip()
STATE_PATH = os.getenv("TG_STATE_PATH", str(ROOT / ".state" / "telegram.json"))
STATE_URL = os.getenv("TG_STATE_URL", "").strip()
LOCK_PATH = os.getenv("TG_LOCK_PATH", str(ROOT / ".state" / "telegram.lock"))
PAIRING_QR_PATH = os.getenv("TG_QR_PATH", str(ROOT / ".state" / "telegram-pairing-qr.png"))

# Politeness. Telegram's own limits are enforced server-side via FloodWait;
# these keep us comfortably below them instead of probing for the ceiling.
PAUSE_BETWEEN_CHANNELS_S = float(os.getenv("TG_PAUSE_BETWEEN_CHANNELS_S", "3"))
MAX_POSTS_PER_CHANNEL = int(os.getenv("TG_MAX_POSTS_PER_CHANNEL", "50"))
MAX_POST_AGE_DAYS = int(os.getenv("TG_MAX_POST_AGE_DAYS", "365"))
MAX_INLINE_FLOOD_WAIT_S = int(os.getenv("TG_MAX_INLINE_FLOOD_WAIT_S", "300"))


@dataclass
class Channel:
    """An explicitly allowlisted public Telegram channel or group to read."""

    username: str
    title: str = ""
    category: str = "forum"
    enabled: bool = True
    trusted: bool = False  # only affects how the moderator sees it, never auto-publish
    max_posts: int = MAX_POSTS_PER_CHANNEL
    private_id: int | None = None
    peer: object | None = None

    @property
    def display(self) -> str:
        return self.title or (f"@{self.username}" if self.private_id is None else "Telegram channel")

    @property
    def source_url(self) -> str:
        if self.private_id is not None:
            return f"https://t.me/c/{self.private_id}"
        return f"https://t.me/{self.username}"

    def post_url(self, post_id: int) -> str:
        return f"{self.source_url}/{post_id}"


def load_channels(path: str | None = None) -> list[Channel]:
    p = Path(path) if path else ROOT / "channels.yaml"
    if not p.exists():
        return []
    data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    out: list[Channel] = []
    for raw in data.get("channels", []):
        username = str(raw["username"]).lstrip("@").strip()
        if not username:
            continue
        out.append(
            Channel(
                username=username,
                title=raw.get("title", ""),
                category=raw.get("category", "forum"),
                enabled=bool(raw.get("enabled", True)),
                trusted=bool(raw.get("trusted", False)),
                max_posts=int(raw.get("max_posts", MAX_POSTS_PER_CHANNEL)),
            )
        )
    return out


def credentials_ready() -> bool:
    return bool(API_ID and API_HASH)
