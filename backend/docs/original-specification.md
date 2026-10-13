# AI-Native Hospital SaaS
## Backend Engineering Architecture & Developer Handoff
**Project:** CareFlow AI  
**Document Type:** Backend System Design & Development Specification  
**Target Market:** United States Hospitals  
**Initial Service Line:** Outpatient Radiology — MRI Referrals  
**Development Stage:** Functional Demonstration / MVP Prototype  
**Data:** 100% Synthetic  
**External APIs:** Simulated — No Live API Keys Required

---

# 1. Product Vision — What We Are Building

We are building an **AI-native hospital operations platform** that manages a patient's administrative journey from the moment a referral enters a hospital until the case is clinically completed and financially resolved.

Today, different hospital employees handle separate portions of the process:

- Referral intake and patient registration
- Medical documentation collection
- Insurance eligibility and benefits verification
- Prior authorization requirements and submission
- Communication with insurance companies and referring physicians
- Appointment scheduling and patient coordination
- Clinical-service readiness and completion tracking
- Medical reports and closed-loop referral communication
- Insurance claims, denials, and payment tracking
- Final case reconciliation and closure

These activities often require employees to switch between software, manually enter information, search for documents, check payer portals, contact other departments, and follow up on unfinished work.

**Our product should reduce that repetitive administrative effort by using AI agents, deterministic automation, and human-in-the-loop approvals.**

The system must not be a conventional dashboard with an AI chatbot attached.

AI must be integrated into how cases are received, understood, processed, monitored, and moved between departments.

## Three central product capabilities

**A. Intelligent Case Management**

Every patient referral creates a case. The case contains the patient's synthetic demographic information, referral documents, insurance information, authorization status, appointment details, clinical progress, claims information, tasks, and activity history.

The backend continuously determines what work is complete, what remains pending, what is blocking progress, and which department is responsible.

**B. AI Agents**

Specialized agents work throughout the referral lifecycle. They should automatically respond to system events, interpret documents, prepare work, detect exceptions, and propose or execute authorized administrative actions.

Examples:

- An intake agent extracts information from a referral.
- A documentation agent detects missing records.
- An insurance agent checks a simulated payer database.
- An authorization agent assembles supporting documentation.
- A monitoring agent detects stalled cases.
- A closure agent checks whether all required stages are resolved.

**C. Conversational AI Assistant**

A persistent assistant appears on the right side of the application.

Employees can communicate with it using typed messages or voice.

The assistant should understand the currently opened case but also support questions across other cases the employee is authorized to access.

Example questions:

- "Why is this patient's MRI authorization pending?"
- "Which cases need my attention today?"
- "Show me all referrals missing physician notes."
- "When did we last contact this insurance company?"
- "What documents were submitted for this authorization?"
- "Prepare a follow-up for this case."
- "Which cases have appointments tomorrow but unresolved insurance issues?"
- "Summarize everything that happened with this patient."

The assistant must use actual database records and retrieved documents from the demo environment rather than inventing answers.

It can prepare tasks and suggest actions, but consequential operations must follow authorization and human-approval rules.

---

# 2. Fundamental Engineering Decisions

The backend should initially be implemented as a **modular monolith**.

We do not need microservices, Kubernetes, Kafka, or multiple independently deployed AI services for the first demonstration.

The initial system should have:

1. One Python backend application.
2. One PostgreSQL database.
3. One background worker process.
4. One AI orchestration layer.
5. One deterministic workflow and rules engine.
6. One document and knowledge retrieval system.
7. One human approval engine.
8. One collection of simulated hospital and insurer integrations.
9. One API serving the frontend, voice assistant, and AI Action Center.

The modular architecture should permit individual components to become separate services in the future without requiring major changes to domain models.

**Architecture principle:** The AI model should never directly control the database, execute arbitrary code, or bypass workflow permissions.

All execution must pass through validated backend services.

---

# 3. Technology Stack

## Backend language and framework

| Component | Technology | Purpose |
|---|---|---|
| Primary language | Python 3.12+ | Backend, workflow automation, and AI |
| API framework | FastAPI | REST APIs, streaming, API documentation |
| Data validation | Pydantic v2 | Typed request and response schemas |
| ORM | SQLAlchemy 2.x | Database access |
| Database migrations | Alembic | Schema versioning |
| Database | PostgreSQL 16+ | Primary persistent datastore |
| Database driver | asyncpg | Asynchronous PostgreSQL connectivity |
| Configuration | pydantic-settings | Typed environment configuration |
| Dependency management | uv + pyproject.toml | Reproducible Python environment |
| HTTP client | httpx | Local services and future integrations |
| Background processing | PostgreSQL-backed job queue | Durable asynchronous agent execution |
| AI model runtime | Local Ollama, optional | Local LLM inference without paid API keys |
| Default AI mode | Deterministic mock provider | Reproducible keyless demonstrations |
| Text embeddings | Local sentence-transformers, optional | Semantic document retrieval |
| Search | PostgreSQL full-text search | Keyword and document searching |
| Vector search | pgvector, optional | Semantic similarity retrieval |
| PDF processing | pypdf | Text extraction from synthetic PDFs |
| Speech recognition | faster-whisper, optional | Local voice transcription |
| Speech output | Piper, optional | Local text-to-speech |
| Testing | pytest, pytest-asyncio, httpx | Automated backend tests |
| Code quality | Ruff, mypy | Linting and type checking |
| Deployment | Docker Compose | Local backend, database and worker |
| Logging | Python structured JSON logging | Debugging and audit correlation |

## Why Python?

Python allows us to implement the business logic, document processing, AI agents, RAG, and API layer within one language.

This reduces development complexity and makes the system easier to maintain.

## Why PostgreSQL?

The product has strongly related data:

Patient → Referral → Case → Documents → Authorization → Appointment → Clinical Outcome → Claim → Closure.

A relational database is a natural fit for this workflow.

PostgreSQL also supports transactions, indexing, JSONB, full-text search, and optional vector search.

## Why not introduce a full agent framework immediately?

The initial system only requires bounded, task-specific agents.

Use ordinary Python services and typed tool interfaces first.

LangGraph or another orchestration framework can be considered later if we encounter genuine requirements for complicated agent graphs, long-running checkpoints, or dynamic multi-agent coordination.

The workflow engine must remain independent of any AI framework.

---

# 4. High-Level Backend Architecture

