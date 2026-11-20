import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import EntityRead

NoteColor = Literal["yellow", "pink", "green", "blue", "orange", "purple"]


def _check_url(value: str) -> str:
    value = value.strip()
    if not value.lower().startswith(("http://", "https://", "file://")):
        raise ValueError("Only http(s) and file URLs are supported")
    return value


# --- Sticky notes ----------------------------------------------------------------------------


class WebNoteIn(BaseModel):
    """A note as the extension sends it; unknown ids are created, known ones updated."""

    id: uuid.UUID
    text: str = Field("", max_length=100_000)
    color: NoteColor = "yellow"
    x: int = Field(0, ge=-10_000, le=1_000_000)
    y: int = Field(0, ge=-10_000, le=10_000_000)
    w: int = Field(240, ge=80, le=4000)
    h: int = Field(200, ge=40, le=4000)
    minimized: bool = False
    pinned: bool = False
    project_id: uuid.UUID | None = None

    @field_validator("color", mode="before")
    @classmethod
    def known_color(cls, value: object) -> object:
        return value if value in {"yellow", "pink", "green", "blue", "orange", "purple"} else "yellow"


class WebNoteRead(EntityRead):
    url: str
    origin: str
    scope: Literal["page", "site"] | str
    page_title: str | None = None
    text: str
    color: str
    x: int
    y: int
    w: int
    h: int
    minimized: bool
    pinned: bool
    project_id: uuid.UUID | None = None


class PageNotesSave(BaseModel):
    """All notes of one page and of its whole site, as currently shown in the tab."""

    url: str = Field(..., max_length=8000)
    title: str | None = Field(None, max_length=500)
    page: list[WebNoteIn] = Field(default_factory=list, max_length=500)
    site: list[WebNoteIn] = Field(default_factory=list, max_length=500)
    # Ids of the notes the tab knows. Only those can be deleted by leaving them out; notes another tab
    # created in the meantime stay. Without it every stored note of the page that is left out is deleted.
    known: list[uuid.UUID] | None = Field(None, max_length=2000)

    _url = field_validator("url")(_check_url)


class WebNoteUpdate(BaseModel):
    text: str | None = Field(None, max_length=100_000)
    color: NoteColor | None = None
    minimized: bool | None = None
    pinned: bool | None = None
    project_id: uuid.UUID | None = None


class WebNoteRestore(WebNoteIn):
    url: str = Field(..., max_length=8000)
    scope: Literal["page", "site"] = "page"
    page_title: str | None = Field(None, max_length=500)


# --- Websites ----------------------------------------------------------------------------------


class WebsiteCreate(BaseModel):
    url: str = Field(..., max_length=8000)
    title: str = Field("", max_length=255)
    description: str | None = None
    favicon_url: str | None = Field(None, max_length=8000)
    project_id: uuid.UUID | None = None

    _url = field_validator("url")(_check_url)


class WebsiteUpdate(BaseModel):
    url: str | None = Field(None, max_length=8000)
    title: str | None = Field(None, max_length=255)
    description: str | None = None
    project_id: uuid.UUID | None = None

    @field_validator("url")
    @classmethod
    def valid_url(cls, value: str | None) -> str | None:
        return None if value is None else _check_url(value)


class WebsiteRead(EntityRead):
    url: str
    title: str
    description: str | None = None
    favicon_url: str | None = None
    project_id: uuid.UUID | None = None
    screenshot_id: uuid.UUID | None = None


# --- Extension helpers ----------------------------------------------------------------------------


class BrowserProject(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    status: str
    pinned: bool
    updated_at: datetime


class BrowserStatus(BaseModel):
    ok: bool = True
    app: str = "anamnesies"
    projects: list[BrowserProject]
