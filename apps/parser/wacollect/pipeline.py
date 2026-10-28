"""Allowlisted WhatsApp export -> local extract -> shared moderation ingest."""
from __future__ import annotations

import hashlib
import logging
import re
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from parser.ingest import post_candidates, post_media
from tgcollect.extract import KZ_TZ, baseline, reference_date

from . import state as state_store
from .config import BRIDGE_PATH, BRIDGE_TIMEOUT_S, MAX_MESSAGE_AGE_DAYS, ChatExport, load_chats
from .export import read_export, read_linked_snapshot
from .run_lock import WhatsAppRunLocked, acquire as acquire_run_lock

log = logging.getLogger("wacollect.pipeline")


class WhatsAppUnavailable(RuntimeError):
    """Configuration, export or lock prevents a run."""


def bridge_command(action: str, chats_path: str | None = None, *, interactive: bool = False) -> None:
    """Run the isolated Node linked-device bridge without exposing credentials."""
    command = ["node", str(BRIDGE_PATH), action]
    if chats_path:
        command.extend(["--config", str(chats_path)])
    try:
        completed = subprocess.run(
            command,
            check=False,
            text=True,
            capture_output=not interactive,
            timeout=None if interactive else BRIDGE_TIMEOUT_S,
        )
    except FileNotFoundError as error:
        raise WhatsAppUnavailable("Node.js is required for WhatsApp linked-device mode") from error
    except subprocess.TimeoutExpired as error:
        raise WhatsAppUnavailable(
            f"WhatsApp linked-device sync timed out after {BRIDGE_TIMEOUT_S}s"
        ) from error
    if completed.returncode != 0:
        detail = "" if interactive else (completed.stderr or completed.stdout or "").strip()
        raise WhatsAppUnavailable(detail or f"WhatsApp bridge exited with {completed.returncode}")
    if not interactive and completed.stdout:
        log.info("WhatsApp bridge: %s", completed.stdout.strip().replace("\n", "; "))