```text
                     HOSPITAL APPLICATION
                              |
                     REST API / SSE
                              |
                    FASTAPI APPLICATION
                              |
                  AUTHENTICATION / RBAC
                              |
             +----------------+----------------+
             |                                 |
      CASE MANAGEMENT                   AI ORCHESTRATOR
             |                                 |
       DOMAIN SERVICES                 AGENT REGISTRY
             |                                 |
       WORKFLOW ENGINE                  TOOL REGISTRY
             |                                 |
       POLICY ENGINE              RAG / LOCAL LLM / MOCK AI
             |                                 |
             +----------------+----------------+
                              |
                    ACTION VALIDATION
                              |
                  HUMAN APPROVAL ENGINE
                              |
                     EXECUTION GATEWAY
                              |
                SIMULATED SERVICE ADAPTERS
                              |
          +-------------------+-------------------+
          |                   |                   |
       MOCK EHR          MOCK INSURER       MOCK SCHEDULER
          |                   |                   |
          +-------------------+-------------------+
                              |
                    POSTGRESQL DATABASE
                              |
                 EVENTS / JOBS / AUDIT LOGS
```

## Important separation of responsibilities

**API Layer:** Accepts frontend requests, validates inputs, authenticates users, and returns structured responses.

**Domain Services:** Contain business logic related to cases, insurance, documents, tasks, authorization, scheduling, and closure.

**Workflow Engine:** Determines valid transitions, required documents, deadlines, and dependencies.

**AI Orchestrator:** Invokes specialized agents and permitted tools.

**Approval Engine:** Prevents approval-required actions from executing without the right human authorization.

**Execution Gateway:** Provides controlled access to simulated external services.

**Persistence Layer:** Saves cases, documents, events, tasks, approvals, agent runs, and audit information.

The language model is never considered the authoritative source of a workflow state.

---

# 5. Recommended Repository Structure

```text
careflow-ai/
|
├── apps/
|   |
|   └── api/
|       |
|       ├── pyproject.toml
|       ├── Dockerfile
|       ├── alembic.ini
|       |
|       ├── migrations/
|       |   └── versions/
|       |
|       ├── src/
|       |   └── careflow/
|       |       |
|       |       ├── main.py
|       |       ├── config.py
|       |       ├── dependencies.py
|       |       |
|       |       ├── api/
|       |       |   └── v1/
|       |       |       ├── router.py
|       |       |       ├── auth.py
|       |       |       ├── patients.py
|       |       |       ├── referrals.py
|       |       |       ├── cases.py
|       |       |       ├── documents.py
|       |       |       ├── insurance.py
|       |       |       ├── authorizations.py
|       |       |       ├── appointments.py
|       |       |       ├── claims.py
|       |       |       ├── tasks.py
|       |       |       ├── approvals.py
|       |       |       ├── agents.py
|       |       |       ├── assistant.py
|       |       |       ├── voice.py
|       |       |       ├── analytics.py
|       |       |       └── demo.py
|       |       |
|       |       ├── core/
|       |       |   ├── security.py
|       |       |   ├── permissions.py
|       |       |   ├── exceptions.py
|       |       |   ├── logging.py
|       |       |   └── idempotency.py
|       |       |
|       |       ├── db/
|       |       |   ├── base.py
|       |       |   ├── session.py
|       |       |   └── repositories/
|       |       |
|       |       ├── modules/
|       |       |   ├── patients/
|       |       |   ├── referrals/
|       |       |   ├── cases/
|       |       |   ├── documents/
|       |       |   ├── insurance/
|       |       |   ├── authorizations/
|       |       |   ├── scheduling/
|       |       |   ├── clinical_tracking/
|       |       |   ├── revenue_cycle/
|       |       |   ├── tasks/
|       |       |   └── analytics/
|       |       |
|       |       ├── workflow/
|       |       |   ├── engine.py
|       |       |   ├── definitions.py
|       |       |   ├── transitions.py
|       |       |   ├── readiness.py
|       |       |   ├── rules.py
|       |       |   └── events.py
|       |       |
|       |       ├── ai/
|       |       |   ├── orchestrator.py
|       |       |   ├── registry.py
|       |       |   ├── schemas.py
|       |       |   |
|       |       |   ├── agents/
|       |       |   |   ├── intake_agent.py
|       |       |   |   ├── document_agent.py
|       |       |   |   ├── insurance_agent.py
|       |       |   |   ├── authorization_agent.py
|       |       |   |   ├── scheduling_agent.py
|       |       |   |   ├── monitoring_agent.py
|       |       |   |   ├── revenue_agent.py
|       |       |   |   └── closure_agent.py
|       |       |   |
|       |       |   ├── tools/
|       |       |   |   ├── registry.py
|       |       |   |   ├── case_tools.py
|       |       |   |   ├── document_tools.py
|       |       |   |   ├── insurance_tools.py
|       |       |   |   ├── authorization_tools.py
|       |       |   |   ├── scheduling_tools.py
|       |       |   |   └── task_tools.py
|       |       |   |
|       |       |   ├── providers/
|       |       |   |   ├── base.py
|       |       |   |   ├── mock.py
|       |       |   |   └── ollama.py
|       |       |   |
|       |       |   ├── rag/
|       |       |   |   ├── ingest.py
|       |       |   |   ├── chunking.py
|       |       |   |   ├── embeddings.py
|       |       |   |   ├── retrieval.py
|       |       |   |   ├── grounding.py
|       |       |   |   └── citations.py
|       |       |   |
|       |       |   └── assistant/
|       |       |       ├── service.py
|       |       |       ├── context.py
|       |       |       ├── intents.py
|       |       |       └── conversation.py
|       |       |
|       |       ├── approvals/
|       |       |   ├── service.py
|       |       |   ├── policies.py
|       |       |   └── executor.py
|       |       |
|       |       ├── integrations/
|       |       |   ├── contracts.py
|       |       |   ├── gateway.py
|       |       |   └── mock/
|       |       |       ├── ehr.py
|       |       |       ├── payer.py
|       |       |       ├── authorization.py
|       |       |       ├── scheduling.py
|       |       |       ├── messaging.py
|       |       |       └── billing.py
|       |       |
|       |       ├── voice/
|       |       |   ├── transcription.py
|       |       |   └── synthesis.py
|       |       |
|       |       ├── jobs/
|       |       |   ├── worker.py
|       |       |   ├── queue.py
|       |       |   ├── handlers.py
|       |       |   └── scheduler.py
|       |       |
|       |       └── seed/
|       |           ├── generator.py
|       |           ├── scenarios.py
|       |           └── fixtures/
|       |
|       └── tests/
|           ├── unit/
|           ├── integration/
|           ├── agents/
|           ├── workflows/
|           ├── security/
|           └── end_to_end/
|
├── storage/
|   └── synthetic_documents/
|
├── docs/
|   ├── architecture.md
|   ├── database.md
|   ├── api_contracts.md
|   ├── workflow_states.md
|   ├── agent_contracts.md
|   ├── security.md
|   └── demo_scenarios.md
|
├── docker-compose.yml
├── .env.example
├── Makefile
└── README.md
```

## Module organization rule

Each domain module should internally follow this pattern:

```text
modules/authorizations/
    models.py
    schemas.py
    repository.py
    service.py
    rules.py
```

Responsibilities:

