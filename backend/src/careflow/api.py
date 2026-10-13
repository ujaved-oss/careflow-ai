import asyncio
import json
import time
from datetime import datetime
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from careflow import assistant, demo, documents, services, workflow
from careflow.agents import AGENTS
from careflow.approvals import decide, get_proposal, propose
from careflow.db import Session, get_db
from careflow.events import audit, emit
from careflow.models import (
    AgentRun,
    Appointment,
    Authorization,
    AuthorizationEvent,
    Case,
    CaseEvent,
    Claim,
    ClinicalMilestone,
    Conversation,
    Coverage,
    Document,
    Job,
    Message,
    Patient,
    Proposal,
    Referral,
    Task,
    Tenant,
    User,
    now,
)
from careflow.schemas import (
    AgentInput,
    AppointmentInput,
    AssistantInput,
    AssistantResponse,
    ClinicalInput,
    ClosureInput,
    DecisionInput,
    DemoEventInput,
    DocumentInput,
    Login,
    ReferralInput,
    SpeechInput,
    TaskInput,
    TaskUpdate,
    TranscriptInput,
)
from careflow.security import ROLES, Actor, current_user, load_case, require, signer
from careflow.seed import reset, seed
from careflow.tools import REGISTRY
from careflow.views import (
    AppointmentView,
    AuthorizationView,
    CasePage,
    CaseView,
    ClaimView,
    DocumentView,
    PatientView,
    ProposalView,
    ReadinessView,
    TaskView,
    TimelineView,
)

router = APIRouter(
    prefix="/api/v1",
    responses={
        401: {"description": "Missing/expired demo session"},
        403: {"description": "Role lacks permission"},
        404: {"description": "Resource absent in authorized hospital"},
        409: {"description": "State, version or idempotency conflict"},
        422: {"description": "Invalid input or unsafe fixture"},
    },
)
DB = Annotated[AsyncSession, Depends(get_db, scope="function")]
Human = Annotated[User, Depends(current_user)]


def actor_for(request: Request, user: User) -> Actor:
    return Actor(user.id, user.tenant_id, user.role, request.state.correlation_id)


def serialize(value):
    return jsonable_encoder(value, sqlalchemy_safe=True)


@router.get("/auth/demo-users", tags=["auth"])
async def demo_users(db: DB):
    """Public fictional persona picker; no case/patient data. Demo mode is startup-enforced."""
    return [
        {"id": u.id, "tenant_id": u.tenant_id, "name": u.name, "role": u.role}
        for u in (
            await db.scalars(select(User).where(User.active.is_(True)).order_by(User.name))
        ).all()
    ]


@router.post("/auth/demo-login", tags=["auth"])
async def login(data: Login, db: DB):
    """Select a fictional persona; intentionally not production authentication."""
    user = await db.scalar(select(User).where(User.id == data.user_id, User.active.is_(True)))
    if not user:
        raise HTTPException(401, "Unknown fictional user")
    return {
        "access_token": signer().dumps({"user_id": str(user.id), "tenant_id": str(user.tenant_id)}),
        "token_type": "bearer",
        "synthetic": True,
    }


@router.get("/auth/me", tags=["auth"])
async def me(db: DB, user: Human):
    result = serialize(user)
    result["hospital_name"] = await db.scalar(select(Tenant.name).where(Tenant.id == user.tenant_id))
    return result


@router.get("/patients", response_model=list[PatientView], tags=["cases"])
async def patients(request: Request, db: DB, user: Human):
    """Read-only synthetic patient directory, restricted to the signed-in hospital."""
    return serialize(await services.rows(db, actor_for(request, user), Patient))


@router.get("/users", tags=["auth"])
async def users(request: Request, db: DB, user: Human):
    return serialize(await services.rows(db, actor_for(request, user), User))


@router.get("/roles", tags=["auth"])
async def roles(user: Human):
    return {role: sorted(permissions) for role, permissions in ROLES.items()}


