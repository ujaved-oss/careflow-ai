from datetime import datetime, timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from careflow import workflow
from careflow.events import emit
from careflow.integrations import EligibilityRequest, TransientIntegrationError, gateway
from careflow.models import (
    Authorization,
    Case,
    Coverage,
    Document,
    Patient,
    Referral,
    ServiceOrder,
    Task,
    User,
    now,
)
from careflow.schemas import ReferralInput
from careflow.security import Actor, load_case, require


async def rows(db: AsyncSession, actor: Actor, model, case_id: UUID | None = None):
    require(actor, "read")
    if case_id:
        await load_case(db, actor, case_id)
    q = select(model).where(model.tenant_id == actor.tenant_id)
    if case_id:
        q = q.where(model.case_id == case_id)
    return list((await db.scalars(q.order_by(model.created_at))).all())


async def create_referral(db: AsyncSession, actor: Actor, data: ReferralInput) -> Case:
    require(actor, "intake")
    # Serialize duplicate delivery before consulting the unique constraint.
    from sqlalchemy import func

    await db.execute(
        select(
            func.pg_advisory_xact_lock(
                func.hashtextextended(f"{actor.tenant_id}/{data.external_reference}", 0)
            )
        )
    )
    existing = await db.scalar(
        select(Referral).where(
            Referral.tenant_id == actor.tenant_id,
            Referral.external_reference == data.external_reference,
        )
    )
    if existing:
        original = await db.scalar(
            select(Case).where(Case.tenant_id == actor.tenant_id, Case.referral_id == existing.id)
        )
        if original is None:
            raise HTTPException(409, "Referral case is unavailable")
        patient = await db.scalar(
            select(Patient).where(
                Patient.id == original.patient_id, Patient.tenant_id == actor.tenant_id
            )
        )
        order = await db.scalar(
            select(ServiceOrder).where(
                ServiceOrder.case_id == original.id, ServiceOrder.tenant_id == actor.tenant_id
            )
        )
        if (
            not patient
            or not order
            or patient.mrn != f"SYN-{data.synthetic_fixture_id:04d}"
            or original.scenario != data.scenario
            or order.procedure_code != data.procedure_code
            or order.location != data.location
        ):
            raise HTTPException(409, "Referral reference was already used with different content")
        return original
    patient = await db.scalar(
        select(Patient).where(
            Patient.tenant_id == actor.tenant_id,
            Patient.mrn == f"SYN-{data.synthetic_fixture_id:04d}",
        )
    )
    if patient is None:
        raise HTTPException(404, "Synthetic patient fixture not found; seed the demo")
    coordinator = await db.scalar(
        select(User).where(User.tenant_id == actor.tenant_id, User.role == "coordinator")
    )
    if coordinator is None:
        raise HTTPException(409, "Coordinator fixture missing")
    ref = Referral(
        id=uuid4(),
        tenant_id=actor.tenant_id,
        patient_id=patient.id,
        external_reference=data.external_reference,
    )
    db.add(ref)
    await db.flush()
    case = Case(
        id=uuid4(),
        tenant_id=actor.tenant_id,
        patient_id=patient.id,
        referral_id=ref.id,
        case_number=f"SYN-{ref.id.hex[:20]}",
        coordinator_id=coordinator.id,
        scenario=data.scenario,
    )
    db.add(case)
    await db.flush()
    db.add(
        ServiceOrder(
            tenant_id=actor.tenant_id,
            case_id=case.id,
            procedure_code=data.procedure_code,
            contrast_type={"70551": "without", "70552": "with", "70553": "with_and_without"}[
                data.procedure_code
            ],
            location=data.location,
            validation_status="INVALID" if data.scenario == "invalid_order" else "VALID",
        )
    )
    db.add(
        Coverage(tenant_id=actor.tenant_id, case_id=case.id, member_id=f"SYN-MEMBER-{patient.mrn}")
    )
    await db.flush()
    from careflow.documents import ingest

    await ingest(db, actor, case, "order", verified=True)
    if data.scenario != "missing_note":
        await ingest(db, actor, case, "physician_note", verified=True)
    await emit(
        db,
        actor,
        case,
        "ReferralReceived",
        {"referral_id": str(ref.id), "patient_id": str(patient.id)},
    )
    return case


