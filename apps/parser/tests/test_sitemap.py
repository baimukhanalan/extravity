from parser.config import Source
from parser.fetch import FetchResult
from parser.pipeline import run_source
from parser.sitemap import extract_sitemap


def test_sitemap_extracts_newest_same_site_pages_only():
    xml = """<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://events.example.kz/old</loc><lastmod>2026-01-01</lastmod></url>
      <url><loc>https://evil.example.org/other</loc><lastmod>2026-12-01</lastmod></url>
      <url><loc>http://events.example.kz/insecure</loc><lastmod>2026-11-01</lastmod></url>
      <url><loc>https://events.example.kz:444/private</loc><lastmod>2026-10-01</lastmod></url>
      <url><loc>https://events.example.kz/new</loc><lastmod>2026-09-27</lastmod></url>
    </urlset>"""
    assert extract_sitemap(xml, "https://events.example.kz/sitemap.xml") == (
        "urlset", ["https://events.example.kz/new", "https://events.example.kz/old"]
    )


def test_sitemap_index_crawls_pages_and_respects_budget(monkeypatch):
    origin = "https://events.example.kz/sitemap.xml"
    nested = "https://events.example.kz/events.xml"
    pages = {
        origin: "<sitemapindex><sitemap><loc>https://evil.example.org/x.xml</loc></sitemap><sitemap><loc>https://events.example.kz/events.xml</loc></sitemap></sitemapindex>",
        nested: "<urlset><url><loc>https://events.example.kz/old</loc><lastmod>2026-01-01</lastmod></url><url><loc>https://events.example.kz/new</loc><lastmod>2026-09-27</lastmod></url></urlset>",
        "https://events.example.kz/new": "<html><head><script type='application/ld+json'>{\"@type\":\"Event\",\"name\":\"Student Science Fair\",\"description\":\"Apply to the student science fair\",\"url\":\"https://events.example.kz/new\",\"startDate\":\"2026-11-01\"}</script></head></html>",
    }
    called = []

    def fake_fetch(url, rate_limit_ms):
        called.append(url)
        return FetchResult(url, 200, pages[url])

    monkeypatch.setattr("parser.pipeline.fetch", fake_fetch)
    source = Source(name="test", type="sitemap", url=origin, organizer="Example", max_pages=1)
    result = run_source(source, dry_run=True, use_llm=False)
    assert called == [origin, nested, "https://events.example.kz/new"]
    assert result["tier"] == "sitemap"
    assert result["found"] == 1
    assert result["candidates"][0]["title"] == "Student Science Fair"


def test_sitemap_skips_failed_and_cross_site_redirect_pages(monkeypatch):
    origin = "https://events.example.kz/sitemap.xml"
    pages = {
        origin: "<urlset><url><loc>https://events.example.kz/blocked</loc></url><url><loc>https://events.example.kz/redirect</loc></url><url><loc>https://events.example.kz/good</loc></url></urlset>",
        "https://events.example.kz/good": "<html><head><script type='application/ld+json'>{\"@type\":\"Event\",\"name\":\"School Art Contest\",\"description\":\"Applications open\"}</script></head></html>",
    }

    def fake_fetch(url, rate_limit_ms):
        if url.endswith("/blocked"):
            raise PermissionError("robots.txt")
        if url.endswith("/redirect"):
            return FetchResult("https://evil.example.org/x", 200, pages["https://events.example.kz/good"])
        return FetchResult(url, 200, pages[url])

    monkeypatch.setattr("parser.pipeline.fetch", fake_fetch)
    result = run_source(Source(name="test", type="sitemap", url=origin, organizer="Example"), dry_run=True, use_llm=False)
    assert result["found"] == 1
    assert result["candidates"][0]["title"] == "School Art Contest"


def test_sitemap_does_not_ingest_generic_opengraph_pages(monkeypatch):
    origin = "https://events.example.kz/sitemap.xml"
    pages = {
        origin: "<urlset><url><loc>https://events.example.kz/about</loc></url></urlset>",
        "https://events.example.kz/about": "<html><head><title>About our organization</title><meta property='og:title' content='About our organization'></head><body>We organize events.</body></html>",
    }
    monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, pages[url]))
    result = run_source(Source(name="test", type="sitemap", url=origin), dry_run=True, use_llm=False)
    assert result["found"] == 0


def test_large_sitemap_fetches_only_bounded_newest_pages(monkeypatch):
    origin = "https://events.example.kz/sitemap.xml"
    entries = "".join(
        f"<url><loc>https://events.example.kz/event-{index}</loc><lastmod>2026-09-{index % 28 + 1:02d}</lastmod></url>"
        for index in range(2000)
    )
    called = []

    def fake_fetch(url, rate_limit_ms):
        called.append(url)
        if url == origin:
            return FetchResult(url, 200, f"<urlset>{entries}</urlset>")
        return FetchResult(url, 200, "<html><title>About us</title><body>General information</body></html>")

    monkeypatch.setattr("parser.pipeline.fetch", fake_fetch)
    result = run_source(Source(name="test", type="sitemap", url=origin, max_pages=25), dry_run=True, use_llm=False)
    assert len(called) == 26
    assert result["found"] == 0
