"""Simulated gateway contains no HTTP client or real-provider credentials."""

from datetime import timedelta
from typing import Protocol

from pydantic import BaseModel

from careflow.models import now


class EligibilityRequest(BaseModel):
    member_id: str
    scenario: str


class EligibilityResult(BaseModel):
    status: str
    authorization_required: bool
    source: str = "mock_payer"
    simulated: bool = True
    verified_at: str


class PayerGateway(Protocol):
    async def check_eligibility(self, request: EligibilityRequest) -> EligibilityResult: ...
    async def submit_authorization(self, key: str, payload: dict, scenario: str) -> dict: ...


class TransientIntegrationError(Exception):
    pass


class MockGateway:
    async def check_eligibility(self, request: EligibilityRequest) -> EligibilityResult:
        if request.scenario == "payer_timeout":
            raise TransientIntegrationError("simulated_payer_timeout")
        return EligibilityResult(
            status="DISCREPANCY" if request.scenario == "coverage_discrepancy" else "VERIFIED",
            authorization_required=request.scenario != "not_required",
            verified_at=now().isoformat(),
        )

    async def submit_authorization(self, key: str, payload: dict, scenario: str) -> dict:
        return await self.execute("authorization_submission", key, payload, scenario)

    async def execute(self, action: str, key: str, payload: dict, scenario: str) -> dict:
        if scenario == "transmission_failure":
            raise TransientIntegrationError("simulated_transmission_failure")
        return {
            "simulated": True,
            "delivered": True,
            "action": action,
            "reference": f"SYN-{action.upper()}-{key}",
            "timestamp": now().isoformat(),
        }

    async def slots(self, location: str) -> list[dict]:
        return [
            {
                "scheduled_at": (now() + timedelta(days=d))
                .replace(hour=14, minute=0, second=0, microsecond=0)
                .isoformat(),
                "location": location,
                "performing_provider": "SYN-RAD-01",
            }
            for d in (1, 2, 3)
        ]


gateway = MockGateway()