async def task(
    db: AsyncSession,
    actor: Actor,
    case: Case,
    task_type: str,
    owner_id: UUID | None = None,
    details: dict | None = None,
) -> Task:
    require(actor, "tasks")
    owner_id = owner_id or case.coordinator_id
    owner = await db.scalar(
        select(User).where(
            User.id == owner_id, User.tenant_id == actor.tenant_id, User.active.is_(True)
        )
    )
    if not owner:
        raise HTTPException(422, "Task owner must be active in this hospital")
    key = f"{actor.tenant_id}/{case.id}/{task_type}"
    existing = await db.scalar(
        select(Task).where(Task.tenant_id == actor.tenant_id, Task.dedupe_key == key)
    )
    if existing:
        return existing
    row = Task(
        tenant_id=actor.tenant_id,
        case_id=case.id,
        owner_id=owner_id,
        task_type=task_type,
        dedupe_key=key,
        due_at=now() + timedelta(days=1),
        details=details or {},
    )
    db.add(row)
    await db.flush()
    await emit(db, actor, case, "TaskCreated", {"task_id": str(row.id), "task_type": task_type})
    return row


async def intake(db: AsyncSession, actor: Actor, case: Case) -> dict:
    if case.referral_status in {"RECEIVED", "NEEDS_INFORMATION"}:
        await workflow.transition(db, actor, case, "referral", "VALIDATING")
    order = (await rows(db, actor, ServiceOrder, case.id))[0]
    if case.scenario == "ambiguous_identity" or order.validation_status != "VALID":
        if case.referral_status == "VALIDATING":
            await workflow.transition(db, actor, case, "referral", "NEEDS_INFORMATION")
        await task(
            db,
            actor,
            case,
            "identity_review" if case.scenario == "ambiguous_identity" else "order_correction",
        )
        return {"blocked": True, "observations": ["Human identity/order verification required"]}
    if case.referral_status == "VALIDATING":
        await workflow.transition(db, actor, case, "referral", "ACCEPTED")
        await emit(
            db,
            actor,
            case,
            "ReferralVerified",
            {"patient_id": str(case.patient_id), "procedure_code": order.procedure_code},
        )
    return {
        "observations": ["Synthetic patient identifier and service order validated"],
        "source_ids": [str(case.patient_id), str(order.id)],
    }


async def review_documents(db: AsyncSession, actor: Actor, case: Case) -> dict:
    missing = await workflow.missing_documents(db, actor, case)
    if case.document_status == "COMPLETE" and not missing:
        return {"observations": ["Required documents remain complete"]}
    if case.document_status != "REVIEWING":
        await workflow.transition(db, actor, case, "document", "REVIEWING")
    await workflow.transition(db, actor, case, "document", "MISSING" if missing else "COMPLETE")
    proposals = []
    if missing:
        from careflow.approvals import propose

        for kind in missing:
            await task(db, actor, case, f"missing_{kind}", details={"document_type": kind})
        proposal = await propose(
            db,
            actor,
            case,
            "document_request",
            {
                "recipient": "SYN-REFERRING-PROVIDER",
                "missing_documents": missing,
                "body": "Synthetic request for missing administrative documentation.",
                "source_document_ids": [
                    str(d.id) for d in await rows(db, actor, Document, case.id)
                ],
            },
        )
        proposals.append(str(proposal.id))
    else:
        for t in await rows(db, actor, Task, case.id):
            if t.task_type.startswith("missing_") and t.status != "COMPLETED":
                t.status = "COMPLETED"
                await emit(
                    db,
                    actor,
                    case,
                    "TaskResolved",
                    {"task_id": str(t.id), "reason": "Required document verified"},
                )
        await emit(db, actor, case, "DocumentsComplete")
    return {
        "observations": [f"Missing verified documents: {', '.join(missing) or 'none'}"],
        "proposed_actions": proposals,
    }


async def insurance_check(db: AsyncSession, actor: Actor, case: Case) -> dict:
    require(actor, "insurance")
    if case.referral_status != "ACCEPTED":
        return {"blocked": True, "observations": ["Referral acceptance required"]}
    if case.insurance_status != "CHECKING":
        await workflow.transition(db, actor, case, "insurance", "CHECKING")
    coverage = (await rows(db, actor, Coverage, case.id))[0]
    try:
        result = await gateway.check_eligibility(
            EligibilityRequest(member_id=coverage.member_id, scenario=case.scenario)
        )
    except TransientIntegrationError:
        await workflow.transition(db, actor, case, "insurance", "UNRESOLVED")
        await task(db, actor, case, "eligibility_follow_up")
        await emit(db, actor, case, "InsuranceCheckFailed", {"reason": "simulated_payer_timeout"})
        return {"blocked": True, "observations": ["Mock payer unavailable; human follow-up queued"]}
    coverage.status = result.status
    coverage.authorization_required = result.authorization_required
    coverage.verified_at = now()
    coverage.response = result.model_dump(mode="json")
    await workflow.transition(db, actor, case, "insurance", result.status)
    if case.authorization_status == "NOT_DETERMINED":
        await workflow.transition(
            db,
            actor,
            case,
            "authorization",
            "REQUIRED" if result.authorization_required else "NOT_REQUIRED",
        )
    await emit(
        db,
        actor,
        case,
        "InsuranceVerified",
        {"coverage_id": str(coverage.id), "authorization_required": result.authorization_required},
    )
    return {
        "observations": [f"Mock payer verified coverage: {result.status}"],
        "source_ids": [str(coverage.id)],
    }


