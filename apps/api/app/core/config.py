from functools import lru_cache
from pathlib import Path
from typing import Literal, Sequence

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# apps/api – relative paths in the settings (uploads, workspaces) are resolved from here.
API_ROOT = Path(__file__).resolve().parents[2]


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
    # "multi": sign-in with username and password, every account has a workspace of its own.
    # "single": no accounts and no sign-in, one local workspace (only for machines nobody else can reach).
    auth_mode: Literal["single", "multi"] = "multi"
    # Databases (SQLite) and uploads of the additional accounts' workspaces, plus the accounts store.
    workspaces_dir: str = "data/workspaces"
    # How long a sign-in stays valid without being used.
    session_days: int = 30

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
