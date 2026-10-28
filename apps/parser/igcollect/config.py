"""Hashtag list and Graph API credentials."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

import yaml
from dotenv import load_dotenv
from tgcollect.extract import CATEGORY_SLUGS

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent

# Instagram Graph API. These values are issued through Meta for Developers after
# app review; there is no way to read another account's public posts without them.
#   IG_ACCESS_TOKEN     — a long-lived token for the app
#   IG_BUSINESS_ID      — the Business/Creator account id the calls run "as"
#   IG_APP_ID/SECRET    — pin and validate the token; never exposed publicly
#   IG_GRAPH_VERSION    — pinned API version, e.g. v21.0
ACCESS_TOKEN = os.getenv("IG_ACCESS_TOKEN", "")
BUSINESS_ID = os.getenv("IG_BUSINESS_ID", "")
APP_ID = os.getenv("IG_APP_ID", "")
APP_SECRET = os.getenv("IG_APP_SECRET", "")
GRAPH_VERSION = os.getenv("IG_GRAPH_VERSION", "v25.0")
GRAPH_BASE = f"https://graph.facebook.com/{GRAPH_VERSION}"
REQUIRE_TOKEN_INTROSPECTION = os.getenv("IG_REQUIRE_TOKEN_INTROSPECTION", "true").strip().lower() in {
    "1", "true", "yes", "on",
}
REQUIRED_SCOPES = tuple(
    dict.fromkeys(
        scope.strip()
        for scope in os.getenv(
            "IG_REQUIRED_SCOPES",
            "instagram_basic,pages_read_engagement",
        ).split(",")
        if scope.strip()
    )
)
TOKEN_MIN_TTL_DAYS = min(30, max(1, int(os.getenv("IG_TOKEN_MIN_TTL_DAYS", "7"))))

# recent_media returns the most recent public posts for a hashtag. Meta caps how
# many unique hashtags one account may query in a rolling 7-day window (currently
# 30), so the list stays short and curated on purpose.
MAX_MEDIA_PER_HASHTAG = min(50, max(1, int(os.getenv("IG_MAX_MEDIA_PER_HASHTAG", "25"))))
MAX_PAGES_PER_SOURCE = min(20, max(1, int(os.getenv("IG_MAX_PAGES_PER_SOURCE", "4"))))
MAX_MEDIA_PER_SOURCE = max(
    MAX_MEDIA_PER_HASHTAG,
    min(1_000, int(os.getenv("IG_MAX_MEDIA_PER_SOURCE", "100"))),
)
MAX_MEDIA_BYTES = min(64 * 1024 * 1024, max(1, int(os.getenv("IG_MAX_MEDIA_BYTES", str(64 * 1024 * 1024)))))
PAUSE_BETWEEN_HASHTAGS_S = min(60.0, max(0.0, float(os.getenv("IG_PAUSE_BETWEEN_HASHTAGS_S", "2"))))
STATE_PATH = os.getenv("IG_STATE_PATH", str(ROOT / ".state" / "instagram.json"))
LOCK_PATH = os.getenv("IG_LOCK_PATH", f"{STATE_PATH}.lock")
INCLUDE_TAGGED_MEDIA = os.getenv("IG_INCLUDE_TAGGED_MEDIA", "false").strip().lower() in {"1", "true", "yes", "on"}
BUSINESS_USERNAME = os.getenv("IG_BUSINESS_USERNAME", "").lstrip("@").strip().lower()
ENV_HASHTAGS = os.getenv("IG_HASHTAGS", "")
ENV_PROFILES = os.getenv("IG_PROFILES", "")

_PROFILE_RE = re.compile(r"^[a-z0-9._]{1,30}$")
_GRAPH_VERSION_RE = re.compile(r"^v[1-9][0-9]{0,2}\.0$")
_TOP_LEVEL_KEYS = {"hashtags", "profiles"}


def _load_document(path: str | None) -> dict:
    p = Path(path) if path else ROOT / "hashtags.yaml"
    if not p.exists():
        return {}
    data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError("Instagram source config must be a mapping")
    unknown = sorted(set(data) - _TOP_LEVEL_KEYS)
    if unknown:
        raise ValueError(f"Unknown Instagram source config keys: {', '.join(unknown)}")
    return data


def _enabled_value(raw: dict, *, source: str) -> bool:
    value = raw.get("enabled", True)
    if not isinstance(value, bool):
        raise ValueError(f"Instagram {source} enabled must be true or false")
    return value


def _validate_source_keys(raw: dict, *, allowed: set[str], source: str) -> None:
    unknown = sorted(set(raw) - allowed)
    if unknown:
        raise ValueError(f"Unknown Instagram {source} keys: {', '.join(unknown)}")


def _normalize_tag(value: object) -> str:
    tag = str(value).lstrip("#").strip().casefold()
    if not tag or len(tag) > 100 or not re.fullmatch(r"\w+", tag, flags=re.UNICODE):
        raise ValueError(f"Invalid Instagram hashtag: {value!r}")
    return tag


def _normalize_username(value: object) -> str:
    username = str(value).lstrip("@").strip().lower()
    if not _PROFILE_RE.fullmatch(username):
        raise ValueError(f"Invalid Instagram username: {value!r}")
    return username


def _normalize_category(value: object) -> str:
    category = str(value or "forum").strip().lower()
    if category not in CATEGORY_SLUGS:
        raise ValueError(f"Invalid Instagram category: {value!r}")
    return category


@dataclass
class Hashtag:
    """A hashtag to query. `tag` is written without the leading #."""

    tag: str
    category: str = "forum"
    enabled: bool = True

    @property
    def display(self) -> str:
        return f"#{self.tag}"

    @property
    def state_key(self) -> str:
        return f"hashtag:{self.tag}"

    @property
    def source_url(self) -> str:
        return f"https://www.instagram.com/explore/tags/{self.tag}/"


