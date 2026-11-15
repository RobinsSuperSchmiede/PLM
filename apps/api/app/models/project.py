from sqlalchemy import Boolean, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import ArchivableMixin, Base, EntityMixin, FolderScopedMixin


class Project(EntityMixin, ArchivableMixin, FolderScopedMixin, Base):
    __tablename__ = "projects"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
