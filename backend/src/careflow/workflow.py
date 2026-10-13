from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from careflow.events import emit
from careflow.models import Appointment, Authorization, Case, Document, ServiceOrder, Task, now
from careflow.security import Actor, require

REQUIRED_DOCUMENTS = {"order", "physician_note"}
TRANSITIONS = {
    "referral": {
        "RECEIVED": {"VALIDATING"},
        "VALIDATING": {"ACCEPTED", "NEEDS_INFORMATION", "REDIRECTED", "DECLINED"},
        "NEEDS_INFORMATION": {"VALIDATING"},
    },
    "document": {
        "NOT_REVIEWED": {"REVIEWING"},
        "REVIEWING": {"COMPLETE", "MISSING", "NEEDS_CORRECTION"},
        "MISSING": {"REVIEWING"},
        "NEEDS_CORRECTION": {"REVIEWING"},
        "COMPLETE": {"REVIEWING"},
    },
    "insurance": {
        "NOT_STARTED": {"CHECKING"},
        "CHECKING": {"VERIFIED", "DISCREPANCY", "SELF_PAY", "UNRESOLVED"},
        "VERIFIED": {"CHECKING"},
        "DISCREPANCY": {"CHECKING"},
        "UNRESOLVED": {"CHECKING"},
        "SELF_PAY": {"CHECKING"},
    },
    "authorization": {
        "NOT_DETERMINED": {"REQUIRED", "NOT_REQUIRED"},
        "REQUIRED": {"PREPARING"},
        "PREPARING": {"SUBMITTED"},
        "SUBMITTED": {"PENDING", "APPROVED", "DENIED", "MORE_INFORMATION"},
        "PENDING": {"APPROVED", "DENIED", "MORE_INFORMATION", "CANCELED"},
        "MORE_INFORMATION": {"PREPARING", "CANCELED"},
        "DENIED": {"PREPARING", "CANCELED"},
        "APPROVED": {"EXPIRED", "MISMATCH", "CANCELED"},
        "EXPIRED": {"PREPARING"},
        "MISMATCH": {"PREPARING", "CANCELED"},
        "NOT_REQUIRED": {"REQUIRED"},
    },
    "scheduling": {
        "UNSCHEDULED": {"OUTREACH", "TENTATIVE", "CONFIRMED"},
        "OUTREACH": {"TENTATIVE", "CONFIRMED", "CANCELED"},
        "TENTATIVE": {"CONFIRMED", "CANCELED"},
        "CONFIRMED": {"COMPLETED", "CANCELED", "NO_SHOW", "TENTATIVE"},
        "CANCELED": {"OUTREACH", "TENTATIVE", "CONFIRMED"},
        "NO_SHOW": {"OUTREACH", "TENTATIVE", "CONFIRMED"},
    },
    "clinical": {
        "NOT_STARTED": {"PREVISIT_REVIEW"},
        "PREVISIT_REVIEW": {"READY", "CLINICAL_HOLD"},
        "CLINICAL_HOLD": {"PREVISIT_REVIEW"},
        "READY": {"SERVICE_COMPLETED", "CLINICAL_HOLD"},
        "SERVICE_COMPLETED": {"REPORT_FINAL"},
        "REPORT_FINAL": {"COMMUNICATION_COMPLETE"},
    },
    "financial": {
        "NOT_STARTED": {"CLAIM_PREPARATION"},
        "CLAIM_PREPARATION": {"SUBMITTED", "REJECTED"},
        "SUBMITTED": {"PENDING", "PAID", "DENIED", "REJECTED"},
        "PENDING": {"PAID", "DENIED", "REJECTED", "ADJUSTED", "OTHER_RESOLUTION"},
        "DENIED": {"CLAIM_PREPARATION", "ADJUSTED", "OTHER_RESOLUTION"},
        "REJECTED": {"CLAIM_PREPARATION", "OTHER_RESOLUTION"},
        "ADJUSTED": {"OTHER_RESOLUTION", "PAID"},
    },
    "overall": {
        "ACTIVE": {"CLINICALLY_RESOLVED", "CANCELED", "TRANSFERRED"},
        "CLINICALLY_RESOLVED": {"FINANCIAL_FOLLOW_UP", "FULLY_RESOLVED"},
        "FINANCIAL_FOLLOW_UP": {"FULLY_RESOLVED"},
    },
}
PERMISSIONS = {
    "referral": "intake",
    "document": "documents",
    "insurance": "insurance",
    "authorization": "authorization",
    "scheduling": "scheduling",
    "clinical": "clinical",
    "financial": "billing",
    "overall": "approve_closure",
}
FINANCIAL_RESOLVED = {"PAID", "ADJUSTED", "OTHER_RESOLUTION"}


async def missing_documents(db: AsyncSession, actor: Actor, case: Case) -> list[str]:
    types = set(
        (
            await db.scalars(
                select(Document.type).where(
                    Document.tenant_id == actor.tenant_id,
                    Document.case_id == case.id,
                    Document.verification_status == "VERIFIED",
                )
            )
        ).all()
    )
    return sorted(REQUIRED_DOCUMENTS - types)


