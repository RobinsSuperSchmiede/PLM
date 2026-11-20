from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class AppSettings(Base):
    """Single-row table (id=1) holding workspace preferences and integration settings."""

    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    language: Mapped[str] = mapped_column(String(8), default="de")
    theme: Mapped[str] = mapped_column(String(16), default="system")
    # Set once the first-run walkthrough was finished or skipped.
    onboarding_done: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    # Domain under which this local instance is reachable (e.g. via reverse proxy or tunnel).
    custom_domain: Mapped[str | None] = mapped_column(String(253), nullable=True)
    mcp_domain: Mapped[str | None] = mapped_column(String(253), nullable=True)
    use_https: Mapped[bool] = mapped_column(Boolean, default=True)

    mcp_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    mcp_require_token: Mapped[bool] = mapped_column(Boolean, default=True)
    mcp_token: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Token of the browser extension (header X-Anamnesies-Token); only grants /api/v1/browser/*.
    browser_token: Mapped[str | None] = mapped_column(String(128), nullable=True)

    smtp_host: Mapped[str | None] = mapped_column(String(253), nullable=True)
    smtp_port: Mapped[int] = mapped_column(Integer, default=587)
    smtp_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_security: Mapped[str] = mapped_column(String(16), default="starttls")
    email_from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email_from_address: Mapped[str | None] = mapped_column(String(255), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
