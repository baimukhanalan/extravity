"""Preview or join one registry Telegram group without reading its messages."""
from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import asdict
from pathlib import Path

from tgcollect.client import TelegramAuthRequired, build_client, connected_client
from tgcollect.group_join import process_group, registry_groups
from tgcollect.run_lock import acquire as acquire_run_lock


DEFAULT_REGISTRY = Path(__file__).resolve().parent / "telegram-groups.yaml"


async def _process(source, join: bool) -> dict:
    from telethon.tl.functions.channels import JoinChannelRequest
    from telethon.tl.functions.messages import CheckChatInviteRequest, ImportChatInviteRequest

    class Requests:
        pass

    Requests.JoinChannelRequest = JoinChannelRequest
    Requests.CheckChatInviteRequest = CheckChatInviteRequest
    Requests.ImportChatInviteRequest = ImportChatInviteRequest
    with acquire_run_lock():
        client = build_client()
        async with connected_client(client):
            if not await client.is_user_authorized():
                raise TelegramAuthRequired("Telegram session is not authorised")
            return asdict(await process_group(client, source, join=join, request_types=Requests))


def main() -> None:
    parser = argparse.ArgumentParser(description="One-at-a-time Telegram group preview/enrollment")
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--number", type=int, required=True, help="One-based Telegram group row number (1–5)")
    parser.add_argument("--join", action="store_true", help="Request membership; omitted by default")
    parser.add_argument("--confirm-join", action="store_true", help="Required acknowledgement for --join")
    args = parser.parse_args()
    if args.join != args.confirm_join:
        parser.error("--join and --confirm-join must be provided together")
    sources = registry_groups(args.registry)
    if not 1 <= args.number <= len(sources):
        parser.error(f"--number must be between 1 and {len(sources)}")
    result = asyncio.run(_process(sources[args.number - 1], args.join))
    print(json.dumps({"mode": "join" if args.join else "preview", **result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
