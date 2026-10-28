from datetime import datetime, timezone

import pytest

from parser.news import NewsSource, _canonical_url, _clean_description, _relevant, _short_rss_preview, _summary_from_feed, extract_news, extract_unesco_index, load_news_sources, preflight_news_target, run_news_all
from parser.fetch import FetchResult


SOURCE = NewsSource(
    name="NASA Technology", url="https://www.nasa.gov/technology/feed/", topic="it",
    allowed_article_hosts=("www.nasa.gov",), max_items=10,
)
NOW = datetime(2026, 9, 29, tzinfo=timezone.utc)
RSS = """<?xml version="1.0"?><rss version="2.0"><channel><title>NASA</title>
<item><title>NASA Tests New Robotics Platform</title>
<link>https://www.nasa.gov/robotics/new-platform/?utm_source=feed&amp;ref=home</link>
<description>NASA tests robots to help crews.</description>
<pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate></item>
<item><title>NASA Tests New Robotics Platform</title>
<link>https://www.nasa.gov/robotics/new-platform/</link>
<pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate></item>
<item><title>Offsite misleading article headline</title>
<link>https://elsewhere.example/story</link>
<pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate></item>
<item><title>NASA archive article from last year</title>
<link>https://www.nasa.gov/archive/old/</link>
<pubDate>Mon, 28 Sep 2025 10:00:00 GMT</pubDate></item>
</channel></rss>"""


def test_extract_news_deduplicates_and_keeps_only_recent_allowed_links():
    items = extract_news(RSS, SOURCE, NOW)
    assert len(items) == 1
    assert items[0]["sourceUrl"] == "https://www.nasa.gov/robotics/new-platform/"
    assert items[0]["publishedAt"] == "2026-09-28T10:00:00+00:00"
    assert items[0]["summary"].startswith("Краткий анонс RSS от NASA Technology:")
    assert "imageUrl" not in items[0]


@pytest.mark.parametrize("url", [
    "http://www.nasa.gov/story", "https://attacker.example/story",
    "https://www.nasa.gov.evil.example/story", "https://user@www.nasa.gov/story",
    "https://www.nasa.gov:8443/story", "https://www.nasa.gov:invalid/story",
])
def test_news_url_allowlist(url):
    assert _canonical_url(url, SOURCE.allowed_article_hosts) is None


def test_news_source_config_is_curated_and_scheduled_separately():
    sources = load_news_sources()
    assert len(sources) >= 1
    assert any(source.enabled for source in sources)
    assert all(source.url.startswith("https://") for source in sources)


def test_news_preview_strips_markup_and_limits_source_excerpt():
    description = "<script>evil()</script><p>Robots can assist NASA crews with repeated precision tasks during space missions and testing programs in the laboratory, while engineers evaluate new ways to work with these machines.</p>"
    preview = _short_rss_preview(description, "NASA Technology")
    assert preview is not None
    assert "evil" not in preview
    assert len(preview.split()) <= 23
    assert "engineers evaluate new ways" not in preview
    assert _clean_description("<style>hidden</style><b>Visible</b>") == "Visible"


def test_feed_summary_uses_grounded_template_only_when_terms_supported():
    assert _summary_from_feed("NASA tests robots", "Crews could work with robots in space missions.", "NASA Technology") == "NASA рассказывает, как роботы могут помогать экипажам в космических миссиях."
    assert _summary_from_feed("NASA tests robots", "Robots make beer bubbly.", "NASA Technology").startswith("Краткий анонс RSS")


def test_relevance_filters_unrelated_nasa_feed_items():
    terms = ("robotics", "ai", "students")
    assert _relevant("NASA Robotics Team", "", terms)
    assert not _relevant("Beer Bubbles on Mars", "", terms)
    assert not _relevant("NASA said hello", "", ("ai",))


def test_news_run_failure_is_isolated(monkeypatch):
    monkeypatch.setattr("parser.news.load_news_sources", lambda path=None: [SOURCE])
    def fail(*args, **kwargs):
        raise PermissionError("robots")
    monkeypatch.setattr("parser.news.run_news_source", fail)
    assert run_news_all(dry_run=True) == [{"source": SOURCE.name, "error": "PermissionError"}]


def test_news_live_run_refuses_missing_or_old_ingest_target(monkeypatch):
    monkeypatch.setattr("parser.news.load_news_sources", lambda path=None: [SOURCE])
    monkeypatch.setattr("parser.news.preflight_news_target", lambda: {"ready": False, "reason": "HTTP 404"})
    with pytest.raises(RuntimeError, match="not ready"):
        run_news_all(dry_run=False)


def test_news_preflight_rejects_unconfigured_secret(monkeypatch):
    monkeypatch.setattr("parser.news.INGEST_SECRET", "")
    assert preflight_news_target()["ready"] is False


def test_unesco_index_keeps_only_recent_relevant_official_articles():
    source = NewsSource(
        name="UNESCO Education", url="https://www.unesco.org/en/education/news-stories",
        topic="education", allowed_article_hosts=("www.unesco.org",),
        kind="unesco_education_index", relevance_terms=("students",), max_items=2,
    )
    index = """<article class="node teaser"><a href="https://www.unesco.org/en/articles/students-learn-ai"><div class="h5">Students learn AI skills</div><time data-date="2026-09-28T12:00:00Z"></time></a></article>
    <article class="node teaser"><a href="https://bad.example/en/articles/students-misled"><div class="h5">Students misled elsewhere</div><time data-date="2026-09-28T12:00:00Z"></time></a></article>
    <article class="node teaser"><a href="https://www.unesco.org/en/articles/students-next-year"><div class="h5">Students next year</div><time data-date="2027-09-28T12:00:00Z"></time></a></article>"""
    fetched = []

    def get_article(url, *, rate_limit_ms):
        fetched.append(url)
        return FetchResult(url, 200, '<meta name="description" content="A classroom project helps students understand AI tools and evaluate their use in everyday learning activities across schools.">')

    items = extract_unesco_index(index, source, NOW, get_article)
    assert len(items) == 1
    assert items[0]["sourceUrl"] == "https://www.unesco.org/en/articles/students-learn-ai"
    assert items[0]["publishedAt"] == "2026-09-28T12:00:00+00:00"
    assert items[0]["summary"].startswith("Краткий анонс от UNESCO Education:")
    assert fetched == [items[0]["sourceUrl"]]
