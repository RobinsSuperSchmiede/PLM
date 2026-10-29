import datetime as dt
import uuid
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import EntityRead
from app.schemas.event import TIME_PATTERN

MeetingStatus = Literal["planned", "done", "cancelled"]


class MeetingCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    date: dt.date
    time: str | None = Field(None, pattern=TIME_PATTERN)
    attendees: str | None = None
    agenda: str | None = None
    notes: str | None = None
    status: MeetingStatus = "planned"
    project_id: uuid.UUID | None = None


class MeetingUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    date: dt.date | None = None
    time: str | None = Field(None, pattern=TIME_PATTERN)
    attendees: str | None = None
    agenda: str | None = None
    notes: str | None = None
    status: MeetingStatus | None = None
    project_id: uuid.UUID | None = None


class MeetingRead(MeetingCreate, EntityRead):
    pass