@dataclass
class Profile:
    username: str
    category: str = "forum"
    enabled: bool = True

    @property
    def display(self) -> str:
        return f"@{self.username}"

    @property
    def state_key(self) -> str:
        return f"profile:{self.username}"

    @property
    def source_url(self) -> str:
        return f"https://www.instagram.com/{self.username}/"


@dataclass
class TaggedMedia:
    category: str = "forum"
    enabled: bool = True

    @property
    def display(self) -> str:
        return f"@{BUSINESS_USERNAME} tagged media" if BUSINESS_USERNAME else "Instagram tagged media"

    @property
    def state_key(self) -> str:
        return f"tagged:{BUSINESS_ID}"

    @property
    def source_url(self) -> str:
        return f"https://www.instagram.com/{BUSINESS_USERNAME}/" if BUSINESS_USERNAME else "https://www.instagram.com/"


def load_hashtags(path: str | None = None) -> list[Hashtag]:
    data = _load_document(path)
    out: list[Hashtag] = []
    raw_hashtags = data.get("hashtags") or []
    if not isinstance(raw_hashtags, list):
        raise ValueError("Instagram hashtags must be a list")
    for raw in raw_hashtags:
        if not isinstance(raw, dict) or "tag" not in raw:
            raise ValueError("Each Instagram hashtag source needs a tag")
        _validate_source_keys(raw, allowed={"tag", "category", "enabled"}, source="hashtag")
        tag = _normalize_tag(raw["tag"])
        out.append(
            Hashtag(
                tag=tag,
                category=_normalize_category(raw.get("category", "forum")),
                enabled=_enabled_value(raw, source=f"hashtag #{tag}"),
            )
        )
    for value in ENV_HASHTAGS.split(","):
        if value.strip():
            out.append(Hashtag(tag=_normalize_tag(value)))
    return list({source.tag: source for source in out}.values())


