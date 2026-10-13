import hashlib
import json
from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID, uuid4

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from careflow import workflow
from careflow.events import audit, emit
from careflow.integrations import gateway
from careflow.models import (
    Appointment,
    Approval,
    Authorization,
    AuthorizationEvent,
    Case,
    Document,
    IntegrationReceipt,
    Job,
    Proposal,
    User,
    now,
)
from careflow.schemas import Contract
from careflow.security import Actor, load_case, require


class DocumentRequest(Contract):
    recipient: Literal["SYN-REFERRING-PROVIDER", "SYN-PAYER"]
    missing_documents: list[Literal["order", "physician_note"]]
    body: str = Field(max_length=500)
    source_document_ids: list[UUID]


class AuthorizationSubmission(Contract):
    authorization_id: UUID
    source_document_ids: list[UUID]
    service: dict[str, str]


class AppointmentBooking(Contract):
    scheduled_at: datetime
    location: Literal["SYN-MRI-A", "SYN-MRI-B"]
    performing_provider: Literal["SYN-RAD-01"]
    procedure_code: Literal["70551", "70552", "70553"]
    tentative: bool = False


class Closure(Contract):
    disposition: Literal[
        "CLINICALLY_RESOLVED", "FINANCIAL_FOLLOW_UP", "FULLY_RESOLVED", "CANCELED", "TRANSFERRED"
    ]
    reason: str = Field(default="", max_length=500)


POLICIES: dict[str, tuple[type[Contract], str, list[str], str]] = {
    "document_request": (
        DocumentRequest,
        "approve_message",
        ["coordinator", "authorization_specialist", "demo_admin"],
        "mock_messaging",
    ),
    "follow_up": (
        DocumentRequest,
        "approve_message",
        ["coordinator", "authorization_specialist", "billing_specialist", "demo_admin"],
        "mock_messaging",
    ),
    "authorization_submission": (
        AuthorizationSubmission,
        "approve_authorization",
        ["authorization_specialist", "demo_admin"],
        "mock_payer",
    ),
    "appointment_booking": (
        AppointmentBooking,
        "approve_appointment",
        ["scheduler", "demo_admin"],
        "mock_scheduling",
    ),
    "case_closure": (
        Closure,
        "approve_closure",
        ["coordinator", "demo_admin"],
        "internal_disposition",
    ),
}


