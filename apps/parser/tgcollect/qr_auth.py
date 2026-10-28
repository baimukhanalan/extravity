from __future__ import annotations

import asyncio
import getpass
import os
import secrets
import sys
from pathlib import Path

from .client import build_client
from .config import PAIRING_QR_PATH, SESSION_PATH
from .run_lock import acquire as acquire_run_lock


def _session_file(base: str) -> Path:
    return Path(base if base.endswith(".session") else f"{base}.session")


def _save_qr(url: str) -> Path:
    import qrcode

    image = qrcode.QRCode(border=2)
    image.add_data(url)
    image.make(fit=True)
    path = Path(PAIRING_QR_PATH)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{secrets.token_hex(8)}.tmp")
    try:
        image.make_image(fill_color="black", back_color="white").save(temporary, format="PNG")
        temporary.chmod(0o600)
        os.replace(temporary, path)
        path.chmod(0o600)
    finally:
        temporary.unlink(missing_ok=True)
    return path


def _show_qr(url: str) -> Path:
    if not sys.stdout.isatty():
        raise RuntimeError("QR login requires an interactive terminal")
    path = _save_qr(url)
    import qrcode

    image = qrcode.QRCode(border=2)
    image.add_data(url)
    image.make(fit=True)
    print("Telegram → Settings → Devices → Link Desktop Device. Scan this QR code:", flush=True)
    image.print_ascii(tty=True)
    return path


def _promote_session(new_file: Path, active_file: Path) -> None:
    if not new_file.is_file():
        raise RuntimeError("QR login did not create a session file")
    new_file.chmod(0o600)
    backup = active_file.with_name(f"{active_file.name}.revoked-{secrets.token_hex(8)}")
    moved_old = False
    if active_file.exists():
        os.replace(active_file, backup)
        backup.chmod(0o600)
        moved_old = True
    try:
        os.replace(new_file, active_file)
    except Exception:
        if moved_old and not active_file.exists():
            os.replace(backup, active_file)
        raise
    active_file.chmod(0o600)


async def login_qr() -> str:
    if not sys.stdout.isatty():
        raise RuntimeError("QR login requires an interactive terminal")
    active_file = _session_file(SESSION_PATH)
    replacement_base = f"{SESSION_PATH}.qr-{secrets.token_hex(8)}"
    replacement_file = _session_file(replacement_base)
    qr_image_path: Path | None = None

    with acquire_run_lock():
        try:
            client = build_client(replacement_base)
            try:
                await client.connect()
                qr = await client.qr_login()
                while True:
                    qr_image_path = _show_qr(qr.url)
                    try:
                        me = await qr.wait()
                        break
                    except asyncio.TimeoutError:
                        await qr.recreate()
                    except Exception as error:
                        from telethon.errors import SessionPasswordNeededError

                        if not isinstance(error, SessionPasswordNeededError):
                            raise
                        me = await client.sign_in(password=getpass.getpass("Telegram 2FA password: "))
                        break
            finally:
                await client.disconnect()
            _promote_session(replacement_file, active_file)
        finally:
            if qr_image_path is not None:
                qr_image_path.unlink(missing_ok=True)
            replacement_file.unlink(missing_ok=True)

    return f"@{me.username}" if getattr(me, "username", None) else str(me.id)
