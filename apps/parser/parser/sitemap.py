from __future__ import annotations

from urllib.parse import urlparse
from xml.etree import ElementTree


def same_site(url: str, origin: str) -> bool:
    parsed = urlparse(url)
    base = urlparse(origin)
    if base.scheme == "file":
        return parsed.scheme == "file" and parsed.path.startswith(base.path.rsplit("/", 1)[0] + "/")
    return parsed.scheme == "https" and parsed.hostname == base.hostname and parsed.port == base.port


def extract_sitemap(text: str, origin: str) -> tuple[str, list[str]]:
    root = ElementTree.fromstring(text)
    kind = root.tag.rsplit("}", 1)[-1]
    if kind not in {"urlset", "sitemapindex"}:
        raise ValueError("Expected a sitemap urlset or sitemapindex")
    child_name = "url" if kind == "urlset" else "sitemap"
    entries: list[tuple[str, str]] = []
    for child in root:
        if child.tag.rsplit("}", 1)[-1] != child_name:
            continue
        values = {node.tag.rsplit("}", 1)[-1]: (node.text or "").strip() for node in child}
        location = values.get("loc", "")
        if location and same_site(location, origin):
            entries.append((location, values.get("lastmod", "")))
    entries.sort(key=lambda entry: entry[1], reverse=True)
    return kind, list(dict.fromkeys(location for location, _lastmod in entries))
