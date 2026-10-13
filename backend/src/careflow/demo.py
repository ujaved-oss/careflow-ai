from datetime import timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from careflow import workflow
from careflow.approvals import digest
from careflow.documents import ingest
from careflow.events import emit
from careflow.models import (
    Appointment,
    Authorization,
    AuthorizationEvent,
    Claim,
    Document,
    IncomingEvent,
    now,
)
from careflow.schemas import ClinicalInput, DemoEventInput
from careflow.security import Actor, load_case, require
from careflow.services import rows


async def clinical_event(db: AsyncSession, actor: Actor, case_id: UUID, data: ClinicalInput):
    require(actor, "clinical")
    case = await load_case(db, actor, case_id, lock=True)
    if data.milestone == "REPORT_FINAL":
        reports = [
            d
            for d in await rows(db, actor, Document, case.id)
            if d.type == "final_report" and d.verification_status == "VERIFIED"
        ]
        if not reports:
            raise HTTPException(409, "Verified synthetic final report required")
    await workflow.transition(db, actor, case, "clinical", data.milestone, data.expected_version)
    from careflow.models import ClinicalMilestone

    db.add(
        ClinicalMilestone(
            tenant_id=actor.tenant_id,
            case_id=case.id,
            milestone=data.milestone,
            status="RECORDED_BY_QUALIFIED_STAFF",
            recorded_by=actor.id,
        )
    )
    if data.milestone == "SERVICE_COMPLETED":
        # A clinician can update the associated administrative appointment completion.
        from dataclasses import replace

        system = replace(actor, role="demo_admin")
        await workflow.transition(db, system, case, "scheduling", "COMPLETED")
        for appointment in await rows(db, actor, Appointment, case.id):
            if appointment.status == "CONFIRMED":
                appointment.status = "COMPLETED"
    name = {
        "SERVICE_COMPLETED": "ImagingCompleted",
        "REPORT_FINAL": "ReportFinalized",
        "COMMUNICATION_COMPLETE": "ReferralCommunicationCompleted",
    }.get(data.milestone, "ClinicalMilestoneRecorded")
    await emit(
        db, actor, case, name, {"milestone": data.milestone, "qualified_human": str(actor.id)}
    )
    return case


