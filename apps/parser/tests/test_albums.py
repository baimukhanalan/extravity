"""Album-merging tests — pure, no Telethon."""
from __future__ import annotations

from tgcollect.albums import merge_albums


def test_standalone_messages_pass_through():
    msgs = [
        {"id": 10, "text": "Первый пост", "date": "2026-02-01T00:00:00+00:00", "grouped_id": None},
        {"id": 11, "text": "Второй пост", "date": "2026-02-02T00:00:00+00:00", "grouped_id": None},
    ]
    out = merge_albums(msgs)
    assert [p["id"] for p in out] == [10, 11]


def test_captionless_standalone_is_dropped():
    msgs = [{"id": 5, "text": "", "date": None, "grouped_id": None}]
    assert merge_albums(msgs) == []


def test_album_collapses_to_one_post_keyed_on_first_id():
    # A 3-photo album: caption sits on the middle message, siblings are empty.
    msgs = [
        {"id": 20, "text": "", "date": "2026-03-01T09:00:00+00:00", "grouped_id": 777, "media": [{"platform_media_id": "a"}]},
        {"id": 21, "text": "Хакатон! Дедлайн 5 мая. Регистрация: forms.gle/x", "date": "2026-03-01T09:00:01+00:00", "grouped_id": 777, "media": [{"platform_media_id": "b"}]},
        {"id": 22, "text": "", "date": "2026-03-01T09:00:02+00:00", "grouped_id": 777},
    ]
    out = merge_albums(msgs)
    assert len(out) == 1
    # Permalink points at the album's first message, not the caption's.
    assert out[0]["id"] == 20
    assert "Хакатон" in out[0]["text"]
    assert out[0]["date"] == "2026-03-01T09:00:00+00:00"
    assert [item["platform_media_id"] for item in out[0]["media"]] == ["a", "b"]


def test_album_without_caption_is_dropped():
    msgs = [
        {"id": 30, "text": "", "date": "2026-03-01T00:00:00+00:00", "grouped_id": 888},
        {"id": 31, "text": "", "date": "2026-03-01T00:00:01+00:00", "grouped_id": 888},
    ]
    assert merge_albums(msgs) == []


def test_mixed_albums_and_singles_are_ordered_by_id():
    msgs = [
        {"id": 40, "text": "Одиночный A", "date": None, "grouped_id": None},
        {"id": 41, "text": "Подпись альбома", "date": None, "grouped_id": 999},
        {"id": 42, "text": "", "date": None, "grouped_id": 999},
        {"id": 45, "text": "Одиночный B", "date": None, "grouped_id": None},
    ]
    out = merge_albums(msgs)
    assert [p["id"] for p in out] == [40, 41, 45]  # album keyed on 41 (its first)


def test_two_separate_albums_stay_separate():
    msgs = [
        {"id": 50, "text": "Альбом один", "date": None, "grouped_id": 1},
        {"id": 51, "text": "", "date": None, "grouped_id": 1},
        {"id": 60, "text": "Альбом два", "date": None, "grouped_id": 2},
        {"id": 61, "text": "", "date": None, "grouped_id": 2},
    ]
    out = merge_albums(msgs)
    assert [p["id"] for p in out] == [50, 60]
