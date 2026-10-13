"""Relational source of truth. Tenant-qualified foreign keys prevent mixed ownership."""

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column


def now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Identity:
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Owned(Identity):
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"), index=True)

    @declared_attr.directive
    def __table_args__(cls):
        return (UniqueConstraint("tenant_id", "id"),)


class CaseOwned(Owned):
    case_id: Mapped[UUID] = mapped_column(index=True)

    @declared_attr.directive
    def __table_args__(cls):
        return (
            UniqueConstraint("tenant_id", "id"),
            ForeignKeyConstraint(["tenant_id", "case_id"], ["cases.tenant_id", "cases.id"]),
        )


class Tenant(Identity, Base):
    __tablename__ = "tenants"
    name: Mapped[str] = mapped_column(String(120))
    demo_mode: Mapped[bool] = mapped_column(Boolean, default=True)


class User(Owned, Base):
    __tablename__ = "users"
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(40))
    department: Mapped[str] = mapped_column(String(40))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Patient(Owned, Base):
    __tablename__ = "patients"
    mrn: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(100))
    date_of_birth: Mapped[date] = mapped_column(Date)
    __table_args__ = (UniqueConstraint("tenant_id", "id"), UniqueConstraint("tenant_id", "mrn"))


class Referral(Owned, Base):
    __tablename__ = "referrals"
    patient_id: Mapped[UUID] = mapped_column()
    source: Mapped[str] = mapped_column(String(80), default="mock_ehr")
    external_reference: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(40), default="RECEIVED")
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (
        UniqueConstraint("tenant_id", "id"),
        UniqueConstraint("tenant_id", "external_reference"),
        ForeignKeyConstraint(["tenant_id", "patient_id"], ["patients.tenant_id", "patients.id"]),
    )


class Case(Owned, Base):
    __tablename__ = "cases"
    patient_id: Mapped[UUID] = mapped_column()
    referral_id: Mapped[UUID] = mapped_column()
    case_number: Mapped[str] = mapped_column(String(40))
    service_line: Mapped[str] = mapped_column(String(40), default="OUTPATIENT_MRI")
    coordinator_id: Mapped[UUID] = mapped_column()
    overall_status: Mapped[str] = mapped_column(String(40), default="ACTIVE", index=True)
    referral_status: Mapped[str] = mapped_column(String(40), default="RECEIVED")
    document_status: Mapped[str] = mapped_column(String(40), default="NOT_REVIEWED")
    insurance_status: Mapped[str] = mapped_column(String(40), default="NOT_STARTED")
    authorization_status: Mapped[str] = mapped_column(String(40), default="NOT_DETERMINED")
    scheduling_status: Mapped[str] = mapped_column(String(40), default="UNSCHEDULED")
    clinical_status: Mapped[str] = mapped_column(String(40), default="NOT_STARTED")
    financial_status: Mapped[str] = mapped_column(String(40), default="NOT_STARTED")
    scenario: Mapped[str] = mapped_column(String(60), default="normal")
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    __mapper_args__ = {"version_id_col": version}
    __table_args__ = (
        UniqueConstraint("tenant_id", "id"),
        UniqueConstraint("tenant_id", "case_number"),
        UniqueConstraint("tenant_id", "referral_id"),
        ForeignKeyConstraint(["tenant_id", "patient_id"], ["patients.tenant_id", "patients.id"]),
        ForeignKeyConstraint(["tenant_id", "referral_id"], ["referrals.tenant_id", "referrals.id"]),
        ForeignKeyConstraint(["tenant_id", "coordinator_id"], ["users.tenant_id", "users.id"]),
        CheckConstraint("version >= 1"),
        Index("ix_cases_owner", "tenant_id", "coordinator_id"),
    )


class ServiceOrder(CaseOwned, Base):
    __tablename__ = "service_orders"
    procedure_code: Mapped[str] = mapped_column(String(10), default="70551")
    body_region: Mapped[str] = mapped_column(String(30), default="brain")
    contrast_type: Mapped[str] = mapped_column(String(30), default="without")
    ordering_provider: Mapped[str] = mapped_column(String(100), default="Dr. Synthetic Example")
    performing_provider: Mapped[str] = mapped_column(String(80), default="SYN-RAD-01")
    location: Mapped[str] = mapped_column(String(80), default="SYN-MRI-A")
    validation_status: Mapped[str] = mapped_column(String(40), default="VALID")