async def apply_event(db: AsyncSession, actor: Actor, data: DemoEventInput):
    require(actor, "demo")
    case = await load_case(db, actor, data.case_id, lock=True)
    payload_hash = digest(data.model_dump(mode="json"))
    previous = await db.scalar(
        select(IncomingEvent).where(
            IncomingEvent.tenant_id == actor.tenant_id,
            IncomingEvent.external_event_id == data.external_event_id,
        )
    )
    if previous:
        if previous.payload_hash != payload_hash:
            raise HTTPException(409, "Event ID already used with different content")
        return {**previous.result, "duplicate": True}
    event_type = data.event_type
    result = {"simulated": True, "event_type": event_type, "case_id": str(case.id)}
    if event_type == "document_received":
        document = await ingest(db, actor, case, "physician_note", verified=True)
        await emit(
            db,
            actor,
            case,
            "DocumentVerified",
            {"document_id": str(document.id), "source": "mock_ehr"},
        )
        result["document_id"] = str(document.id)
    elif event_type.startswith("authorization_"):
        auths = await rows(db, actor, Authorization, case.id)
        if not auths:
            raise HTTPException(409, "No authorization request exists")
        auth = auths[-1]
        state = {
            "authorization_approved": "APPROVED",
            "authorization_denied": "DENIED",
            "authorization_more_information": "MORE_INFORMATION",
            "authorization_expired": "EXPIRED",
        }[event_type]
        await workflow.transition(db, actor, case, "authorization", state)
        auth.status = state
        auth.decision_at = now()
        if state == "APPROVED":
            auth.approved_service = {
                **auth.requested_service,
                "valid_from": (now() - timedelta(days=1)).isoformat(),
            }
            if data.mismatch_location:
                auth.approved_service = {
                    **auth.approved_service,
                    "location": "SYN-MRI-B"
                    if auth.requested_service["location"] == "SYN-MRI-A"
                    else "SYN-MRI-A",
                }
            auth.approval_expires_at = now() + timedelta(days=-1 if data.expire else 30)
            await db.flush()
            ready = await workflow.readiness(db, actor, case)
            if "authorization_expired" in ready["blockers"]:
                await workflow.transition(db, actor, case, "authorization", "EXPIRED")
                auth.status = "EXPIRED"
            elif any("mismatch" in b for b in ready["blockers"]):
                await workflow.transition(db, actor, case, "authorization", "MISMATCH")
                auth.status = "MISMATCH"
            if auth.status != "APPROVED":
                from careflow.services import task

                await task(
                    db,
                    actor,
                    case,
                    "authorization_exception",
                    details={"blockers": ready["blockers"]},
                )
        db.add(
            AuthorizationEvent(
                tenant_id=actor.tenant_id,
                case_id=case.id,
                authorization_id=auth.id,
                event_type=event_type,
                source="mock_payer",
                payload={"status": auth.status, "external_event_id": data.external_event_id},
            )
        )
        await emit(
            db,
            actor,
            case,
            "AuthorizationApproved" if auth.status == "APPROVED" else "AuthorizationException",
            {"authorization_id": str(auth.id), "status": auth.status},
        )
        result["authorization_status"] = auth.status
    elif event_type in {"appointment_rescheduled", "appointment_canceled", "no_show"}:
        appointments = [
            a
            for a in await rows(db, actor, Appointment, case.id)
            if a.status in {"CONFIRMED", "TENTATIVE"}
        ]
        if not appointments:
            raise HTTPException(409, "No active appointment")
        appointment = appointments[-1]
        if event_type == "appointment_rescheduled":
            appointment.location = (
                "SYN-MRI-B" if appointment.location == "SYN-MRI-A" else "SYN-MRI-A"
            )
            appointment.scheduled_at += timedelta(days=2)
            appointment.status = "TENTATIVE"
            await workflow.transition(db, actor, case, "scheduling", "TENTATIVE")
            ready = await workflow.readiness(db, actor, case)
            if not ready["administratively_ready"] and case.authorization_status == "APPROVED":
                await workflow.transition(db, actor, case, "authorization", "MISMATCH")
                (await rows(db, actor, Authorization, case.id))[-1].status = "MISMATCH"
            await emit(
                db,
                actor,
                case,
                "AppointmentChanged",
                {"administrative_blockers": ready["blockers"]},
            )
        else:
            state = "NO_SHOW" if event_type == "no_show" else "CANCELED"
            appointment.status = state
            await workflow.transition(db, actor, case, "scheduling", state)
            await emit(db, actor, case, "AppointmentChanged", {"status": state})
    else:
        require(actor, "billing")
        claims = await rows(db, actor, Claim, case.id)
        if not claims:
            if case.financial_status == "NOT_STARTED":
                await workflow.transition(db, actor, case, "financial", "CLAIM_PREPARATION")
            claim = Claim(
                tenant_id=actor.tenant_id,
                case_id=case.id,
                claim_number=f"SYN-CLAIM-{case.id}",
                status="CLAIM_PREPARATION",
                amount=Decimal("850.00"),
            )
            db.add(claim)
            await db.flush()
        else:
            claim = claims[-1]
        state = {
            "claim_submitted": "SUBMITTED",
            "claim_denied": "DENIED",
            "claim_paid": "PAID",
            "claim_rejected": "REJECTED",
            "financial_adjusted": "ADJUSTED",
        }[event_type]
        await workflow.transition(db, actor, case, "financial", state)
        claim.status = state
        if state in workflow.FINANCIAL_RESOLVED:
            claim.resolved_at = now()
        await emit(
            db,
            actor,
            case,
            "PaymentResolved" if state in workflow.FINANCIAL_RESOLVED else "ClaimChanged",
            {"claim_id": str(claim.id), "status": state},
        )
    incoming = IncomingEvent(
        tenant_id=actor.tenant_id,
        case_id=case.id,
        external_event_id=data.external_event_id,
        event_type=event_type,
        payload_hash=payload_hash,
        result=result,
    )
    db.add(incoming)
    return result
