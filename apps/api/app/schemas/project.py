from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import EntityRead

ProjectStatus = Literal["active", "on_hold", "completed"]


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    status: ProjectStatus = "active"


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: ProjectStatus | None = None


class ProjectRead(ProjectCreate, EntityRead):
    pass
