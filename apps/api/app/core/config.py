from functools import lru_cache
from typing import Sequence

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "plm-api"
    app_env: str = "local"
    api_port: int = 8000
    log_level: str = "INFO"
    postgres_db: str = "plm"
    postgres_user: str = "plm"
    postgres_password: str = "plm"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    cors_origins: Sequence[str] = Field(default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"])

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
