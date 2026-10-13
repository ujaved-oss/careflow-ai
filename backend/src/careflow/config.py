from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_name: str = "CareFlow AI"
    app_env: Literal["demo", "test"] = "demo"
    demo_mode: bool = True
    database_url: str = "postgresql+asyncpg://careflow:localdev@localhost:5432/careflow"
    session_secret: str = "local-synthetic-demo-only-do-not-use-in-production"
    session_max_age: int = 28800
    ai_provider: Literal["mock", "ollama"] = "mock"
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5:7b"
    external_integrations_enabled: bool = False
    allow_real_patient_data: bool = False
    embeddings_enabled: bool = False
    voice_enabled: bool = False
    voice_model_path: str | None = None
    piper_model_path: str | None = None
    storage_root: Path = Path("storage/synthetic_documents")
    log_level: str = "INFO"
    worker_poll_seconds: float = 0.5
    worker_max_attempts: int = 4
    worker_lease_seconds: int = 90

    @model_validator(mode="after")
    def safe_demo(self):
        if not self.demo_mode or self.external_integrations_enabled or self.allow_real_patient_data:
            raise ValueError(
                "This build only supports synthetic demo mode with simulated integrations"
            )
        if not self.database_url.startswith("postgresql+asyncpg://"):
            raise ValueError("PostgreSQL with asyncpg is required")
        from urllib.parse import urlparse

        if urlparse(self.ollama_base_url).hostname not in {"localhost", "127.0.0.1", "ollama"}:
            raise ValueError("Ollama must use a local host or Compose service")
        if self.embeddings_enabled:
            raise ValueError("Vector retrieval is not implemented; use PostgreSQL full-text search")
        return self


@lru_cache
def settings() -> Settings:
    return Settings()
