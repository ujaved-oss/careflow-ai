# Demo scenarios

Seeded cases per hospital repeat six primary scenarios. The first hospital's first six case numbers are SYN-1-0001 through SYN-1-0006; the second uses SYN-2-0001 through SYN-2-0006.

| Case | Starting evidence | Demonstration |
|---|---|---|
| 0001 | Verified order, absent physician note | Document task and communication-review proposal |
| 0002 | Complete documents, pending submitted authorization | Database-grounded payer status and packet sources |
| 0003 | Applicable authorization decision | Appointment proposal and readiness checks |
| 0004 | Approved service at a different location | Authorization exception; confirmed scheduling blocked |
| 0005 | MRI completed, final report outstanding | Clinical report follow-up without invented report |
| 0006 | Referral communication complete, claim denied | Financial follow-up while clinical work stays resolved |

Run `scripts/replay_demo.py` against the live API/worker for the full new-referral walkthrough. The script acts as synthetic human reviewers and clinician; no real communications leave the machine. It waits for persisted proposals and state rather than frontend timers.

Additional new-referral scenarios include `ambiguous_identity`, `invalid_order`, `payer_timeout`, `transmission_failure`, and `not_required`. Ambiguous identity/order require review and stop intake. Timeout creates insurance follow-up. Transmission failure exercises bounded exponential retry/dead lettering. NOT_REQUIRED clears the authorization branch only after verified payer facts.

Typed `/demo/events` can deliver a missing physician note, payer approval/denial/more-information/expiry, location-mismatched or expired approval, appointment rescheduling/cancellation/no-show, and claim submission/denial/rejection/payment/adjustment. Existing workflow preconditions still apply. Reusing an event ID with identical content returns its prior result; different content fails.

For prompt-injection testing, generate a `payer_letter` with `variant:"prompt_injection"` and retrieve it through the assistant. It is visible as quoted evidence but has no tool authority. Cross-hospital requests must fail even when the attacker knows the other UUID.

Reset is hospital-scoped. Stop the worker, call `/demo/reset` as that hospital's demo administrator, then restart the worker. The seed is deterministic for hospital/user/patient/case identities and scenarios. Document/proposal/event UUIDs and relative timestamps are regenerated; their source references remain actual persisted records.
