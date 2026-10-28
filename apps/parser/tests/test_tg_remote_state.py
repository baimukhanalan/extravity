from __future__ import annotations

from types import SimpleNamespace

import pytest

from tgcollect import state


class Response:
    def __init__(self, payload: dict | None = None):
        self.payload = payload or {}

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self.payload


def test_remote_state_roundtrip_uses_string_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TG_STATE_URL", "https://site.example/api/parser/telegram-state")
    monkeypatch.setenv("PARSER_INGEST_SECRET", "secret")
    monkeypatch.setattr(state.httpx, "get", lambda *args, **kwargs: Response({"state": {"channel": "42"}}))
    captured: dict = {}

    def put(*args, **kwargs):
        captured.update(kwargs)
        return Response()

    monkeypatch.setattr(state.httpx, "put", put)
    assert state.load() == {"channel": 42}
    state.save({"channel": 43, "__revision__:channel:43": 2**200})
    assert captured["json"] == {
        "state": {"channel": "43", "__revision__:channel:43": str(2**200)},
    }


def test_remote_state_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TG_STATE_URL", "https://site.example/api/parser/telegram-state")
    monkeypatch.setenv("PARSER_INGEST_SECRET", "secret")

    def failed(*args, **kwargs):
        raise state.httpx.ConnectError("offline")

    monkeypatch.setattr(state.httpx, "get", failed)
    with pytest.raises(RuntimeError, match="unavailable"):
        state.load()