def digest(payload: dict) -> str:
    return hashlib.sha256(
        json.dumps(jsonable_encoder(payload), sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


async def propose(
    db: AsyncSession,
    actor: Actor,
    case: Case,
    action: str,
    payload: dict,
    run_id: UUID | None = None,
    revision_of: UUID | None = None,
) -> Proposal:
    if action not in POLICIES:
        raise HTTPException(403, "Unregistered consequential action")
    schema, permission, roles, system = POLICIES[action]
    # Preparing a proposal still requires a relevant domain permission.
    required = {
        "document_request": "documents",
        "follow_up": "tasks",
        "authorization_submission": "authorization",
        "appointment_booking": "scheduling",
        "case_closure": "approve_closure",
    }[action]
    require(actor, required)
    try:
        payload = schema.model_validate(payload).model_dump(mode="json")
    except ValidationError:
        raise HTTPException(422, "Invalid action proposal payload") from None
    if action == "case_closure":
        target = payload["disposition"]
        if target not in workflow.TRANSITIONS["overall"].get(case.overall_status, set()):
            raise HTTPException(409, "Invalid proposed case disposition")
        if target in {"CANCELED", "TRANSFERRED"} and not payload["reason"].strip():
            raise HTTPException(422, "Disposition reason required")
        if (
            target in {"CLINICALLY_RESOLVED", "FINANCIAL_FOLLOW_UP", "FULLY_RESOLVED"}
            and case.clinical_status != "COMMUNICATION_COMPLETE"
        ):
            raise HTTPException(409, "Clinical referral communication incomplete")
        if target == "FULLY_RESOLVED" and case.financial_status not in workflow.FINANCIAL_RESOLVED:
            raise HTTPException(409, "Financial workstream unresolved")
    await db.flush()
    payload_hash = digest(payload)
    key = (
        f"{case.id}/{case.version}/{action}/{payload_hash}" if revision_of is None else str(uuid4())
    )
    old = await db.scalar(
        select(Proposal).where(Proposal.tenant_id == actor.tenant_id, Proposal.dedupe_key == key)
    )
    if old:
        return old
    p = Proposal(
        tenant_id=actor.tenant_id,
        case_id=case.id,
        agent_run_id=run_id,
        action_type=action,
        target_system=system,
        target_reference=payload.get("recipient", str(case.id)),
        proposed_payload=payload,
        payload_hash=payload_hash,
        required_permission=permission,
        required_approver_role=roles,
        case_version=case.version,
        expires_at=now() + timedelta(hours=24),
        dedupe_key=key,
        revision_of=revision_of,
    )
    db.add(p)
    await db.flush()
    await emit(
        db,
        actor,
        case,
        "ActionProposed",
        {"proposal_id": str(p.id), "action_type": action, "payload_hash": payload_hash},
    )
    return p


async def validate(db: AsyncSession, actor: Actor, case: Case, p: Proposal) -> str | None:
    if p.expires_at < now():
        return "EXPIRED"
    if p.payload_hash != digest(p.proposed_payload) or p.case_version != case.version:
        return "STALE"
    if p.action_type not in POLICIES:
        return "STALE"
    schema, permission, roles, system = POLICIES[p.action_type]
    if (
        permission != p.required_permission
        or roles != p.required_approver_role
        or system != p.target_system
    ):
        return "STALE"
    payload = schema.model_validate(p.proposed_payload).model_dump(mode="json")
    for doc_id in payload.get("source_document_ids", []):
        doc = await db.scalar(
            select(Document).where(
                Document.id == UUID(doc_id),
                Document.tenant_id == actor.tenant_id,
                Document.case_id == case.id,
            )
        )
        if doc is None:
            return "STALE"
        if p.action_type == "authorization_submission" and doc.verification_status != "VERIFIED":
            return "STALE"
    if p.action_type == "authorization_submission":
        auth = await db.scalar(
            select(Authorization).where(
                Authorization.id == UUID(payload["authorization_id"]),
                Authorization.tenant_id == actor.tenant_id,
                Authorization.case_id == case.id,
            )
        )
        if (
            not auth
            or auth.status != "PREPARING"
            or auth.requested_service != payload["service"]
            or auth.packet_document_ids != payload["source_document_ids"]
        ):
            return "STALE"
        if await workflow.missing_documents(db, actor, case):
            return "STALE"
    if p.action_type == "appointment_booking":
        when = datetime.fromisoformat(payload["scheduled_at"])
        if when.tzinfo is None or when <= now():
            return "STALE"
        if (
            not payload["tentative"]
            and not (await workflow.readiness(db, actor, case, payload))["administratively_ready"]
        ):
            return "STALE"
    return None


async def get_proposal(
    db: AsyncSession, actor: Actor, proposal_id: UUID, lock: bool = False
) -> Proposal:
    q = select(Proposal).where(Proposal.id == proposal_id, Proposal.tenant_id == actor.tenant_id)
    if lock:
        q = q.with_for_update()
    p = await db.scalar(q)
    if p is None:
        raise HTTPException(404, "Proposal not found")
    await load_case(db, actor, p.case_id)
    return p


async def decide(
    db: AsyncSession, actor: Actor, proposal_id: UUID, decision: str, reason: str = ""
) -> Proposal:
    p = await get_proposal(db, actor, proposal_id)
    case = await load_case(db, actor, p.case_id, lock=True)
    p = await get_proposal(db, actor, proposal_id, lock=True)
    if actor.agent_name or actor.id is None:
        raise HTTPException(403, "A human reviewer is required")
    require(actor, p.required_permission)
    if actor.role not in p.required_approver_role:
        raise HTTPException(403, "This role cannot review this proposal")
    if p.status != "AWAITING_APPROVAL":
        raise HTTPException(409, f"Proposal is {p.status}")
    invalid = await validate(db, actor, case, p)
    if invalid:
        p.status = invalid
        await emit(
            db, actor, case, "ApprovalInvalidated", {"proposal_id": str(p.id), "reason": invalid}
        )
        return p
    p.status = decision
    db.add(
        Approval(
            tenant_id=actor.tenant_id,
            action_proposal_id=p.id,
            reviewer_id=actor.id,
            decision=decision,
            reason=reason,
            payload_hash=p.payload_hash,
        )
    )
    if decision == "APPROVED":
        db.add(
            Job(
                tenant_id=actor.tenant_id,
                case_id=case.id,
                job_type="execute_proposal",
                payload={"proposal_id": str(p.id), "correlation_id": str(actor.correlation_id)},
                idempotency_key=f"execute/{p.id}",
            )
        )
    await emit(
        db, actor, case, f"Action{decision.title()}", {"proposal_id": str(p.id), "reason": reason}
    )
    return p


async def execute(db: AsyncSession, actor: Actor, proposal_id: UUID) -> dict:
    p = await get_proposal(db, actor, proposal_id)
    case = await load_case(db, actor, p.case_id, lock=True)
    p = await get_proposal(db, actor, proposal_id, lock=True)
    receipt = await db.scalar(
        select(IntegrationReceipt).where(
            IntegrationReceipt.tenant_id == actor.tenant_id, IntegrationReceipt.proposal_id == p.id
        )
    )
    if receipt:
        return receipt.result
    if p.status != "APPROVED":
        raise HTTPException(409, "Approved proposal required")
    approval = await db.scalar(
        select(Approval)
        .where(
            Approval.tenant_id == actor.tenant_id,
            Approval.action_proposal_id == p.id,
            Approval.decision == "APPROVED",
        )
        .order_by(Approval.decided_at.desc())
    )
    reviewer = (
        await db.scalar(
            select(User).where(
                User.id == approval.reviewer_id,
                User.tenant_id == actor.tenant_id,
                User.active.is_(True),
            )
        )
        if approval
        else None
    )
    if (
        not approval
        or not reviewer
        or reviewer.role not in p.required_approver_role
        or approval.payload_hash != p.payload_hash
    ):
        raise HTTPException(403, "Valid current human approval required")
    invalid = await validate(db, actor, case, p)
    if invalid:
        p.status = invalid
        await emit(
            db, actor, case, "ApprovalInvalidated", {"proposal_id": str(p.id), "reason": invalid}
        )
        return {"status": invalid, "simulated": True}
    p.status = "EXECUTING"
    payload = p.proposed_payload
    result = await gateway.execute(p.action_type, str(p.id), payload, case.scenario)
    if p.action_type == "authorization_submission":
        auth = await db.scalar(
            select(Authorization).where(
                Authorization.id == UUID(payload["authorization_id"]),
                Authorization.tenant_id == actor.tenant_id,
            )
        )
        if auth is None:
            raise HTTPException(409, "Approved authorization reference disappeared")
        auth.status = "SUBMITTED"
        auth.payer_reference = result["reference"]
        auth.submitted_at = now()
        await workflow.transition(db, actor, case, "authorization", "SUBMITTED", approval=True)
        auth.status = "PENDING"
        await workflow.transition(db, actor, case, "authorization", "PENDING")
        db.add(
            AuthorizationEvent(
                tenant_id=actor.tenant_id,
                case_id=case.id,
                authorization_id=auth.id,
                event_type="AuthorizationSubmitted",
                source="mock_payer",
                payload=result,
            )
        )
        await emit(
            db, actor, case, "AuthorizationSubmitted", {"authorization_id": str(auth.id), **result}
        )
    elif p.action_type == "appointment_booking":
        from careflow.services import rows

        for old in await rows(db, actor, Appointment, case.id):
            if old.status in {"TENTATIVE", "CONFIRMED"}:
                old.status = "CANCELED"
        state = "TENTATIVE" if payload["tentative"] else "CONFIRMED"
        appt = Appointment(
            tenant_id=actor.tenant_id,
            case_id=case.id,
            scheduled_at=datetime.fromisoformat(payload["scheduled_at"]),
            location=payload["location"],
            performing_provider=payload["performing_provider"],
            procedure_code=payload["procedure_code"],
            status=state,
            reference=result["reference"],
        )
        db.add(appt)
        # Readiness uses the proposed appointment, including location/provider/date.
        if (
            not payload["tentative"]
            and not (await workflow.readiness(db, actor, case, payload))["administratively_ready"]
        ):
            raise HTTPException(409, "Proposed appointment is not cleared")
        await workflow.transition(db, actor, case, "scheduling", state, approval=True)
        if case.scheduling_status == state:
            case.updated_at = now()
            await db.flush()
        await emit(db, actor, case, "AppointmentScheduled", result)
    elif p.action_type == "case_closure":
        await workflow.transition(
            db,
            actor,
            case,
            "overall",
            payload["disposition"],
            approval=True,
            reason=payload["reason"],
        )
        await emit(
            db,
            actor,
            case,
            "CaseDispositionRecorded",
            {"disposition": payload["disposition"], "proposal_id": str(p.id)},
        )
    else:
        await emit(
            db, actor, case, "MockCommunicationDelivered", {"proposal_id": str(p.id), **result}
        )
    p.status = "COMPLETED"
    p.receipt = result
    db.add(
        IntegrationReceipt(
            tenant_id=actor.tenant_id,
            case_id=case.id,
            proposal_id=p.id,
            system=p.target_system,
            result=result,
        )
    )
    await audit(
        db,
        actor,
        "SimulatedActionExecuted",
        f"proposals/{p.id}",
        {"reference": result["reference"]},
    )
    return result
