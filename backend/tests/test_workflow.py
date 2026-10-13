from uuid import uuid4

import pytest
from conftest import session_headers
from sqlalchemy import select

from careflow.db import Session
from careflow.models import Case, IntegrationReceipt, Job
from careflow.seed import fixture_id
from careflow.worker import drain


async def post(client, path, headers, payload):
    response = await client.post(f"/api/v1{path}", headers=headers, json=payload)
    assert response.status_code in {200, 201, 202}, response.text
    return response.json()


async def case_data(client, headers, case_id):
    return (await client.get(f"/api/v1/cases/{case_id}", headers=headers)).json()


async def approve_kind(client, headers, case_id, kind):
    rows = (await client.get(f"/api/v1/approvals?case_id={case_id}", headers=headers)).json()
    matching = [p for p in rows if p["action_type"] == kind]
    assert matching, rows
    p = matching[-1]
    approved = await post(
        client, f"/approvals/{p['id']}/approve", headers, {"reason": "Synthetic human review"}
    )
    assert approved["status"] == "APPROVED", approved
    await drain()
    done = (await client.get(f"/api/v1/approvals/{p['id']}", headers=headers)).json()
    assert done["status"] == "COMPLETED", done
    return done


@pytest.mark.asyncio
async def test_referral_to_full_closure(client):
    admin = await session_headers(client)
    clinician = await session_headers(client, "clinician")
    referral = await post(
        client,
        "/referrals",
        admin,
        {
            "synthetic_fixture_id": 1,
            "external_reference": f"SYN-E2E-{uuid4()}",
            "scenario": "missing_note",
        },
    )
    case_id = referral["id"]
    async with Session() as db:
        assert await db.scalar(
            select(Case.id).where(Case.id == case_id)
        )  # Persistent, not canned text.
    await drain()
    state = await case_data(client, admin, case_id)
    assert state["referral_status"] == "ACCEPTED"
    assert state["document_status"] == "MISSING"
    message = await post(
        client,
        "/assistant/messages",
        admin,
        {"case_id": case_id, "message": "Why is authorization pending?"},
    )
    assert "physician_note" in message["answer"]
    await approve_kind(client, admin, case_id, "document_request")
    await post(
        client,
        "/demo/events",
        admin,
        {
            "case_id": case_id,
            "external_event_id": f"SYN-NOTE-{uuid4()}",
            "event_type": "document_received",
        },
    )
    await drain()
    state = await case_data(client, admin, case_id)
    assert state["document_status"] == "COMPLETE"
    assert state["insurance_status"] == "VERIFIED"
    assert state["authorization_status"] == "PREPARING"
    await approve_kind(client, admin, case_id, "authorization_submission")
    assert (await case_data(client, admin, case_id))["authorization_status"] == "PENDING"
    await post(
        client,
        "/demo/events",
        admin,
        {
            "case_id": case_id,
            "external_event_id": f"SYN-AUTH-{uuid4()}",
            "event_type": "authorization_approved",
        },
    )
    await drain()
    await approve_kind(client, admin, case_id, "appointment_booking")
    assert (await client.get(f"/api/v1/cases/{case_id}/readiness", headers=admin)).json()[
        "administratively_ready"
    ]
    for milestone in ["PREVISIT_REVIEW", "READY", "SERVICE_COMPLETED"]:
        state = await case_data(client, admin, case_id)
        await post(
            client,
            f"/cases/{case_id}/clinical-milestones",
            clinician,
            {
                "milestone": milestone,
                "expected_version": state["version"],
                "synthetic_attestation": True,
            },
        )
    await drain()
    doc = await post(
        client, f"/cases/{case_id}/documents", clinician, {"fixture_type": "final_report"}
    )
    await post(client, f"/documents/{doc['id']}/verify", clinician, {})
    for milestone in ["REPORT_FINAL", "COMMUNICATION_COMPLETE"]:
        state = await case_data(client, admin, case_id)
        await post(
            client,
            f"/cases/{case_id}/clinical-milestones",
            clinician,
            {
                "milestone": milestone,
                "expected_version": state["version"],
                "synthetic_attestation": True,
            },
        )
    await drain()
    await approve_kind(client, admin, case_id, "case_closure")
    assert (await case_data(client, admin, case_id))["overall_status"] == "CLINICALLY_RESOLVED"
    await approve_kind(client, admin, case_id, "case_closure")
    assert (await case_data(client, admin, case_id))["overall_status"] == "FINANCIAL_FOLLOW_UP"
    await post(
        client,
        "/demo/events",
        admin,
        {
            "case_id": case_id,
            "external_event_id": f"SYN-CLAIM-{uuid4()}",
            "event_type": "claim_submitted",
        },
    )
    await post(
        client,
        "/demo/events",
        admin,
        {
            "case_id": case_id,
            "external_event_id": f"SYN-PAID-{uuid4()}",
            "event_type": "claim_paid",
        },
    )
    await drain()
    await approve_kind(client, admin, case_id, "case_closure")
    state = await case_data(client, admin, case_id)
    assert state["overall_status"] == "FULLY_RESOLVED"
    assert state["clinical_status"] == "COMMUNICATION_COMPLETE"
    assert state["financial_status"] == "PAID"
    answer = await post(
        client,
        "/assistant/messages",
        admin,
        {"case_id": case_id, "message": "Summarize everything"},
    )
    assert "FULLY_RESOLVED" in answer["answer"]
    assert answer["sources"]
    timeline = (await client.get(f"/api/v1/cases/{case_id}/timeline", headers=admin)).json()
    assert {
        "ReferralReceived",
        "AuthorizationSubmitted",
        "ImagingCompleted",
        "PaymentResolved",
    }.issubset({e["event_type"] for e in timeline})
    async with Session() as db:
        assert not (
            await db.scalars(select(Job).where(Job.case_id == case_id, Job.status == "DEAD_LETTER"))
        ).all()
        assert (
            len(
                (
                    await db.scalars(
                        select(IntegrationReceipt).where(IntegrationReceipt.case_id == case_id)
                    )
                ).all()
            )
            == 6
        )


