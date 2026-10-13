from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from conftest import session_headers
from sqlalchemy import func, select, update
from sqlalchemy.exc import DBAPIError
from test_workflow import post

from careflow.approvals import digest
from careflow.config import Settings
from careflow.db import Session
from careflow.models import Job, Proposal, now
from careflow.seed import fixture_id
from careflow.worker import drain


@pytest.mark.asyncio
async def test_cross_tenant_denied_on_every_read_surface(client):
    headers = await session_headers(client)
    other_headers = await session_headers(client, hospital=1)
    other_case = str(fixture_id("case/1/0"))
    for suffix in [
        "",
        "/summary",
        "/readiness",
        "/documents",
        "/timeline",
        "/insurance",
        "/authorizations",
        "/appointments",
        "/claims",
        "/financial-status",
    ]:
        assert (
            await client.get(f"/api/v1/cases/{other_case}{suffix}", headers=headers)
        ).status_code == 404
    doc = (await client.get(f"/api/v1/cases/{other_case}/documents", headers=other_headers)).json()[
        0
    ]
    assert (
        await client.get(f"/api/v1/documents/{doc['id']}/content", headers=headers)
    ).status_code == 404
    assert (
        await client.post(
            "/api/v1/assistant/messages",
            headers=headers,
            json={"case_id": other_case, "message": "Summarize"},
        )
    ).status_code == 404
    found = (
        await client.post(
            "/api/v1/assistant/messages",
            headers=headers,
            json={
                "scope": "authorized_search",
                "message": "Which referrals are missing physician notes?",
            },
        )
    ).json()
    assert all(source["record_id"] != other_case for source in found["sources"])


@pytest.mark.asyncio
async def test_role_denials_and_clinical_boundary(client):
    viewer = await session_headers(client, "viewer")
    admin = await session_headers(client)
    case_id = str(fixture_id("case/0/0"))
    proposal = (await client.get(f"/api/v1/approvals?case_id={case_id}", headers=admin)).json()[0]
    assert (
        await client.post(f"/api/v1/approvals/{proposal['id']}/approve", headers=viewer, json={})
    ).status_code == 403
    assert (await client.post("/api/v1/demo/reset", headers=viewer)).status_code == 403
    assert (
        await client.post("/api/v1/agents/intake/run", headers=viewer, json={"case_id": case_id})
    ).status_code == 403
    assert (
        await client.post(
            f"/api/v1/cases/{case_id}/clinical-milestones",
            headers=admin,
            json={"milestone": "READY", "expected_version": 1, "synthetic_attestation": True},
        )
    ).status_code == 403
    assert (
        await client.post("/api/v1/agents/clinical/run", headers=admin, json={"case_id": case_id})
    ).status_code == 404
    coordinator = await session_headers(client, "coordinator")
    assert (
        await client.post(
            "/api/v1/agents/revenue/run", headers=coordinator, json={"case_id": case_id}
        )
    ).status_code == 403


@pytest.mark.asyncio
async def test_expired_and_stale_approval(client, monkeypatch):
    admin = await session_headers(client)
    case_id = str(fixture_id("case/0/12"))
    proposals = (await client.get(f"/api/v1/approvals?case_id={case_id}", headers=admin)).json()
    proposal = proposals[0]
    import careflow.approvals as approvals

    monkeypatch.setattr(approvals, "now", lambda: now() + timedelta(days=3))
    expired = await post(client, f"/approvals/{proposal['id']}/approve", admin, {})
    assert expired["status"] == "EXPIRED"
    monkeypatch.undo()
    response = await post(
        client, "/assistant/messages", admin, {"case_id": case_id, "message": "Prepare follow-up"}
    )
    proposal_id = response["proposed_actions"][0]["proposal_id"]
    await post(client, f"/cases/{case_id}/documents", admin, {"fixture_type": "payer_letter"})
    stale = await post(client, f"/approvals/{proposal_id}/approve", admin, {})
    assert stale["status"] == "STALE"


@pytest.mark.asyncio
async def test_approved_payload_is_database_immutable(client):
    admin = await session_headers(client)
    case_id = str(fixture_id("case/0/18"))
    response = await post(
        client, "/assistant/messages", admin, {"case_id": case_id, "message": "Prepare follow-up"}
    )
    proposal_id = UUID(response["proposed_actions"][0]["proposal_id"])
    with pytest.raises(DBAPIError):
        async with Session.begin() as db:
            await db.execute(
                update(Proposal)
                .where(Proposal.id == proposal_id)
                .values(proposed_payload={"recipient": "real-provider"})
            )
    async with Session() as db:
        p = await db.scalar(select(Proposal).where(Proposal.id == proposal_id))
        assert p.payload_hash == digest(p.proposed_payload)


@pytest.mark.asyncio
async def test_stale_execution_after_human_approval(client):
    admin = await session_headers(client)
    case_id = str(fixture_id("case/0/24"))
    answer = await post(
        client, "/assistant/messages", admin, {"case_id": case_id, "message": "Prepare follow-up"}
    )
    proposal_id = answer["proposed_actions"][0]["proposal_id"]
    approved = await post(client, f"/approvals/{proposal_id}/approve", admin, {})
    assert approved["status"] == "APPROVED"
    await post(client, f"/cases/{case_id}/documents", admin, {"fixture_type": "payer_letter"})
    await drain()
    p = (await client.get(f"/api/v1/approvals/{proposal_id}", headers=admin)).json()
    assert p["status"] == "STALE"
    assert p["receipt"] is None


