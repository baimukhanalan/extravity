from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace

from tgcollect.group_join import GroupSource, process_group, registry_groups


class ChatInvite:
    megagroup = True
    broadcast = False
    channel = True
    participants_count = 103


class ChatInviteAlready:
    chat = SimpleNamespace(megagroup=True, broadcast=False)


class Requests:
    @staticmethod
    def CheckChatInviteRequest(value):
        return ("check", value)

    @staticmethod
    def ImportChatInviteRequest(value):
        return ("join_private", value)

    @staticmethod
    def JoinChannelRequest(value):
        return ("join_public", value)


def test_packaged_registry_preserves_reviewed_groups_and_accepts_expansion():
    path = Path(__file__).resolve().parents[3] / "docs" / "SOURCE-REGISTRY-2026-09-27.md"
    groups = registry_groups(path)
    packaged = registry_groups(Path(__file__).resolve().parents[1] / "telegram-groups.yaml")
    assert len(groups) == 5
    assert [(group.value, group.private_invite) for group in packaged[:5]] == [
        (group.value, group.private_invite) for group in groups
    ]
    assert len(packaged) > len(groups)
    assert [group.private_invite for group in groups] == [False, False, False, True, True]
    assert all(group.value and "https:" not in group.value for group in groups)


def test_private_preview_never_joins():
    class Client:
        def __init__(self):
            self.calls = []

        async def __call__(self, request):
            self.calls.append(request)
            return ChatInvite()

    client = Client()
    source = GroupSource(4, "private", "secretvalue123", True)
    result = asyncio.run(process_group(client, source, join=False, request_types=Requests))
    assert result.status == "available"
    assert result.members == 103
    assert client.calls == [("check", "secretvalue123")]
    assert "secretvalue123" not in repr(result)


def test_private_join_requires_explicit_call_and_checks_type():
    class Client:
        def __init__(self, invite):
            self.invite = invite
            self.calls = []

        async def __call__(self, request):
            self.calls.append(request)
            return self.invite if request[0] == "check" else None

    source = GroupSource(4, "private", "secretvalue123", True)
    client = Client(ChatInvite())
    result = asyncio.run(process_group(client, source, join=True, request_types=Requests))
    assert result.status == "joined"
    assert client.calls == [("check", "secretvalue123"), ("join_private", "secretvalue123")]

    channel = SimpleNamespace(megagroup=False, broadcast=True, channel=True)
    other = Client(channel)
    result = asyncio.run(process_group(other, source, join=True, request_types=Requests))
    assert result.status == "not_group"
    assert other.calls == [("check", "secretvalue123")]


def test_already_joined_private_does_not_join_again():
    class Client:
        def __init__(self):
            self.calls = []

        async def __call__(self, request):
            self.calls.append(request)
            return ChatInviteAlready()

    client = Client()
    result = asyncio.run(process_group(
        client, GroupSource(5, "private", "secretvalue123", True), join=True, request_types=Requests
    ))
    assert result.status == "already_joined"
    assert len(client.calls) == 1


def test_public_broadcast_never_joined():
    class Client:
        async def get_entity(self, username):
            return SimpleNamespace(username=username, broadcast=True, megagroup=False)

        async def __call__(self, request):
            raise AssertionError("unexpected join")

    result = asyncio.run(process_group(
        Client(), GroupSource(1, "group", "somepublic", False), join=True, request_types=Requests
    ))
    assert result.status == "not_group"


def test_flood_wait_stops_one_item_without_join():
    class FloodWaitError(Exception):
        seconds = 600

    class Client:
        async def get_entity(self, username):
            raise FloodWaitError()

    result = asyncio.run(process_group(
        Client(), GroupSource(1, "group", "somepublic", False), join=True, request_types=Requests
    ))
    assert result.status == "rate_limited"
    assert result.retry_after_seconds == 600
