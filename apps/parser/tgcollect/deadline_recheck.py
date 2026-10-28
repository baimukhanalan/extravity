"""Bounded, authenticated queue for re-reading existing public posts."""
from __future__ import annotations

import re
from urllib.parse import urlsplit

import httpx

from parser.config import APP_URL, INGEST_SECRET, USER_AGENT

PUBLIC_POST_RE = re.compile(r"^https://t\.me/([A-Za-z0-9_]{5,32})/([1-9]\d*)$")
QUEUE_URL = f"{APP_URL}/api/parser/deadline-recheck"


def _headers() -> dict[str, str]:
    if not INGEST_SECRET:
        raise RuntimeError("PARSER_INGEST_SECRET is not configured")
    parsed = urlsplit(APP_URL)
    if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}):
        raise RuntimeError("APP_URL is not HTTPS or local loopback")
    return {"Authorization": f"Bearer {INGEST_SECRET}", "User-Agent": USER_AGENT}


def fetch_targets() -> list[str]:
    response = httpx.get(QUEUE_URL, headers=_headers(), timeout=15, follow_redirects=False)
    response.raise_for_status()
    body = response.json()
    urls = body.get("urls") if isinstance(body, dict) and body.get("ok") is True else None
    if not isinstance(urls, list) or len(urls) > 8 or any(not isinstance(url, str) or not PUBLIC_POST_RE.fullmatch(url) for url in urls):
        raise ValueError("Deadline recheck target response is invalid")
    return urls


def mark_checked(urls: list[str]) -> int:
    if not urls or len(urls) > 8 or any(not PUBLIC_POST_RE.fullmatch(url) for url in urls):
        raise ValueError("Invalid checked post URLs")
    response = httpx.post(QUEUE_URL, json={"urls": urls}, headers=_headers(), timeout=15, follow_redirects=False)
    response.raise_for_status()
    body = response.json()
    if not isinstance(body, dict) or body.get("ok") is not True or not isinstance(body.get("checked"), int):
        raise ValueError("Deadline recheck acknowledgement is invalid")
    return body["checked"]
