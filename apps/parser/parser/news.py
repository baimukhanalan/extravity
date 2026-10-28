"""Curated RSS news intake. A separate editorial queue, never opportunity ingest."""
from __future__ import annotations

import html
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import feedparser
import httpx
import yaml
from bs4 import BeautifulSoup

from .config import APP_URL, INGEST_SECRET, ROOT, USER_AGENT
from .fetch import fetch
from .ingest import _post_with_retry

log = logging.getLogger("parser.news")
MAX_AGE_DAYS = 30
ALLOWED_TOPICS = {"it", "ai", "money", "success", "education", "youth"}
TRACKING_PARAMS = {"fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source"}


@dataclass(frozen=True)
class NewsSource:
    name: str
    url: str
    topic: str
    allowed_article_hosts: tuple[str, ...]
    kind: str = "rss"
    relevance_terms: tuple[str, ...] = ()
    rate_limit_ms: int = 3000
    max_items: int = 20
    enabled: bool = True


def load_news_sources(path: str | None = None) -> list[NewsSource]:
    source_path = Path(path) if path else ROOT / "news-sources.yaml"
    data = yaml.safe_load(source_path.read_text(encoding="utf-8")) or {}
    sources = []
    for item in data.get("sources", []):
        topic = str(item["topic"]).strip().lower()
        if topic not in ALLOWED_TOPICS:
            raise ValueError(f"Unsupported news topic: {topic}")
        kind = str(item.get("kind", "rss")).strip().lower()
        if kind not in {"rss", "unesco_education_index"}:
            raise ValueError(f"Unsupported news source kind: {kind}")
        url = str(item["url"])
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError(f"Invalid news feed URL for {item['name']}")
        hosts = tuple(str(host).lower() for host in item.get("allowed_article_hosts", []))
        if not hosts:
            raise ValueError(f"No article host allowlist for {item['name']}")
        sources.append(NewsSource(
            name=str(item["name"]).strip(), url=url, topic=topic,
            allowed_article_hosts=hosts,
            kind=kind,
            relevance_terms=tuple(str(term).lower().strip() for term in item.get("relevance_terms", []) if str(term).strip()),
            rate_limit_ms=max(1000, int(item.get("rate_limit_ms", 3000))),
            max_items=max(1, min(50, int(item.get("max_items", 20)))),
            enabled=bool(item.get("enabled", False)),
        ))
    return sources


def _clean_title(raw: str) -> str:
    value = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", " ", raw))).strip()
    return value[:240]


def _clean_description(raw: str) -> str:
    soup = BeautifulSoup(raw, "lxml")
    for element in soup(["script", "style", "iframe", "noscript"]):
        element.decompose()
    return re.sub(r"\s+", " ", html.unescape(soup.get_text(" "))).strip()


def _short_rss_preview(raw: str, source_name: str, *, rss: bool = True) -> str | None:
    clean = _clean_description(raw)
    if len(clean) < 24:
        return None
    words = clean.split()
    excerpt = " ".join(words[:16])[:160].rsplit(" ", 1)[0] if len(clean) > 160 else " ".join(words[:16])
    excerpt = excerpt.strip(" .,:;–—-")
    if len(excerpt) < 20:
        return None
    label = "Краткий анонс RSS от" if rss else "Краткий анонс от"
    return f"{label} {source_name}: {excerpt}{'…' if len(words) > 16 or len(clean) > 160 else '.'}"


def _summary_from_feed(title: str, description: str, source_name: str) -> str | None:
    combined = f"{title} {description}".casefold()
    if source_name.startswith("NASA") and re.search(r"\brobots?\b|\brobotics\b", combined):
        if re.search(r"\bcrew\b|\bcrews\b|\bhuman\b", combined) and re.search(r"\bspace\b|\bmission", combined):
            return "NASA рассказывает, как роботы могут помогать экипажам в космических миссиях."
    return _short_rss_preview(description, source_name)


def _relevant(title: str, description: str, terms: tuple[str, ...]) -> bool:
    if not terms:
        return True
    haystack = f"{title} {description}".casefold()
    return any(re.search(rf"(?<!\w){re.escape(term)}(?!\w)", haystack) for term in terms)


def _canonical_url(raw: str, allowed_hosts: tuple[str, ...]) -> str | None:
    parsed = urlsplit(raw)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return None
    host = parsed.hostname.lower()
    try:
        port = parsed.port
    except ValueError:
        return None
    if host not in allowed_hosts or port not in (None, 443):
        return None
    query = urlencode([(key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True)
                       if key.lower() not in TRACKING_PARAMS and not key.lower().startswith("utm_")])
    return urlunsplit(("https", host, parsed.path or "/", query, ""))


