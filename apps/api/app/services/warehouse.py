"""Data warehouse: the complete history of the workspace.

The activity log is its fact table. Every row carries what changed and a snapshot of the entry, so the
warehouse can answer what existed when, show earlier versions, and bring back deleted entries.
"""

import csv
import io
import json
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime, time, timezone
from typing import Any

from sqlalchemy import Date, DateTime, Uuid, func, insert, or_, select
from sqlalchemy.orm import Session

from app.models import ActivityLog, Folder, Project, StoredFile
from app.models.base import utcnow
from app.services import activity
from app.services.registry import ENTITY_MODELS, title_of

# Written once for entries that existed before the warehouse kept snapshots.
BASELINE = "snapshot"
# Never written back when an earlier version is restored.
_KEEP_ON_REVERT = {"id", "created_at", "updated_at", "archived_at", "storage_key", "content_type", "size", "kind", "source"}
_REFERENCES = {"project_id": Project, "folder_id": Folder, "parent_id": Folder}


class WarehouseError(ValueError):
    pass


def backfill(db: Session) -> int:
    """Give every existing entry a first snapshot, so its history has a starting point."""
    known = set(db.scalars(select(ActivityLog.entity_id).where(ActivityLog.snapshot.is_not(None)).distinct()))
    now = utcnow()
    rows: list[dict[str, Any]] = []
    for entity_type, model in ENTITY_MODELS.items():
        for entity in db.scalars(select(model)):
            if str(entity.id) in known:
                continue
            project_id = entity.id if entity_type == "project" else getattr(entity, "project_id", None)
            rows.append({
                "at": now, "action": BASELINE, "entity_type": entity_type, "entity_id": str(entity.id), "title": title_of(entity) or None,
                "project_id": str(project_id) if project_id else None, "source": "system",
                "changes": None, "snapshot": json.dumps(activity.snapshot_of(entity), ensure_ascii=False, default=str),
            })
    if rows:
        db.execute(insert(ActivityLog), rows)
        db.commit()
    return len(rows)


def _local_day(value: datetime) -> date:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone().date()


def _bound(day: date, end: bool) -> datetime:
    """Start or end of a local day as UTC."""
    return datetime.combine(day, time.max if end else time.min).astimezone().astimezone(timezone.utc)


def _filters(*, entity_type: str | None, action: str | None, source: str | None, project_id: str | None, entity_id: str | None,
             start: date | None, end: date | None, query: str) -> list[Any]:
    where: list[Any] = []
    if entity_type:
        where.append(ActivityLog.entity_type == entity_type)
    if action:
        where.append(ActivityLog.action == action)
    if source:
        where.append(ActivityLog.source == source)
    if project_id:
        where.append(ActivityLog.project_id == project_id)
    if entity_id:
        where.append(ActivityLog.entity_id == entity_id)
    if start:
        where.append(ActivityLog.at >= _bound(start, False))
    if end:
        where.append(ActivityLog.at <= _bound(end, True))
    if query.strip():
        # The snapshots hold the full text, so this also finds entries that were deleted long ago.
        pattern = f"%{query.strip().lower()}%"
        where.append(or_(func.lower(ActivityLog.title).like(pattern), func.lower(ActivityLog.snapshot).like(pattern)))
    return where


def _latest(db: Session) -> dict[str, tuple[str, str]]:
    """Last recorded action of every entry: entity_id -> (entity_type, action)."""
    last = select(func.max(ActivityLog.id)).group_by(ActivityLog.entity_id)
    return {entity_id: (entity_type, action) for entity_id, entity_type, action
            in db.execute(select(ActivityLog.entity_id, ActivityLog.entity_type, ActivityLog.action).where(ActivityLog.id.in_(last)))}


def summary(db: Session) -> dict[str, Any]:
    by_type: dict[str, dict[str, int]] = {name: {"active": 0, "archived": 0, "deleted": 0, "events": 0} for name in ENTITY_MODELS}
    for name, model in ENTITY_MODELS.items():
        rows = dict(db.execute(select(model.archived_at.is_(None), func.count()).group_by(model.archived_at.is_(None))).all())  # type: ignore[attr-defined]
        by_type[name]["active"], by_type[name]["archived"] = rows.get(True, 0), rows.get(False, 0)
    for entity_type, action in _latest(db).values():
        if action == "delete" and entity_type in by_type:
            by_type[entity_type]["deleted"] += 1

    months: dict[str, Counter[str]] = defaultdict(Counter)
    by_action: Counter[str] = Counter()
    by_source: Counter[str] = Counter()
    first: datetime | None = None
    for at, action, entity_type, source in db.execute(
        select(ActivityLog.at, ActivityLog.action, ActivityLog.entity_type, ActivityLog.source).where(ActivityLog.action != BASELINE)
    ):
        months[_local_day(at).isoformat()[:7]][action] += 1
        by_action[action] += 1
        by_source[source] += 1
        if entity_type in by_type:
            by_type[entity_type]["events"] += 1
        first = at if first is None or at < first else first

    return {
        "generated_at": utcnow().isoformat(),
        "first_at": first.isoformat() if first else None,
        "events": sum(by_action.values()),
        "versions": db.scalar(select(func.count()).select_from(ActivityLog).where(ActivityLog.snapshot.is_not(None))) or 0,
        "by_type": by_type,
        "by_action": dict(by_action),
        "by_source": dict(by_source),
        "months": {month: dict(actions) for month, actions in sorted(months.items())},
    }


