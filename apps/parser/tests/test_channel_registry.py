from pathlib import Path
from collections import Counter

from tgcollect.config import load_channels
from tgcollect.extract import CATEGORY_SLUGS


REGISTRY = Path(__file__).resolve().parents[1] / "channels.yaml"
SAT_IELTS_PUBLIC_CHANNELS = {
    "idpieltskazakhstan",
    "ielts_kz",
    "msdc_sat",
    "studywithme_r",
    "unirizz",
    "ainoorsday",
}
WEAK_CATEGORY_MINIMUMS = {
    "bootcamp": 4,
    "mentorship": 1,
    "mun": 6,
    "research": 4,
    "science": 3,
    "social": 3,
    "summer": 3,
    "test-prep": 6,
}


def test_channel_registry_is_unique_and_uses_supported_categories():
    channels = load_channels(str(REGISTRY))
    usernames = [channel.username.casefold() for channel in channels]

    assert len(usernames) == len(set(usernames))
    assert all(channel.category in CATEGORY_SLUGS for channel in channels)
    assert sum(channel.enabled for channel in channels) >= 209


def test_weak_categories_keep_a_minimum_enabled_source_pool():
    counts = Counter(channel.category for channel in load_channels(str(REGISTRY)) if channel.enabled)

    assert all(counts[category] >= minimum for category, minimum in WEAK_CATEGORY_MINIMUMS.items())


def test_sat_ielts_sources_are_explicit_public_broadcast_entries():
    channels = {channel.username: channel for channel in load_channels(str(REGISTRY))}

    assert SAT_IELTS_PUBLIC_CHANNELS <= channels.keys()
    for username in SAT_IELTS_PUBLIC_CHANNELS:
        channel = channels[username]
        assert channel.enabled is True
        assert channel.private_id is None
        assert channel.trusted is False
        assert channel.category == "test-prep"
