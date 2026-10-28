"""Offline sample posts.

Lets the whole extraction stage be demonstrated and graded without Telegram
credentials, without network, and without depending on what some channel
happens to have posted today. The samples are written to cover the cases the
extractor is supposed to handle — and two it is supposed to reject.
"""
from __future__ import annotations

from .config import Channel
from .extract import baseline, content_hash, reference_date

SAMPLE_POSTS: list[dict] = [
    {
        "id": 101,
        "channel": "demo_olymp",
        "date": "2026-02-10T09:00:00+00:00",
        "text": (
            "🏆 Республиканская олимпиада по информатике 2026\n\n"
            "Приглашаем учеников 8–11 классов принять участие в республиканской "
            "олимпиаде по информатике. Отборочный тур пройдёт онлайн, финал — в Астане.\n\n"
            "Участие бесплатное. Победители получают приглашение в сборную страны.\n"
            "Дедлайн подачи заявок: 20 марта\n"
            "Регистрация: https://forms.gle/example123"
        ),
    },
    {
        "id": 102,
        "channel": "demo_it",
        "date": "2026-03-01T12:30:00+00:00",
        "text": (
            "Almaty AI Hackathon 🚀\n"
            "48 часов, команды по 3–4 человека, менторы из индустрии.\n"
            "Место: Алматы, Технопарк\n"
            "Возраст участников: 14-18 лет\n"
            "Взнос: 5 000 ₸ с команды\n"
            "Приём заявок до 15.04.2026\n"
            "Подать заявку: https://example.kz/apply"
        ),
    },
    {
        "id": 103,
        "channel": "demo_volunteer",
        "date": "2026-04-02T08:00:00+00:00",
        "text": (
            "Набор волонтёров в эко-проект «Чистые берега» 🌿\n\n"
            "Ищем школьников, готовых помочь с уборкой прибрежных зон и "
            "образовательными мастер-классами для младших классов. "
            "Выдаём сертификат и волонтёрские часы.\n"
            "Формат: офлайн, Караганда\n"
            "Регистрация до 5 мая\n"
            "https://example.kz/volunteers"
        ),
    },
    {
        "id": 104,
        "channel": "demo_edu",
        "date": "2026-04-20T10:00:00+00:00",
        "text": (
            "Летняя школа по биологии при университете 🧬\n"
            "Две недели лекций и лабораторных для 9-11 класс. Проживание включено.\n"
            "Стоимость: 120 000 тг, есть стипендии для участников из регионов.\n"
            "Срок подачи документов — 1 июня 2026.\n"
            "Подробнее и форма: https://tally.so/r/example"
        ),
    },
    {
        "id": 105,
        "channel": "demo_it",
        "date": "2026-01-15T07:00:00+00:00",
        # Rejected: no signal words, too short — a channel service message.
        "text": "Всем привет! Мы вернулись после каникул 👋",
    },
    {
        "id": 106,
        "channel": "demo_edu",
        "date": "2026-01-20T07:00:00+00:00",
        # Rejected: reads like an ad, not an opportunity with a deadline.
        "text": (
            "Наш телеграм-канал вырос до 10 000 подписчиков! "
            "Спасибо, что вы с нами. Дальше — больше полезного контента."
        ),
    },
]


def run_demo() -> list[dict]:
    """Runs the extraction stage over the samples and returns the candidates."""
    results: list[dict] = []
    for post in SAMPLE_POSTS:
        channel = Channel(username=post["channel"], title=f"Demo · {post['channel']}")
        url = channel.post_url(post["id"])
        item = baseline(
            text=post["text"],
            post_url=url,
            channel_title=channel.display,
            default_category=channel.category,
            today=reference_date(post.get("date")),
        )
        if item is None:
            results.append({"post": post["id"], "skipped": "not an opportunity"})
            continue
        item["contentHash"] = content_hash(channel.username, post["id"], post["text"])
        results.append({"post": post["id"], "candidate": item})
    return results
