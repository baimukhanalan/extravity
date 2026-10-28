from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Awaitable, Callable

from . import state as state_store
from .client import TelegramAuthRequired, TelegramRetryLater, TelegramUnavailable, build_client, connected_client, fetch_posts, is_auth_error
from .config import MAX_POST_AGE_DAYS, PAUSE_BETWEEN_CHANNELS_S, SESSION_PATH, Channel, load_channels
from .deadline_recheck import PUBLIC_POST_RE, fetch_targets, mark_checked
from .media_repair import process_signed_queue_once
from .media_spool import MediaSpool
from .pipeline import run_channel
from .run_lock import TelegramRunLocked, acquire as acquire_run_lock

log = logging.getLogger("tgcollect.live")

_status: dict[str, object] = {
    "state": "stopped",
    "channels": 0,
    "last_catchup_at": None,
    "last_revision_check_at": None,
    "revisions_refreshed": 0,
    "last_event_at": None,
    "last_error": None,
    "media_repair_state": "disabled",
    "deadline_recheck_at": None,
    "deadline_recheck_scanned": 0,
    "deadline_recheck_refreshed": 0,
}
MAX_BATCHES_PER_CHANNEL_PASS = 5
REVISION_SCAN_POSTS = 12
PREVIOUS_HISTORY_WINDOW_DAYS = 30
MEDIA_REPAIR_INTERVAL_S = 60


class RepairPacer:
    def __init__(self, clock: Callable[[], float]):
        self.clock = clock
        self.next_at = clock() + MEDIA_REPAIR_INTERVAL_S

    async def tick(self, repair: Callable[[], Awaitable[None]]) -> bool:
        if self.clock() < self.next_at:
            return False
        await repair()
        self.next_at = self.clock() + MEDIA_REPAIR_INTERVAL_S
        return True


async def _extend_history_window(client, channel: Channel, state: dict[str, int]) -> None:
    marker = f"__history_window_days__:{channel.username}"
    previous_days = int(state.get(marker, PREVIOUS_HISTORY_WINDOW_DAYS))
    if MAX_POST_AGE_DAYS <= previous_days:
        return
    cursor = state_store.backfill_cursor(state, channel.username)
    if cursor is None:
        state[marker] = MAX_POST_AGE_DAYS
        state_store.save(state)
        return
    if cursor > 0:
        state[marker] = MAX_POST_AGE_DAYS
        state_store.save(state)
        return
    cutoff = datetime.now(timezone.utc) - timedelta(days=previous_days)
    entity = channel.peer or await client.get_entity(channel.username)
    first_older_id = 0
    async for message in client.iter_messages(entity, limit=1, offset_date=cutoff):
        first_older_id = int(message.id)
    if first_older_id > 0:
        state_store.set_backfill_cursor(state, channel.username, first_older_id + 1)
    state[marker] = MAX_POST_AGE_DAYS
    state_store.save(state)


def edited_retry_delay(failures: int) -> int:
    return min(3600, 30 * 2 ** min(max(0, failures - 1), 7))


def status() -> dict[str, object]:
    return dict(_status)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _session_stamp() -> tuple[int, int, int] | None:
    path = Path(SESSION_PATH)
    if path.suffix != ".session":
        path = Path(f"{path}.session")
    try:
        stat = path.stat()
    except FileNotFoundError:
        return None
    return stat.st_ino, stat.st_mtime_ns, stat.st_size


async def _wait_for_session_change() -> None:
    previous = _session_stamp()
    while _session_stamp() == previous:
        await asyncio.sleep(10)


