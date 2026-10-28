"""Preview or join public broadcast channels listed in the source registry."""
from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import asdict
from pathlib import Path

from tgcollect.client import TelegramAuthRequired, build_client, connected_client
from tgcollect.join import join_public_broadcasts, registry_public_handles
from tgcollect.run_lock import acquire as acquire_run_lock


DEFAULT_REGISTRY = Path(__file__).resolve().parent / "telegram-registry-public.yaml"


async def _join(handles: list[str], max_joins: int) -> dict:
    from telethon.tl.functions.channels import JoinChannelRequest

    with acquire_run_lock():
        client = build_client()
        async with connected_client(client):
            if not await client.is_user_authorized():
                raise TelegramAuthRequired("Telegram account session is not authorised")
            return asdict(await join_public_broadcasts(client, handles, JoinChannelRequest, max_joins=max_joins))


def main() -> None:
    parser = argparse.ArgumentParser(description="Public broadcast enrollment from the source registry")
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--join", action="store_true", help="Actually join sequentially; default is an offline preview")
    parser.add_argument("--max-joins", type=int, default=5, help="Join at most this many new channels per run (1–20)")
    args = parser.parse_args()
    handles = registry_public_handles(args.registry)
    if not args.join:
        print(json.dumps({"mode": "preview", "public_handles": len(handles), "handles": handles}, ensure_ascii=False))
        return
    if not 1 <= args.max_joins <= 20:
        parser.error("--max-joins must be between 1 and 20")
    print(json.dumps({"mode": "join", **asyncio.run(_join(handles, args.max_joins))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
