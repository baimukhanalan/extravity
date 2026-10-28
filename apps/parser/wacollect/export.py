"""Parse WhatsApp's official text chat-export formats.

WhatsApp emits slightly different headers on Android/iOS and by locale. We
support the common bracketed and dash-separated forms and preserve multiline
message bodies. System events are ignored because they have no ``sender:``.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from pathlib import Path

from .config import MAX_MEDIA_BYTES

_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp", "video/mp4"}

_CONTROL = str.maketrans("", "", "\u200e\u200f\u202a\u202b\u202c\u202d\u202e")
_BRACKET = re.compile(
    r"^\[(?P<date>\d{1,4}[./-]\d{1,2}[./-]\d{1,4}),\s*"
    r"(?P<time>\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s*(?P<body>.*)$",
    re.I,
)
_DASH = re.compile(
    r"^(?P<date>\d{1,4}[./-]\d{1,2}[./-]\d{1,4}),\s*"
    r"(?P<time>\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+-\s+(?P<body>.*)$",
    re.I,
)


def _timestamp(date_text: str, time_text: str, date_order: str) -> datetime | None:
    parts = [int(p) for p in re.split(r"[./-]", date_text)]
    if len(parts) != 3:
        return None
    if parts[0] > 31:  # ISO-ish yyyy-mm-dd is unambiguous.
        year, month, day = parts
    elif date_order == "mdy":
        month, day, year = parts
    else:
        day, month, year = parts
    if year < 100:
        year += 2000

    normalized = re.sub(r"\s+", " ", time_text.strip().upper())
    formats = ("%I:%M:%S %p", "%I:%M %p") if normalized.endswith(("AM", "PM")) else ("%H:%M:%S", "%H:%M")
    for fmt in formats:
        try:
            clock = datetime.strptime(normalized, fmt)
            return datetime(year, month, day, clock.hour, clock.minute, clock.second)
        except ValueError:
            continue
    return None


def message_id(chat_key: str, timestamp: datetime, sender: str, text: str) -> str:
    basis = f"wa:{chat_key}:{timestamp.isoformat()}:{sender}:{text}"
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def parse_export_text(text: str, *, chat_key: str, date_order: str = "dmy") -> list[dict]:
    messages: list[dict] = []
    current: dict | None = None

    for raw_line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw_line.translate(_CONTROL)
        match = _BRACKET.match(line) or _DASH.match(line)
        if not match:
            if current is not None:
                current["text"] += "\n" + line
            continue

        stamp = _timestamp(match.group("date"), match.group("time"), date_order)
        body = match.group("body")
        # System events (encryption notices, joins/leaves, title changes) have no
        # sender separator and are not user-authored opportunity announcements.
        sender, separator, first_line = body.partition(": ")
        if stamp is None or not separator or not sender.strip():
            current = None
            continue

        current = {
            "date": stamp,
            "sender": sender.strip(),
            "text": first_line,
        }
        messages.append(current)

    output: list[dict] = []
    for message in messages:
        message["text"] = message["text"].strip()
        if not message["text"]:
            continue
        message["id"] = message_id(
            chat_key, message["date"], message["sender"], message["text"]
        )
        message["date"] = message["date"].isoformat()
        output.append(message)
    return output


def read_export(path: Path, *, chat_key: str, date_order: str = "dmy") -> list[dict]:
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"WhatsApp export not found: {path}")
    return parse_export_text(
        path.read_text(encoding="utf-8-sig"), chat_key=chat_key, date_order=date_order
    )


def read_linked_snapshot(path: Path) -> list[dict]:
    """Read the JSONL snapshot produced by the read-only linked-device bridge."""
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"WhatsApp linked-device snapshot not found: {path}")
    messages: list[dict] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            raw = json.loads(line)
            stamp = datetime.fromisoformat(str(raw["date"]).replace("Z", "+00:00"))
            message_id_value = str(raw["id"]).strip()
            text = str(raw["text"]).strip()
            if not message_id_value or not text:
                continue
            media: list[dict] = []
            source_media = raw.get("media") or []
            for descriptor in source_media:
                media_path = Path(str(descriptor.get("path") or "")).expanduser()
                mime_type = str(descriptor.get("mime_type") or "").lower()
                platform_media_id = str(descriptor.get("platform_media_id") or "").strip()
                if (
                    not media_path.is_absolute()
                    or mime_type not in _MEDIA_TYPES
                    or not platform_media_id
                    or not media_path.is_file()
                    or media_path.stat().st_size <= 0
                    or media_path.stat().st_size > MAX_MEDIA_BYTES
                ):
                    continue
                media.append({
                    "path": str(media_path),
                    "mime_type": mime_type,
                    "platform_media_id": platform_media_id,
                })
            messages.append(
                {
                    "id": message_id_value,
                    "date": stamp.isoformat(),
                    "sender": str(raw.get("sender") or "unknown"),
                    "text": text,
                    "media": media,
                    "media_expected": bool(raw.get("media_expected", False)),
                    **({"media_incomplete": True} if len(media) != len(source_media) else {}),
                }
            )
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise ValueError(f"Invalid linked-device snapshot line {line_number}: {error}") from error
    return messages
