import datetime as dt

from sqlalchemy import Date, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import ArchivableMixin, Base, EntityMixin, FolderScopedMixin, ProjectScopedMixin


class Meeting(EntityMixin, ArchivableMixin, ProjectScopedMixin, FolderScopedMixin, Base):
    __tablename__ = "meetings"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    attendees: Mapped[str | None] = mapped_column(Text, nullable=True)
    agenda: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="planned")
