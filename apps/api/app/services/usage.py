"""Counts API and MCP requests per day and workspace. Kept in memory and written to the database periodically."""

from collections import Counter
from datetime import date
from threading import Lock

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import current_workspace
from app.models import ApiUsage

_pending: Counter[tuple[str, str, str]] = Counter()
_lock = Lock()


def count(channel: str, workspace: str | None = None) -> None:
    with _lock:
        _pending[(workspace or current_workspace(), date.today().isoformat(), channel)] += 1


def flush(db: Session) -> None:
    """Writes the pending counts of the workspace ``db`` belongs to (the current workspace)."""
    workspace = current_workspace()
    with _lock:
        pending = {(day, channel): amount for (key, day, channel), amount in _pending.items() if key == workspace}
        for day, channel in pending:
            del _pending[(workspace, day, channel)]
    for (day, channel), amount in pending.items():
        row = db.get(ApiUsage, (day, channel))
        if row is None:
            db.add(ApiUsage(day=day, channel=channel, count=amount))
        else:
            row.count += amount
    db.commit()


def per_day(db: Session, since: str) -> dict[str, dict[str, int]]:
    """{day: {channel: count}} for all days >= since, including requests not yet written."""
    flush(db)
    result: dict[str, dict[str, int]] = {}
    for row in db.scalars(select(ApiUsage).where(ApiUsage.day >= since)):
        result.setdefault(row.day, {})[row.channel] = row.count
    return result
