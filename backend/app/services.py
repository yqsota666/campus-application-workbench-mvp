import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException

from .config import get_settings
from .models import (
    AuthSession,
    CaptureRun,
    ConfirmAuthRequest,
    CreateAuthSessionRequest,
    Event,
    Job,
    PrefillDraft,
    PrefillField,
    ReviewChecks,
    ReviewRequest,
    State,
)
from .storage import load_state, save_state, update_state


def now() -> datetime:
    return datetime.now(timezone.utc)


def today_str() -> str:
    return now().astimezone().date().isoformat()


def read_json(path: Path) -> Any:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Missing file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def add_event(state: State, event_type: str, message: str, payload: dict[str, Any] | None = None) -> Event:
    event = Event(
        id=f"event_{uuid4().hex[:12]}",
        type=event_type,
        message=message,
        payload=payload or {},
        created_at=now(),
    )
    state.events.insert(0, event)
    state.events = state.events[:500]
    return event


def stable_job_id(company: str, job_name: str, location: str, source_url: str) -> str:
    raw = "|".join([company, job_name, location, source_url])
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]
    return f"job_{digest}"


def normalize_sample(raw: dict[str, Any]) -> Job:
    company = raw.get("company") or raw.get("company_name") or ""
    job_name = raw.get("job_name") or raw.get("role") or ""
    location = raw.get("location") or raw.get("region") or ""
    source_url = raw.get("source_url") or ""
    fit_score_raw = raw.get("fit_score", 0)
    fit_score = int(round(fit_score_raw * 100)) if isinstance(fit_score_raw, float) and fit_score_raw <= 1 else int(fit_score_raw)
    first_seen_at = raw.get("publish_date_or_first_seen_at") or today_str()
    evidence_id = raw.get("evidence_id") or f"evidence_{hashlib.sha1(source_url.encode('utf-8')).hexdigest()[:10]}"
    timestamp = now()
    return Job(
        id=stable_job_id(company, job_name, location, source_url),
        company=company,
        job_name=job_name,
        location=location,
        batch=raw.get("batch", "校园招聘"),
        source_type=raw.get("source_type", "unknown"),
        source_url=source_url,
        first_seen_at=first_seen_at,
        fit_score=max(0, min(100, fit_score)),
        fit_reason=raw.get("fit_reason", []),
        status="capture_waiting_review",
        evidence_id=evidence_id,
        evidence={
            "source_url": source_url,
            "source_type": raw.get("source_type", "unknown"),
            "raw": raw,
        },
        created_at=timestamp,
        updated_at=timestamp,
    )


def load_profile() -> dict[str, Any]:
    return read_json(get_settings().profile_file)


def load_preferences() -> dict[str, Any]:
    return read_json(get_settings().preferences_file)


def load_sources() -> dict[str, Any]:
    return read_json(get_settings().sources_file)


def run_local_capture() -> CaptureRun:
    settings = get_settings()
    samples = [read_json(settings.demo_sample_file)]
    candidates = [normalize_sample(item) for item in samples]

    def mutate(state: State) -> CaptureRun:
        existing = {job.id: job for job in state.jobs}
        created_count = 0
        for candidate in candidates:
            if candidate.id in existing:
                job = existing[candidate.id]
                job.updated_at = now()
                job.status = job.status if job.status != "rejected" else "capture_waiting_review"
            else:
                state.jobs.insert(0, candidate)
                created_count += 1

        review_count = len([job for job in state.jobs if job.status == "capture_waiting_review"])
        run = CaptureRun(
            id=f"run_{uuid4().hex[:12]}",
            run_date=today_str(),
            status="completed",
            created_count=created_count,
            review_count=review_count,
            created_at=now(),
        )
        state.capture_runs.insert(0, run)
        add_event(
            state,
            "capture.run.completed",
            f"本地抓取完成，新增 {created_count} 条，待确认 {review_count} 条",
            {"run_id": run.id},
        )
        return run

    return update_state(mutate)


def list_jobs(status: str | None = None) -> list[Job]:
    state = load_state()
    if status:
        return [job for job in state.jobs if job.status == status]
    return state.jobs


def get_job(job_id: str) -> Job:
    for job in load_state().jobs:
        if job.id == job_id:
            return job
    raise HTTPException(status_code=404, detail="Job not found")


