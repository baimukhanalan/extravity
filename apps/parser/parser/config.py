"""Configuration and source loading."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent

APP_URL = os.getenv("APP_URL", "http://localhost:3000").rstrip("/")
INGEST_SECRET = os.getenv("PARSER_INGEST_SECRET", "")
ADMIN_TOKEN = os.getenv("PARSER_ADMIN_TOKEN", "")
DEFAULT_RATE_LIMIT_MS = int(os.getenv("DEFAULT_RATE_LIMIT_MS", "2000"))
USER_AGENT = os.getenv(
    "USER_AGENT",
    "Extravity-Parser/1.0 (+https://extracurriculars-kz.vercel.app)",
)

_ENV_RE = re.compile(r"\$\{([A-Z0-9_]+)(?::-([^}]*))?\}")


def _expand(value: str) -> str:
    """Expand ${VAR} and ${VAR:-default} in strings."""
    def repl(m: re.Match) -> str:
        return os.getenv(m.group(1), m.group(2) or "")
    return _ENV_RE.sub(repl, value)


@dataclass
class Source:
    name: str
    type: str  # html | rss | sitemap
    url: str
    organizer: str = "Unknown"
    category: str = "forum"
    enabled: bool = True
    rate_limit_ms: int = field(default=DEFAULT_RATE_LIMIT_MS)
    max_pages: int = 100
    media_hosts: tuple[str, ...] = ()
    media_rights_basis: str | None = None
    media_rights_evidence_url: str | None = None


def load_sources(path: str | None = None) -> list[Source]:
    p = Path(path) if path else ROOT / "sources.yaml"
    data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    out: list[Source] = []
    for raw in data.get("sources", []):
        out.append(
            Source(
                name=raw["name"],
                type=raw.get("type", "html"),
                url=_expand(str(raw["url"])),
                organizer=raw.get("organizer", "Unknown"),
                category=raw.get("category", "forum"),
                enabled=bool(raw.get("enabled", True)),
                rate_limit_ms=int(raw.get("rate_limit_ms", DEFAULT_RATE_LIMIT_MS)),
                max_pages=max(1, min(500, int(raw.get("max_pages", 100)))),
                media_hosts=tuple(str(host).lower().strip() for host in raw.get("media_hosts", []) if str(host).strip())
                if isinstance(raw.get("media_hosts"), list) else (),
                media_rights_basis=raw.get("media_rights_basis"),
                media_rights_evidence_url=raw.get("media_rights_evidence_url"),
            )
        )
    return out