def _row(entry: ActivityLog, *, full: bool = False) -> dict[str, Any]:
    changes = json.loads(entry.changes) if entry.changes else {}
    row: dict[str, Any] = {
        "id": entry.id, "at": entry.at.isoformat() if entry.at.tzinfo else entry.at.replace(tzinfo=timezone.utc).isoformat(),
        "action": entry.action, "entity_type": entry.entity_type, "entity_id": entry.entity_id, "title": entry.title,
        "project_id": entry.project_id, "source": entry.source, "has_snapshot": entry.snapshot is not None,
    }
    if full:
        row["changes"] = changes
        row["snapshot"] = json.loads(entry.snapshot) if entry.snapshot else None
    else:
        row["changed"] = sorted(changes)
    return row


def events(db: Session, *, limit: int = 100, offset: int = 0, full: bool = False, baseline: bool = False, **filters: Any) -> dict[str, Any]:
    where = _filters(**filters)
    # The first snapshots of older entries are bookkeeping; they only show up in the history of one entry or on request.
    if not baseline and not filters.get("action") and not filters.get("entity_id"):
        where.append(ActivityLog.action != BASELINE)
    total = db.scalar(select(func.count()).select_from(ActivityLog).where(*where)) or 0
    rows = db.scalars(select(ActivityLog).where(*where).order_by(ActivityLog.at.desc(), ActivityLog.id.desc()).limit(limit).offset(offset)).all()
    return {"total": total, "items": [_row(entry, full=full) for entry in rows]}


def deleted(db: Session, query: str = "", entity_type: str | None = None) -> list[dict[str, Any]]:
    """Entries that no longer exist, with the state they had when they were deleted."""
    ids = [entity_id for entity_id, (kind, action) in _latest(db).items() if action == "delete" and (not entity_type or kind == entity_type)]
    if not ids:
        return []
    last = select(func.max(ActivityLog.id)).where(ActivityLog.entity_id.in_(ids)).group_by(ActivityLog.entity_id)
    term = query.strip().lower()
    rows = db.scalars(select(ActivityLog).where(ActivityLog.id.in_(last)).order_by(ActivityLog.at.desc())).all()
    return [{**_row(entry), "restorable": entry.snapshot is not None and entry.entity_type != "file"} for entry in rows
            if not term or term in f"{entry.title or ''} {entry.snapshot or ''}".lower()]


def entity_history(db: Session, entity_type: str, entity_id: str) -> dict[str, Any]:
    rows = db.scalars(select(ActivityLog).where(ActivityLog.entity_type == entity_type, ActivityLog.entity_id == entity_id)
                      .order_by(ActivityLog.at.desc(), ActivityLog.id.desc())).all()
    if not rows:
        raise WarehouseError(f"No history for {entity_type} {entity_id}")
    entity = _current(db, entity_type, entity_id)
    state = "deleted" if entity is None else "archived" if entity.archived_at is not None else "active"
    latest = next((entry for entry in rows if entry.snapshot), None)
    return {
        "type": entity_type, "id": entity_id, "title": rows[0].title, "state": state,
        "restorable": state == "deleted" and latest is not None and entity_type != "file",
        "snapshot": json.loads(latest.snapshot) if latest and latest.snapshot else None,
        "timeline": [_row(entry, full=True) for entry in rows],
    }


def _current(db: Session, entity_type: str, entity_id: str) -> Any:
    model = ENTITY_MODELS.get(entity_type)
    try:
        return db.get(model, uuid.UUID(entity_id)) if model else None
    except ValueError:
        return None


def _values(db: Session, model: Any, snapshot: dict[str, Any]) -> dict[str, Any]:
    """Turn a stored snapshot back into column values; references to entries that are gone become empty."""
    values: dict[str, Any] = {}
    for column in model.__table__.columns:
        if column.key not in snapshot:
            continue
        value = snapshot[column.key]
        if value is not None:
            if isinstance(column.type, Uuid):
                value = uuid.UUID(str(value))
            elif isinstance(column.type, DateTime):
                value = datetime.fromisoformat(value)
            elif isinstance(column.type, Date):
                value = date.fromisoformat(value)
        target = _REFERENCES.get(column.key)
        if target is not None and value is not None and db.get(target, value) is None:
            value = None
        values[column.key] = value
    return values


def restore(db: Session, entity_type: str, entity_id: str, event_id: int | None = None) -> Any:
    """Bring back a deleted entry, or set an existing one back to the version recorded in `event_id`."""
    model = ENTITY_MODELS.get(entity_type)
    if model is None:
        raise WarehouseError(f"Unknown entity type {entity_type}")
    statement = select(ActivityLog).where(ActivityLog.entity_type == entity_type, ActivityLog.entity_id == entity_id, ActivityLog.snapshot.is_not(None))
    statement = statement.where(ActivityLog.id == event_id) if event_id is not None else statement.order_by(ActivityLog.id.desc()).limit(1)
    entry = db.scalar(statement)
    if entry is None or not entry.snapshot:
        raise WarehouseError("No stored version to restore")
    values = _values(db, model, json.loads(entry.snapshot))
    entity = _current(db, entity_type, entity_id)
    if entity is None:
        if model is StoredFile:
            raise WarehouseError("The content of a deleted file is gone; only its details are kept")
        values["archived_at"] = None
        entity = model(**values)
        db.add(entity)
    else:
        if event_id is None:
            raise WarehouseError("The entry still exists; choose the version to go back to")
        for key, value in values.items():
            if key not in _KEEP_ON_REVERT:
                setattr(entity, key, value)
    db.commit()
    db.refresh(entity)
    return entity


def export_csv(rows: list[dict[str, Any]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "at", "action", "entity_type", "entity_id", "title", "project_id", "source", "changed_fields"])
    for row in rows:
        writer.writerow([row["id"], row["at"], row["action"], row["entity_type"], row["entity_id"], row["title"] or "", row["project_id"] or "",
                         row["source"], " ".join(sorted(row.get("changes") or {}))])
    return output.getvalue()
