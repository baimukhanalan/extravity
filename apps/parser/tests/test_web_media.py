import json
from contextlib import nullcontext

import httpx

from parser.config import Source
from parser.extract import extract_html, page_image_urls
from parser.fetch import FetchResult, fetch_media
from parser.pipeline import run_source


PAGE_URL = "https://events.example.kz/science-fair"
IMAGE_URL = "https://events.example.kz/images/fair.jpg"


def _page(image=IMAGE_URL):
    event = {
        "@type": "Event",
        "name": "Student Science Fair",
        "description": "Applications open for students",
        "image": image,
    }
    return f'<html><script type="application/ld+json">{json.dumps(event)}</script></html>'


def test_structured_and_opengraph_images_are_extracted():
    assert extract_html(_page(), PAGE_URL)[0]["image_urls"] == [IMAGE_URL]
    html = "<meta property='og:image' content='/images/fair.jpg'>"
    assert page_image_urls(html, PAGE_URL) == [IMAGE_URL]
    html = "<meta property='og:image' content='/images/fair.jpg'><meta property='og:image' content='/images/team.png'>"
    assert page_image_urls(html, PAGE_URL) == [IMAGE_URL, "https://events.example.kz/images/team.png"]
    html = "<nav><img src='/logo.png'></nav><article><img src='/images/fair.jpg'></article>"
    assert page_image_urls(html, PAGE_URL) == [IMAGE_URL]
    html = "<article><video><source src='/videos/fair.mp4'></video></article>"
    assert page_image_urls(html, PAGE_URL) == ["https://events.example.kz/videos/fair.mp4"]


def test_article_gallery_precedes_opengraph_and_skips_site_logo():
    html = ("<meta property='og:image' content='/logo.png'>"
            "<meta property='og:image' content='/images/fair.jpg'>"
            "<article><img src='/images/first.jpg'><img src='/images/second.jpg'></article>")
    assert page_image_urls(html, PAGE_URL) == [
        "https://events.example.kz/images/first.jpg",
        "https://events.example.kz/images/second.jpg",
        IMAGE_URL,
    ]


def test_more_than_ten_source_images_are_held_without_downloading(monkeypatch):
    gallery = "".join(f"<img src='/images/{index}.jpg'>" for index in range(11))
    event = {"@type": "Event", "name": "Student Science Fair", "description": "School science applications"}
    html = f'<script type="application/ld+json">{json.dumps(event)}</script><article>{gallery}</article>'
    monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, html))
    monkeypatch.setattr("parser.pipeline.fetch_media", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("gallery must be held")))
    source = Source(name="fair", type="html", url=PAGE_URL, organizer="Example", category="science",
                    media_rights_basis="EXPLICIT_LICENSE", media_rights_evidence_url="https://events.example.kz/license")
    result = run_source(source, dry_run=False, use_llm=False)
    assert result["found"] == 1
    assert result["held_media"]["incomplete_media"] == 1
    assert result["created"] == 0


def test_structured_video_is_available_to_pipeline(monkeypatch):
    event = {"@type": "Event", "name": "Science Fair", "video": {"contentUrl": "/videos/fair.mp4"}}
    html = f'<script type="application/ld+json">{json.dumps(event)}</script>'
    monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, html))
    result = run_source(Source(name="fair", type="html", url=PAGE_URL, category="science"), dry_run=True, use_llm=False)
    assert result["candidates"][0]["_mediaSourceUrls"] == ["https://events.example.kz/videos/fair.mp4"]
    assert page_image_urls("<meta property='og:image' content='http://events.example.kz/fair.jpg'>", PAGE_URL) == []


def test_web_media_requires_documented_rights_before_download(monkeypatch):
    captured = []
    monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, _page()))
    monkeypatch.setattr("parser.pipeline.fetch_media", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("not licensed")))
    monkeypatch.setattr("parser.pipeline.post_candidates", lambda name, kind, url, items: captured.extend(items) or {"created": 1})
    result = run_source(Source(name="fair", type="html", url=PAGE_URL, organizer="Example", category="science"), dry_run=False, use_llm=False)
    assert result["created"] == 0
    assert result["held_media"]["missing_rights"] == 1
    assert captured == []


def test_licensed_web_media_reaches_candidate_with_rights_evidence(monkeypatch):
    captured = []
    fetched = []
    monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, _page()))
    monkeypatch.setattr("parser.pipeline.fetch_media", lambda url, rate_limit_ms: fetched.append(url) or (b"\xff\xd8\xffx", "image/jpeg"))
    monkeypatch.setattr("parser.pipeline.post_media", lambda *args: {"kind": "IMAGE", "url": "https://store.public.blob.vercel-storage.com/fair.jpg", "mimeType": "image/jpeg", "sizeBytes": 4, "position": 0, "checksum": "a" * 64, "platformMediaId": "image"})
    monkeypatch.setattr("parser.pipeline.post_candidates", lambda name, kind, url, items: captured.extend(items) or {"created": 1})
    source = Source(
        name="fair", type="html", url=PAGE_URL, organizer="Example", category="science",
        media_rights_basis="EXPLICIT_LICENSE", media_rights_evidence_url="https://events.example.kz/license",
    )
    run_source(source, dry_run=False, use_llm=False)
    assert fetched == [IMAGE_URL]
    assert captured[0]["media"][0]["rightsState"] == "APPROVED"
    assert captured[0]["media"][0]["rightsBasis"] == "EXPLICIT_LICENSE"
    assert captured[0]["media"][0]["rightsEvidenceUrl"] == "https://events.example.kz/license"


