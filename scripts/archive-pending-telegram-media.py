from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import sys
from hashlib import sha256
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
PARSER = ROOT / "apps" / "parser"
POST_URL = re.compile(r"^https://t\.me/([A-Za-z0-9_]{5,32})/([1-9][0-9]*)$")


def keychain(service: str) -> str:
    result = subprocess.run(
        ["security", "find-generic-password", "-s", service, "-a", "extravity", "-w"],
        check=True,
        capture_output=True,
        text=True,
    )
    value = result.stdout.strip()
    if not value:
        raise RuntimeError(f"Keychain value is empty: {service}")
    return value


def configure() -> None:
    load_dotenv(PARSER / ".env", override=False)
    load_dotenv(ROOT / ".env.local", override=False)
    session_path = Path(os.environ.get("TG_SESSION_PATH", ".session/eckz"))
    if not session_path.is_absolute():
        os.environ["TG_SESSION_PATH"] = str((PARSER / session_path).resolve())
    os.environ.setdefault("APP_URL", os.environ.get("NEXT_PUBLIC_APP_URL", "https://extracurriculars-kz.vercel.app"))
    os.environ["MEDIA_STORAGE_BACKEND"] = "telegram_archive"
    os.environ.setdefault("TELEGRAM_MEDIA_BOT_TOKEN", keychain("extravity-telegram-media-bot-token"))
    os.environ.setdefault("TELEGRAM_MEDIA_ARCHIVE_CHAT_ID", keychain("extravity-telegram-media-chat-id"))
    sys.path.insert(0, str(PARSER))


async def archive(manifest: list[dict]) -> dict:
    from parser.telegram_media_archive import upload
    from tgcollect.client import build_client, connected_client, download_media_preview, fetch_edited_post
    from tgcollect.config import Channel, MAX_POST_AGE_DAYS, load_channels

    configured = {channel.username.casefold(): channel for channel in load_channels()}
    results = []
    failures = []
    client = build_client()
    async with connected_client(client):
        if not await client.is_user_authorized():
            raise RuntimeError("Telegram account session is not authorised")
        semaphore = asyncio.Semaphore(3)
        upload_semaphore = asyncio.Semaphore(1)

        async def archive_upload(username: str, post_id_text: str, identity: str, position: int,
                                 content: bytes, mime_type: str) -> dict:
            last_error: Exception | None = None
            for attempt in range(3):
                try:
                    async with upload_semaphore:
                        return await asyncio.to_thread(
                            upload, username, post_id_text, identity, position, content, mime_type,
                        )
                except Exception as error:
                    last_error = error
                    if attempt < 2:
                        await asyncio.sleep(1 + attempt)
            assert last_error is not None
            raise last_error

        async def process(item: dict) -> tuple[str, dict]:
            match = POST_URL.fullmatch(str(item.get("sourceUrl", "")))
            if not match:
                return "failure", {"id": item.get("id"), "reason": "invalid source URL"}
            username, post_id_text = match.groups()
            channel = configured.get(username.casefold(), Channel(username=username))
            async with semaphore:
                try:
                    posts = await fetch_edited_post(client, channel, int(post_id_text), MAX_POST_AGE_DAYS)
                    post = next((post for post in posts if post.get("url") == item["sourceUrl"]), None)
                    if not post:
                        raise RuntimeError("source post is unavailable")
                    descriptors = post.get("media", [])
                    expected = sorted(item.get("media", []), key=lambda media: int(media["position"]))
                    if len(descriptors) != len(expected):
                        raise RuntimeError("source media count changed")
                    archived = []
                    for position, (descriptor, target) in enumerate(zip(descriptors, expected)):
                        identity = str(descriptor.get("platform_media_id", ""))
                        if identity != str(target.get("platformMediaId", "")) or position != int(target.get("position", -1)):
                            raise RuntimeError("source media identity changed")
                        downloaded = await download_media_preview(client, channel, descriptor)
                        if downloaded is None:
                            raise RuntimeError("source media is unavailable")
                        content, mime_type = downloaded
                        if sha256(content).hexdigest() != target.get("checksum"):
                            raise RuntimeError("source media checksum changed")
                        archived.append(await archive_upload(username, post_id_text, identity, position, content, mime_type))
                    return "result", {"id": item["id"], "sourceUrl": item["sourceUrl"], "media": archived}
                except Exception as error:
                    return "failure", {"id": item.get("id"), "sourceUrl": item.get("sourceUrl"), "reason": str(error)[:200]}

        for kind, value in await asyncio.gather(*(process(item) for item in manifest)):
            (results if kind == "result" else failures).append(value)
    return {"archived": results, "failures": failures}


def main() -> None:
    configure()
    value = json.load(sys.stdin)
    if not isinstance(value, list):
        raise RuntimeError("Manifest must be an array")
    print(json.dumps(asyncio.run(archive(value)), ensure_ascii=False))


if __name__ == "__main__":
    main()
