"""Offline WhatsApp export fixture."""
from __future__ import annotations

from .config import ChatExport
from .export import parse_export_text
from .pipeline import messages_to_candidates

SAMPLE_EXPORT = """26.09.2026, 09:10 - Messages are end-to-end encrypted.
26.09.2026, 09:15 - Организатор: 🏆 Олимпиада по информатике для 8–11 классов
Открыта регистрация участников. Отбор пройдёт онлайн, участие бесплатное.
Дедлайн подачи заявок: 30 сентября 2026
Регистрация: https://example.kz/apply
26.09.2026, 10:00 - Участник: Спасибо, очень полезно!
"""


def run_demo() -> dict:
    chat = ChatExport(
        key="demo",
        title="Demo WhatsApp source",
        path="unused.txt",
        source_url="https://example.kz/opportunities",
        category="olympiad",
    )
    messages = parse_export_text(SAMPLE_EXPORT, chat_key=chat.key)
    candidates, stats = messages_to_candidates(messages, chat)
    return {**stats, "preview": candidates}
