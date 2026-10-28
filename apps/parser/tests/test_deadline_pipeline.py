from parser.config import Source
from parser.pipeline import _from_page_text
from parser.rss import extract_rss


SOURCE = Source(name="E2E", type="official_site", url="https://example.org/fair", organizer="Example", category="olympiad")


def test_page_text_requires_explicit_year_for_deadline():
    html = '<main><h1>Олимпиада для школьников</h1><p>Приём заявок до 15 ноября. Подать заявку: https://example.org/apply</p></main>'
    candidates = _from_page_text(html, SOURCE.url, SOURCE, use_llm=False)
    assert candidates
    assert "applicationDeadline" not in candidates[0]


def test_page_text_preserves_explicit_application_deadline_not_event_date():
    html = '<main><h1>Олимпиада для школьников</h1><p>Приём заявок до 15 ноября 2026. Финал 20 ноября 2026. Подать заявку: https://example.org/apply</p></main>'
    candidates = _from_page_text(html, SOURCE.url, SOURCE, use_llm=False)
    assert candidates
    assert candidates[0]["applicationDeadline"] == "2026-11-15T23:59:59+05:00"


def test_rss_uses_explicit_application_deadline_only():
    feed = """<rss version="2.0"><channel><title>Organizer</title>
    <item><title>Олимпиада для школьников</title><link>https://example.org/a</link><description>Приём заявок до 15 ноября 2026. Финал 20 ноября 2026.</description></item>
    <item><title>Итоги олимпиады</title><link>https://example.org/b</link><description>Финал 20 ноября 2026.</description></item>
    </channel></rss>"""
    items = extract_rss(feed, "https://example.org/feed.xml")
    assert items[0]["deadline"] == "2026-11-15T23:59:59+05:00"
    assert items[1]["deadline"] is None
