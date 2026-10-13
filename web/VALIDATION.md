# Shared staff workspace update — 2026-10-12

The current staff UI supersedes the older connected/presentation staff UI described in the historical sections below. It uses shared server storage, six profiles and empty initial case queues.

- 15 automated tests pass, including complete team closure, one booking, repeat-operation protection, independent sessions, field redaction, missing identity, account restriction, disabled accounts, custom roles, stale forms, denied insurance/claims and database compare-and-swap.
- Local browser: Admin and Doctor opened in separate tabs; the case appeared in Doctor My work automatically after Admin sent it. Doctor review, insurance evidence and scheduling handoffs worked. A server restart retained the case and sessions.
- Local browser: custom Claims assistant role, account creation, role assignment and account disabling worked. Archive cleared all staff records; Restore retained the same case and stage.
- Desktop visual review plus verified 390px and 320px viewport checks: no horizontal document overflow. Native case and account dialogs operate through the UI.
- Mira's isolated guide and marketing remain in the build; their existing automated regression checks pass.
- Hosted deployment and live end-to-end verification are recorded in the delivery report outside the source checkout after publication.

The local/shared-team runtime is independent of the retained Python/PostgreSQL prototype. Tests use synthetic data; they do not validate real staff invitations, insurer/hospital integrations, clinical use or compliance.

---

# CareFlow frontend validation

Initial delivery completed 2026-10-11; the Mira update is verified below. The initial checks remain historical evidence for the connected backend.

## Browser checks

- Desktop and explicit 390px and 320px mobile layouts; no horizontal document overflow. Temporary viewport overrides restored.
- Marketing hero, five-stage scroll progression, direct stage buttons, section links, and See demo navigation.
- Demo sign-in, role switching within one hospital, sign-out, all five workspace views.
- Queue filters, patient/case search, pagination, no-results state, and task completion controls.
- Native accessible dialogs, case Journey/Documents/Timeline tabs, and keyboard focus handling.
- Connected assistant: missing-document question and a sourced order-document answer; source chip opened the authenticated original PDF.
- Connected scheduling: a proposal was reviewed and approved in the UI; the worker changed the case to CONFIRMED.
- Browser presentation: the complete Amelia Hart case reached FULLY_RESOLVED through reviewed document request, note receipt, payer approval, reviewed booking, a verified final-report fixture, five clinician-attested milestones, claim submission, payment, and reviewed closure.
- Restart browser demo restored the initial six records and two proposals.
- Both patient directories contained 100 records; every row matched the signed-in hospital, IDs had zero overlap across hospitals, and anonymous access returned 401.
- JavaScript syntax check and production build passed. Backend Ruff and mypy passed across 22 files after the read-only patient endpoint addition.

## Initial delivery Lighthouse

| Profile | Performance | Accessibility | Best practices | SEO | LCP | CLS |
| --- | --- | --- | --- | --- | --- | --- |
| mobile | 96 | 100 | 100 | 100 | 2.15s | 0.0002108471352143092 |
| desktop | 96 | 100 | 100 | 100 | 0.68s | 0.002943330356612566 |

The desktop audit forced reduced motion; the story and hero rendered without pinning or automatic animation. These are local lab measurements, not guarantees for every network or client device. Initial mobile LCP was 3.2s; local font and icon subsets plus hero preloading improved loading.

## Runtime boundary

The hosted production build is a labelled, browser-local synthetic presentation. The development workspace uses the real local Python/PostgreSQL backend. All external system actions in both modes are mocks or simulations. Demo persona selection is not production authentication. Production deployment remains owner-private.

The prior core backend run passed 87 tests. This UI delivery adds the supplemental browser, type, build, and live boundary checks above; it does not claim that full backend test suite was rerun.

## Mira guided-demo update

- Preserve audit: original logo, Manrope, blue accent #235ad6, pearl surfaces, existing anchors and sign-in route; evolve hero composition and add sourced problem/solution content. Marketing dials remain 8/8/3, with calmer product motion. One explicit light theme.
- All 26 guided stops traversed in the browser, from an empty viewer to full resolution. The ending sheet opened automatically: 1 resolved case, 4 simulated reviews, 3 verified sample documents, 5 fictional clinician attestations, 0 open tasks and 25 timeline records.
- Viewer case questions returned source references; original sample order inspection opened. The CSV downloaded successfully and its counts matched the sheet.
- Mira's staff-assistant explanation distinguishes deterministic/scripted answers from a live LLM. Typed pricing questions return to the presenter. No invented savings or production readiness claims.
- Playback and pause, previous chapters, replay reset, direct story-stage controls, and phone layouts checked. At 390px and 320px there was no horizontal document overflow; temporary viewport overrides restored.
- Five automated checks passed: empty viewer state, independent workflow lanes, results/replay idempotency, reachable chapters/out-of-scope answers, and viewer isolation. The isolation check disables network access, verifies zero backend calls, rejects writes, and confirms regular presentation data survives.
- The guide UI loads on demand; case progress remains browser-local. Syntax checks and the production build passed after the update. This change does not claim another complete backend test-suite run.

