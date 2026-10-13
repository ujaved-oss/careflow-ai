from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from careflow.config import settings
from careflow.db import get_db
from careflow.models import Case, User

ROLES = {
    "demo_admin": {
        "read",
        "intake",
        "documents",
        "insurance",
        "authorization",
        "scheduling",
        "tasks",
        "approve_message",
        "approve_authorization",
        "approve_appointment",
        "approve_closure",
        "billing",
        "demo",
        "agents",
    },
    "coordinator": {
        "read",
        "intake",
        "documents",
        "insurance",
        "tasks",
        "approve_message",
        "approve_closure",
        "agents",
    },
    "authorization_specialist": {
        "read",
        "documents",
        "insurance",
        "authorization",
        "tasks",
        "approve_message",
        "approve_authorization",
        "agents",
    },
    "scheduler": {
        "read",
        "scheduling",
        "tasks",
        "approve_message",
        "approve_appointment",
        "agents",
    },
    "clinician": {"read", "clinical", "documents", "tasks"},
    "billing_specialist": {"read", "billing", "tasks", "approve_message", "agents"},
    "viewer": {"read"},
}
bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Actor:
    id: UUID | None
    tenant_id: UUID
    role: str
    correlation_id: UUID
    case_scope: UUID | None = None
    agent_name: str | None = None
    causation_id: UUID | None = None


def require(actor: Actor, permission: str) -> None:
    if permission not in ROLES.get(actor.role, set()):
        raise HTTPException(403, f"Permission required: {permission}")


def signer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings().session_secret, salt="careflow-demo-v1")


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> User:
    if credentials is None:
        raise HTTPException(401, "Demo session required")
    try:
        payload = signer().loads(credentials.credentials, max_age=settings().session_max_age)
        user_id = UUID(payload["user_id"])
        tenant_id = UUID(payload["tenant_id"])
    except (BadSignature, SignatureExpired, KeyError, ValueError, TypeError):
        raise HTTPException(401, "Invalid or expired demo session") from None
    user = await db.scalar(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id, User.active.is_(True))
    )
    if not user:
        raise HTTPException(401, "Inactive demo user")
    return user


async def load_case(db: AsyncSession, actor: Actor, case_id: UUID, lock: bool = False) -> Case:
    require(actor, "read")
    if actor.case_scope and actor.case_scope != case_id:
        raise HTTPException(403, "Agent case scope violation")
    q = select(Case).where(Case.id == case_id, Case.tenant_id == actor.tenant_id)
    if lock:
        q = q.with_for_update()
    case = await db.scalar(q)
    if case is None:
        raise HTTPException(404, "Case not found")
    return case