async def readiness(
    db: AsyncSession, actor: Actor, case: Case, planned: dict | None = None
) -> dict:
    missing = await missing_documents(db, actor, case)
    order = await db.scalar(
        select(ServiceOrder).where(
            ServiceOrder.case_id == case.id, ServiceOrder.tenant_id == actor.tenant_id
        )
    )
    blockers = [f"missing_{item}" for item in missing]
    if case.referral_status != "ACCEPTED":
        blockers.append("referral_not_accepted")
    if not order or order.validation_status != "VALID":
        blockers.append("invalid_service_order")
    if case.insurance_status not in {"VERIFIED", "SELF_PAY"}:
        blockers.append("insurance_unresolved")
    auth = await db.scalar(
        select(Authorization)
        .where(
            Authorization.tenant_id == actor.tenant_id,
            Authorization.case_id == case.id,
        )
        .order_by(Authorization.created_at.desc())
    )
    appointment = await db.scalar(
        select(Appointment)
        .where(
            Appointment.tenant_id == actor.tenant_id,
            Appointment.case_id == case.id,
            Appointment.status.in_(["CONFIRMED", "TENTATIVE"]),
        )
        .order_by(Appointment.created_at.desc())
    )
    planned = planned or (
        {
            "location": appointment.location,
            "performing_provider": appointment.performing_provider,
            "procedure_code": appointment.procedure_code,
            "scheduled_at": appointment.scheduled_at,
        }
        if appointment
        else {}
    )
    if case.authorization_status != "NOT_REQUIRED":
        if case.authorization_status != "APPROVED" or not auth or auth.status != "APPROVED":
            blockers.append("authorization_not_applicable")
        elif not auth.approved_service or not auth.approval_expires_at:
            blockers.append("authorization_missing_decision")
        else:
            date = planned.get("scheduled_at", now())
            if isinstance(date, str):
                from datetime import datetime

                date = datetime.fromisoformat(date)
            if auth.approval_expires_at < date or auth.approval_expires_at < now():
                blockers.append("authorization_expired")
            valid_from = auth.approved_service.get("valid_from")
            if valid_from:
                from datetime import datetime

                if date < datetime.fromisoformat(valid_from):
                    blockers.append("authorization_not_yet_valid")
            if order:
                for key in (
                    "procedure_code",
                    "location",
                    "performing_provider",
                    "body_region",
                    "contrast_type",
                ):
                    expected = planned.get(key, getattr(order, key))
                    if auth.approved_service.get(key) != expected:
                        blockers.append(f"authorization_{key}_mismatch")
    return {
        "administratively_ready": not blockers,
        "blockers": blockers,
        "missing_documents": missing,
        "clinical_clearance": "Qualified clinical staff required",
        "case_version": case.version,
    }


async def transition(
    db: AsyncSession,
    actor: Actor,
    case: Case,
    stream: str,
    target: str,
    expected_version: int | None = None,
    approval: bool = False,
    reason: str = "",
    causation_id: UUID | None = None,
) -> Case:
    require(actor, PERMISSIONS.get(stream, "denied"))
    if actor.agent_name and stream == "clinical":
        raise HTTPException(403, "Agents cannot record clinical clearance")
    if expected_version is not None and case.version != expected_version:
        raise HTTPException(409, "Case version changed")
    attribute = f"{stream}_status"
    current = getattr(case, attribute)
    if current == target:
        return case
    if target not in TRANSITIONS[stream].get(current, set()):
        raise HTTPException(409, f"Invalid {stream} transition: {current} to {target}")
    if stream == "document" and target == "COMPLETE" and await missing_documents(db, actor, case):
        raise HTTPException(409, "Required verified documents missing")
    if stream == "authorization" and target == "SUBMITTED" and not approval:
        raise HTTPException(409, "Authorization submission requires approved execution")
    if stream == "scheduling" and target == "CONFIRMED":
        if not approval:
            raise HTTPException(409, "Scheduling requires approved execution")
        if not (await readiness(db, actor, case))["administratively_ready"]:
            raise HTTPException(409, "Appointment not administratively cleared")
    if stream == "clinical" and target in {"READY", "SERVICE_COMPLETED"}:
        if not (await readiness(db, actor, case))["administratively_ready"]:
            raise HTTPException(409, "Administrative blockers remain")
        if case.scheduling_status != "CONFIRMED":
            raise HTTPException(409, "Confirmed appointment required")
    if stream == "financial" and target == "CLAIM_PREPARATION":
        if case.clinical_status not in {
            "SERVICE_COMPLETED",
            "REPORT_FINAL",
            "COMMUNICATION_COMPLETE",
        }:
            raise HTTPException(409, "No completed service")
    if stream == "overall":
        if not approval:
            raise HTTPException(409, "Case disposition requires human approval")
        if target in {"CANCELED", "TRANSFERRED"} and not reason.strip():
            raise HTTPException(422, "Disposition reason required")
        if (
            target in {"CLINICALLY_RESOLVED", "FINANCIAL_FOLLOW_UP", "FULLY_RESOLVED"}
            and case.clinical_status != "COMMUNICATION_COMPLETE"
        ):
            raise HTTPException(409, "Clinical referral communication incomplete")
        if target == "FULLY_RESOLVED":
            if case.financial_status not in FINANCIAL_RESOLVED:
                raise HTTPException(409, "Financial workstream unresolved")
            outstanding = await db.scalar(
                select(Task.id)
                .where(
                    Task.tenant_id == actor.tenant_id,
                    Task.case_id == case.id,
                    Task.status.in_(["OPEN", "IN_PROGRESS"]),
                )
                .limit(1)
            )
            if outstanding:
                raise HTTPException(409, "Open tasks prevent final closure")
    setattr(case, attribute, target)
    await db.flush()
    await emit(
        db,
        actor,
        case,
        "StateChanged",
        {
            "workstream": stream,
            "from": current,
            "to": target,
            "version": case.version,
            "reason": reason,
        },
        causation_id,
    )
    return case
