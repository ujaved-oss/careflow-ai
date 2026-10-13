# CareFlow AI â€” shared team demo

The website and Mira guided walkthrough remain available. Staff profiles now use one durable shared case workspace, beginning with **zero cases**. Only fictional patient data belongs here.

## Staff workflow

Admin or Intake creates a case from a sample email/fax, paper referral, hospital-system request or reception request. These are source labels entered by a person, not connected inboxes or feeds.

1. Intake checks the request and sends it to the assigned Doctor.
2. Doctor checks the order or returns it for missing information.
3. Insurance Coordinator checks the insurer elsewhere and records the answer, channel, reference and evidence. Approved cases move to Scheduling; denied/more-information cases return to Intake; pending cases stay with Insurance.
4. Scheduling Coordinator books one appointment, after order and insurance checks.
5. Doctor records the pre-visit check, completed visit, fictional report and report handoff.
6. Claims Coordinator records submission and the payer response. Denied claims stay with Claims for correction and resubmission. Paid claims move to closure.
7. Admin or the assigned closer checks the completed work and closes the case.

**My work** shows only the current steps assigned to that person. **Case records** shows cases assigned to or worked on by that person; Admin can see the overall team record. Server-side permissions hide clinical report text and financial detail from roles without those permissions. Every change records who did it and when. Admin can change the next owner to an active person qualified for that step.

Staff tabs have independent sessions. Server-sent revision events refresh queues automatically, normally within a few seconds. Stale forms cannot overwrite a newer case. Replayed operation IDs cannot duplicate a booking or create another case.

## Accounts and access

Admin â†’ **Team & access** provides account creation, role assignment, disabling accounts, custom roles with selected permissions, access history and restoration of archived cases. **Archive this case** removes a case from queues and records without destroying its history.

The six initial profiles are Admin, Intake Coordinator, Insurance Coordinator, Scheduling Coordinator, Doctor and Claims Coordinator. Only the verified Site owner can preview these demo personas. Actual staff accounts use the verified email from ChatGPT sign-in and can enter only their own account. An account must also receive access via the private Site's sharing settings; creating it inside CareFlow does not invite people or change Site sharing. No passwords are generated. Disabled accounts and role changes are checked on every server request.

## Runtime and storage

- Hosted Site: Cloudflare Worker with a provisioned D1 binding named `DB`. The Worker serves the website and `/team-api` routes. Immutable schema-only Drizzle migrations are packaged by the Sites workflow and applied before publication.
- Local development: Node 24+ server on loopback port 8788, SQLite at ignored `.runtime/team.sqlite`, and Vite on 5173. Local requests use an explicit development owner identity, suitable only for this loopback demo. The same API and workflow model are used locally and hosted. Local and hosted databases are separate.
- The earlier Python API, its PostgreSQL fixtures and workers are retained separately. The new staff UI does **not** read those seeded cases. They are not connected to the new shared workspace.
- Mira guides the actual shared staff screens. Admin registers one tagged guided case, Intake checks it, and the assigned staff profiles finish their own steps. The tour stays on that same case through closure and shows case-derived counts. Presenter mode fills empty sample fields together; hands-on mode offers one field example at a time. Existing choices and text are preserved. Neither mode checks human review boxes or saves on a timer. Start a fresh tour recoverably archives tagged guided cases only; regular cases are preserved. Existing browser-local tour source remains for historical fixtures, but the live entry no longer opens that separate story. No live AI provider is connected.

### Run locally

Run `npm install`, then `npm run dev:team` and `npm run dev` in separate terminals. Open `http://127.0.0.1:5173/`. Alternatively run `scripts/start-local.ps1` for hidden background services. `npm run check`, `npm test` and `npm run build` validate and build the frontend and Worker. Use `npm run db:generate` after a schema change; inspect generated SQL and append migrations rather than editing applied files.

## Boundaries

