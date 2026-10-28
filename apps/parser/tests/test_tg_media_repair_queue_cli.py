import json
import os
from hashlib import sha256

import pytest

from run_telegram_media_repair_queue import install_request
from tgcollect.media_repair import verify_manifest


def request():
    return {"version": 1, "mode": "verify", "jobs": [{
        "opportunityId": "existing-row", "sourceUrl": "https://t.me/example/42",
        "media": [{"id": "existing-media", "platformMediaId": "photo-1",
                   "position": 0, "checksum": sha256(b"original").hexdigest()}]}]}


def test_installer_creates_atomic_private_signed_request_and_never_overwrites(tmp_path):
    output = tmp_path / "repair-request.json"
    install_request(request(), output=output, volume_root=tmp_path, secret="secret")
    assert output.stat().st_mode & 0o777 == 0o600
    assert verify_manifest(json.loads(output.read_text()), "secret") == request()
    assert not list(tmp_path.glob(".repair-request-*"))
    before = output.read_bytes()
    with pytest.raises(FileExistsError):
        install_request(request(), output=output, volume_root=tmp_path, secret="secret")
    assert output.read_bytes() == before


def test_installer_refuses_nonprivate_or_outside_root(tmp_path):
    private = tmp_path / "private"
    private.mkdir(mode=0o700)
    outside = tmp_path / "outside"
    outside.mkdir(mode=0o700)
    with pytest.raises(ValueError, match="inside the volume root"):
        install_request(request(), output=outside / "request.json", volume_root=private, secret="secret")
    public = private / "public"
    public.mkdir(mode=0o755)
    os.chmod(public, 0o755)
    with pytest.raises(ValueError, match="directory must be private"):
        install_request(request(), output=public / "request.json", volume_root=private, secret="secret")
    assert not (public / "request.json").exists()


def test_installer_refuses_missing_checksum_before_writing(tmp_path):
    payload = request()
    payload["jobs"][0]["media"][0]["checksum"] = None
    with pytest.raises(ValueError, match="SHA-256 checksum"):
        install_request(payload, output=tmp_path / "request.json", volume_root=tmp_path, secret="secret")
    assert not (tmp_path / "request.json").exists()