def _message_url(source_url: str, message_id: str) -> str:
    """Stable unique provenance URL without exposing a private invite link."""
    parts = urlsplit(source_url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["wa_message"] = message_id[:16]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _content_hash(chat_key: str, message: dict) -> str:
    basis = f"wa:{chat_key}:{message['id']}:{message['text'][:500]}"
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def _connector_type(chat: ChatExport) -> str:
    if not chat.public_provenance or chat.transport != "linked_device" or not chat.chat_id.endswith("@newsletter"):
        return "whatsapp_private_group"
    parsed = urlsplit(chat.source_url)
    try:
        port = parsed.port
    except ValueError:
        return "whatsapp_private_group"
    if (parsed.scheme == "https" and parsed.hostname in {"whatsapp.com", "www.whatsapp.com"}
            and not parsed.username and not parsed.password and port in (None, 443)
            and not parsed.query and not parsed.fragment
            and re.fullmatch(r"/channel/[A-Za-z0-9_-]+/?", parsed.path)):
        return "whatsapp_public_channel"
    return "whatsapp_private_group"


def messages_to_candidates(messages: list[dict], chat: ChatExport) -> tuple[list[dict], dict]:
    stats = {"messages": len(messages), "not_opportunity": 0, "candidates": 0}
    candidates: list[dict] = []
    for message in messages:
        item = baseline(
            text=message["text"],
            post_url=_message_url(chat.source_url, message["id"]),
            channel_title=chat.title,
            default_category=chat.category,
            today=reference_date(message.get("date")),
            as_of=datetime.now(KZ_TZ),
        )
        if item is None:
            stats["not_opportunity"] += 1
            continue
        item["contentHash"] = _content_hash(chat.key, message)
        item["_whatsappMedia"] = message.get("media") or []
        item["_whatsappMediaExpected"] = bool(message.get("media_expected", False))
        item["_whatsappMediaIncomplete"] = bool(message.get("media_incomplete", False))
        candidates.append(item)
    stats["candidates"] = len(candidates)
    return candidates, stats


def run_chat(chat: ChatExport, state: dict[str, list[str]], dry_run: bool) -> dict:
    messages = (
        read_linked_snapshot(chat.export_path)
        if chat.transport == "linked_device"
        else read_export(chat.export_path, chat_key=chat.key, date_order=chat.date_order)
    )
    now = datetime.now().astimezone()
    cutoff = now - timedelta(days=MAX_MESSAGE_AGE_DAYS)
    recent = []
    for message in messages:
        stamp = datetime.fromisoformat(message["date"])
        if stamp.tzinfo is None:
            stamp = stamp.astimezone()
        if stamp >= cutoff:
            recent.append(message)
    new_messages = state_store.unseen(state, chat.key, recent)[-chat.max_messages :]
    candidates, stats = messages_to_candidates(new_messages, chat)
    result: dict = {"chat": chat.key, **stats}

    if dry_run:
        result["dry_run"] = True
        result["preview"] = [
            {
                **{
                    key: value for key, value in candidate.items()
                    if key not in {"_whatsappMedia", "_whatsappMediaExpected", "_whatsappMediaIncomplete"}
                },
                "mediaCount": len(candidate.get("_whatsappMedia") or []),
            }
            for candidate in candidates[:5]
        ]
        return result

    if _connector_type(chat) != "whatsapp_public_channel":
        result["source_held"] = "public_channel_provenance_unverified"
        result["offset_advanced"] = False
        return result

    ingest_ok = True
    ready_candidates: list[dict] = []
    media_failed = 0
    for candidate in candidates:
        descriptors = candidate.pop("_whatsappMedia", [])
        media_expected = candidate.pop("_whatsappMediaExpected", False)
        media_incomplete = candidate.pop("_whatsappMediaIncomplete", False)
        candidate["media"] = []
        candidate_hash = candidate["contentHash"]
        upload_ok = not media_incomplete and bool(descriptors) and len(descriptors) <= 10
        if not upload_ok:
            media_failed += 1
            continue
        for position, descriptor in enumerate(descriptors):
            try:
                content = Path(descriptor["path"]).read_bytes()
                candidate["media"].append(post_media(
                    f"whatsapp-{chat.key}",
                    candidate_hash,
                    descriptor["platform_media_id"],
                    position,
                    content,
                    descriptor["mime_type"],
                ))
            except Exception as error:  # noqa: BLE001 -- media must not suppress the activity
                log.warning("WhatsApp media skipped for %s: %s", candidate_hash, error)
                upload_ok = False
        if media_expected and not candidate["media"]:
            upload_ok = False
        if upload_ok:
            ready_candidates.append(candidate)
        else:
            media_failed += 1
    if media_failed:
        result["media_failed"] = media_failed
        ingest_ok = False
    if ready_candidates:
        ingested = post_candidates(
            source_name=f"WhatsApp: {chat.title}",
            source_type=_connector_type(chat),
            source_url=chat.source_url,
            items=ready_candidates,
        )
        result["ingest"] = ingested
        ingest_ok = ingest_ok and int(ingested.get("failed", 0) or 0) == 0

    if ingest_ok:
        state_store.mark_seen(state, chat.key, new_messages)
    else:
        result["offset_advanced"] = False
        log.error("Partial WhatsApp ingest failure — fingerprints kept for safe retry")
    return result


def run_all(
    only: str | None = None,
    dry_run: bool = False,
    chats_path: str | None = None,
    sync_linked: bool = True,
) -> list[dict]:
    chats = [chat for chat in load_chats(chats_path) if chat.enabled]
    if only:
        chats = [chat for chat in chats if chat.key == only]
    if not chats:
        if only:
            raise WhatsAppUnavailable(f"WhatsApp source {only!r} is not enabled in the allowlist")
        log.warning("No enabled chats in whatsapp-chats.yaml")
        return []

    results: list[dict] = []
    try:
        with acquire_run_lock():
            if sync_linked and any(chat.transport == "linked_device" for chat in chats):
                bridge_command("collect", chats_path)
            state = state_store.load()
            for chat in chats:
                try:
                    results.append(run_chat(chat, state, dry_run))
                except (FileNotFoundError, UnicodeError, ValueError) as error:
                    log.error("WhatsApp chat %s skipped: %s", chat.key, error)
                    results.append({"chat": chat.key, "error": str(error)})
                except Exception as error:  # noqa: BLE001 -- isolate one source
                    log.exception("WhatsApp chat %s failed: %s", chat.key, error)
                    results.append({"chat": chat.key, "error": str(error)})
            if not dry_run:
                state_store.save(state)
    except WhatsAppRunLocked as error:
        raise WhatsAppUnavailable(str(error)) from error
    return results
