"""Merge Telegram album messages into one post.

Telegram sends an album (a "grouped media" post) as several messages that share
a `grouped_id`. Usually only one of them carries the caption; the others are
extra photos. Treating them as separate messages means the caption becomes its
own post while the sibling photos are dropped — and the caption's message id may
sit in the middle of the album, so the permalink points at the wrong photo.

Grouping fixes both: one post per album, keyed on the album's first message id
(the id Telegram uses for the album's permalink), with the caption text.

This is pure and testable — it takes plain dicts, not Telethon objects.
"""
from __future__ import annotations


def merge_albums(messages: list[dict]) -> list[dict]:
    """Collapse album members into one post each.

    `messages` is a list of dicts with keys: id (int), text (str),
    date (str|None), grouped_id (int|None). Returns posts with id/text/date,
    oldest first. Messages without a grouped_id pass through unchanged (minus
    the grouped_id key). Album members are merged: the post takes the smallest
    id and date in the group, and the longest text (the caption).
    """
    groups: dict[int, list[dict]] = {}
    singles: list[dict] = []

    for m in messages:
        gid = m.get("grouped_id")
        if gid is None:
            singles.append(m)
        else:
            groups.setdefault(int(gid), []).append(m)

    merged: list[dict] = []

    for m in singles:
        # A standalone message is a post only if it has text.
        if (m.get("text") or "").strip():
            merged.append({"id": int(m["id"]), "text": m["text"], "date": m.get("date"), "edit_date": m.get("edit_date"), "media": m.get("media", [])})

    for members in groups.values():
        # The album's permalink is its first (smallest id) message.
        first = min(members, key=lambda x: int(x["id"]))
        # The caption is whichever member has the most text.
        caption = max(members, key=lambda x: len((x.get("text") or "")))
        text = (caption.get("text") or "").strip()
        if not text:
            continue  # a captionless album is not an announcement
        dates = [x.get("date") for x in members if x.get("date")]
        edit_dates = [x.get("edit_date") for x in members if x.get("edit_date")]
        merged.append(
            {
                "id": int(first["id"]),
                "text": text,
                "date": min(dates) if dates else None,
                "edit_date": max(edit_dates) if edit_dates else None,
                "media": [media for member in sorted(members, key=lambda x: int(x["id"])) for media in member.get("media", [])],
            }
        )

    merged.sort(key=lambda p: p["id"])
    return merged