## Mira update Lighthouse

| Profile | Performance | Accessibility | Best practices | SEO | LCP |
| --- | --- | --- | --- | --- | --- |
| mobile | 88 | 100 | 100 | 100 | 2.41s |
| desktop | 100 | 100 | 100 | 100 | 0.55s |

Latest local lab checks after the guide bundle and scroll-reveal changes. The desktop profile forces reduced motion. These measurements describe this local build, not every network or client device. The mobile LCP meets the 2.5-second design target; mobile main-thread work remains a tuning opportunity on slower devices.

## Intake, progression and single-Mira polish — 2026-10-11

- Preserved the existing light pearl/blue identity, logo and Manrope. Reduced the guide to one Mira window and one visible Back/Play/Pause/Next row. Five simple stages replace the long chapter strip. Short explanations and plain case-state labels replace technical narration. Sound starts off and is optional.
- Desktop browser QA confirmed one widget and one visible control row. The phone guide sits in the page so it does not cover the case. Responsive checks at 390px and 320px found no horizontal document overflow. Temporary viewport override restored. Browser warnings/errors: none.
- All 26 stops traversed through the actual Next control. The automatic ending sheet showed 1 closed case, 4 reviewed actions, 3 checked papers, 5 care-team steps, 0 unfinished tasks and 25 history entries. Replay returns to zero cases. Play performed intake; pausing during the action stopped its pending checkpoint. Sound toggles were checked. Voice cancellation prevents queued narration, but actual audible speech was not independently recorded.
- Coordinator browser intake created a fictional Lena Park case from a sample paper order, then received the note and sample insurance approval. Booking opened its review, approval confirmed the appointment, and the next action changed to the clinician handoff.
- Eight automated tests passed, including creation-to-closure with one appointment, duplicate request guards, clinical-role restrictions, report prerequisites, complete results, viewer isolation and pause invalidation. Syntax checks and the final production build passed. The previous Lighthouse scores above were not rerun for this polish and should not be read as measurements of the new build.
- Intake email/fax, paper/scan, hospital-system and reception sources are explanatory simulations. Existing synthetic fixtures supply patient/document data. No live inbox, OCR, EHR, payment system or LLM integration is claimed. Backend source was unchanged; the full backend suite was not rerun.

## Hands-on walkthrough — current behavior

The hands-on walkthrough replaces the timed guided playback described above. One Mira window provides only the next click/selection/check/typed sample, with a moving target outline and a Show me control. Forms wait for the correct fictional details and an explicit submit. Earlier stages and Back can rewind; forward stage jumping is disabled. The step-specific practice UI uses 25 actions over the existing 26 checkpoints.

All 25 actions were completed through browser controls, from zero cases to closure and the automatic results sheet (1/4/3/5/0/25). Incorrect patient text blocked creation. A refresh preserved an unfinished name field and required the remaining fields. The appointment fixture now records the selected next-day 9:00 AM and Sample MRI room A; request text and reference fixtures match the guided inputs. Ten automated tests passed, including complete hands-on prerequisites, incorrect values, intake-start gating, one appointment, matching fixture details, results and viewer isolation. Syntax checks and the production build passed. Previous performance audits are historical.

The practice workspace remains isolated browser data. No real patient, medical decision, email, bill, payment, file upload or live integration occurs. The Python backend was unchanged.

Back restored the earlier question and required an explicit resubmit. Restart cleared all field drafts and returned to zero cases. Copilot's answer appeared with a working source-document link. Phone Show me placed the sample reference beside its focused field at 390px; 320px and desktop checks had no horizontal document overflow. Exactly one Mira widget remained. Console warnings/errors: none. Temporary viewport override restored.

## Guided intake recovery and calm task layout — October 11

The prior disabled-submit UX hid why a mismatched reference/test blocked case creation. Submit now gives a field-specific correction. Sample shortcuts fill text/choices without checking review boxes or committing a checkpoint. One field at a time, a completed-details summary, optional full-form view, and one integrated Mira card replace the competing sidebar panels. Review previews appear before approval. New practice case opens from every viewer page and can start again after closure.

Local browser checks: incorrect patient submission gives a specific correction; the sample shortcut repairs the fields; explicit review and submit create the case. All 25 actions reached closure and the automatic results sheet, with counts 1/4/3/5/0/25. Back revisited booking without duplicates. New practice case after completion and from Overview returns to the empty intake form. Partial typing survived refresh. Creation worked at 390px; 320px and 390px had no horizontal overflow. One Mira widget, no console warnings/errors, viewport restored. Eleven automated tests, syntax checks and production build passed. Earlier performance measurements remain historical.