- `models.py`: Database models.
- `schemas.py`: Pydantic contracts.
- `repository.py`: Database queries.
- `service.py`: Business operations.
- `rules.py`: Domain-specific rules and validations.

The API router should never contain complicated business logic.

Agents must call domain services or registered tools rather than issuing arbitrary SQL statements.

---

# 6. Main Database Design

Use UUID primary keys, UTC timestamps, foreign keys, migrations, and explicit constraints.

Every hospital-owned business record should contain `tenant_id`.

For this demo, create two fictional hospital tenants to demonstrate that users from one hospital cannot access another hospital's records.

## Essential tables

| Table | Important fields |
|---|---|
| `tenants` | id, name, demo_mode |
| `users` | id, tenant_id, name, role, active |
| `patients` | id, tenant_id, mrn, name, date_of_birth |
| `referrals` | id, tenant_id, patient_id, source, received_at, status |
| `cases` | id, tenant_id, patient_id, referral_id, case_number, service_line, coordinator_id, overall_status, version |
| `service_orders` | id, case_id, procedure_code, body_region, contrast_type, ordering_provider, validation_status |
| `documents` | id, tenant_id, case_id, type, storage_path, source, version, verification_status, content_hash |
| `document_chunks` | id, document_id, case_id, page_number, chunk_text, embedding |
| `coverages` | id, case_id, payer_id, plan_id, member_id, status, verified_at |
| `authorization_requests` | id, case_id, requested_service, status, payer_reference, submitted_at, decision_at, approval_expires_at |
| `authorization_events` | id, authorization_id, event_type, source, timestamp, payload |
| `appointments` | id, case_id, scheduled_at, location, status |
| `clinical_milestones` | id, case_id, milestone, status, recorded_at |
| `claim_references` | id, case_id, claim_number, status, amount, resolved_at |
| `tasks` | id, case_id, owner_id, task_type, status, priority, due_at |
| `action_proposals` | id, case_id, agent_run_id, action_type, payload, status, risk_level, proposed_at |
| `approvals` | id, action_proposal_id, reviewer_id, decision, decided_at, reason |
| `agent_runs` | id, case_id, agent_name, trigger, status, started_at, completed_at |
| `case_events` | id, case_id, event_type, source, actor_id, payload, created_at |
| `outbox_events` | id, event_type, payload, published_at |
| `jobs` | id, job_type, payload, status, attempts, run_after, idempotency_key |
| `conversations` | id, tenant_id, user_id, scope, case_id, created_at |
| `messages` | id, conversation_id, role, content, sources, created_at |
| `audit_logs` | id, tenant_id, actor_id, action, resource, timestamp, metadata |

Use separate tables for agent proposals and human decisions. An approval is not simply a boolean column on a case.

Store source identifiers and document versions so the assistant can link its answers to the records actually used.

Use indexed relational columns for operational states and common filters. JSONB may store variable simulated payer payloads, but critical statuses should not exist only inside JSON.

Recommended indexes:

- `(tenant_id, case_number)` — unique
- `(tenant_id, overall_status)`
- `(tenant_id, coordinator_id)`
- `(case_id, created_at)` for events
- `(status, due_at)` for tasks
- `(status, run_after)` for jobs
- `(case_id, status)` for authorizations
- Document full-text indexes, with optional vector indexes

Use `NUMERIC/Decimal` for financial values, not floating-point types.

---

# 7. Workflow and State Machine Design

The workflow engine is one of the most important backend components.

Do not represent a case using only one status such as `PENDING`, `PROCESSING`, or `COMPLETE`.

A case can simultaneously have:

- Referral accepted
- Documents incomplete
- Insurance verified
- Authorization pending
- Appointment tentatively scheduled
- Clinical service not started
- Billing not started

These must be independent workstreams.

## Core workflow states

**Referral**

`RECEIVED → VALIDATING → ACCEPTED / NEEDS_INFORMATION / REDIRECTED / DECLINED`

**Documents**

`NOT_REVIEWED → REVIEWING → COMPLETE / MISSING / NEEDS_CORRECTION`

**Insurance**

`NOT_STARTED → CHECKING → VERIFIED / DISCREPANCY / SELF_PAY / UNRESOLVED`

**Authorization**

`NOT_DETERMINED → REQUIRED / NOT_REQUIRED → PREPARING → SUBMITTED → PENDING → APPROVED / DENIED / MORE_INFORMATION / CANCELED`

The authorization branch must also allow resubmission, expiration and reconsideration.

**Scheduling**

`UNSCHEDULED → OUTREACH → TENTATIVE / CONFIRMED → COMPLETED / CANCELED / NO_SHOW`

**Clinical Tracking**

`NOT_STARTED → PREVISIT_REVIEW → READY / CLINICAL_HOLD → SERVICE_COMPLETED → REPORT_FINAL → COMMUNICATION_COMPLETE`

**Financial**

`NOT_STARTED → CLAIM_PREPARATION → SUBMITTED → PENDING → PAID / DENIED / REJECTED / ADJUSTED / OTHER_RESOLUTION`

**Overall Case**

`ACTIVE → CLINICALLY_RESOLVED → FINANCIAL_FOLLOW_UP → FULLY_RESOLVED`

There must also be valid documented cancellation, transfer and other disposition paths.

## Transition rules

Every state change must pass through:

```text
request_transition()
    |
    validate_user_permission()
    |
    load_case_and_current_version()
    |
    validate_allowed_transition()
    |
    validate_required_documents()
    |
    validate_required_approvals()
    |
    update_state()
    |
    create_case_event()
    |
    create_outbox_event()
    |
    commit_transaction()
```

The state update, domain event, and outbox event must be committed within the same database transaction.

Use optimistic locking or equivalent concurrency controls. A case changed by another worker must not silently overwrite the newer version.

### Example business rule

If authorization is required, a case cannot be marked administratively cleared for the planned MRI merely because an authorization packet was submitted.

A verified, applicable decision must be recorded and checked against the scheduled procedure, provider, location and dates.

Likewise, an appointment may be tentatively scheduled while authorization remains pending if the hospital's configured policy permits it.

The workflow engine must handle these dependencies without equating `scheduled` with `ready to perform`.

---

# 8. Event-Driven Architecture

The agents should not constantly poll the entire database looking for work.

Use domain events.

Examples:

```text
ReferralReceived
ReferralVerified
DocumentUploaded
MissingDocumentDetected
DocumentVerified
InsuranceCheckRequested
InsuranceVerified
InsuranceDiscrepancyDetected
AuthorizationRequirementDetermined
AuthorizationPacketPrepared
AuthorizationSubmitted
AuthorizationApproved
AuthorizationDenied
AuthorizationInformationRequested
AppointmentScheduled
AppointmentChanged
ClinicalReviewRequired
ImagingCompleted
ReportFinalized
ReferralCommunicationCompleted
ClaimSubmitted
ClaimDenied
PaymentResolved
CaseClinicallyResolved
CaseFinanciallyResolved
```

