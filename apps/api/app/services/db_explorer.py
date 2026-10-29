"""Read-only database explorer (tables, columns, relations, rows) in the spirit of Supabase Studio."""

from datetime import timedelta
from typing import Any

from sqlalchemy import MetaData, String, Table, asc, cast, desc, func, inspect, or_, select, text
from sqlalchemy.orm import Session

from app.db.session import engine
from app.models import ActivityLog
from app.models.base import Base, utcnow
from app.services.registry import ENTITY_MODELS

# Secrets are never shown in the explorer.
SENSITIVE_COLUMNS = {
    "app_settings": {"smtp_password", "mcp_token"},
    "telegram_settings": {"bot_token", "link_code"},
}
MASK = "••••••"

TABLE_OF_TYPE = {name: model.__tablename__ for name, model in ENTITY_MODELS.items()}  # type: ignore[attr-defined]


class UnknownTableError(LookupError):
    pass


def database_size(db: Session) -> int | None:
    try:
        if engine.dialect.name == "sqlite":
            return int(db.execute(text("PRAGMA page_count")).scalar_one()) * int(db.execute(text("PRAGMA page_size")).scalar_one())
        if engine.dialect.name == "postgresql":
            return int(db.execute(text("SELECT pg_database_size(current_database())")).scalar_one())
    except Exception:  # noqa: BLE001 - size is informational only
        db.rollback()
    return None


def _table_sizes(db: Session) -> dict[str, int]:
    try:
        if engine.dialect.name == "sqlite":
            rows = db.execute(text("SELECT name, SUM(pgsize) FROM dbstat GROUP BY name")).all()
        elif engine.dialect.name == "postgresql":
            rows = db.execute(text(
                "SELECT relname, pg_total_relation_size(relid) FROM pg_catalog.pg_statio_user_tables"
            )).all()
        else:
            return {}
    except Exception:  # noqa: BLE001 - dbstat is not compiled into every SQLite build
        db.rollback()
        return {}
    return {str(name): int(size or 0) for name, size in rows}


def _reflect(name: str) -> Table:
    if name not in inspect(engine).get_table_names():
        raise UnknownTableError(f"Table {name} not found")
    return Table(name, MetaData(), autoload_with=engine)


def _foreign_keys(name: str) -> list[dict[str, Any]]:
    """Foreign keys from the database, plus those declared in the models (columns added later have none in SQLite)."""
    keys = {
        (column, fk["referred_table"], (fk["referred_columns"] or ["id"])[0])
        for fk in inspect(engine).get_foreign_keys(name)
        for column in fk["constrained_columns"]
    }
    model_table = Base.metadata.tables.get(name)
    if model_table is not None:
        for fk in model_table.foreign_keys:
            keys.add((fk.parent.name, fk.column.table.name, fk.column.name))
    return [{"column": column, "references_table": table, "references_column": ref} for column, table, ref in sorted(keys)]


def schema(db: Session) -> dict[str, Any]:
    inspector = inspect(engine)
    sizes = _table_sizes(db)
    since = utcnow() - timedelta(days=7)
    changes_by_type = dict(db.execute(
        select(ActivityLog.entity_type, func.count()).where(ActivityLog.at >= since).group_by(ActivityLog.entity_type)
    ).all())
    changes = {TABLE_OF_TYPE.get(entity_type, entity_type): count for entity_type, count in changes_by_type.items()}

    tables = []
    for name in sorted(inspector.get_table_names()):
        table = _reflect(name)
        primary = set(inspector.get_pk_constraint(name).get("constrained_columns") or [])
        unique = {column for constraint in inspector.get_unique_constraints(name) for column in constraint["column_names"]}
        unique |= {column for index in inspector.get_indexes(name) if index.get("unique") for column in index["column_names"] if column}
        indexed = {column for index in inspector.get_indexes(name) for column in index["column_names"] if column}
        foreign = _foreign_keys(name)
        foreign_by_column = {fk["column"]: fk for fk in foreign}
        columns = [
            {
                "name": column["name"],
                "type": str(column["type"]),
                "nullable": bool(column["nullable"]),
                "default": str(column["default"]) if column.get("default") is not None else None,
                "primary_key": column["name"] in primary,
                "unique": column["name"] in unique,
                "indexed": column["name"] in indexed,
                "foreign_key": foreign_by_column.get(column["name"]),
            }
            for column in inspector.get_columns(name)
        ]
        rows = db.execute(select(func.count()).select_from(table)).scalar_one()
        last_change = None
        for candidate in ("updated_at", "at", "created_at", "sent_at"):
            if candidate in table.c:
                last_change = db.execute(select(func.max(table.c[candidate]))).scalar_one()
                break
        tables.append({
            "name": name,
            "rows": rows,
            "size": sizes.get(name),
            "columns": columns,
            "foreign_keys": foreign,
            "last_change": last_change.isoformat() if hasattr(last_change, "isoformat") else last_change,
            "changes_7d": changes.get(name, 0),
        })
    return {
        "engine": engine.dialect.name,
        "size": database_size(db),
        "tables": tables,
        "total_rows": sum(table["rows"] for table in tables),
    }


def rows(
    db: Session,
    name: str,
    *,
    limit: int = 50,
    offset: int = 0,
    sort: str | None = None,
    direction: str = "asc",
    search: str = "",
    filter_column: str | None = None,
    filter_value: str | None = None,
) -> dict[str, Any]:
    table = _reflect(name)
    statement = select(table)
    if search:
        pattern = f"%{search.lower()}%"
        statement = statement.where(or_(*(func.lower(cast(column, String)).like(pattern) for column in table.columns)))
    if filter_column:
        if filter_column not in table.c:
            raise UnknownTableError(f"Column {filter_column} not found")
        column = table.c[filter_column]
        statement = statement.where(column.is_(None) if filter_value in (None, "", "null") else cast(column, String) == filter_value)
    total = db.execute(select(func.count()).select_from(statement.subquery())).scalar_one()
    if sort:
        if sort not in table.c:
            raise UnknownTableError(f"Column {sort} not found")
        statement = statement.order_by(desc(table.c[sort]) if direction == "desc" else asc(table.c[sort]))
    hidden = SENSITIVE_COLUMNS.get(name, set())
    result = db.execute(statement.limit(limit).offset(offset)).mappings().all()

    def serialize(column: str, value: Any) -> Any:
        if column in hidden and value:
            return MASK
        if value is None or isinstance(value, (bool, int, float, str)):
            return value
        return value.isoformat() if hasattr(value, "isoformat") else str(value)

    return {
        "columns": [column.name for column in table.columns],
        "rows": [{column: serialize(column, value) for column, value in row.items()} for row in result],
        "total": total,
    }