async def _collect_channel(
    client, channel: Channel, state: dict[str, int], include_backfill: bool = True,
    after_batch: Callable[[], Awaitable[None]] | None = None,
) -> bool:
    try:
        for batch in range(MAX_BATCHES_PER_CHANNEL_PASS):
            previous_id = state_store.last_id(state, channel.username)
            result = await run_channel(client, channel, state, dry_run=False)
            state_store.save(state)
            if after_batch is not None:
                await after_batch()
            if not isinstance(result, dict) or result.get("offset_advanced") is False:
                return False
            if int(result.get("scanned", result.get("posts", 0))) < channel.max_posts:
                break
            if state_store.last_id(state, channel.username) <= previous_id:
                break
            if batch < MAX_BATCHES_PER_CHANNEL_PASS - 1:
                await asyncio.sleep(PAUSE_BETWEEN_CHANNELS_S)
        else:
            return True

        if not include_backfill:
            return False

        for batch in range(MAX_BATCHES_PER_CHANNEL_PASS):
            cursor = state_store.backfill_cursor(state, channel.username)
            if not cursor:
                return False
            result = await run_channel(client, channel, state, dry_run=False, before_id=cursor)
            state_store.save(state)
            if after_batch is not None:
                await after_batch()
            if not isinstance(result, dict) or result.get("offset_advanced") is False:
                return False
            next_cursor = state_store.backfill_cursor(state, channel.username)
            if not next_cursor or next_cursor >= cursor:
                return False
            if batch < MAX_BATCHES_PER_CHANNEL_PASS - 1:
                await asyncio.sleep(PAUSE_BETWEEN_CHANNELS_S)
        return True
    except Exception as error:
        if is_auth_error(error) or isinstance(error, TelegramRetryLater) or int(getattr(error, "seconds", 0) or 0) > 0:
            raise
        log.exception("Live channel @%s failed", channel.username)
        _status["last_error"] = f"{channel.username}: {type(error).__name__}"
        state_store.save(state)
        return False


async def _collect_edited_post(client, channel: Channel, state: dict[str, int], post_id: int) -> bool:
    try:
        result = await run_channel(client, channel, state, dry_run=False, edited_post_id=post_id)
        success = isinstance(result, dict) and result.get("offset_advanced") is not False
        if success:
            state_store.save(state)
        return success
    except Exception as error:
        if is_auth_error(error) or isinstance(error, TelegramRetryLater) or int(getattr(error, "seconds", 0) or 0) > 0:
            raise
        log.exception("Edited post in @%s failed", channel.username)
        _status["last_error"] = f"{channel.username}: {type(error).__name__}"
        return False


async def _catch_up(
    client, channels: list[Channel], state: dict[str, int],
    after_batch: Callable[[], Awaitable[None]] | None = None,
) -> set[str]:
    backlog: set[str] = set()
    for index, channel in enumerate(channels):
        if state_store.initialize_legacy_backfill(state, channel.username):
            state_store.save(state)
        try:
            await _extend_history_window(client, channel, state)
        except Exception as error:
            if is_auth_error(error) or isinstance(error, TelegramRetryLater) or int(getattr(error, "seconds", 0) or 0) > 0:
                raise
            log.exception("History expansion failed in @%s", channel.username)
            _status["last_error"] = f"{channel.username}: {type(error).__name__}"
        if await (_collect_channel(client, channel, state, after_batch=after_batch)
                  if after_batch is not None else _collect_channel(client, channel, state)):
            backlog.add(channel.username)
        if index < len(channels) - 1:
            await asyncio.sleep(PAUSE_BETWEEN_CHANNELS_S)
    _status["last_catchup_at"] = _now()
    return backlog


