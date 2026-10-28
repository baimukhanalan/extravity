"""Collect → extract → ingest for Instagram hashtags.

Reuses the Telegram collector's extractor and state store wholesale: an
Instagram caption and a Telegram post are the same problem — free-form text
with a permalink and a publication date. Only the transport differs, so only the
transport (`client.py`) is new here.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime

from parser.ingest import post_candidates, post_media

from tgcollect.extract import KZ_TZ, baseline, content_hash, reference_date
from parser.llm_refine import refine

from .client import InstagramUnavailable, download_media, profile_media, recent_media, tagged_media, to_post, validate_credentials
from .config import (
    INCLUDE_TAGGED_MEDIA,
    PAUSE_BETWEEN_HASHTAGS_S,
    Hashtag,
    Profile,
    TaggedMedia,
    credentials_ready,
    load_hashtags,
    load_profiles,
)
from . import health
from . import state as state_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("igcollect.pipeline")

# State is namespaced so an Instagram tag and a Telegram channel never collide.
STATE_KEY_PREFIX = "ig:"


def _source_error(source: dict, error: Exception) -> dict:
    result = {**source, "error": str(error)[:300]}
    if isinstance(error, InstagramUnavailable):
        result["retryable"] = error.retryable
        if error.retry_after_s is not None:
            result["retry_after_s"] = error.retry_after_s
        if error.error_code is not None:
            result["graph_error_code"] = error.error_code
    return result


def posts_to_candidates(posts: list[dict], source: Hashtag | Profile | TaggedMedia, use_llm: bool) -> tuple[list[dict], dict]:
    stats = {"posts": len(posts), "not_opportunity": 0, "llm_rejected": 0, "candidates": 0}
    candidates: list[dict] = []

    for post in posts:
        item = baseline(
            text=post["text"],
            post_url=post["url"],
            channel_title=source.display,
            default_category=source.category,
            today=reference_date(post.get("date")),
            as_of=datetime.now(KZ_TZ),
        )
        if item is None:
            stats["not_opportunity"] += 1
            continue

        if use_llm:
            item = refine(item, post["text"])
            if item.pop("_rejected_by_llm", False):
                stats["llm_rejected"] += 1
                continue

        item["contentHash"] = content_hash(f"ig:{source.state_key}", str(post.get("id", "")), post["text"])
        item["_instagramMedia"] = list(post.get("media") or [])
        item["_instagramMediaIncomplete"] = bool(post.get("media_incomplete", False))
        candidates.append(item)

    stats["candidates"] = len(candidates)
    return candidates, stats


def _upload_media(candidates: list[dict], source_account: str) -> tuple[list[dict], int]:
    ready: list[dict] = []
    failed = 0
    for candidate in candidates:
        descriptors = candidate.pop("_instagramMedia", [])
        media_incomplete = candidate.pop("_instagramMediaIncomplete", False)
        candidate["media"] = []
        if media_incomplete:
            failed += 1
            log.warning("  candidate held for retry: carousel media set incomplete (%s)", candidate.get("sourceUrl"))
            continue
        if not descriptors:
            failed += 1
        for position, descriptor in enumerate(descriptors):
            downloaded = download_media(descriptor)
            if downloaded is None:
                failed += 1
                continue
            content, mime_type = downloaded
            try:
                candidate["media"].append(post_media(
                    source_account,
                    str(descriptor["platform_media_id"]),
                    str(descriptor["platform_media_id"]),
                    position,
                    content,
                    mime_type,
                ))
            except Exception as error:  # noqa: BLE001
                failed += 1
                log.warning("  media skipped: %s", error)
        if descriptors and len(candidate["media"]) == len(descriptors):
            ready.append(candidate)
        else:
            log.warning("  candidate held for retry: media set incomplete (%s)", candidate.get("sourceUrl"))
    return ready, failed


def run_hashtag(hashtag: Hashtag, state: dict[str, list[str]], dry_run: bool, use_llm: bool) -> dict:
    log.info("Hashtag %s", hashtag.display)
    fetched_media = recent_media(hashtag.tag)
    media = state_store.unseen(state, hashtag.state_key, fetched_media)
    posts = [p for p in (to_post(m) for m in media) if p]
    if not posts:
        log.info("  no posts with captions")
        if not dry_run:
            state_store.mark_seen(state, hashtag.state_key, media)
        return {"hashtag": hashtag.tag, "posts": 0, "candidates": 0}

    candidates, stats = posts_to_candidates(posts, hashtag, use_llm)
    log.info(
        "  %d posts -> %d candidates (skipped: %d non-opportunity, %d rejected by model)",
        stats["posts"], stats["candidates"], stats["not_opportunity"], stats["llm_rejected"],
    )

    result: dict = {"hashtag": hashtag.tag, **stats}

    if dry_run:
        result["dry_run"] = True
        result["preview"] = candidates[:5]
        return result

    candidates_to_ingest, media_failed = _upload_media(candidates, f"instagram-{hashtag.tag}")
    result["media_failed"] = media_failed
    result["ingest_ready"] = len(candidates_to_ingest)
    ingest_ok = media_failed == 0

    if candidates_to_ingest:
        ingested = post_candidates(
            source_name=f"Instagram: {hashtag.display}",
            source_type="instagram",
            source_url=f"https://www.instagram.com/explore/tags/{hashtag.tag}/",
            items=candidates_to_ingest,
        )
        log.info(
            "  ingest: created=%s duplicate=%s failed=%s",
            ingested.get("created"), ingested.get("duplicate"), ingested.get("failed"),
        )
        result["ingest"] = ingested
        ingest_ok = ingest_ok and int(ingested.get("failed", 0) or 0) == 0

    if ingest_ok:
        state_store.mark_seen(state, hashtag.state_key, media)
    else:
        result["offset_advanced"] = False

    return result


def run_profile(profile: Profile, state: dict[str, list[str]], dry_run: bool, use_llm: bool) -> dict:
    log.info("Profile %s", profile.display)
    fetched_media = profile_media(profile.username)
    media = state_store.unseen(state, profile.state_key, fetched_media)
    posts = [post for post in (to_post(item) for item in media) if post]
    candidates, stats = posts_to_candidates(posts, profile, use_llm)
    result: dict = {"profile": profile.username, **stats}
    if dry_run:
        result["dry_run"] = True
        result["preview"] = candidates[:5]
        return result

    candidates_to_ingest, media_failed = _upload_media(candidates, f"instagram-{profile.username}")
    result["media_failed"] = media_failed
    result["ingest_ready"] = len(candidates_to_ingest)
    ingest_ok = media_failed == 0
    if candidates_to_ingest:
        ingested = post_candidates(
            source_name=f"Instagram: {profile.display}",
            source_type="instagram",
            source_url=profile.source_url,
            items=candidates_to_ingest,
        )
        result["ingest"] = ingested
        ingest_ok = ingest_ok and int(ingested.get("failed", 0) or 0) == 0
    if ingest_ok:
        state_store.mark_seen(state, profile.state_key, media)
    else:
        result["offset_advanced"] = False
    return result


def run_tagged(source: TaggedMedia, state: dict[str, list[str]], dry_run: bool, use_llm: bool) -> dict:
    log.info("Tagged media for %s", source.display)
    fetched_media = tagged_media()
    media = state_store.unseen(state, source.state_key, fetched_media)
    posts = [post for post in (to_post(item) for item in media) if post]
    candidates, stats = posts_to_candidates(posts, source, use_llm)
    result: dict = {"tagged_media": True, **stats}
    if dry_run:
        result["dry_run"] = True
        result["preview"] = candidates[:5]
        return result

    candidates_to_ingest, media_failed = _upload_media(candidates, "instagram-tagged")
    result["media_failed"] = media_failed
    result["ingest_ready"] = len(candidates_to_ingest)
    ingest_ok = media_failed == 0
    if candidates_to_ingest:
        ingested = post_candidates(
            source_name=f"Instagram: {source.display}",
            source_type="instagram",
            source_url=source.source_url,
            items=candidates_to_ingest,
        )
        result["ingest"] = ingested
        ingest_ok = ingest_ok and int(ingested.get("failed", 0) or 0) == 0
    if ingest_ok:
        state_store.mark_seen(state, source.state_key, media)
    else:
        result["offset_advanced"] = False
    return result


def run_all(only: str | None = None, dry_run: bool = False, use_llm: bool = True,
            hashtags_path: str | None = None) -> list[dict]:
    if not credentials_ready():
        raise InstagramUnavailable(
            "IG_ACCESS_TOKEN / IG_BUSINESS_ID are not set. The Graph API path needs a "
            "Business account, a reviewed Meta app and a token. Run `python run_instagram.py "
            "--demo` to exercise the parsing offline."
        )

    try:
        identity = validate_credentials()
        health.credentials_valid(identity)
    except InstagramUnavailable as error:
        health.credentials_invalid(error)
        raise

    hashtags = [h for h in load_hashtags(hashtags_path) if h.enabled]
    profiles = [p for p in load_profiles(hashtags_path) if p.enabled]
    tagged = TaggedMedia() if INCLUDE_TAGGED_MEDIA else None
    if only:
        hashtags = [h for h in hashtags if h.tag.lstrip("#") == only.lstrip("#")]
        profiles = [p for p in profiles if p.username.lstrip("@") == only.lstrip("@")]
        if only not in {"tagged", "mentions"}:
            tagged = None
    if not hashtags and not profiles and not tagged:
        log.warning("No enabled hashtags or profiles in hashtags.yaml")
        return []

    source_count = len(hashtags) + len(profiles) + int(tagged is not None)
    health.start(dry_run=dry_run, source_count=source_count)
    try:
        with state_store.exclusive_run():
            state = state_store.load()
            results: list[dict] = []

            for index, hashtag in enumerate(hashtags):
                try:
                    results.append(run_hashtag(hashtag, state, dry_run, use_llm))
                except InstagramUnavailable as error:
                    log.error("  skipped: %s", error)
                    results.append(_source_error({"hashtag": hashtag.tag}, error))
                except Exception as error:  # noqa: BLE001 — one bad hashtag must not stop the run
                    log.exception("  failed: %s", error)
                    results.append(_source_error({"hashtag": hashtag.tag}, error))

                if index < len(hashtags) - 1:
                    time.sleep(PAUSE_BETWEEN_HASHTAGS_S)

            for profile in profiles:
                try:
                    results.append(run_profile(profile, state, dry_run, use_llm))
                except InstagramUnavailable as error:
                    results.append(_source_error({"profile": profile.username}, error))
                except Exception as error:  # noqa: BLE001
                    log.exception("  profile failed: %s", error)
                    results.append(_source_error({"profile": profile.username}, error))
                time.sleep(PAUSE_BETWEEN_HASHTAGS_S)

            if tagged:
                try:
                    results.append(run_tagged(tagged, state, dry_run, use_llm))
                except InstagramUnavailable as error:
                    results.append(_source_error({"tagged_media": True}, error))
                except Exception as error:  # noqa: BLE001
                    log.exception("  tagged media failed: %s", error)
                    results.append(_source_error({"tagged_media": True}, error))

            if not dry_run:
                state_store.save(state)
        health.finish(results)
        return results
    except Exception as error:
        health.fail(error)
        raise


def preflight_report(results: list[dict]) -> dict:
    sources: list[dict] = []
    for result in results:
        source = (
            result.get("hashtag")
            or result.get("profile")
            or ("tagged" if result.get("tagged_media") else "unknown")
        )
        sources.append({
            "source": source,
            "ok": not bool(result.get("error")),
            "posts": int(result.get("posts", 0) or 0),
            "candidates": int(result.get("candidates", 0) or 0),
            **({"error": str(result["error"])[:300]} if result.get("error") else {}),
            **({"retryable": bool(result["retryable"])} if "retryable" in result else {}),
            **({"retry_after_s": result["retry_after_s"]} if "retry_after_s" in result else {}),
            **({"graph_error_code": result["graph_error_code"]} if "graph_error_code" in result else {}),
        })
    return {
        "ready": bool(sources) and all(source["ok"] for source in sources),
        "source_count": len(sources),
        "sources": sources,
    }


def preflight(*, only: str | None = None, hashtags_path: str | None = None) -> dict:
    try:
        results = run_all(
            only=only,
            dry_run=True,
            use_llm=False,
            hashtags_path=hashtags_path,
        )
        report = preflight_report(results)
        credential_status = health.snapshot().get("credentials", {})
        report["credentials"] = {
            key: credential_status.get(key)
            for key in (
                "status",
                "checked_at",
                "account_id_matches",
                "account_type",
                "token_verified",
                "granted_scopes",
                "token_expires_at",
                "data_access_expires_at",
                "token_expires_in_days",
                "data_access_expires_in_days",
            )
            if key in credential_status
        }
        health.preflight_finished(report)
        return report
    except Exception as error:
        health.preflight_failed(error)
        raise
