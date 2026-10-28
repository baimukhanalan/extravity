"""Bounded immutable source-media storage, isolated from collector session and spool."""
from __future__ import annotations

import fcntl
import hmac
import json
import os
import re
import tempfile
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit

import httpx


MIME_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
}
MAX_ASSET_BYTES = 100 * 1024 * 1024
DEFAULT_QUOTA_BYTES = 512 * 1024 * 1024
MAX_QUOTA_BYTES = 10 * 1024 * 1024 * 1024
ID_RE = re.compile(r"^[a-f0-9]{64}$")
MIN_READY_BYTES = 4 * 1024 * 1024
_readiness_lock = threading.Lock()
_readiness_cache: tuple[tuple[str, str, str, bool], float, dict] | None = None


@dataclass(frozen=True)
class AuthenticatedReferences:
    asset_ids: frozenset[str]
    fetched_at: int
    proof: str


def _reference_proof(asset_ids: frozenset[str], fetched_at: int, secret: str) -> str:
    data = f"{fetched_at}:" + ",".join(sorted(asset_ids))
    return hmac.digest(secret.encode(), data.encode(), "sha256").hex()


def fetch_referenced_ids(app_url: str, secret: str) -> AuthenticatedReferences:
    parsed = urlsplit(app_url)
    if not secret or not (parsed.scheme == "https" or parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}):
        raise RuntimeError("Authenticated reference source is not configured")
    response = httpx.get(
        f"{app_url.rstrip('/')}/api/parser/media/references",
        headers={"Authorization": f"Bearer {secret}"},
        timeout=20.0,
        follow_redirects=False,
    )
    if response.status_code != 200:
        raise RuntimeError("Authenticated reference list unavailable")
    try:
        body = response.json()
    except ValueError as error:
        raise RuntimeError("Invalid authenticated reference list") from error
    if not isinstance(body, dict) or body.get("ok") is not True or not isinstance(body.get("assetIds"), list):
        raise RuntimeError("Invalid authenticated reference list")
    ids = body["assetIds"]
    if not ids or len(ids) > 10_000 or any(not isinstance(value, str) or not ID_RE.fullmatch(value) for value in ids) or len(set(ids)) != len(ids):
        raise RuntimeError("Invalid authenticated reference list")
    fetched_at = int(time.time())
    values = frozenset(ids)
    return AuthenticatedReferences(values, fetched_at, _reference_proof(values, fetched_at, secret))


def _checksum_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def backend() -> str:
    value = os.getenv("MEDIA_STORAGE_BACKEND", "vercel_blob").strip().lower()
    if value not in {"vercel_blob", "railway_volume", "telegram_archive"}:
        raise ValueError("Invalid MEDIA_STORAGE_BACKEND")
    return value


def root_path() -> Path:
    raw = os.getenv("SOURCE_MEDIA_ROOT", "")
    if not raw or not Path(raw).is_absolute():
        raise RuntimeError("SOURCE_MEDIA_ROOT must be an explicit absolute path")
    root = Path(raw).resolve()
    from tgcollect.media_spool import default_root as default_spool_root

    spool_root = default_spool_root().resolve()
    if root == spool_root or root in spool_root.parents or spool_root in root.parents:
        raise RuntimeError("SOURCE_MEDIA_ROOT must be separate from Telegram spool")
    for name in ("TG_SESSION_PATH", "TG_STATE_PATH", "WA_SESSION_PATH", "WA_STATE_PATH", "IG_STATE_PATH", "IG_LOCK_PATH"):
        value = os.getenv(name, "")
        if value:
            protected = Path(value).resolve()
            if root == protected or root in protected.parents or protected in root.parents:
                raise RuntimeError("SOURCE_MEDIA_ROOT must be separate from account state")
    return root


def _quota() -> int:
    value = int(os.getenv("SOURCE_MEDIA_MAX_BYTES", str(DEFAULT_QUOTA_BYTES)))
    if value < MAX_ASSET_BYTES or value > MAX_QUOTA_BYTES:
        raise ValueError("SOURCE_MEDIA_MAX_BYTES is outside allowed bounds")
    return value


def _valid_magic(content: bytes, mime_type: str) -> bool:
    if mime_type == "image/jpeg":
        return content.startswith(b"\xff\xd8\xff")
    if mime_type == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if mime_type == "image/webp":
        return content.startswith(b"RIFF") and content[8:12] == b"WEBP"
    if mime_type == "video/mp4":
        return len(content) >= 12 and content[4:8] == b"ftyp"
    return False


