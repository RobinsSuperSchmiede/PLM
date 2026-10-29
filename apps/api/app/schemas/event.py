import datetime as dt
import uuid

from pydantic import BaseModel, Field

from app.schemas.common import EntityRead

TIME_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"


class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    date: dt.date
    time: str | None = Field(None, pattern=TIME_PATTERN)
    location: str | None = Field(None, max_length=255)
    description: str | None = None
    project_id: uuid.UUID | None = None


class EventUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    date: dt.date | None = None
    time: str | None = Field(None, pattern=TIME_PATTERN)
    location: str | None = Field(None, max_length=255)
    description: str | None = None
    project_id: uuid.UUID | None = None


class EventRead(EventCreate, EntityRead):
    pass
