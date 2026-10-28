#!/usr/bin/env python3
"""CLI for consent-based WhatsApp chat-export collection."""
from __future__ import annotations

import argparse
import json
import sys

from wacollect.demo import run_demo
from wacollect.pipeline import WhatsAppUnavailable, bridge_command, run_all
from parser.ingest import require_ingest_target


def main() -> None:
    parser = argparse.ArgumentParser(description="Extravity — WhatsApp export collector")
    parser.add_argument("--demo", action="store_true", help="Parse a bundled export, no files/network")
    parser.add_argument("--chat", help="Run only this allowlisted chat key")
    parser.add_argument("--dry-run", action="store_true", help="Parse and print, do not ingest")
    parser.add_argument("--chats", help="Path to whatsapp-chats.yaml", default=None)
    parser.add_argument("--pair", action="store_true", help="Link this collector by phone-number code")
    parser.add_argument("--pair-qr", action="store_true", help="Link this collector by QR code")
    parser.add_argument(
        "--probe",
        action="store_true",
        help="Verify an existing session without showing a QR or listing chats",
    )
    parser.add_argument("--list-chats", action="store_true", help="List chat IDs after pairing")
    parser.add_argument("--no-sync", action="store_true", help="Parse the last snapshot without connecting")
    args = parser.parse_args()

    if args.demo:
        print(json.dumps(run_demo(), ensure_ascii=False, indent=2))
        return
    try:
        if args.pair:
            bridge_command("pair", args.chats, interactive=True)
            return
        if args.pair_qr:
            bridge_command("pair-qr", args.chats, interactive=True)
            return
        if args.probe:
            bridge_command("probe", args.chats, interactive=True)
            return
        if args.list_chats:
            bridge_command("list", args.chats, interactive=True)
            return
        if not args.dry_run:
            require_ingest_target()
        results = run_all(
            only=args.chat,
            dry_run=args.dry_run,
            chats_path=args.chats,
            sync_linked=not args.no_sync,
        )
    except WhatsAppUnavailable as error:
        print(f"WhatsApp unavailable: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
