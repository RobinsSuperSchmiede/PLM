from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    status: str = "todo"


class TaskRead(TaskCreate):
    id: str
