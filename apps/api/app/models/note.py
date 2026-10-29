import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text, Uuid, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import ArchivableMixin, Base, EntityMixin, ProjectScopedMixin


class Note(EntityMixin, ArchivableMixin, ProjectScopedMixin, Base):
    __tablename__ = "notes"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    folder_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # Where the note was written: app, telegram or mcp (used as "author" filter).
    source: Mapped[str] = mapped_column(String(16), default="app", server_default="app")
