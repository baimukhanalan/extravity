"""Deterministic extraction from HTML: schema.org JSON-LD, OpenGraph, meta, regex."""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

# --- Regex helpers -----------------------------------------------------------

# 12.09.2026 / 12.09.26 / 2026-09-12
_DATE_RE = re.compile(
    r"(?P<d>\d{1,2})[.\-/](?P<m>\d{1,2})[.\-/](?P<y>\d{2,4})"
    r"|(?P<y2>\d{4})-(?P<m2>\d{1,2})-(?P<d2>\d{1,2})"
)
_AGE_RE = re.compile(r"(\d{1,2})\s*[–\-—]\s*(\d{1,2})\s*лет", re.I)
_GRADE_RE = re.compile(r"(\d{1,2})\s*[–\-—]\s*(\d{1,2})\s*класс", re.I)
_ISO_DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$")
KZ_TIMEZONE = timezone(timedelta(hours=5))

_WEB_DEADLINE_MARKER_RE = re.compile(
    r"\b(?:дедлайн(?:\s+подачи\s+(?:заявок|работ|документов))?"
    r"|срок\s+(?:подачи|при[её]ма)\s+(?:заявок|работ|документов)"
    r"|при[её]м\s+(?:заявок|работ|документов)\s+до"
    r"|регистрация\s+до|заявки\s+принимаются\s+до"
    r"|application\s+deadline|registration\s+deadline|submission\s+deadline"
    r"|applications?\s+(?:close|closes|due)|registration\s+closes"
    r"|submissions?\s+(?:close|closes|due)|apply\s+by|submit\s+by"
    r"|өтінім(?:дер)?ді\s+қабылдау\s+мерзімі|өтінім\s+беру\s+мерзімі"
    r"|тіркеу\s+мерзімі)\b",
    re.I,
)
_WEB_EXPLICIT_DATE_RE = re.compile(
    r"(?<!\d)(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})"
    r"(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?(?!\d)"
    r"|(?<!\w)\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря"
    r"|қаңтар|ақпан|наурыз|сәуір|мамыр|маусым|шілде|тамыз|қыркүйек|қазан|қараша|желтоқсан"
    r"|January|February|March|April|May|June|July|August|September|October|November|December"
    r"|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"
    r"(?:ға|ге|да|де|та|те)?\s+\d{4}(?!\d)"
    r"|(?<!\w)(?:January|February|March|April|May|June|July|August|September|October|November|December"
    r"|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"
    r"\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}(?!\d)",
    re.I,
)
_WEB_MONTHS = {
    "января": 1, "февраля": 2, "марта": 3, "апреля": 4, "мая": 5, "июня": 6,
    "июля": 7, "августа": 8, "сентября": 9, "октября": 10, "ноября": 11, "декабря": 12,
    "қаңтар": 1, "ақпан": 2, "наурыз": 3, "сәуір": 4, "мамыр": 5, "маусым": 6,
    "шілде": 7, "тамыз": 8, "қыркүйек": 9, "қазан": 10, "қараша": 11, "желтоқсан": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}


def parse_date(text: str | None) -> str | None:
    """Return ISO-8601 datetime string or None."""
    if not isinstance(text, str) or not text:
        return None
    text = text.strip()
    if _ISO_DATETIME_RE.fullmatch(text):
        try:
            value = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=KZ_TIMEZONE)
        return value.isoformat(timespec="seconds")
    m = _DATE_RE.search(text)
    if not m:
        return None
    if m.group("y"):
        d, mo, y = int(m.group("d")), int(m.group("m")), int(m.group("y"))
    else:
        d, mo, y = int(m.group("d2")), int(m.group("m2")), int(m.group("y2"))
    if y < 100:
        y += 2000
    if not (2000 <= y <= 2100):
        return None
    try:
        date(y, mo, d)
    except ValueError:
        return None
    return f"{y:04d}-{mo:02d}-{d:02d}T09:00:00+05:00"


