import asyncio
from datetime import date, timedelta
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from careflow.db import Session
from careflow.documents import ingest
from careflow.events import emit
from careflow.models import (
    Appointment,
    Authorization,
    Case,
    Claim,
    Coverage,
    Patient,
    Referral,
    ServiceOrder,
    Tenant,
    User,
    now,
)
from careflow.security import Actor
from careflow.services import task

SCENARIOS = [
    "missing_note",
    "authorization_pending",
    "authorization_approved",
    "location_mismatch",
    "report_pending",
    "claim_denied",
]
DEPARTMENTS = {
    "demo_admin": "administration",
    "coordinator": "referrals",
    "authorization_specialist": "authorization",
    "scheduler": "scheduling",
    "clinician": "radiology",
    "billing_specialist": "billing",
    "viewer": "quality",
}


def fixture_id(name: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"careflow-synthetic/{name}")


async def seed(db: AsyncSession, tenant_id: UUID | None = None) -> dict:
    result: dict[str, Any] = {"synthetic": True, "tenants": [], "patients": 0, "cases": 0}
    for hospital in range(2):
        tid = fixture_id(f"tenant/{hospital}")
        if tenant_id and tid != tenant_id:
            continue
        if await db.scalar(select(Tenant.id).where(Tenant.id == tid)):
            result["tenants"].append({"id": str(tid), "already_seeded": True})
            continue
        db.add(Tenant(id=tid, name=f"Synthetic {'Harbor' if hospital == 0 else 'Pine'} Hospital"))
        await db.flush()
        users = {}
        for role, department in DEPARTMENTS.items():
            user = User(
                id=fixture_id(f"user/{hospital}/{role}"),
                tenant_id=tid,
                name=f"Demo {role.replace('_', ' ').title()} {hospital + 1}",
                role=role,
                department=department,
            )
            users[role] = user
            db.add(user)
        await db.flush()
        patients = []
        for index in range(100):
            patient = Patient(
                id=fixture_id(f"patient/{hospital}/{index}"),
                tenant_id=tid,
                mrn=f"SYN-{index + 1:04d}",
                name=f"Synthetic Patient {hospital + 1}-{index + 1:03d}",
                date_of_birth=date(1960 + index % 45, 1 + index % 12, 1 + index % 27),
            )
            patients.append(patient)
            db.add(patient)
        await db.flush()
        actor = Actor(users["demo_admin"].id, tid, "demo_admin", uuid4())
        for index in range(150):
            scenario = SCENARIOS[index % 6]
            patient = patients[index % 100]
            ref = Referral(
                id=fixture_id(f"referral/{hospital}/{index}"),
                tenant_id=tid,
                patient_id=patient.id,
                external_reference=f"SYN-SEED-{hospital + 1}-{index + 1:04d}",
                status="ACCEPTED",
            )
            db.add(ref)
            await db.flush()
            case = Case(
                id=fixture_id(f"case/{hospital}/{index}"),
                tenant_id=tid,
                patient_id=patient.id,
                referral_id=ref.id,
                coordinator_id=users["coordinator"].id,
                case_number=f"SYN-{hospital + 1}-{index + 1:04d}",
                scenario=scenario,
                referral_status="ACCEPTED",
                document_status="MISSING" if scenario == "missing_note" else "COMPLETE",
                insurance_status="VERIFIED",
                authorization_status="REQUIRED"
                if scenario == "missing_note"
                else "PENDING"
                if scenario == "authorization_pending"
                else "MISMATCH"
                if scenario == "location_mismatch"
                else "APPROVED",
                clinical_status="SERVICE_COMPLETED"
                if scenario == "report_pending"
                else "COMMUNICATION_COMPLETE"
                if scenario == "claim_denied"
                else "NOT_STARTED",
                financial_status="DENIED" if scenario == "claim_denied" else "NOT_STARTED",
                overall_status="FINANCIAL_FOLLOW_UP" if scenario == "claim_denied" else "ACTIVE",
                scheduling_status="COMPLETED"
                if scenario in {"report_pending", "claim_denied"}
                else "UNSCHEDULED",
            )
            db.add(case)
            await db.flush()
            order = ServiceOrder(tenant_id=tid, case_id=case.id)
            db.add(order)
            db.add(
                Coverage(
                    tenant_id=tid,
                    case_id=case.id,
                    member_id=f"SYN-MEMBER-{index + 1}",
                    status="VERIFIED",
                    verified_at=now(),
                    response={"simulated": True, "source": "mock_payer", "status": "VERIFIED"},
                )
            )
            await db.flush()
            doc = await ingest(db, actor, case, "order", verified=True)
            packet = [str(doc.id)]
            if scenario != "missing_note":
                packet.append(
                    str((await ingest(db, actor, case, "physician_note", verified=True)).id)
                )
                service = {
                    key: getattr(order, key)
                    for key in (
                        "procedure_code",
                        "body_region",
                        "contrast_type",
                        "location",
                        "performing_provider",
                    )
                }
                auth = Authorization(
                    tenant_id=tid,
                    case_id=case.id,
                    requested_service=service,
                    packet_document_ids=packet,
                    status=case.authorization_status,
                    payer_reference=f"SYN-AUTH-{index + 1}",
                    submitted_at=now() - timedelta(days=2),
                )
                if scenario != "authorization_pending":
                    auth.approved_service = {
                        **service,
                        "valid_from": (now() - timedelta(days=3)).isoformat(),
                    }
                    auth.approval_expires_at = now() + timedelta(days=30)
                    auth.decision_at = now() - timedelta(days=1)
                    if scenario == "location_mismatch":
                        auth.approved_service = {**auth.approved_service, "location": "SYN-MRI-B"}
                db.add(auth)
            if scenario in {"report_pending", "claim_denied"}:
                db.add(
                    Appointment(
                        tenant_id=tid,
                        case_id=case.id,
                        scheduled_at=now() - timedelta(days=1),
                        location="SYN-MRI-A",
                        performing_provider="SYN-RAD-01",
                        procedure_code="70551",
                        status="COMPLETED",
                        reference=f"SYN-APPT-{hospital}-{index}",
                    )
                )
            if scenario == "claim_denied":
                await ingest(db, actor, case, "final_report", verified=True)
                db.add(
                    Claim(
                        tenant_id=tid,
                        case_id=case.id,
                        claim_number=f"SYN-CLAIM-SEED-{hospital}-{index}",
                        status="DENIED",
                    )
                )
                await task(db, actor, case, "billing_review")
            if scenario == "location_mismatch":
                await task(
                    db,
                    actor,
                    case,
                    "authorization_exception",
                    details={"reason": "location mismatch"},
                )
            if scenario == "report_pending":
                await task(db, actor, case, "report_follow_up")
            if scenario == "missing_note":
                # Prepare an actual proposal through the same services used by the agents.
                from careflow.agents import orchestrate

                await orchestrate(db, actor, "documents", case.id, "SyntheticSeed")
            elif scenario == "authorization_approved":
                from careflow.agents import orchestrate

                await orchestrate(db, actor, "scheduling", case.id, "SyntheticSeed")
            await emit(
                db,
                actor,
                case,
                "SyntheticScenarioSeeded",
                {"scenario": scenario, "fixture_only": True},
            )
        result["tenants"].append({"id": str(tid), "name": f"Synthetic Hospital {hospital + 1}"})
        result["patients"] += 100
        result["cases"] += 150
    return result


async def reset(db: AsyncSession, actor: Actor):
    # Pause/reset one tenant in a transaction. Cascades are explicit, other tenants survive.
    from careflow.models import Base

    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"reset/{actor.tenant_id}"},
    )
    for table in reversed(Base.metadata.sorted_tables):
        if "tenant_id" in table.c:
            await db.execute(table.delete().where(table.c.tenant_id == actor.tenant_id))
    from sqlalchemy import delete

    await db.execute(delete(Tenant).where(Tenant.id == actor.tenant_id))
    db.expunge_all()
    return await seed(db, actor.tenant_id)


async def main():
    async with Session.begin() as db:
        print(await seed(db))


if __name__ == "__main__":
    asyncio.run(main())
