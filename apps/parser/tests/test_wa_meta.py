import hashlib
import hmac

from wameta import webhook


def test_signature(monkeypatch):
    monkeypatch.setattr(webhook, "APP_SECRET", "secret")
    raw = b'{"object":"whatsapp_business_account"}'
    signature = "sha256=" + hmac.new(b"secret", raw, hashlib.sha256).hexdigest()
    assert webhook.valid_signature(raw, signature)
    assert not webhook.valid_signature(raw + b"x", signature)


def test_extract_text_and_media_caption():
    payload = {
        "entry": [{"changes": [{"value": {
            "contacts": [{"profile": {"name": "Organizer"}}],
            "messages": [
                {"id": "m1", "timestamp": "1760000000", "type": "text", "text": {"body": "Олимпиада, регистрация до 20 октября https://example.org"}},
                {"id": "m2", "timestamp": "1760000001", "type": "image", "image": {"id": "img1", "caption": "Конкурс для школьников до 1 ноября https://example.org/apply"}},
            ],
        }}]}]
    }
    messages = webhook.extract_messages(payload)
    assert [message["id"] for message in messages] == ["m1", "m2"]
    assert messages[1]["media_id"] == "img1"
