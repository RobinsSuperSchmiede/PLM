from pydantic import BaseModel, Field

from app.schemas.common import EntityRead


class ListItemCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    done: bool = False


class ListItemUpdate(BaseModel):
    text: str | None = Field(None, min_length=1, max_length=500)
    done: bool | None = None


class ListItemRead(ListItemCreate, EntityRead):
    position: int


class ListCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    category: str = Field("General", max_length=64)
    pinned: bool = False


class ListUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    category: str | None = Field(None, max_length=64)
    pinned: bool | None = None


class ListRead(ListCreate, EntityRead):
    items: list[ListItemRead] = []