@pytest.mark.asyncio
async def test_duplicate_referrals_and_events(client):
    headers = await session_headers(client)
    payload = {
        "synthetic_fixture_id": 2,
        "external_reference": f"SYN-DUP-{uuid4()}",
        "scenario": "normal",
    }
    first = await post(client, "/referrals", headers, payload)
    second = await post(client, "/referrals", headers, payload)
    assert first["id"] == second["id"]
    event = {
        "case_id": first["id"],
        "external_event_id": f"SYN-REPLAY-{uuid4()}",
        "event_type": "document_received",
    }
    one = await post(client, "/demo/events", headers, event)
    two = await post(client, "/demo/events", headers, event)
    assert one["document_id"] == two["document_id"]
    assert two["duplicate"]
    altered = {**event, "event_type": "authorization_approved"}
    assert (
        await client.post("/api/v1/demo/events", json=altered, headers=headers)
    ).status_code == 409


@pytest.mark.asyncio
async def test_claim_denial_does_not_reopen_clinical(client):
    headers = await session_headers(client)
    case_id = str(fixture_id("case/0/5"))
    state = await case_data(client, headers, case_id)
    assert state["clinical_status"] == "COMMUNICATION_COMPLETE"
    assert state["financial_status"] == "DENIED"
    assert state["overall_status"] == "FINANCIAL_FOLLOW_UP"


@pytest.mark.asyncio
async def test_authorization_location_mismatch_blocks(client):
    headers = await session_headers(client)
    case_id = str(fixture_id("case/0/3"))
    readiness = (await client.get(f"/api/v1/cases/{case_id}/readiness", headers=headers)).json()
    assert not readiness["administratively_ready"]
    result = await post(client, f"/cases/{case_id}/appointments/propose", headers, {})
    assert result["blocked"]
