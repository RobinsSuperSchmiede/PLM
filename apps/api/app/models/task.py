import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import ArchivableMixin, Base, EntityMixin


class Task(EntityMixin, ArchivableMixin, Base):
    __tablename__ = "tasks"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="todo", index=True)
    priority: Mapped[str] = mapped_column(String(16), default="medium")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
