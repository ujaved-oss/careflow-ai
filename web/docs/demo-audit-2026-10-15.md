# CareFlow demo audit — 15 October 2026

Scope: the current shared-team website, its Node/Worker API, and the retained Python backend. The user requested local completion and a GitHub update. The existing hosted Site is unchanged because its Sites project is unavailable to the current connector.

## What changed

- Added an **AI agents** catalog in the workspace header. All ten capabilities explain their job, before/after process, inputs, prepared output, and the person's approval step.
- Each agent's working screen explains why it helps. Mira introduces the correct agent during the case. The final results sheet summarizes the capabilities actually run.
- Kept the distinction clear: Mira guides clicks; the Case answers agent retrieves permitted saved facts. All capabilities are simulations using fictional data, without paid API calls.
- Removed the invented supporting-note filler. A missing note stays missing until a matching source arrives, the checklist is rerun, and the person applies the checked source text. Merely opening or closing the agent cannot skip this step.
- Added recovery links for a returned-note or insurance result closed before its fields were applied. Agent fills clear the separate staff approval checkbox.
- Validated fresh case versions, document sets, and access before applying note or insurance results. A delayed response from a closed/replaced dialog cannot fill another form. Guided refresh cannot restore stale fields onto a newer case step.
- Normal case registration opens the Referral agent with a fresh fictional referral, avoiding an empty reader or a reused referral reference.
- A denied claim now asks what was corrected. The saved correction survives later payment and is visible only to claims staff. Existing API clients may omit the new field; the UI requires it for resubmission.
- Fixed the Python approval race behind the prior failed check: locked SQLAlchemy reads refresh cached proposal/case values, so repeat approval returns a conflict instead of creating a duplicate job.

## Browser walkthrough

Used the actual local UI against a separate SQLite QA database. No production records were changed.

The complete guided case ran through referral preparation and approval, paper sorting, missing-note detection, a request draft, returned-note recheck and source review, doctor review, insurance packet and reply, one appointment, an explicitly simulated future visit, report handoff, claim submission, denial, correction/resubmission, payment, follow-up checks, and final closure.

The resulting sheet reported **1 closed case, 6 staff profiles, 1 appointment, 14 saved workflow steps, 0 steps left, and 10 agent capabilities shown**. Its CSV download matched those counts. Agent runs are separate from saved workflow steps; these numbers do not claim measured time or money savings.

Additional checks covered closing the returned-note dialog before running and before applying, ordinary case registration through the Referral agent, source review with approval left unchecked, the discoverable agent catalog, and layouts at 390px and 320px. The intentionally unchanged visitor entry behavior remains as requested.

## Automated validation

- Web syntax checks, **58 tests**, frontend production build, and Worker bundle build passed locally.
- Python lint and **89 tests** passed against an isolated real PostgreSQL database, including simultaneous approvals and stale-session regressions. That QA database was stopped after testing.
- Local Python typechecking could not launch because Windows Application Control blocked its compiled extension. GitHub Actions runs the full check again on Linux, including typechecking and PostgreSQL tests; its status is attached to the commit.

## Presentation route

1. Start the local website and choose **Start guided case**.
2. Explain: “The Referral agent reads the request. I check the draft and approve it.”
3. Follow Mira. At each agent stop, show **Reads**, **Prepares**, and **You do**. Open **See the sources** when explaining where a suggestion came from.
4. Use **AI agents** whenever a client wants the full capability list.
5. Finish on the results sheet and its agent recap. Download the CSV if useful.

## Remaining boundaries

This is a presentation demo, not a live clinical system. It reads labeled fictional text rather than PDFs/scans. Insurer decisions, communications, visits and payments are recorded examples. No live LLM, insurer, EHR, email or payment integration is connected. Savings on the homepage are editable estimates, not observed outcomes. Local and hosted databases are separate; this update is not on the old Site link yet.
