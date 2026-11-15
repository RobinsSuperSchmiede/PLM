"""Analytics for the dashboard and the database explorer."""

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models import ActivityLog, EntityLink, Reminder, Tag, Task, TelegramMessageLog
from app.services import db_explorer, notifications, usage
from app.services.registry import ENTITY_MODELS

router = APIRouter()

HISTORY_DAYS = 371  # 53 weeks for the activity heatmap


def _day(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone().date().isoformat()


@router.get("/stats", tags=["insights"])
def stats(db: Session = Depends(get_db)) -> dict[str, Any]:
    today = date.today()
    since = datetime.now(timezone.utc) - timedelta(days=HISTORY_DAYS)

    counts: dict[str, int] = {}
    archived: dict[str, int] = {}
    for name, model in ENTITY_MODELS.items():
        rows = dict(db.execute(select(model.archived_at.is_(None), func.count()).group_by(model.archived_at.is_(None))).all())  # type: ignore[attr-defined]
        counts[name] = rows.get(True, 0)
        archived[name] = rows.get(False, 0)
    counts["reminder"] = db.scalar(select(func.count()).select_from(Reminder).where(Reminder.done.is_(False))) or 0
    counts["tag"] = db.scalar(select(func.count()).select_from(Tag)) or 0
    counts["link"] = db.scalar(select(func.count()).select_from(EntityLink)) or 0
    tasks_done = db.scalar(select(func.count()).select_from(Task).where(Task.status == "done", Task.archived_at.is_(None))) or 0

    activity: dict[str, Counter[str]] = defaultdict(Counter)
    by_type: Counter[str] = Counter()
    by_source: Counter[str] = Counter()
    for at, action, entity_type, source in db.execute(
        select(ActivityLog.at, ActivityLog.action, ActivityLog.entity_type, ActivityLog.source).where(ActivityLog.at >= since, ActivityLog.action != "snapshot")
    ):
        activity[_day(at)][action] += 1
        by_type[entity_type] += 1
        by_source[source] += 1

    telegram_days: dict[str, Counter[str]] = defaultdict(Counter)
    for at, direction in db.execute(select(TelegramMessageLog.at, TelegramMessageLog.direction).where(TelegramMessageLog.at >= since)):
        telegram_days[_day(at)][direction] += 1

    telegram_row = notifications.get_telegram_settings(db)
    api_days = usage.per_day(db, (today - timedelta(days=60)).isoformat())
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "counts": counts,
        "archived": archived,
        "tasks_done": tasks_done,
        "activity": {day: dict(actions) for day, actions in sorted(activity.items())},
        "activity_by_type": dict(by_type),
        "activity_by_source": dict(by_source),
        "api_calls": api_days,
        "telegram": {
            "connected": notifications.is_ready(telegram_row),
            "bot_username": telegram_row.bot_username,
            "days": {day: dict(directions) for day, directions in sorted(telegram_days.items())},
            "total_in": db.scalar(select(func.count()).select_from(TelegramMessageLog).where(TelegramMessageLog.direction == "in")) or 0,
            "total_out": db.scalar(select(func.count()).select_from(TelegramMessageLog).where(TelegramMessageLog.direction == "out")) or 0,
        },
        "database": {"engine": db.get_bind().dialect.name, "size": db_explorer.database_size(db)},
        "scheduler_enabled": get_settings().scheduler_enabled,
    }


@router.get("/db/schema", tags=["database"])
def database_schema(db: Session = Depends(get_db)) -> dict[str, Any]:
    return db_explorer.schema(db)


@router.get("/db/tables/{name}/rows", tags=["database"])
def table_rows(
    name: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sort: str | None = None,
    direction: str = Query("asc", pattern="^(asc|desc)$"),
    search: str = "",
    filter_column: str | None = None,
    filter_value: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        return db_explorer.rows(
            db, name, limit=limit, offset=offset, sort=sort, direction=direction,
            search=search, filter_column=filter_column, filter_value=filter_value,
        )
    except db_explorer.UnknownTableError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
