"""Offline sample of a Graph API response.

Lets the Instagram parsing be demonstrated and graded without a Business
account, an app review, or a token. The shape mirrors what
`GET /<hashtag-id>/recent_media` actually returns — a `data` array of media
objects — so the same `to_post()` that handles real responses handles this one.
"""
from __future__ import annotations

from .client import to_post
from .config import Hashtag
from tgcollect.extract import baseline, content_hash, reference_date
from parser.llm_refine import refine

# One field set per object, exactly as MEDIA_FIELDS requests.
SAMPLE_RECENT_MEDIA: dict = {
    "data": [
        {
            "id": "178001",
            "media_type": "IMAGE",
            "permalink": "https://www.instagram.com/p/DEMOaaa111/",
            "timestamp": "2026-02-12T09:00:00+0000",
            "caption": (
                "📣 Открыт приём заявок на олимпиаду по математике для 7–9 классов!\n\n"
                "Отборочный тур — онлайн, финал в Астане. Участие бесплатное.\n"
                "Дедлайн: 25 марта\n"
                "Регистрация по ссылке в шапке профиля: https://forms.gle/mathdemo\n"
                "#олимпиада #математика #школаkz"
            ),
        },
        {
            "id": "178002",
            "media_type": "CAROUSEL_ALBUM",
            "permalink": "https://www.instagram.com/p/DEMObbb222/",
            "timestamp": "2026-03-03T14:30:00+0000",
            "caption": (
                "IT Bootcamp для старшеклассников 💻\n"
                "Три недели интенсива по веб-разработке. Возраст: 15-18 лет.\n"
                "Место: Алматы. Стоимость: 45 000 тг, есть стипендии.\n"
                "Приём заявок до 10.04.2026\n"
                "Подать заявку: https://example.kz/bootcamp"
            ),
        },
        {
            "id": "178003",
            "media_type": "IMAGE",
            "permalink": "https://www.instagram.com/p/DEMOccc333/",
            "timestamp": "2026-01-20T07:00:00+0000",
            # Rejected: a lifestyle post, not an announcement.
            "caption": "Доброе утро! ☀️ Какие планы на выходные? Делитесь в комментариях 👇",
        },
        {
            "id": "178004",
            "media_type": "IMAGE",
            "permalink": "https://www.instagram.com/p/DEMOddd444/",
            "timestamp": "2026-01-25T07:00:00+0000",
            # No caption at all — dropped before parsing.
            "caption": "",
        },
    ]
}


def run_demo(use_llm: bool = False) -> list[dict]:
    """Parses the fixture through the same path as a live response."""
    hashtag = Hashtag(tag="demo", category="forum")
    results: list[dict] = []

    for media in SAMPLE_RECENT_MEDIA["data"]:
        post = to_post(media)
        if post is None:
            results.append({"media": media["id"], "skipped": "no caption"})
            continue

        item = baseline(
            text=post["text"],
            post_url=post["url"],
            channel_title=hashtag.display,
            default_category=hashtag.category,
            today=reference_date(post.get("date")),
        )
        if item is None:
            results.append({"media": media["id"], "skipped": "not an opportunity"})
            continue

        if use_llm:
            item = refine(item, post["text"])
            if item.pop("_rejected_by_llm", False):
                results.append({"media": media["id"], "skipped": "rejected by model"})
                continue

        item["contentHash"] = content_hash("ig:demo", str(media["id"]), post["text"])
        results.append({"media": media["id"], "candidate": item})

    return results
