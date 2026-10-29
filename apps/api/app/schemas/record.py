from pydantic import BaseModel, Field

from app.schemas.common import EntityRead


class RecordCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    status: str = Field("Draft", max_length=32)


class RecordUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    status: str | None = Field(None, max_length=32)


class RecordRead(RecordCreate, EntityRead):
    pass
