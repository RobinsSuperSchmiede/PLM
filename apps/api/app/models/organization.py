import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import ArchivableMixin, Base, EntityMixin, FolderScopedMixin, ProjectScopedMixin, utcnow


class Folder(EntityMixin, ArchivableMixin, Base):
    """Explorer folder for any kind of entry; folders nest via parent_id like a file explorer."""

    __tablename__ = "folders"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    favorite: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class EntityTag(Base):
    """Tag assignment to any entity (note, task, event, ...), identified by type and id."""

    __tablename__ = "entity_tags"

    tag_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(32), primary_key=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, index=True)


class EntityLink(Base):
    """Explicit link between two entities of any type (note ↔ task, task ↔ project, ...)."""

    __tablename__ = "entity_links"
    __table_args__ = (UniqueConstraint("source_type", "source_id", "target_type", "target_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ActivityLog(Base):
    """Every create/update/archive/restore/delete of a workspace entity: the fact table of the data warehouse.

    `changes` holds the changed fields as JSON ({field: [old, new]}), `snapshot` the complete entry after
    the change (for a delete: as it was before), so past versions and deleted entries stay available.
    """

    __tablename__ = "activity_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(16), default="app")
    changes: Mapped[str | None] = mapped_column(Text, nullable=True)
    snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)


class ApiUsage(Base):
    """Request counter per day and channel (api, mcp)."""

    __tablename__ = "api_usage"

    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    channel: Mapped[str] = mapped_column(String(16), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)


class TelegramMessageLog(Base):
    """Messages exchanged with the Telegram bot, optionally tied to a project and a created entity."""

    __tablename__ = "telegram_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)


class StoredFile(EntityMixin, ArchivableMixin, ProjectScopedMixin, FolderScopedMixin, Base):
    """Uploaded file (image, PDF, Office document). The bytes live in the upload directory under storage_key."""

    __tablename__ = "files"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size: Mapped[int] = mapped_column(Integer, default=0)
    # image | pdf | document | spreadsheet | presentation
    kind: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    storage_key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
