# Bounded specialist contracts

Every run persists trigger, correlation ID, timings, status, observations, sources and proposed action IDs. Pydantic validates each result. Agents receive one case scope, one allowed tool, a four-call maximum, a 20-second tool deadline and an outer 45-second job deadline. The mock provider is explicitly recorded.

| Agent | Event trigger | Registered tool |
|---|---|---|
| intake | ReferralReceived | validate_referral |
| documents | ReferralVerified / DocumentVerified | review_documents |
| insurance | DocumentsComplete | request_mock_eligibility_check |
| authorization | InsuranceVerified | prepare_authorization_packet |
| scheduling | AuthorizationApproved / AuthorizationNotRequired | propose_appointment_change |
| monitoring | Scheduled hourly case job | check_workflow_deadlines |
| revenue | ImagingCompleted / ClaimChanged / PaymentResolved | review_claim_status |
| closure | ReferralCommunicationCompleted / PaymentResolved / CaseDispositionRecorded | propose_case_closure |

Each ToolSpec declares name/description, typed input/output, permission, risk, approval policy, timeout, retry and idempotency behavior. Domain services enforce data rules after tool selection. No agent receives arbitrary SQL, shell execution, Python execution, approval bypass or clinical clearance tools. Manually requested runs require the caller's agents permission and the specific tool's domain permission; they then enter the same worker/orchestration path.

Identity ambiguity and invalid service orders stop intake and create staff-review tasks. Document review checks presence and human verification, not medical sufficiency. Insurance facts come from the simulated payer. Authorization packets contain source document IDs; agents propose submission but cannot approve it. Scheduling proposes fictional slots. Monitoring creates deduplicated administrative escalations. Revenue review creates financial follow-up tasks. Closure reconciles independent states and proposes owner-reviewed disposition.
