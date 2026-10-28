from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from parser.astanahub import extract_event_cards


def _card(day: int, slug: str, title: str) -> str:
    return (
        f'<article class="card-item" @click="window.location.href=\'/en/event/{slug}/\'">'
        f'<div class="card-item--header">{day} Sep, 12:00 Almaty</div>'
        f'<div class="card-item--content"><h3>{title}</h3>'
        '<p>Participants learn practical skills and submit a project for review.</p></div>'
        f'<img alt="{title}" src="https://cdn.astanahub.com/media/{slug}.png">'
        '</article>'
    )


def test_event_cards_skip_past_deduplicate_and_limit():
    html = _card(28, "past", "Past event") + _card(30, "future", "Future event") * 2
    now = datetime(2026, 9, 29, 12, tzinfo=ZoneInfo("Asia/Almaty"))
    items = extract_event_cards(html, "https://astanahub.com/en/event/", 10, now)
    assert len(items) == 1
    assert items[0]["title"] == "Future event"
    assert items[0]["url"] == "https://astanahub.com/en/event/future/"
    assert items[0]["start_date"] == "2026-09-30T12:00:00+05:00"
    assert items[0]["image_urls"] == ["https://cdn.astanahub.com/media/future.png"]
    assert extract_event_cards(html, "https://astanahub.com/en/event/", 0, now) == []


def test_event_cards_require_official_host_and_safe_path():
    now = datetime(2026, 9, 29, 12, tzinfo=ZoneInfo("Asia/Almaty"))
    with pytest.raises(ValueError):
        extract_event_cards(_card(30, "future", "Future event"), "https://example.com/", now=now)
    unsafe = _card(30, "future", "Future event").replace("/en/event/future/", "https://example.com/x")
    assert extract_event_cards(unsafe, "https://astanahub.com/en/event/", now=now) == []
