from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    content: str | None = None


class NoteRead(NoteCreate):
    id: str
