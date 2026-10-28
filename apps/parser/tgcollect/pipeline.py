"""Collect → extract → ingest, one channel at a time.

The whole point of routing through `parser.ingest.post_candidates` is that
Telegram posts get exactly the same treatment as anything the HTML/RSS parser
finds: validation, deduplication, trust scoring, and a stop in the moderation
queue. There is no path from a channel straight into the catalog.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

from parser.ingest import post_candidates, post_media

from . import state as state_store
from .client import TelegramRetryLater, TelegramUnavailable, build_client, connected_client, download_media_preview, fetch_edited_post, fetch_posts, resolve_title
from .config import (
    MAX_POST_AGE_DAYS,
    PAUSE_BETWEEN_CHANNELS_S,
    Channel,
    load_channels,
)
from .extract import KZ_TZ, baseline, classify_kazakhstan_availability, content_hash, reference_date
from .media_circuit import MediaCircuitOpen, MediaUploadCircuit
from .media_spool import MediaSpool, replay_complete
from .price_enrichment import enrich_candidate_price, official_hosts_from_env
from .run_lock import TelegramRunLocked, acquire as acquire_run_lock

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("tgcollect.pipeline")


def posts_to_candidates(
    posts: list[dict],
    channel: Channel,
    channel_title: str,
) -> tuple[list[dict], dict]:
    """Returns (candidates, stats). Stats explain what was dropped and why."""
    stats = {"posts": len(posts), "too_old": 0, "not_opportunity": 0, "adult_audience": 0,
             "unavailable_to_kazakhstan": 0, "geography_restricted": 0, "candidates": 0}
    candidates: list[dict] = []

    for post in posts:
        if post.get("_skip_reason") == "too_old":
            stats["too_old"] += 1
            continue
        availability, availability_evidence = classify_kazakhstan_availability(post["text"])
        descriptors = post.get("media", [])
        item = baseline(
            text=post["text"],
            post_url=post["url"],
            channel_title=channel_title,
            default_category=channel.category,
            today=reference_date(post.get("date")),
            as_of=datetime.now(KZ_TZ),
            has_source_media=bool(descriptors),
        )
        if item is None:
            stats["not_opportunity"] += 1
            continue
        if post.get("date"):
            item["sourcePublishedAt"] = post["date"]
        if post.get("edit_date"):
            item["sourceEditedAt"] = post["edit_date"]
        if item["audienceStatus"] == "NON_SCHOOL":
            stats["adult_audience"] += 1
        if availability == "UNAVAILABLE":
            stats["geography_restricted"] += 1
            item["tags"] = [*item.get("tags", []), "география ограничена"]
            if availability_evidence:
                item["requirements"] = [
                    *item.get("requirements", []),
                    f"География участия: {availability_evidence}",
                ]

        # Content hash keys dedup on the app side.
        media_identity = ":".join(str(media.get("platform_media_id", "")) for media in descriptors)
        item["contentHash"] = content_hash(channel.username, post["id"], f"{post['text']}:{media_identity}")
        item["_telegramMedia"] = descriptors
        candidates.append(item)

    stats["candidates"] = len(candidates)
    return candidates, stats


async def run_channel(
    client,
    channel: Channel,
    state: dict[str, int],
    dry_run: bool,
    before_id: int | None = None,
    edited_post_id: int | None = None,
    replay_only_future_deadline: bool = False,
) -> dict:
    if replay_only_future_deadline and (edited_post_id is None or before_id is not None or channel.private_id is not None):
        raise ValueError("Deadline replay requires one public post id")
    since = state_store.last_id(state, channel.username)
    log.info("Channel @%s (since post id %s, before post id %s)", channel.username, since or "beginning", before_id or "none")

    spool = MediaSpool()
    circuit = MediaUploadCircuit(spool.root)
    replay = {"pending": 0, "incomplete": 0, "ingested": 0, "failed": 0}
    if not dry_run and channel.private_id is None and not replay_only_future_deadline:
        try:
            circuit.check()
        except MediaCircuitOpen as error:
            log.warning("  media upload paused: %s", error)
            return {"channel": channel.username, "posts": 0, "candidates": 0,
                    "media_circuit_open": True, "media_retry_after_s": error.remaining_seconds,
                    "offset_advanced": False}
        upload_media = lambda *args: circuit.call(post_media, *args)
        replay = await asyncio.to_thread(replay_complete, spool, upload_media, post_candidates, channel.username)
        if replay["failed"]:
            log.warning("  %d staged candidates remain after media replay", replay["failed"])
            result = {"channel": channel.username, "posts": 0, "candidates": 0,
                      "media_replay_failed": replay["failed"], "offset_advanced": False}
            try:
                circuit.check()
            except MediaCircuitOpen as error:
                result["media_circuit_open"] = True
                result["media_retry_after_s"] = error.remaining_seconds
            return result

    title = await resolve_title(client, channel)
    if edited_post_id is not None:
        posts = await fetch_edited_post(client, channel, edited_post_id, MAX_POST_AGE_DAYS)
    else:
        fetch_options = {"before_id": before_id} if before_id is not None else {}
        posts = await fetch_posts(client, channel, since_id=since, max_posts=channel.max_posts, max_age_days=MAX_POST_AGE_DAYS, **fetch_options)
    scanned_count = int(getattr(posts, "scanned_count", len(posts)))
    last_seen_id = int(getattr(posts, "last_seen_id", posts[-1]["id"] if posts else since))
    oldest_seen_id = int(getattr(posts, "oldest_seen_id", min((int(post["id"]) for post in posts), default=0)))
    if not posts:
        if replay["incomplete"]:
            return {"channel": channel.username, "posts": 0, "candidates": 0,
                    "media_replay_incomplete": replay["incomplete"], "offset_advanced": False}
        if not dry_run and edited_post_id is None:
            if before_id is not None or since == 0:
                state_store.set_backfill_cursor(state, channel.username, 0)
            if before_id is None:
                state_store.set_last_id(state, channel.username, last_seen_id)
        log.info("  no new posts")
        return {"channel": channel.username, "posts": 0, "scanned": scanned_count, "candidates": 0, "backfill": before_id is not None, "edited": edited_post_id is not None}

    candidates, stats = posts_to_candidates(posts, channel, title)
    if replay_only_future_deadline:
        now = datetime.now(KZ_TZ)
        candidates = [candidate for candidate in candidates if (
            candidate.get("sourceUrl") == channel.post_url(edited_post_id)
            and candidate.get("applicationDeadline")
            and datetime.fromisoformat(candidate["applicationDeadline"]).astimezone(KZ_TZ) > now
            and not candidate.get("_expired")
        )]
        stats["candidates"] = len(candidates)
        for candidate in candidates:
            candidate["refreshExistingPendingOnly"] = True
    if channel.private_id is None and not replay_only_future_deadline and os.getenv("TG_PRICE_ENRICH_ENABLED", "").lower() == "true":
        official_hosts = official_hosts_from_env()
        source_texts = {post["url"]: post["text"] for post in posts}
        remaining = 2
        for candidate in candidates:
            if remaining <= 0:
                break
            if "price" in candidate or candidate.get("_expired"):
                continue
            source_text = source_texts.get(candidate["sourceUrl"], "")
            if source_text and official_hosts:
                await asyncio.to_thread(enrich_candidate_price, candidate, source_text, official_hosts)
                remaining -= 1
    log.info(
        "  %d posts -> %d candidates (skipped: %d non-opportunity)",
        stats["posts"], stats["candidates"], stats["not_opportunity"],
    )

    result: dict = {"channel": channel.username, "scanned": scanned_count, "backfill": before_id is not None, "edited": edited_post_id is not None, **stats}
    if replay_only_future_deadline:
        result["deadline_replay"] = True
        result["eligible"] = bool(candidates)

    if dry_run:
        result["dry_run"] = True
        result["preview"] = candidates[:5]
        return result

    ready_candidates: list[dict] = []
    staged_keys: list[str] = []
    media_upload_failed = 0
    private_media_held = 0
    for candidate in candidates:
        descriptors = candidate.pop("_telegramMedia", [])
        expired = candidate.pop("_expired", False)
        candidate["media"] = []
        if replay_only_future_deadline:
            ready_candidates.append(candidate)
            continue
        if expired:
            ready_candidates.append(candidate)
            continue
        if channel.private_id is not None:
            private_media_held += len(descriptors)
            ready_candidates.append(candidate)
            continue
        if len(descriptors) > 10:
            media_upload_failed += 1
            log.warning("  candidate held: source media group exceeds ten items")
            continue
        upload_failed = False
        source_post_id = int(candidate["sourceUrl"].rsplit("/", 1)[-1])
        staged_content: list[tuple[str, int, bytes, str]] = []
        key = spool.key_for(channel.username, source_post_id)
        try:
            existing = spool.load(key)
            if existing.candidate.get("contentHash") == candidate.get("contentHash"):
                staged_content = [(m.platform_media_id, m.position, m.content, m.mime_type) for m in existing.media]
        except FileNotFoundError:
            pass
        except (OSError, ValueError, KeyError) as error:
            log.warning("  staged media unavailable: %s", type(error).__name__)
            upload_failed = True
        existing_positions = {position for _, position, _, _ in staged_content}
        for position, descriptor in enumerate(descriptors[:10]):
            if position in existing_positions:
                continue
            downloaded = await download_media_preview(client, channel, descriptor)
            if downloaded is None:
                upload_failed = True
                log.warning("  source media unavailable: %s", descriptor.get("kind", "unknown"))
                continue
            content, mime_type = downloaded
            staged_content.append((str(descriptor["platform_media_id"]), position, content, mime_type))
        try:
            if descriptors:
                spool.stage(channel=channel.username, post_id=source_post_id, candidate=candidate,
                            media=staged_content, expected_media_count=min(len(descriptors), 10))
        except (OSError, ValueError, TypeError) as error:
            log.warning("  media staging failed: %s", type(error).__name__)
            upload_failed = True
        if len(staged_content) != min(len(descriptors), 10):
            upload_failed = True
        if upload_failed:
            media_upload_failed += 1
            continue
        for platform_media_id, position, content, mime_type in sorted(staged_content, key=lambda item: item[1]):
            try:
                uploaded = await asyncio.to_thread(
                    circuit.call,
                    post_media,
                    channel.username,
                    source_post_id,
                    platform_media_id,
                    position,
                    content,
                    mime_type,
                )
                candidate["media"].append(uploaded)
            except Exception as error:
                log.warning("  media upload failed: %s", type(error).__name__)
                upload_failed = True

        if upload_failed:
            media_upload_failed += 1
        else:
            ready_candidates.append(candidate)
            if descriptors:
                staged_keys.append(key)

    ingest_ok = media_upload_failed == 0
    if media_upload_failed:
        result["media_upload_failed"] = media_upload_failed
        try:
            circuit.check()
        except MediaCircuitOpen as error:
            result["media_circuit_open"] = True
            result["media_retry_after_s"] = error.remaining_seconds
    if private_media_held:
        result["private_media_held"] = private_media_held
    if ready_candidates:
        ingested = post_candidates(
            source_name=f"Telegram: {title}",
            source_type="telegram",
            source_url=channel.source_url,
            items=ready_candidates,
        )
        log.info(
            "  ingest: outcome=%s created=%s duplicate=%s failed=%s quarantined=%s",
            ingested.get("outcome"), ingested.get("created"), ingested.get("duplicate"),
            ingested.get("failed"), ingested.get("quarantined"),
        )
        result["ingest"] = ingested
        ingest_ok = ingest_ok and int(ingested.get("failed", 0) or 0) == 0
        if int(ingested.get("failed", 0) or 0) == 0:
            for key in staged_keys:
                if key in spool.pending_keys():
                    spool.acknowledge(key)

    if channel.private_id is None and replay["incomplete"] and spool.pending_for(channel.username):
        ingest_ok = False
        result["media_replay_incomplete"] = len(spool.pending_for(channel.username))

    if ingest_ok:
        state_store.remember_posts(state, channel.username, posts)

    if ingest_ok and edited_post_id is not None:
        return result
    if ingest_ok:
        has_older_recent_posts = scanned_count >= channel.max_posts and stats["too_old"] == 0
        if before_id is not None:
            if has_older_recent_posts and oldest_seen_id >= before_id:
                result["offset_advanced"] = False
                return result
            state_store.set_backfill_cursor(state, channel.username, oldest_seen_id if has_older_recent_posts else 0)
        else:
            state_store.set_last_id(state, channel.username, last_seen_id)
            if since == 0:
                state_store.set_backfill_cursor(state, channel.username, oldest_seen_id if has_older_recent_posts else 0)
    else:
        result["offset_advanced"] = False
        log.error("  partial ingest failure — offset kept for safe retry")
    return result


async def run_all(
    only: str | None = None,
    dry_run: bool = False,
    channels_path: str | None = None,
    subscribed: bool = False,
    max_batches_per_channel: int = 30,
) -> list[dict]:
    channels = [c for c in load_channels(channels_path) if c.enabled]
    if not subscribed and only:
        channels = [c for c in channels if c.username.lstrip("@") == only.lstrip("@")]
    if not subscribed and not channels:
        log.warning("No enabled channels in channels.yaml")
        return []

    state = state_store.load()
    results: list[dict] = []

    try:
        with acquire_run_lock():
            client = build_client()
            async with connected_client(client):
                if not await client.is_user_authorized():
                    raise TelegramUnavailable(
                        "Account not authorised. Run `python run_telegram.py --login` once, "
                        "in your own terminal — the code is sent to your Telegram."
                    )

                if subscribed:
                    from .live import _subscribed_channels

                    channels = [channel for channel, _entity in await _subscribed_channels(client, load_channels(channels_path))
                                if channel.private_id is None]
                    if only:
                        channels = [channel for channel in channels if channel.username.casefold() == only.lstrip("@").casefold()]
                    if not channels:
                        log.warning("No subscribed public broadcast channels matched")
                        return []

                for index, channel in enumerate(channels):
                    try:
                        if subscribed and not dry_run:
                            results.extend(await collect_channel_backlog(
                                client, channel, state, max_batches_per_channel=max_batches_per_channel,
                            ))
                        else:
                            results.append(await run_channel(client, channel, state, dry_run))
                    except TelegramRetryLater as e:
                        retry_at = datetime.now(timezone.utc) + timedelta(seconds=e.seconds)
                        log.warning("  deferred until %s: %s", retry_at.isoformat(), e)
                        results.append({
                            "channel": channel.username,
                            "error": str(e),
                            "retry_after_s": e.seconds,
                            "next_retry_at": retry_at.isoformat(),
                        })
                    except TelegramUnavailable as e:
                        log.error("  skipped: %s", e)
                        results.append({"channel": channel.username, "error": str(e)})
                    except Exception as e:  # noqa: BLE001 — one bad channel must not stop the run
                        log.exception("  failed: %s", e)
                        results.append({"channel": channel.username, "error": str(e)})

                    if not dry_run:
                        state_store.save(state)

                    if index < len(channels) - 1:
                        await asyncio.sleep(PAUSE_BETWEEN_CHANNELS_S)
    except TelegramRunLocked as e:
        raise TelegramUnavailable(str(e)) from e

    return results


async def collect_channel_backlog(
    client,
    channel: Channel,
    state: dict[str, int],
    *,
    max_batches_per_channel: int,
) -> list[dict]:
    budget = max(1, min(100, max_batches_per_channel))
    results: list[dict] = []
    if state_store.initialize_legacy_backfill(state, channel.username):
        state_store.save(state)
    for _ in range(budget):
        previous_id = state_store.last_id(state, channel.username)
        result = await run_channel(client, channel, state, dry_run=False)
        state_store.save(state)
        results.append(result)
        if result.get("offset_advanced") is False:
            return results
        if int(result.get("scanned", result.get("posts", 0))) < channel.max_posts:
            break
        if state_store.last_id(state, channel.username) <= previous_id:
            break
        if len(results) < budget:
            await asyncio.sleep(PAUSE_BETWEEN_CHANNELS_S)
    while len(results) < budget:
        cursor = state_store.backfill_cursor(state, channel.username)
        if not cursor:
            break
        result = await run_channel(client, channel, state, dry_run=False, before_id=cursor)
        state_store.save(state)
        results.append(result)
        if result.get("offset_advanced") is False:
            break
        next_cursor = state_store.backfill_cursor(state, channel.username)
        if not next_cursor or next_cursor >= cursor:
            break
        if len(results) < budget:
            await asyncio.sleep(PAUSE_BETWEEN_CHANNELS_S)
    if len(results) >= budget and results[-1].get("offset_advanced") is not False:
        results[-1]["catch_up_may_remain"] = True
    return results


def _selected_public_post_ids(channel: Channel, source_urls: list[str], max_posts: int) -> list[int]:
    if channel.private_id is not None or not channel.enabled:
        raise ValueError("Deadline replay requires one enabled public channel")
    if not 1 <= max_posts <= 25 or not 1 <= len(source_urls) <= max_posts:
        raise ValueError("Select between one and 25 public posts within the stated limit")
    ids: list[int] = []
    seen: set[int] = set()
    for source_url in source_urls:
        parsed = urlsplit(source_url)
        match = re.fullmatch(r"/([^/]+)/([1-9]\d*)", parsed.path)
        if (parsed.scheme != "https" or parsed.hostname not in {"t.me", "telegram.me"}
                or parsed.port is not None or parsed.username is not None or parsed.password is not None
                or parsed.query or parsed.fragment or not match
                or match.group(1).casefold() != channel.username.lstrip("@").casefold()):
            raise ValueError("Every replay target must be an exact public post URL in the selected channel")
        post_id = int(match.group(2))
        if post_id in seen:
            raise ValueError("Replay targets must not repeat a post")
        ids.append(post_id)
        seen.add(post_id)
    return ids


async def replay_selected_posts(
    client,
    channel: Channel,
    source_urls: list[str],
    *,
    dry_run: bool = True,
    max_posts: int = 25,
) -> list[dict]:
    """Recheck explicit public posts without touching live or backfill cursors.

    The app-side ingest contract must accept refreshExistingPendingOnly and refuse
    creation or changes to approved rows. Do not enable writes before that contract
    is deployed and tested.
    """
    ids = _selected_public_post_ids(channel, source_urls, max_posts)
    if not dry_run:
        require_ingest_target()
    results: list[dict] = []
    for post_id in ids:
        result = await run_channel(
            client, channel, {}, dry_run=dry_run,
            edited_post_id=post_id, replay_only_future_deadline=True,
        )
        results.append(result)
        if result.get("offset_advanced") is False or result.get("media_upload_failed"):
            break
        if post_id != ids[-1]:
            await asyncio.sleep(PAUSE_BETWEEN_CHANNELS_S)
    return results


async def replay_selected_public_posts(
    channel_username: str,
    source_urls: list[str],
    *,
    dry_run: bool = True,
    max_posts: int = 25,
    channels_path: str | None = None,
) -> list[dict]:
    """Owner-operated entrypoint; the live collector must release its session first."""
    configured = [channel for channel in load_channels(channels_path)
                  if channel.enabled and channel.private_id is None
                  and channel.username.casefold() == channel_username.lstrip("@").casefold()]
    if len(configured) != 1:
        raise ValueError("Select exactly one enabled allowlisted public channel")
    channel = configured[0]
    _selected_public_post_ids(channel, source_urls, max_posts)
    with acquire_run_lock():
        client = build_client()
        async with connected_client(client):
            if not await client.is_user_authorized():
                raise TelegramUnavailable("Account session is not authorised")
            return await replay_selected_posts(
                client, channel, source_urls, dry_run=dry_run, max_posts=max_posts,
            )


async def login() -> str:
    """One-time interactive authorisation. Must be run by the account owner."""
    with acquire_run_lock():
        client = build_client()
        try:
            await client.start()
            me = await client.get_me()
        finally:
            await client.disconnect()
        session_file = Path(f"{client.session.filename}")
        if session_file.exists():
            session_file.chmod(0o600)
        return f"@{me.username}" if getattr(me, "username", None) else str(me.id)
