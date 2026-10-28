"""Optional LLM refinement for sources whose terms permit AI processing.

Telegram collection deliberately never imports this module.
"""
from __future__ import annotations

import json
import logging
import os
import re

import httpx

from tgcollect.extract import CATEGORY_SLUGS, title_is_grounded

log = logging.getLogger("parser.llm_refine")
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")

SYSTEM_PROMPT = """Ты извлекаешь структурированные данные о внеклассной возможности.
Работай только с предоставленным текстом, ничего не выдумывай. Если поля нет —
верни null. Не переводи название. Отвечай только валидным JSON."""

USER_TEMPLATE = """Категории: {categories}

Верни JSON с полями: is_opportunity, title, short_description, category,
organizer, city, format, min_grade, max_grade, price_kzt, requirements, tags,
confidence.

Текст:
---
{text}
---"""


def _extract_json(raw: str) -> dict | None:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-z]*\s*|\s*```$", "", raw)
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        parsed = json.loads(raw[start:end + 1])
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def call_anthropic(text: str, timeout: float = 30.0) -> dict | None:
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        return None
    try:
        response = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": MODEL,
                "max_tokens": 1024,
                "system": SYSTEM_PROMPT,
                "messages": [{
                    "role": "user",
                    "content": USER_TEMPLATE.format(
                        categories=", ".join(CATEGORY_SLUGS), text=text[:6000]
                    ),
                }],
            },
            timeout=timeout,
        )
        if response.status_code >= 300:
            log.warning("Anthropic %s: %s", response.status_code, response.text[:200])
            return None
        content = response.json().get("content") or []
        return _extract_json(content[0].get("text", "")) if content else None
    except Exception as error:  # noqa: BLE001
        log.warning("Anthropic call failed: %s", error)
        return None


def _as_int(value, low: int, high: int) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if low <= number <= high else None


def refine(candidate: dict, text: str, llm: dict | None = None) -> dict:
    """Merge model output into a baseline without replacing literal numbers."""
    data = llm if llm is not None else call_anthropic(text)
    if not data:
        return candidate
    if data.get("is_opportunity") is False:
        return {**candidate, "_rejected_by_llm": True}

    out = dict(candidate)
    title = data.get("title")
    if (
        isinstance(title, str)
        and 3 <= len(title.strip()) <= 300
        and title_is_grounded(title.strip(), text)
    ):
        out["title"] = title.strip()
    short = data.get("short_description")
    if isinstance(short, str) and 10 <= len(short.strip()) <= 500:
        out["shortDescription"] = short.strip()
    category = data.get("category")
    if isinstance(category, str) and category in CATEGORY_SLUGS:
        out["categorySlug"] = category
    organizer = data.get("organizer")
    if isinstance(organizer, str) and 2 <= len(organizer.strip()) <= 200:
        out["organizerName"] = organizer.strip()
    fmt = data.get("format")
    if fmt in ("ONLINE", "OFFLINE", "HYBRID"):
        out["format"] = fmt
    city = data.get("city")
    if isinstance(city, str) and city.strip() and out.get("format") != "ONLINE":
        out["city"] = city.strip()[:100]
    if "minimumGrade" not in out:
        grade = _as_int(data.get("min_grade"), 1, 12)
        if grade:
            out["minimumGrade"] = grade
    if "maximumGrade" not in out:
        grade = _as_int(data.get("max_grade"), 1, 12)
        if grade:
            out["maximumGrade"] = grade
    if "price" not in out:
        price = _as_int(data.get("price_kzt"), 0, 10_000_000)
        if price is not None:
            out["price"] = price
    requirements = data.get("requirements")
    if isinstance(requirements, list):
        out["requirements"] = [str(value)[:200] for value in requirements if str(value).strip()][:30]
    tags = data.get("tags")
    if isinstance(tags, list):
        out["tags"] = [str(value)[:40] for value in tags if str(value).strip()][:20]
    confidence = data.get("confidence")
    if isinstance(confidence, (int, float)) and 0 <= confidence <= 1:
        out["confidence"] = round((float(confidence) + candidate.get("confidence", 0.5)) / 2, 2)
    return out
