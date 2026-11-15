import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import EntityRead

TaskStatus = Literal["todo", "in-progress", "done"]
TaskPriority = Literal["low", "medium", "high"]


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    status: TaskStatus = "todo"
    priority: TaskPriority = "medium"
    due_date: date | None = None
    project_id: uuid.UUID | None = None
    folder_id: uuid.UUID | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    due_date: date | None = None
    project_id: uuid.UUID | None = None
    folder_id: uuid.UUID | None = None


class TaskRead(TaskCreate, EntityRead):
    pass
