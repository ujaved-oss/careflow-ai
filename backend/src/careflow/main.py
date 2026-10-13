import json
import logging
import time
from uuid import UUID, uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm.exc import StaleDataError

from careflow.api import router
from careflow.config import settings
from careflow.db import Session

app = FastAPI(
    title=settings().app_name,
    version="0.1.0",
    description="Synthetic hospital administrative workflow demo. Not for real PHI. Default AI provider is deterministic mock.",
)
app.include_router(router)
log = logging.getLogger("careflow.api")
logging.basicConfig(level=settings().log_level, format="%(message)s")


@app.middleware("http")
async def correlation(request: Request, call_next):
    try:
        request.state.correlation_id = UUID(request.headers.get("x-correlation-id", str(uuid4())))
    except ValueError:
        request.state.correlation_id = uuid4()
    started = time.monotonic()
    try:
        response = await call_next(request)
    except StaleDataError:
        response = JSONResponse(
            {"detail": "Case changed concurrently; refresh and retry"}, status_code=409
        )
    response.headers["X-Correlation-ID"] = str(request.state.correlation_id)
    response.headers["X-CareFlow-Environment"] = "synthetic-demo"
    log.info(
        json.dumps(
            {
                "event": "api_request",
                "method": request.method,
                "status": response.status_code,
                "correlation_id": str(request.state.correlation_id),
                "duration_ms": round((time.monotonic() - started) * 1000),
            }
        )
    )
    return response


@app.get("/health")
async def health():
    async with Session() as db:
        await db.execute(text("SELECT 1"))
    return {"status": "ok", "synthetic": True, "ai_provider": settings().ai_provider}
