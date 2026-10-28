"""Allowlisted WhatsApp chat exports and collector settings."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

import yaml
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
STATE_PATH = os.getenv("WA_STATE_PATH", str(ROOT / ".state" / "whatsapp.json"))
LOCK_PATH = os.getenv("WA_LOCK_PATH", str(ROOT / ".state" / "whatsapp.lock"))
SESSION_PATH = os.getenv("WA_SESSION_PATH", str(ROOT / ".session" / "whatsapp"))
BRIDGE_PATH = ROOT / "whatsapp-bridge" / "bridge.mjs"
BRIDGE_TIMEOUT_S = int(os.getenv("WA_BRIDGE_TIMEOUT_S", "420"))
MAX_MESSAGES_PER_CHAT = int(os.getenv("WA_MAX_MESSAGES_PER_CHAT", "500"))
MAX_MESSAGE_AGE_DAYS = int(os.getenv("WA_MAX_MESSAGE_AGE_DAYS", "90"))
MAX_MEDIA_BYTES = min(64 * 1024 * 1024, max(1, int(os.getenv("WA_MAX_MEDIA_BYTES", str(64 * 1024 * 1024)))))
SESSION_MAX_VERIFICATION_AGE_HOURS = max(
    1, int(os.getenv("WA_SESSION_MAX_VERIFICATION_AGE_HOURS", "24"))
)


@dataclass
class ChatExport:
    """One owner-exported individual or group chat."""

    key: str
    title: str
    path: str
    source_url: str
    category: str = "forum"
    enabled: bool = True
    trusted: bool = False
    date_order: str = "dmy"
    max_messages: int = MAX_MESSAGES_PER_CHAT
    transport: str = "export"
    chat_id: str = ""
    include_media: bool = True
    public_provenance: bool = False

    @property
    def export_path(self) -> Path:
        path = Path(self.path).expanduser()
        return path if path.is_absolute() else (ROOT / path).resolve()


def _public_source_url(value: object, key: str) -> str:
    url = str(value or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(
            f"WhatsApp source {key!r} needs a public http(s) source_url; "
            "do not put a private group invite link here"
        )
    return url


def load_chats(path: str | None = None) -> list[ChatExport]:
    config_path = Path(path) if path else ROOT / "whatsapp-chats.yaml"
    if not config_path.exists():
        return []
    data = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError("WhatsApp source config must be a mapping")
    raw_chats = data.get("chats") or []
    if not isinstance(raw_chats, list):
        raise ValueError("WhatsApp chats must be a list")
    chats: list[ChatExport] = []
    for raw in raw_chats:
        if not isinstance(raw, dict):
            raise ValueError("Each WhatsApp source must be a mapping")
        key = str(raw.get("key", "")).strip()
        if not key:
            continue
        date_order = str(raw.get("date_order", "dmy")).lower()
        if date_order not in {"dmy", "mdy"}:
            raise ValueError(f"WhatsApp source {key!r}: date_order must be dmy or mdy")
        chats.append(
            ChatExport(
                key=key,
                title=str(raw.get("title") or key).strip(),
                path=str(raw.get("path") or "").strip(),
                source_url=_public_source_url(raw.get("source_url"), key),
                category=str(raw.get("category") or "forum").strip(),
                enabled=bool(raw.get("enabled", True)),
                trusted=bool(raw.get("trusted", False)),
                date_order=date_order,
                max_messages=max(1, int(raw.get("max_messages", MAX_MESSAGES_PER_CHAT))),
                transport=str(raw.get("transport") or "export").strip().lower(),
                chat_id=str(raw.get("chat_id") or "").strip(),
                include_media=bool(raw.get("include_media", True)),
                public_provenance=raw.get("public_provenance") is True,
            )
        )
        if chats[-1].transport not in {"linked_device", "export"}:
            raise ValueError(f"WhatsApp source {key!r}: transport must be linked_device or export")
        if chats[-1].transport == "linked_device" and not chats[-1].chat_id:
            raise ValueError(f"WhatsApp source {key!r}: linked_device requires chat_id")
        if chats[-1].transport == "linked_device" and not chats[-1].chat_id.endswith(
            ("@g.us", "@newsletter")
        ):
            raise ValueError(
                f"WhatsApp source {key!r}: linked_device accepts only an explicitly "
                "allowlisted group or channel id"
            )
    return chats


def linked_session_status(
    session_path: str | None = None,
    *,
    now: datetime | None = None,
) -> dict:
    """Return sanitized, freshness-aware linked-session readiness."""
    configured_path = session_path if session_path is not None else os.getenv("WA_SESSION_PATH", "").strip()
    marker_path = Path(configured_path, ".ready.json") if configured_path else None
    if not marker_path or not marker_path.is_file():
        return {"ready": False, "status": "not_verified", "reason": "linked-device session has not completed pairing or probe"}
    try:
        marker = json.loads(marker_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError, TypeError):
        return {"ready": False, "status": "invalid", "reason": "linked-device session marker is invalid"}
    status = str(marker.get("status") or "unknown")
    verified_raw = marker.get("verifiedAt")
    if status != "ready" or not verified_raw:
        return {"ready": False, "status": status, "reason": f"linked-device session status is {status}"}
    try:
        verified_at = datetime.fromisoformat(str(verified_raw).replace("Z", "+00:00"))
        if verified_at.tzinfo is None:
            verified_at = verified_at.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return {"ready": False, "status": "invalid", "reason": "linked-device verification timestamp is invalid"}
    current = now or datetime.now(timezone.utc)
    if current.astimezone(timezone.utc) - verified_at.astimezone(timezone.utc) > timedelta(
        hours=SESSION_MAX_VERIFICATION_AGE_HOURS
    ):
        return {
            "ready": False,
            "status": "stale",
            "verified_at": verified_at.isoformat(),
            "reason": "linked-device session verification is stale; run the read-only probe",
        }
    return {
        "ready": True,
        "status": "ready",
        "verified_at": verified_at.isoformat(),
        "reason": "verified",
    }


def readiness(path: str | None = None) -> dict:
    """Return non-secret linked-device configuration readiness for automation."""
    reasons: list[str] = []
    try:
        enabled = [chat for chat in load_chats(path) if chat.enabled]
    except (OSError, TypeError, ValueError, yaml.YAMLError) as error:
        return {
            "ready": False,
            "enabled_sources": 0,
            "linked_sources": 0,
            "export_sources": 0,
            "reasons": [f"invalid WhatsApp source config ({type(error).__name__})"],
        }

    linked = [chat for chat in enabled if chat.transport == "linked_device"]
    exports = [chat for chat in enabled if chat.transport == "export"]
    if not enabled:
        reasons.append("enable at least one allowlisted WhatsApp source")

    if linked:
        session_path = os.getenv("WA_SESSION_PATH", "").strip()
        session = linked_session_status(session_path)
        if not session["ready"]:
            reasons.append(session["reason"])
        else:
            try:
                marker = json.loads(Path(session_path, ".ready.json").read_text(encoding="utf-8"))
                source_count = marker.get("sourceChatCount")
                if not isinstance(source_count, int) or source_count < 1:
                    reasons.append("linked-device probe found no group or channel sources")
            except (OSError, UnicodeError, ValueError, TypeError):
                reasons.append("linked-device source count is unavailable")
        if any(not Path(chat.path).expanduser().is_absolute() for chat in linked):
            reasons.append("linked-device snapshot paths must be absolute")
        if any(
            chat.key.startswith("example_")
            or chat.chat_id.startswith("000000000000000000")
            or urlparse(chat.source_url).hostname in {"example.kz", "example.com"}
            for chat in linked
        ):
            reasons.append("replace placeholder WhatsApp source before scheduling")

    return {
        "ready": not reasons,
        "enabled_sources": len(enabled),
        "linked_sources": len(linked),
        "export_sources": len(exports),
        "reasons": reasons,
    }