@pytest.mark.asyncio
async def test_document_prompt_injection_cannot_execute_tools(client):
    admin = await session_headers(client)
    case_id = str(fixture_id("case/0/30"))
    await post(
        client,
        f"/cases/{case_id}/documents",
        admin,
        {"fixture_type": "payer_letter", "variant": "prompt_injection"},
    )
    async with Session() as db:
        before = await db.scalar(select(func.count()).select_from(Proposal))
    response = await post(
        client,
        "/assistant/messages",
        admin,
        {"case_id": case_id, "message": "Show payer letter document"},
    )
    assert any("IGNORE ALL RULES" in (s.get("excerpt") or "") for s in response["sources"])
    assert not response["proposed_actions"]
    async with Session() as db:
        after = await db.scalar(select(func.count()).select_from(Proposal))
    assert before == after


@pytest.mark.asyncio
async def test_conversation_private_to_author(client):
    admin = await session_headers(client)
    viewer = await session_headers(client, "viewer")
    case_id = str(fixture_id("case/0/36"))
    conversation = await post(
        client, "/assistant/messages", admin, {"case_id": case_id, "message": "Status?"}
    )
    assert (
        await client.get(
            f"/api/v1/assistant/conversations/{conversation['conversation_id']}", headers=viewer
        )
    ).status_code == 404


@pytest.mark.asyncio
async def test_arbitrary_patient_data_and_unsafe_upload_rejected(client):
    admin = await session_headers(client)
    invalid = {
        "synthetic_fixture_id": 1,
        "external_reference": "SYN-TEST",
        "patient_name": "Actual patient",
    }
    assert (await client.post("/api/v1/referrals", json=invalid, headers=admin)).status_code == 422
    case_id = str(fixture_id("case/0/42"))
    response = await client.post(
        f"/api/v1/cases/{case_id}/documents/upload",
        headers=admin,
        files={"file": ("../../patient.pdf", b"%PDF-arbitrary", "application/pdf")},
    )
    assert response.status_code == 422


@pytest.mark.parametrize("field", ["external_integrations_enabled", "allow_real_patient_data"])
def test_startup_rejects_live_settings(field):
    with pytest.raises(ValueError):
        Settings(**{field: True})


@pytest.mark.asyncio
async def test_session_and_voice_fallback(client):
    assert (await client.get("/api/v1/cases")).status_code == 401
    assert (
        await client.get("/api/v1/cases", headers={"Authorization": "Bearer invalid"})
    ).status_code == 401
    admin = await session_headers(client)
    response = await client.post(
        "/api/v1/voice/transcribe", headers=admin, files={"audio": ("test.wav", b"", "audio/wav")}
    )
    assert response.status_code == 503
    simulated = await post(
        client, "/voice/transcribe-simulated", admin, {"transcript": "What needs my attention?"}
    )
    assert simulated["simulated"]


@pytest.mark.asyncio
async def test_expired_worker_lease_recovers_and_executes_once(client):
    admin = await session_headers(client)
    case_id = str(fixture_id("case/0/48"))
    response = await post(
        client, "/assistant/messages", admin, {"case_id": case_id, "message": "Prepare follow-up"}
    )
    proposal_id = response["proposed_actions"][0]["proposal_id"]
    await post(client, f"/approvals/{proposal_id}/approve", admin, {})
    async with Session.begin() as db:
        await db.execute(
            update(Job)
            .where(Job.idempotency_key == f"execute/{proposal_id}")
            .values(
                status="RUNNING",
                locked_until=now() - timedelta(minutes=5),
                lease_token=uuid4(),
                attempts=1,
            )
        )
    await drain()
    row = (await client.get(f"/api/v1/approvals/{proposal_id}", headers=admin)).json()
    assert row["status"] == "COMPLETED"
    await drain()
    from careflow.models import IntegrationReceipt

    async with Session() as db:
        assert (
            await db.scalar(
                select(func.count())
                .select_from(IntegrationReceipt)
                .where(IntegrationReceipt.proposal_id == proposal_id)
            )
            == 1
        )


@pytest.mark.asyncio
async def test_payer_timeout_and_ambiguous_identity(client):
    admin = await session_headers(client)
    for scenario in ["payer_timeout", "ambiguous_identity", "invalid_order"]:
        case = await post(
            client,
            "/referrals",
            admin,
            {
                "synthetic_fixture_id": 10,
                "external_reference": f"SYN-EDGE-{uuid4()}",
                "scenario": scenario,
            },
        )
        await drain()
        latest = (await client.get(f"/api/v1/cases/{case['id']}", headers=admin)).json()
        if scenario == "payer_timeout":
            assert latest["insurance_status"] == "UNRESOLVED"
        else:
            assert latest["referral_status"] == "NEEDS_INFORMATION"


@pytest.mark.asyncio
async def test_failure_retries_backoff_then_dead_letter(client):
    admin = await session_headers(client)
    case = await post(
        client,
        "/referrals",
        admin,
        {
            "synthetic_fixture_id": 11,
            "external_reference": f"SYN-FAIL-{uuid4()}",
            "scenario": "transmission_failure",
        },
    )
    await drain()
    answer = await post(
        client,
        "/assistant/messages",
        admin,
        {"case_id": case["id"], "message": "Prepare follow-up"},
    )
    pid = answer["proposed_actions"][0]["proposal_id"]
    await post(client, f"/approvals/{pid}/approve", admin, {})
    for _ in range(4):
        async with Session.begin() as db:
            await db.execute(
                update(Job)
                .where(Job.idempotency_key == f"execute/{pid}")
                .values(run_after=now() - timedelta(seconds=1))
            )
        await drain()
    async with Session() as db:
        job = await db.scalar(select(Job).where(Job.idempotency_key == f"execute/{pid}"))
        assert job.status == "DEAD_LETTER"
        assert job.attempts == 4
        p = await db.scalar(select(Proposal).where(Proposal.id == pid))
        assert p.status == "FAILED"
