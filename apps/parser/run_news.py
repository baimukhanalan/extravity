#!/usr/bin/env python3
"""Run the curated news RSS intake independently from opportunities."""
from __future__ import annotations

import argparse
import json

from parser.news import run_news_all


def main() -> None:
    parser = argparse.ArgumentParser(description="Extravity news RSS intake")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--source")
    parser.add_argument("--sources")
    args = parser.parse_args()
    result = run_news_all(only=args.source, dry_run=args.dry_run, sources_path=args.sources)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
