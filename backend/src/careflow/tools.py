"""Bounded tools are the only interface used by agent implementations."""

from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from careflow import services, workflow
from careflow.approvals import propose
from careflow.events import audit
from careflow.models import Case, Claim, Task, now
from careflow.security import Actor, load_case


class ToolInput(BaseModel):
    case_id: UUID


class ToolOutput(BaseModel):
    observations: list[str] = Field(default_factory=list)
    proposed_actions: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)
    blocked: bool = False


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    handler: Any
    permission: str
    risk: str = "internal"
    approval_policy: str = "preauthorized_internal_only"
    timeout_seconds: int = 20
    max_retries: int = 0
    idempotent: bool = True
    input_schema: type[ToolInput] = ToolInput
    output_schema: type[ToolOutput] = ToolOutput


async def monitor(db: AsyncSession, actor: Actor, case: Case) -> dict:
    open_tasks = [
        t
        for t in await services.rows(db, actor, Task, case.id)
        if t.status in {"OPEN", "IN_PROGRESS"}
    ]
    overdue = [t for t in open_tasks if t.due_at < now()]
    if overdue or (case.updated_at < now() - timedelta(days=2) and case.overall_status == "ACTIVE"):
        await services.task(
            db,
            actor,
            case,
            "workflow_escalation",
            details={"overdue_task_ids": [str(t.id) for t in overdue]},
        )
    return {
        "observations": [f"{len(overdue)} overdue tasks; case owner {case.coordinator_id}"],
        "source_ids": [str(t.id) for t in overdue],
    }


async def revenue(db: AsyncSession, actor: Actor, case: Case) -> dict:
    if case.clinical_status not in {"SERVICE_COMPLETED", "REPORT_FINAL", "COMMUNICATION_COMPLETE"}:
        return {"blocked": True, "observations": ["Clinical service has not completed"]}
    claims = await services.rows(db, actor, Claim, case.id)
    if not claims:
        await workflow.transition(db, actor, case, "financial", "CLAIM_PREPARATION")
        claim = Claim(
            tenant_id=actor.tenant_id,
            case_id=case.id,
            claim_number=f"SYN-CLAIM-{case.id}",
            status="CLAIM_PREPARATION",
        )
        db.add(claim)
        await db.flush()
        claims = [claim]
    if case.financial_status in {"DENIED", "REJECTED"}:
        await services.task(
            db, actor, case, "billing_review", details={"claim_id": str(claims[-1].id)}
        )
    if case.financial_status in workflow.FINANCIAL_RESOLVED:
        for t in await services.rows(db, actor, Task, case.id):
            if t.task_type == "billing_review" and t.status != "COMPLETED":
                t.status = "COMPLETED"
                from careflow.events import emit

                await emit(
                    db,
                    actor,
                    case,
                    "TaskResolved",
                    {"task_id": str(t.id), "reason": "Financial resolution received"},
                )
    return {
        "observations": [f"Claim workstream: {case.financial_status}"],
        "source_ids": [str(c.id) for c in claims],
    }


async def closure(db: AsyncSession, actor: Actor, case: Case) -> dict:
    if case.clinical_status != "COMMUNICATION_COMPLETE":
        return {
            "blocked": True,
            "observations": ["Final report and referral communication required"],
        }
    if case.overall_status in {"FULLY_RESOLVED", "CANCELED", "TRANSFERRED"}:
        return {"observations": [f"Case disposition already {case.overall_status}"]}
    target = (
        "CLINICALLY_RESOLVED"
        if case.overall_status == "ACTIVE"
        else (
            "FULLY_RESOLVED"
            if case.financial_status in workflow.FINANCIAL_RESOLVED
            else "FINANCIAL_FOLLOW_UP"
        )
    )
    if case.overall_status == target:
        return {"observations": ["Clinical closure recorded; financial follow-up remains"]}
    if target == "FULLY_RESOLVED" and any(
        t.status in {"OPEN", "IN_PROGRESS"} for t in await services.rows(db, actor, Task, case.id)
    ):
        return {"blocked": True, "observations": ["Outstanding tasks require resolution"]}
    p = await propose(
        db,
        actor,
        case,
        "case_closure",
        {"disposition": target, "reason": "Synthetic clinical and financial reconciliation"},
    )
    return {
        "observations": [f"Disposition {target} prepared for human review"],
        "proposed_actions": [str(p.id)],
    }


REGISTRY = {
    "validate_referral": ToolSpec(
        "validate_referral", "Validate synthetic identity and order", services.intake, "intake"
    ),
    "review_documents": ToolSpec(
        "review_documents",
        "Compare verified evidence to document requirements",
        services.review_documents,
        "documents",
    ),
    "request_mock_eligibility_check": ToolSpec(
        "request_mock_eligibility_check",
        "Persist a simulated payer verification",
        services.insurance_check,
        "insurance",
    ),
    "prepare_authorization_packet": ToolSpec(
        "prepare_authorization_packet",
        "Assemble evidence and propose submission",
        services.prepare_authorization,
        "authorization",
        approval_policy="submission_requires_human",
    ),
    "propose_appointment_change": ToolSpec(
        "propose_appointment_change",
        "Prepare simulated slot for human review",
        services.propose_appointment,
        "scheduling",
        approval_policy="booking_requires_human",
    ),
    "check_workflow_deadlines": ToolSpec(
        "check_workflow_deadlines", "Detect overdue tasks and stalled cases", monitor, "tasks"
    ),
    "review_claim_status": ToolSpec(
        "review_claim_status", "Reconcile synthetic claim state", revenue, "billing"
    ),
    "propose_case_closure": ToolSpec(
        "propose_case_closure",
        "Reconcile independent workstreams",
        closure,
        "approve_closure",
        approval_policy="disposition_requires_human",
    ),
}


class ToolSession:
    def __init__(self, db: AsyncSession, actor: Actor, allowed: set[str], budget: int = 4):
        self.db, self.actor, self.allowed, self.remaining = db, actor, allowed, budget

    async def call(self, name: str, payload: dict) -> ToolOutput:
        if name not in self.allowed or name not in REGISTRY or self.remaining <= 0:
            raise HTTPException(403, "Tool not permitted or execution budget exhausted")
        self.remaining -= 1
        spec = REGISTRY[name]
        from careflow.security import require

        require(self.actor, spec.permission)
        args = spec.input_schema.model_validate(payload)
        case = await load_case(self.db, self.actor, args.case_id, lock=True)
        import asyncio

        async with asyncio.timeout(spec.timeout_seconds):
            result = spec.output_schema.model_validate(
                await spec.handler(self.db, self.actor, case)
            )
        await audit(
            self.db,
            self.actor,
            "AgentToolExecuted",
            f"tools/{name}",
            {"case_id": str(case.id), "risk": spec.risk},
        )
        return result
