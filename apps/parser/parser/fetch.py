"""HTTP fetching with robots.txt compliance and rate limiting."""
from __future__ import annotations

import time
import logging
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx

from .config import USER_AGENT

log = logging.getLogger("parser.fetch")

_robots_cache: dict[str, RobotFileParser | None] = {}
_last_request_at: dict[str, float] = {}


def _rate_limit(host: str, rate_limit_ms: int) -> None:
    now = time.monotonic()
    last = _last_request_at.get(host, 0.0)
    wait = (rate_limit_ms / 1000.0) - (now - last)
    if wait > 0:
        time.sleep(wait)
    _last_request_at[host] = time.monotonic()


def _robots_allowed(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme == "file":
        return True
    base = f"{parsed.scheme}://{parsed.netloc}"
    rp = _robots_cache.get(base, "unset")  # type: ignore[assignment]
    if rp == "unset":
        rp = RobotFileParser()
        try:
            robots_url = f"{base}/robots.txt"
            resp = httpx.get(robots_url, headers={"User-Agent": USER_AGENT}, timeout=10.0)
            if resp.status_code == 200:
                rp.parse(resp.text.splitlines())
            elif resp.status_code in {301, 302, 303, 307, 308, 401, 403, 429} or resp.status_code >= 500:
                raise PermissionError(f"robots.txt unavailable for {base}")
            else:
                rp = None
        except Exception as error:
            raise PermissionError(f"robots.txt unavailable for {base}") from error
        _robots_cache[base] = rp
    if rp is None:
        return True
    return rp.can_fetch(USER_AGENT, url)


class FetchResult:
    def __init__(self, url: str, status: int, text: str) -> None:
        self.url = url
        self.status = status
        self.text = text


def fetch_media(url: str, rate_limit_ms: int = 2000, max_bytes: int = 4 * 1024 * 1024) -> tuple[bytes, str] | None:
    origin = urlparse(url)
    if origin.scheme != "https" or not origin.hostname or origin.username or origin.password:
        raise PermissionError("Media URL must be HTTPS")
    current = url
    for _ in range(6):
        target = urlparse(current)
        if target.scheme != "https" or target.hostname != origin.hostname or target.port != origin.port:
            raise PermissionError("Cross-site media redirect disallowed")
        if not _robots_allowed(current):
            raise PermissionError("robots.txt disallows media fetching")
        _rate_limit(target.netloc, rate_limit_ms)
        with httpx.stream(
            "GET",
            current,
            headers={"User-Agent": USER_AGENT, "Accept": "image/jpeg,image/png,image/webp,video/mp4"},
            timeout=20.0,
            follow_redirects=False,
        ) as response:
            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("location")
                if not location:
                    return None
                current = urljoin(str(response.url), location)
                continue
            if response.status_code != 200:
                return None
            mime_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            if mime_type not in {"image/jpeg", "image/png", "image/webp", "video/mp4"}:
                return None
            try:
                if int(response.headers.get("content-length", "0")) > max_bytes:
                    return None
            except ValueError:
                return None
            chunks: list[bytes] = []
            size = 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > max_bytes:
                    return None
                chunks.append(chunk)
            content = b"".join(chunks)
            if not content:
                return None
            valid = (
                mime_type == "image/jpeg" and content.startswith(b"\xff\xd8\xff")
                or mime_type == "image/png" and content.startswith(b"\x89PNG\r\n\x1a\n")
                or mime_type == "image/webp" and content.startswith(b"RIFF") and content[8:12] == b"WEBP"
                or mime_type == "video/mp4" and b"ftyp" in content[4:12]
            )
            return (content, mime_type) if valid else None
    raise RuntimeError("Too many media redirects")


def fetch(url: str, rate_limit_ms: int = 2000, respect_robots: bool = True) -> FetchResult:
    """Fetch a URL. Supports http(s) and file:// (for bundled fixtures/tests)."""
    parsed = urlparse(url)

    if parsed.scheme == "file":
        text = Path(unquote(parsed.path)).read_text(encoding="utf-8")
        return FetchResult(url, 200, text)

    origin = parsed
    current = url
    for _ in range(6):
        target = urlparse(current)
        if target.scheme not in {"http", "https"} or target.hostname != origin.hostname or target.port != origin.port:
            raise PermissionError(f"Cross-site redirect disallowed for {url}")
        if origin.scheme == "https" and target.scheme != "https":
            raise PermissionError(f"Insecure redirect disallowed for {url}")
        if respect_robots and not _robots_allowed(current):
            log.warning("Blocked by robots.txt: %s", current)
            raise PermissionError(f"robots.txt disallows fetching {current}")
        _rate_limit(target.netloc, rate_limit_ms)
        resp = httpx.get(
            current,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,application/xml,*/*"},
            timeout=20.0,
            follow_redirects=False,
        )
        if resp.status_code not in {301, 302, 303, 307, 308}:
            return FetchResult(str(resp.url), resp.status_code, resp.text)
        location = resp.headers.get("location")
        if not location:
            return FetchResult(str(resp.url), resp.status_code, resp.text)
        current = urljoin(str(resp.url), location)
    raise RuntimeError(f"Too many redirects for {url}")
