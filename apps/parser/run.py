#!/usr/bin/env python3
"""CLI entrypoint for the parser.

Examples:
    python run.py                     # run all enabled sources -> ingest
    python run.py --dry-run           # extract only, print candidates, no ingest
    python run.py --source "Demo — Sample KZ Opportunities"
"""
from __future__ import annotations

import argparse
import json

from parser.pipeline import run_all
from parser.ingest import require_ingest_target


def main() -> None:
    ap = argparse.ArgumentParser(description="Extravity parser")
    ap.add_argument("--source", help="Run only the source with this name")
    ap.add_argument("--dry-run", action="store_true", help="Extract only, do not ingest")
    ap.add_argument("--no-llm", action="store_true", help="Skip the model pass on pages without schema.org")
    ap.add_argument("--sources", help="Path to sources.yaml", default=None)
    args = ap.parse_args()

    if not args.dry_run:
        require_ingest_target()

    results = run_all(
        only=args.source,
        dry_run=args.dry_run,
        use_llm=not args.no_llm,
        sources_path=args.sources,
    )
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
