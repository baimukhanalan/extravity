"""Crash-safe local staging for public Telegram candidate media.

The spool is not a publication queue. A candidate can leave it only after all
original media uploaded and the ingest endpoint acknowledged the candidate.
Keep its root on the same persistent volume as the Telegram session and state.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Any, Callable


MAX_MEDIA_BYTES = 100 * 1024 * 1024
MAX_CANDIDATE_BYTES = 256 * 1024 * 1024
MAX_SPOOL_BYTES = 1024 * 1024 * 1024
SUPPORTED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "video/mp4"}


@dataclass(frozen=True)
class StagedMedia:
    platform_media_id: str
    position: int
    mime_type: str
    checksum: str
    size_bytes: int
    content: bytes


@dataclass(frozen=True)
class StagedCandidate:
    key: str
    candidate: dict[str, Any]
    media: tuple[StagedMedia, ...]
    expected_media_count: int

    @property
    def complete(self) -> bool:
        return len(self.media) == self.expected_media_count


def default_root() -> Path:
    configured = os.getenv("TG_MEDIA_SPOOL_PATH")
    if configured:
        return Path(configured)
    state_path = Path(os.getenv("TG_STATE_PATH", str(Path(__file__).resolve().parents[1] / ".state" / "telegram.json")))
    return state_path.parent / "media-spool"


class MediaSpool:
    def __init__(self, root: Path | str | None = None):
        self.root = Path(root) if root is not None else default_root()

    def _prepare_root(self) -> None:
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(self.root, 0o700)

    @staticmethod
    def key_for(channel: str, post_id: int) -> str:
        if not re.fullmatch(r"[A-Za-z0-9_]{1,32}", channel) or channel.casefold().startswith("c_") or post_id <= 0:
            raise ValueError("invalid Telegram source identity")
        return sha256(f"{channel.casefold()}\0{post_id}".encode("utf-8")).hexdigest()

    def stage(
        self,
        *,
        channel: str,
        post_id: int,
        candidate: dict[str, Any],
        media: list[tuple[str, int, bytes, str]],
        expected_media_count: int,
    ) -> str:
        """Atomically replace one candidate snapshot; callers retry partial media."""
        key = self.key_for(channel, post_id)
        if expected_media_count < 0 or expected_media_count > 10 or len(media) > expected_media_count:
            raise ValueError("invalid media count")
        if "media" in candidate and candidate["media"]:
            raise ValueError("candidate must not contain uploaded media")
        if candidate.get("sourceUrl") != f"https://t.me/{channel}/{post_id}":
            raise ValueError("candidate source URL mismatch")
        self._prepare_root()
        self._recover(key)
        total_bytes = sum(len(item[2]) for item in media)
        if total_bytes > MAX_CANDIDATE_BYTES or self._disk_usage() + total_bytes > MAX_SPOOL_BYTES:
            raise ValueError("Telegram media spool is full")
        staged_dir = Path(tempfile.mkdtemp(prefix=".staging-", dir=self.root))
        os.chmod(staged_dir, 0o700)
        try:
            files = []
            total = 0
            positions: set[int] = set()
            for platform_media_id, position, content, mime_type in media:
                if not platform_media_id or position < 0 or position >= expected_media_count or position in positions:
                    raise ValueError("invalid or duplicate media identity")
                if mime_type not in SUPPORTED_MIME_TYPES or not content or len(content) > MAX_MEDIA_BYTES:
                    raise ValueError("invalid media content")
                positions.add(position)
                total += len(content)
                if total > MAX_CANDIDATE_BYTES:
                    raise ValueError("candidate exceeds spool size limit")
                filename = f"{position}.bin"
                digest = sha256(content).hexdigest()
                self._write_fsynced(staged_dir / filename, content)
                files.append({
                    "platform_media_id": platform_media_id,
                    "position": position,
                    "mime_type": mime_type,
                    "checksum": digest,
                    "size_bytes": len(content),
                    "filename": filename,
                })
            manifest = {
                "version": 1,
                "channel": channel,
                "post_id": post_id,
                "candidate": candidate,
                "expected_media_count": expected_media_count,
                "media": files,
            }
            self._write_fsynced(staged_dir / "manifest.json", json.dumps(manifest, ensure_ascii=False).encode("utf-8"))
            self._fsync_directory(staged_dir)
            target = self.root / key
            if target.exists():
                old = self.root / f".old-{key}"
                if old.exists():
                    shutil.rmtree(old)
                os.replace(target, old)
                try:
                    os.replace(staged_dir, target)
                except BaseException:
                    os.replace(old, target)
                    raise
                shutil.rmtree(old)
            else:
                os.replace(staged_dir, target)
            self._fsync_directory(self.root)
            return key
        finally:
            if staged_dir.exists():
                shutil.rmtree(staged_dir)

    def load(self, key: str) -> StagedCandidate:
        if len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
            raise ValueError("invalid spool key")
        self._recover(key)
        folder = self.root / key
        manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
        if manifest.get("version") != 1 or self.key_for(manifest["channel"], manifest["post_id"]) != key:
            raise ValueError("spool identity mismatch")
        expected = int(manifest["expected_media_count"])
        if expected < 0 or expected > 10:
            raise ValueError("invalid media count")
        loaded = []
        positions: set[int] = set()
        for item in manifest["media"]:
            position = int(item["position"])
            if position < 0 or position >= expected or position in positions or item["filename"] != f"{position}.bin":
                raise ValueError("invalid media entry")
            positions.add(position)
            content = (folder / item["filename"]).read_bytes()
            if len(content) != item["size_bytes"] or sha256(content).hexdigest() != item["checksum"]:
                raise ValueError("spooled media checksum mismatch")
            loaded.append(StagedMedia(item["platform_media_id"], position, item["mime_type"], item["checksum"], len(content), content))
        return StagedCandidate(key, manifest["candidate"], tuple(sorted(loaded, key=lambda m: m.position)), expected)

    def pending_keys(self) -> list[str]:
        if not self.root.exists():
            return []
        for path in self.root.iterdir():
            if path.is_dir() and path.name.startswith(".old-"):
                self._recover(path.name.removeprefix(".old-"))
        return sorted(path.name for path in self.root.iterdir() if path.is_dir() and len(path.name) == 64 and all(c in "0123456789abcdef" for c in path.name))

    def pending_for(self, channel: str) -> list[str]:
        return [key for key in self.pending_keys()
                if self.load(key).candidate.get("sourceUrl", "").startswith(f"https://t.me/{channel}/")]

    def acknowledge(self, key: str) -> None:
        """Call only after the complete candidate receives an ingest acknowledgement."""
        if not self.load(key).complete:
            raise ValueError("cannot acknowledge incomplete candidate media")
        target = self.root / key
        tombstone = self.root / f".ack-{key}"
        os.replace(target, tombstone)
        self._fsync_directory(self.root)
        shutil.rmtree(tombstone)

    def _recover(self, key: str) -> None:
        if len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
            return
        target = self.root / key
        old = self.root / f".old-{key}"
        if not old.exists():
            return
        if target.exists():
            shutil.rmtree(old)
        else:
            os.replace(old, target)
        self._fsync_directory(self.root)

    def _disk_usage(self) -> int:
        return sum(path.stat().st_size for path in self.root.rglob("*") if path.is_file())

    @staticmethod
    def _write_fsynced(path: Path, content: bytes) -> None:
        with path.open("xb") as output:
            os.chmod(path, 0o600)
            output.write(content)
            output.flush()
            os.fsync(output.fileno())

    @staticmethod
    def _fsync_directory(path: Path) -> None:
        descriptor = os.open(path, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def replay_complete(
    spool: MediaSpool,
    post_media: Callable[..., dict[str, Any]],
    post_candidates: Callable[..., dict[str, Any]],
    channel_filter: str | None = None,
) -> dict[str, int]:
    """Retry staged candidates; keep every failed or partial item for next run."""
    result = {"pending": 0, "incomplete": 0, "ingested": 0, "failed": 0}
    for key in spool.pending_keys():
        try:
            staged = spool.load(key)
            source_url = staged.candidate.get("sourceUrl", "")
            if not isinstance(source_url, str) or not source_url.startswith("https://t.me/"):
                raise ValueError("spooled candidate has invalid Telegram source URL")
            channel = source_url.removeprefix("https://t.me/").split("/", 1)[0]
            if channel_filter is not None and channel.casefold() != channel_filter.casefold():
                continue
            result["pending"] += 1
            if not staged.complete:
                result["incomplete"] += 1
                continue
            post_id = int(source_url.rsplit("/", 1)[-1])
            if MediaSpool.key_for(channel, post_id) != key:
                raise ValueError("spooled candidate source identity mismatch")
            item = dict(staged.candidate)
            from .extract import _explicit_organizer, classify_school_audience, schema_safe_title
            item["title"] = schema_safe_title(str(item.get("title", "")))
            for field, limit in (("shortDescription", 450), ("fullDescription", 7800), ("organizerName", 180)):
                if isinstance(item.get(field), str):
                    item[field] = schema_safe_title(item[field], limit)
            body = item.get("fullDescription") or item.get("shortDescription") or ""
            if body:
                item["audienceStatus"], evidence = classify_school_audience(body)
                if evidence:
                    item["audienceEvidence"] = evidence
                explicit_organizer = _explicit_organizer(body)
                if explicit_organizer:
                    item["organizerName"] = explicit_organizer
                    item["organizerEvidence"] = "SOURCE_TEXT"
                else:
                    item["organizerEvidence"] = "SOURCE_CHANNEL_UNVERIFIED"
            item["media"] = [
                post_media(channel, post_id, media.platform_media_id, media.position, media.content, media.mime_type)
                for media in staged.media
            ]
            response = post_candidates(
                source_name=f"Telegram: {channel}",
                source_type="telegram",
                source_url=f"https://t.me/{channel}",
                items=[item],
            )
            if int(response.get("failed", 0) or 0) != 0:
                raise RuntimeError("candidate ingest failed")
            spool.acknowledge(key)
            result["ingested"] += 1
        except Exception as error:
            result["failed"] += 1
            from .media_circuit import MediaCircuitOpen
            if isinstance(error, MediaCircuitOpen):
                break
    return result
