from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Login(Contract):
    user_id: UUID


class ReferralInput(Contract):
    synthetic_fixture_id: int = Field(ge=1, le=100)
    external_reference: str = Field(min_length=1, max_length=100, pattern=r"^SYN-[A-Za-z0-9_-]+$")
    procedure_code: Literal["70551", "70552", "70553"] = "70551"
    location: Literal["SYN-MRI-A", "SYN-MRI-B"] = "SYN-MRI-A"
    scenario: Literal[
        "normal",
        "missing_note",
        "ambiguous_identity",
        "invalid_order",
        "payer_timeout",
        "transmission_failure",
        "not_required",
    ] = "missing_note"


class DocumentInput(Contract):
    fixture_type: Literal["order", "physician_note", "payer_letter", "final_report"]
    variant: Literal["standard", "prompt_injection"] = "standard"


class DecisionInput(Contract):
    reason: str = Field(default="", max_length=500)


class AppointmentInput(Contract):
    scheduled_at: datetime | None = None
    location: Literal["SYN-MRI-A", "SYN-MRI-B"] = "SYN-MRI-A"
    tentative: bool = False

    @field_validator("scheduled_at")
    @classmethod
    def utc_date(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("Timezone required")
        return value


class TaskInput(Contract):
    case_id: UUID
    task_type: Literal["administrative_follow_up", "document_review", "billing_review"]
    owner_id: UUID | None = None


class TaskUpdate(Contract):
    status: Literal["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELED"]
    owner_id: UUID | None = None


class AssistantInput(Contract):
    message: str = Field(min_length=1, max_length=2000)
    scope: Literal["case", "work_queue", "authorized_search"] = "case"
    case_id: UUID | None = None
    conversation_id: UUID | None = None


class AgentInput(Contract):
    case_id: UUID


class DemoEventInput(Contract):
    case_id: UUID
    external_event_id: str = Field(min_length=1, max_length=100, pattern=r"^SYN-[A-Za-z0-9_-]+$")
    event_type: Literal[
        "document_received",
        "authorization_approved",
        "authorization_denied",
        "authorization_more_information",
        "authorization_expired",
        "appointment_rescheduled",
        "appointment_canceled",
        "no_show",
        "claim_submitted",
        "claim_denied",
        "claim_paid",
        "claim_rejected",
        "financial_adjusted",
    ]
    mismatch_location: bool = False
    expire: bool = False


class ClinicalInput(Contract):
    milestone: Literal[
        "PREVISIT_REVIEW",
        "READY",
        "CLINICAL_HOLD",
        "SERVICE_COMPLETED",
        "REPORT_FINAL",
        "COMMUNICATION_COMPLETE",
    ]
    expected_version: int = Field(ge=1)
    synthetic_attestation: Literal[True]


class ClosureInput(Contract):
    disposition: Literal[
        "CLINICALLY_RESOLVED", "FINANCIAL_FOLLOW_UP", "FULLY_RESOLVED", "CANCELED", "TRANSFERRED"
    ]
    reason: str = Field(default="", max_length=500)


class TranscriptInput(Contract):
    transcript: str = Field(min_length=1, max_length=2000)


class SpeechInput(Contract):
    text: str = Field(min_length=1, max_length=2000)


class Source(Contract):
    record_type: str
    record_id: UUID
    title: str
    document_id: UUID | None = None
    page: int | None = None
    version: int | None = None
    excerpt: str | None = None


class AssistantResponse(Contract):
    conversation_id: UUID
    scope: str
    case_id: UUID | None
    answer: str
    sources: list[Source]
    proposed_actions: list[dict] = Field(default_factory=list)
    unresolved_questions: list[str] = Field(default_factory=list)
    provider: str = "mock"