def load_profiles(path: str | None = None) -> list[Profile]:
    data = _load_document(path)
    profiles: list[Profile] = []
    raw_profiles = data.get("profiles") or []
    if not isinstance(raw_profiles, list):
        raise ValueError("Instagram profiles must be a list")
    for raw in raw_profiles:
        if not isinstance(raw, dict) or "username" not in raw:
            raise ValueError("Each Instagram profile source needs a username")
        _validate_source_keys(raw, allowed={"username", "category", "enabled"}, source="profile")
        username = _normalize_username(raw["username"])
        profiles.append(Profile(
            username=username,
            category=_normalize_category(raw.get("category", "forum")),
            enabled=_enabled_value(raw, source=f"profile @{username}"),
        ))
    for value in ENV_PROFILES.split(","):
        if value.strip():
            profiles.append(Profile(username=_normalize_username(value)))
    return list({source.username: source for source in profiles}.values())


def credentials_ready() -> bool:
    return bool(ACCESS_TOKEN and BUSINESS_ID)


def required_scopes() -> tuple[str, ...]:
    """Permissions required by the currently enabled Graph API surfaces."""
    scopes = list(REQUIRED_SCOPES)
    # Meta's /<IG_USER_ID>/tags edge additionally requires this permission.
    if INCLUDE_TAGGED_MEDIA:
        scopes.append("instagram_manage_comments")
    return tuple(dict.fromkeys(scopes))


def readiness(path: str | None = None) -> dict:
    reasons: list[str] = []
    try:
        hashtags = [source for source in load_hashtags(path) if source.enabled]
        profiles = [source for source in load_profiles(path) if source.enabled]
    except (OSError, UnicodeError, ValueError, yaml.YAMLError) as error:
        hashtags = []
        profiles = []
        reasons.append(f"invalid Instagram source config: {error}")
    configured = credentials_ready()
    source_count = len(hashtags) + len(profiles) + int(INCLUDE_TAGGED_MEDIA)
    if not configured:
        reasons.append("IG_ACCESS_TOKEN and IG_BUSINESS_ID are required")
    if REQUIRE_TOKEN_INTROSPECTION and (not APP_ID or not APP_SECRET):
        reasons.append("IG_APP_ID and IG_APP_SECRET are required for token introspection")
    if APP_ID and not APP_ID.isdigit():
        reasons.append("IG_APP_ID must contain digits only")
    if REQUIRE_TOKEN_INTROSPECTION and not BUSINESS_USERNAME:
        reasons.append("IG_BUSINESS_USERNAME is required to pin the expected Instagram account")
    if BUSINESS_ID and not BUSINESS_ID.isdigit():
        reasons.append("IG_BUSINESS_ID must contain digits only")
    if not _GRAPH_VERSION_RE.fullmatch(GRAPH_VERSION):
        reasons.append("IG_GRAPH_VERSION must look like v25.0")
    if source_count == 0:
        reasons.append("enable at least one hashtag, profile, or tagged-media source")
    if len(hashtags) > 30:
        reasons.append("at most 30 enabled hashtags are allowed in Meta's rolling window")
    if INCLUDE_TAGGED_MEDIA and not BUSINESS_USERNAME:
        reasons.append("IG_BUSINESS_USERNAME is required when tagged-media collection is enabled")
    if BUSINESS_USERNAME and not _PROFILE_RE.fullmatch(BUSINESS_USERNAME):
        reasons.append("IG_BUSINESS_USERNAME is invalid")
    return {
        "ready": not reasons,
        "configured": configured,
        "token_introspection_configured": bool(APP_ID and APP_SECRET),
        "token_introspection_required": REQUIRE_TOKEN_INTROSPECTION,
        "required_scopes": list(required_scopes()),
        "token_min_ttl_days": TOKEN_MIN_TTL_DAYS,
        "graph_version": GRAPH_VERSION,
        "enabled_hashtags": len(hashtags),
        "enabled_profiles": len(profiles),
        "tagged_media": INCLUDE_TAGGED_MEDIA,
        "state_path_absolute": Path(STATE_PATH).is_absolute(),
        "reasons": reasons,
    }
