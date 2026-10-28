"""Instagram Graph API client.

Two calls, exactly as Meta documents them:

  1. GET /ig_hashtag_search?user_id=<biz>&q=<tag>      → hashtag id
  2. GET /<hashtag-id>/recent_media?user_id=<biz>...   → recent public posts

Reference: https://developers.facebook.com/docs/instagram-api/guides/hashtag-search

The hashtag id is cached for the run because it costs a call and rarely changes.
Every request carries the access token; without it `credentials_ready()` is
False and the CLI runs the offline fixture instead of reaching the network.
"""
from __future__ import annotations

import logging
import hashlib
import hmac
import random
import time
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import httpx

from .config import (
    ACCESS_TOKEN,
    APP_ID,
    APP_SECRET,
    BUSINESS_ID,
    BUSINESS_USERNAME,
    GRAPH_BASE,
    MAX_MEDIA_BYTES,
    MAX_MEDIA_PER_HASHTAG,
    MAX_MEDIA_PER_SOURCE,
    MAX_PAGES_PER_SOURCE,
    REQUIRED_SCOPES,
    REQUIRE_TOKEN_INTROSPECTION,
    TOKEN_MIN_TTL_DAYS,
)
from . import config as instagram_config

log = logging.getLogger("igcollect.client")

# Only public, non-personal fields. No usernames, no follower data.
CHILD_MEDIA_FIELDS = "id,media_type,media_url,thumbnail_url"
MEDIA_FIELDS = f"id,caption,permalink,timestamp,media_type,media_url,thumbnail_url,children{{{CHILD_MEDIA_FIELDS}}}"

_hashtag_id_cache: dict[str, str] = {}
_credential_cache: tuple[float, dict] | None = None
_CREDENTIAL_CACHE_SECONDS = 15 * 60


class InstagramUnavailable(RuntimeError):
    """No credentials, or the Graph API refused the request."""

    def __init__(
        self,
        message: str,
        *,
        retryable: bool = False,
        retry_after_s: float | None = None,
        error_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.retry_after_s = retry_after_s
        self.error_code = error_code


_TRANSIENT_META_CODES = {1, 2, 4, 17, 32, 341, 613}


def _response_error(response: httpx.Response) -> tuple[str, bool, float | None, int | None]:
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    error = payload.get("error") if isinstance(payload, dict) else {}
    error = error if isinstance(error, dict) else {}
    message = error.get("message") or getattr(response, "text", "")[:200] or "request failed"
    try:
        code = int(error["code"]) if error.get("code") is not None else None
    except (TypeError, ValueError):
        code = None
    retryable = (
        response.status_code in {429, 500, 502, 503, 504}
        or error.get("is_transient") is True
        or code in _TRANSIENT_META_CODES
    )
    retry_after: float | None = None
    retry_header = response.headers.get("Retry-After")
    if retry_header:
        try:
            retry_after = min(300.0, max(0.0, float(retry_header)))
        except ValueError:
            pass
    return _safe_error(message), retryable, retry_after, code


def _safe_error(value: object) -> str:
    message = str(value)
    for secret in (ACCESS_TOKEN, APP_SECRET, f"{APP_ID}|{APP_SECRET}" if APP_ID and APP_SECRET else ""):
        if secret:
            message = message.replace(secret, "[redacted]")
    return message[:300]


def _request(url: str, params: dict | None = None) -> dict:
    response = None
    for attempt in range(4):
        request_params = dict(params or {})
        request_params.setdefault("access_token", ACCESS_TOKEN)
        if APP_SECRET and request_params.get("access_token") == ACCESS_TOKEN:
            request_params.setdefault(
                "appsecret_proof",
                hmac.new(APP_SECRET.encode(), ACCESS_TOKEN.encode(), hashlib.sha256).hexdigest(),
            )
        try:
            response = httpx.get(url, params=request_params, timeout=30.0)
        except httpx.RequestError as error:
            if attempt == 3:
                raise InstagramUnavailable(
                    f"Graph API transport failed ({type(error).__name__})"
                ) from error
            delay = min(30.0, (2 ** attempt) + random.random())
            log.warning("Graph API transport failed; retrying in %.1fs", delay)
            time.sleep(delay)
            continue
        if response.status_code < 300:
            break
        message, retryable, retry_after, error_code = _response_error(response)
        if not retryable or attempt == 3:
            raise InstagramUnavailable(
                f"Graph API {response.status_code}: {message}",
                retryable=retryable,
                retry_after_s=retry_after,
                error_code=error_code,
            )
        delay = retry_after if retry_after is not None else min(30.0, (2 ** attempt) + random.random())
        log.warning("Graph API %s; retrying in %.1fs", response.status_code, delay)
        time.sleep(delay)
    assert response is not None
    try:
        payload = response.json()
    except ValueError as error:
        raise InstagramUnavailable("Graph API returned invalid JSON") from error
    if not isinstance(payload, dict):
        raise InstagramUnavailable("Graph API returned an unexpected response")
    return payload


def _get(path: str, params: dict) -> dict:
    return _request(f"{GRAPH_BASE}/{path}", params)


def _get_next(url: str) -> dict:
    return _request(_sanitize_next_url(url))


def _sanitize_next_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "graph.facebook.com":
        raise InstagramUnavailable("Graph API returned an invalid pagination URL")
    query = urlencode([
        (key, value)
        for key, value in parse_qsl(parsed.query)
        if key not in {"access_token", "appsecret_proof"}
    ])
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, query, ""))


