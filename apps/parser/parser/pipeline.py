"""Orchestrate the collection pipeline for one or all sources.

Three extraction tiers, tried in order of how literal the data is:

1. **schema.org JSON-LD** — the organizer stated the fields explicitly. Trust it.
2. **Page text** — regex baseline plus an optional model pass, the same
   two-layer extractor the Telegram collector uses on post text. This is what
   reads a plain "Положение о конкурсе" page with no markup.
3. **OpenGraph/meta** — title and description only; a last resort that at least
   gets the page into the moderation queue.

The order matters: a value the organizer published in machine-readable form
always beats one inferred from prose.
"""
from __future__ import annotations

import logging
import hashlib
from urllib.parse import urlparse

from tgcollect.extract import baseline

from .config import Source, load_sources
from .extract import extract_explicit_deadline, extract_html, has_cancelled_jsonld_event, page_image_urls, page_text
from .fetch import fetch, fetch_media
from .ingest import post_candidates, post_media
from .llm_refine import refine
from .normalize import to_candidate
from .rss import extract_rss
from .sitemap import extract_sitemap, same_site
from .astanahub import extract_event_cards

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("parser.pipeline")


def _from_page_text(html: str, url: str, source: Source, use_llm: bool) -> list[dict]:
    """Tier 2: read the page as prose. Returns [] when it isn't an announcement."""
    text = page_text(html, base_url=url)
    if not text:
        return []

    item = baseline(
        text=text,
        post_url=url,
        channel_title=source.organizer,
        default_category=source.category,
    )
    if item is None:
        return []

    explicit_deadline = extract_explicit_deadline(text)
    if explicit_deadline:
        item["applicationDeadline"] = explicit_deadline
    else:
        item.pop("applicationDeadline", None)

    if use_llm:
        item = refine(item, text)
        if item.pop("_rejected_by_llm", False):
            return []

    return [item]


def _html_candidates(html: str, url: str, source: Source, use_llm: bool) -> tuple[list[dict], str, int]:
    raw_items = extract_html(html, url)
    images = page_image_urls(html, url)
    structured = [r for r in raw_items if r.get("_source") == "jsonld"]
    if structured:
        for raw in structured:
            existing = list(raw.get("image_urls") or []) + list(raw.get("video_urls") or [])
            if existing:
                raw["image_urls"] = list(dict.fromkeys([*existing, *images]))[:11]
                raw["video_urls"] = []
            else:
                raw["image_urls"] = images
        return [c for c in (to_candidate(r, source) for r in structured) if c], "jsonld", len(raw_items)
    if has_cancelled_jsonld_event(html):
        return [], "jsonld", len(raw_items)
    candidates = _from_page_text(html, url, source, use_llm)
    if candidates:
        for candidate in candidates:
            if images:
                candidate["_mediaSourceUrls"] = images
        return candidates, "text", len(raw_items)
    candidates = []
    for raw in raw_items:
        text = "\n".join(str(raw.get(key) or "") for key in ("title", "description", "url"))
        item = baseline(
            text=text,
            post_url=str(raw.get("url") or url),
            channel_title=str(raw.get("organizer") or source.organizer),
            default_category=source.category,
        )
        if item is not None:
            if raw.get("deadline"):
                item["applicationDeadline"] = raw["deadline"]
            else:
                item.pop("applicationDeadline", None)
            if images:
                item["_mediaSourceUrls"] = images
            candidates.append(item)
    return candidates, "opengraph", len(raw_items)


def _attach_web_media(source: Source, candidates: list[dict]) -> tuple[list[dict], dict[str, int]]:
    rights_evidence = urlparse(source.media_rights_evidence_url or "")
    licensed = source.media_rights_basis in {"ORGANIZER_OWNED", "EXPLICIT_LICENSE", "OPEN_LICENSE"} \
        and rights_evidence.scheme == "https" and bool(rights_evidence.hostname) \
        and not rights_evidence.username and not rights_evidence.password
    ready: list[dict] = []
    held = {"missing_rights": 0, "missing_media": 0, "incomplete_media": 0}
    for candidate in candidates:
        media_urls = candidate.pop("_mediaSourceUrls", [])
        incomplete = candidate.pop("_mediaIncomplete", False)
        candidate["media"] = []
        if incomplete or len(media_urls) > 10:
            held["incomplete_media"] += 1
            continue
        if not licensed:
            held["missing_rights"] += 1
            continue
        if not media_urls:
            held["missing_media"] += 1
            continue
        page_url = str(candidate.get("sourceUrl") or source.url)
        page_host = (urlparse(page_url).hostname or "").lower()
        allowed_hosts = {page_host, *source.media_hosts}
        source_account = f"web-{page_host}"
        source_post_id = hashlib.sha256(page_url.encode("utf-8")).hexdigest()[:24]
        for position, media_url in enumerate(media_urls):
            parsed = urlparse(media_url)
            if parsed.scheme != "https" or not parsed.hostname or parsed.hostname.lower() not in allowed_hosts:
                continue
            try:
                downloaded = fetch_media(media_url, rate_limit_ms=source.rate_limit_ms)
                if downloaded is None:
                    continue
                content, mime_type = downloaded
                platform_media_id = hashlib.sha256(media_url.encode("utf-8")).hexdigest()[:32]
                uploaded = post_media(
                    source_account, source_post_id, platform_media_id, position, content, mime_type,
                )
                uploaded.update({
                    "rightsState": "APPROVED",
                    "rightsBasis": source.media_rights_basis,
                    "rightsEvidenceUrl": source.media_rights_evidence_url,
                })
                candidate["media"].append(uploaded)
            except Exception as error:
                log.warning("Media for %s skipped: %s", page_url, type(error).__name__)
        if len(candidate["media"]) == len(media_urls):
            ready.append(candidate)
        else:
            held["incomplete_media"] += 1
    return ready, held