def asset_id_for(checksum: str) -> str:
    if not ID_RE.fullmatch(checksum):
        raise ValueError("Invalid source-media identity")
    return checksum


def signature_for(asset_id: str, expires: int, secret: str) -> str:
    if not ID_RE.fullmatch(asset_id) or not secret:
        raise ValueError("Invalid source-media signature input")
    return hmac.digest(secret.encode(), f"{asset_id}:{expires}".encode(), "sha256").hex()


def valid_signature(asset_id: str, expires: str, signature: str, secret: str, *, now: int | None = None) -> bool:
    if not ID_RE.fullmatch(asset_id) or not ID_RE.fullmatch(signature) or not re.fullmatch(r"[0-9]{1,12}", expires):
        return False
    current = int(time.time()) if now is None else now
    deadline = int(expires)
    if deadline < current or deadline > current + 60 or not secret:
        return False
    expected = signature_for(asset_id, deadline, secret)
    return hmac.compare_digest(expected, signature)


class SourceMediaStore:
    def __init__(self, root: Path | str | None = None, *, secret: str, quota_bytes: int | None = None):
        self.root = Path(root) if root is not None else root_path()
        if not self.root.is_absolute():
            raise RuntimeError("Source-media root must be absolute")
        if not secret:
            raise RuntimeError("PARSER_INGEST_SECRET is required")
        self.secret = secret
        self.quota_bytes = _quota() if quota_bytes is None else quota_bytes
        if self.quota_bytes < MAX_ASSET_BYTES:
            raise ValueError("Source-media quota is too small")

    def _prepare(self) -> None:
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(self.root, 0o700)

    @contextmanager
    def _locked(self):
        self._prepare()
        with (self.root / ".quota.lock").open("a+b") as lock:
            os.chmod(self.root / ".quota.lock", 0o600)
            fcntl.flock(lock, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)

    def _used_bytes(self) -> int:
        return sum(
            path.stat().st_size
            for path in self.root.iterdir()
            if path.is_file() and (path.name.endswith(".bin") or path.name.startswith(".asset-"))
        )

    def readiness(self) -> dict:
        try:
            with self._locked():
                descriptor, probe = tempfile.mkstemp(prefix=".probe-", dir=self.root)
                try:
                    with os.fdopen(descriptor, "wb") as output:
                        output.write(b"source-media-fsync-probe")
                        output.flush()
                        os.fsync(output.fileno())
                finally:
                    if os.path.exists(probe):
                        os.unlink(probe)
                directory = os.open(self.root, os.O_RDONLY)
                try:
                    os.fsync(directory)
                finally:
                    os.close(directory)
                used = self._used_bytes()
                stats = os.statvfs(self.root)
                available = stats.f_bavail * stats.f_frsize
                quota_remaining = max(0, self.quota_bytes - used)
        except (OSError, RuntimeError, ValueError):
            return {"backend": "railway_volume", "ready": False, "reason": "source-media storage is unavailable"}
        ready = available >= MIN_READY_BYTES and quota_remaining >= MIN_READY_BYTES
        return {
            "backend": "railway_volume",
            "ready": ready,
            "reason": "ready" if ready else "source-media storage has insufficient free space",
            "filesystemFreeBytes": available,
            "quotaRemainingBytes": quota_remaining,
        }

    def put(self, content: bytes, mime_type: str) -> dict:
        if mime_type not in MIME_EXTENSIONS or not content or len(content) > MAX_ASSET_BYTES or not _valid_magic(content, mime_type):
            raise ValueError("Invalid source-media content")
        checksum = sha256(content).hexdigest()
        asset_id = asset_id_for(checksum)
        metadata = {"assetId": asset_id, "checksum": checksum, "mimeType": mime_type, "sizeBytes": len(content)}
        with self._locked():
            path = self.root / f"{asset_id}.bin"
            manifest = self.root / f"{asset_id}.json"
            if path.exists():
                if path.stat().st_size != len(content) or _checksum_file(path) != checksum:
                    raise RuntimeError("Existing source-media asset differs")
                if manifest.exists() and json.loads(manifest.read_text(encoding="utf-8")) != metadata:
                    raise RuntimeError("Existing source-media metadata differs")
            else:
                if self._used_bytes() + len(content) > self.quota_bytes:
                    raise RuntimeError("Source-media quota exceeded")
                self._atomic_write(path, content)
            if not manifest.exists():
                self._atomic_write(manifest, json.dumps(metadata, separators=(",", ":")).encode())
        return metadata

    def get(self, asset_id: str) -> tuple[Path, dict]:
        if not ID_RE.fullmatch(asset_id):
            raise FileNotFoundError("Invalid source-media asset")
        path = self.root / f"{asset_id}.bin"
        manifest = self.root / f"{asset_id}.json"
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
            if data.get("assetId") != asset_id or data.get("mimeType") not in MIME_EXTENSIONS:
                raise FileNotFoundError("Invalid source-media metadata")
            if not ID_RE.fullmatch(data.get("checksum", "")) or asset_id_for(data["checksum"]) != asset_id:
                raise FileNotFoundError("Invalid source-media checksum")
            expected_size = data.get("sizeBytes")
            if not isinstance(expected_size, int) or expected_size <= 0 or expected_size > MAX_ASSET_BYTES or path.stat().st_size != expected_size:
                raise FileNotFoundError("Invalid source-media size")
            if _checksum_file(path) != data["checksum"]:
                raise FileNotFoundError("Invalid source-media content checksum")
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
            raise FileNotFoundError("Source-media asset not found") from error
        return path, data

    def prune_unreferenced(
        self,
        referenced_ids: AuthenticatedReferences,
        min_age_days: int = 7,
        *,
        dry_run: bool = True,
        now: int | None = None,
    ) -> dict:
        current = int(time.time()) if now is None else now
        if not isinstance(referenced_ids, AuthenticatedReferences):
            raise ValueError("Authenticated DB reference list required")
        if min_age_days < 7 or min_age_days > 365:
            raise ValueError("Invalid source-media retention period")
        if referenced_ids.fetched_at > current or current - referenced_ids.fetched_at > 300:
            raise ValueError("Authenticated DB reference list is stale")
        if not hmac.compare_digest(
            referenced_ids.proof,
            _reference_proof(referenced_ids.asset_ids, referenced_ids.fetched_at, self.secret),
        ):
            raise ValueError("Authenticated DB reference list proof is invalid")
        cutoff = current - min_age_days * 86400
        eligible: list[str] = []
        reclaimed = 0
        with self._locked():
            for manifest in sorted(self.root.glob("*.json")):
                asset_id = manifest.stem
                if not ID_RE.fullmatch(asset_id) or asset_id in referenced_ids.asset_ids:
                    continue
                path = self.root / f"{asset_id}.bin"
                if not path.is_file() or max(path.stat().st_mtime, manifest.stat().st_mtime) > cutoff:
                    continue
                try:
                    self.get(asset_id)
                except FileNotFoundError:
                    continue
                eligible.append(asset_id)
                reclaimed += path.stat().st_size
                if not dry_run:
                    path.unlink()
                    manifest.unlink()
            if not dry_run and eligible:
                directory = os.open(self.root, os.O_RDONLY)
                try:
                    os.fsync(directory)
                finally:
                    os.close(directory)
        return {"dryRun": dry_run, "eligible": len(eligible), "deleted": 0 if dry_run else len(eligible), "bytes": reclaimed, "assetIds": eligible}

    def _atomic_write(self, path: Path, data: bytes) -> None:
        descriptor, temporary = tempfile.mkstemp(prefix=".asset-", dir=self.root)
        try:
            with os.fdopen(descriptor, "wb") as output:
                os.fchmod(output.fileno(), 0o600)
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, path)
            directory = os.open(self.root, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)


def storage_readiness(secret: str, *, cached: bool = False) -> dict:
    global _readiness_cache
    try:
        selected = backend()
    except ValueError:
        return {"backend": "invalid", "ready": False, "reason": "invalid source-media backend"}
    if selected == "telegram_archive":
        from .telegram_media_archive import readiness

        return readiness()
    if selected != "railway_volume":
        return {"backend": selected, "ready": True, "reason": "site-managed media storage"}
    key = (selected, os.getenv("SOURCE_MEDIA_ROOT", ""), os.getenv("SOURCE_MEDIA_MAX_BYTES", ""), bool(secret))
    with _readiness_lock:
        if cached and _readiness_cache and _readiness_cache[0] == key and time.monotonic() - _readiness_cache[1] < 30:
            return dict(_readiness_cache[2])
        try:
            result = SourceMediaStore(secret=secret).readiness()
        except (RuntimeError, ValueError):
            result = {"backend": selected, "ready": False, "reason": "source-media storage is not configured"}
        _readiness_cache = (key, time.monotonic(), result)
        return dict(result)
