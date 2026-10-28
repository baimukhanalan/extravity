"""Extraction tiers for web pages.

Runs entirely off bundled fixtures via file:// — no network, no API key.
"""
from __future__ import annotations

from pathlib import Path

from parser.config import Source
from parser.extract import extract_html, page_text, parse_price
from parser.pipeline import run_source
from parser.normalize import to_candidate

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
PLAIN = FIXTURES / "plain-announcement.html"
STRUCTURED = FIXTURES / "sample-opportunities.html"


def _source(path: Path) -> Source:
    return Source(
        name=f"fixture:{path.name}",
        type="html",
        url=path.as_uri(),
        organizer="Демо-университет",
        category="science",
    )


class TestPageText:
    def test_strips_navigation_scripts_and_footer(self):
        text = page_text(PLAIN.read_text(encoding="utf-8"))
        assert "Республиканский конкурс научных проектов" in text
        assert "Об университете" not in text  # nav
        assert "Все права защищены" not in text  # footer
        assert "footer analytics" not in text  # script

    def test_keeps_the_announcement_body(self):
        text = page_text(PLAIN.read_text(encoding="utf-8"))
        for fragment in ("9–11 классов", "Приём заявок до 15 ноября 2026", "Участие бесплатное"):
            assert fragment in text

    def test_fee_parser_does_not_confuse_prizes_or_unrelated_prices(self):
        assert parse_price("Призовой фонд конкурса 500 000 ₸") is None
        assert parse_price("Взнос за участие: 5 000 ₸") == 5000
        assert parse_price("Стоимость уточняйте у организатора") is None


class TestTierSelection:
    def test_unknown_format_and_country_are_not_inferred_from_source(self):
        raw = {"title": "Youth Science Fair", "description": "Applications open", "url": "https://example.org/fair"}
        candidate = to_candidate(raw, _source(PLAIN))
        assert candidate is not None
        assert "format" not in candidate
        assert "country" not in candidate

    def test_explicit_online_mode_and_country_are_preserved(self):
        raw = {
            "title": "Youth Science Fair", "description": "Applications open",
            "url": "https://example.org/fair", "mode": "https://schema.org/OnlineEventAttendanceMode",
            "country": "Kazakhstan", "price": 0,
        }
        candidate = to_candidate(raw, _source(PLAIN))
        assert candidate is not None
        assert (candidate["format"], candidate["country"], candidate["price"]) == ("ONLINE", "Kazakhstan", 0)

    def test_structured_page_uses_jsonld(self):
        result = run_source(_source(STRUCTURED), dry_run=True, use_llm=False)
        assert result["tier"] == "jsonld"
        assert result["found"] > 0

    def test_plain_page_falls_back_to_text(self):
        result = run_source(_source(PLAIN), dry_run=True, use_llm=False)
        assert result["tier"] == "text"
        assert result["found"] == 1

    def test_plain_page_yields_the_fields_a_moderator_needs(self):
        candidate = run_source(_source(PLAIN), dry_run=True, use_llm=False)["candidates"][0]
        assert candidate["applicationDeadline"].startswith("2026-11-15")
        assert candidate["price"] == 0
        assert (candidate["minimumGrade"], candidate["maximumGrade"]) == (9, 11)
        assert candidate["applicationUrl"] == "https://forms.gle/demo-science-contest"
        assert candidate["city"] == "Алматы"
        assert candidate["categorySlug"] == "science"

    def test_text_tier_is_not_used_when_jsonld_exists(self):
        # Structured data is literal; prose parsing must not override it.
        raw = extract_html(STRUCTURED.read_text(encoding="utf-8"), STRUCTURED.as_uri())
        assert any(item["_source"] == "jsonld" for item in raw)

    def test_generic_opengraph_page_is_not_an_opportunity(self, monkeypatch):
        from parser.fetch import FetchResult

        page = "<html><head><meta property='og:title' content='Powered by HackAlem'></head><body>About this platform</body></html>"
        monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, page))
        result = run_source(Source(name="site", type="html", url="https://events.example.kz/about"), dry_run=True, use_llm=False)
        assert result["tier"] == "opengraph"
        assert result["found"] == 0

    def test_homepage_action_in_navigation_does_not_become_announcement(self, monkeypatch):
        from parser.fetch import FetchResult

        page = "<html><head><meta property='og:title' content='Reading Nation'></head><body><nav>Apply now</nav><main>Competition registration open for school students. Apply now at https://example.org/register</main></body></html>"
        monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, page))
        result = run_source(Source(name="site", type="html", url="https://example.org/", category="creative"), dry_run=True, use_llm=False)
        assert result["tier"] == "text"
        assert result["found"] == 1

        generic = "<html><head><meta property='og:title' content='Reading Nation'></head><body><nav>Apply now for competitions at https://example.org/register</nav><main>Welcome to the project.</main></body></html>"
        monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, generic))
        result = run_source(Source(name="site", type="html", url="https://example.org/", category="creative"), dry_run=True, use_llm=False)
        assert result["tier"] == "opengraph"
        assert result["found"] == 0

    def test_actionable_opengraph_page_remains_a_candidate(self, monkeypatch):
        from parser.fetch import FetchResult

        page = "<html><head><meta property='og:title' content='Youth Science Fair 2026'><meta property='og:description' content='Applications are open for the youth science fair. Apply now by 30 November 2026 at https://events.example.kz/apply'></head><body></body></html>"
        monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, page))
        result = run_source(Source(name="site", type="html", url="https://events.example.kz/fair", organizer="Example", category="science"), dry_run=True, use_llm=False)
        assert result["tier"] == "opengraph"
        assert result["found"] == 1
        assert result["candidates"][0]["applicationUrl"] == "https://events.example.kz/apply"
