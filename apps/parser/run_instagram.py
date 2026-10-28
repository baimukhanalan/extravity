#!/usr/bin/env python3
"""CLI for the Instagram Graph API collector.

Offline, no token, no Business account — parses a bundled sample response:

    python run_instagram.py --demo
    python run_instagram.py --demo --no-llm

With credentials (IG_ACCESS_TOKEN + IG_BUSINESS_ID in apps/parser/.env):

    python run_instagram.py --dry-run              # query hashtags, print, ingest nothing
    python run_instagram.py --hashtag олимпиада    # one hashtag
    python run_instagram.py                        # all enabled -> moderation queue

Everything routes through the moderation queue; nothing reaches the catalog
directly. See docs/instagram-and-scraping.md for why this is the Graph API and
not a scraper.
"""
from __future__ import annotations

import argparse
import json
import sys

from igcollect.client import InstagramUnavailable
from igcollect.demo import run_demo
from igcollect.pipeline import preflight, run_all
from parser.ingest import require_ingest_target


def main() -> None:
    ap = argparse.ArgumentParser(description="Extravity — Instagram Graph API collector")
    ap.add_argument("--demo", action="store_true", help="Run on a bundled sample response, no network")
    ap.add_argument("--source", "--hashtag", dest="source", help="Run one hashtag, profile, or 'tagged'")
    ap.add_argument("--dry-run", action="store_true", help="Query and print, do not ingest")
    ap.add_argument("--preflight", action="store_true", help="Verify credentials and every enabled source without ingesting")
    ap.add_argument("--no-llm", action="store_true", help="Skip the model, regex baseline only")
    ap.add_argument("--hashtags", help="Path to hashtags.yaml", default=None)
    args = ap.parse_args()

    if args.demo:
        print(json.dumps(run_demo(use_llm=not args.no_llm), ensure_ascii=False, indent=2))
        return

    try:
        if args.preflight:
            output = preflight(only=args.source, hashtags_path=args.hashtags)
        else:
            if not args.dry_run:
                require_ingest_target()
            output = run_all(
                only=args.source,
                dry_run=args.dry_run,
                use_llm=not args.no_llm,
                hashtags_path=args.hashtags,
            )
    except InstagramUnavailable as e:
        print(f"Instagram unavailable: {e}", file=sys.stderr)
        raise SystemExit(1) from e

    print(json.dumps(output, ensure_ascii=False, indent=2))
    if args.preflight and not output["ready"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
