"""Activity log: records every change to workspace entities, whichever channel (app, MCP, Telegram) made it."""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import timedelta
from typing import Any

from sqlalchemy import event, insert, inspect, select, update
from sqlalchemy.orm import Session

from app.models import ActivityLog, Note
from app.models.base import utcnow
from app.services.registry import title_of, type_of

# Edits to the same entity within this window are merged into one "update" entry (e.g. note autosave).
UPDATE_MERGE_WINDOW = timedelta(minutes=10)

_source: ContextVar[str] = ContextVar("activity_source", default="app")


@contextmanager
def source(name: str) -> Iterator[None]:
    """Attribute changes made inside this block to a channel such as "telegram" or "mcp"."""
    token = _source.set(name)
    try:
        yield
    finally:
        _source.reset(token)


def current_source() -> str:
    return _source.get()


def _project_id(entity: Any) -> str | None:
    value = getattr(entity, "project_id", None)
    if value is None and type_of(entity) == "project":
        value = entity.id
    return str(value) if value else None


def _archive_action(entity: Any) -> str | None:
    if not hasattr(entity, "archived_at"):
        return None
    history = inspect(entity).attrs.archived_at.history
    if not history.has_changes():
        return None
    return "archive" if history.added and history.added[0] is not None else "restore"


def _before_flush(session: Session, _context: Any, _instances: Any) -> None:
    for entity in session.new:
        if isinstance(entity, Note) and not entity.source:
            entity.source = current_source()


def _after_flush(session: Session, _context: Any) -> None:
    rows: list[dict[str, Any]] = []
    now = utcnow()
    changes = [(entity, "create") for entity in session.new]
    changes += [(entity, _archive_action(entity) or "update") for entity in session.dirty if session.is_modified(entity, include_collections=False)]
    changes += [(entity, "delete") for entity in session.deleted]
    connection = session.connection()
    for entity, action in changes:
        entity_type = type_of(entity)
        if entity_type is None or entity.id is None:
            continue
        entity_id = str(entity.id)
        if action == "update":
            merged = connection.execute(
                update(ActivityLog)
                .where(
                    ActivityLog.id == select(ActivityLog.id).where(ActivityLog.entity_id == entity_id).order_by(ActivityLog.id.desc()).limit(1).scalar_subquery(),
                    ActivityLog.action == "update",
                    ActivityLog.at >= now - UPDATE_MERGE_WINDOW,
                )
                .values(at=now, title=title_of(entity) or None)
            )
            if merged.rowcount:
                continue
        rows.append({
            "at": now,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "title": title_of(entity) or None,
            "project_id": _project_id(entity),
            "source": current_source(),
        })
    if rows:
        connection.execute(insert(ActivityLog), rows)


def install() -> None:
    if not event.contains(Session, "after_flush", _after_flush):
        event.listen(Session, "before_flush", _before_flush)
        event.listen(Session, "after_flush", _after_flush)
