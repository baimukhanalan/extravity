"""RSS / Atom extraction via feedparser."""
from __future__ import annotations

import feedparser

from .extract import _image_urls, extract_explicit_deadline


def extract_rss(text: str, url: str) -> list[dict]:
    feed = feedparser.parse(text)
    items: list[dict] = []
    for entry in feed.entries:
        title = (getattr(entry, "title", "") or "").strip()
        if not title:
            continue
        summary = (getattr(entry, "summary", "") or "").strip()
        link = getattr(entry, "link", url)
        media_urls: list[str] = []
        for item in list(getattr(entry, "enclosures", []) or []) + list(getattr(entry, "media_content", []) or []):
            mime_type = str(item.get("type") or "").lower()
            if not mime_type.startswith(("image/", "video/")):
                continue
            for media_url in _image_urls(item.get("href") or item.get("url"), link):
                if media_url not in media_urls:
                    media_urls.append(media_url)
        for item in getattr(entry, "media_thumbnail", []) or []:
            for media_url in _image_urls(item.get("url"), link):
                if media_url not in media_urls:
                    media_urls.append(media_url)
        items.append({
            "title": title,
            "description": summary or title,
            "url": link,
            "start_date": None,
            "end_date": None,
            "deadline": extract_explicit_deadline(f"{title}. {summary}"),
            "location": None,
            "organizer": (getattr(feed.feed, "title", None) or None),
            "price": None,
            "mode": "",
            "_source": "rss",
            "image_urls": media_urls[:11],
        })
    return items
