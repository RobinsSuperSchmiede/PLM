import uuid
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import EntityRead


class NoteCreate(BaseModel):
    # Empty titles are allowed; the UI shows a placeholder ("Untitled").
    title: str = Field("", max_length=255)
    content: str | None = None
    folder_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    pinned: bool = False


class NoteUpdate(BaseModel):
    title: str | None = Field(None, max_length=255)
    content: str | None = None
    folder_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    pinned: bool | None = None


class NoteRead(NoteCreate, EntityRead):
    source: Literal["app", "telegram", "mcp"] | str = "app"
