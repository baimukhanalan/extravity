import pytest

from parser import fetch as transport


class Response:
    def __init__(self, url, status_code, text="", location=None):
        self.url = url
        self.status_code = status_code
        self.text = text
        self.headers = {"location": location} if location else {}


def test_cross_site_redirect_is_not_requested(monkeypatch):
    called = []

    def fake_get(url, **kwargs):
        called.append(url)
        return Response(url, 302, location="https://other.example.org/private")

    monkeypatch.setattr(transport.httpx, "get", fake_get)
    with pytest.raises(PermissionError, match="Cross-site redirect"):
        transport.fetch("https://events.example.kz/event", rate_limit_ms=0, respect_robots=False)
    assert called == ["https://events.example.kz/event"]


def test_same_site_redirect_is_fetched_without_downgrade(monkeypatch):
    called = []

    def fake_get(url, **kwargs):
        called.append(url)
        if url == "https://events.example.kz/event":
            return Response(url, 301, location="/events/event")
        return Response(url, 200, text="Event")

    monkeypatch.setattr(transport.httpx, "get", fake_get)
    result = transport.fetch("https://events.example.kz/event", rate_limit_ms=0, respect_robots=False)
    assert result.url == "https://events.example.kz/events/event"
    assert called == ["https://events.example.kz/event", "https://events.example.kz/events/event"]


@pytest.mark.parametrize("status", [301, 403, 429, 503])
def test_robots_error_fails_closed(monkeypatch, status):
    transport._robots_cache.clear()
    monkeypatch.setattr(transport.httpx, "get", lambda url, **kwargs: Response(url, status))
    with pytest.raises(PermissionError, match="robots.txt unavailable"):
        transport.fetch("https://events.example.kz/event", rate_limit_ms=0)
