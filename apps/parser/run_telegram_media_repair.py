#!/usr/bin/env python3
"""Prepare a signed repair manifest for existing Telegram candidate media.

Input is a reviewed DB export. Default mode verifies source bytes without
uploading. --upload stores immutable bytes on the Railway volume only; this
command never changes an opportunity or deletes its old media.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from parser.config import INGEST_SECRET
from parser.source_media import backend, storage_readiness
from tgcollect.client import TelegramRetryLater, build_client, connected_client
from tgcollect.media_repair import prepare_repair, sign_manifest, validate_job
from tgcollect.media_spool import MediaSpool
from tgcollect.run_lock import acquire as acquire_run_lock


def _save_private(path: Path, document: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".repair-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            os.fchmod(output.fileno(), 0o600)
            json.dump(document, output, ensure_ascii=False, sort_keys=True, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


async def _run(jobs: list[dict], *, upload: bool, spool: MediaSpool) -> list[dict]:
    # The same session lock as the live collector prevents duplicated MTProto
    # auth keys and simultaneous media reads from one Telegram session.
    with acquire_run_lock():
        client = build_client()
        async with connected_client(client):
            if not await client.is_user_authorized():
                raise RuntimeError("Telegram session is not authorized")
            results = []
            retry_after = None
            for job in jobs:
                if retry_after is not None:
                    results.append({"opportunityId": job["opportunityId"], "sourceUrl": job["sourceUrl"],
                                    "status": "unavailable", "reason": "Telegram retry requested; run later", "media": []})
                    continue
                try:
                    results.append(await prepare_repair(job, client=client, spool=spool, upload=upload))
                except Exception as error:
                    if isinstance(error, TelegramRetryLater):
                        retry_after = error.seconds
                    results.append({"opportunityId": job["opportunityId"], "sourceUrl": job["sourceUrl"],
                                    "status": "failed", "reason": type(error).__name__, "media": [],
                                    **({"retryAfterSeconds": retry_after} if retry_after is not None else {})})
            return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify original Telegram media for existing candidates")
    parser.add_argument("--input", required=True, type=Path, help="Reviewed private JSON export")
    parser.add_argument("--output", required=True, type=Path, help="Private signed repair manifest")
    parser.add_argument("--upload", action="store_true", help="Store verified originals on the configured Railway volume")
    args = parser.parse_args()
    if not INGEST_SECRET:
        parser.error("PARSER_INGEST_SECRET is required to sign the manifest")
    if args.input.resolve() == args.output.resolve():
        parser.error("input and output must differ")
    if args.upload:
        if backend() != "railway_volume":
            parser.error("--upload requires MEDIA_STORAGE_BACKEND=railway_volume")
        if not storage_readiness(INGEST_SECRET)["ready"]:
            parser.error("Railway source-media volume is not ready")
    document = json.loads(args.input.read_text(encoding="utf-8"))
    if not isinstance(document, dict) or document.get("version") != 1 or not isinstance(document.get("jobs"), list):
        parser.error("input must be {version: 1, jobs: [...]} ")
    if len(document["jobs"]) > 500:
        parser.error("at most 500 jobs per batch")
    jobs = [validate_job(job) for job in document["jobs"]]
    if len({job["opportunityId"] for job in jobs}) != len(jobs) or len({job["sourceUrl"] for job in jobs}) != len(jobs):
        parser.error("duplicate opportunity or source URL")
    results = asyncio.run(_run(jobs, upload=args.upload, spool=MediaSpool()))
    manifest = sign_manifest({"version": 1, "mode": "upload" if args.upload else "verify",
                              "generatedAt": datetime.now(timezone.utc).isoformat(),
                              "results": results}, INGEST_SECRET)
    _save_private(args.output, manifest)
    counts = {status: sum(item["status"] == status for item in results)
              for status in ("uploaded", "verified", "unavailable", "failed")}
    print(json.dumps({"output": str(args.output), "counts": counts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
