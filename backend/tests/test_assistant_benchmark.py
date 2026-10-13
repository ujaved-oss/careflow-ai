import json
from pathlib import Path
from uuid import UUID

import pytest
from conftest import session_headers
from sqlalchemy import select

from careflow.db import Session
from careflow.models import Document
from careflow.seed import fixture_id

BENCHMARK = json.loads(
    (Path(__file__).parent / "fixtures" / "assistant_benchmark.json").read_text()
)


@pytest.mark.parametrize("question", BENCHMARK, ids=lambda q: q["id"])
@pytest.mark.asyncio
async def test_grounded_expected_answer(client, question):
    headers = await session_headers(client)
    response = await client.post(
        "/api/v1/assistant/messages",
        headers=headers,
        json={"case_id": question["case_id"], "message": question["question"]},
    )
    assert response.status_code == 200, response.text
    result = response.json()
    for fact in question["expected_contains"]:
        assert fact in result["answer"], result
    if question["approved_case_source"]:
        assert any(s["record_id"] == question["approved_case_source"] for s in result["sources"])
    if question["approved_document_type"]:
        doc_sources = [s for s in result["sources"] if s["document_id"]]
        assert doc_sources
        async with Session() as db:
            retrieved_types = []
            for source in doc_sources:
                doc = await db.scalar(
                    select(Document).where(
                        Document.id == UUID(source["document_id"]),
                        Document.tenant_id == fixture_id("tenant/0"),
                        Document.case_id == UUID(question["case_id"]),
                    )
                )
                assert doc is not None
                assert source["version"] == doc.version
                assert source["page"] == 1
                retrieved_types.append(doc.type)
            assert question["approved_document_type"] in retrieved_types
    assert not result["proposed_actions"]
