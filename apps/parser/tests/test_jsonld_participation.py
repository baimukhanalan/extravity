import json

from parser.config import Source
from parser.extract import extract_explicit_deadline, extract_html, parse_date, parse_deadline
from parser.fetch import FetchResult
from parser.pipeline import run_source


def _page(event):
    return f'<script type="application/ld+json">{json.dumps(event)}</script>'


def test_rescheduled_start_is_not_an_application_deadline():
    event = {
        "@type": "Event",
        "name": "Science Fair",
        "eventStatus": "https://schema.org/EventRescheduled",
        "previousStartDate": "2026-04-01",
        "startDate": "2026-05-01",
    }
    item = extract_html(_page(event), "https://example.org/fair")[0]
    assert item["deadline"] is None
    assert item["start_date"] == "2026-05-01T09:00:00+05:00"


def test_participation_offer_supplies_application_link_and_deadline():
    event = {
        "@type": "Event",
        "name": "Science Fair",
        "hasParticipationOffer": {
            "@type": "Offer",
            "url": "/apply",
            "validThrough": "2026-11-15",
        },
    }
    item = extract_html(_page(event), "https://example.org/fair")[0]
    assert item["application_url"] == "https://example.org/apply"
    assert item["deadline"] == "2026-11-15T23:59:59+05:00"


def test_explicit_jsonld_country_and_currency_are_respected():
    event = {
        "@type": "Event", "name": "Science Fair",
        "location": {"@type": "Place", "address": {"addressCountry": "KZ"}},
        "offers": {"@type": "Offer", "price": "3000", "priceCurrency": "USD"},
    }
    item = extract_html(_page(event), "https://example.org/fair")[0]
    assert item["country"] == "Kazakhstan"
    assert item["price"] is None


def test_apply_action_target_supplies_application_link():
    event = {
        "@type": "Event",
        "name": "Science Fair",
        "potentialAction": {
            "@type": "https://schema.org/ApplyAction",
            "target": {"urlTemplate": "https://example.org/registration"},
        },
    }
    item = extract_html(_page(event), "https://example.org/fair")[0]
    assert item["application_url"] == "https://example.org/registration"


def test_participation_link_rejects_insecure_or_template_targets():
    event = {
        "@type": "Event",
        "name": "Science Fair",
        "potentialAction": [
            {"@type": "ApplyAction", "target": "http://example.org/apply"},
            {"@type": "ApplyAction", "target": "https://example.org/apply/{id}"},
        ],
    }
    item = extract_html(_page(event), "https://example.org/fair")[0]
    assert item["application_url"] is None


def test_dates_preserve_explicit_offset_and_reject_impossible_days():
    assert parse_date("2026-11-15T18:30:00+06:00") == "2026-11-15T18:30:00+06:00"
    assert parse_deadline("2026-11-15") == "2026-11-15T23:59:59+05:00"
    assert parse_date("2026-02-31") is None


def test_cancelled_structured_event_is_not_returned():
    event = {
        "@type": "Event",
        "name": "Cancelled Science Fair",
        "eventStatus": "https://schema.org/EventCancelled",
    }
    assert extract_html(_page(event), "https://example.org/fair") == []


def test_cancelled_event_cannot_reenter_through_text_fallback(monkeypatch):
    event = {
        "@type": "Event",
        "name": "Cancelled Science Fair",
        "eventStatus": "https://schema.org/EventCancelled",
    }
    html = f"<html><body><main>Apply to the science fair by 15 November 2026 at https://example.org/apply</main>{_page(event)}</body></html>"
    monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, html))
    result = run_source(Source(name="fair", type="html", url="https://example.org/fair", organizer="Example", category="science"), dry_run=True, use_llm=False)
    assert result["found"] == 0


def test_participation_fields_reach_ingest_candidate(monkeypatch):
    event = {
        "@type": "Event",
        "name": "Science Fair",
        "description": "Students can enter the science fair.",
        "hasParticipationOffer": {
            "@type": "Offer",
            "url": "https://example.org/apply",
            "validThrough": "2026-11-15",
        },
    }
    monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, _page(event)))
    result = run_source(Source(name="fair", type="html", url="https://example.org/fair", organizer="Example", category="science"), dry_run=True, use_llm=False)
    assert result["found"] == 1
    assert result["candidates"][0]["applicationUrl"] == "https://example.org/apply"
    assert result["candidates"][0]["applicationDeadline"] == "2026-11-15T23:59:59+05:00"


def test_explicit_web_deadlines_in_three_languages():
    assert extract_explicit_deadline("Приём заявок до 15 ноября 2026. Финал 20 ноября 2026.") == "2026-11-15T23:59:59+05:00"
    assert extract_explicit_deadline("Application deadline: November 15, 2026. Event December 1, 2026.") == "2026-11-15T23:59:59+05:00"
    assert extract_explicit_deadline("Applications close Nov 15, 2026") == "2026-11-15T23:59:59+05:00"
    assert extract_explicit_deadline("Өтінім беру мерзімі: 15 қарашаға 2026") == "2026-11-15T23:59:59+05:00"
    assert extract_explicit_deadline("Registration closes 2026-11-15T18:30:00+06:00") == "2026-11-15T18:30:00+06:00"


def test_web_deadline_never_guesses_event_or_yearless_date():
    assert extract_explicit_deadline("Конкурс пройдёт 15 ноября 2026. Регистрация открыта.") is None
    assert extract_explicit_deadline("Application deadline: November 15. Event December 1, 2026.") is None
    assert extract_explicit_deadline("Дедлайн скоро. Финал 15 ноября 2026.") is None
    assert extract_explicit_deadline("Приём заявок до 31 февраля 2026.") is None
    assert extract_explicit_deadline("Дедлайн мероприятия 15 ноября 2026") is None
    assert extract_explicit_deadline(None) is None
    assert parse_date({"date": "2026-11-15"}) is None


def test_web_deadline_picks_earliest_explicit_application_cutoff():
    text = "Registration deadline: November 30, 2026. Submission deadline: November 15, 2026."
    assert extract_explicit_deadline(text) == "2026-11-15T23:59:59+05:00"


def test_jsonld_description_and_explicit_registration_field_supply_deadline():
    description_event = {
        "@type": "Event", "name": "Science Fair",
        "description": "Registration closes November 15, 2026. The fair starts December 1, 2026.",
        "startDate": "2026-12-01",
    }
    item = extract_html(_page(description_event), "https://example.org/fair")[0]
    assert item["deadline"] == "2026-11-15T23:59:59+05:00"
    assert item["start_date"] == "2026-12-01T09:00:00+05:00"

    field_event = {"@type": "Event", "name": "Science Fair", "registrationDeadline": "2026-11-18"}
    assert extract_html(_page(field_event), "https://example.org/fair")[0]["deadline"] == "2026-11-18T23:59:59+05:00"


def test_opengraph_fallback_extracts_only_labeled_deadline():
    html = """<html><head><meta property="og:title" content="Science Fair"></head>
    <body><main>Registration closes 15 November 2026. The event is 20 November 2026.</main></body></html>"""
    item = extract_html(html, "https://example.org/fair")[0]
    assert item["deadline"] == "2026-11-15T23:59:59+05:00"
