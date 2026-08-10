from typing import Annotated

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .models import ConfirmAuthRequest, CreateAuthSessionRequest, ReviewRequest
from .services import (
    confirm_auth_session,
    create_auth_session,
    create_prefill_draft,
    get_job,
    list_jobs,
    load_preferences,
    load_profile,
    load_sources,
    now,
    reset_state,
    review_job,
    run_local_capture,
)
from .storage import load_state

settings = get_settings()

app = FastAPI(title=settings.app_name, version=settings.app_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "name": settings.app_name,
        "version": settings.app_version,
        "time": now().isoformat(),
    }


@app.get("/api/profile")
def profile() -> dict:
    return load_profile()


@app.get("/api/preferences")
def preferences() -> dict:
    return load_preferences()


@app.get("/api/sources")
def sources() -> dict:
    return load_sources()


@app.post("/api/capture/run")
def capture_run() -> dict:
    run = run_local_capture()
    return {"run": run, "jobs": list_jobs(status="capture_waiting_review")}


@app.get("/api/capture/runs")
def capture_runs() -> list:
    return load_state().capture_runs


@app.get("/api/capture/today")
def capture_today() -> list:
    return list_jobs(status="capture_waiting_review")


@app.post("/api/capture/jobs/{job_id}/review")
def capture_review(job_id: str, request: ReviewRequest):
    return review_job(job_id, request)


@app.get("/api/jobs")
def jobs(status: Annotated[str | None, Query()] = None) -> list:
    return list_jobs(status=status)


@app.get("/api/jobs/{job_id}")
def job_detail(job_id: str):
    return get_job(job_id)


@app.post("/api/auth-sessions")
def auth_session_create(request: CreateAuthSessionRequest):
    return create_auth_session(request)


@app.get("/api/auth-sessions")
def auth_sessions() -> list:
    return load_state().auth_sessions


@app.post("/api/auth-sessions/{session_id}/confirm")
def auth_session_confirm(session_id: str, request: ConfirmAuthRequest):
    return confirm_auth_session(session_id, request)


@app.post("/api/prefill/{job_id}/draft")
def prefill_draft(job_id: str):
    return create_prefill_draft(job_id)


@app.get("/api/prefill/drafts")
def prefill_drafts() -> list:
    return load_state().prefill_drafts


@app.get("/api/events")
def events() -> list:
    return load_state().events


@app.post("/api/dev/reset")
def dev_reset() -> dict:
    state = reset_state()
    return {"ok": True, "state": state}
