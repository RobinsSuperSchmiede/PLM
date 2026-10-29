import uuid
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import EntityRead

IdeaStatus = Literal["new", "exploring", "planned", "archived"]


class IdeaCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    status: IdeaStatus = "new"
    tags: str | None = Field(None, max_length=255)
    project_id: uuid.UUID | None = None


class IdeaUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: IdeaStatus | None = None
    tags: str | None = Field(None, max_length=255)
    project_id: uuid.UUID | None = None


class IdeaRead(IdeaCreate, EntityRead):
    pass