Each event should contain:

- Event ID
- Tenant ID
- Case ID
- Event type
- Actor or source
- Timestamp
- Typed payload
- Correlation ID
- Causation ID
- Schema version

## Event execution flow

```text
ReferralReceived
       |
       v
Persist Referral + Outbox Event
       |
       v
Background Worker
       |
       v
Intake Agent
       |
       v
Extract / Validate Referral
       |
       v
Create Case + Tasks
       |
       v
Document Review Event
       |
       v
Document Agent
       |
       v
Prepare Missing-Information Action
       |
       v
Approval Engine
       |
       v
Approved Simulated Execution
       |
       v
Case Updated + Audit Event
```

## Background job engine

For the demo, use a PostgreSQL-backed job table rather than introducing Redis and Celery immediately.

The worker should:

1. Claim eligible jobs using database locking, for example PostgreSQL `FOR UPDATE SKIP LOCKED`.
2. Execute registered handlers.
3. Save results and generated events.
4. Retry transient failures with backoff.
5. Apply maximum-attempt limits.
6. Move permanently failing work into an exception/dead-letter state.
7. Support safe replay.

Every integration-changing job needs an idempotency key.

Duplicate referral deliveries, repeated events or worker retries must not create duplicate outgoing authorization submissions or appointments.

Do not run durable hospital workflows solely using FastAPI in-process background tasks. Separate background workers should own those jobs.

---

# 9. AI Agent Architecture

The first version should contain one central orchestrator with eight specialist agent modules.

Each agent has:

- A defined trigger.
- A permitted set of tools.
- Validated inputs.
- A bounded execution budget.
- A structured result schema.
- A set of escalation conditions.
- An audit trail.

## Agent 1 — Referral Intake Agent

**Trigger:** New synthetic referral received.

Responsibilities:

- Read the referral document.
- Extract patient details.
- Identify the ordered procedure.
- Identify ordering physician.
- Suggest possible patient record matches.
- Flag incomplete or inconsistent information.
- Create a draft case after the appropriate identity verification.

Important: Ambiguous patient identity must require staff verification.

## Agent 2 — Document Intelligence Agent

**Trigger:** Document received or document completeness check requested.

Responsibilities:

- Classify documents.
- Extract searchable content.
- Associate documents with a case.
- Compare available evidence against validated requirements.
- Detect missing information.
- Prepare requests for missing documents.
- Update document-review tasks.

The agent cannot invent a missing clinical note or decide that clinical evidence is medically sufficient.

## Agent 3 — Insurance Agent

**Trigger:** Referral accepted, insurance changed or eligibility recheck requested.

Responsibilities:

- Call mock payer eligibility functions.
- Retrieve synthetic plan and benefit information.
- Determine whether a coverage discrepancy exists.
- Record verified responses.
- Create follow-up tasks for unresolved issues.

It should not infer active coverage from an LLM response.

## Agent 4 — Prior Authorization Agent

**Trigger:** Verified authorization requirement.

Responsibilities:

- Assemble an authorization packet.
- Validate identifiers, dates and service details.
- Find missing supporting records.
- Create an authorization submission proposal.
- Track synthetic payer responses.
- Detect approval mismatches and expirations.
- Prepare denial-review tasks.

Clinical attestations and medical appeals remain human-controlled.

## Agent 5 — Scheduling Agent

**Trigger:** Case becomes scheduling-eligible.

Responsibilities:

- Retrieve available synthetic appointment slots.
- Check documented administrative readiness.
- Prepare appointment recommendations.
- Detect changes that affect authorization validity.
- Prepare approved communication actions.

## Agent 6 — Monitoring Agent

**Trigger:** Case event, deadline reached or scheduled monitoring job.

Responsibilities:

- Detect overdue tasks.
- Identify cases without an owner.
- Find stalled authorizations.
- Detect missing responses.
- Alert appropriate teams.
- Create escalations.

## Agent 7 — Revenue-Cycle Agent

**Trigger:** Encounter, claim or payment-status event.

Responsibilities:

- Compare service details against authorization records.
- Retrieve simulated claim status.
- Classify administrative claim exceptions.
- Identify unresolved financial tasks.
- Prepare billing follow-ups.

## Agent 8 — Closure Agent

**Trigger:** Clinical or financial completion event.

Responsibilities:

- Check case completion requirements.
- Identify unfinished tasks.
- Confirm referral communication status.
- Separate clinical closure from financial resolution.
- Prepare the final disposition for authorized review.

## Orchestrator contract

The orchestrator should not contain business rules specific to any one agent.

Conceptual interface:

```python
class AgentResult(BaseModel):
    agent_name: str
    case_id: UUID
    status: Literal[
        "completed",
        "needs_approval",
        "blocked",
        "failed"
    ]
    observations: list[str]
    proposed_actions: list[dict]
    source_ids: list[UUID]
```

Every agent must return structured output validated by Pydantic.

The orchestrator may run eligible independent checks in parallel, but workflow dependencies and action policies must determine which results can advance a case.

Set limits on tool calls, processing time, and retries to prevent unbounded execution.

---

# 10. Tool Registry and Execution Gateway

Agents must access business functionality through registered tools.

Example read tools:

```text
get_case
get_case_timeline
get_case_documents
search_case_documents
search_authorized_cases
get_missing_documents
get_insurance_status
get_authorization_status
get_appointment_status
get_outstanding_tasks
get_claim_status
```

Example action tools:

```text
create_internal_task
prepare_document_request
prepare_authorization_packet
request_mock_eligibility_check
propose_authorization_submission
propose_appointment_change
propose_follow_up_message
propose_case_closure
```

Every tool should define:

- Name and description
- Input schema
- Output schema
- Required role or permissions
- Whether it reads or changes data
- Risk level
- Approval policy
- Timeout and retry rules
- Idempotency requirements
- Audit behavior

The AI model may select only tools present in its allowed registry.

It must not generate arbitrary SQL, shell commands, or Python code for execution.

Mock payer operations should be implemented through the same integration interfaces that a future production integration would use.

Example:

```python
class PayerGateway(Protocol):
    async def check_eligibility(
        self,
        request: EligibilityRequest
    ) -> EligibilityResult:
        ...

    async def submit_authorization(
        self,
        request: AuthorizationSubmission
    ) -> AuthorizationResult:
        ...
```

The demo implementation would be `MockPayerGateway`.

The future production implementation could be a supported clearinghouse or payer adapter.

No domain service should need to know which implementation is being used.

---

# 11. Human-in-the-Loop Architecture

Human-in-the-loop is mandatory as a first-class component.

There should be three action categories.

| Category | Execution policy |
|---|---|
| Read-only information retrieval | Automatically allowed when user has access |
| Low-risk internal administrative automation | Automatically allowed when preauthorized and validated |
| Consequential administrative or clinical action | Human approval or qualified human decision required |

