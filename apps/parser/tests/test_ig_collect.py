"""Instagram Graph API collector tests.

Entirely offline: they drive the bundled sample response, never the network.
Parsing itself is covered by test_tg_extract.py — the collector reuses that
extractor — so here we test what is specific to Instagram: the response shape,
timestamp handling, and the run-on-fixture path.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from igcollect import client, pipeline
from igcollect.client import InstagramUnavailable, to_post
from igcollect.config import Hashtag, load_hashtags, load_profiles, readiness
from igcollect.demo import SAMPLE_RECENT_MEDIA, run_demo
from igcollect.pipeline import preflight_report
from igcollect import state as instagram_state
from tgcollect.extract import reference_date


class TestToPost:
    def test_maps_a_media_object(self):
        media = SAMPLE_RECENT_MEDIA["data"][0]
        post = to_post(media)
        assert post is not None
        assert post["url"] == media["permalink"]
        assert post["text"] == media["caption"]
        assert post["date"] == media["timestamp"]


    def test_instagram_expired_deadline_is_flagged_before_ingest(self):
        post = {
            "id": "old-post", "date": "2020-09-20T09:00:00+0000",
            "url": "https://www.instagram.com/p/old-post/",
            "text": "Youth Science Olympiad registration is open for school students. "
                    "Deadline: September 30, 2020. Apply now: https://example.kz/apply",
            "media": [],
        }
        candidates, stats = pipeline.posts_to_candidates([post], Hashtag(tag="science", category="olympiad"), use_llm=False)
        assert stats["candidates"] == 1
        assert candidates[0]["_expired"] is True

    def test_drops_media_without_a_caption(self):
        assert to_post({"id": "1", "permalink": "https://x", "caption": ""}) is None

    def test_drops_media_without_a_permalink(self):
        assert to_post({"id": "1", "caption": "текст", "permalink": None}) is None

    def test_drops_media_without_an_id_so_retries_remain_idempotent(self):
        assert to_post({"caption": "текст", "permalink": "https://www.instagram.com/p/x/"}) is None

    def test_skips_carousel_children_without_a_stable_media_id(self):
        post = to_post({
            "id": "parent",
            "caption": "Конкурс. Регистрация до 25 декабря 2026",
            "permalink": "https://www.instagram.com/p/carousel/",
            "children": {"data": [
                {"media_type": "IMAGE", "media_url": "https://cdn.test/no-id.jpg"},
                {"id": "stable", "media_type": "IMAGE", "media_url": "https://cdn.test/stable.jpg"},
            ]},
        })
        assert post is not None
        assert [item["platform_media_id"] for item in post["media"]] == ["stable"]
        assert post["media_incomplete"] is True

    @pytest.mark.parametrize("children", [
        {"data": [{"id": str(index), "media_type": "IMAGE", "media_url": f"https://cdn.test/{index}.jpg"} for index in range(11)]},
        {"data": [{"id": "first", "media_type": "IMAGE", "media_url": "https://cdn.test/first.jpg"}], "paging": {"next": "https://graph.facebook.com/next"}},
        {"data": [{"id": "first", "media_type": "IMAGE", "thumbnail_url": "https://cdn.test/thumbnail.jpg"}]},
    ])
    def test_incomplete_carousel_is_marked_for_hold(self, children):
        post = to_post({
            "id": "parent", "caption": "Конкурс для школьников. Дедлайн 25 декабря 2026",
            "permalink": "https://www.instagram.com/p/carousel/", "media_type": "CAROUSEL_ALBUM",
            "children": children,
        })
        assert post is not None
        assert post["media_incomplete"] is True

    def test_maps_every_carousel_child_in_order(self):
        post = to_post({
            "id": "parent",
            "caption": "Конкурс. Регистрация до 25 декабря 2026",
            "permalink": "https://www.instagram.com/p/carousel/",
            "media_type": "CAROUSEL_ALBUM",
            "children": {"data": [
                {"id": "image", "media_type": "IMAGE", "media_url": "https://cdn.test/a.jpg"},
                {
                    "id": "video",
                    "media_type": "VIDEO",
                    "media_url": "https://cdn.test/b.mp4",
                    "thumbnail_url": "https://cdn.test/b.jpg",
                },
            ]},
        })
        assert post is not None
        assert [item["platform_media_id"] for item in post["media"]] == ["image", "video"]
        assert [item["kind"] for item in post["media"]] == ["IMAGE", "VIDEO"]


class TestPagination:
    def test_collects_multiple_graph_pages(self, monkeypatch):
        pages = {
            "https://graph.facebook.com/next-2": {
                "data": [{"id": "2"}],
                "paging": {"next": "https://graph.facebook.com/next-3"},
            },
            "https://graph.facebook.com/next-3": {"data": [{"id": "3"}]},
        }
        monkeypatch.setattr(client, "_get_next", lambda url: pages[url])
        result = client._paged_connection({
            "data": [{"id": "1"}],
            "paging": {"next": "https://graph.facebook.com/next-2"},
        })
        assert [item["id"] for item in result] == ["1", "2", "3"]

    def test_rejects_pagination_away_from_graph_host(self):
        with pytest.raises(InstagramUnavailable, match="invalid pagination URL"):
            client._get_next("https://attacker.example/steal-token")

    def test_pagination_never_reuses_token_from_next_url(self):
        cleaned = client._sanitize_next_url(
            "https://graph.facebook.com/v25.0/edge?after=cursor&access_token=stale-secret"
        )
        assert "after=cursor" in cleaned
        assert "access_token" not in cleaned
        assert "stale-secret" not in cleaned


class TestCredentialPreflight:
    def test_validates_the_expected_business_account(self, monkeypatch):
        monkeypatch.setattr(client, "ACCESS_TOKEN", "token")
        monkeypatch.setattr(client, "BUSINESS_ID", "123")
        monkeypatch.setattr(client, "_credential_cache", None)
        monkeypatch.setattr(client, "inspect_access_token", lambda: {
            "verified": True,
            "scopes": ["instagram_basic", "pages_read_engagement"],
            "expires_at": 2_000_000_000,
            "data_access_expires_at": 2_000_000_000,
        })
        monkeypatch.setattr(
            client,
            "_get",
            lambda path, params: {"id": path, "username": "extravity", "account_type": "BUSINESS"},
        )
        identity = client.validate_credentials(force=True)
        assert identity == {
            "id": "123",
            "username": "extravity",
            "account_type": "BUSINESS",
            "token_verified": True,
            "token_scopes": ["instagram_basic", "pages_read_engagement"],
            "token_expires_at": 2_000_000_000,
            "data_access_expires_at": 2_000_000_000,
            "token_expires_in_days": None,
            "data_access_expires_in_days": None,
        }

    def test_rejects_a_mismatched_account(self, monkeypatch):
        monkeypatch.setattr(client, "ACCESS_TOKEN", "token")
        monkeypatch.setattr(client, "BUSINESS_ID", "123")
        monkeypatch.setattr(client, "_credential_cache", None)
        monkeypatch.setattr(client, "inspect_access_token", lambda: {
            "verified": True, "scopes": [], "expires_at": None, "data_access_expires_at": None,
        })
        monkeypatch.setattr(client, "_get", lambda _path, _params: {"id": "456"})
        with pytest.raises(InstagramUnavailable, match="different business account"):
            client.validate_credentials(force=True)

    def test_rejects_a_non_numeric_business_id_before_network(self, monkeypatch):
        monkeypatch.setattr(client, "ACCESS_TOKEN", "token")
        monkeypatch.setattr(client, "BUSINESS_ID", "../../other-edge")
        monkeypatch.setattr(client, "_credential_cache", None)
        monkeypatch.setattr(client, "_get", lambda *_args, **_kwargs: pytest.fail("must not call Graph"))
        with pytest.raises(InstagramUnavailable, match="digits only"):
            client.validate_credentials(force=True)

    def test_rejects_a_non_professional_account(self, monkeypatch):
        monkeypatch.setattr(client, "ACCESS_TOKEN", "token")
        monkeypatch.setattr(client, "BUSINESS_ID", "123")
        monkeypatch.setattr(client, "_credential_cache", None)
        monkeypatch.setattr(client, "inspect_access_token", lambda: {
            "verified": True, "scopes": [], "expires_at": None, "data_access_expires_at": None,
        })
        monkeypatch.setattr(
            client,
            "_get",
            lambda path, params: {"id": path, "username": "personal", "account_type": "PERSONAL"},
        )
        with pytest.raises(InstagramUnavailable, match="Business or Creator"):
            client.validate_credentials(force=True)

    def test_rejects_unexpected_instagram_username(self, monkeypatch):
        monkeypatch.setattr(client, "ACCESS_TOKEN", "token")
        monkeypatch.setattr(client, "BUSINESS_ID", "123")
        monkeypatch.setattr(client, "BUSINESS_USERNAME", "extravity")
        monkeypatch.setattr(client, "_credential_cache", None)
        monkeypatch.setattr(client, "inspect_access_token", lambda: {
            "verified": True, "scopes": [], "expires_at": None, "data_access_expires_at": None,
        })
        monkeypatch.setattr(
            client,
            "_get",
            lambda path, params: {"id": path, "username": "another_account", "account_type": "BUSINESS"},
        )
        with pytest.raises(InstagramUnavailable, match="different Instagram username"):
            client.validate_credentials(force=True)


class TestTokenIntrospection:
    def _configure(self, monkeypatch):
        monkeypatch.setattr(client, "ACCESS_TOKEN", "instagram-token")
        monkeypatch.setattr(client, "APP_ID", "12345")
        monkeypatch.setattr(client, "APP_SECRET", "meta-secret")
        monkeypatch.setattr(client, "REQUIRE_TOKEN_INTROSPECTION", True)
        monkeypatch.setattr(client, "REQUIRED_SCOPES", ("instagram_basic", "pages_read_engagement"))
        monkeypatch.setattr(client, "TOKEN_MIN_TTL_DAYS", 7)

    def test_accepts_matching_app_scopes_and_long_lived_token(self, monkeypatch):
        self._configure(monkeypatch)
        far_future = 4_102_444_800
        monkeypatch.setattr(client, "_request", lambda url, params: {
            "data": {
                "is_valid": True,
                "app_id": "12345",
                "scopes": ["instagram_basic", "pages_read_engagement"],
                "expires_at": far_future,
                "data_access_expires_at": far_future,
            },
        })
        report = client.inspect_access_token()
        assert report["verified"] is True
        assert report["scopes"] == ["instagram_basic", "pages_read_engagement"]

    def test_rejects_token_from_another_app(self, monkeypatch):
        self._configure(monkeypatch)
        monkeypatch.setattr(client, "_request", lambda url, params: {
            "data": {"is_valid": True, "app_id": "different", "scopes": []},
        })
        with pytest.raises(InstagramUnavailable, match="different Meta app"):
            client.inspect_access_token()

    def test_rejects_missing_permissions(self, monkeypatch):
        self._configure(monkeypatch)
        monkeypatch.setattr(client, "_request", lambda url, params: {
            "data": {"is_valid": True, "app_id": "12345", "scopes": ["instagram_basic"]},
        })
        with pytest.raises(InstagramUnavailable, match="pages_read_engagement"):
            client.inspect_access_token()

    def test_tagged_media_requires_comment_management_permission(self, monkeypatch):
        self._configure(monkeypatch)
        monkeypatch.setattr(client.instagram_config, "INCLUDE_TAGGED_MEDIA", True)
        monkeypatch.setattr(client, "_request", lambda url, params: {
            "data": {
                "is_valid": True,
                "app_id": "12345",
                "scopes": ["instagram_basic", "pages_read_engagement"],
            },
        })
        with pytest.raises(InstagramUnavailable, match="instagram_manage_comments"):
            client.inspect_access_token()

    def test_rejects_token_near_expiry(self, monkeypatch):
        self._configure(monkeypatch)
        monkeypatch.setattr(client, "_request", lambda url, params: {
            "data": {
                "is_valid": True,
                "app_id": "12345",
                "scopes": ["instagram_basic", "pages_read_engagement"],
                "expires_at": 1,
            },
        })
        with pytest.raises(InstagramUnavailable, match="expires in less than 7 days"):
            client.inspect_access_token()

    def test_appsecret_proof_is_added_to_graph_calls(self, monkeypatch):
        self._configure(monkeypatch)
        captured = {}

        class Response:
            status_code = 200
            headers = {}

            def json(self):
                return {"ok": True}

        def fake_get(url, params, timeout):
            captured.update(params)
            return Response()

        monkeypatch.setattr(client.httpx, "get", fake_get)
        client._request("https://graph.facebook.com/v25.0/123", {"fields": "id"})
        assert captured["access_token"] == "instagram-token"
        assert len(captured["appsecret_proof"]) == 64

    def test_retries_transient_meta_error_even_when_http_status_is_400(self, monkeypatch):
        self._configure(monkeypatch)
        attempts = 0

        class Response:
            headers = {}
            text = ""

            def __init__(self, status_code, payload):
                self.status_code = status_code
                self._payload = payload

            def json(self):
                return self._payload

        def fake_get(_url, params, timeout):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                return Response(400, {"error": {"code": 4, "message": "Application request limit reached"}})
            return Response(200, {"ok": True})

        monkeypatch.setattr(client.httpx, "get", fake_get)
        monkeypatch.setattr(client.time, "sleep", lambda _seconds: None)
        assert client._request("https://graph.facebook.com/v25.0/123") == {"ok": True}
        assert attempts == 2

    def test_non_retryable_meta_error_carries_safe_metadata(self, monkeypatch):
        self._configure(monkeypatch)

        class Response:
            status_code = 400
            headers = {}
            text = ""

            def json(self):
                return {"error": {"code": 190, "message": "Invalid token instagram-token"}}

        monkeypatch.setattr(client.httpx, "get", lambda *_args, **_kwargs: Response())
        with pytest.raises(InstagramUnavailable) as caught:
            client._request("https://graph.facebook.com/v25.0/123")
        assert caught.value.retryable is False
        assert caught.value.error_code == 190
        assert "instagram-token" not in str(caught.value)


class TestMediaUrlSafety:
    @pytest.mark.parametrize("url", [
        "https://scontent.cdninstagram.com/image.jpg",
        "https://instagram.fala1-1.fna.fbcdn.net/video.mp4",
    ])
    def test_accepts_meta_media_hosts(self, url):
        assert client._safe_media_url(url)

    @pytest.mark.parametrize("url", [
        "http://scontent.cdninstagram.com/image.jpg",
        "https://cdninstagram.com.attacker.example/image.jpg",
        "https://127.0.0.1/internal",
        "file:///etc/passwd",
    ])
    def test_rejects_non_meta_or_non_https_media(self, url):
        assert not client._safe_media_url(url)


class TestConfiguration:
    def test_empty_yaml_sections_are_valid(self, tmp_path):
        path = tmp_path / "instagram.yaml"
        path.write_text("hashtags:\nprofiles:\n", encoding="utf-8")
        assert load_hashtags(str(path)) == []
        assert load_profiles(str(path)) == []

    def test_rejects_graph_field_injection_in_username(self, tmp_path):
        path = tmp_path / "instagram.yaml"
        path.write_text("profiles:\n  - username: 'name){followers}'\n", encoding="utf-8")
        with pytest.raises(ValueError, match="Invalid Instagram username"):
            load_profiles(str(path))

    def test_rejects_hashtag_with_punctuation(self, tmp_path):
        path = tmp_path / "instagram.yaml"
        path.write_text("hashtags:\n  - tag: 'safe&fields=id'\n", encoding="utf-8")
        with pytest.raises(ValueError, match="Invalid Instagram hashtag"):
            load_hashtags(str(path))

    def test_rejects_unknown_category_before_scheduler_start(self, tmp_path):
        path = tmp_path / "instagram.yaml"
        path.write_text("hashtags:\n  - {tag: safe, category: not-a-real-category}\n", encoding="utf-8")
        with pytest.raises(ValueError, match="Invalid Instagram category"):
            load_hashtags(str(path))

    def test_rejects_string_boolean_instead_of_silently_enabling_source(self, tmp_path):
        path = tmp_path / "instagram.yaml"
        path.write_text("hashtags:\n  - {tag: safe, enabled: 'false'}\n", encoding="utf-8")
        with pytest.raises(ValueError, match="enabled must be true or false"):
            load_hashtags(str(path))

    def test_rejects_unknown_source_keys(self, tmp_path):
        path = tmp_path / "instagram.yaml"
        path.write_text("profiles:\n  - {username: safe, enabled: true, url: evil}\n", encoding="utf-8")
        with pytest.raises(ValueError, match="Unknown Instagram profile keys"):
            load_profiles(str(path))

    def test_rejects_unknown_top_level_keys(self, tmp_path):
        path = tmp_path / "instagram.yaml"
        path.write_text("hashtags: []\naccounts: []\n", encoding="utf-8")
        with pytest.raises(ValueError, match="Unknown Instagram source config keys"):
            load_hashtags(str(path))

    def test_readiness_reports_invalid_yaml_without_breaking_health(self, tmp_path):
        path = tmp_path / "instagram.yaml"
        path.write_text("- not-a-mapping\n", encoding="utf-8")
        report = readiness(str(path))
        assert report["ready"] is False
        assert any("invalid Instagram source config" in reason for reason in report["reasons"])

    def test_duplicate_sources_are_deduplicated(self, tmp_path, monkeypatch):
        import igcollect.config as config

        monkeypatch.setattr(config, "ENV_HASHTAGS", "same")
        path = tmp_path / "instagram.yaml"
        path.write_text("hashtags:\n  - {tag: same, enabled: true}\n", encoding="utf-8")
        assert [source.tag for source in load_hashtags(str(path))] == ["same"]

    def test_readiness_requires_expected_username_for_production_pinning(self, tmp_path, monkeypatch):
        import igcollect.config as config

        monkeypatch.setattr(config, "ACCESS_TOKEN", "token")
        monkeypatch.setattr(config, "BUSINESS_ID", "123")
        monkeypatch.setattr(config, "APP_ID", "456")
        monkeypatch.setattr(config, "APP_SECRET", "secret")
        monkeypatch.setattr(config, "BUSINESS_USERNAME", "")
        path = tmp_path / "instagram.yaml"
        path.write_text("hashtags:\n  - {tag: safe, enabled: true}\n", encoding="utf-8")
        report = readiness(str(path))
        assert report["ready"] is False
        assert any("IG_BUSINESS_USERNAME" in reason for reason in report["reasons"])

    def test_readiness_reports_tagged_media_scope(self, tmp_path, monkeypatch):
        import igcollect.config as config

        monkeypatch.setattr(config, "INCLUDE_TAGGED_MEDIA", True)
        path = tmp_path / "instagram.yaml"
        path.write_text("hashtags:\nprofiles:\n", encoding="utf-8")
        assert "instagram_manage_comments" in readiness(str(path))["required_scopes"]


class TestReliableIngest:
    def test_incomplete_carousel_holds_candidate_without_upload_or_cursor_advance(self, monkeypatch):
        source = Hashtag(tag="competition", category="competition")
        media = [{
            **SAMPLE_RECENT_MEDIA["data"][0],
            "media_type": "CAROUSEL_ALBUM",
            "children": {"data": [
                {"id": "image", "media_type": "IMAGE", "media_url": "https://cdn.test/real.jpg"},
                {"id": "missing", "media_type": "IMAGE", "thumbnail_url": "https://cdn.test/preview.jpg"},
            ]},
        }]
        monkeypatch.setattr(pipeline, "recent_media", lambda _tag: media)
        monkeypatch.setattr(pipeline, "download_media", lambda _descriptor: pytest.fail("must hold before upload"))
        monkeypatch.setattr(pipeline, "post_candidates", lambda **_kwargs: pytest.fail("must not ingest partial carousel"))
        state = {}
        result = pipeline.run_hashtag(source, state, dry_run=False, use_llm=False)
        assert result["media_failed"] == 1
        assert result["ingest_ready"] == 0
        assert result["offset_advanced"] is False
        assert state == {}

    def test_image_does_not_fall_back_to_thumbnail(self, monkeypatch):
        requested = []

        def fake_download(url, _max_bytes):
            requested.append(url)
            return None

        monkeypatch.setattr(client, "_download_url", fake_download)
        result = client.download_media({
            "kind": "IMAGE",
            "url": "https://cdn.test/original.jpg",
            "thumbnail_url": "https://cdn.test/thumbnail.jpg",
        })
        assert result is None
        assert requested == ["https://cdn.test/original.jpg"]

    def test_video_does_not_fall_back_to_thumbnail(self, monkeypatch):
        requested = []

        def fake_download(url, _max_bytes):
            requested.append(url)
            return None

        monkeypatch.setattr(client, "_download_url", fake_download)
        result = client.download_media({
            "kind": "VIDEO",
            "url": "https://cdn.test/reel.mp4",
            "thumbnail_url": "https://cdn.test/reel.jpg",
        })
        assert result is None
        assert requested == ["https://cdn.test/reel.mp4"]

    def test_media_failure_holds_candidate_and_does_not_advance_cursor(self, monkeypatch):
        source = Hashtag(tag="competition", category="competition")
        media = [{
            **SAMPLE_RECENT_MEDIA["data"][0],
            "media_url": "https://cdn.test/post-1.jpg",
        }]
        monkeypatch.setattr(pipeline, "recent_media", lambda _tag: media)
        monkeypatch.setattr(pipeline, "download_media", lambda _descriptor: None)
        monkeypatch.setattr(pipeline, "post_candidates", lambda **_kwargs: pytest.fail("must not ingest without media"))
        state = {}
        result = pipeline.run_hashtag(source, state, dry_run=False, use_llm=False)
        assert result["media_failed"] == 1
        assert result["ingest_ready"] == 0
        assert result["offset_advanced"] is False
        assert state == {}


class TestPersistentState:
    def test_corrupt_state_fails_closed_instead_of_replaying_posts(self, tmp_path, monkeypatch):
        state_path = tmp_path / "instagram.json"
        state_path.write_text("{broken", encoding="utf-8")
        monkeypatch.setattr(instagram_state, "STATE_PATH", str(state_path))
        with pytest.raises(instagram_state.InstagramStateCorrupt, match="repair or restore"):
            instagram_state.load()


class TestPreflightReport:
    def test_requires_at_least_one_successful_source(self):
        assert preflight_report([])["ready"] is False
        assert preflight_report([{"hashtag": "olympiad", "posts": 2, "candidates": 1}])["ready"] is True

    def test_reports_source_error_without_preview_payload(self):
        report = preflight_report([{
            "profile": "organizer",
            "error": "permission denied",
            "preview": [{"sensitive": "not copied"}],
        }])
        assert report == {
            "ready": False,
            "source_count": 1,
            "sources": [{"source": "organizer", "ok": False, "posts": 0, "candidates": 0, "error": "permission denied"}],
        }

    def test_preserves_safe_retry_diagnostics(self):
        report = preflight_report([{
            "hashtag": "olympiad",
            "error": "request limit reached",
            "retryable": True,
            "retry_after_s": 60.0,
            "graph_error_code": 4,
        }])
        assert report["sources"][0] == {
            "source": "olympiad",
            "ok": False,
            "posts": 0,
            "candidates": 0,
            "error": "request limit reached",
            "retryable": True,
            "retry_after_s": 60.0,
            "graph_error_code": 4,
        }

    def test_preflight_exposes_safe_token_diagnostics(self, monkeypatch):
        monkeypatch.setattr(pipeline, "run_all", lambda **_kwargs: [{"profile": "partner", "posts": 1}])
        monkeypatch.setattr(pipeline.health, "snapshot", lambda: {"credentials": {
            "status": "valid",
            "account_type": "BUSINESS",
            "token_verified": True,
            "granted_scopes": ["instagram_basic"],
            "token_expires_at": 2_000_000_000,
        }})
        monkeypatch.setattr(pipeline.health, "preflight_finished", lambda _report: None)
        report = pipeline.preflight()
        assert report["credentials"]["token_verified"] is True
        assert "access_token" not in report["credentials"]


class TestAdminRunEndpoint:
    def test_graph_unavailable_is_a_clear_503(self, monkeypatch):
        import server

        monkeypatch.setattr(server, "ADMIN_TOKEN", "admin")
        monkeypatch.setattr(
            pipeline,
            "run_all",
            lambda **_kwargs: (_ for _ in ()).throw(InstagramUnavailable("token expired")),
        )
        with pytest.raises(HTTPException) as caught:
            server.run_instagram(x_admin_token="admin")
        assert caught.value.status_code == 503
        assert caught.value.detail == "token expired"

    def test_source_error_is_not_reported_as_ok(self, monkeypatch):
        import json
        import server

        monkeypatch.setattr(server, "ADMIN_TOKEN", "admin")
        monkeypatch.setattr(pipeline, "run_all", lambda **_kwargs: [{"profile": "partner", "error": "permission denied"}])
        response = server.run_instagram(x_admin_token="admin", source="partner")
        assert response.status_code == 502
        assert json.loads(response.body)["ok"] is False


class TestSchedulerPreflight:
    def test_scheduler_gate_requires_a_successful_source_preflight(self, monkeypatch):
        import server

        monkeypatch.setattr(pipeline, "preflight", lambda: {
            "ready": False,
            "source_count": 1,
            "sources": [{"source": "partner", "ok": False}],
        })
        ready, reason = server._instagram_preflight_ready()
        assert ready is False
        assert reason == "source preflight failed: partner"

    def test_scheduler_gate_accepts_verified_sources(self, monkeypatch):
        import server

        monkeypatch.setattr(pipeline, "preflight", lambda: {
            "ready": True,
            "source_count": 1,
            "sources": [{"source": "partner", "ok": True}],
        })
        assert server._instagram_preflight_ready() == (True, "verified")


class TestGraphTimestamp:
    def test_reference_date_parses_the_graph_offset_format(self):
        # Graph API stamps "+0000"; Python 3.9's fromisoformat needs "+00:00".
        assert reference_date("2026-02-12T09:00:00+0000") is not None
        assert reference_date("2026-02-12T09:00:00+0000").isoformat() == "2026-02-12"

    def test_reference_date_still_accepts_colon_and_z_forms(self):
        assert reference_date("2026-02-12T09:00:00+00:00").isoformat() == "2026-02-12"
        assert reference_date("2026-02-12T09:00:00Z").isoformat() == "2026-02-12"


class TestDemo:
    def test_two_candidates_two_rejections(self):
        results = run_demo(use_llm=False)
        candidates = [r for r in results if "candidate" in r]
        skipped = [r for r in results if "skipped" in r]
        assert len(candidates) == 2
        assert len(skipped) == 2

    def test_no_caption_is_reported_distinctly(self):
        results = run_demo(use_llm=False)
        reasons = {r.get("skipped") for r in results if "skipped" in r}
        assert "no caption" in reasons
        assert "not an opportunity" in reasons

    def test_deadline_year_anchored_on_post_date_not_run_date(self):
        # Post published 2026-02-12, deadline "25 марта" → March 2026, not 2027.
        candidate = next(r["candidate"] for r in run_demo(use_llm=False) if r.get("media") == "178001")
        assert candidate["applicationDeadline"].startswith("2026-03-25")

    def test_candidates_carry_the_instagram_permalink(self):
        for result in run_demo(use_llm=False):
            if "candidate" in result:
                assert result["candidate"]["sourceUrl"].startswith("https://www.instagram.com/p/")
