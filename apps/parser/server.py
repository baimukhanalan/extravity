"""FastAPI server for the parser: health, manual run, scheduled runs, fixtures."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from fastapi.responses import PlainTextResponse
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse

from parser.config import ADMIN_TOKEN
from parser.pipeline import run_all as run_web_all
from parser import runtime_health

log = logging.getLogger("parser.server")
FIXTURES = Path(__file__).resolve().parent / "fixtures"

scheduler = BackgroundScheduler(timezone="Asia/Almaty")
telegram_live_task: asyncio.Task | None = None


def _enabled(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    return default if raw is None else raw.strip().lower() in {"1", "true", "yes", "on"}


def _interval(name: str, default: int) -> int:
    return max(1, int(os.getenv(name, str(default))))


def _telegram_storage_ready() -> tuple[bool, str]:
    session = os.getenv("TG_SESSION_PATH", "")
    session_string = os.getenv("TG_SESSION_STRING", "").strip()
    state = os.getenv("TG_STATE_PATH", "")
    state_url = os.getenv("TG_STATE_URL", "").strip()
    lock = os.getenv("TG_LOCK_PATH", "")
    if session_string or state_url:
        if not session_string or not state_url or not lock:
            return False, "TG_SESSION_STRING, TG_STATE_URL and TG_LOCK_PATH must be configured together"
        if not state_url.startswith("https://"):
            return False, "TG_STATE_URL must use HTTPS"
        if not Path(lock).is_absolute():
            return False, "TG_LOCK_PATH must be absolute"
        return True, "configured (stateless)"
    if not session or not state or not lock:
        return False, "TG_SESSION_PATH, TG_STATE_PATH and TG_LOCK_PATH must be explicit"
    if not all(Path(value).is_absolute() for value in (session, state, lock)):
        return False, "Telegram session/state/lock paths must be absolute persistent-volume paths"
    if Path(state) == Path(lock):
        return False, "Telegram state and lock paths must be different"
    return True, "configured"


def _whatsapp_storage_ready() -> tuple[bool, str]:
    session = os.getenv("WA_SESSION_PATH", "")
    state = os.getenv("WA_STATE_PATH", "")
    lock = os.getenv("WA_LOCK_PATH", "")
    bridge_lock = os.getenv("WA_BRIDGE_LOCK_PATH", "")
    if not session or not state or not lock or not bridge_lock:
        return False, (
            "WA_SESSION_PATH, WA_STATE_PATH, WA_LOCK_PATH and WA_BRIDGE_LOCK_PATH "
            "must be explicit for scheduled runs"
        )
    if not all(Path(value).is_absolute() for value in (session, state, lock, bridge_lock)):
        return False, "WhatsApp session/state/lock paths must be absolute persistent-volume paths"
    return True, "configured"


def _instagram_storage_ready() -> tuple[bool, str]:
    state = os.getenv("IG_STATE_PATH", "")
    lock = os.getenv("IG_LOCK_PATH", "")
    if not state or not lock:
        return False, "IG_STATE_PATH and IG_LOCK_PATH must be explicit for scheduled runs"
    if not Path(state).is_absolute() or not Path(lock).is_absolute():
        return False, "Instagram state/lock paths must be absolute persistent-volume paths"
    if Path(state) == Path(lock):
        return False, "Instagram state and lock paths must be different"
    return True, "configured"


def _whatsapp_linked_session_ready() -> bool:
    from wacollect.config import linked_session_status

    return bool(linked_session_status()["ready"])


def _whatsapp_linked_session_status() -> dict:
    from wacollect.config import linked_session_status

    return linked_session_status()


def _whatsapp_collector_readiness() -> dict:
    from wacollect.config import readiness

    return readiness()


def _require_admin(x_admin_token: Optional[str]) -> None:
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=503, detail="Parser admin endpoint is not configured")
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _scheduled_run() -> None:
    job_id = "collect-web"
    runtime_health.started(job_id)
    try:
        from parser.ingest import preflight_ingest_target

        readiness = preflight_ingest_target()
        if not readiness["ready"]:
            log.error("Scheduled web run skipped: %s", readiness["reason"])
            runtime_health.skipped(job_id, readiness["reason"])
            return
        runtime_health.finished(job_id, run_web_all())
    except Exception as error:  # noqa: BLE001
        runtime_health.failed(job_id, error)
        log.exception("Scheduled web run failed")


def _scheduled_news_run() -> None:
    job_id = "collect-news"
    runtime_health.started(job_id)
    try:
        from parser.news import run_news_all
        runtime_health.finished(job_id, run_news_all())
    except Exception as error:  # noqa: BLE001
        runtime_health.failed(job_id, error)
        log.exception("Scheduled news run failed")


def _scheduled_instagram_run() -> None:
    job_id = "collect-instagram"
    runtime_health.started(job_id)
    try:
        from parser.ingest import preflight_ingest_target

        readiness = preflight_ingest_target()
        if not readiness["ready"]:
            log.error("Scheduled Instagram run skipped: %s", readiness["reason"])
            runtime_health.skipped(job_id, readiness["reason"])
            return
        from igcollect.pipeline import run_all as run_instagram_all

        runtime_health.finished(job_id, run_instagram_all(use_llm=_enabled("INSTAGRAM_USE_LLM", False)))
    except Exception as error:  # noqa: BLE001
        runtime_health.failed(job_id, error)
        log.exception("Scheduled Instagram run failed")


def _instagram_preflight_ready() -> tuple[bool, str]:
    from igcollect.client import InstagramUnavailable
    from igcollect.pipeline import preflight

    try:
        report = preflight()
    except InstagramUnavailable as error:
        return False, str(error)
    except Exception as error:  # noqa: BLE001
        log.exception("Instagram preflight failed")
        return False, f"preflight failed ({type(error).__name__})"
    failed = [source["source"] for source in report["sources"] if not source["ok"]]
    if failed:
        return False, f"source preflight failed: {', '.join(failed)}"
    if not report["ready"]:
        return False, "preflight found no accessible source"
    return True, "verified"


def _scheduled_whatsapp_run() -> None:
    job_id = "collect-whatsapp"
    runtime_health.started(job_id)
    try:
        from parser.ingest import preflight_ingest_target

        readiness = preflight_ingest_target()
        if not readiness["ready"]:
            log.error("Scheduled WhatsApp run skipped: %s", readiness["reason"])
            runtime_health.skipped(job_id, readiness["reason"])
            return
        from wacollect.pipeline import run_all as run_whatsapp_all

        runtime_health.finished(job_id, run_whatsapp_all())
    except Exception as error:  # noqa: BLE001
        runtime_health.failed(job_id, error)
        log.exception("Scheduled WhatsApp linked-device run failed")


def _add_interval_job(func, *, minutes: int, job_id: str) -> None:
    runtime_health.registered(job_id)
    timing = {"next_run_time": datetime.now(timezone.utc)} if _enabled("PARSER_RUN_ON_STARTUP", True) else {}
    scheduler.add_job(
        func,
        IntervalTrigger(minutes=minutes),
        id=job_id,
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
        **timing,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global telegram_live_task
    jobs: list[str] = []
    if _enabled("WEB_SCHEDULE_ENABLED", True):
        _add_interval_job(
            _scheduled_run,
            minutes=_interval("WEB_SCHEDULE_INTERVAL_MINUTES", 360),
            job_id="collect-web",
        )
        jobs.append("web")

    if _enabled("NEWS_SCHEDULE_ENABLED", False):
        _add_interval_job(
            _scheduled_news_run,
            minutes=_interval("NEWS_SCHEDULE_INTERVAL_MINUTES", 60),
            job_id="collect-news",
        )
        jobs.append("news")

    if _enabled("TELEGRAM_LIVE_ENABLED", False):
        ready, reason = _telegram_storage_ready()
        if not ready:
            log.error("Telegram live collector disabled: %s", reason)
        else:
            from tgcollect.live import run_forever

            telegram_live_task = asyncio.create_task(run_forever())
            log.info("Telegram live collector started")
    if _enabled("INSTAGRAM_SCHEDULE_ENABLED", False):
        from igcollect.config import readiness as instagram_readiness

        instagram_ready = instagram_readiness()
        instagram_storage_ready, instagram_storage_reason = _instagram_storage_ready()
        if not instagram_ready["ready"] or not instagram_storage_ready:
            reasons = [*instagram_ready["reasons"]]
            if not instagram_storage_ready:
                reasons.append(instagram_storage_reason)
            log.error("Instagram scheduler disabled: %s", "; ".join(reasons))
        else:
            instagram_network_ready, instagram_network_reason = _instagram_preflight_ready()
            if not instagram_network_ready:
                log.error("Instagram scheduler disabled: %s", instagram_network_reason)
            else:
                _add_interval_job(
                    _scheduled_instagram_run,
                    minutes=_interval("INSTAGRAM_SCHEDULE_INTERVAL_MINUTES", 180),
                    job_id="collect-instagram",
                )
                jobs.append("instagram")

    if _enabled("WHATSAPP_SCHEDULE_ENABLED", False):
        storage_ready, storage_reason = _whatsapp_storage_ready()
        collector_ready = _whatsapp_collector_readiness()
        if not storage_ready or not collector_ready["ready"]:
            reasons = [*collector_ready["reasons"]]
            if not storage_ready:
                reasons.append(storage_reason)
            log.error("WhatsApp scheduler disabled: %s", "; ".join(reasons))
        else:
            _add_interval_job(
                _scheduled_whatsapp_run,
                minutes=_interval("WHATSAPP_SCHEDULE_INTERVAL_MINUTES", 60),
                job_id="collect-whatsapp",
            )
            jobs.append("whatsapp")

    if jobs:
        scheduler.start()
        log.info("Scheduler started for: %s", ", ".join(jobs))
    elif telegram_live_task is None:
        log.info("Scheduler disabled; manual endpoints remain available")
    yield
    if telegram_live_task is not None:
        telegram_live_task.cancel()
        try:
            await telegram_live_task
        except asyncio.CancelledError:
            pass
        telegram_live_task = None
    if scheduler.running:
        scheduler.shutdown(wait=False)
    runtime_health.reset()


app = FastAPI(title="Extravity Parser", version="1.0.0", lifespan=lifespan)


def _source_media_response(asset_id: str, expires: str, sig: str, range_header: str | None, *, head: bool):
    from parser.config import INGEST_SECRET
    from parser.source_media import SourceMediaStore, backend, valid_signature

    if backend() != "railway_volume" or not valid_signature(asset_id, expires, sig, INGEST_SECRET):
        raise HTTPException(status_code=404, detail="Not found")
    try:
        path, metadata = SourceMediaStore(secret=INGEST_SECRET).get(asset_id)
    except (FileNotFoundError, RuntimeError):
        raise HTTPException(status_code=404, detail="Not found") from None

    size = metadata["sizeBytes"]
    first, last = 0, size - 1
    status_code = 200
    if range_header is not None:
        import re

        match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
        if not match or (not match.group(1) and not match.group(2)):
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}", "Cache-Control": "no-store"})
        if match.group(1):
            first = int(match.group(1))
            last = min(size - 1, int(match.group(2))) if match.group(2) else size - 1
        else:
            suffix = int(match.group(2))
            first = max(0, size - suffix)
            last = size - 1
        if first >= size or first > last or (not match.group(1) and int(match.group(2)) == 0):
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}", "Cache-Control": "no-store"})
        status_code = 206

    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "Content-Length": str(last - first + 1),
        "ETag": f'"{metadata["checksum"]}"',
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
    }
    if status_code == 206:
        headers["Content-Range"] = f"bytes {first}-{last}/{size}"
    if head:
        return Response(status_code=status_code, headers=headers, media_type=metadata["mimeType"])

    def chunks():
        remaining = last - first + 1
        with path.open("rb") as source:
            source.seek(first)
            while remaining:
                chunk = source.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(chunks(), status_code=status_code, headers=headers, media_type=metadata["mimeType"])


@app.get("/source-media/{asset_id}")
def get_source_media(asset_id: str, request: Request, expires: str = "", sig: str = ""):
    return _source_media_response(asset_id, expires, sig, request.headers.get("range"), head=False)


@app.head("/source-media/{asset_id}")
def head_source_media(asset_id: str, request: Request, expires: str = "", sig: str = ""):
    return _source_media_response(asset_id, expires, sig, request.headers.get("range"), head=True)


@app.get("/health")
def health() -> dict:
    storage_ready, storage_reason = _telegram_storage_ready()
    wa_storage_ready, wa_storage_reason = _whatsapp_storage_ready()
    ig_storage_ready, ig_storage_reason = _instagram_storage_ready()
    from igcollect.config import readiness as instagram_readiness
    from igcollect.health import snapshot as instagram_health
    from wameta.webhook import configured as whatsapp_cloud_configured
    from parser.config import INGEST_SECRET
    from parser.source_media import storage_readiness
    scheduled_jobs = [job.id for job in scheduler.get_jobs()]
    scheduled_runs = runtime_health.snapshot()
    from tgcollect.live import status as telegram_live_status
    instagram_config = instagram_readiness()
    instagram_schedule_requested = _enabled("INSTAGRAM_SCHEDULE_ENABLED", False)
    instagram_schedule_active = "collect-instagram" in scheduled_jobs
    instagram_runtime = instagram_health()
    whatsapp_config = _whatsapp_collector_readiness()
    whatsapp_schedule_requested = _enabled("WHATSAPP_SCHEDULE_ENABLED", False)
    whatsapp_schedule_active = "collect-whatsapp" in scheduled_jobs
    return {
        "status": "ok",
        "service": "parser",
        "scheduled_jobs": scheduled_jobs,
        "scheduled_runs": scheduled_runs,
        "telegram_live": telegram_live_status(),
        "telegram_storage": {"ready": storage_ready, "reason": storage_reason},
        "source_media": storage_readiness(INGEST_SECRET, cached=True),
        "whatsapp_storage": {"ready": wa_storage_ready, "reason": wa_storage_reason},
        "whatsapp_linked_session": _whatsapp_linked_session_status(),
        "whatsapp_collector": {
            **whatsapp_config,
            "automation": {
                "requested": whatsapp_schedule_requested,
                "active": whatsapp_schedule_active,
                "ready": bool(
                    whatsapp_schedule_requested
                    and whatsapp_schedule_active
                    and wa_storage_ready
                    and whatsapp_config["ready"]
                ),
            },
        },
        "instagram_graph": {
            **instagram_config,
            "storage": {"ready": ig_storage_ready, "reason": ig_storage_reason},
            "automation": {
                "requested": instagram_schedule_requested,
                "active": instagram_schedule_active,
                "ready": bool(
                    instagram_schedule_requested
                    and instagram_schedule_active
                    and instagram_config["ready"]
                    and ig_storage_ready
                    and instagram_runtime.get("preflight", {}).get("status") == "valid"
                ),
            },
            "last_run": instagram_runtime,
        },
        "whatsapp_cloud": {"ready": whatsapp_cloud_configured()},
    }


def _automation_readiness(payload: dict) -> dict:
    reasons: list[str] = []
    scheduled = set(payload["scheduled_jobs"])
    runs = payload["scheduled_runs"]
    for env_name, job_id in (
        ("WEB_SCHEDULE_ENABLED", "collect-web"),
        ("NEWS_SCHEDULE_ENABLED", "collect-news"),
        ("INSTAGRAM_SCHEDULE_ENABLED", "collect-instagram"),
        ("WHATSAPP_SCHEDULE_ENABLED", "collect-whatsapp"),
    ):
        if not _enabled(env_name, env_name == "WEB_SCHEDULE_ENABLED"):
            continue
        if job_id not in scheduled:
            reasons.append(f"{job_id} was requested but is not scheduled")
            continue
        status = runs.get(job_id, {}).get("status")
        if status in {"failed", "skipped", "degraded"}:
            reasons.append(f"{job_id} last run is {status}")

    if _enabled("TELEGRAM_LIVE_ENABLED", False):
        telegram = payload["telegram_live"]
        if not payload["telegram_storage"]["ready"]:
            reasons.append(payload["telegram_storage"]["reason"])
        if telegram.get("state") not in {"catching_up", "connected"}:
            reasons.append(f"Telegram live collector is {telegram.get('state', 'unknown')}")

    return {"ready": not reasons, "reasons": reasons, "health": payload}


@app.get("/ready")
def ready() -> JSONResponse:
    payload = _automation_readiness(health())
    return JSONResponse(payload, status_code=200 if payload["ready"] else 503)


@app.get("/webhooks/whatsapp", response_class=PlainTextResponse)
def verify_whatsapp_webhook(request: Request) -> PlainTextResponse:
    from wameta.webhook import VERIFY_TOKEN

    query = request.query_params
    if query.get("hub.mode") != "subscribe" or query.get("hub.verify_token") != VERIFY_TOKEN:
        raise HTTPException(status_code=403, detail="Webhook verification failed")
    return PlainTextResponse(query.get("hub.challenge") or "")


@app.post("/webhooks/whatsapp")
async def receive_whatsapp_webhook(request: Request, background_tasks: BackgroundTasks) -> JSONResponse:
    from wameta.webhook import process_payload, valid_signature

    raw = await request.body()
    if not valid_signature(raw, request.headers.get("x-hub-signature-256")):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    try:
        payload = await request.json()
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid JSON") from error
    background_tasks.add_task(process_payload, payload)
    return JSONResponse({"ok": True})


@app.post("/run")
def run(x_admin_token: Optional[str] = Header(default=None), dry_run: bool = False) -> JSONResponse:
    _require_admin(x_admin_token)
    if not dry_run:
        from parser.ingest import preflight_ingest_target

        readiness = preflight_ingest_target()
        if not readiness["ready"]:
            raise HTTPException(status_code=503, detail=readiness["reason"])
    results = run_web_all(dry_run=dry_run)
    return JSONResponse({"ok": True, "results": results})


@app.post("/run/news")
def run_news(x_admin_token: Optional[str] = Header(default=None), dry_run: bool = True) -> JSONResponse:
    _require_admin(x_admin_token)
    from parser.news import run_news_all
    try:
        results = run_news_all(dry_run=dry_run)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    ok = not any("error" in result for result in results)
    return JSONResponse({"ok": ok, "results": results}, status_code=200 if ok else 502)


@app.get("/preflight/ingest")
def preflight_ingest(x_admin_token: Optional[str] = Header(default=None)) -> JSONResponse:
    _require_admin(x_admin_token)
    from parser.ingest import preflight_ingest_target

    readiness = preflight_ingest_target()
    return JSONResponse(readiness, status_code=200 if readiness["ready"] else 503)


@app.post("/run/telegram")
async def run_telegram(
    x_admin_token: Optional[str] = Header(default=None),
    dry_run: bool = True,
    channel: Optional[str] = None,
) -> JSONResponse:
    _require_admin(x_admin_token)
    if telegram_live_task is not None and not telegram_live_task.done():
        raise HTTPException(status_code=409, detail="Telegram live collector owns the account session")
    from tgcollect.pipeline import run_all as run_telegram_all

    if not dry_run:
        from parser.ingest import preflight_ingest_target

        readiness = preflight_ingest_target()
        if not readiness["ready"]:
            raise HTTPException(status_code=503, detail=readiness["reason"])

    results = await run_telegram_all(only=channel, dry_run=dry_run)
    return JSONResponse({"ok": True, "results": results})


@app.post("/run/instagram")
def run_instagram(
    x_admin_token: Optional[str] = Header(default=None),
    dry_run: bool = True,
    hashtag: Optional[str] = None,
    source: Optional[str] = None,
    use_llm: bool = False,
    preflight: bool = False,
) -> JSONResponse:
    _require_admin(x_admin_token)
    if hashtag and source and hashtag != source:
        raise HTTPException(status_code=400, detail="Use either source or hashtag, not both")
    from igcollect.client import InstagramUnavailable
    from igcollect.pipeline import preflight as run_instagram_preflight
    from igcollect.pipeline import run_all as run_instagram_all

    try:
        if preflight:
            report = run_instagram_preflight(only=source or hashtag)
            return JSONResponse(report, status_code=200 if report["ready"] else 502)
        if not dry_run:
            from parser.ingest import preflight_ingest_target

            readiness = preflight_ingest_target()
            if not readiness["ready"]:
                raise HTTPException(status_code=503, detail=readiness["reason"])
        results = run_instagram_all(only=source or hashtag, dry_run=dry_run, use_llm=use_llm)
    except InstagramUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    ok = bool(results) and not any(result.get("error") for result in results)
    return JSONResponse({"ok": ok, "results": results}, status_code=200 if ok else 502)


@app.post("/run/whatsapp")
def run_whatsapp(
    x_admin_token: Optional[str] = Header(default=None),
    dry_run: bool = True,
    chat: Optional[str] = None,
) -> JSONResponse:
    _require_admin(x_admin_token)
    from wacollect.pipeline import WhatsAppUnavailable, run_all as run_whatsapp_all

    try:
        if not dry_run:
            from parser.ingest import preflight_ingest_target

            readiness = preflight_ingest_target()
            if not readiness["ready"]:
                raise HTTPException(status_code=503, detail=readiness["reason"])
        results = run_whatsapp_all(only=chat, dry_run=dry_run)
    except WhatsAppUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return JSONResponse({"ok": True, "results": results})


@app.get("/fixtures/{name}", response_class=HTMLResponse)
def fixture(name: str) -> HTMLResponse:
    """Serve bundled demo fixtures so the pipeline is testable end-to-end offline."""
    path = (FIXTURES / name).resolve()
    if not str(path).startswith(str(FIXTURES)) or not path.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return HTMLResponse(path.read_text(encoding="utf-8"))
