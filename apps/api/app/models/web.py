"""Data of the browser extension: sticky notes on web pages and websites attached to projects."""

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, Uuid, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import ArchivableMixin, Base, EntityMixin, ProjectScopedMixin


class WebNote(EntityMixin, ProjectScopedMixin, Base):
    """A sticky note on a web page.

    ``scope`` page: shown on exactly ``url`` (origin + path + query, without #hash).
    ``scope`` site: shown on every page of ``origin``; ``url`` then is ``<origin>/*``.
    Position and size are in CSS pixels of the page (document coordinates, or viewport ones when pinned).
    """

    __tablename__ = "web_notes"

    url: Mapped[str] = mapped_column(Text, nullable=False)
    origin: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    scope: Mapped[str] = mapped_column(String(8), default="page", server_default="page")
    page_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    text: Mapped[str] = mapped_column(Text, default="", server_default="")
    color: Mapped[str] = mapped_column(String(16), default="yellow", server_default="yellow")
    x: Mapped[int] = mapped_column(Integer, default=0)
    y: Mapped[int] = mapped_column(Integer, default=0)
    w: Mapped[int] = mapped_column(Integer, default=240)
    h: Mapped[int] = mapped_column(Integer, default=200)
    minimized: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())


class Website(EntityMixin, ArchivableMixin, ProjectScopedMixin, Base):
    """A web page attached to a project, with an optional screenshot (stored as an image file)."""

    __tablename__ = "websites"

    url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(String(255), default="", server_default="")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    favicon_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    screenshot_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
