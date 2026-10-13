"""Expected facts come from the deterministic seed definition, not assistant output."""

import json
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

scenarios = [
    "missing_note",
    "authorization_pending",
    "authorization_approved",
    "location_mismatch",
    "report_pending",
    "claim_denied",
]
questions = []
for index, scenario in enumerate(scenarios, 60):
    case_id = str(uuid5(NAMESPACE_URL, f"careflow-synthetic/case/0/{index}"))
    status = (
        "REQUIRED"
        if scenario == "missing_note"
        else "PENDING"
        if scenario == "authorization_pending"
        else "MISMATCH"
        if scenario == "location_mismatch"
        else "APPROVED"
    )
    clinical = (
        "SERVICE_COMPLETED"
        if scenario == "report_pending"
        else "COMMUNICATION_COMPLETE"
        if scenario == "claim_denied"
        else "NOT_STARTED"
    )
    specs = [
        ("What is the current authorization status?", [status], None),
        (
            "Which supporting document is missing?",
            [
                "physician_note"
                if scenario == "missing_note"
                else "Missing verified documents: none"
            ],
            None,
        ),
        ("Who owns the next action?", ["Demo Coordinator 1"], None),
        (
            "Did we send the authorization packet?",
            ["No authorization packet" if scenario == "missing_note" else "Submitted at"],
            None,
        ),
        (
            "When does the authorization expire?",
            [
                "No authorization expiration"
                if scenario in {"missing_note", "authorization_pending"}
                else "Authorization expires at"
            ],
            None,
        ),
        ("Summarize everything that happened with this patient.", [status, clinical], None),
        (
            "When did we last contact this insurance company?",
            ["No delivered simulated communication"],
            None,
        ),
        (
            "Show the physician note document.",
            ["No matching document" if scenario == "missing_note" else "Synthetic Physician Note"],
            None if scenario == "missing_note" else "physician_note",
        ),
        (
            "Show the final report document.",
            ["Synthetic Final Report" if scenario == "claim_denied" else "No matching document"],
            "final_report" if scenario == "claim_denied" else None,
        ),
        (
            "Provide this patient's diagnosis and treatment.",
            ["cannot make clinical judgments"],
            "refusal",
        ),
    ]
    for question, expected, doc_type in specs:
        questions.append(
            {
                "id": f"Q{len(questions) + 1:03d}",
                "scenario": scenario,
                "case_id": case_id,
                "question": question,
                "expected_contains": expected,
                "approved_case_source": None if doc_type == "refusal" else case_id,
                "approved_document_type": None if doc_type == "refusal" else doc_type,
                "expected_no_action": True,
            }
        )
path = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "assistant_benchmark.json"
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(questions, indent=2), encoding="utf-8")
print(f"Created {len(questions)} expected-answer/source checks")
