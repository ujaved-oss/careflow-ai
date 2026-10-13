# CareFlow simulated AI contract

All ten capabilities use provider `simulation`, provider version `1.0`, and contract version `1`. They make no model/API requests. An ambient or local API key is never loaded or used. These are deterministic helpers for fictional labeled text, not a trained language model or production clinical service.

## Stable extension points

- `shared/ai-capabilities.js`: stable capability identifiers, UI copy, required permission and illustrative savings inputs.
- `server/ai-engine.js`: provider interface `run({capability, caseRecord, documents, question, at})`. A future provider must return the same validated suggestion contract: title, summary, extracted fields with status, checklist items, evidence citations, draft, abstention/review disposition, provider and version.
- `server/ai-workspace.js`: authorization, identity binding, immutable text sources, run receipts, replay handling, permission stamps and case-version checks. A later provider must use this scoped context rather than raw workspace data.
- `server/team-api.js`: authenticated `/ai/workspace`, `/ai/documents`, `/ai/label`, `/ai/run`. Existing case mutations remain the authority for all clinical, financial, insurance, routing and closure decisions.
- `src/ai-ui.js`: isolated helper dialog with saved source review and explicit form-filling. It cannot submit an insurance decision or create a case automatically. No second floating Mira bot is introduced.

## Records and compatibility

The existing workspace document gains optional `ai_documents` and `ai_runs` arrays lazily. Older workspaces remain readable; no applied migration or original case record is changed. Reviewed intake document IDs are bound to a new case in the same compare-and-swap commit as case creation. A rejected attachment rolls back the entire create operation. A later normalized repository can keep these route and record contracts.

Documents retain original text, type-derived permission scopes, case ID, creator, time and label-review status. Unknown documents stay visible only to their uploader. Confirming a label never broadens access. A clinician's report is clinical-only; billing papers are claims-only. Read access to a case is necessary but does not grant access to every attached document.

Runs retain actor, case/version, scoped document IDs, provider/version, permission stamp, question, output and timestamps. Historic outputs disappear after permission changes. Replayed operations cannot return an output that the current actor cannot read. Sources link to exact text lines or saved case fields. The helper cannot run on an archived/inaccessible case or request an inaccessible source.

The synthetic workspace remains one revisioned JSON record, not a production enterprise database. Demo document count is bounded to 200; inputs are at most 12,000 characters each; run retention is bounded to 500. A 1.5 million-character storage guard refuses additions without changing old records. Production deployment for real patients requires normalized records, storage lifecycle, operational controls and validated real providers/integrations.

## Capability boundaries

1. Intake: parses labeled referral fields. Missing fields remain blank; unsupported procedures are flagged. Only MRI brain, knee and spine are supported by this demo.
2. Classification: identifies sample document markers; flags patient-name mismatch; human label confirmation persists.
3. Completeness: fixed sample intake checklist; wrong-patient documents cannot satisfy it. It does not establish clinical sufficiency.
4. Request: builds a missing-information request; new evidence updates the checklist when rerun. A draft is copyable but never sent.
5. Authorization: retrieves an attached fictional payer policy; checks procedure/dates; maps sample requirements to evidence. Payer/plan applicability and clinical sufficiency require coordinator review. No real payer policy feed or submission.
6. Response: parses a labeled fictional insurer response; rejects unknown decisions, conflicting identity/reference and invalid/expired dates when supplied. Form filling needs explicit review; the existing save still needs separate review. No insurer decision is made by the helper.
7. Handoff: brief from the current role-filtered record and latest staff action.
8. Mira: structured case-fact lookup plus lexical retrieval over permitted text. No embeddings or live generative RAG. Unsupported questions abstain. Clinical report text is available only where existing permissions allow it.
9. Denial: uses the saved claim denial reason and permitted attachments to draft a follow-up; leaves correction details for billing. No autonomous coding, appeal or payment.
10. Follow-up/finish: two-day inactivity rule, current blocker/owner and saved visit/report/payment checks. Running the helper does not reset staff-action timestamps or close the case.

## Client presentation route

Start in Admin, New case, Read a fictional referral. Add the sample signed referral, read it, inspect its sources, tick the helper review, fill the form, then separately review/Create case. Continue as Intake and Open demo helpers. Run Sort papers, Find what is missing and Ask for the missing paper. Add the sample supporting note; rerun completeness to see the missing item resolved. Save intake and doctor review yourself.

As Insurance, add sample Plan rules, run Prepare insurance request. Add sample Insurer reply, run Read insurer reply; inspect sources, review and fill the insurance form. Separately review/save. Scheduling books a future appointment. Doctor simulates visit day explicitly, completes a fictional report and records its handoff. Each role can run Catch up or ask Mira about permitted case facts.

Claims records a fictional claim and denied payer answer. Run Prepare denied-claim reply and Follow up/finish. Correct/resubmit and record the sample payment. Admin runs finish checks, then separately reviews/closes. The existing results sheet reports workflow counts, not measured AI savings.

## Homepage estimates

Ten simple before/after comparisons show per-capability estimated hours and wage value per month. Cases/month, task rate, manual minutes, review minutes and hourly wage are editable. Initial times/rates are illustrative design assumptions, not observed pilot data. Formula: cases × rate × max(0, before − review) / 60; wage value: hours × wage. Chicago-Naperville-Elgin May 2024 BLS hourly means: medical secretaries/admin $22.35; insurance claims/policy processing $25.90; billing/posting $25.01. https://www.bls.gov/regions/midwest/news-release/2025/occupationalemploymentandwages_chicago_20250424.htm

Do not add overlapping tasks. Wage value is potential staff capacity, not cash/net savings. Software, future API, implementation and benefit costs are excluded. The case briefing uses an admin proxy rather than claiming physician savings.

## Guided presentation release

The Start guided case entry now covers all ten helpers in a deliberate sequence. The guide selects the next skill, prepares the relevant fictional sample text, then waits for the user to run and review it. Intake demonstrates a missing note, a request draft and a returned note. Claims demonstrates a denied response before a correction and paid response. Ordinary workflows are not forced into this sequence. Progress derives from capability metadata on saved case history, including the intake reader linked at case registration. Results show the number of distinct simulated capabilities actually run. No timed action or automatic clinical/financial approval is introduced.
