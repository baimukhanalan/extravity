"""Local, deterministic classification for the existing Telegram review queue."""
from __future__ import annotations

import json
import sys

from .extract import _explicit_organizer, classify_school_audience


def main() -> None:
    for line in sys.stdin:
        item = json.loads(line)
        body = item.get("text") or ""
        status, evidence = classify_school_audience(body)
        print(json.dumps({
            "id": item["id"],
            "audienceStatus": status,
            "audienceEvidence": evidence,
            "organizerName": _explicit_organizer(body),
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
