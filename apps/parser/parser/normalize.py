"""Normalize raw extracted items into the app's ingest candidate schema."""
from __future__ import annotations

import hashlib
import re

from .config import Source
from .extract import parse_age, parse_grade, parse_price
from .taxonomy import ranked_category

_WS = re.compile(r"\s+")


def _clean(text: str | None, limit: int) -> str:
    if not text:
        return ""
    text = _WS.sub(" ", re.sub(r"<[^>]+>", " ", text)).strip()
    return text[:limit]


def guess_category(text: str, default: str) -> tuple[str, float]:
    return ranked_category(text, default, 0.4)


def _format_from_mode(mode: str, location: str | None) -> str | None:
    m = (mode or "").lower()
    if "mixed" in m or "hybrid" in m:
        return "HYBRID"
    if "online" in m:
        return "ONLINE"
    if "offline" in m:
        return "OFFLINE"
    if location and location.lower() in {"онлайн", "online"}:
        return "ONLINE"
    return "OFFLINE" if location else None


def content_hash(raw: dict) -> str:
    basis = f"{raw.get('title','')}|{raw.get('url','')}|{raw.get('start_date','')}"
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def to_candidate(raw: dict, source: Source) -> dict | None:
    title = _clean(raw.get("title"), 300)
    if len(title) < 3:
        return None

    full = _clean(raw.get("description") or raw.get("_body"), 8000)
    short = full[:300] if full else title
    text_all = f"{title} {full}"

    category, cat_conf = guess_category(text_all, source.category)
    min_age, max_age = parse_age(text_all)
    min_grade, max_grade = parse_grade(text_all)
    price = raw.get("price")
    if price is None:
        price = parse_price(text_all)

    location = raw.get("location")
    fmt = _format_from_mode(raw.get("mode", ""), location)

    candidate = {
        "title": title,
        "shortDescription": short or title,
        "fullDescription": full or short or title,
        "categorySlug": category,
        "tags": [],
        "organizerName": _clean(raw.get("organizer"), 200) or source.organizer,
        "sourceUrl": raw.get("url") or source.url,
        "originalLanguage": "ru",
        "requiredDocuments": [],
        "requirements": [],
        "contentHash": content_hash(raw),
    }
    if fmt:
        candidate["format"] = fmt
    if isinstance(raw.get("country"), str) and raw["country"].strip():
        candidate["country"] = _clean(raw["country"], 100)
    if raw.get("application_url"):
        candidate["applicationUrl"] = raw["application_url"]
    media_urls = list(dict.fromkeys((raw.get("image_urls") or []) + (raw.get("video_urls") or [])))
    if media_urls:
        candidate["_mediaSourceUrls"] = media_urls[:11]
        candidate["_mediaIncomplete"] = len(media_urls) > 10
    if location and fmt != "ONLINE":
        candidate["city"] = _clean(location, 100)
    if raw.get("deadline"):
        candidate["applicationDeadline"] = raw["deadline"]
    if raw.get("start_date"):
        candidate["eventStartDate"] = raw["start_date"]
    if price is not None and price >= 0:
        candidate["price"] = int(price)
    if min_age:
        candidate["minimumAge"] = min_age
    if max_age:
        candidate["maximumAge"] = max_age
    if min_grade:
        candidate["minimumGrade"] = min_grade
    if max_grade:
        candidate["maximumGrade"] = max_grade

    # Confidence: lower when key fields inferred or missing -> flags manual review.
    conf = 0.5 + 0.2 * cat_conf
    if candidate.get("eventStartDate"):
        conf += 0.1
    if candidate.get("applicationDeadline"):
        conf += 0.1
    candidate["confidence"] = round(min(0.95, conf), 2)
    return candidate
