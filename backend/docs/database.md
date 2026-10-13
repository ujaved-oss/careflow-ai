# Database and invariants

The Alembic initial revision creates 26 tables: tenants, users, patients, referrals, cases, service_orders, documents, document_chunks, coverages, authorization_requests, authorization_events, appointments, clinical_milestones, claim_references, tasks, action_proposals, approvals, agent_runs, case_events, outbox_events, jobs, conversations, messages, audit_logs, integration_receipts, and incoming_events.

Every hospital-owned row has `tenant_id`; primary keys are UUIDs and timestamps are timezone-aware UTC instants. Cases bind patient, referral and coordinator through hospital-qualified foreign keys. Case-owned rows also have hospital-qualified foreign keys to their case. Application queries scope related records before reads or mutations. Cross-case references in action payloads are checked at execution.

Operational status columns are indexed relational values. JSONB stores variable simulated responses, proposal payloads and source references. Financial values use PostgreSQL `NUMERIC(12,2)` and Python Decimal. Document chunks contain page text and a GIN-indexed `tsvector`.

Unique constraints cover hospital/MRN, hospital/referral external reference, hospital/case number, referral/case, worker idempotency key, outbox/event, integration/proposal receipt, and hospital/incoming external event ID. Identical incoming events return the prior result; changed content with the same ID is rejected. Case `version` is SQLAlchemy's optimistic lock field; domain mutations also acquire case row locks.

Migration `cf0002` adds a PostgreSQL trigger to reject changes to a proposal's action, target, payload/hash, scope, risk/permission/reviewer policy, case snapshot, expiry and revision ancestry. Status and execution receipt can change. Editing a proposal creates a separate proposal and requires a fresh human decision. Human approvals and proposals occupy different tables.

Audit records are application-maintained, not a tamper-proof external ledger. Demo reset intentionally deletes a hospital's synthetic history. Stronger database access separation, row-level-security policies, durable retention and external audit protections remain production work.
