"""Read public event cards from the Astana Hub event index."""
from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

_PATH = re.compile(r"window\.location\.href='(/en/event/[a-zA-Z0-9_/-]+)'$")
_DATE = re.compile(r"\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b", re.I)
_MONTHS = {name: number for number, name in enumerate(
    ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"), 1
)}


def extract_event_cards(html: str, origin: str, max_pages: int = 50, now: datetime | None = None) -> list[dict]:
    if max_pages <= 0:
        return []
    parsed_origin = urlparse(origin)
    if parsed_origin.scheme != "https" or parsed_origin.hostname != "astanahub.com":
        raise ValueError("Astana Hub event connector requires its official HTTPS host")
    today = (now or datetime.now(ZoneInfo("Asia/Almaty"))).date()
    soup = BeautifulSoup(html, "html.parser")
    items: list[dict] = []
    seen: set[str] = set()
    for card in soup.select("article.card-item"):
        match = _PATH.fullmatch(card.get("@click", ""))
        if not match:
            continue
        url = urljoin(origin, match.group(1))
        if url in seen:
            continue
        title_node = card.find("h3")
        content = card.select_one(".card-item--content")
        if not title_node or not content:
            continue
        title = title_node.get_text(" ", strip=True)
        description = content.get_text(" ", strip=True)
        if len(title) < 4 or len(description) < 30:
            continue
        header = card.select_one(".card-item--header")
        header_text = header.get_text(" ", strip=True) if header else ""
        date_match = _DATE.search(header_text)
        if not date_match:
            continue
        month = _MONTHS[date_match.group(2).title()]
        year = today.year + (1 if today.month == 12 and month == 1 else 0)
        try:
            event_date = today.replace(year=year, month=month, day=int(date_match.group(1)))
        except ValueError:
            continue
        if event_date < today:
            continue
        time_match = re.search(r",\s*(\d{1,2}):([0-5]\d)\b", header_text[date_match.end():])
        start_date = (
            f"{event_date.isoformat()}T{int(time_match.group(1)):02d}:{time_match.group(2)}:00+05:00"
            if time_match and int(time_match.group(1)) < 24 else None
        )
        images = [
            img.get("src") for img in card.find_all("img")
            if img.get("alt") == title and str(img.get("src", "")).startswith("https://cdn.astanahub.com/media/")
        ]
        items.append({
            "title": title,
            "description": description,
            "url": url,
            "start_date": start_date,
            "organizer": "Astana Hub",
            "image_urls": images[:1],
            "_source": "astanahub_event_card",
        })
        seen.add(url)
        if len(items) >= max_pages:
            break
    return items
