import os

# Tests deliberately require a separate real PostgreSQL database.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://careflow:localdev@127.0.0.1:5432/careflow_test"
)
os.environ["APP_ENV"] = "test"
os.environ["STORAGE_ROOT"] = "storage/test_documents"

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url

from careflow.db import Session, engine
from careflow.main import app
from careflow.seed import seed


@pytest.fixture(scope="session", autouse=True)
async def database():
    if not (make_url(os.environ["DATABASE_URL"]).database or "").endswith("_test"):
        raise RuntimeError(
            "Test database name must end in _test; refusing to truncate another database"
        )
    async with engine.begin() as connection:
        # Migrations must already have been applied, including the immutability trigger.
        await connection.execute(text("TRUNCATE tenants CASCADE"))
    async with Session.begin() as db:
        await seed(db)
    yield
    await engine.dispose()


@pytest.fixture
async def client():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client


async def session_headers(client, role="demo_admin", hospital=0):
    from careflow.seed import fixture_id

    response = await client.post(
        "/api/v1/auth/demo-login", json={"user_id": str(fixture_id(f"user/{hospital}/{role}"))}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