## Approval workflow

```text
AGENT PREPARES ACTION
        |
        v
VALIDATE ACTION SCHEMA
        |
        v
CHECK RISK + POLICY
        |
        v
CREATE IMMUTABLE PROPOSAL
        |
        v
AWAIT HUMAN REVIEW
        |
        +------ REJECT -----> CLOSED
        |
        +------ EDIT -------> NEW REVISED PROPOSAL
        |
        +------ ESCALATE ---> SPECIALIST QUEUE
        |
        +------ APPROVE
                    |
                    v
           REVALIDATE CONDITIONS
                    |
                    v
             EXECUTION GATEWAY
                    |
                    v
          VERIFY SIMULATED RESULT
                    |
                    v
            CASE EVENT + AUDIT
```

## `action_proposals` schema

Required fields:

```text
id
tenant_id
case_id
agent_run_id
action_type
target_system
target_reference
proposed_payload
payload_hash
risk_level
required_permission
required_approver_role
status
case_version
expires_at
created_at
```

The proposal payload must be immutable after approval submission. Editing creates a revised proposal that requires a fresh decision.

## Approval states

`PROPOSED → AWAITING_APPROVAL → APPROVED → EXECUTING → COMPLETED`

Alternative states:

`REJECTED`, `EXPIRED`, `STALE`, `ESCALATED`, `FAILED`.

Before executing an approved action, the backend must verify:

- The approver has the required role.
- The approval applies to this specific action and payload.
- The case has not changed in a way that invalidates the proposal.
- The recipient and document references are still correct.
- The approval has not expired.
- The action has not already executed.

For the demonstration, external execution must only update synthetic records and produce a mock success/failure receipt.

An approval must never send real messages or documents to external recipients.

---

# 12. RAG and AI Assistant Backend

The assistant needs to support three scopes:

**Case scope:** Questions about the currently selected case.

**Work-queue scope:** Questions about cases and tasks belonging to the logged-in employee or their authorized team.

**Authorized search scope:** Questions across cases the user is permitted to view within the hospital.

It must not perform unrestricted searches across tenants.

## Retrieval architecture

```text
USER MESSAGE
     |
     v
IDENTIFY USER + TENANT + PERMISSIONS
     |
     v
RESOLVE INTENT AND CASE CONTEXT
     |
     +----------------------+
     |                      |
     v                      v
STRUCTURED DATA QUERY    DOCUMENT RETRIEVAL
     |                      |
     |                FULL TEXT SEARCH
     |                + OPTIONAL VECTOR
     |                      |
     +-----------+----------+
                 |
                 v
         VERIFIED CONTEXT
                 |
                 v
        MOCK / LOCAL LLM
                 |
                 v
         GROUNDED RESPONSE
                 |
                 v
      CITATIONS + NEXT ACTION
```

## RAG ingestion process

1. Upload or generate a synthetic document.
2. Save the original file with a unique ID.
3. Extract embedded text.
4. Identify page and section boundaries.
5. Normalize text.
6. Split into reasonably sized, overlapping chunks.
7. Save chunks with tenant, case and document metadata.
8. Index for PostgreSQL full-text search.
9. Optionally generate local embeddings and store in pgvector.
10. Mark the relevant document version as indexed.

For the MVP, support text-based PDFs and structured synthetic records. OCR for scanned image-only documents can be a later extension.

## Retrieval strategy

Use **hybrid retrieval** when local embeddings are enabled:

- Structured database queries for statuses, dates and assignments.
- Full-text retrieval for exact terms, names, identifiers and payer phrases.
- Vector retrieval for semantically related passages.
- Source validation and permission filtering before answer generation.

Do not use semantic search to determine whether an authorization is currently approved. That must be obtained from live structured case data.

## Assistant response format

```json
{
  "conversation_id": "synthetic-uuid",
  "scope": "case",
  "case_id": "synthetic-uuid",
  "answer": "The authorization is pending because the payer requested an additional progress note.",
  "sources": [
    {
      "document_id": "synthetic-uuid",
      "page": 1,
      "title": "Mock Payer Information Request"
    }
  ],
  "proposed_actions": [
    {
      "type": "prepare_document_request",
      "requires_approval": true
    }
  ],
  "unresolved_questions": []
}
```

This is an illustrative API contract.

The backend should generate a document reference only if that source was actually retrieved and authorized.

If data is missing or contradictory, the answer should explicitly state the uncertainty.

## AI model configuration

Use two runtime modes.

**Mode A — MOCK**

The default demo mode.

- Deterministic scenario handling.
- Database-backed responses.
- Keyword and structured intent parsing.
- Templates for supported questions.
- No model download required.

**Mode B — LOCAL_LLM**

Optional enhanced demonstration.

- Ollama running locally.
- Downloaded open-weight model.
- Structured output.
- Local document retrieval.
- Backend-controlled tool execution.
- No external AI inference requests.

Mock mode is not equivalent to a general-purpose language model. The product must clearly distinguish simulated intelligent behavior from actual local-model inference.

The local model must never be responsible for enforcing tenant permissions or workflow policies.

---

# 13. Voice Assistant Backend

The frontend will expose a microphone control in the persistent AI sidebar.

The backend must support this workflow:

```text
MICROPHONE RECORDING
        |
        v
POST /api/v1/voice/transcribe
        |
        v
LOCAL SPEECH-TO-TEXT
        |
        v
TRANSCRIBED MESSAGE
        |
        v
ASSISTANT SERVICE
        |
        v
GROUNDING / TOOL EXECUTION
        |
        v
TEXT RESPONSE
        |
        +----> DISPLAY IN SIDEBAR
        |
        +----> OPTIONAL LOCAL SPEECH OUTPUT
```

Recommended implementation:

- faster-whisper for offline speech recognition.
- Piper for optional offline text-to-speech.
- Accept short uploaded audio segments from the frontend.
- Validate file type, size, and duration.
- Keep transcripts tied to authorized conversation context.
- Do not persist raw audio by default.
- Require review or confirmation before high-risk actions.

The first demo may use push-to-talk instead of continuous listening.

If the local speech model is unavailable, the typed assistant must continue working normally. A typed-transcript simulator may be used for demonstrating the voice workflow, but it must be labeled as a simulation.

---

# 14. Synthetic Hospital and Insurance Systems

**No actual healthcare APIs or live API keys will be used.**

Build provider adapters with deterministic mock responses.

## Mock EHR

Stores:

- Fictional patient records
- Synthetic medical record numbers
- Referrals and service orders
- Synthetic clinical notes
- Test results and imaging report references
- Encounter statuses

## Mock Insurance System

Stores:

- Fictional insurance companies and plan IDs
- Eligibility responses
- Benefit configurations
- Network participation rules
- Prior authorization requirements
- Approval and denial responses
- Additional-document requests

## Mock Authorization System

Simulates:

