#!/usr/bin/env python3
"""CLI for the Telegram (MTProto) collector.

One-time setup, run by the account owner in their own terminal:

    python run_telegram.py --login       # asks for phone + code from Telegram

Then:

    python run_telegram.py --dry-run                 # parse, print, ingest nothing
    python run_telegram.py --channel some_channel    # one channel
    python run_telegram.py                           # all enabled -> moderation queue
    python run_telegram.py --demo                    # offline sample posts, no Telegram

Nothing here publishes to the catalog: every candidate lands in moderation.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys

from tgcollect.client import TelegramUnavailable
from tgcollect.config import Channel, credentials_ready
from tgcollect.demo import run_demo
from tgcollect.pipeline import login, run_all
from parser.ingest import require_ingest_target


def main() -> None:
    ap = argparse.ArgumentParser(description="Extravity — Telegram collector")
    login_options = ap.add_mutually_exclusive_group()
    login_options.add_argument("--login", action="store_true", help="Authorise the account once (interactive)")
    login_options.add_argument("--login-qr", action="store_true", help="Authorise with a QR code in an interactive terminal")
    ap.add_argument("--channel", help="Run only this channel (@name or name)")
    ap.add_argument("--dry-run", action="store_true", help="Parse and print, do not ingest")
    ap.add_argument("--subscribed", action="store_true", help="Collect subscribed public broadcast channels")
    ap.add_argument("--max-batches", type=int, default=30, help="Maximum batches per channel for subscribed ingest (1-100)")
    ap.add_argument("--demo", action="store_true", help="Run on bundled sample posts, no network")
    ap.add_argument("--channels", help="Path to channels.yaml", default=None)
    args = ap.parse_args()

    if args.demo:
        print(json.dumps(run_demo(), ensure_ascii=False, indent=2))
        return

    if args.login or args.login_qr:
        if not credentials_ready():
            print(
                "TG_API_ID / TG_API_HASH are not set.\n"
                "Get them at https://my.telegram.org → API development tools, "
                "then put them in apps/parser/.env",
                file=sys.stderr,
            )
            raise SystemExit(2)
        if args.login_qr:
            from tgcollect.qr_auth import login_qr

            who = asyncio.run(login_qr())
        else:
            who = asyncio.run(login())
        print(f"Authorised as {who}. The session is stored locally — keep it private.")
        return

    if not args.dry_run:
        require_ingest_target()

    try:
        results = asyncio.run(
            run_all(
                only=args.channel,
                dry_run=args.dry_run,
                channels_path=args.channels,
                subscribed=args.subscribed,
                max_batches_per_channel=args.max_batches,
            )
        )
    except TelegramUnavailable as e:
        print(f"Telegram unavailable: {e}", file=sys.stderr)
        raise SystemExit(1) from e

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