def _published_at(entry: object, now: datetime) -> str | None:
    struct = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if struct is None:
        return None
    try:
        published = datetime(*struct[:6], tzinfo=timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return None
    if published > now + timedelta(hours=24) or published < now - timedelta(days=MAX_AGE_DAYS):
        return None
    return published.isoformat()


def extract_news(text: str, source: NewsSource, now: datetime | None = None) -> list[dict]:
    now = now or datetime.now(timezone.utc)
    feed = feedparser.parse(text)
    if feed.bozo and not feed.entries:
        raise ValueError("Invalid RSS/Atom feed")
    items = []
    seen = set()
    for entry in feed.entries[:source.max_items]:
        title = _clean_title(str(getattr(entry, "title", "") or ""))
        description = _clean_description(str(getattr(entry, "summary", "") or getattr(entry, "description", "") or ""))
        url = _canonical_url(str(getattr(entry, "link", "") or ""), source.allowed_article_hosts)
        published_at = _published_at(entry, now)
        preview = _summary_from_feed(title, description, source.name)
        if len(title) < 12 or not url or not published_at or url in seen or not preview:
            continue
        if not _relevant(title, description, source.relevance_terms):
            continue
        seen.add(url)
        items.append({
            "sourceUrl": url,
            "title": title,
            "summary": preview,
            "sourceName": source.name,
            "topic": source.topic,
            "publishedAt": published_at,
        })
    return items


def extract_unesco_index(text: str, source: NewsSource, now: datetime | None = None, fetch_article=fetch) -> list[dict]:
    if source.kind != "unesco_education_index" or urlsplit(source.url).hostname != "www.unesco.org":
        raise ValueError("UNESCO index requires its official source URL")
    now = now or datetime.now(timezone.utc)
    soup = BeautifulSoup(text, "html.parser")
    items: list[dict] = []
    seen: set[str] = set()
    detail_attempts = 0
    for card in soup.select("article.node.teaser"):
        anchor = card.select_one("a[href]")
        heading = card.select_one(".h5")
        timestamp = card.select_one("time[data-date]")
        if not anchor or not heading or not timestamp:
            continue
        url = _canonical_url(str(anchor.get("href") or ""), source.allowed_article_hosts)
        title = _clean_title(heading.get_text(" ", strip=True))
        if not url or not url.startswith("https://www.unesco.org/en/articles/") or url in seen or len(title) < 12:
            continue
        try:
            published = datetime.fromisoformat(str(timestamp.get("data-date")).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            continue
        if published.tzinfo is None or published > now + timedelta(hours=24) or published < now - timedelta(days=MAX_AGE_DAYS):
            continue
        if not _relevant(title, "", source.relevance_terms):
            continue
        if detail_attempts >= min(20, source.max_items + 5):
            break
        detail_attempts += 1
        try:
            page = fetch_article(url, rate_limit_ms=source.rate_limit_ms)
        except (httpx.HTTPError, RuntimeError, PermissionError):
            continue
        if page.status != 200 or _canonical_url(page.url, source.allowed_article_hosts) != url:
            continue
        detail = BeautifulSoup(page.text, "html.parser")
        meta = detail.select_one('meta[name="description"]') or detail.select_one('meta[property="og:description"]')
        summary = _short_rss_preview(str(meta.get("content") or ""), source.name, rss=False) if meta else None
        if not summary:
            continue
        items.append({
            "sourceUrl": url,
            "title": title,
            "summary": summary,
            "sourceName": source.name,
            "topic": source.topic,
            "publishedAt": published.isoformat(),
        })
        seen.add(url)
        if len(items) >= source.max_items:
            break
    return items


def preflight_news_target() -> dict:
    if not INGEST_SECRET:
        return {"ready": False, "reason": "PARSER_INGEST_SECRET is not set"}
    parsed = urlsplit(APP_URL)
    if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}):
        return {"ready": False, "reason": "APP_URL must be HTTPS or local loopback"}
    try:
        response = httpx.get(
            f"{APP_URL}/api/parser/news",
            headers={"Authorization": f"Bearer {INGEST_SECRET}", "User-Agent": USER_AGENT},
            timeout=10.0, follow_redirects=False,
        )
    except httpx.HTTPError:
        return {"ready": False, "reason": "news ingest target unreachable"}
    if response.status_code != 200:
        return {"ready": False, "reason": f"news ingest target HTTP {response.status_code}"}
    try:
        body = response.json()
    except ValueError:
        return {"ready": False, "reason": "news ingest target invalid JSON"}
    if not isinstance(body, dict) or body.get("ok") is not True or body.get("ready") is not True:
        return {"ready": False, "reason": "news ingest target did not confirm readiness"}
    return {"ready": True, "reason": "verified"}


def run_news_source(source: NewsSource, *, dry_run: bool = False) -> dict:
    response = fetch(source.url, rate_limit_ms=source.rate_limit_ms)
    if response.status >= 300:
        raise RuntimeError(f"News feed HTTP {response.status}")
    items = extract_unesco_index(response.text, source) if source.kind == "unesco_education_index" else extract_news(response.text, source)
    if dry_run:
        return {"source": source.name, "found": len(items), "dry_run": True, "items": items}
    if not INGEST_SECRET:
        raise RuntimeError("PARSER_INGEST_SECRET is not set")
    if not items:
        return {"source": source.name, "created": 0, "duplicate": 0, "found": 0}
    result = _post_with_retry(
        f"{APP_URL}/api/parser/news",
        json={"items": items},
        headers={"Authorization": f"Bearer {INGEST_SECRET}", "User-Agent": USER_AGENT},
        timeout=60.0,
    )
    result.raise_for_status()
    return {"source": source.name, **result.json()}


def run_news_all(*, only: str | None = None, dry_run: bool = False, sources_path: str | None = None) -> list[dict]:
    results = []
    sources = [source for source in load_news_sources(sources_path) if source.enabled and (not only or source.name == only)]
    if sources and not dry_run:
        readiness = preflight_news_target()
        if not readiness["ready"]:
            raise RuntimeError(f"News ingest target is not ready: {readiness['reason']}")
    for source in sources:
        try:
            results.append(run_news_source(source, dry_run=dry_run))
        except (httpx.HTTPError, RuntimeError, ValueError, PermissionError) as error:
            log.warning("News source %s failed: %s", source.name, type(error).__name__)
            results.append({"source": source.name, "error": type(error).__name__})
    return results
