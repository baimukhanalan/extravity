from __future__ import annotations

import sys
from types import SimpleNamespace

from tgcollect import client


def test_build_client_uses_string_session_without_touching_disk(monkeypatch):
    captured = {}

    class StringSession:
        def __init__(self, value):
            self.value = value

    def telegram_client(session, api_id, api_hash):
        captured.update(session=session, api_id=api_id, api_hash=api_hash)
        return captured

    monkeypatch.setattr(client, "API_ID", 123)
    monkeypatch.setattr(client, "API_HASH", "hash")
    monkeypatch.setattr(client, "SESSION_STRING", "portable-session")
    monkeypatch.setitem(sys.modules, "telethon", SimpleNamespace(TelegramClient=telegram_client))
    monkeypatch.setitem(sys.modules, "telethon.sessions", SimpleNamespace(StringSession=StringSession))

    result = client.build_client()

    assert result["session"].value == "portable-session"
    assert result["api_id"] == 123
    assert result["api_hash"] == "hash"
