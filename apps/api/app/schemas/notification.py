from datetime import datetime
from typing import Literal
from zoneinfo import available_timezones

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import EntityRead
from app.schemas.event import TIME_PATTERN

RepeatRule = Literal["none", "daily", "weekdays", "weekly", "monthly"]


class ReminderCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    remind_at: datetime
    repeat: RepeatRule = "none"

    @field_validator("remind_at")
    @classmethod
    def strip_timezone(cls, value: datetime) -> datetime:
        # Reminders are stored as local wall-clock time of the configured timezone.
        return value.replace(tzinfo=None, second=0, microsecond=0)


class ReminderUpdate(BaseModel):
    text: str | None = Field(None, min_length=1, max_length=2000)
    remind_at: datetime | None = None
    repeat: RepeatRule | None = None
    done: bool | None = None

    @field_validator("remind_at")
    @classmethod
    def strip_timezone(cls, value: datetime | None) -> datetime | None:
        return value.replace(tzinfo=None, second=0, microsecond=0) if value else value


class ReminderRead(EntityRead):
    text: str
    remind_at: datetime
    repeat: RepeatRule
    done: bool
    last_sent_at: datetime | None


class TelegramRead(BaseModel):
    enabled: bool
    token_set: bool
    bot_username: str | None
    linked: bool
    chat_name: str | None
    link_code: str
    link_url: str | None
    commands_enabled: bool
    timezone: str
    daily_digest: bool
    digest_time: str
    event_reminder_minutes: int
    login_2fa: bool


class TelegramUpdate(BaseModel):
    enabled: bool | None = None
    # Empty string removes the token (and the linked chat); omitting it keeps the stored one.
    bot_token: str | None = Field(None, max_length=128)
    commands_enabled: bool | None = None
    timezone: str | None = None
    daily_digest: bool | None = None
    digest_time: str | None = Field(None, pattern=TIME_PATTERN)
    event_reminder_minutes: int | None = Field(None, ge=0, le=1440)
    login_2fa: bool | None = None

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value is not None and value not in available_timezones():
            raise ValueError("Unknown timezone")
        return value


class TelegramMessage(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
