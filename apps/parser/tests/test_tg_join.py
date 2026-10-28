from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace

from tgcollect.join import join_public_broadcasts, registry_public_handles


def test_packaged_registry_matches_canonical_document():
    parser_root = Path(__file__).resolve().parents[1]
    packaged = registry_public_handles(parser_root / "telegram-registry-public.yaml")
    canonical = registry_public_handles(parser_root.parents[1] / "docs" / "SOURCE-REGISTRY-2026-09-27.md")
    assert len(packaged) == 186
    assert packaged == canonical


def test_registry_extracts_unique_public_handles_not_invites(tmp_path: Path):
    registry = tmp_path / "sources.md"
    registry.write_text(
        "[a](https://t.me/s/Astana_Hub) [again](https://t.me/astana_hub/123) "
        "[b](https://t.me/SomeGroup) [invite](https://t.me/+SecretInvite) "
        "[old invite](https://t.me/joinchat/SecretInvite) "
        "[bot](https://t.me/MyAgent_bot) [private](https://t.me/c/123/456)",
        encoding="utf-8",
    )
    assert registry_public_handles(registry) == ["Astana_Hub", "SomeGroup", "MyAgent_bot"]


def test_join_only_broadcasts_and_respects_batch_limit():
    entities = {
        "already": SimpleNamespace(username="already", broadcast=True),
        "publicone": SimpleNamespace(username="publicone", broadcast=True),
        "somegroup": SimpleNamespace(username="somegroup", broadcast=False),
        "myagent_bot": SimpleNamespace(username="myagent_bot", broadcast=False),
        "publictwo": SimpleNamespace(username="publictwo", broadcast=True),
        "publicthree": SimpleNamespace(username="publicthree", broadcast=True),
    }

    class Client:
        def __init__(self):
            self.requests = []

        async def iter_dialogs(self):
            yield SimpleNamespace(entity=entities["already"])

        async def get_entity(self, handle):
            return entities[handle]

        async def __call__(self, request):
            self.requests.append(request)

    client = Client()
    report = asyncio.run(join_public_broadcasts(
        client,
        ["already", "publicone", "somegroup", "myagent_bot", "publictwo", "publicthree"],
        lambda entity: entity.username,
        max_joins=2,
        pause_seconds=3,
    ))
    assert client.requests == ["publicone", "publictwo"]
    assert report.already_joined == ["already"]
    assert report.non_broadcast == ["somegroup", "myagent_bot"]
    assert report.joined == ["publicone", "publictwo"]
    assert report.remaining == 1
    assert report.stopped == "batch_limit"


def test_flood_wait_stops_without_retrying_or_skipping(monkeypatch):
    class FloodWaitError(Exception):
        seconds = 900

    class Client:
        def __init__(self):
            self.lookups = []

        async def iter_dialogs(self):
            if False:
                yield None

        async def get_entity(self, handle):
            self.lookups.append(handle)
            raise FloodWaitError()

    client = Client()
    report = asyncio.run(join_public_broadcasts(
        client, ["publicone", "publictwo"], lambda entity: entity, pause_seconds=3
    ))
    assert client.lookups == ["publicone"]
    assert report.stopped == "telegram_rate_limit"
    assert report.retry_after_seconds == 900
    assert report.remaining == 2
    assert report.joined == []


def test_source_error_does_not_abort_other_channels():
    class TransientSourceError(Exception):
        pass

    class Client:
        def __init__(self):
            self.requests = []

        async def iter_dialogs(self):
            if False:
                yield None

        async def get_entity(self, handle):
            if handle == "broken":
                raise TransientSourceError()
            return SimpleNamespace(username=handle, broadcast=True)

        async def __call__(self, request):
            self.requests.append(request)

    client = Client()
    report = asyncio.run(join_public_broadcasts(
        client, ["broken", "publicone"], lambda entity: entity.username, pause_seconds=3
    ))
    assert report.failed == ["broken"]
    assert report.joined == ["publicone"]
    assert client.requests == ["publicone"]