def parse_deadline(text: str | None) -> str | None:
    parsed = parse_date(text)
    if parsed and text and not re.search(r"\d{1,2}:\d{2}", text):
        return f"{parsed[:10]}T23:59:59+05:00"
    return parsed


def _explicit_web_date(value: str) -> str | None:
    parsed = parse_deadline(value)
    if parsed:
        return parsed
    normalized = re.sub(r"\s+", " ", value).strip()
    day_first = re.fullmatch(r"(\d{1,2})\s+([\wа-яёқңұүәөһі]+?)(?:ға|ге|да|де|та|те)?\s+(\d{4})", normalized, re.I)
    month_first = re.fullmatch(r"([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})", normalized, re.I)
    if day_first:
        day, month_name, year = int(day_first.group(1)), day_first.group(2).lower(), int(day_first.group(3))
    elif month_first:
        day, month_name, year = int(month_first.group(2)), month_first.group(1).lower(), int(month_first.group(3))
    else:
        return None
    month = _WEB_MONTHS.get(month_name)
    if not month or not 2000 <= year <= 2100:
        return None
    try:
        date(year, month, day)
    except ValueError:
        return None
    return f"{year:04d}-{month:02d}-{day:02d}T23:59:59+05:00"


def extract_explicit_deadline(text: str | None) -> str | None:
    """Read an application cutoff only when a nearby label and year are explicit.

    Website archives are often years old, so an undated day/month must not be
    rolled into the current year. Event dates, publication dates and ticket
    sale dates without an application label are not application deadlines.
    """
    if not isinstance(text, str) or not text:
        return None
    matches: list[str] = []
    for marker in _WEB_DEADLINE_MARKER_RE.finditer(text):
        distance = 40 if marker.group().lower() == "дедлайн" else 100
        for candidate in _WEB_EXPLICIT_DATE_RE.finditer(text, marker.end(), min(len(text), marker.end() + distance)):
            between = text[marker.end():candidate.start()]
            if re.search(r"[.!?]", between) or between.count("\n") > 1 or re.search(
                r"\b(?:мероприятия|финала|старта|начала|event|starts?|opening)\b", between, re.I
            ):
                break
            parsed = _explicit_web_date(candidate.group())
            if parsed:
                matches.append(parsed)
            break
    return min(matches) if matches else None


def parse_age(text: str) -> tuple[int | None, int | None]:
    m = _AGE_RE.search(text or "")
    return (int(m.group(1)), int(m.group(2))) if m else (None, None)


def parse_grade(text: str) -> tuple[int | None, int | None]:
    m = _GRADE_RE.search(text or "")
    return (int(m.group(1)), int(m.group(2))) if m else (None, None)


def parse_price(text: str) -> int | None:
    from tgcollect.extract import find_price

    return find_price(text or "")


# --- JSON-LD -----------------------------------------------------------------

def _iter_jsonld(soup: BeautifulSoup):
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(data, list):
            yield from data
        elif isinstance(data, dict):
            graph = data.get("@graph")
            if isinstance(graph, list):
                yield from graph
            else:
                yield data


def _is_event(obj: dict) -> bool:
    t = obj.get("@type", "")
    types = t if isinstance(t, list) else [t]
    return any(str(x).lower().endswith("event") or str(x).lower() in {"event", "course"} for x in types)


def has_cancelled_jsonld_event(html: str) -> bool:
    soup = BeautifulSoup(html, "lxml")
    return any(
        isinstance(obj, dict)
        and _is_event(obj)
        and str(obj.get("eventStatus") or "").rsplit("/", 1)[-1].lower() in {"eventcancelled", "eventcanceled"}
        for obj in _iter_jsonld(soup)
    )


def _location_str(loc: Any) -> str | None:
    if isinstance(loc, str):
        return loc
    if isinstance(loc, dict):
        name = loc.get("name")
        addr = loc.get("address")
        if isinstance(addr, dict):
            addr = addr.get("addressLocality") or addr.get("addressRegion")
        return name or addr
    if isinstance(loc, list) and loc:
        return _location_str(loc[0])
    return None


