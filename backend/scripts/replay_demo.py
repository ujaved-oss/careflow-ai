"""Drive a real running API/worker from a new referral to closure. Synthetic review simulator."""

import argparse
import asyncio
from uuid import uuid4

import httpx


async def replay(base_url: str):
    async with httpx.AsyncClient(base_url=base_url, timeout=30) as client:
        users = (await client.get("/api/v1/auth/demo-users")).json()
        admin = next(u for u in users if u["role"] == "demo_admin")
        clinician = next(
            u for u in users if u["role"] == "clinician" and u["tenant_id"] == admin["tenant_id"]
        )

        async def headers(user):
            r = await client.post("/api/v1/auth/demo-login", json={"user_id": user["id"]})
            r.raise_for_status()
            return {"Authorization": f"Bearer {r.json()['access_token']}"}

        admin_headers, clinical_headers = await headers(admin), await headers(clinician)

        async def post(path, payload, h=None):
            r = await client.post(f"/api/v1{path}", json=payload, headers=h or admin_headers)
            r.raise_for_status()
            return r.json()

        case = await post(
            "/referrals",
            {
                "synthetic_fixture_id": 1,
                "external_reference": f"SYN-REPLAY-{uuid4()}",
                "scenario": "missing_note",
            },
        )
        case_id = case["id"]

        async def state():
            r = await client.get(f"/api/v1/cases/{case_id}", headers=admin_headers)
            r.raise_for_status()
            return r.json()

        async def wait_for(predicate):
            for _ in range(200):
                value = await predicate()
                if value:
                    return value
                await asyncio.sleep(0.25)
            raise RuntimeError("Worker timeout: check /api/v1/jobs")

        async def approve(kind):
            async def find():
                r = await client.get(f"/api/v1/approvals?case_id={case_id}", headers=admin_headers)
                r.raise_for_status()
                items = [p for p in r.json() if p["action_type"] == kind]
                return items[-1] if items else None

            proposal = await wait_for(find)
            review = await post(
                f"/approvals/{proposal['id']}/approve",
                {"reason": "Scripted synthetic human-review demonstration"},
            )
            if review["status"] != "APPROVED":
                raise RuntimeError(f"Review failed: {review['status']}")

            async def completed():
                r = await client.get(f"/api/v1/approvals/{proposal['id']}", headers=admin_headers)
                item = r.json()
                if item["status"] in {"FAILED", "STALE", "EXPIRED"}:
                    raise RuntimeError(f"Execution failed: {item['status']}")
                return item if item["status"] == "COMPLETED" else None

            await wait_for(completed)
            print(f"Reviewed and simulated: {kind}")

        async def event(event_type):
            return await post(
                "/demo/events",
                {
                    "case_id": case_id,
                    "external_event_id": f"SYN-{uuid4()}",
                    "event_type": event_type,
                },
            )

        await approve("document_request")
        await event("document_received")
        await approve("authorization_submission")
        await event("authorization_approved")
        await approve("appointment_booking")
        for milestone in ["PREVISIT_REVIEW", "READY", "SERVICE_COMPLETED"]:
            case = await state()
            await post(
                f"/cases/{case_id}/clinical-milestones",
                {
                    "milestone": milestone,
                    "expected_version": case["version"],
                    "synthetic_attestation": True,
                },
                clinical_headers,
            )
        document = await post(
            f"/cases/{case_id}/documents", {"fixture_type": "final_report"}, clinical_headers
        )
        await post(f"/documents/{document['id']}/verify", {}, clinical_headers)
        for milestone in ["REPORT_FINAL", "COMMUNICATION_COMPLETE"]:
            case = await state()
            await post(
                f"/cases/{case_id}/clinical-milestones",
                {
                    "milestone": milestone,
                    "expected_version": case["version"],
                    "synthetic_attestation": True,
                },
                clinical_headers,
            )
        await approve("case_closure")
        await approve("case_closure")
        await event("claim_submitted")
        await event("claim_paid")
        await approve("case_closure")
        case = await state()
        assert case["overall_status"] == "FULLY_RESOLVED", case
        answer = await post(
            "/assistant/messages", {"case_id": case_id, "message": "Summarize everything"}
        )
        print(f"Case {case['case_number']} / {case_id}: FULLY_RESOLVED")
        print(answer["answer"])
        print(f"Grounded sources: {len(answer['sources'])}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    asyncio.run(replay(parser.parse_args().url))
