import httpx
import pytest
from vercel.blob import BlobStoreSuspendedError

from tgcollect.media_circuit import MediaCircuitOpen, MediaUploadCircuit, retryable_storage_error


def http_error(status):
    request = httpx.Request("POST", "https://example.invalid/api/parser/media")
    response = httpx.Response(status, request=request)
    return httpx.HTTPStatusError("storage unavailable", request=request, response=response)


def test_circuit_persists_403_and_bounded_exponential_backoff(tmp_path):
    now = [1000.0]
    circuit = MediaUploadCircuit(tmp_path, clock=lambda: now[0])
    calls = []

    def denied():
        calls.append(now[0])
        raise http_error(403)

    with pytest.raises(httpx.HTTPStatusError):
        circuit.call(denied)
    assert circuit.status()["next_retry_at"] == 1060
    assert circuit.status()["last_reason"] == "HTTP 403"
    assert circuit.path.stat().st_mode & 0o777 == 0o600

    restarted = MediaUploadCircuit(tmp_path, clock=lambda: now[0])
    with pytest.raises(MediaCircuitOpen) as paused:
        restarted.call(denied)
    assert paused.value.remaining_seconds == 60
    assert calls == [1000.0]

    now[0] = 1060.0
    with pytest.raises(httpx.HTTPStatusError):
        restarted.call(denied)
    assert restarted.status()["next_retry_at"] == 1180
    assert restarted.status()["failures"] == 2
    now[0] = 1180.0
    assert restarted.call(lambda: "uploaded") == "uploaded"
    assert restarted.status()["failures"] == 0
    assert restarted.status()["next_retry_at"] == 0


def test_blob_suspended_and_5xx_trip_but_validation_does_not(tmp_path):
    now = [0.0]
    circuit = MediaUploadCircuit(tmp_path, clock=lambda: now[0])
    assert retryable_storage_error(BlobStoreSuspendedError()) == "Blob store suspended"
    assert retryable_storage_error(http_error(500)) == "HTTP 500"
    assert retryable_storage_error(http_error(422)) is None

    with pytest.raises(httpx.HTTPStatusError):
        circuit.call(lambda: (_ for _ in ()).throw(http_error(422)))
    assert circuit.status()["failures"] == 0
    with pytest.raises(BlobStoreSuspendedError):
        circuit.call(lambda: (_ for _ in ()).throw(BlobStoreSuspendedError()))
    assert circuit.status()["failures"] == 1


def test_corrupt_persistent_state_fails_closed(tmp_path):
    circuit = MediaUploadCircuit(tmp_path)
    circuit.path.write_text("not-json", encoding="utf-8")
    calls = []
    with pytest.raises(RuntimeError, match="state is unreadable"):
        circuit.call(lambda: calls.append("uploaded"))
    assert calls == []