- Authorization required
- Authorization not required
- Request submitted
- Payer acknowledgment
- Additional information requested
- Approval
- Denial
- Expired authorization
- Authorization-location mismatch
- Payer timeout

## Mock Scheduling System

Simulates:

- Available MRI appointments
- Tentative bookings
- Confirmed appointments
- Rescheduling
- Cancellations
- No-shows
- Completed examinations

## Mock Billing System

Simulates:

- Claims created
- Claims submitted
- Accepted claims
- Rejections
- Denials
- Payments
- Financial adjustments
- Financial closure

## Mock Communications

Simulates:

- Request drafted
- Request approved
- Request sent
- Mock delivery acknowledgment
- Missing response
- Failed delivery

No external email, SMS, fax, insurer portal, or EHR call should occur in demo mode.

Provide scenario configuration with seeded responses so the demo can produce reproducible outcomes.

---

# 15. Synthetic Data Design

Seed a fictional hospital environment containing:

- Two hospital tenants
- Multiple departments
- Fictional employees with roles
- At least 100 synthetic patient records
- At least 150 synthetic referral cases
- MRI service orders
- Fictional insurance policies
- Clinical-note PDFs
- Authorization decision letters
- Appointment records
- Claim statuses
- Tasks, agent-run records, approval requests and case events

Use deterministic seed values to keep scenarios reproducible.

Create six primary demonstration cases:

| Scenario | What it demonstrates |
|---|---|
| Missing physician progress note | Document agent and human approval |
| Coverage verified, authorization pending | Insurance and authorization workflow |
| Authorization approved | Scheduling readiness |
| Approval does not match MRI location | Exception detection |
| MRI completed, report pending | Clinical tracking and results communication |
| Clinical referral resolved, claim denied | Revenue-cycle follow-up and independent closure |

Additional edge cases should cover:

- Duplicate referrals
- Ambiguous patient matches
- Invalid order details
- Unavailable payer service
- Incomplete authorization packet
- Rescheduled appointment
- Expired authorization
- Failed simulated transmission
- No-show
- Missing final report
- Invalid claim
- Cross-tenant access attempts

No real patient identifiers, phone numbers, addresses, insurance details or clinical records should be included.

Clearly label the environment as a synthetic demonstration.

---

# 16. Backend API Specification

Use REST endpoints under `/api/v1`.

Use WebSocket or Server-Sent Events only where the frontend benefits from real-time updates. For a one-way case timeline, Server-Sent Events are sufficient.

## Authentication and users

```text
POST   /api/v1/auth/demo-login
GET    /api/v1/auth/me
GET    /api/v1/users
GET    /api/v1/roles
```

Demo login selects a seeded fictional user and issues a local demo-session token.

All endpoints must enforce tenant and role permissions even though the data is fake.

## Cases and referrals

```text
GET    /api/v1/cases
POST   /api/v1/cases
GET    /api/v1/cases/{case_id}
GET    /api/v1/cases/{case_id}/summary
GET    /api/v1/cases/{case_id}/timeline
GET    /api/v1/cases/{case_id}/readiness

POST   /api/v1/referrals
GET    /api/v1/referrals/{referral_id}
```

Support pagination, filtering by status, owner, priority, service line, and dates.

## Documents

```text
GET    /api/v1/cases/{case_id}/documents
POST   /api/v1/cases/{case_id}/documents
GET    /api/v1/documents/{document_id}
POST   /api/v1/documents/{document_id}/verify
```

## Insurance and authorization

```text
GET    /api/v1/cases/{case_id}/insurance
POST   /api/v1/cases/{case_id}/insurance/check

GET    /api/v1/cases/{case_id}/authorizations
POST   /api/v1/cases/{case_id}/authorizations/prepare
POST   /api/v1/authorizations/{id}/propose-submission
GET    /api/v1/authorizations/{id}/history
```

## Scheduling, clinical tracking and billing

```text
GET    /api/v1/cases/{case_id}/appointments
POST   /api/v1/cases/{case_id}/appointments/propose

GET    /api/v1/cases/{case_id}/clinical-milestones
GET    /api/v1/cases/{case_id}/claims
GET    /api/v1/cases/{case_id}/financial-status
```

## Tasks and human approvals

```text
GET    /api/v1/tasks
POST   /api/v1/tasks
PATCH  /api/v1/tasks/{task_id}

GET    /api/v1/approvals
GET    /api/v1/approvals/{approval_id}
POST   /api/v1/approvals/{approval_id}/approve
POST   /api/v1/approvals/{approval_id}/reject
POST   /api/v1/approvals/{approval_id}/escalate
```

## Assistant and agents

```text
POST   /api/v1/assistant/messages
GET    /api/v1/assistant/conversations
GET    /api/v1/assistant/conversations/{id}

POST   /api/v1/voice/transcribe
POST   /api/v1/voice/synthesize

GET    /api/v1/agents/runs
GET    /api/v1/agents/runs/{run_id}
POST   /api/v1/agents/{agent_name}/run
```

Manually triggered agent runs must follow the same authorization and tool restrictions as event-triggered runs.

## Dashboard and simulation

```text
GET    /api/v1/dashboard/summary
GET    /api/v1/dashboard/work-queues
GET    /api/v1/analytics/workflow

POST   /api/v1/demo/seed
POST   /api/v1/demo/reset
POST   /api/v1/demo/events
GET    /api/v1/events/stream
```

Demo reset and seed endpoints must be disabled outside demo mode and restricted to demo administrators.

Use OpenAPI-generated documentation as the shared frontend/backend contract.

Every mutation endpoint should have documented validation errors, permission requirements and side effects.

---

# 17. Complete Example: Referral to Closure

The following is the demonstration's reference scenario.

### Step 1 — Referral received

The mock EHR delivers a referral event.

The backend creates a referral record and an outbox event.

### Step 2 — Intake Agent runs

The background worker triggers the intake agent.

It extracts structured information and finds the correct synthetic patient match, or sends ambiguous matches for review.

### Step 3 — Missing document detected

The document agent identifies an absent physician progress note.

The agent creates a task and proposes an outgoing request.

### Step 4 — Human approval

The request appears in the AI Action Center.

A referral coordinator reviews the recipient, wording, supporting source and proposed action.

The coordinator approves.

### Step 5 — Simulated request sent

The mock communication adapter records a successful delivery and generates an acknowledgment event.

No real message is transmitted.

### Step 6 — Document received

The demo event simulator delivers the missing synthetic physician note.

The backend stores it and triggers indexing and document validation.

### Step 7 — Insurance checked

The insurance agent requests eligibility from the mock payer gateway.

The result is saved with its simulated source and timestamp.

### Step 8 — Authorization prepared

The authorization agent creates a packet containing the order, identifiers and appropriate supporting records.

The packet is proposed for authorized human review.

### Step 9 — Authorization submitted

After approval, the mock payer accepts the submission and returns a fictional tracking identifier.

