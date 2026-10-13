import asyncio
from uuid import uuid4

import pytest
from conftest import session_headers
from sqlalchemy import func, select
from test_workflow import post

from careflow.config import settings
from careflow.db import Session
from careflow.models import Case, Job
from careflow.seed import fixture_id
from careflow.worker import drain


@pytest.mark.asyncio
async def test_concurrent_approvals_queue_one_execution(client):
    admin = await session_headers(client)
    case_id = str(fixture_id("case/0/84"))
    response = await post(
        client, "/assistant/messages", admin, {"case_id": case_id, "message": "Prepare follow-up"}
    )
    proposal_id = response["proposed_actions"][0]["proposal_id"]
    responses = await asyncio.gather(
        *[
            client.post(f"/api/v1/approvals/{proposal_id}/approve", headers=admin, json={})
            for _ in range(4)
        ]
    )
    assert sorted(r.status_code for r in responses) == [200, 409, 409, 409]
    async with Session() as db:
        assert (
            await db.scalar(
                select(func.count())
                .select_from(Job)
                .where(Job.idempotency_key == f"execute/{proposal_id}")
            )
            == 1
        )
    await drain()


@pytest.mark.asyncio
async def test_expired_payer_decision_cannot_clear_case(client):
    admin = await session_headers(client)
    case_id = str(fixture_id("case/0/85"))
    result = await post(
        client,
        "/demo/events",
        admin,
        {
            "case_id": case_id,
            "external_event_id": f"SYN-EXPIRY-{uuid4()}",
            "event_type": "authorization_approved",
            "expire": True,
        },
    )
    assert result["authorization_status"] == "EXPIRED"
    ready = (await client.get(f"/api/v1/cases/{case_id}/readiness", headers=admin)).json()
    assert not ready["administratively_ready"]
    blocked = await post(client, f"/cases/{case_id}/appointments/propose", admin, {})
    assert blocked["blocked"]


@pytest.mark.asyncio
async def test_version_guard_and_no_clinical_bypass(client):
    clinician = await session_headers(client, "clinician")
    admin = await session_headers(client)
    case_id = str(fixture_id("case/0/86"))
    state = (await client.get(f"/api/v1/cases/{case_id}", headers=admin)).json()
    invalid = await client.post(
        f"/api/v1/cases/{case_id}/clinical-milestones",
        headers=clinician,
        json={
            "milestone": "PREVISIT_REVIEW",
            "expected_version": state["version"] + 1,
            "synthetic_attestation": True,
        },
    )
    assert invalid.status_code == 409
    await post(
        client,
        f"/cases/{case_id}/clinical-milestones",
        clinician,
        {
            "milestone": "PREVISIT_REVIEW",
            "expected_version": state["version"],
            "synthetic_attestation": True,
        },
    )
    state = (await client.get(f"/api/v1/cases/{case_id}", headers=admin)).json()
    blocked = await client.post(
        f"/api/v1/cases/{case_id}/clinical-milestones",
        headers=clinician,
        json={
            "milestone": "READY",
            "expected_version": state["version"],
            "synthetic_attestation": True,
        },
    )
    assert blocked.status_code == 409  # No confirmed appointment.
    claim = await client.post(
        "/api/v1/demo/events",
        headers=admin,
        json={
            "case_id": case_id,
            "external_event_id": f"SYN-INVALID-CLAIM-{uuid4()}",
            "event_type": "claim_submitted",
        },
    )
    assert claim.status_code == 409  # No clinical service to bill.


@pytest.mark.asyncio
async def test_missing_local_model_uses_verified_mock_answer(client, monkeypatch):
    admin = await session_headers(client)
    monkeypatch.setattr(settings(), "ai_provider", "ollama")
    monkeypatch.setattr(settings(), "ollama_base_url", "http://127.0.0.1:1")
    response = await post(
        client,
        "/assistant/messages",
        admin,
        {"case_id": str(fixture_id("case/0/87")), "message": "Authorization status?"},
    )
    assert response["provider"] == "mock"
    assert response["sources"]
    assert response["unresolved_questions"]


@pytest.mark.asyncio
async def test_tenant_reset_replay_preserves_other_hospital(client):
    # Restore the changed first hospital; the other hospital and its events survive.
    admin = await session_headers(client)
    other = await session_headers(client, hospital=1)
    await drain()
    prior = (await client.get("/api/v1/cases?limit=1", headers=other)).json()["total"]
    result = await post(client, "/demo/reset", admin, {})
    assert result["cases"] == 150
    assert (await client.get("/api/v1/cases?limit=1", headers=other)).json()["total"] == prior
    own = (await client.get("/api/v1/cases?limit=1", headers=admin)).json()
    assert own["total"] == 150
    async with Session() as db:
        assert await db.scalar(select(Case.id).where(Case.id == fixture_id("case/0/0")))
    await drain()