async def _reconcile_recent_edits(client, channels: list[Channel], state: dict[str, int]) -> None:
    refreshed = 0
    for index, channel in enumerate(channels):
        try:
            posts = await fetch_posts(
                client,
                channel,
                since_id=0,
                max_posts=min(REVISION_SCAN_POSTS, channel.max_posts),
                max_age_days=MAX_POST_AGE_DAYS,
            )
            for post in posts:
                if post.get("_skip_reason"):
                    continue
                post_id = int(post["id"])
                if state_store.known_fingerprint(state, channel.username, post_id) == state_store.post_fingerprint(post):
                    continue
                if await _collect_edited_post(client, channel, state, post_id):
                    refreshed += 1
        except Exception as error:
            if is_auth_error(error) or isinstance(error, TelegramRetryLater) or int(getattr(error, "seconds", 0) or 0) > 0:
                raise
            log.exception("Revision check failed in @%s", channel.username)
            _status["last_error"] = f"{channel.username}: {type(error).__name__}"
        if index < len(channels) - 1:
            await asyncio.sleep(PAUSE_BETWEEN_CHANNELS_S)
    _status["last_revision_check_at"] = _now()
    _status["revisions_refreshed"] = int(_status["revisions_refreshed"]) + refreshed


async def _recheck_missing_deadlines(client, channels: list[Channel], state: dict[str, int]) -> None:
    allowed = {channel.username.casefold(): channel for channel in channels if channel.private_id is None}
    scanned = 0
    refreshed = 0
    checked: list[str] = []
    try:
        targets = await asyncio.to_thread(fetch_targets)
        for url in targets:
            match = PUBLIC_POST_RE.fullmatch(url)
            if match is None:
                continue
            channel = allowed.get(match.group(1).casefold())
            if channel is None:
                continue
            try:
                result = await run_channel(
                    client, channel, state, dry_run=False,
                    edited_post_id=int(match.group(2)), replay_only_future_deadline=True,
                )
            except Exception as error:
                if is_auth_error(error) or isinstance(error, TelegramRetryLater) or int(getattr(error, "seconds", 0) or 0) > 0:
                    raise
                log.warning("Deadline recheck failed for @%s: %s", channel.username, type(error).__name__)
                continue
            if result.get("offset_advanced") is False or result.get("media_upload_failed"):
                continue
            scanned += 1
            if result.get("ingest", {}).get("duplicate"):
                refreshed += int(result["ingest"]["duplicate"])
            checked.append(url)
            if url != targets[-1]:
                await asyncio.sleep(PAUSE_BETWEEN_CHANNELS_S)
        if checked:
            await asyncio.to_thread(mark_checked, checked)
    except Exception as error:
        if is_auth_error(error) or isinstance(error, TelegramRetryLater) or int(getattr(error, "seconds", 0) or 0) > 0:
            raise
        log.warning("Deadline recheck batch deferred: %s", type(error).__name__)
        _status["last_error"] = f"deadline_recheck: {type(error).__name__}"
    finally:
        _status["deadline_recheck_at"] = _now()
        _status["deadline_recheck_scanned"] = int(_status["deadline_recheck_scanned"]) + scanned
        _status["deadline_recheck_refreshed"] = int(_status["deadline_recheck_refreshed"]) + refreshed


async def _repair_one_original_media(client, channels: list[Channel]) -> None:
    request_name = os.getenv("TG_MEDIA_REPAIR_REQUEST_PATH", "")
    result_name = os.getenv("TG_MEDIA_REPAIR_RESULT_PATH", "")
    if not request_name and not result_name:
        _status["media_repair_state"] = "disabled"
        return
    if not request_name or not result_name:
        _status["media_repair_state"] = "misconfigured"
        return
    request_path, result_path = Path(request_name), Path(result_name)
    if not request_path.exists():
        _status["media_repair_state"] = "waiting_for_request"
        return
    secret = os.getenv("PARSER_INGEST_SECRET", "")
    if not secret:
        _status["media_repair_state"] = "misconfigured"
        return
    allow_upload = os.getenv("TG_MEDIA_REPAIR_UPLOAD_ENABLED", "").lower() == "true"
    if allow_upload:
        from parser.source_media import backend, storage_readiness
        allow_upload = backend() == "railway_volume" and storage_readiness(secret)["ready"]
    try:
        _status["media_repair_state"] = await process_signed_queue_once(
            client=client, spool=MediaSpool(), request_path=request_path, result_path=result_path,
            secret=secret, allowed_channels={channel.username.casefold() for channel in channels},
            allow_upload=allow_upload,
        )
    except Exception as error:
        if is_auth_error(error) or isinstance(error, TelegramRetryLater) or int(getattr(error, "seconds", 0) or 0) > 0:
            raise
        _status["media_repair_state"] = "error"
        _status["last_error"] = f"media_repair: {type(error).__name__}"
        log.warning("Telegram original-media repair paused: %s", type(error).__name__)