### Step 10 — Authorization approved

A simulated payer event records the approval.

The workflow engine validates the approved service against the planned appointment details.

### Step 11 — Scheduling

The scheduling agent proposes a suitable MRI appointment.

The simulated scheduling system confirms the appointment after the applicable action policy is satisfied.

### Step 12 — Clinical service

The demo simulates a qualified employee recording the completion of MRI safety checks and imaging.

No AI agent performs or certifies the clinical safety assessment.

### Step 13 — Report finalized

The mock clinical system publishes a synthetic final imaging report.

The system records communication to the referring provider through a simulated clinical communication event.

### Step 14 — Billing

The mock billing system creates and processes a synthetic insurance claim.

A payment or financial-resolution event updates the financial workstream.

### Step 15 — Closure

The closure agent reconciles the clinical referral and financial states.

It proposes the appropriate disposition.

The authorized case owner completes the required review.

The final timeline includes every system event, AI run, human decision and mock integration response.

---

# 18. Security Architecture and HIPAA Preparation

The demonstration must use only synthetic information.

**Do not describe the demo as HIPAA-certified or HIPAA-compliant for processing real PHI.**

However, structure it so appropriate safeguards can be implemented later.

## Security design requirements

- Separate each hospital using `tenant_id`.
- Enforce tenant and role filtering in backend queries.
- Use authenticated application sessions.
- Validate every API input.
- Avoid arbitrary file paths and unsafe uploads.
- Preserve document-source information.
- Record AI actions and human decisions.
- Do not expose private records through application logs.
- Prevent cross-tenant document retrieval.
- Use database transactions for critical changes.
- Prevent unauthorized or duplicate actions.
- Avoid hardcoded production secrets.
- Default to denying actions without explicit permission.

For the demo, use local signed session tokens and fictional users. This is not a substitute for production enterprise authentication.

For a future real-PHI deployment, the design will require formal HIPAA risk analysis, appropriate business associate agreements, access controls, audit controls, encryption, secure infrastructure, vendor assessments, incident response procedures, backup/recovery capabilities and retention policies.

Production authentication should support enterprise identity providers using OIDC/SAML, stronger session controls and role/attribute-based authorization.

## RAG security

Retrieval must be tenant-scoped and permission-filtered **before content reaches the model**.

Documents are untrusted input.

The assistant must not follow instructions embedded in a patient document, referral, payer letter or retrieved search result.

No natural-language request should be able to bypass the tool registry or approval requirements.

Audio transcripts and embeddings should be treated as sensitive when real PHI is introduced.

---

# 19. FDA Regulatory Boundary

The first product's intended use is administrative workflow orchestration and case information retrieval.

Do not implement autonomous:

- Medical diagnoses
- Treatment selection
- Medical necessity determinations
- MRI safety clearance
- Clinical emergency triage
- Interpretation of diagnostic images
- Patient-specific clinical treatment recommendations

Those functions may introduce medical-device regulatory considerations.

The initial software should support administrative tasks and display clinical information recorded by qualified professionals.

FDA treatment of software depends on intended use and functionality, not merely on whether the product contains AI or a human approval step.

Before adding clinical decision-support functionality, obtain a formal regulatory assessment of the relevant function.

---

# 20. Testing Strategy

The product must be demonstrated as a working system, not as screens containing predetermined text.

## Unit tests

Test:

- Document classification
- Case validation
- Workflow transitions
- Required-document rules
- Authorization matching
- Agent output validation
- Task assignment
- Approval policies

## Integration tests

Test:

- API to database persistence
- Event generation
- Background job execution
- Agent tool calls
- Mock payer response handling
- Document ingestion and retrieval
- Approval followed by simulated execution

## Security tests

Test:

- Cross-tenant case access is denied.
- Unauthorized users cannot approve actions.
- An expired approval cannot execute.
- Changed proposal payloads invalidate approvals.
- Untrusted document instructions cannot trigger tools.
- Clinical actions cannot be executed by administrative agents.

## Reliability tests

Test:

- Duplicate events
- Worker retries
- Failed payer simulation
- Application restart during pending jobs
- Concurrent case updates
- Stale approvals
- Replayed event delivery
- Missing model availability

## Assistant evaluation

Create a benchmark of at least 50 synthetic questions with expected answers and approved source references.

Include questions such as:

- "What is the current authorization status?"
- "Which supporting document is missing?"
- "Who owns the next action?"
- "Did we send the packet?"
- "When does the authorization expire?"
- "Which cases are overdue?"
- "Can I access this other hospital's case?"

Measure factual correctness, source grounding, permission enforcement and unsupported-action prevention.

A response must not be marked correct merely because it is fluently written.

---

# 21. Performance and Observability

Track operational metrics from day one.

## Backend metrics

- API response latency
- Database query latency
- Worker queue depth
- Job processing latency
- Agent execution time
- Agent failure/retry count
- Document indexing time
- Assistant response latency
- Local model token usage, if applicable
- Tool-execution success rate
- Approval queue age

## Hospital workflow metrics

- Referrals processed
- Average administrative touches per case
- Time from referral to verified case
- Authorization preparation time
- Outstanding exception count
- Average approval turnaround
- Cases requiring manual intervention
- Successful straight-through administrative steps
- Time to clinical referral closure
- Financial resolution time

Do not claim actual hospital staff time savings from synthetic demo timing.

Synthetic events can illustrate potential savings, but real ROI must later be established through hospital time-and-motion measurements.

Use correlation IDs for every API request and background workflow so developers can trace:

`API Request → Domain Event → Agent Run → Action Proposal → Human Approval → Tool Execution → Final Result`.

---

# 22. Local Development and Environment Configuration

Use Docker Compose with:

```text
service: api
service: worker
service: postgres
service: ollama (optional profile)
```

Frontend deployment is separate from this backend specification.

Example environment configuration:

```env
APP_NAME=CareFlowAI
APP_ENV=demo
DEMO_MODE=true

DATABASE_URL=postgresql+asyncpg://careflow:localdev@localhost:5432/careflow

AI_PROVIDER=mock
LOCAL_LLM_ENABLED=false
OLLAMA_BASE_URL=http://localhost:11434

EMBEDDINGS_ENABLED=false
VOICE_ENABLED=false

EXTERNAL_INTEGRATIONS_ENABLED=false
ALLOW_REAL_PATIENT_DATA=false

LOG_LEVEL=INFO
```

These credentials are local examples only and must not be reused for production.

In demo mode:

- No external integration adapter can make a live request.
- No actual patient information is accepted by design.
- All outbound communication is simulated.
- All agent actions are logged.
- Synthetic fixtures can be reset.
- The app works without an AI service.
- Optional local model services can be enabled independently.

Add startup validation that refuses to run the demonstration if `EXTERNAL_INTEGRATIONS_ENABLED=true`.

Do not rely on the environment variable alone for safety. The demo integration gateway should contain no production HTTP clients or real-provider credentials.

