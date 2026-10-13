"""Typed public read contracts for frontend code generation."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class Record(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    created_at: datetime


class CaseView(Record):
    patient_id: UUID
    referral_id: UUID
    case_number: str
    service_line: str
    coordinator_id: UUID
    overall_status: str
    referral_status: str
    document_status: str
    insurance_status: str
    authorization_status: str
    scheduling_status: str
    clinical_status: str
    financial_status: str
    scenario: str
    priority: str
    version: int
    updated_at: datetime


class PatientView(Record):
    mrn: str
    name: str
    date_of_birth: date


class CasePage(BaseModel):
    items: list[CaseView]
    total: int
    offset: int
    limit: int


class DocumentView(Record):
    case_id: UUID
    type: str
    title: str
    storage_path: str
    source: str
    version: int
    verification_status: str
    content_hash: str
    indexed: bool


class ProposalView(Record):
    case_id: UUID
    agent_run_id: UUID | None
    action_type: str
    target_system: str
    target_reference: str
    proposed_payload: dict[str, Any]
    payload_hash: str
    risk_level: str
    required_permission: str
    required_approver_role: list[str]
    status: str
    case_version: int
    expires_at: datetime
    dedupe_key: str
    receipt: dict | None
    revision_of: UUID | None


class TaskView(Record):
    case_id: UUID
    owner_id: UUID
    task_type: str
    status: str
    priority: str
    due_at: datetime
    dedupe_key: str
    details: dict


class AuthorizationView(Record):
    case_id: UUID
    requested_service: dict
    packet_document_ids: list[str]
    status: str
    payer_reference: str | None
    submitted_at: datetime | None
    decision_at: datetime | None
    approval_expires_at: datetime | None
    approved_service: dict | None


class AppointmentView(Record):
    case_id: UUID
    scheduled_at: datetime
    location: str
    performing_provider: str
    procedure_code: str
    status: str
    reference: str


class ClaimView(Record):
    case_id: UUID
    claim_number: str
    status: str
    amount: Decimal
    resolved_at: datetime | None


class TimelineView(Record):
    case_id: UUID
    event_type: str
    source: str
    actor_id: UUID | None
    payload: dict
    correlation_id: UUID
    causation_id: UUID | None
    schema_version: int


class ReadinessView(BaseModel):
    administratively_ready: bool
    blockers: list[str]
    missing_documents: list[str]
    clinical_clearance: str
    case_version: int
