"""Bounded price evidence lookup on explicitly approved organizer pages."""
from __future__ import annotations

import http.client
import ipaddress
import os
import re
import socket
import threading
import time
from dataclasses import dataclass
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

from bs4 import BeautifulSoup

from parser.config import USER_AGENT

from .extract import FOREIGN_FEE_RE, find_links, find_price

MAX_ROBOTS_BYTES = 64 * 1024
MAX_HTML_BYTES = 512 * 1024
MAX_PAGES_PER_CANDIDATE = 2
MIN_INTERVAL_SECONDS = 3.0
_BLOCKED_PATH = re.compile(r"(?:^|/)(?:apply|application|register|registration|form|login|signup|checkout|payment)(?:/|$)", re.I)
_PRICE_WORD = re.compile(r"\b(?:стоимость|цена|взнос|оплата|участие|бесплатн\w*|тегін|free|fee|cost|price|registration|application|entry)\b", re.I)
_WORD = re.compile(r"[\w-]+", re.U)
_lock = threading.Lock()
_last_request: dict[str, float] = {}
_robots_cache: dict[str, tuple[RobotFileParser, float]] = {}
_crawl_delay: dict[str, float] = {}
_stop_words = {"для", "при", "или", "the", "and", "for", "with", "from", "program", "программа", "конкурс"}


@dataclass(frozen=True)
class PriceEvidence:
    url: str
    text: str
    amount_kzt: int | None


def official_hosts_from_env() -> frozenset[str]:
    raw = os.getenv("TG_PRICE_OFFICIAL_HOSTS", "")
    return frozenset(host.strip().lower() for host in raw.split(",") if _valid_host(host.strip().lower()))


def _valid_host(host: str) -> bool:
    if not host or len(host) > 253 or host.endswith(".") or "." not in host:
        return False
    if not re.fullmatch(r"[a-z0-9.-]+", host):
        return False
    if any(not part or len(part) > 63 or part.startswith("-") or part.endswith("-") for part in host.split(".")):
        return False
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return True
    return False


def eligible_url(url: str, official_hosts: frozenset[str]) -> bool:
    try:
        parsed = urlsplit(url)
        host = parsed.hostname or ""
        port = parsed.port
    except ValueError:
        return False
    if parsed.scheme != "https" or host not in official_hosts or not _valid_host(host):
        return False
    if parsed.username or parsed.password or port not in (None, 443) or parsed.fragment:
        return False
    if _BLOCKED_PATH.search(parsed.path) or parsed.query:
        return False
    return True


def _public_address(host: str) -> str:
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM, proto=socket.IPPROTO_TCP)
    if not addresses:
        raise ValueError("official host has no DNS address")
    resolved = [ipaddress.ip_address(item[4][0]) for item in addresses]
    if any(not address.is_global for address in resolved):
        raise ValueError("official host resolved to a non-public address")
    return str(resolved[0])


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, address: str):
        super().__init__(host, port=443, timeout=8.0)
        self.address = address

    def connect(self) -> None:
        plain = socket.create_connection((self.address, 443), timeout=self.timeout)
        self.sock = self._context.wrap_socket(plain, server_hostname=self.host)


def _throttle(host: str, interval: float = MIN_INTERVAL_SECONDS) -> None:
    with _lock:
        now = time.monotonic()
        wait = max(0.0, interval - (now - _last_request.get(host, 0.0)))
        if wait:
            time.sleep(wait)
        _last_request[host] = time.monotonic()


def _get(url: str, limit: int) -> tuple[int, str, bytes]:
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    address = _public_address(host)
    _throttle(host, max(MIN_INTERVAL_SECONDS, _crawl_delay.get(host, 0.0)))
    connection = _PinnedHTTPSConnection(host, address)
    path = parsed.path or "/"
    if parsed.query:
        path += "?" + parsed.query
    try:
        connection.request("GET", path, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"})
        response = connection.getresponse()
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("official page exceeds size limit")
        return response.status, response.getheader("Content-Type", ""), data
    finally:
        connection.close()


def _robots_allowed(url: str) -> bool:
    host = urlsplit(url).hostname or ""
    with _lock:
        cached = _robots_cache.get(host)
    if cached is None or time.monotonic() - cached[1] > 3600:
        status, content_type, data = _get(f"https://{host}/robots.txt", MAX_ROBOTS_BYTES)
        if status == 404:
            parser = RobotFileParser()
            parser.parse([])
        elif status == 200 and ("text/plain" in content_type.lower() or not content_type):
            parser = RobotFileParser()
            parser.parse(data.decode("utf-8", errors="replace").splitlines())
        else:
            return False
        with _lock:
            _robots_cache[host] = (parser, time.monotonic())
            _crawl_delay[host] = float(parser.crawl_delay(USER_AGENT) or 0)
        cached = _robots_cache[host]
    return cached[0].can_fetch(USER_AGENT, url)


def _page_text(html: bytes, title: str) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    for element in soup(["script", "style", "nav", "footer", "aside"]):
        element.decompose()
    title_words = {word.lower() for word in _WORD.findall(title) if len(word) >= 4 and word.lower() not in _stop_words}
    if len(title_words) < 2:
        return None
    for heading in soup.find_all(["h1", "h2"]):
        heading_words = {word.lower() for word in _WORD.findall(heading.get_text(" ", strip=True))}
        if len(title_words & heading_words) < 2 or len(title_words & heading_words) / len(title_words) < 0.7:
            continue
        section: list[str] = []
        for element in heading.next_elements:
            if getattr(element, "name", "") in {"h1", "h2"}:
                break
            if isinstance(element, str):
                value = " ".join(element.split())
                if value:
                    section.append(value)
            if sum(len(value) for value in section) > 3000:
                break
        return " ".join(section)[:3000]
    return None


def _price_evidence(section: str, url: str) -> PriceEvidence | None:
    amount = find_price(section)
    clauses = re.split(r"(?<=[.!?;])\s+|\n+", section)
    for clause in clauses:
        snippet = " ".join(clause.split())[:240]
        if not snippet or not _PRICE_WORD.search(snippet):
            continue
        if amount is not None and find_price(snippet) == amount:
            return PriceEvidence(url, snippet, amount)
        if amount is None and FOREIGN_FEE_RE.search(snippet):
            return PriceEvidence(url, snippet, None)
    return None


def lookup_price(text: str, title: str, official_hosts: frozenset[str]) -> PriceEvidence | None:
    if not official_hosts:
        return None
    _, links = find_links(text)
    seen: set[str] = set()
    for url in links:
        if url in seen or not eligible_url(url, official_hosts):
            continue
        seen.add(url)
        if len(seen) > MAX_PAGES_PER_CANDIDATE:
            break
        try:
            if not _robots_allowed(url):
                continue
            status, content_type, html = _get(url, MAX_HTML_BYTES)
            if status != 200 or "text/html" not in content_type.lower():
                continue
            section = _page_text(html, title)
            evidence = _price_evidence(section, url) if section else None
            if evidence:
                return evidence
        except (OSError, TimeoutError, ValueError, http.client.HTTPException):
            continue
    return None


def enrich_candidate_price(candidate: dict, source_text: str, official_hosts: frozenset[str]) -> dict:
    if "price" in candidate:
        return candidate
    evidence = lookup_price(source_text, candidate["title"], official_hosts)
    if evidence:
        candidate["priceEvidenceUrl"] = evidence.url
        candidate["priceEvidenceText"] = evidence.text
        if evidence.amount_kzt is not None:
            candidate["price"] = evidence.amount_kzt
    return candidate