def _location_country(loc: Any) -> str | None:
    if isinstance(loc, list) and loc:
        return _location_country(loc[0])
    if not isinstance(loc, dict):
        return None
    address = loc.get("address")
    if not isinstance(address, dict):
        return None
    country = address.get("addressCountry")
    if isinstance(country, dict):
        country = country.get("name")
    if not isinstance(country, str) or not country.strip():
        return None
    country = country.strip()
    return "Kazakhstan" if country.upper() == "KZ" else country


def _organizer_str(org: Any) -> str | None:
    if isinstance(org, str):
        return org
    if isinstance(org, dict):
        return org.get("name")
    if isinstance(org, list) and org:
        return _organizer_str(org[0])
    return None


def _secure_url(value: Any, base_url: str) -> str | None:
    if isinstance(value, dict):
        value = value.get("url") or value.get("urlTemplate")
    if not isinstance(value, str) or "{" in value or "}" in value:
        return None
    resolved = urljoin(base_url, value.strip())
    return resolved if resolved.startswith("https://") else None


def _image_urls(value: Any, base_url: str) -> list[str]:
    values = value if isinstance(value, list) else [value]
    urls: list[str] = []
    for item in values:
        if isinstance(item, dict):
            item = item.get("contentUrl") or item.get("url")
        if not isinstance(item, str):
            continue
        resolved = urljoin(base_url, item.strip())
        parsed = urlparse(resolved)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            continue
        if resolved not in urls:
            urls.append(resolved)
        if len(urls) >= 11:
            break
    return urls