def inspect_access_token() -> dict:
    if not APP_ID or not APP_SECRET:
        if REQUIRE_TOKEN_INTROSPECTION:
            raise InstagramUnavailable("IG_APP_ID / IG_APP_SECRET are required for token introspection")
        return {"verified": False, "scopes": [], "expires_at": None, "data_access_expires_at": None}
    if not APP_ID.isdigit():
        raise InstagramUnavailable("IG_APP_ID must contain digits only")

    payload = _request(
        f"{GRAPH_BASE}/debug_token",
        {
            "input_token": ACCESS_TOKEN,
            "access_token": f"{APP_ID}|{APP_SECRET}",
        },
    )
    data = payload.get("data") or {}
    if not isinstance(data, dict) or not data.get("is_valid"):
        raise InstagramUnavailable("Meta reports that the Instagram access token is invalid")
    if str(data.get("app_id") or "") != APP_ID:
        raise InstagramUnavailable("Instagram access token belongs to a different Meta app")

    scopes = {
        str(scope)
        for scope in [
            *(data.get("scopes") or []),
            *(
                item.get("scope")
                for item in (data.get("granular_scopes") or [])
                if isinstance(item, dict)
            ),
        ]
        if scope
    }
    required_scopes = list(REQUIRED_SCOPES)
    if instagram_config.INCLUDE_TAGGED_MEDIA:
        required_scopes.append("instagram_manage_comments")
    missing = sorted(set(required_scopes) - scopes)
    if missing:
        raise InstagramUnavailable(
            f"Instagram access token is missing required permissions: {', '.join(missing)}"
        )

    now = int(datetime.now(timezone.utc).timestamp())
    minimum_expiry = now + TOKEN_MIN_TTL_DAYS * 24 * 60 * 60
    expires_at = int(data.get("expires_at") or 0)
    data_access_expires_at = int(data.get("data_access_expires_at") or 0)
    if expires_at and expires_at < minimum_expiry:
        raise InstagramUnavailable(
            f"Instagram access token expires in less than {TOKEN_MIN_TTL_DAYS} days"
        )
    if data_access_expires_at and data_access_expires_at < minimum_expiry:
        raise InstagramUnavailable(
            f"Instagram data access expires in less than {TOKEN_MIN_TTL_DAYS} days"
        )
    return {
        "verified": True,
        "scopes": sorted(scopes),
        "expires_at": expires_at or None,
        "data_access_expires_at": data_access_expires_at or None,
        "expires_in_days": ((expires_at - now) // (24 * 60 * 60)) if expires_at else None,
        "data_access_expires_in_days": (
            (data_access_expires_at - now) // (24 * 60 * 60)
        ) if data_access_expires_at else None,
    }


def validate_credentials(*, force: bool = False) -> dict:
    global _credential_cache
    now = time.monotonic()
    if not force and _credential_cache and now - _credential_cache[0] < _CREDENTIAL_CACHE_SECONDS:
        return dict(_credential_cache[1])
    if not ACCESS_TOKEN or not BUSINESS_ID:
        raise InstagramUnavailable("IG_ACCESS_TOKEN / IG_BUSINESS_ID are not set")
    if not BUSINESS_ID.isdigit():
        raise InstagramUnavailable("IG_BUSINESS_ID must contain digits only")
    token = inspect_access_token()
    data = _get(BUSINESS_ID, {"fields": "id,username,account_type"})
    returned_id = str(data.get("id") or "")
    if returned_id != str(BUSINESS_ID):
        raise InstagramUnavailable("Graph API credential check returned a different business account")
    account_type = str(data.get("account_type") or "").upper()
    if account_type not in {"BUSINESS", "CREATOR", "MEDIA_CREATOR"}:
        raise InstagramUnavailable("IG_BUSINESS_ID must identify a Business or Creator account")
    username = str(data.get("username") or "").lstrip("@").lower()
    if BUSINESS_USERNAME and username != BUSINESS_USERNAME:
        raise InstagramUnavailable("Graph API credential check returned a different Instagram username")
    identity = {
        "id": returned_id,
        "username": username,
        "account_type": account_type,
        "token_verified": token["verified"],
        "token_scopes": token["scopes"],
        "token_expires_at": token["expires_at"],
        "data_access_expires_at": token["data_access_expires_at"],
        "token_expires_in_days": token.get("expires_in_days"),
        "data_access_expires_in_days": token.get("data_access_expires_in_days"),
    }
    _credential_cache = (now, identity)
    return dict(identity)


def _paged_connection(first: dict, *, max_items: int = MAX_MEDIA_PER_SOURCE) -> list[dict]:
    items: list[dict] = []
    page = first
    pages = 0
    while pages < MAX_PAGES_PER_SOURCE and len(items) < max_items:
        items.extend(list(page.get("data") or []))
        pages += 1
        next_url = ((page.get("paging") or {}).get("next") or "").strip()
        if not next_url or pages >= MAX_PAGES_PER_SOURCE or len(items) >= max_items:
            break
        page = _get_next(next_url)
    return items[:max_items]


def hashtag_id(tag: str) -> str:
    if tag in _hashtag_id_cache:
        return _hashtag_id_cache[tag]
    data = _get("ig_hashtag_search", {"user_id": BUSINESS_ID, "q": tag})
    entries = data.get("data") or []
    if not entries:
        raise InstagramUnavailable(f"#{tag}: hashtag not found")
    hid = str(entries[0]["id"])
    _hashtag_id_cache[tag] = hid
    return hid


def recent_media(tag: str, limit: int = MAX_MEDIA_PER_HASHTAG) -> list[dict]:
    """Recent public posts for a hashtag, newest first as Meta returns them."""
    hid = hashtag_id(tag)
    first = _get(
        f"{hid}/recent_media",
        {"user_id": BUSINESS_ID, "fields": MEDIA_FIELDS, "limit": limit},
    )
    return _paged_connection(first)


def profile_media(username: str, limit: int = MAX_MEDIA_PER_HASHTAG) -> list[dict]:
    fields = f"business_discovery.username({username}){{media.limit({limit}){{{MEDIA_FIELDS}}}}}"
    data = _get(BUSINESS_ID, {"fields": fields})
    first = ((data.get("business_discovery") or {}).get("media") or {})
    return _paged_connection(first)


def tagged_media(limit: int = MAX_MEDIA_PER_HASHTAG) -> list[dict]:
    first = _get(
        f"{BUSINESS_ID}/tags",
        {"fields": MEDIA_FIELDS, "limit": limit},
    )
    return _paged_connection(first)


def _descriptor(media: dict) -> dict | None:
    media_id = str(media.get("id") or "").strip()
    media_url = media.get("media_url")
    thumbnail_url = media.get("thumbnail_url")
    if not media_id or (not media_url and not thumbnail_url):
        return None
    return {
        "platform_media_id": media_id,
        "kind": "VIDEO" if media.get("media_type") in {"VIDEO", "REELS"} else "IMAGE",
        "url": media_url,
        "thumbnail_url": thumbnail_url,
    }


def to_post(media: dict) -> dict | None:
    """Graph media object → the {text,url,date} shape the extractor expects."""
    media_id = str(media.get("id") or "").strip()
    caption = (media.get("caption") or "").strip()
    permalink = media.get("permalink")
    if not media_id or not caption or not permalink:
        return None
    children_page = media.get("children") or {}
    children = list((children_page.get("data") or []))
    carousel = media.get("media_type") == "CAROUSEL_ALBUM" or bool(children)
    incomplete = bool(carousel and (
        not children
        or len(children) > 10
        or (children_page.get("paging") or {}).get("next")
        or any(not child.get("id") or not child.get("media_url") for child in children[:10])
    ))
    descriptors = [entry for entry in (_descriptor(child) for child in children[:10]) if entry]
    if not descriptors and not carousel:
        own_descriptor = _descriptor(media)
        descriptors = [own_descriptor] if own_descriptor else []
    return {
        "id": media_id,
        "text": caption,
        "url": permalink,
        "date": media.get("timestamp"),  # ISO-8601 with offset, per the API
        "media": descriptors[:10],
        "media_incomplete": incomplete,
    }


def _safe_media_url(url: str) -> bool:
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and (
        hostname in {"cdninstagram.com", "fbcdn.net"}
        or hostname.endswith(".cdninstagram.com")
        or hostname.endswith(".fbcdn.net")
    )


def _download_url(url: str, max_bytes: int) -> tuple[bytes, str] | None:
    current = url
    for _redirect in range(6):
        if not _safe_media_url(current):
            return None
        with httpx.stream("GET", current, timeout=45.0, follow_redirects=False) as response:
            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("location")
                if not location:
                    return None
                current = urljoin(current, location)
                continue
            if response.status_code >= 300:
                return None
            content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
            if content_type not in {"image/jpeg", "image/png", "image/webp", "video/mp4"}:
                return None
            chunks: list[bytes] = []
            size = 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > max_bytes:
                    return None
                chunks.append(chunk)
        content = b"".join(chunks)
        return (content, content_type) if content else None
    return None


def download_media(media: dict, max_bytes: int = MAX_MEDIA_BYTES) -> tuple[bytes, str] | None:
    urls = [media["url"]] if media.get("url") else []
    for url in urls:
        try:
            downloaded = _download_url(url, max_bytes)
            if downloaded and ((media.get("kind") == "VIDEO" and downloaded[1] == "video/mp4") or (media.get("kind") != "VIDEO" and downloaded[1].startswith("image/"))):
                return downloaded
        except httpx.HTTPError:
            continue
    return None