@router.get("/cases", response_model=CasePage, tags=["cases"])
async def list_cases(
    request: Request,
    db: DB,
    user: Human,
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    status: str | None = None,
    owner: UUID | None = None,
    priority: str | None = None,
    service_line: str | None = None,
    received_after: datetime | None = None,
    received_before: datetime | None = None,
):
    actor = actor_for(request, user)
    require(actor, "read")
    q = select(Case).where(Case.tenant_id == user.tenant_id)
    for value, column in [
        (status, Case.overall_status),
        (owner, Case.coordinator_id),
        (priority, Case.priority),
        (service_line, Case.service_line),
    ]:
        if value is not None:
            q = q.where(column == value)
    if received_after:
        q = q.where(Case.created_at >= received_after)
    if received_before:
        q = q.where(Case.created_at <= received_before)
    count = await db.scalar(select(func.count()).select_from(q.subquery()))
    items = (await db.scalars(q.order_by(Case.case_number).offset(offset).limit(limit))).all()
    return {"items": serialize(items), "total": count, "offset": offset, "limit": limit}


@router.post("/cases", response_model=CaseView, tags=["cases"], status_code=201)
@router.post("/referrals", response_model=CaseView, tags=["cases"], status_code=201)
async def referral(data: ReferralInput, request: Request, db: DB, user: Human):
    """Permission: intake. Creates fixture-only referral/case/documents and transactional outbox events; duplicate reference returns original case."""
    return serialize(await services.create_referral(db, actor_for(request, user), data))


@router.get("/referrals/{referral_id}", tags=["cases"])
async def referral_detail(referral_id: UUID, request: Request, db: DB, user: Human):
    row = await db.scalar(
        select(Referral).where(Referral.id == referral_id, Referral.tenant_id == user.tenant_id)
    )
    if not row:
        raise HTTPException(404, "Referral not found")
    return serialize(row)


@router.get("/cases/{case_id}", response_model=CaseView, tags=["cases"])
@router.get("/cases/{case_id}/summary", response_model=CaseView, tags=["cases"])
async def case_detail(case_id: UUID, request: Request, db: DB, user: Human):
    actor = actor_for(request, user)
    case = await load_case(db, actor, case_id)
    await audit(db, actor, "CaseRead", f"cases/{case_id}")
    return serialize(case)


@router.get("/cases/{case_id}/readiness", response_model=ReadinessView, tags=["cases"])
async def case_readiness(case_id: UUID, request: Request, db: DB, user: Human):
    actor = actor_for(request, user)
    return await workflow.readiness(db, actor, await load_case(db, actor, case_id))


@router.get("/cases/{case_id}/timeline", response_model=list[TimelineView], tags=["cases"])
async def timeline(case_id: UUID, request: Request, db: DB, user: Human):
    return serialize(await services.rows(db, actor_for(request, user), CaseEvent, case_id))


@router.get("/cases/{case_id}/documents", response_model=list[DocumentView], tags=["documents"])
async def case_documents(case_id: UUID, request: Request, db: DB, user: Human):
    return serialize(await services.rows(db, actor_for(request, user), Document, case_id))


@router.post(
    "/cases/{case_id}/documents", response_model=DocumentView, tags=["documents"], status_code=201
)
async def create_document(
    case_id: UUID, data: DocumentInput, request: Request, db: DB, user: Human
):
    """Permission: documents. Generates/stores/indexes a synthetic PDF fixture; human verification remains required."""
    actor = actor_for(request, user)
    case = await load_case(db, actor, case_id, lock=True)
    return serialize(await documents.ingest(db, actor, case, data.fixture_type, data.variant))


@router.post("/cases/{case_id}/documents/upload", tags=["documents"], status_code=201)
async def upload_document(
    case_id: UUID,
    request: Request,
    db: DB,
    user: Human,
    file: UploadFile = File(...),
    fixture_type: str = Query("physician_note", enum=list(documents.FIXTURES)),
    variant: str = Query("standard", enum=["standard", "prompt_injection"]),
):
    """Accepts only exact server-generated fixtures; rejects arbitrary patient PDF data."""
    if (
        file.content_type != "application/pdf"
        or fixture_type not in documents.FIXTURES
        or variant not in {"standard", "prompt_injection"}
    ):
        raise HTTPException(422, "Invalid PDF fixture")
    content = await file.read(2_000_001)
    await file.close()
    if len(content) > 2_000_000:
        raise HTTPException(413, "PDF exceeds 2MB")
    actor = actor_for(request, user)
    case = await load_case(db, actor, case_id, lock=True)
    return serialize(await documents.ingest(db, actor, case, fixture_type, variant, content))


