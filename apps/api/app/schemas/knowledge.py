import uuid
from pydantic import BaseModel, Field

from app.schemas.common import EntityRead


class KnowledgeCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    content: str | None = None
    category: str | None = Field(None, max_length=64)
    source_url: str | None = Field(None, max_length=1024)
    project_id: uuid.UUID | None = None
    folder_id: uuid.UUID | None = None


class KnowledgeUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    content: str | None = None
    category: str | None = Field(None, max_length=64)
    source_url: str | None = Field(None, max_length=1024)
    project_id: uuid.UUID | None = None
    folder_id: uuid.UUID | None = None


class KnowledgeRead(KnowledgeCreate, EntityRead):
    pass
