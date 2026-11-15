"""Activity log: records every change to workspace entities, whichever channel (app, MCP, Telegram) made it."""

import json
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import event, insert, inspect, select, update
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import NO_VALUE

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


# Long texts are cut in the list of changes; the complete values are in the snapshots.
CHANGE_PREVIEW = 2000
_UNTRACKED = {"updated_at"}


def _plain(value: Any) -> Any:
    """A column value as something JSON can hold."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def snapshot_of(entity: Any) -> dict[str, Any]:
    """All columns of an entry, without triggering a database load for values that are not in memory."""
    state = inspect(entity)
    values: dict[str, Any] = {}
    for column in state.mapper.column_attrs:
        value = state.attrs[column.key].loaded_value
        values[column.key] = None if value is NO_VALUE else _plain(value)
    return values


def _short(value: Any) -> Any:
    value = _plain(value)
    return f"{value[:CHANGE_PREVIEW]}…" if isinstance(value, str) and len(value) > CHANGE_PREVIEW else value


def _changes_of(entity: Any) -> dict[str, list[Any]]:
    state = inspect(entity)
    changes: dict[str, list[Any]] = {}
    for column in state.mapper.column_attrs:
        if column.key in _UNTRACKED:
            continue
        history = state.attrs[column.key].history
        if not history.has_changes():
            continue
        old = history.deleted[0] if history.deleted else None
        new = history.added[0] if history.added else None
        if old != new:
            changes[column.key] = [_short(old), _short(new)]
    return changes


def _merge_changes(earlier: str | None, later: dict[str, list[Any]]) -> dict[str, list[Any]]:
    """Two edits in a row count as one: the oldest "before" and the newest "after" of every field."""
    merged: dict[str, list[Any]] = json.loads(earlier) if earlier else {}
    for field, (old, new) in later.items():
        merged[field] = [merged[field][0] if field in merged else old, new]
    return {field: pair for field, pair in merged.items() if pair[0] != pair[1]}


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


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
        snapshot = snapshot_of(entity)
        diff = _changes_of(entity) if action in ("update", "archive", "restore") else {}
        if action == "update":
            last = connection.execute(
                select(ActivityLog.id, ActivityLog.action, ActivityLog.at, ActivityLog.changes, ActivityLog.source)
                .where(ActivityLog.entity_id == entity_id).order_by(ActivityLog.id.desc()).limit(1)
            ).first()
            last_at = last.at.replace(tzinfo=now.tzinfo) if last and last.at.tzinfo is None else last.at if last else None
            if last and last.action == "update" and last.source == current_source() and last_at >= now - UPDATE_MERGE_WINDOW:
                connection.execute(update(ActivityLog).where(ActivityLog.id == last.id).values(
                    at=now, title=title_of(entity) or None, changes=_json(_merge_changes(last.changes, diff)), snapshot=_json(snapshot),
                ))
                continue
        rows.append({
            "at": now,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "title": title_of(entity) or None,
            "project_id": _project_id(entity),
            "source": current_source(),
            "changes": _json(diff) if diff else None,
            "snapshot": _json(snapshot),
        })
    if rows:
        connection.execute(insert(ActivityLog), rows)


def install() -> None:
    if not event.contains(Session, "after_flush", _after_flush):
        event.listen(Session, "before_flush", _before_flush)
        event.listen(Session, "after_flush", _after_flush)
