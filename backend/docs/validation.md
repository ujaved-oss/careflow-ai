# Executed validation — 11 October 2026

Verified on Windows, Python 3.14.4 and PostgreSQL 16.14, using real asyncpg connections and a dedicated `careflow_test` database. The delivered Windows launcher was also exercised independently with its own persistent PostgreSQL instance on port 55433. The API binds to `127.0.0.1:8000`.

| Check | Result |
|---|---|
| pytest | **87 passed** in 27.70 seconds |
| Assistant benchmark | **60/60 passed**, included in pytest total |
| Ruff | Passed |
| mypy | Passed across 22 source files |
| Python compilation | Passed |
| Alembic schema drift | No new upgrade operations detected |
| API schema | 55 OpenAPI paths, with typed operational responses |
| Windows fresh install/start | PostgreSQL, migrations, seed, API and worker started |
| Live HTTP replay | New referral reached **FULLY_RESOLVED** through six reviewed simulated actions |
| Full service restart | Approved pending action survived stop/restart of API, worker and PostgreSQL and then completed |
| Launch/stop scripts | Tested, including Windows venv child-interpreter cleanup |

Checks cover persistent referral-to-closure processing, duplicate referrals/events, database-level proposal immutability, expired/stale approvals, post-approval case changes, role/tenant denials, private conversations, document prompt injection, synthetic upload validation, clinician-only decisions, worker leases, retries/dead lettering, payer unavailability, ambiguous identity, invalid orders/claims, version guards, concurrent approvals, hospital-scoped reset, model fallback, typed contracts and PDF procedure/contrast/location consistency.

Benchmark expected facts come from the seed definition, not assistant output. Assertions check factual content, allowed case sources, actual same-hospital documents, citation page/version and absence of unsupported actions. This validates supported deterministic intents, not general-purpose LLM capability.

## Live evidence

Full replay case: `b2ff78cf-760b-4b77-a7f4-68044a97513b` / `SYN-36ab229eeb36427ebc16`. It ended with accepted referral, complete documents, verified insurance, approved authorization, completed appointment, completed clinical communication, paid financial state and fully resolved case disposition. The assistant summary included nine persistent source references.

Restart proposal: `02a6e2e7-3f80-4a9b-84cd-3e2902068277`. With the worker stopped, human approval persisted in the database. After a full service stop/restart it completed with receipt `SYN-FOLLOW_UP-02a6e2e7-3f80-4a9b-84cd-3e2902068277`.

`test-results.xml` retains automated results; `openapi.json` retains the API contract. No session tokens or private credentials appear in this evidence. The distributable ZIP excludes environments, databases, caches and generated document storage; startup regenerates synthetic fixtures.

## Unverified or deferred

- Docker is unavailable on this host. Compose configuration was checked, but container build/run remains untested.
- Actual offline speech models and successful Ollama inference were not installed/exercised. Disabled voice, typed simulation and unavailable-model fallback were verified. Default mock mode works without keys.
- OCR/vector retrieval are deferred. Embeddings enablement is explicitly rejected.
- Observability includes request/correlation logging, job duration, queue/dead-letter counts and audited agent/approval events. Comprehensive metrics export and hospital ROI measurement remain future work.
- This bounded synthetic outpatient MRI prototype is not a real hospital integration, clinical decision system or certified real-PHI environment. Production controls and assessments require separate work.
