from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, EntityMixin, utcnow


class TelegramSettings(Base):
    """Single-row table (id=1) with the Telegram bot connection and notification preferences.

    Kept separate from AppSettings because tables are created with create_all (no migrations),
    so new columns on an existing table would not appear in already-initialised databases.
    """

    __tablename__ = "telegram_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    bot_token: Mapped[str | None] = mapped_column(String(128), nullable=True)
    bot_username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    chat_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    chat_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Secret the user sends as "/start <code>" so only they can link their chat to the bot.
    link_code: Mapped[str] = mapped_column(String(32), nullable=False)
    update_offset: Mapped[int] = mapped_column(Integer, default=0)
    commands_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Berlin")
    daily_digest: Mapped[bool] = mapped_column(Boolean, default=True)
    digest_time: Mapped[str] = mapped_column(String(5), default="08:00")
    # Minutes before an event/meeting to send a reminder; 0 disables it.
    event_reminder_minutes: Mapped[int] = mapped_column(Integer, default=15)
    # Second login factor: after the access code, a one-time code is sent to the linked chat.
    login_2fa: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Reminder(EntityMixin, Base):
    __tablename__ = "reminders"

    text: Mapped[str] = mapped_column(Text, nullable=False)
    # Local wall-clock time in the configured timezone (no tz info stored).
    remind_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False, index=True)
    repeat: Mapped[str] = mapped_column(String(16), default="none")
    done: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class NotificationLog(Base):
    """Remembers automatic notifications that were already sent (digest per day, event reminders)."""

    __tablename__ = "notification_log"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LoginChallenge(Base):
    """One-time login code sent via Telegram. Only a hash of the code is stored."""

    __tablename__ = "login_challenges"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
