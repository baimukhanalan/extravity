from __future__ import annotations

from collections import Counter

from parser.config import load_sources


PRIORITY_CATEGORIES = {
    "startup",
    "hackathon",
    "olympiad",
    "mun",
    "robotics",
    "science",
    "research",
    "test-prep",
    "course",
}


def test_enabled_web_source_target_and_unique_urls():
    enabled = [source for source in load_sources() if source.enabled]

    assert len(enabled) >= 50
    assert len({source.url for source in enabled}) == len(enabled)


def test_priority_categories_have_enabled_web_sources():
    counts = Counter(source.category for source in load_sources() if source.enabled)

    assert not (PRIORITY_CATEGORIES - counts.keys())
