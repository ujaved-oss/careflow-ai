from uuid import uuid4

import pytest
from conftest import session_headers
from test_workflow import post

from careflow.seed import fixture_id


@pytest.mark.asyncio
async def test_service_order_pdf_matches_requested_contrast_and_location(client):
    headers = await session_headers(client)
    case = await post(
        client,
        "/referrals",
        headers,
        {
            "synthetic_fixture_id": 5,
            "external_reference": f"SYN-CONTRAST-{uuid4()}",
            "scenario": "normal",
            "procedure_code": "70553",
            "location": "SYN-MRI-B",
        },
    )
    docs = (await client.get(f"/api/v1/cases/{case['id']}/documents", headers=headers)).json()
    order = next(d for d in docs if d["type"] == "order")
    original = await client.get(f"/api/v1/documents/{order['id']}/content", headers=headers)
    from io import BytesIO

    from pypdf import PdfReader

    text = PdfReader(BytesIO(original.content)).pages[0].extract_text()
    assert "70553" in text and "with and without" in text and "SYN-MRI-B" in text


@pytest.mark.asyncio
async def test_proposal_revision_invalid_payload_has_typed_error(client):
    headers = await session_headers(client)
    case_id = str(fixture_id("case/0/90"))
    pending = (await client.get(f"/api/v1/approvals?case_id={case_id}", headers=headers)).json()[0]
    invalid = await client.post(
        f"/api/v1/approvals/{pending['id']}/revise",
        headers=headers,
        json={"recipient": "external@example.com", "unexpected": "bypass"},
    )
    assert invalid.status_code == 422
    original = (await client.get(f"/api/v1/approvals/{pending['id']}", headers=headers)).json()
    assert original["status"] == "AWAITING_APPROVAL"


@pytest.mark.asyncio
async def test_closure_proposal_requires_valid_preconditions(client):
    headers = await session_headers(client)
    case_id = str(fixture_id("case/0/96"))
    premature = await client.post(
        f"/api/v1/cases/{case_id}/closure/propose",
        headers=headers,
        json={"disposition": "CLINICALLY_RESOLVED"},
    )
    assert premature.status_code == 409
    no_reason = await client.post(
        f"/api/v1/cases/{case_id}/closure/propose",
        headers=headers,
        json={"disposition": "CANCELED"},
    )
    assert no_reason.status_code == 422


@pytest.mark.asyncio
async def test_openapi_exposes_read_contracts(client):
    schema = (await client.get("/openapi.json")).json()
    definitions = schema["components"]["schemas"]
    assert {"CaseView", "CasePage", "DocumentView", "ProposalView", "AssistantResponse"}.issubset(
        definitions
    )
    assert "case_version" in definitions["ProposalView"]["properties"]
    assert "source_document_ids" not in definitions["CaseView"]["properties"]
