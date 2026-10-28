#!/usr/bin/env python3
"""Install one signed Telegram media-repair request from private stdin JSON."""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

from tgcollect.media_repair import sign_manifest, validate_job


MAX_INPUT_BYTES = 512 * 1024


def install_request(payload: dict, *, output: Path, volume_root: Path, secret: str) -> None:
    if not secret:
        raise ValueError("PARSER_INGEST_SECRET is required")
    if not isinstance(payload, dict) or payload.get("version") != 1 or payload.get("mode") not in ("verify", "upload"):
        raise ValueError("input must contain version 1 and verify or upload mode")
    jobs = payload.get("jobs")
    if not isinstance(jobs, list) or not 1 <= len(jobs) <= 100:
        raise ValueError("input must contain 1-100 jobs")
    reviewed = [validate_job(job) for job in jobs]
    if (len({job["opportunityId"] for job in reviewed}) != len(reviewed)
            or len({job["sourceUrl"] for job in reviewed}) != len(reviewed)):
        raise ValueError("duplicate opportunity or Telegram post")
    root = volume_root.resolve(strict=True)
    if (not volume_root.is_absolute() or volume_root.is_symlink() or not root.is_dir()
            or root.stat().st_mode & 0o077):
        raise ValueError("volume root must be a private absolute directory")
    if not output.is_absolute() or output.is_symlink() or not output.parent.is_dir():
        raise ValueError("output must be a new absolute path in an existing directory")
    parent = output.parent.resolve(strict=True)
    if not parent.is_relative_to(root) or parent.stat().st_mode & 0o077:
        raise ValueError("output directory must be private and inside the volume root")
    if output.exists():
        raise FileExistsError("repair request already exists; preserve its result before another batch")
    document = sign_manifest(payload, secret)
    descriptor, temporary = tempfile.mkstemp(prefix=".repair-request-", dir=parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            os.fchmod(stream.fileno(), 0o600)
            json.dump(document, stream, ensure_ascii=False, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, output)
        directory = os.open(parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Install a signed private Telegram media-repair queue request")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--volume-root", type=Path, default=Path("/data/telegram"))
    args = parser.parse_args(argv)
    if sys.stdin.isatty():
        parser.error("pipe a reviewed JSON request through stdin")
    body = sys.stdin.read(MAX_INPUT_BYTES + 1)
    if len(body.encode("utf-8")) > MAX_INPUT_BYTES:
        parser.error("request exceeds 512 KiB")
    try:
        payload = json.loads(body)
        install_request(payload, output=args.output, volume_root=args.volume_root,
                        secret=os.environ.get("PARSER_INGEST_SECRET", ""))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        parser.error(str(error))
    print("signed repair request installed")


if __name__ == "__main__":
    main()
