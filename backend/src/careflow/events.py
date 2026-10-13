from uuid import UUID, uuid4

from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from careflow.models import AuditLog, Case, CaseEvent, OutboxEvent
from careflow.security import Actor


async def audit(
    db: AsyncSession, actor: Actor, action: str, resource: str, details: dict | None = None
):
    db.add(
        AuditLog(
            tenant_id=actor.tenant_id,
            actor_id=actor.id,
            action=action,
            resource=resource,
            correlation_id=actor.correlation_id,
            details=jsonable_encoder(details or {}),
        )
    )


async def emit(
    db: AsyncSession,
    actor: Actor,
    case: Case,
    event_type: str,
    payload: dict | None = None,
    causation_id: UUID | None = None,
) -> CaseEvent:
    event = CaseEvent(
        id=uuid4(),
        tenant_id=actor.tenant_id,
        case_id=case.id,
        event_type=event_type,
        source=actor.agent_name or actor.role,
        actor_id=actor.id,
        payload=jsonable_encoder(payload or {}),
        correlation_id=actor.correlation_id,
        causation_id=causation_id or actor.causation_id,
    )
    db.add(event)
    await db.flush()
    db.add(
        OutboxEvent(
            tenant_id=actor.tenant_id,
            case_id=case.id,
            event_id=event.id,
            event_type=event_type,
            payload={
                "event_id": str(event.id),
                "correlation_id": str(actor.correlation_id),
                **event.payload,
            },
        )
    )
    await audit(db, actor, event_type, f"cases/{case.id}", {"event_id": str(event.id)})
    return event
