from parser.config import Source
from parser.fetch import FetchResult
from parser.pipeline import run_source
from parser.rss import extract_rss


FEED = """<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>School opportunities</title>
<item><title>Student Science Fair</title><link>https://events.example.kz/fair</link>
<description>Applications open for school students.</description>
<pubDate>Sun, 27 Sep 2026 09:00:00 +0500</pubDate>
<enclosure url="https://events.example.kz/fair.jpg" type="image/jpeg" length="12345" />
<media:content url="https://events.example.kz/fair.mp4" type="video/mp4" />
</item></channel></rss>"""


def test_rss_published_date_is_not_event_start():
    item = extract_rss(FEED, "https://events.example.kz/feed.xml")[0]
    assert item["start_date"] is None
    assert item["image_urls"] == ["https://events.example.kz/fair.jpg", "https://events.example.kz/fair.mp4"]


def test_rss_media_reaches_dry_run_candidate(monkeypatch):
    monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, FEED))
    source = Source(name="School feed", type="rss", url="https://events.example.kz/feed.xml", category="science")
    result = run_source(source, dry_run=True, use_llm=False)
    assert result["found"] == 1
    assert "eventStartDate" not in result["candidates"][0]
    assert result["candidates"][0]["_mediaSourceUrls"] == [
        "https://events.example.kz/fair.jpg", "https://events.example.kz/fair.mp4",
    ]


def test_rss_overflow_is_visible_and_not_silently_truncated(monkeypatch):
    enclosures = "".join(
        f'<enclosure url="https://events.example.kz/{index}.jpg" type="image/jpeg" length="123" />'
        for index in range(11)
    )
    feed = f'<rss version="2.0"><channel><title>School</title><item><title>Student Science Fair</title><link>https://events.example.kz/fair</link><description>School science applications</description>{enclosures}</item></channel></rss>'
    monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, feed))
    source = Source(name="School feed", type="rss", url="https://events.example.kz/feed.xml", category="science")
    result = run_source(source, dry_run=True, use_llm=False)
    assert result["candidates"][0]["_mediaIncomplete"] is True
    assert len(result["candidates"][0]["_mediaSourceUrls"]) == 11
