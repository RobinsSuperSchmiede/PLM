import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

DOMAIN_PATTERN = re.compile(r"^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)*[a-z0-9-]{1,63}(?<!-)$")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_domain(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip().lower()
    value = re.sub(r"^https?://", "", value).rstrip("/")
    if not value:
        return None
    if not DOMAIN_PATTERN.match(value):
        raise ValueError("Invalid domain name")
    return value


class SettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    language: str
    theme: str
    custom_domain: str | None
    mcp_domain: str | None
    use_https: bool
    mcp_enabled: bool
    mcp_require_token: bool
    mcp_token: str | None
    smtp_host: str | None
    smtp_port: int
    smtp_username: str | None
    smtp_password_set: bool = False
    smtp_security: str
    email_from_name: str | None
    email_from_address: str | None
    # Derived values for the UI.
    app_url: str | None = None
    mcp_url: str
    mcp_local_url: str


class SettingsUpdate(BaseModel):
    language: Literal["de", "en"] | None = None
    theme: Literal["light", "dark", "system"] | None = None
    custom_domain: str | None = None
    mcp_domain: str | None = None
    use_https: bool | None = None
    mcp_enabled: bool | None = None
    mcp_require_token: bool | None = None
    smtp_host: str | None = Field(None, max_length=253)
    smtp_port: int | None = Field(None, ge=1, le=65535)
    smtp_username: str | None = Field(None, max_length=255)
    # Empty string clears the stored password; omitting the field keeps it.
    smtp_password: str | None = Field(None, max_length=255)
    smtp_security: Literal["none", "starttls", "ssl"] | None = None
    email_from_name: str | None = Field(None, max_length=255)
    email_from_address: str | None = Field(None, max_length=255)

    @field_validator("custom_domain", "mcp_domain")
    @classmethod
    def validate_domain(cls, value: str | None) -> str | None:
        return _normalize_domain(value)

    @field_validator("email_from_address")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip()
        if not EMAIL_PATTERN.match(value):
            raise ValueError("Invalid email address")
        return value


class TestEmailRequest(BaseModel):
    to: str = Field(..., max_length=255)

    @field_validator("to")
    @classmethod
    def validate_to(cls, value: str) -> str:
        value = value.strip()
        if not EMAIL_PATTERN.match(value):
            raise ValueError("Invalid email address")
        return value


class DomainCheck(BaseModel):
    domain: str
    resolves: bool
    addresses: list[str]
    points_to_local: bool


class DomainCheckResult(BaseModel):
    checks: list[DomainCheck]
