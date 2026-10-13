# Independent workstreams and readiness

The complete allowed-transition map lives in `workflow.TRANSITIONS`; illegal edges fail with 409. Initial states are RECEIVED / NOT_REVIEWED / NOT_STARTED / NOT_DETERMINED / UNSCHEDULED / NOT_STARTED / NOT_STARTED / ACTIVE. A case never collapses these into one processing flag.

Administrative readiness requires accepted intake, a valid service order, verified order/physician-note documents, resolved insurance and an applicable authorization or a verified NOT_REQUIRED rule. An applicable decision matches procedure, body region, contrast, performing provider, location and date window. A submitted packet alone does not clear the case. Tentative scheduling is permitted for accepted referrals under this demo's policy; confirmed scheduling requires cleared readiness and a reviewed booking proposal. Administrative readiness does not certify clinical MRI safety.

Clinical progress is recorded by the clinician persona: PREVISIT_REVIEW → READY / CLINICAL_HOLD → SERVICE_COMPLETED → REPORT_FINAL → COMMUNICATION_COMPLETE. Financial states advance independently from CLAIM_PREPARATION through submission/pending, payment, denial, rejection or an adjustment/other resolution. Clinical closure remains closed during claim follow-up.

The closure agent proposes ACTIVE → CLINICALLY_RESOLVED, then FINANCIAL_FOLLOW_UP when necessary, and finally FULLY_RESOLVED after financial resolution and open-task reconciliation. Each disposition is separately reviewed. Cancellation or transfer requires a documented reason and an authorized case owner review.

Expired/location-mismatched decisions create authorization exception tasks and cannot clear scheduling. Rescheduling reevaluates location/date suitability. A no-show updates scheduling without pretending imaging occurred. Missing reports prevent clinical communication completion. Payer timeouts preserve an unresolved state and follow-up task.
