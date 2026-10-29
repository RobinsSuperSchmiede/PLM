from functools import lru_cache
from typing import Sequence

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "anamnesies-api"
    app_env: str = "local"
    api_port: int = 8000
    log_level: str = "INFO"
    postgres_db: str = "plm"
    postgres_user: str = "plm"
    postgres_password: str = "plm"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    # Optional full SQLAlchemy URL (e.g. sqlite:///./plm.sqlite3). Overrides the postgres_* values.
    database_url: str | None = None
    cors_origins: Sequence[str] = Field(default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"])
    # Extra hostnames that may reach the MCP endpoint besides localhost and the configured custom domain.
    mcp_allowed_hosts: Sequence[str] = Field(default_factory=list)
    # Background loop for reminders, digests and Telegram bot commands (disabled in tests).
    scheduler_enabled: bool = True
    scheduler_interval_seconds: int = 20
    # Uploaded files (images, PDFs, Office documents); relative paths are resolved from the API directory.
    upload_dir: str = "data/uploads"
    max_upload_mb: int = 25

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}@"
            f"{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