@router.get("/documents/{document_id}", response_model=DocumentView, tags=["documents"])
async def document_detail(document_id: UUID, request: Request, db: DB, user: Human):
    doc = await db.scalar(
        select(Document).where(Document.id == document_id, Document.tenant_id == user.tenant_id)
    )
    if not doc:
        raise HTTPException(404, "Document not found")
    await load_case(db, actor_for(request, user), doc.case_id)
    return serialize(doc)


@router.get("/documents/{document_id}/content", tags=["documents"])
async def document_content(document_id: UUID, request: Request, db: DB, user: Human):
    doc = await db.scalar(
        select(Document).where(Document.id == document_id, Document.tenant_id == user.tenant_id)
    )
    if not doc:
        raise HTTPException(404, "Document not found")
    actor = actor_for(request, user)
    await load_case(db, actor, doc.case_id)
    await audit(db, actor, "DocumentRead", f"documents/{doc.id}")
    path = documents.path_for(doc)
    if not path.is_file():
        raise HTTPException(404, "Original synthetic PDF unavailable")
    return FileResponse(path, media_type="application/pdf", filename=f"synthetic-{doc.type}.pdf")


@router.post("/documents/{document_id}/verify", response_model=DocumentView, tags=["documents"])
async def verify_document(document_id: UUID, request: Request, db: DB, user: Human):
    """Permission: documents. Records human administrative verification and enqueues review."""
    return serialize(await documents.verify(db, actor_for(request, user), document_id))


@router.get("/cases/{case_id}/insurance", tags=["insurance"])
async def insurance(case_id: UUID, request: Request, db: DB, user: Human):
    return serialize(await services.rows(db, actor_for(request, user), Coverage, case_id))


async def queue_agent(db: AsyncSession, actor: Actor, case_id: UUID, name: str):
    if name not in AGENTS:
        raise HTTPException(404, "Agent not found")
    require(actor, REGISTRY[AGENTS[name].tool].permission)
    case = await load_case(db, actor, case_id)
    job = Job(
        id=uuid4(),
        tenant_id=actor.tenant_id,
        case_id=case.id,
        job_type=f"agent:{name}",
        payload={"correlation_id": str(actor.correlation_id)},
        idempotency_key=f"manual/{case.id}/{name}/{uuid4()}",
    )
    db.add(job)
    await audit(db, actor, "AgentManuallyQueued", f"jobs/{job.id}", {"agent": name})
    return {"job_id": str(job.id), "status": "PENDING"}


@router.post("/cases/{case_id}/insurance/check", tags=["insurance"], status_code=202)
async def check_insurance(case_id: UUID, request: Request, db: DB, user: Human):
    """Permission: insurance. Queues durable mock-payer check; no external connection."""
    return await queue_agent(db, actor_for(request, user), case_id, "insurance")


@router.get(
    "/cases/{case_id}/authorizations",
    response_model=list[AuthorizationView],
    tags=["authorizations"],
)
async def authorizations(case_id: UUID, request: Request, db: DB, user: Human):
    return serialize(await services.rows(db, actor_for(request, user), Authorization, case_id))


@router.post("/cases/{case_id}/authorizations/prepare", tags=["authorizations"], status_code=202)
async def prepare_authorization(case_id: UUID, request: Request, db: DB, user: Human):
    """Permission: authorization. Queues packet preparation; submission requires separate human approval."""
    return await queue_agent(db, actor_for(request, user), case_id, "authorization")