def _sitemap_candidates(xml: str, origin: str, source: Source, use_llm: bool) -> tuple[list[dict], int]:
    kind, links = extract_sitemap(xml, origin)
    pages = links if kind == "urlset" else []
    if kind == "sitemapindex":
        for sitemap_url in links[:5]:
            try:
                result = fetch(sitemap_url, rate_limit_ms=source.rate_limit_ms)
            except Exception as error:
                log.warning("Sitemap %s skipped: %s", sitemap_url, type(error).__name__)
                continue
            if result.status >= 300 or not same_site(result.url, origin):
                continue
            try:
                nested_kind, nested_links = extract_sitemap(result.text, origin)
            except ValueError:
                continue
            if nested_kind == "urlset":
                pages.extend(nested_links)
            if len(pages) >= source.max_pages:
                break
    candidates: list[dict] = []
    visited: set[str] = set()
    for page_url in pages:
        if page_url in visited or len(visited) >= source.max_pages:
            continue
        visited.add(page_url)
        try:
            result = fetch(page_url, rate_limit_ms=source.rate_limit_ms)
        except Exception as error:
            log.warning("Sitemap page %s skipped: %s", page_url, type(error).__name__)
            continue
        if result.status >= 300 or not same_site(result.url, origin):
            continue
        extracted, page_tier, _raw_count = _html_candidates(result.text, result.url, source, use_llm)
        candidates.extend(extracted)
    return candidates, len(visited)


def run_source(source: Source, dry_run: bool = False, use_llm: bool = True) -> dict:
    log.info("Source '%s' (%s) -> %s", source.name, source.type, source.url)
    result = fetch(source.url, rate_limit_ms=source.rate_limit_ms)
    if result.status >= 300:
        raise RuntimeError(f"HTTP {result.status} for {source.url}")

    if source.type == "astanahub_events":
        raw_items = extract_event_cards(result.text, result.url, source.max_pages)
        candidates = [c for c in (to_candidate(r, source) for r in raw_items) if c]
        tier = "astanahub_event_cards"
        raw_count = len(raw_items)
    elif source.type == "rss":
        raw_items = extract_rss(result.text, result.url)
        candidates = [c for c in (to_candidate(r, source) for r in raw_items) if c]
        tier = "rss"
        raw_count = len(raw_items)
    elif source.type == "sitemap":
        candidates, raw_count = _sitemap_candidates(result.text, result.url, source, use_llm)
        tier = "sitemap"
    else:
        candidates, tier, raw_count = _html_candidates(result.text, result.url, source, use_llm)

    log.info("  extracted %d raw -> %d candidates (tier: %s)", raw_count, len(candidates), tier)

    if dry_run:
        return {
            "source": source.name,
            "found": len(candidates),
            "tier": tier,
            "dry_run": True,
            "candidates": candidates,
        }

    ready, held = _attach_web_media(source, candidates)
    if not ready:
        return {"source": source.name, "tier": tier, "found": len(candidates), "held_media": held, "created": 0, "duplicate": 0, "failed": 0}
    res = post_candidates(source.name, source.type, source.url, ready)
    log.info("  ingest: created=%s duplicate=%s failed=%s", res.get("created"), res.get("duplicate"), res.get("failed"))
    return {"source": source.name, "tier": tier, "found": len(candidates), "held_media": held, **res}


def run_all(
    only: str | None = None,
    dry_run: bool = False,
    use_llm: bool = True,
    sources_path: str | None = None,
) -> list[dict]:
    sources = load_sources(sources_path)
    out: list[dict] = []
    for s in sources:
        if not s.enabled:
            continue
        if only and s.name != only:
            continue
        try:
            out.append(run_source(s, dry_run=dry_run, use_llm=use_llm))
        except Exception as e:  # noqa: BLE001 - report and continue
            log.exception("Source '%s' failed: %s", s.name, e)
            out.append({"source": s.name, "error": str(e)})
    return out