def review_job(job_id: str, request: ReviewRequest) -> Job:
    def mutate(state: State) -> Job:
        for job in state.jobs:
            if job.id != job_id:
                continue
            if job.status not in {"capture_waiting_review", "needs_more_evidence"}:
                raise HTTPException(status_code=409, detail="Only captured jobs waiting for review can be reviewed")
            checks = ReviewChecks(
                source_confirmed=request.source_confirmed,
                fields_confirmed=request.fields_confirmed,
                deadline_confirmed=request.deadline_confirmed,
                fit_confirmed=request.fit_confirmed,
                notes=request.notes,
                reviewed_at=now(),
            )
            job.review = checks
            job.status = "job_ready" if checks.passed else "needs_more_evidence"
            job.updated_at = now()
            add_event(
                state,
                "capture.job.reviewed",
                f"岗位抓取确认：{job.company} / {job.job_name} -> {job.status}",
                {"job_id": job.id, "passed": checks.passed},
            )
            return job
        raise HTTPException(status_code=404, detail="Job not found")

    return update_state(mutate)


def create_auth_session(request: CreateAuthSessionRequest) -> AuthSession:
    def mutate(state: State) -> AuthSession:
        job = next((item for item in state.jobs if item.id == request.job_id), None)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.status != "job_ready":
            raise HTTPException(status_code=409, detail="Only job_ready jobs can enter auth assist")

        session = AuthSession(
            id=f"auth_{uuid4().hex[:12]}",
            job_id=job.id,
            status="auth_waiting_for_user",
            blocked_reason=request.blocked_reason,
            manual_steps_required=request.manual_steps_required,
            created_at=now(),
            updated_at=now(),
        )
        state.auth_sessions.insert(0, session)
        job.status = "auth_waiting_for_user"
        job.updated_at = now()
        add_event(state, "auth.session.created", "已创建人工注册协作任务", {"job_id": job.id, "session_id": session.id})
        return session

    return update_state(mutate)


def confirm_auth_session(session_id: str, request: ConfirmAuthRequest) -> AuthSession:
    if not request.confirmed_by_user:
        raise HTTPException(status_code=400, detail="Auth confirmation must be confirmed by user")

    def mutate(state: State) -> AuthSession:
        session = next((item for item in state.auth_sessions if item.id == session_id), None)
        if not session:
            raise HTTPException(status_code=404, detail="Auth session not found")
        session.status = "auth_ready"
        session.confirmed_by_user = True
        session.updated_at = now()
        job = next((item for item in state.jobs if item.id == session.job_id), None)
        if job:
            job.status = "auth_ready"
            job.updated_at = now()
        add_event(state, "auth.session.confirmed", "用户已确认注册登录验证完成", {"session_id": session.id})
        return session

    return update_state(mutate)


def create_prefill_draft(job_id: str) -> PrefillDraft:
    profile = load_profile()

    def mutate(state: State) -> PrefillDraft:
        job = next((item for item in state.jobs if item.id == job_id), None)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.status != "auth_ready":
            raise HTTPException(status_code=409, detail="Prefill requires auth_ready")

        basic = profile["basic"]
        fields = [
            PrefillField(field="姓名", value=basic["name"], confidence="high", action="fill"),
            PrefillField(field="手机号", value=basic["phone"], confidence="high", action="fill"),
            PrefillField(field="邮箱", value=basic["email"], confidence="high", action="fill"),
            PrefillField(field="政治面貌", value=basic["political_status"], confidence="high", action="fill"),
            PrefillField(field="最高学历", value="示例大学A 计算机科学 硕士", confidence="high", action="fill"),
            PrefillField(field="专业类别", value="计算机类 / 电子信息类", confidence="medium", action="ask_user", reason="官网选项可能没有示例专业"),
            PrefillField(field="获奖情况", value=None, confidence="low", action="ask_user", reason="资料模板缺失"),
        ]
        questions = [
            {
                "title": "需要确认专业类别",
                "field": "专业类别",
                "suggested_value": "计算机类",
                "reason": "官网选项可能与个人资料专业名称不完全一致。",
            },
            {
                "title": "需要确认获奖情况",
                "field": "获奖情况",
                "suggested_value": None,
                "reason": "当前资料模板未提供获奖信息。",
            },
        ]
        draft = PrefillDraft(
            id=f"prefill_{uuid4().hex[:12]}",
            job_id=job.id,
            status="prefill_waiting_for_user",
            fields=fields,
            questions=questions,
            created_at=now(),
        )
        state.prefill_drafts.insert(0, draft)
        job.status = "prefill_ready"
        job.updated_at = now()
        add_event(state, "prefill.draft.created", "已生成简历预填草稿，等待人工确认低置信字段", {"job_id": job.id, "draft_id": draft.id})
        return draft

    return update_state(mutate)


def reset_state() -> State:
    state = State()
    save_state(state)
    return state
