"""Counts API and MCP requests per day. Kept in memory and written to the database periodically."""

from collections import Counter
from datetime import date
from threading import Lock

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ApiUsage

_pending: Counter[tuple[str, str]] = Counter()
_lock = Lock()


def count(channel: str) -> None:
    with _lock:
        _pending[(date.today().isoformat(), channel)] += 1


def flush(db: Session) -> None:
    with _lock:
        pending = dict(_pending)
        _pending.clear()
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