class Document(CaseOwned, Base):
    __tablename__ = "documents"
    type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(120))
    storage_path: Mapped[str] = mapped_column(String(200))
    source: Mapped[str] = mapped_column(String(80), default="synthetic_fixture")
    version: Mapped[int] = mapped_column(Integer, default=1)
    verification_status: Mapped[str] = mapped_column(String(40), default="UNVERIFIED")
    content_hash: Mapped[str] = mapped_column(String(64))
    indexed: Mapped[bool] = mapped_column(Boolean, default=False)


class DocumentChunk(CaseOwned, Base):
    __tablename__ = "document_chunks"
    document_id: Mapped[UUID] = mapped_column()
    page_number: Mapped[int] = mapped_column(Integer)
    chunk_text: Mapped[str] = mapped_column(Text)
    search_vector: Mapped[Any] = mapped_column(TSVECTOR, nullable=True)
    __table_args__ = (
        UniqueConstraint("tenant_id", "id"),
        ForeignKeyConstraint(["tenant_id", "case_id"], ["cases.tenant_id", "cases.id"]),
        ForeignKeyConstraint(["tenant_id", "document_id"], ["documents.tenant_id", "documents.id"]),
        Index("ix_document_search", "search_vector", postgresql_using="gin"),
    )


class Coverage(CaseOwned, Base):
    __tablename__ = "coverages"
    payer_id: Mapped[str] = mapped_column(String(60), default="SYN-PAYER")
    plan_id: Mapped[str] = mapped_column(String(60), default="SYN-MRI-PLAN")
    member_id: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(40), default="NOT_STARTED")
    authorization_required: Mapped[bool] = mapped_column(Boolean, default=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    response: Mapped[dict] = mapped_column(JSONB, default=dict)


class Authorization(CaseOwned, Base):
    __tablename__ = "authorization_requests"
    requested_service: Mapped[dict] = mapped_column(JSONB)
    packet_document_ids: Mapped[list] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(40), default="PREPARING", index=True)
    payer_reference: Mapped[str | None] = mapped_column(String(80))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approval_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_service: Mapped[dict | None] = mapped_column(JSONB)


class AuthorizationEvent(CaseOwned, Base):
    __tablename__ = "authorization_events"
    authorization_id: Mapped[UUID] = mapped_column(ForeignKey("authorization_requests.id"))
    event_type: Mapped[str] = mapped_column(String(80))
    source: Mapped[str] = mapped_column(String(80))
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)


class Appointment(CaseOwned, Base):
    __tablename__ = "appointments"
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    location: Mapped[str] = mapped_column(String(80))
    performing_provider: Mapped[str] = mapped_column(String(80))
    procedure_code: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(40), default="CONFIRMED")
    reference: Mapped[str] = mapped_column(String(80), unique=True)


class ClinicalMilestone(CaseOwned, Base):
    __tablename__ = "clinical_milestones"
    milestone: Mapped[str] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(40))
    recorded_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Claim(CaseOwned, Base):
    __tablename__ = "claim_references"
    claim_number: Mapped[str] = mapped_column(String(80), unique=True)
    status: Mapped[str] = mapped_column(String(40))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("850.00"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Task(CaseOwned, Base):
    __tablename__ = "tasks"
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    task_type: Mapped[str] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(30), default="OPEN", index=True)
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    dedupe_key: Mapped[str] = mapped_column(String(200), unique=True)
    details: Mapped[dict] = mapped_column(JSONB, default=dict)


class AgentRun(CaseOwned, Base):
    __tablename__ = "agent_runs"
    agent_name: Mapped[str] = mapped_column(String(60))
    trigger: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(40), default="RUNNING")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    result: Mapped[dict] = mapped_column(JSONB, default=dict)
    correlation_id: Mapped[UUID] = mapped_column()


