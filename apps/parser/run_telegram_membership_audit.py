"""Report configured public Telegram channels missing from the account subscriptions."""
from __future__ import annotations

import asyncio
import json

from tgcollect.client import TelegramAuthRequired, build_client, connected_client
from tgcollect.config import load_channels
from tgcollect.run_lock import acquire as acquire_run_lock


async def audit() -> dict[str, object]:
    configured = {channel.username.casefold(): channel.username for channel in load_channels() if channel.enabled}
    with acquire_run_lock():
        client = build_client()
        async with connected_client(client):
            if not await client.is_user_authorized():
                raise TelegramAuthRequired("Telegram account session is not authorised")
            subscribed = set()
            async for dialog in client.iter_dialogs():
                entity = getattr(dialog, "entity", None)
                if not getattr(entity, "broadcast", False):
                    continue
                username = str(getattr(entity, "username", "") or "").casefold()
                if username:
                    subscribed.add(username)
    missing = [configured[key] for key in configured if key not in subscribed]
    return {"configured": len(configured), "subscribed": len(configured) - len(missing), "missing": missing}


if __name__ == "__main__":
    print(json.dumps(asyncio.run(audit()), ensure_ascii=False))