def test_licensed_web_media_ignores_unlisted_host(monkeypatch):
    captured = []
    monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, _page("https://unlisted.example.org/fair.jpg")))
    monkeypatch.setattr("parser.pipeline.fetch_media", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("host not allowed")))
    monkeypatch.setattr("parser.pipeline.post_candidates", lambda name, kind, url, items: captured.extend(items) or {"created": 1})
    source = Source(
        name="fair", type="html", url=PAGE_URL, organizer="Example", category="science",
        media_rights_basis="OPEN_LICENSE", media_rights_evidence_url="https://events.example.kz/license",
    )
    result = run_source(source, dry_run=False, use_llm=False)
    assert result["held_media"]["incomplete_media"] == 1
    assert captured == []


def test_licensed_web_media_download_failure_holds_card_for_retry(monkeypatch):
    captured = []
    monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, _page()))
    monkeypatch.setattr("parser.pipeline.fetch_media", lambda *args, **kwargs: None)
    monkeypatch.setattr("parser.pipeline.post_candidates", lambda name, kind, url, items: captured.extend(items) or {"created": 1})
    source = Source(
        name="fair", type="html", url=PAGE_URL, organizer="Example", category="science",
        media_rights_basis="EXPLICIT_LICENSE", media_rights_evidence_url="https://events.example.kz/license",
    )
    result = run_source(source, dry_run=False, use_llm=False)
    assert result["found"] == 1
    assert result["held_media"]["incomplete_media"] == 1
    assert result["created"] == 0
    assert captured == []


def test_licensed_web_media_partial_album_holds_card(monkeypatch):
    captured = []
    html = _page([IMAGE_URL, "https://events.example.kz/images/second.jpg"])
    monkeypatch.setattr("parser.pipeline.fetch", lambda url, rate_limit_ms: FetchResult(url, 200, html))
    monkeypatch.setattr("parser.pipeline.fetch_media", lambda url, rate_limit_ms: (b"\xff\xd8\xffx", "image/jpeg") if url == IMAGE_URL else None)
    monkeypatch.setattr("parser.pipeline.post_media", lambda *args: {"kind": "IMAGE", "url": "https://store.public.blob.vercel-storage.com/fair.jpg", "mimeType": "image/jpeg", "sizeBytes": 4, "position": 0, "checksum": "a" * 64, "platformMediaId": "image"})
    monkeypatch.setattr("parser.pipeline.post_candidates", lambda name, kind, url, items: captured.extend(items) or {"created": 1})
    source = Source(
        name="fair", type="html", url=PAGE_URL, organizer="Example", category="science",
        media_rights_basis="EXPLICIT_LICENSE", media_rights_evidence_url="https://events.example.kz/license",
    )
    result = run_source(source, dry_run=False, use_llm=False)
    assert result["held_media"]["incomplete_media"] == 1
    assert captured == []


def test_media_download_rejects_oversize_and_invalid_signature(monkeypatch):
    monkeypatch.setattr("parser.fetch._robots_allowed", lambda url: True)
    monkeypatch.setattr("parser.fetch._rate_limit", lambda host, delay: None)
    request = httpx.Request("GET", IMAGE_URL)
    response = httpx.Response(200, headers={"content-type": "image/jpeg", "content-length": "5"}, content=b"\xff\xd8\xffxx", request=request)
    monkeypatch.setattr("parser.fetch.httpx.stream", lambda *args, **kwargs: nullcontext(response))
    assert fetch_media(IMAGE_URL, max_bytes=4) is None
    response = httpx.Response(200, headers={"content-type": "image/jpeg"}, content=b"not-a-jpeg", request=request)
    monkeypatch.setattr("parser.fetch.httpx.stream", lambda *args, **kwargs: nullcontext(response))
    assert fetch_media(IMAGE_URL) is None


def test_media_download_rejects_cross_host_redirect(monkeypatch):
    monkeypatch.setattr("parser.fetch._robots_allowed", lambda url: True)
    monkeypatch.setattr("parser.fetch._rate_limit", lambda host, delay: None)
    response = httpx.Response(302, headers={"location": "https://other.example.org/image.jpg"}, request=httpx.Request("GET", IMAGE_URL))
    monkeypatch.setattr("parser.fetch.httpx.stream", lambda *args, **kwargs: nullcontext(response))
    try:
        fetch_media(IMAGE_URL)
    except PermissionError:
        pass
    else:
        raise AssertionError("cross-host media redirect accepted")