Insurance answers, report handoffs, claims and payments are recorded examples. No emails are sent, no insurer decisions are made, and no money is moved. No live hospital, payer, identity-directory or LLM integration has been connected. This is a shared administrative demo, not a production clinical system or a compliance-certified service.

The current database stores one revisioned workspace document with compare-and-swap writes. This is sufficient for the demonstration but would need normalized records, operational backups, stronger concurrency design and a production identity/integration architecture before use with real patients. Account management here controls this one workspace.

## Presentation release (12 October 2026)

The preflight checks database reachability, visible case counts and demo boundaries. Times are shown in Asia/Karachi (PKT), including booking history. A future visit requires an explicit fictional visit-day simulation acknowledgment. Order review and visit completion have separate statuses. Insurance and claims responses retain scoped evidence; claim resubmission keeps the prior reference, amount and currency. An immutable saved request record explains manually registered intake. Account creation now ends with a private-Site-sharing and independent-sign-in checklist; it does not send invitations or change sharing. Results export as CSV from the same shared case. Real second-person sign-in, live AI, PDF/OCR document extraction, insurer/EHR/email connections and real payments remain outside this synthetic release.

## First-user fixes (13 October 2026)

The landing page defines the hospital staff audience and shows an actual fictional case screen. Guided entry starts with the patient scenario; presenter checks are folded into options. Mira uses actual assigned names, distinguishes doctor review from insurer coverage, explains returns and pending answers, and declines unmatched questions. Example buttons fill empty fields only. Exit tour keeps the case, and completing or cancelling the case ends guide mode automatically. New case always opens normal registration with a visible intake assignment.

Intake or Admin can correct a request before booking. The original source remains immutable; doctor and insurance checks restart. The assigned scheduling person can reschedule or cancel a booking before the visit completes. Rescheduling keeps the appointment ID and repeats preparation; cancelling the booking permits a new booking. Admin may cancel a whole case before the completed visit. Cancelled cases keep history and count as finished, but never as successfully completed in results. Self-pay and bill write-off flows remain outside this insured MRI demonstration.

Insurance and doctor correction details are redacted from other role views, including legacy blocker text and history. New regression coverage is in tests/team-first-user.test.js. No visitor sharing or staff access policy is changed by this release.


## Simulated AI release (13 October 2026)

All ten administrative capabilities now run in the actual shared staff workspace through a deterministic, source-linked simulation. Open **New case → Read a fictional referral**, or **Open demo helpers** on any case. Staff can add fictional labeled text, upload a small `.txt` file, inspect sources, review document labels, prepare missing-paper and insurance drafts, extract insurer replies into a reviewed form, get case briefs, retrieve permitted text with Mira, prepare claim-denial replies and check follow-up/closure evidence. The normal workflow still requires the appropriate person's separate review and save.

No paid API is called, no key is read, and no live language model is connected. The earlier Python mock backend remains separate; the new adapter belongs to the Worker used by the published website. PDF/image OCR, embeddings, real payer policies, autonomous clinical/billing decisions and external submissions/messages are not implemented. These are functional fictional-data demonstrations, not live AI or measured hospital results.

The homepage includes all ten simple before/after comparisons and editable monthly hours/wage-value estimates using Chicago-area May 2024 BLS wage data. Time assumptions are illustrative, review time is included, overlapping tasks must not be added, and wage value is not net cash savings.

See [demo-ai-contract.md](docs/demo-ai-contract.md) for interface compatibility, source permissions, limits, the complete presentation route and future-provider boundaries. Tests `ai-intake`, `ai-sequence` and `ai-boundaries` cover all ten through closure, permission filtering, atomic source attachment, replay, wrong identities, stale inputs, invalid letters, abstention and estimates.

The guided entry has also been rebuilt around these helpers: it prepares sample papers, points to the next helper, demonstrates the returned note and denied-claim correction, and ends with a case-derived count of the ten demonstrated skills. Use **Start guided case → Start the case** for the presentation. Read the highlighted instruction, click the helper, run it, inspect the sources, then Continue (or review/fill the form for extraction). Human review boxes and saves remain explicit.
