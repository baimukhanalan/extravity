from __future__ import annotations

import socket

import pytest

from tgcollect import price_enrichment as prices


HOSTS = frozenset({"organizer.example"})
URL = "https://organizer.example/events/youth-science"
TITLE = "Youth Science Challenge 2026"


def test_disabled_without_explicit_allowlist(monkeypatch):
    monkeypatch.setenv("TG_PRICE_OFFICIAL_HOSTS", "")
    assert prices.official_hosts_from_env() == frozenset()
    assert prices.lookup_price(f"Details: {URL}", TITLE, frozenset()) is None


@pytest.mark.parametrize("url", [
    "http://organizer.example/events/youth-science",
    "https://organizer.example.evil.test/events/youth-science",
    "https://organizer.example:444/events/youth-science",
    "https://user@organizer.example/events/youth-science",
    "https://organizer.example/apply",
    "https://organizer.example/events/youth-science?next=evil",
    "https://127.0.0.1/events/youth-science",
])
def test_only_approved_information_pages_are_eligible(url):
    assert not prices.eligible_url(url, HOSTS)


def test_public_dns_required_for_pinned_fetch(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *_args, **_kwargs: [
        (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("127.0.0.1", 443)),
    ])
    with pytest.raises(ValueError, match="non-public"):
        prices._public_address("organizer.example")


def test_price_found_on_matching_official_page_with_evidence(monkeypatch):
    requests = []

    def fake_get(url, _limit):
        requests.append(url)
        if url.endswith("/robots.txt"):
            return 200, "text/plain", b"User-agent: *\nAllow: /events/"
        return 200, "text/html", (
            "<html><h1>Youth Science Challenge 2026</h1>"
            "<p>Registration fee: 12 000 KZT.</p>"
            "<p>Prize fund: 500 000 KZT.</p></html>"
        ).encode()

    monkeypatch.setattr(prices, "_get", fake_get)
    prices._robots_cache.clear()
    candidate = {"title": TITLE}
    prices.enrich_candidate_price(candidate, f"Read the rules: {URL}", HOSTS)
    assert candidate["price"] == 12000
    assert candidate["priceEvidenceUrl"] == URL
    assert "12 000 KZT" in candidate["priceEvidenceText"]
    assert requests == ["https://organizer.example/robots.txt", URL]


def test_robots_disallow_blocks_page_fetch(monkeypatch):
    requests = []

    def fake_get(url, _limit):
        requests.append(url)
        return 200, "text/plain", b"User-agent: *\nDisallow: /events/"

    monkeypatch.setattr(prices, "_get", fake_get)
    prices._robots_cache.clear()
    assert prices.lookup_price(URL, TITLE, HOSTS) is None
    assert requests == ["https://organizer.example/robots.txt"]


def test_unrelated_or_price_silent_page_stays_unknown(monkeypatch):
    monkeypatch.setattr(prices, "_robots_allowed", lambda _url: True)
    monkeypatch.setattr(prices, "_get", lambda _url, _limit: (
        200, "text/html", b"<h1>Another Event</h1><p>Registration fee: 12000 KZT.</p>"
    ))
    candidate = {"title": TITLE}
    prices.enrich_candidate_price(candidate, URL, HOSTS)
    assert "price" not in candidate
    assert "priceEvidenceUrl" not in candidate
    monkeypatch.setattr(prices, "_get", lambda _url, _limit: (
        200, "text/html", b"<h1>Youth Science Challenge 2026</h1><p>Details coming soon.</p>"
    ))
    prices.enrich_candidate_price(candidate, URL, HOSTS)
    assert "price" not in candidate


def test_explicitly_free_matching_event_is_zero_but_silence_is_not(monkeypatch):
    monkeypatch.setattr(prices, "_robots_allowed", lambda _url: True)
    monkeypatch.setattr(prices, "_get", lambda _url, _limit: (
        200, "text/html", b"<h1>Youth Science Challenge 2026</h1><p>Free competition for students.</p>"
    ))
    candidate = {"title": TITLE}
    prices.enrich_candidate_price(candidate, URL, HOSTS)
    assert candidate["price"] == 0
    assert candidate["priceEvidenceUrl"] == URL


def test_foreign_fee_keeps_source_evidence_without_inventing_kzt(monkeypatch):
    monkeypatch.setattr(prices, "_robots_allowed", lambda _url: True)
    monkeypatch.setattr(prices, "_get", lambda _url, _limit: (
        200, "text/html", b"<h1>Youth Science Challenge 2026</h1><p>Application fee: $75.</p>"
    ))
    candidate = {"title": TITLE}
    prices.enrich_candidate_price(candidate, URL, HOSTS)
    assert "price" not in candidate
    assert candidate["priceEvidenceUrl"] == URL
    assert "$75" in candidate["priceEvidenceText"]


def test_existing_post_price_is_not_overwritten(monkeypatch):
    monkeypatch.setattr(prices, "lookup_price", lambda *_args: pytest.fail("unexpected lookup"))
    candidate = {"title": TITLE, "price": 5000}
    assert prices.enrich_candidate_price(candidate, URL, HOSTS) == candidate
