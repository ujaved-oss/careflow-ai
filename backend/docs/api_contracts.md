# Frontend API contract

Use `/api/v1`, HTTP Bearer tokens and the generated `openapi.json`. Health and the fictional persona picker are public. All case data requires an active demo session. The case list supports offset/limit and status, owner, priority, service-line and received-date filters.

| Persona | Administrative responsibility |
|---|---|
| demo_admin | Seed/reset/simulation and administrative approvals; no clinical permission |
| coordinator | Intake, documents, internal tasks, simulated communication review and case disposition |
| authorization_specialist | Insurance, documents, authorization packet preparation and submission review |
| scheduler | Appointment proposals and appointment approval |
| clinician | Qualified synthetic clinical milestone recording and document verification |
| billing_specialist | Revenue-cycle tasks and administrative communication review |
| viewer | Read-only case and assistant access |

Mutations document their permission and side effects in the endpoint description. Errors are 401 for invalid sessions, 403 for insufficient roles, 404 for absent/out-of-hospital records, 409 for workflow/version/idempotency conflict, and 422 for invalid contracts. Optional voice returns 503 when its local model is unavailable. Oversized uploads return 413.

## Referral intake

```json
{"synthetic_fixture_id":1,"external_reference":"SYN-NEW-001","scenario":"missing_note","procedure_code":"70551","location":"SYN-MRI-A"}
```

`POST /referrals` returns a persisted case with a generated case number. Repeating the external reference with identical content returns the original case; changed content is rejected. No free-form patient identity is accepted. New referral processing occurs in the worker.

## Documents and approvals

`POST /cases/{id}/documents` takes `fixture_type` (`order`, `physician_note`, `payer_letter`, `final_report`) and optional `variant`. It creates a PDF, extracts/indexes pages and leaves the upload unverified. `/documents/{id}/verify` records staff administrative verification. Download the cited original through `/documents/{id}/content`. The multipart upload route accepts only exact known generated fixtures.

The Action Center lists `/approvals`. Its ID is the **proposal ID**, while underlying human decisions are stored separately. Display the proposed recipient, full payload, source documents, required reviewer roles, case snapshot and expiration. Approve/reject/escalate take `{"reason":"..."}`. Approval queues execution; poll proposal status or listen to SSE. A 200 response with `STALE` or `EXPIRED` means the action did not execute. Editing through `/revise` creates a new ID and new approval requirement.

## Assistant

```json
{"message":"Why is authorization pending?","scope":"case","case_id":"<UUID>"}
```

Supported scopes: `case`, `work_queue` (employee's department/team), and `authorized_search` (hospital). Reuse `conversation_id` only with the same user, scope and case context. Document sources provide `document_id`, `page`, `version`, `title` and `excerpt`; structured sources provide record type/ID. Do not present the mock provider as a general-purpose LLM. Proposed follow-ups return a reviewable proposal ID and `requires_approval:true`.

## Clinical and financial events

Only clinician sessions can post milestones. Each request includes the current `expected_version` and `synthetic_attestation:true`. MRI administrative readiness and appointment confirmation are checked before READY or SERVICE_COMPLETED. REPORT_FINAL requires a verified final report. Simulation events are admin-only, strictly typed and keyed by `external_event_id`; they cannot certify clinical safety.

SSE is `/events/stream`, optionally case-filtered. Send Authorization using a fetch-based SSE reader rather than an unauthenticated native EventSource. Resume using `Last-Event-ID`. Events are tenant-scoped and active-user status is rechecked. The stream closes after five minutes for session renewal/reconnection.
