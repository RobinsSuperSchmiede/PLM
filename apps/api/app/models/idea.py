from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import ArchivableMixin, Base, EntityMixin, ProjectScopedMixin


class Idea(EntityMixin, ArchivableMixin, ProjectScopedMixin, Base):
    __tablename__ = "ideas"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="new")
    tags: Mapped[str | None] = mapped_column(String(255), nullable=True)