def page_image_urls(html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    urls: list[str] = []
    article = soup.find("article")
    if article:
        for tag in article.find_all(("img", "video", "source")):
            for url in _image_urls(tag.get("src") or tag.get("data-src") or tag.get("poster"), base_url):
                if url not in urls:
                    urls.append(url)
                if len(urls) >= 11:
                    return urls
    for prop in ("og:image", "twitter:image", "og:video"):
        tags = soup.find_all("meta", property=prop) + soup.find_all("meta", attrs={"name": prop})
        for tag in tags:
            for url in _image_urls(tag.get("content"), base_url):
                filename = urlparse(url).path.rsplit("/", 1)[-1].lower()
                if any(marker in filename for marker in ("logo", "favicon", "site-icon")):
                    continue
                if url not in urls:
                    urls.append(url)
                if len(urls) >= 11:
                    return urls
    return urls


def _participation_data(obj: dict, base_url: str) -> tuple[str | None, str | None]:
    offers = obj.get("hasParticipationOffer") or []
    if isinstance(offers, dict):
        offers = [offers]
    application_url = None
    deadline = None
    for offer in offers if isinstance(offers, list) else []:
        if not isinstance(offer, dict):
            continue
        application_url = application_url or _secure_url(offer.get("url"), base_url)
        deadline = deadline or parse_deadline(offer.get("validThrough"))
    actions = obj.get("potentialAction") or []
    if isinstance(actions, dict):
        actions = [actions]
    for action in actions if isinstance(actions, list) else []:
        if not isinstance(action, dict):
            continue
        action_type = action.get("@type") or ""
        types = action_type if isinstance(action_type, list) else [action_type]
        if not any(str(kind).rsplit("/", 1)[-1] in {"ApplyAction", "JoinAction", "RegisterAction"} for kind in types):
            continue
        application_url = application_url or _secure_url(action.get("target"), base_url)
    deadline = deadline or parse_deadline(obj.get("applicationDeadline"))
    deadline = deadline or parse_deadline(obj.get("registrationDeadline"))
    deadline = deadline or parse_deadline(obj.get("submissionDeadline"))
    return application_url, deadline


# Structural elements that are never the announcement itself.
_BOILERPLATE_TAGS = ("script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg")


def page_text(html: str, base_url: str | None = None, limit: int = 12000) -> str:
    """Readable page text with navigation and scripts stripped.

    Feeds the text-based extractor, which is the second tier after JSON-LD:
    plenty of Kazakhstani organizers publish a "Положение о конкурсе" page with
    no structured markup at all, and those used to be skipped.

    Link targets are appended at the end. On a web page the registration link
    lives in `href`, not in the visible text — the same problem as URLs hidden
    behind entities in a Telegram post, and it gets the same fix, otherwise
    "Заполните форму регистрации" arrives with nothing to click.
    """
    soup = BeautifulSoup(html, "lxml")
    for tag in soup.find_all(_BOILERPLATE_TAGS):
        tag.decompose()

    # Prefer the main content container when the page marks one.
    root = soup.find("main") or soup.find("article") or soup.body or soup
    text = root.get_text("\n", strip=True)

    # Collapse the blank-line noise that get_text leaves behind.
    lines = [ln.strip() for ln in text.splitlines()]
    body = "\n".join(ln for ln in lines if ln)[:limit]

    hrefs: list[str] = []
    for anchor in root.find_all("a", href=True):
        href = anchor["href"].strip()
        if href.startswith(("mailto:", "tel:", "#", "javascript:")):
            continue
        absolute = urljoin(base_url, href) if base_url else href
        if absolute.startswith(("http://", "https://")) and absolute not in body and absolute not in hrefs:
            hrefs.append(absolute)

    return f"{body}\n{chr(10).join(hrefs[:20])}" if hrefs else body


def extract_html(html: str, url: str) -> list[dict]:
    """Extract candidate items from an HTML page. Prefers JSON-LD Event objects,
    falls back to OpenGraph/meta for a single item."""
    soup = BeautifulSoup(html, "lxml")
    items: list[dict] = []

    for obj in _iter_jsonld(soup):
        if not isinstance(obj, dict) or not _is_event(obj):
            continue
        if str(obj.get("eventStatus") or "").rsplit("/", 1)[-1].lower() in {"eventcancelled", "eventcanceled"}:
            continue
        offers = obj.get("offers") or {}
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        price = None
        if isinstance(offers, dict) and offers.get("price") is not None:
            try:
                price = int(float(offers["price"]))
            except (ValueError, TypeError):
                price = None
            if price is not None and price > 0 and str(offers.get("priceCurrency") or "").upper() != "KZT":
                price = None
        application_url, application_deadline = _participation_data(obj, url)
        application_deadline = application_deadline or extract_explicit_deadline(obj.get("description"))
        items.append({
            "title": (obj.get("name") or "").strip(),
            "description": (obj.get("description") or "").strip(),
            "url": obj.get("url") or url,
            "start_date": parse_date(obj.get("startDate")),
            "end_date": parse_date(obj.get("endDate")),
            "deadline": application_deadline,
            "application_url": application_url,
            "image_urls": _image_urls(obj.get("image"), url),
            "video_urls": _image_urls(obj.get("video"), url),
            "location": _location_str(obj.get("location")),
            "country": _location_country(obj.get("location")),
            "organizer": _organizer_str(obj.get("organizer")),
            "price": price,
            "mode": obj.get("eventAttendanceMode", ""),
            "_source": "jsonld",
        })

    if items:
        return [i for i in items if i["title"]]

    # Fallback: OpenGraph / meta (single item)
    def meta(prop: str) -> str | None:
        tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
        return tag.get("content").strip() if tag and tag.get("content") else None

    title = meta("og:title") or (soup.title.string.strip() if soup.title and soup.title.string else None)
    desc = meta("og:description") or meta("description")
    if title:
        body_text = soup.get_text(" ", strip=True)[:4000]
        return [{
            "title": title,
            "description": desc or title,
            "url": meta("og:url") or url,
            "start_date": parse_date(body_text),
            "end_date": None,
            "deadline": extract_explicit_deadline(body_text),
            "location": None,
            "organizer": meta("og:site_name"),
            "price": parse_price(body_text),
            "mode": "",
            "_source": "opengraph",
            "_body": body_text,
        }]
    return []