async def _subscribed_channels(client, configured: list[Channel]):
    allowlist = {channel.username.lstrip("@").casefold(): channel for channel in configured if channel.enabled}
    found = {}
    async for dialog in client.iter_dialogs():
        entity = getattr(dialog, "entity", None)
        if not (getattr(entity, "broadcast", False) or getattr(entity, "megagroup", False)):
            continue
        public_name = str(getattr(entity, "username", "") or "").lstrip("@").strip()
        if not public_name:
            continue
        key = public_name.casefold()
        override = allowlist.get(key)
        if override is None:
            continue
        found[key] = (
            Channel(
                username=public_name,
                title=override.title or str(getattr(dialog, "name", "") or ""),
                category=override.category,
                trusted=override.trusted,
                max_posts=override.max_posts,
                peer=entity,
            ),
            entity,
        )
    return [found[key] for key in sorted(found)]


async def _connected() -> None:
    from telethon import events, utils
    from parser.ingest import preflight_ingest_target

    readiness = await asyncio.to_thread(preflight_ingest_target)
    if not readiness["ready"]:
        raise TelegramUnavailable(f"Ingest target is not ready: {readiness['reason']}")

    configured = load_channels()

    try:
        with acquire_run_lock():
            client = build_client()
            async with connected_client(client):
                if not await client.is_user_authorized():
                    raise TelegramAuthRequired("Telegram account session is not authorised")

                subscriptions = await _subscribed_channels(client, configured)
                if not subscriptions:
                    raise TelegramUnavailable("No subscribed allowlisted public channels or groups")
                channels = [channel for channel, _entity in subscriptions]
                by_chat_id = {utils.get_peer_id(entity): channel for channel, entity in subscriptions}
                entities = [entity for _channel, entity in subscriptions]

                pending: set[str] = set()
                pending_edits: dict[str, set[int]] = {}
                edit_retry_at: dict[tuple[str, int], float] = {}
                edit_failures: dict[tuple[str, int], int] = {}
                wake = asyncio.Event()

                async def on_message(event) -> None:
                    channel = by_chat_id.get(event.chat_id)
                    if channel is None:
                        return
                    pending.add(channel.username)
                    _status["last_event_at"] = _now()
                    wake.set()

                async def on_edit(event) -> None:
                    channel = by_chat_id.get(event.chat_id)
                    post_id = int(getattr(event.message, "id", 0) or 0)
                    if channel is None or post_id <= 0:
                        return
                    pending_edits.setdefault(channel.username, set()).add(post_id)
                    _status["last_event_at"] = _now()
                    wake.set()

                client.add_event_handler(on_message, events.NewMessage(chats=entities))
                client.add_event_handler(on_edit, events.MessageEdited(chats=entities))
                await client.catch_up()
                state = state_store.load()
                _status.update(state="catching_up", channels=len(entities), last_error=None)
                repair_pacer = RepairPacer(asyncio.get_running_loop().time)

                async def repair_if_due() -> None:
                    await repair_pacer.tick(lambda: _repair_one_original_media(client, channels))

                pending.update(await _catch_up(client, channels, state, after_batch=repair_if_due))
                await _reconcile_recent_edits(client, channels, state)
                await _recheck_missing_deadlines(client, channels, state)
                if pending:
                    wake.set()
                _status["state"] = "connected"
                next_catchup = asyncio.get_running_loop().time() + 600

                while True:
                    if not client.is_connected():
                        raise TelegramUnavailable("Telegram connection lost")
                    timeout = min(30, max(0, next_catchup - asyncio.get_running_loop().time()))
                    try:
                        await asyncio.wait_for(wake.wait(), timeout=timeout)
                    except asyncio.TimeoutError:
                        pass

                    if pending or pending_edits:
                        await asyncio.sleep(5)
                        ready = set(pending)
                        pending.clear()
                        edits = {username: set(post_ids) for username, post_ids in pending_edits.items()}
                        pending_edits.clear()
                        wake.clear()
                        channels_by_name = {channel.username: channel for channel in channels}
                        for username in ready:
                            channel = channels_by_name.get(username)
                            if channel is None:
                                continue
                            if await _collect_channel(client, channel, state, include_backfill=False,
                                                      after_batch=repair_if_due):
                                pending.add(username)
                        for username, post_ids in edits.items():
                            channel = channels_by_name.get(username)
                            if channel is None:
                                continue
                            for post_id in sorted(post_ids):
                                key = (username, post_id)
                                if asyncio.get_running_loop().time() < edit_retry_at.get(key, 0):
                                    pending_edits.setdefault(username, set()).add(post_id)
                                    continue
                                if not await _collect_edited_post(client, channel, state, post_id):
                                    pending_edits.setdefault(username, set()).add(post_id)
                                    failures = edit_failures.get(key, 0) + 1
                                    edit_failures[key] = failures
                                    edit_retry_at[key] = asyncio.get_running_loop().time() + edited_retry_delay(failures)
                                else:
                                    edit_failures.pop(key, None)
                                    edit_retry_at.pop(key, None)
                        if pending:
                            wake.set()

                    await repair_if_due()

                    if asyncio.get_running_loop().time() >= next_catchup:
                        try:
                            refreshed = await _subscribed_channels(client, configured)
                            refreshed_ids = {utils.get_peer_id(entity): channel for channel, entity in refreshed}
                            if refreshed_ids != by_chat_id:
                                client.remove_event_handler(on_message)
                                client.remove_event_handler(on_edit)
                                by_chat_id = refreshed_ids
                                channels = [channel for channel, _entity in refreshed]
                                entities = [entity for _channel, entity in refreshed]
                                if entities:
                                    client.add_event_handler(on_message, events.NewMessage(chats=entities))
                                    client.add_event_handler(on_edit, events.MessageEdited(chats=entities))
                                _status["channels"] = len(entities)
                        except Exception as error:
                            if is_auth_error(error) or int(getattr(error, "seconds", 0) or 0) > 0:
                                raise
                            log.warning("Channel refresh failed: %s", type(error).__name__)
                        pending.update(await _catch_up(client, channels, state, after_batch=repair_if_due))
                        await _reconcile_recent_edits(client, channels, state)
                        await _recheck_missing_deadlines(client, channels, state)
                        if pending:
                            wake.set()
                        next_catchup = asyncio.get_running_loop().time() + 600
    except TelegramRunLocked as error:
        raise TelegramUnavailable(str(error)) from error


async def run_forever() -> None:
    try:
        while True:
            try:
                _status["state"] = "connecting"
                await _connected()
            except asyncio.CancelledError:
                raise
            except Exception as error:
                if is_auth_error(error):
                    _status.update(state="auth_required", last_error=type(error).__name__)
                    log.error("Telegram session requires reauthorisation; waiting for a new session")
                    await _wait_for_session_change()
                    continue
                _status.update(state="retrying", last_error=type(error).__name__)
                log.exception("Telegram live connection failed; retrying")
                await asyncio.sleep(max(10, int(getattr(error, "seconds", 0) or 0) + 1))
    finally:
        if _status["state"] != "auth_required":
            _status["state"] = "stopped"
