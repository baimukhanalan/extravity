from __future__ import annotations

import asyncio
from contextlib import contextmanager, nullcontext
from pathlib import Path
from types import SimpleNamespace

import pytest

from tgcollect import qr_auth


def test_qr_image_is_private_and_refreshes_with_the_token(monkeypatch, tmp_path):
    path = tmp_path / "telegram-pairing-qr.png"
    monkeypatch.setattr(qr_auth, "PAIRING_QR_PATH", str(path))

    assert qr_auth._save_qr("tg://login?token=first") == path
    first = path.read_bytes()
    assert first.startswith(b"\x89PNG\r\n\x1a\n")
    assert path.stat().st_mode & 0o777 == 0o600

    assert qr_auth._save_qr("tg://login?token=second") == path
    assert path.read_bytes() != first
    assert path.stat().st_mode & 0o777 == 0o600
    assert not list(tmp_path.glob(".*.tmp"))


def test_qr_login_requires_a_terminal(monkeypatch, tmp_path):
    monkeypatch.setattr(qr_auth, "SESSION_PATH", str(tmp_path / "account"))
    monkeypatch.setattr(qr_auth.sys.stdout, "isatty", lambda: False)

    with pytest.raises(RuntimeError, match="interactive terminal"):
        asyncio.run(qr_auth.login_qr())

    assert list(tmp_path.iterdir()) == []


def test_qr_login_promotes_a_fresh_session_and_preserves_the_old_one(monkeypatch, tmp_path):
    active = tmp_path / "account.session"
    active.write_bytes(b"old-session")
    events = []

    @contextmanager
    def locked():
        events.append("lock")
        yield
        events.append("unlock")

    class QR:
        url = "tg://login?token=private"

        async def wait(self):
            events.append("wait")
            return SimpleNamespace(username="owner")

    class Client:
        def __init__(self, base):
            self.path = Path(f"{base}.session")

        async def connect(self):
            events.append("connect")

        async def qr_login(self):
            events.append("qr_login")
            return QR()

        async def disconnect(self):
            events.append("disconnect")
            self.path.write_bytes(b"new-session")

    monkeypatch.setattr(qr_auth, "SESSION_PATH", str(tmp_path / "account"))
    monkeypatch.setattr(qr_auth.sys.stdout, "isatty", lambda: True)
    monkeypatch.setattr(qr_auth, "acquire_run_lock", locked)
    monkeypatch.setattr(qr_auth, "build_client", Client)
    qr_path = tmp_path / "qr.png"

    def show_qr(_url):
        qr_path.write_bytes(b"private-qr")
        events.append("shown")
        return qr_path

    monkeypatch.setattr(qr_auth, "_show_qr", show_qr)

    assert asyncio.run(qr_auth.login_qr()) == "@owner"
    assert active.read_bytes() == b"new-session"
    assert active.stat().st_mode & 0o777 == 0o600
    backups = list(tmp_path.glob("account.session.revoked-*"))
    assert len(backups) == 1
    assert backups[0].read_bytes() == b"old-session"
    assert backups[0].stat().st_mode & 0o777 == 0o600
    assert not list(tmp_path.glob("account.qr-*.session"))
    assert not qr_path.exists()
    assert events == ["lock", "connect", "qr_login", "shown", "wait", "disconnect", "unlock"]


def test_qr_login_failure_preserves_active_session_and_removes_temporary_file(monkeypatch, tmp_path):
    active = tmp_path / "account.session"
    active.write_bytes(b"old-session")

    class QR:
        url = "tg://login?token=private"

        async def wait(self):
            raise ValueError("login failed")

    class Client:
        def __init__(self, base):
            self.path = Path(f"{base}.session")

        async def connect(self):
            return None

        async def qr_login(self):
            return QR()

        async def disconnect(self):
            self.path.write_bytes(b"incomplete-session")

    monkeypatch.setattr(qr_auth, "SESSION_PATH", str(tmp_path / "account"))
    monkeypatch.setattr(qr_auth.sys.stdout, "isatty", lambda: True)
    monkeypatch.setattr(qr_auth, "build_client", Client)
    monkeypatch.setattr(qr_auth, "_show_qr", lambda _url: None)
    monkeypatch.setattr(qr_auth, "acquire_run_lock", nullcontext)

    with pytest.raises(ValueError, match="login failed"):
        asyncio.run(qr_auth.login_qr())

    assert active.read_bytes() == b"old-session"
    assert not list(tmp_path.glob("account.qr-*.session"))


def test_qr_login_refreshes_expired_token(monkeypatch, tmp_path):
    shown = []

    class QR:
        url = "tg://login?token=first"
        calls = 0

        async def wait(self):
            self.calls += 1
            if self.calls == 1:
                raise asyncio.TimeoutError()
            return SimpleNamespace(username="owner")

        async def recreate(self):
            self.url = "tg://login?token=second"

    class Client:
        def __init__(self, base):
            self.path = Path(f"{base}.session")

        async def connect(self):
            return None

        async def qr_login(self):
            return QR()

        async def disconnect(self):
            self.path.write_bytes(b"fresh")

    monkeypatch.setattr(qr_auth, "SESSION_PATH", str(tmp_path / "account"))
    monkeypatch.setattr(qr_auth.sys.stdout, "isatty", lambda: True)
    monkeypatch.setattr(qr_auth, "build_client", Client)
    monkeypatch.setattr(qr_auth, "_show_qr", shown.append)
    monkeypatch.setattr(qr_auth, "acquire_run_lock", nullcontext)

    assert asyncio.run(qr_auth.login_qr()) == "@owner"
    assert shown == ["tg://login?token=first", "tg://login?token=second"]