@router.post("/authorizations/{authorization_id}/propose-submission", tags=["authorizations"])
async def propose_submission(authorization_id: UUID, request: Request, db: DB, user: Human):
    actor = actor_for(request, user)
    auth = await db.scalar(
        select(Authorization).where(
            Authorization.id == authorization_id, Authorization.tenant_id == actor.tenant_id
        )
    )
    if not auth:
        raise HTTPException(404, "Authorization not found")
    case = await load_case(db, actor, auth.case_id, lock=True)
    if auth.status != "PREPARING":
        raise HTTPException(409, "Authorization must be preparing")
    return serialize(
        await propose(
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
    )


@router.get("/authorizations/{authorization_id}/history", tags=["authorizations"])
async def authorization_history(authorization_id: UUID, request: Request, db: DB, user: Human):
    auth = await db.scalar(
        select(Authorization).where(
            Authorization.id == authorization_id, Authorization.tenant_id == user.tenant_id
        )
    )
    if not auth:
        raise HTTPException(404, "Authorization not found")
    return serialize(
        (
            await db.scalars(
                select(AuthorizationEvent)
                .where(
                    AuthorizationEvent.authorization_id == auth.id,
                    AuthorizationEvent.tenant_id == user.tenant_id,
                )
                .order_by(AuthorizationEvent.created_at)
            )
        ).all()
    )


@router.get(
    "/cases/{case_id}/appointments", response_model=list[AppointmentView], tags=["scheduling"]
)
async def appointments(case_id: UUID, request: Request, db: DB, user: Human):
    return serialize(await services.rows(db, actor_for(request, user), Appointment, case_id))


@router.post("/cases/{case_id}/appointments/propose", tags=["scheduling"])
async def book(case_id: UUID, data: AppointmentInput, request: Request, db: DB, user: Human):
    """Permission: scheduling. Proposes a slot; booking requires scheduler approval and applicable authorization."""
    actor = actor_for(request, user)
    return await services.propose_appointment(
        db, actor, await load_case(db, actor, case_id, lock=True), data.model_dump(mode="json")
    )


@router.get("/cases/{case_id}/clinical-milestones", tags=["clinical"])
async def milestones(case_id: UUID, request: Request, db: DB, user: Human):
    return serialize(await services.rows(db, actor_for(request, user), ClinicalMilestone, case_id))


@router.post("/cases/{case_id}/clinical-milestones", response_model=CaseView, tags=["clinical"])
async def record_milestone(
    case_id: UUID, data: ClinicalInput, request: Request, db: DB, user: Human
):
    """Permission: clinical (clinician persona only). Records synthetic qualified-staff attestation with version guard; no agent clinical decisions."""
    return serialize(await demo.clinical_event(db, actor_for(request, user), case_id, data))


@router.get("/cases/{case_id}/claims", response_model=list[ClaimView], tags=["billing"])
async def claims(case_id: UUID, request: Request, db: DB, user: Human):
    return serialize(await services.rows(db, actor_for(request, user), Claim, case_id))


@router.get("/cases/{case_id}/financial-status", tags=["billing"])
async def financial(case_id: UUID, request: Request, db: DB, user: Human):
    case = await load_case(db, actor_for(request, user), case_id)
    return {
        "financial_status": case.financial_status,
        "clinical_status": case.clinical_status,
        "overall_status": case.overall_status,
    }


@router.post("/cases/{case_id}/closure/propose", response_model=ProposalView, tags=["approvals"])
async def closure(case_id: UUID, data: ClosureInput, request: Request, db: DB, user: Human):
    actor = actor_for(request, user)
    return serialize(
        await propose(
            db,
            actor,
            await load_case(db, actor, case_id, lock=True),
            "case_closure",
            data.model_dump(),
        )
    )


@router.get("/tasks", response_model=list[TaskView], tags=["tasks"])
async def tasks(
    request: Request, db: DB, user: Human, status: str | None = None, owner: UUID | None = None
):
    q = select(Task).where(Task.tenant_id == user.tenant_id)
    if status:
        q = q.where(Task.status == status)
    if owner:
        q = q.where(Task.owner_id == owner)
    return serialize((await db.scalars(q.order_by(Task.due_at).limit(500))).all())


@router.post("/tasks", response_model=TaskView, tags=["tasks"], status_code=201)
async def add_task(data: TaskInput, request: Request, db: DB, user: Human):
    """Permission: tasks. Creates a deduplicated internal task with same-tenant owner validation."""
    actor = actor_for(request, user)
    return serialize(
        await services.task(
            db,
            actor,
            await load_case(db, actor, data.case_id, lock=True),
            data.task_type,
            data.owner_id,
        )
    )


@router.patch("/tasks/{task_id}", tags=["tasks"])
async def update_task(task_id: UUID, data: TaskUpdate, request: Request, db: DB, user: Human):
    actor = actor_for(request, user)
    require(actor, "tasks")
    task = await db.scalar(select(Task).where(Task.id == task_id, Task.tenant_id == user.tenant_id))
    if not task:
        raise HTTPException(404, "Task not found")
    case = await load_case(db, actor, task.case_id, lock=True)
    if data.owner_id:
        owner = await db.scalar(
            select(User).where(
                User.id == data.owner_id, User.tenant_id == user.tenant_id, User.active.is_(True)
            )
        )
        if not owner:
            raise HTTPException(422, "Owner must be active within your hospital")
        task.owner_id = owner.id
    task.status = data.status
    case.updated_at = now()
    await db.flush()
    await emit(db, actor, case, "TaskUpdated", {"task_id": str(task.id), "status": task.status})
    return serialize(task)


@router.get("/approvals", response_model=list[ProposalView], tags=["approvals"])
async def approval_queue(
    request: Request,
    db: DB,
    user: Human,
    status: str | None = "AWAITING_APPROVAL",
    case_id: UUID | None = None,
):
    q = select(Proposal).where(Proposal.tenant_id == user.tenant_id)
    if status:
        q = q.where(Proposal.status == status)
    if case_id:
        await load_case(db, actor_for(request, user), case_id)
        q = q.where(Proposal.case_id == case_id)
    return serialize((await db.scalars(q.order_by(Proposal.created_at).limit(500))).all())


@router.get("/approvals/{proposal_id}", response_model=ProposalView, tags=["approvals"])
async def proposal_detail(proposal_id: UUID, request: Request, db: DB, user: Human):
    return serialize(await get_proposal(db, actor_for(request, user), proposal_id))


@router.post("/approvals/{proposal_id}/approve", response_model=ProposalView, tags=["approvals"])
async def approve(proposal_id: UUID, data: DecisionInput, request: Request, db: DB, user: Human):
    """Permission: proposal-specific approver role. Records immutable human decision and queues execution; stale/expired proposals return that status and never execute."""
    return serialize(
        await decide(db, actor_for(request, user), proposal_id, "APPROVED", data.reason)
    )


@router.post("/approvals/{proposal_id}/reject", response_model=ProposalView, tags=["approvals"])
async def reject(proposal_id: UUID, data: DecisionInput, request: Request, db: DB, user: Human):
    return serialize(
        await decide(db, actor_for(request, user), proposal_id, "REJECTED", data.reason)
    )


@router.post("/approvals/{proposal_id}/escalate", response_model=ProposalView, tags=["approvals"])
async def escalate(proposal_id: UUID, data: DecisionInput, request: Request, db: DB, user: Human):
    return serialize(
        await decide(db, actor_for(request, user), proposal_id, "ESCALATED", data.reason)
    )


@router.post("/approvals/{proposal_id}/revise", response_model=ProposalView, tags=["approvals"])
async def revise(proposal_id: UUID, payload: dict, request: Request, db: DB, user: Human):
    """Creates a fresh proposal and decision requirement; original payload is immutable."""
    actor = actor_for(request, user)
    original = await get_proposal(db, actor, proposal_id)
    case = await load_case(db, actor, original.case_id, lock=True)
    require(actor, original.required_permission)
    if original.status in {"APPROVED", "EXECUTING", "COMPLETED"}:
        raise HTTPException(409, "Approved/executed action cannot be revised")
    original.status = "REJECTED"
    await emit(db, actor, case, "ProposalSuperseded", {"proposal_id": str(original.id)})
    return serialize(
        await propose(db, actor, case, original.action_type, payload, revision_of=original.id)
    )


@router.post("/assistant/messages", tags=["assistant"], response_model=AssistantResponse)
async def assistant_message(data: AssistantInput, request: Request, db: DB, user: Human):
    return await assistant.respond(db, actor_for(request, user), data)


@router.get("/assistant/conversations", tags=["assistant"])
async def conversations(db: DB, user: Human):
    return serialize(
        (
            await db.scalars(
                select(Conversation)
                .where(Conversation.tenant_id == user.tenant_id, Conversation.user_id == user.id)
                .order_by(Conversation.created_at)
            )
        ).all()
    )


@router.get("/assistant/conversations/{conversation_id}", tags=["assistant"])
async def conversation_detail(conversation_id: UUID, db: DB, user: Human):
    row = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == user.tenant_id,
            Conversation.user_id == user.id,
        )
    )
    if not row:
        raise HTTPException(404, "Conversation not found")
    return {
        "conversation": serialize(row),
        "messages": serialize(
            (
                await db.scalars(
                    select(Message)
                    .where(Message.conversation_id == row.id, Message.tenant_id == user.tenant_id)
                    .order_by(Message.created_at)
                )
            ).all()
        ),
    }


