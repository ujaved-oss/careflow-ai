from dataclasses import dataclass
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from careflow.events import audit
from careflow.models import AgentRun, Proposal, now
from careflow.security import Actor, load_case
from careflow.tools import ToolSession


class AgentResult(BaseModel):
    agent_name: str
    case_id: UUID
    status: Literal["completed", "needs_approval", "blocked", "failed"]
    observations: list[str] = Field(default_factory=list)
    proposed_actions: list[str] = Field(default_factory=list)
    source_ids: list[UUID] = Field(default_factory=list)
    provider: Literal["mock"] = "mock"


@dataclass(frozen=True)
class Specialist:
    name: str
    tool: str
    trigger: str

    async def run(self, session: ToolSession, case_id: UUID) -> AgentResult:
        output = await session.call(self.tool, {"case_id": str(case_id)})
        return AgentResult(
            agent_name=self.name,
            case_id=case_id,
            status="blocked"
            if output.blocked
            else "needs_approval"
            if output.proposed_actions
            else "completed",
            observations=output.observations,
            proposed_actions=output.proposed_actions,
            source_ids=[UUID(source_id) for source_id in output.source_ids],
        )


AGENTS = {
    "intake": Specialist("intake", "validate_referral", "ReferralReceived"),
    "documents": Specialist("documents", "review_documents", "ReferralVerified / DocumentVerified"),
    "insurance": Specialist("insurance", "request_mock_eligibility_check", "DocumentsComplete"),
    "authorization": Specialist(
        "authorization", "prepare_authorization_packet", "InsuranceVerified"
    ),
    "scheduling": Specialist("scheduling", "propose_appointment_change", "AuthorizationApproved"),
    "monitoring": Specialist("monitoring", "check_workflow_deadlines", "DeadlineDue / CaseChanged"),
    "revenue": Specialist("revenue", "review_claim_status", "ImagingCompleted / ClaimChanged"),
    "closure": Specialist(
        "closure", "propose_case_closure", "ReferralCommunicationCompleted / PaymentResolved"
    ),
}


async def orchestrate(
    db: AsyncSession, actor: Actor, name: str, case_id: UUID, trigger: str
) -> AgentRun:
    agent = AGENTS[name]
    case = await load_case(db, actor, case_id, lock=True)
    run = AgentRun(
        id=uuid4(),
        tenant_id=actor.tenant_id,
        case_id=case.id,
        agent_name=name,
        trigger=trigger,
        correlation_id=actor.correlation_id,
    )
    db.add(run)
    await db.flush()
    principal = Actor(
        None, actor.tenant_id, "demo_admin", actor.correlation_id, case.id, name, actor.causation_id
    )
    session = ToolSession(db, principal, {agent.tool})
    result = await agent.run(session, case.id)
    run.status = result.status.upper()
    run.result = result.model_dump(mode="json")
    run.completed_at = now()
    for proposal_id in result.proposed_actions:
        from sqlalchemy import select

        p = await db.scalar(
            select(Proposal).where(
                Proposal.id == UUID(proposal_id), Proposal.tenant_id == actor.tenant_id
            )
        )
        if p and p.agent_run_id is None:
            p.agent_run_id = run.id
    await audit(
        db,
        principal,
        "AgentRunCompleted",
        f"agent_runs/{run.id}",
        {"agent": name, "status": run.status},
    )
    return run