class Proposal(CaseOwned, Base):
    __tablename__ = "action_proposals"
    agent_run_id: Mapped[UUID | None] = mapped_column(ForeignKey("agent_runs.id"))
    action_type: Mapped[str] = mapped_column(String(80))
    target_system: Mapped[str] = mapped_column(String(80))
    target_reference: Mapped[str] = mapped_column(String(120))
    proposed_payload: Mapped[dict] = mapped_column(JSONB)
    payload_hash: Mapped[str] = mapped_column(String(64))
    risk_level: Mapped[str] = mapped_column(String(30), default="consequential")
    required_permission: Mapped[str] = mapped_column(String(60))
    required_approver_role: Mapped[list] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(40), default="AWAITING_APPROVAL", index=True)
    case_version: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    dedupe_key: Mapped[str] = mapped_column(String(200), unique=True)
    receipt: Mapped[dict | None] = mapped_column(JSONB)
    revision_of: Mapped[UUID | None] = mapped_column(ForeignKey("action_proposals.id"))


class Approval(Owned, Base):
    __tablename__ = "approvals"
    action_proposal_id: Mapped[UUID] = mapped_column(ForeignKey("action_proposals.id"))
    reviewer_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    decision: Mapped[str] = mapped_column(String(40))
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    reason: Mapped[str] = mapped_column(String(500), default="")
    payload_hash: Mapped[str] = mapped_column(String(64))


class CaseEvent(CaseOwned, Base):
    __tablename__ = "case_events"
    event_type: Mapped[str] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(80))
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"))
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    correlation_id: Mapped[UUID] = mapped_column(index=True)
    causation_id: Mapped[UUID | None] = mapped_column()
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    __table_args__ = (
        UniqueConstraint("tenant_id", "id"),
        ForeignKeyConstraint(["tenant_id", "case_id"], ["cases.tenant_id", "cases.id"]),
        Index("ix_case_timeline", "case_id", "created_at"),
    )


class OutboxEvent(CaseOwned, Base):
    __tablename__ = "outbox_events"
    event_id: Mapped[UUID] = mapped_column(ForeignKey("case_events.id"), unique=True)
    event_type: Mapped[str] = mapped_column(String(100))
    payload: Mapped[dict] = mapped_column(JSONB)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)


class Job(CaseOwned, Base):
    __tablename__ = "jobs"
    job_type: Mapped[str] = mapped_column(String(80))
    payload: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(40), default="PENDING")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    run_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_token: Mapped[UUID | None] = mapped_column()
    idempotency_key: Mapped[str] = mapped_column(String(200), unique=True)
    last_error: Mapped[str | None] = mapped_column(String(120))
    __table_args__ = (
        UniqueConstraint("tenant_id", "id"),
        ForeignKeyConstraint(["tenant_id", "case_id"], ["cases.tenant_id", "cases.id"]),
        Index("ix_job_queue", "status", "run_after"),
    )


class Conversation(Owned, Base):
    __tablename__ = "conversations"
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    scope: Mapped[str] = mapped_column(String(40))
    case_id: Mapped[UUID | None] = mapped_column(ForeignKey("cases.id"))


class Message(Owned, Base):
    __tablename__ = "messages"
    conversation_id: Mapped[UUID] = mapped_column(ForeignKey("conversations.id"))
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    sources: Mapped[list] = mapped_column(JSONB, default=list)


class AuditLog(Owned, Base):
    __tablename__ = "audit_logs"
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100))
    resource: Mapped[str] = mapped_column(String(200))
    correlation_id: Mapped[UUID] = mapped_column(index=True)
    details: Mapped[dict] = mapped_column(JSONB, default=dict)


class IntegrationReceipt(CaseOwned, Base):
    __tablename__ = "integration_receipts"
    proposal_id: Mapped[UUID] = mapped_column(ForeignKey("action_proposals.id"), unique=True)
    system: Mapped[str] = mapped_column(String(60))
    result: Mapped[dict] = mapped_column(JSONB)


class IncomingEvent(CaseOwned, Base):
    __tablename__ = "incoming_events"
    external_event_id: Mapped[str] = mapped_column(String(100))
    event_type: Mapped[str] = mapped_column(String(100))
    payload_hash: Mapped[str] = mapped_column(String(64))
    result: Mapped[dict] = mapped_column(JSONB)
    __table_args__ = (
        UniqueConstraint("tenant_id", "id"),
        UniqueConstraint("tenant_id", "external_event_id"),
        ForeignKeyConstraint(["tenant_id", "case_id"], ["cases.tenant_id", "cases.id"]),
    )