@router.get("/agents/runs", tags=["agents"])
async def runs(request: Request, db: DB, user: Human):
    return serialize(
        (
            await db.scalars(
                select(AgentRun)
                .where(AgentRun.tenant_id == user.tenant_id)
                .order_by(AgentRun.started_at.desc())
                .limit(100)
            )
        ).all()
    )


@router.get("/agents/runs/{run_id}", tags=["agents"])
async def run_detail(run_id: UUID, db: DB, user: Human):
    row = await db.scalar(
        select(AgentRun).where(AgentRun.id == run_id, AgentRun.tenant_id == user.tenant_id)
    )
    if not row:
        raise HTTPException(404, "Agent run not found")
    return serialize(row)


@router.post("/agents/{agent_name}/run", tags=["agents"], status_code=202)
async def run_agent(agent_name: str, data: AgentInput, request: Request, db: DB, user: Human):
    """Permission: agents AND underlying domain permission. Queues a bounded run using the same tool registry as event-driven runs."""
    actor = actor_for(request, user)
    require(actor, "agents")
    return await queue_agent(db, actor, data.case_id, agent_name)


@router.get("/jobs", tags=["agents"])
async def jobs(db: DB, user: Human):
    return serialize(
        (
            await db.scalars(
                select(Job)
                .where(Job.tenant_id == user.tenant_id)
                .order_by(Job.created_at.desc())
                .limit(100)
            )
        ).all()
    )


