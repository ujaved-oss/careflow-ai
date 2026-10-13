# CareFlow AI — synthetic backend demonstration

A working FastAPI/PostgreSQL modular monolith for outpatient MRI referral administration. It stores cases, runs bounded event-driven specialist agents, prepares immutable proposals for human review, simulates integrations, and answers supported questions from authorized records and indexed PDFs.

**Synthetic demonstration only.** Default AI is deterministic mock behavior, not a general-purpose LLM. Clinical judgments belong to the clinician persona; administrative agents cannot clear MRI safety or diagnose patients. No real hospital, payer, email, SMS, fax, or paid AI API is connected.

## Start on Windows without Docker

Requires Python 3.12+, PowerShell, and Windows `tar`. From this project folder:

```powershell
.\scripts\start-local.ps1
```

The launcher installs a project-local environment and checksum-verified portable PostgreSQL 16.14, applies migrations, seeds two fictional hospitals, and starts the API and a separate worker in hidden processes. The first run needs internet for dependencies; routine demo operation does not.

Open [API documentation](http://127.0.0.1:8000/docs). The local database uses loopback port 55432 by default and demo-only trust authentication. For occupied ports:

```powershell
.\scripts\start-local.ps1 -ApiPort 8001 -DatabasePort 55433
```

Stop the local services without deleting their records:

```powershell
.\scripts\stop-local.ps1
```

## Start with Docker Compose

```bash
docker compose up --build -d
```

This runs PostgreSQL 16, migrations/seed, the API, and an independent durable worker. Open `http://127.0.0.1:8000/docs`. API/worker share the original synthetic-document volume. Docker execution must be verified on a Docker-enabled machine; the Windows launcher is the verified local path for this handoff.

## Sign in and explore

1. Call `GET /api/v1/auth/demo-users` and select a fictional user ID.
2. Call `POST /api/v1/auth/demo-login` with `{"user_id": "<selected UUID>"}`.
3. Paste its `access_token` into the OpenAPI **Authorize** control (HTTP Bearer).
4. Browse `/cases`, `/dashboard/summary`, `/approvals`, and `/agents/runs`.

Demo login intentionally permits selecting fictional personas. It demonstrates downstream role and tenant enforcement; it is not production identity verification. Demo administrators do not have the clinical permission. Select a clinician separately to record clinical milestones.

The seed creates **2 hospitals, 14 employees, 200 patients, and 300 cases**, with six repeating scenarios. Per hospital, the first six cases demonstrate missing notes, pending authorization, approved authorization, a location mismatch, an outstanding final report, and a denied claim after clinical closure.

## Replay the complete workflow

While the API and worker are running:

```powershell
.venv\Scripts\python.exe scripts\replay_demo.py
```

This uses real API calls and persistent records. It creates a new referral, waits for event-driven agent work, demonstrates scripted human reviews, receives simulated documents/payer decisions, schedules an appointment, records synthetic clinician attestations, finalizes a report, resolves billing, and reviews each closure disposition. It prints `FULLY_RESOLVED` and the grounded assistant summary. The review script is explicitly a demo driver, not an autonomous hospital decision-maker.

## Developer checks

Use a dedicated `careflow_test` database. Testing truncates that database's seeded tables.

```powershell
$env:TEST_DATABASE_URL='postgresql+asyncpg://careflow@127.0.0.1:55432/careflow_test'
$env:DATABASE_URL=$env:TEST_DATABASE_URL
.venv\Scripts\python.exe -m alembic upgrade head
.venv\Scripts\python.exe -m pytest -q
.venv\Scripts\python.exe -m ruff check src tests scripts
.venv\Scripts\python.exe -m mypy src
```

Use `uv sync --frozen --extra dev` for a manual environment. `uv.lock` captures the dependency resolution. Migrations, not application startup `create_all`, own schema creation.

## API behavior

- All business endpoints use authenticated hospital/role scope. Cross-hospital resources return 404.
- A referral accepts a synthetic patient fixture ID, not arbitrary patient identity fields. PDF ingestion accepts only exact server-generated fixtures and retains version/page/hash information.
- Independent referral, document, insurance, authorization, scheduling, clinical, financial, and overall states are relational columns.
- Mutations and their events/outbox entries commit together. Case updates use version checking and row locks.
- Proposals bind payload, permission, reviewer role, case version, and expiry. A database trigger prevents content edits; revisions need a new decision.
- Approved execution is queued. The worker rechecks the human, snapshot, sources, and readiness before producing a simulated receipt. Replays do not duplicate receipts.
- Assistant questions support case, team work queue, and authorized search scopes. Responses include structured record references and actual retrieved document citations. Unsupported questions state the limitation.
- `/voice/transcribe-simulated` is explicitly a typed-transcript simulation. Actual offline transcription/synthesis requires separately installed voice dependencies and local models. Text remains available when voice/model services are missing.
- `POST /demo/reset` is admin-only and hospital-scoped. Stop the worker before reset; the endpoint rejects an in-flight job. Original synthetic PDFs are retained on disk, including orphaned prior fixtures.

## Handoff files

- `docs/architecture.md`: boundaries, persistence, execution and optional features.
- `docs/database.md`: schema and invariants.
- `docs/api_contracts.md`: frontend integration and role requirements.
- `docs/workflow_states.md`: readiness, approvals and closure paths.
- `docs/agent_contracts.md`: the eight specialists and registered tools.
- `docs/security.md`: demo safeguards and limits.
- `docs/demo_scenarios.md`: walkthrough and reproducible failure scenarios.
- `docs/validation.md`: executed checks and remaining limitations.
- `docs/original-specification.md`: the supplied request retained verbatim.
- `docs/openapi.json`: generated API contract.
- `tests/fixtures/assistant_benchmark.json`: 60 expected-answer and source checks.

Local Ollama connectivity is optional and bounded; the verified answer remains the database-derived mock answer. Vector retrieval and OCR are intentionally unavailable and clearly rejected/deferred. Real-PHI deployment, enterprise identity, live adapters, unrestricted clinical software, and measured hospital ROI require a separate implementation and assessment.
