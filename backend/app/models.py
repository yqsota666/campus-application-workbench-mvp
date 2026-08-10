from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


JobStatus = Literal[
    "capture_waiting_review",
    "needs_more_evidence",
    "rejected",
    "job_ready",
    "auth_waiting_for_user",
    "auth_ready",
    "prefill_ready",
    "submitted",
    "tracking",
    "closed",
]


class Event(BaseModel):
    id: str
    type: str
    message: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class CaptureRun(BaseModel):
    id: str
    run_date: str
    status: Literal["completed", "failed"]
    created_count: int
    review_count: int
    created_at: datetime


class ReviewChecks(BaseModel):
    source_confirmed: bool = False
    fields_confirmed: bool = False
    deadline_confirmed: bool = False
    fit_confirmed: bool = False
    notes: str | None = None
    reviewed_at: datetime | None = None

    @property
    def passed(self) -> bool:
        return all(
            [
                self.source_confirmed,
                self.fields_confirmed,
                self.deadline_confirmed,
                self.fit_confirmed,
            ]
        )


class Job(BaseModel):
    id: str
    company: str
    job_name: str
    location: str
    batch: str
    source_type: str
    source_url: str
    first_seen_at: str
    fit_score: int = Field(ge=0, le=100)
    fit_reason: list[str] = Field(default_factory=list)
    status: JobStatus = "capture_waiting_review"
    evidence_id: str
    evidence: dict[str, Any] = Field(default_factory=dict)
    review: ReviewChecks = Field(default_factory=ReviewChecks)
    created_at: datetime
    updated_at: datetime


class ReviewRequest(BaseModel):
    source_confirmed: bool
    fields_confirmed: bool
    deadline_confirmed: bool
    fit_confirmed: bool
    notes: str | None = None


class AuthSession(BaseModel):
    id: str
    job_id: str
    status: Literal["auth_waiting_for_user", "auth_ready"]
    blocked_reason: str | None = None
    manual_steps_required: list[str] = Field(default_factory=list)
    confirmed_by_user: bool = False
    created_at: datetime
    updated_at: datetime


class CreateAuthSessionRequest(BaseModel):
    job_id: str
    blocked_reason: str = "login_required"
    manual_steps_required: list[str] = Field(
        default_factory=lambda: ["captcha_or_sms_if_present", "agreement_confirmation"]
    )


class ConfirmAuthRequest(BaseModel):
    confirmed_by_user: bool = True
    notes: str | None = None


class PrefillField(BaseModel):
    field: str
    value: Any
    confidence: Literal["high", "medium", "low"]
    action: Literal["fill", "ask_user", "skip"]
    reason: str | None = None


class PrefillDraft(BaseModel):
    id: str
    job_id: str
    status: Literal["prefill_ready", "prefill_waiting_for_user"]
    fields: list[PrefillField]
    questions: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime


class State(BaseModel):
    jobs: list[Job] = Field(default_factory=list)
    capture_runs: list[CaptureRun] = Field(default_factory=list)
    auth_sessions: list[AuthSession] = Field(default_factory=list)
    prefill_drafts: list[PrefillDraft] = Field(default_factory=list)
    events: list[Event] = Field(default_factory=list)