@router.get("/dashboard/summary", tags=["analytics"])
@router.get("/analytics/workflow", tags=["analytics"])
async def dashboard(db: DB, user: Human):
    cases = (await db.scalars(select(Case).where(Case.tenant_id == user.tenant_id))).all()
    statuses: dict[str, int] = {}
    for case in cases:
        statuses[case.overall_status] = statuses.get(case.overall_status, 0) + 1
    return {
        "synthetic": True,
        "case_count": len(cases),
        "overall_statuses": statuses,
        "pending_approvals": await db.scalar(
            select(func.count())
            .select_from(Proposal)
            .where(Proposal.tenant_id == user.tenant_id, Proposal.status == "AWAITING_APPROVAL")
        ),
        "open_tasks": await db.scalar(
            select(func.count())
            .select_from(Task)
            .where(Task.tenant_id == user.tenant_id, Task.status.in_(["OPEN", "IN_PROGRESS"]))
        ),
        "queue_depth": await db.scalar(
            select(func.count())
            .select_from(Job)
            .where(Job.tenant_id == user.tenant_id, Job.status.in_(["PENDING", "RUNNING"]))
        ),
        "dead_letter_jobs": await db.scalar(
            select(func.count())
            .select_from(Job)
            .where(Job.tenant_id == user.tenant_id, Job.status == "DEAD_LETTER")
        ),
        "roi": "Synthetic timings do not establish hospital staff time savings",
    }


