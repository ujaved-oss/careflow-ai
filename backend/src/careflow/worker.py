"""Durable PostgreSQL outbox and queue. All handler writes share the completion transaction."""

import asyncio
import json
import logging
import time
from datetime import timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.dialects.postgresql import insert

from careflow.agents import orchestrate
from careflow.approvals import execute
from careflow.config import settings
from careflow.db import guarded_session
from careflow.events import audit
from careflow.models import AgentRun, Case, Job, OutboxEvent, Proposal, now
from careflow.security import Actor

TRIGGERS = {
    "ReferralReceived": ["intake"],
    "ReferralVerified": ["documents"],
    "DocumentVerified": ["documents"],
    "DocumentsComplete": ["insurance"],
    "InsuranceVerified": ["authorization"],
    "AuthorizationApproved": ["scheduling"],
    "AuthorizationNotRequired": ["scheduling"],
    "ImagingCompleted": ["revenue"],
    "ClaimChanged": ["revenue"],
    "ReferralCommunicationCompleted": ["closure"],
    "PaymentResolved": ["revenue", "closure"],
    "CaseDispositionRecorded": ["closure"],
}
log = logging.getLogger("careflow.worker")


async def publish() -> int:
    async with guarded_session() as db:
        events = list(
            (
                await db.scalars(
                    select(OutboxEvent)
                    .where(OutboxEvent.published_at.is_(None))
                    .order_by(OutboxEvent.created_at)
                    .limit(50)
                    .with_for_update(skip_locked=True)
                )
            ).all()
        )
        for event in events:
            for name in TRIGGERS.get(event.event_type, []):
                await db.execute(
                    insert(Job)
                    .values(
                        id=uuid4(),
                        tenant_id=event.tenant_id,
                        case_id=event.case_id,
                        job_type=f"agent:{name}",
                        payload=event.payload,
                        idempotency_key=f"event/{event.event_id}/{name}",
                    )
                    .on_conflict_do_nothing(index_elements=[Job.idempotency_key])
                )
            event.published_at = now()
        return len(events)


async def tick() -> bool:
    published = await publish()
    # Claim/lease in a short transaction; crashes here are recovered after lease expiry.
    async with guarded_session() as db:
        job = await db.scalar(
            select(Job)
            .where(
                or_(
                    and_(Job.status == "PENDING", Job.run_after <= now()),
                    and_(Job.status == "RUNNING", Job.locked_until < now()),
                )
            )
            .order_by(Job.run_after, Job.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if not job:
            return published > 0
        job.status = "RUNNING"
        job.attempts += 1
        job.locked_until = now() + timedelta(seconds=settings().worker_lease_seconds)
        job.lease_token = uuid4()
        job_id, lease = job.id, job.lease_token
    started = time.monotonic()
    try:
        async with guarded_session() as db:
            # Hold a row lock for the entire bounded execution, fencing expired leases.
            job = await db.scalar(
                select(Job)
                .where(Job.id == job_id, Job.lease_token == lease, Job.status == "RUNNING")
                .with_for_update()
            )
            if not job:
                return True
            actor = Actor(
                None,
                job.tenant_id,
                "demo_admin",
                UUID(job.payload.get("correlation_id", str(uuid4()))),
                job.case_id,
                "worker",
                UUID(job.payload["event_id"]) if job.payload.get("event_id") else None,
            )
            async with asyncio.timeout(45):
                if job.job_type.startswith("agent:"):
                    await orchestrate(
                        db,
                        actor,
                        job.job_type.split(":")[1],
                        job.case_id,
                        job.payload.get("event_id", "manual"),
                    )
                elif job.job_type == "execute_proposal":
                    await execute(db, actor, UUID(job.payload["proposal_id"]))
                else:
                    raise ValueError("unknown_job_handler")
            job.status = "COMPLETED"
            job.locked_until = None
            await audit(
                db,
                actor,
                "JobCompleted",
                f"jobs/{job.id}",
                {
                    "attempts": job.attempts,
                    "duration_ms": round((time.monotonic() - started) * 1000),
                },
            )
    except Exception as error:
        async with guarded_session() as db:
            job = await db.scalar(
                select(Job).where(Job.id == job_id, Job.lease_token == lease).with_for_update()
            )
            if not job:
                return True
            permanent = isinstance(error, (HTTPException, ValueError, KeyError))
            job.status = (
                "DEAD_LETTER"
                if permanent or job.attempts >= settings().worker_max_attempts
                else "PENDING"
            )
            job.run_after = now() + timedelta(seconds=2**job.attempts)
            job.locked_until = None
            job.last_error = type(
                error
            ).__name__  # No patient/document content in operational logs.
            actor = Actor(
                None,
                job.tenant_id,
                "demo_admin",
                UUID(job.payload.get("correlation_id", str(uuid4()))),
                job.case_id,
                "worker",
            )
            await audit(
                db,
                actor,
                "JobFailed",
                f"jobs/{job.id}",
                {"error_type": type(error).__name__, "status": job.status},
            )
            if job.status == "DEAD_LETTER":
                if job.job_type == "execute_proposal":
                    p = await db.scalar(
                        select(Proposal).where(
                            Proposal.id == UUID(job.payload["proposal_id"]),
                            Proposal.tenant_id == job.tenant_id,
                        )
                    )
                    if p and p.status == "APPROVED":
                        p.status = "FAILED"
                elif job.job_type.startswith("agent:"):
                    db.add(
                        AgentRun(
                            tenant_id=job.tenant_id,
                            case_id=job.case_id,
                            agent_name=job.job_type.split(":")[1],
                            trigger=job.payload.get("event_id", "manual"),
                            status="FAILED",
                            completed_at=now(),
                            correlation_id=actor.correlation_id,
                            result={"error_type": type(error).__name__, "job_id": str(job.id)},
                        )
                    )
        log.warning(
            json.dumps(
                {"event": "job_failure", "job_id": str(job_id), "error_type": type(error).__name__}
            )
        )
    return True


async def schedule_monitoring():
    async with guarded_session() as db:
        cases = (
            await db.scalars(
                select(Case).where(Case.overall_status.in_(["ACTIVE", "FINANCIAL_FOLLOW_UP"]))
            )
        ).all()
        hour = now().strftime("%Y%m%d%H")
        for case in cases:
            await db.execute(
                insert(Job)
                .values(
                    id=uuid4(),
                    tenant_id=case.tenant_id,
                    case_id=case.id,
                    job_type="agent:monitoring",
                    payload={"correlation_id": str(uuid4())},
                    idempotency_key=f"monitor/{case.id}/{hour}",
                )
                .on_conflict_do_nothing(index_elements=[Job.idempotency_key])
            )


async def drain(limit: int = 2000) -> int:
    count = 0
    while count < limit and await tick():
        count += 1
    return count


async def main():
    logging.basicConfig(level=settings().log_level)
    last_monitor = 0.0
    while True:
        try:
            if time.monotonic() - last_monitor > 60:
                await schedule_monitoring()
                last_monitor = time.monotonic()
            if not await tick():
                await asyncio.sleep(settings().worker_poll_seconds)
        except Exception as error:
            log.error(
                json.dumps({"event": "worker_loop_error", "error_type": type(error).__name__})
            )
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
