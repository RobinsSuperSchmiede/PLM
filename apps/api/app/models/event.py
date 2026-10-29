import datetime as dt

from sqlalchemy import Date, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import ArchivableMixin, Base, EntityMixin, ProjectScopedMixin


class Event(EntityMixin, ArchivableMixin, ProjectScopedMixin, Base):
    __tablename__ = "events"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
