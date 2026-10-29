import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import EntityRead

EntityType = Literal["note", "task", "event", "meeting", "project", "knowledge", "idea", "folder", "file"]


class FolderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    parent_id: uuid.UUID | None = None
    position: int = 0
    pinned: bool = False
    favorite: bool = False


class FolderUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    parent_id: uuid.UUID | None = None
    position: int | None = None
    pinned: bool | None = None
    favorite: bool | None = None


class FolderRead(FolderCreate, EntityRead):
    pass


def normalize_tag(value: str) -> str:
    return " ".join(value.strip().lstrip("#").split()).lower()[:64]


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    color: str | None
    count: int = 0


class TagUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=64)
    color: str | None = Field(None, max_length=16)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return normalize_tag(value) if value is not None else None


class TagAssignment(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tag_id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID


class EntityTagsUpdate(BaseModel):
    tags: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, values: list[str]) -> list[str]:
        cleaned = [normalize_tag(value) for value in values]
        return list(dict.fromkeys(value for value in cleaned if value))


class EntityTagsRead(BaseModel):
    tags: list[TagRead]
    assignments: list[TagAssignment]


class LinkCreate(BaseModel):
    source_type: EntityType
    source_id: uuid.UUID
    target_type: EntityType
    target_id: uuid.UUID


class LinkRead(LinkCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime


class ArchivedItem(BaseModel):
    type: EntityType
    id: uuid.UUID
    title: str
    preview: str | None
    archived_at: datetime
    project_id: uuid.UUID | None


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    at: datetime
    action: str
    entity_type: str
    entity_id: str
    title: str | None
    project_id: str | None
    source: str


class TelegramLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    at: datetime
    direction: str
    text: str
    entity_type: str | None
    entity_id: str | None
    project_id: str | None


FileKind = Literal["image", "pdf", "document", "spreadsheet", "presentation"]


class FileRead(EntityRead):
    name: str
    content_type: str
    size: int
    kind: FileKind
    description: str | None
    project_id: uuid.UUID | None


class FileUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    project_id: uuid.UUID | None = None