async def prepare_authorization(db: AsyncSession, actor: Actor, case: Case) -> dict:
    require(actor, "authorization")
    if case.authorization_status == "NOT_REQUIRED":
        await emit(db, actor, case, "AuthorizationNotRequired")
        return {"observations": ["Verified payer rules do not require authorization"]}
    if case.insurance_status != "VERIFIED" or await workflow.missing_documents(db, actor, case):
        return {
            "blocked": True,
            "observations": ["Verified insurance and complete documents required"],
        }
    if case.authorization_status in {"SUBMITTED", "PENDING", "APPROVED"}:
        return {"observations": [f"Authorization already {case.authorization_status}"]}
    if case.authorization_status not in {
        "REQUIRED",
        "MORE_INFORMATION",
        "DENIED",
        "EXPIRED",
        "MISMATCH",
        "PREPARING",
    }:
        return {"blocked": True, "observations": ["Authorization requirement not determined"]}
    if case.authorization_status != "PREPARING":
        await workflow.transition(db, actor, case, "authorization", "PREPARING")
    order = (await rows(db, actor, ServiceOrder, case.id))[0]
    docs = [
        d
        for d in await rows(db, actor, Document, case.id)
        if d.verification_status == "VERIFIED" and d.type in workflow.REQUIRED_DOCUMENTS
    ]
    auth = await db.scalar(
        select(Authorization)
        .where(
            Authorization.tenant_id == actor.tenant_id,
            Authorization.case_id == case.id,
            Authorization.status == "PREPARING",
        )
        .order_by(Authorization.created_at.desc())
    )
    if auth is None:
        auth = Authorization(
            tenant_id=actor.tenant_id,
            case_id=case.id,
            requested_service={
                key: getattr(order, key)
                for key in (
                    "procedure_code",
                    "body_region",
                    "contrast_type",
                    "location",
                    "performing_provider",
                )
            },
            packet_document_ids=[str(d.id) for d in docs],
        )
        db.add(auth)
        await db.flush()
    from careflow.approvals import propose

    p = await propose(
        db,
        actor,
        case,
        "authorization_submission",
        {
            "authorization_id": str(auth.id),
            "source_document_ids": auth.packet_document_ids,
            "service": auth.requested_service,
        },
    )
    await emit(
        db,
        actor,
        case,
        "AuthorizationPacketPrepared",
        {"authorization_id": str(auth.id), "proposal_id": str(p.id)},
    )
    return {
        "observations": ["Authorization packet assembled from verified synthetic documents"],
        "proposed_actions": [str(p.id)],
        "source_ids": auth.packet_document_ids,
    }


async def propose_appointment(
    db: AsyncSession, actor: Actor, case: Case, data: dict | None = None
) -> dict:
    require(actor, "scheduling")
    data = data or {}
    order = (await rows(db, actor, ServiceOrder, case.id))[0]
    slot = (await gateway.slots(data.get("location", order.location)))[0]
    if data.get("scheduled_at"):
        slot["scheduled_at"] = data["scheduled_at"]
    if datetime.fromisoformat(str(slot["scheduled_at"])) <= now():
        raise HTTPException(422, "Appointment must be in the future")
    slot["procedure_code"] = order.procedure_code
    slot["tentative"] = bool(data.get("tentative"))
    ready = await workflow.readiness(db, actor, case, slot)
    if not ready["administratively_ready"]:
        if not slot["tentative"] or case.referral_status != "ACCEPTED":
            return {"blocked": True, "observations": ready["blockers"]}
    from careflow.approvals import propose

    p = await propose(db, actor, case, "appointment_booking", slot)
    return {
        "observations": ["Synthetic appointment prepared for human review"],
        "proposed_actions": [str(p.id)],
    }