---

# 23. Recommended Development Order

The developer should follow this implementation sequence.

## Phase 1 — Backend Foundation

Build:

- FastAPI application structure
- PostgreSQL connection
- SQLAlchemy models
- Alembic migrations
- Tenant and user model
- Demo authentication
- Case creation and retrieval
- Event and audit logging
- Synthetic seed generator

**Acceptance:** Users can access authorized synthetic cases, and all case records persist correctly.

## Phase 2 — Workflow Engine

Build:

- Domain-specific case states
- Transition guards
- Task creation and assignment
- Document requirements
- Case readiness calculation
- Case timeline
- Outbox events
- Durable worker

**Acceptance:** Case transitions, tasks and event histories are correct and recoverable after application restart.

## Phase 3 — First AI Agents

Build:

- Intake agent
- Document intelligence agent
- Agent-run tracking
- Tool registry
- Mock AI provider
- Agent-triggered task creation

**Acceptance:** A new referral automatically produces extracted data, a valid case review, and appropriate missing-information tasks or proposals.

## Phase 4 — Human-in-the-Loop

Build:

- Action proposal schema
- Approval and rejection endpoints
- Role-based approval policy
- Approval expiration and stale-state checks
- Mock execution gateway
- Auditable execution results

**Acceptance:** No approval-required action can execute without valid authorization.

## Phase 5 — Case Assistant

Build:

- Conversation storage
- Case and work-queue scopes
- Structured case query tools
- Full-text document indexing
- Source-grounded responses
- Optional local LLM provider
- Optional vector retrieval

**Acceptance:** Employees can ask supported case questions and receive correct answers grounded in authorized case records.

## Phase 6 — Insurance and Authorization Agents

Build:

- Mock eligibility adapter
- Synthetic payer-rule data
- Authorization requirement checks
- Packet preparation
- Approval mismatch detection
- Simulated submission and payer responses
- Follow-up and denial workflows

**Acceptance:** A referral moves through insurance verification and authorization without manual reconstruction of the case history.

## Phase 7 — Scheduling, Revenue Cycle and Closure

Build:

- Mock appointment integration
- Scheduling agent
- Clinical milestone tracking
- Mock claim integration
- Revenue-cycle agent
- Closure agent
- Separate clinical and financial disposition

**Acceptance:** A synthetic case can progress from referral receipt to documented closure with each workstream independently tracked.

## Phase 8 — Voice and Demo Hardening

Build:

- Offline transcription option
- Optional local speech output
- Streaming assistant responses, if needed
- Complete synthetic scenario fixtures
- Dashboard analytics endpoints
- Failure simulation
- End-to-end test suite
- Development documentation

**Acceptance:** The complete demonstration operates without external API credentials, with optional local voice/model features and a reliable text-based fallback.

---

# 24. Demo Definition of Done

The backend is complete for the demonstration only when all the following are true:

1. A new synthetic referral creates a real database record.
2. An intake agent runs from an event rather than a hardcoded frontend animation.
3. The document agent identifies genuinely missing synthetic evidence.
4. An agent can create a reviewable action proposal.
5. A human can approve or reject that proposal.
6. Approved actions execute only through simulated integrations.
7. A fake insurance response updates the correct case.
8. A fake authorization approval advances the relevant workflow.
9. An authorization mismatch creates an exception instead of incorrectly clearing the case.
10. Scheduling and clinical milestone events update independent workstreams.
11. Claim events can progress to financial resolution without reopening unrelated clinical tasks.
12. The assistant can answer case questions using persistent authorized records.
13. The assistant can search across authorized cases without crossing tenant boundaries.
14. Every answer about a document can show verifiable source references.
15. Voice can optionally turn spoken requests into the same assistant workflow.
16. Every agent run, human approval, state change and simulated external result is audited.
17. Duplicate events do not cause duplicate consequential actions.
18. Interrupted worker jobs can recover safely.
19. The system starts locally without live API keys.
20. The full demonstration can be reset and replayed using synthetic fixtures.

---

# 25. Final Engineering Principles

The development team should apply the following rules consistently.

**1. AI is the intelligence layer, not the source of truth.** The database and verified integrations own operational facts.

**2. The workflow engine owns state changes.** Agents cannot bypass transition rules.

**3. Humans own consequential decisions.** The approval engine controls sensitive administrative actions, while qualified clinical staff own clinical judgments.

**4. Agents must be bounded and observable.** Each agent receives a specific objective, limited tools, structured inputs and outputs, and explicit failure handling.

**5. Build event-driven automation.** Trigger work when something meaningful changes instead of repeatedly running LLMs over every case.

**6. Keep business logic independent of model providers.** Swapping a mock provider for a local model must not change workflow integrity.

**7. Treat every document as untrusted input.** Retrieved text provides evidence, not executable instructions.

**8. Maintain strict tenant isolation.** The assistant and every backend tool operate within the user's permitted scope.

**9. Separate clinical completion from financial closure.** These are related but independently managed workstreams.

**10. Optimize for measurable reduction in human administrative effort.** The number of agents is not a success metric; eliminated repetitive work and safe case throughput are.

## Final System Architecture

```text
             CAREFLOW AI BACKEND
                      |
              FASTAPI API GATEWAY
                      |
              AUTH + PERMISSIONS
                      |
        +-------------+-------------+
        |                           |
   DOMAIN SERVICES             AI ASSISTANT
        |                           |
   WORKFLOW ENGINE              RAG ENGINE
        |                           |
   DOMAIN EVENTS               AI ORCHESTRATOR
        |                           |
   BACKGROUND WORKER             AGENTS
        |                           |
        +-------------+-------------+
                      |
               TOOL VALIDATION
                      |
              ACTION POLICY ENGINE
                      |
                HUMAN-IN-LOOP
                      |
              EXECUTION GATEWAY
                      |
       +--------------+--------------+
       |              |              |
    MOCK EHR      MOCK PAYER     MOCK BILLING
       |              |              |
       +--------------+--------------+
                      |
                POSTGRESQL
                      |
           EVENTS + AUDIT + JOBS
```

**Final instruction to the developer:**

Build a modular, event-driven, AI-native backend that can take a synthetic hospital referral from intake through insurance, authorization, scheduling, clinical completion, billing and closure.

The system must have persistent case records, specialized AI agents, a document-grounded conversational assistant with text and optional voice, durable workflow execution, human-in-the-loop approvals, role-based permissions, and a complete audit trail.

Use Python, FastAPI and PostgreSQL as the foundation. Use local or simulated AI and payer integrations so the demonstration works without paid API keys. Keep the architecture extensible for eventual real hospital integrations.

**The objective is not to create a chatbot for hospital employees. It is to build an AI-driven administrative operating system where the routine work is performed or prepared automatically, the human handles exceptions and important decisions, and every case remains traceable from referral to closure.**