@router.get("/dashboard/work-queues", tags=["analytics"])
async def work_queues(db: DB, user: Human):
    results = (
        await db.execute(
            select(User.department, func.count(Task.id))
            .join(Task, Task.owner_id == User.id)
            .where(
                User.tenant_id == user.tenant_id,
                Task.tenant_id == user.tenant_id,
                Task.status.in_(["OPEN", "IN_PROGRESS"]),
            )
            .group_by(User.department)
        )
    ).all()
    return [{"department": department, "open_tasks": count} for department, count in results]


@router.post("/demo/seed", tags=["demo"])
async def demo_seed(request: Request, db: DB, user: Human):
    require(actor_for(request, user), "demo")
    return await seed(db, user.tenant_id)


@router.post("/demo/reset", tags=["demo"])
async def demo_reset(request: Request, db: DB, user: Human):
    """Permission: demo_admin. Resets only this hospital's synthetic records; other hospital is retained. Stop worker first."""
    actor = actor_for(request, user)
    require(actor, "demo")
    from sqlalchemy import text

    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended('careflow-demo-reset', 0))")
    )
    running = await db.scalar(
        select(Job.id).where(Job.tenant_id == actor.tenant_id, Job.status == "RUNNING").limit(1)
    )
    if running:
        raise HTTPException(409, "Stop worker and let in-flight jobs finish before reset")
    return await reset(db, actor)


@router.post("/demo/events", tags=["demo"])
async def simulate(data: DemoEventInput, request: Request, db: DB, user: Human):
    """Permission: demo_admin. Applies a typed, idempotent simulated integration event through workflow guards."""
    return await demo.apply_event(db, actor_for(request, user), data)


@router.get("/events/stream", tags=["events"])
async def events_stream(request: Request, user: Human, case_id: UUID | None = None):
    """Authenticated tenant-scoped SSE. Reconnect using Last-Event-ID; historical replay is bounded."""
    actor = actor_for(request, user)
    last_id = request.headers.get("last-event-id")
    cursor = (now(), UUID(int=0))
    async with Session.begin() as db:
        if case_id:
            await load_case(db, actor, case_id)
        if last_id:
            try:
                event = await db.scalar(
                    select(CaseEvent).where(
                        CaseEvent.id == UUID(last_id), CaseEvent.tenant_id == user.tenant_id
                    )
                )
            except ValueError:
                raise HTTPException(422, "Invalid Last-Event-ID") from None
            if not event or (case_id and event.case_id != case_id):
                raise HTTPException(404, "Replay cursor not in authorized scope")
            cursor = (event.created_at, event.id)

    async def generate():
        nonlocal cursor
        started = time.monotonic()
        while time.monotonic() - started < 300:
            if await request.is_disconnected():
                break
            async with Session.begin() as db:
                active = await db.scalar(
                    select(User.id).where(
                        User.id == user.id, User.active.is_(True), User.tenant_id == user.tenant_id
                    )
                )
                if not active:
                    break
                from sqlalchemy import tuple_

                q = select(CaseEvent).where(
                    CaseEvent.tenant_id == user.tenant_id,
                    tuple_(CaseEvent.created_at, CaseEvent.id) > cursor,
                )
                if case_id:
                    q = q.where(CaseEvent.case_id == case_id)
                events = (
                    await db.scalars(q.order_by(CaseEvent.created_at, CaseEvent.id).limit(100))
                ).all()
                for event in events:
                    cursor = (event.created_at, event.id)
                    yield f"id: {event.id}\nevent: case_event\ndata: {json.dumps(serialize(event))}\n\n"
            yield ": keepalive\n\n"
            await asyncio.sleep(2)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/voice/transcribe-simulated", tags=["voice"])
async def simulated_voice(data: TranscriptInput, user: Human):
    return {
        "text": data.transcript,
        "simulated": True,
        "next_endpoint": "/api/v1/assistant/messages",
        "label": "Typed transcript simulation; no speech recognition performed",
    }


@router.post("/voice/transcribe", tags=["voice"])
async def transcribe(user: Human, audio: UploadFile = File(...)):
    from careflow.voice import transcribe_audio

    return await transcribe_audio(audio)


@router.post("/voice/synthesize", tags=["voice"])
async def synthesize(data: SpeechInput, user: Human):
    from careflow.voice import synthesize_audio

    return await synthesize_audio(data.text)
